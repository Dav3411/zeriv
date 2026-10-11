/**
 * POST /api/packs/krw/checkout
 *
 * KRW 일회성 장수 팩 결제 — PortOne 결제창 호출 직전 단계.
 *
 * 흐름:
 *   1) 인증 + org 멤버 권한 확인 (owner/admin/member 누구나 결제 가능)
 *   2) 서버 측 amount/expires_at 결정 (클라이언트 입력 신뢰 X)
 *   3) merchant_uid 결정 + krw_pack_orders pending insert
 *   4) Response: { merchant_uid, amount, expires_at } → 클라이언트가 PortOne 결제창 trigger
 *
 * 보안:
 *   - amount 는 packPricing.getPackAmountKrw 단일 SoT
 *   - merchant_uid UNIQUE + 23505 collision 시 재생성 retry (billing-renewal 패턴)
 *   - organization_members 권한 검증 — 비멤버 차단
 *
 * Plan ref: docs/billing/credit-system-revival-plan.md (v2) 섹션 2.1.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getPackAmountKrw, isValidPackSize, getPackOrderName, type PackSize } from '@/lib/packPricing';
import { getPackExpiryFromSize } from '@/lib/packExpiry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MERCHANT_UID_RETRIES = 3;

type CheckoutBody = {
  packSize?: unknown;
  organizationId?: unknown;
};

export async function POST(req: Request): Promise<NextResponse> {
  // ── 1) 인증 ────────────────────────────────────────────────────────────
  const { error: authErr, userId } = await requireUserId(req);
  if (authErr || !userId) {
    return NextResponse.json({ error: authErr ?? 'Unauthorized' }, { status: 401 });
  }

  // ── 2) Body 파싱·검증 ──────────────────────────────────────────────────
  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isValidPackSize(body.packSize)) {
    return NextResponse.json(
      { error: 'packSize must be 1, 10, 30, or 100' },
      { status: 400 },
    );
  }
  const packSize: PackSize = body.packSize;

  const organizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  }
  // UUID 형식 lightweight 검증 (SQL 에러를 막기 위한 사전 차단)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
    return NextResponse.json({ error: 'invalid organizationId' }, { status: 400 });
  }

  // ── 3) 조직 멤버 권한 확인 ───────────────────────────────────────────────
  // 멤버라면 결제 가능 (owner/admin 제한 X — 종량제는 부담이 작아 권한 완화).
  // billing-key/prepare 처럼 owner/admin 만 허용해도 되나, 종량제는 1인 셀러
  // 사용성을 우선시. Phase 2 에서 조직 정책으로 조절 가능.
  const { data: memberRow, error: memberErr } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberErr) {
    console.error('[packs/checkout] member lookup error:', memberErr.message);
    return NextResponse.json({ error: 'Permission check failed' }, { status: 500 });
  }
  if (!memberRow) {
    return NextResponse.json({ error: '이 Organization 에 결제 권한이 없습니다.' }, { status: 403 });
  }

  // ── 4) 서버 측 가격·만료 결정 ────────────────────────────────────────────
  const amountKrw = getPackAmountKrw(packSize);
  const expiresAt = getPackExpiryFromSize(packSize);
  const expiresAtIso = expiresAt.toISOString();
  const orderName = getPackOrderName(packSize);

  // ── 5) merchant_uid 생성 + insert (23505 collision retry) ───────────────
  // 결정적이지 않은 ID (timestamp + random) — 한 사용자가 같은 packSize 를
  // 연속 결제하는 일반 케이스가 잦으므로 결정적 ID 는 부적합.
  // billing-renewal 의 결정적 ID 는 cron 멱등성 목적이라 다른 시나리오.
  for (let attempt = 0; attempt < MAX_MERCHANT_UID_RETRIES; attempt++) {
    const merchantUid = buildMerchantUid(userId);
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('krw_pack_orders')
      .insert({
        user_id: userId,
        organization_id: organizationId,
        merchant_uid: merchantUid,
        amount_krw: amountKrw,
        pack_size: packSize,
        expires_at: expiresAtIso,
        status: 'pending',
      })
      .select('id, merchant_uid, amount_krw, expires_at')
      .single();

    if (!insertErr && inserted) {
      return NextResponse.json({
        merchant_uid: inserted.merchant_uid,
        amount: inserted.amount_krw,
        expires_at: inserted.expires_at,
        order_name: orderName,
        pack_size: packSize,
      });
    }

    const code = (insertErr as { code?: string } | null)?.code;
    if (code === '23505') {
      // merchant_uid 충돌 — 다음 시도. 보안상 카운터를 외부에 노출하지 않는다.
      console.warn('[packs/checkout] merchant_uid collision, retrying', { attempt });
      continue;
    }

    console.error('[packs/checkout] insert error:', insertErr?.message);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }

  return NextResponse.json(
    { error: 'Failed to allocate merchant_uid after retries' },
    { status: 500 },
  );
}

/**
 * merchant_uid 형식:
 *   krw-pack-{userIdShort}-{timestamp}-{rand}
 *
 * 길이 = "krw-pack-"(9) + 8 + "-"(1) + 13 + "-"(1) + 8 = 40자 (PortOne 80자 한도 안전).
 *
 * Note: timestamp + random 으로 카운터 노출 없음. UNIQUE index 가 collision 을
 *       방지하고, 발생 시 위 retry loop 에서 새 값으로 재시도.
 */
function buildMerchantUid(userId: string): string {
  const userShort = userId.replace(/-/g, '').slice(0, 8);
  const ts = Date.now();
  // randomUUID 의 충돌 확률은 무시할 수 있지만, 8자만 사용하므로
  // (timestamp + 8자 random) 결합으로 충돌 확률 ≈ 1/(2^32) per ms.
  const rand = (globalThis.crypto?.randomUUID?.() ?? '').replace(/-/g, '').slice(0, 8);
  return `krw-pack-${userShort}-${ts}-${rand}`;
}
