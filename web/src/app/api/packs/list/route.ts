/**
 * GET /api/packs/list?organizationId=<uuid>
 *
 * 사용자가 속한 organization 의 활성 팩 목록 + 총 잔량.
 *
 * - `organizationId` 전달 시: 해당 org 의 활성 팩만. 멤버십 검증.
 * - `organizationId` 미전달 시: 사용자가 멤버인 **모든** org 의 합산. 헤더 배지용.
 *
 * 활성 정의: remaining_count > 0 AND (expires_at IS NULL OR expires_at > now())
 *
 * 보안:
 *   - 인증 + organization_members 멤버십 확인 (role 무관, 멤버면 조회 가능)
 *   - service_role 로 직접 조회 (RLS 우회) — RLS 가 service_role only 라
 *     클라이언트가 publishable key 로 직접 .from('org_generation_packs') 호출 시
 *     빈 결과만 반환됨
 *
 * Plan ref: docs/billing/credit-system-revival-plan.md (v2) 섹션 2.1.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PackRow = {
  id: string;
  initial_count: number;
  remaining_count: number;
  expires_at: string | null;
  source: 'krw_purchase' | 'admin_grant' | 'promo';
  created_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request): Promise<NextResponse> {
  // ── 1) 인증 ────────────────────────────────────────────────────────────
  const { error: authErr, userId } = await requireUserId(req);
  if (authErr || !userId) {
    return NextResponse.json({ error: authErr ?? 'Unauthorized' }, { status: 401 });
  }

  // ── 2) Query 파싱 ──────────────────────────────────────────────────────
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';

  // ── 3) 대상 organization id 결정 ───────────────────────────────────────
  let orgIds: string[];
  if (organizationId) {
    if (!UUID_RE.test(organizationId)) {
      return NextResponse.json({ error: 'invalid organizationId' }, { status: 400 });
    }
    // 명시 전달 — 멤버십 검증
    const { data: memberRow, error: memberErr } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (memberErr) {
      console.error('[packs/list] member lookup error:', memberErr.message);
      return NextResponse.json({ error: 'Permission check failed' }, { status: 500 });
    }
    if (!memberRow) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }
    orgIds = [organizationId];
  } else {
    // 미전달 — 사용자가 멤버인 모든 org 합산 (헤더 배지용)
    const { data: memberRows, error: membersErr } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId);
    if (membersErr) {
      console.error('[packs/list] member list error:', membersErr.message);
      return NextResponse.json({ error: 'Permission check failed' }, { status: 500 });
    }
    orgIds = (memberRows ?? [])
      .map((r) => r.organization_id as string)
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    // 멤버인 org 가 하나도 없으면 빈 결과로 즉시 응답
    if (orgIds.length === 0) {
      return NextResponse.json({ packs: [], totalRemaining: 0 });
    }
  }

  // ── 4) 활성 팩 조회 ─────────────────────────────────────────────────────
  // idx_packs_org_active partial index 가 (org_id, expires_at NULLS LAST, created_at)
  // 순서로 정렬돼 있어 정렬 비용 최소화.
  const nowIso = new Date().toISOString();
  const { data: packsRaw, error: packsErr } = await supabaseAdmin
    .from('org_generation_packs')
    .select('id, initial_count, remaining_count, expires_at, source, created_at')
    .in('organization_id', orgIds)
    .gt('remaining_count', 0)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('expires_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (packsErr) {
    console.error('[packs/list] query error:', packsErr.message);
    return NextResponse.json({ error: 'Failed to load packs' }, { status: 500 });
  }

  const packs = (packsRaw ?? []) as PackRow[];
  const totalRemaining = packs.reduce((sum, p) => sum + p.remaining_count, 0);

  return NextResponse.json({
    packs: packs.map((p) => ({
      id: p.id,
      initial_count: p.initial_count,
      remaining_count: p.remaining_count,
      expires_at: p.expires_at,
      source: p.source,
      created_at: p.created_at,
    })),
    totalRemaining,
  });
}
