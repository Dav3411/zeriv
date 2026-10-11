import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  getOrganizationSubscription,
  getOrgBrandCount,
  getOrgStyleCount,
  getOrgModelCount,
  getOrgMemberCount,
  getOrgGenerationCount,
} from '@/lib/organizationSubscription';

export const runtime = 'nodejs';

/**
 * 호출자가 해당 organization의 owner 또는 member인지 확인.
 */
async function checkOrgAccess(
  orgId: string,
  userId: string,
): Promise<{ ok: true; role: string } | { ok: false }> {
  const { data } = await supabaseAdmin
    .from('organization_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return { ok: false };
  return { ok: true, role: data.role as string };
}

/**
 * GET /api/organizations/[id]
 * organization 상세 + 사용량/한도 풀 합산.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: organizationId } = await params;

  const access = await checkOrgAccess(organizationId, userId);
  if (!access.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: org, error: orgErr } = await supabaseAdmin
    .from('organizations')
    .select('id, name, owner_id, created_at')
    .eq('id', organizationId)
    .maybeSingle();

  if (orgErr || !org) {
    return NextResponse.json(
      { error: 'Organization not found' },
      { status: 404 },
    );
  }

  const [sub, brandCount, styleCount, modelCount, memberCount, monthlyGenerations] =
    await Promise.all([
      getOrganizationSubscription(organizationId),
      getOrgBrandCount(organizationId),
      getOrgStyleCount(organizationId),
      getOrgModelCount(organizationId),
      getOrgMemberCount(organizationId),
      getOrgGenerationCount(organizationId),
    ]);

  // 라이프사이클 메타 (취소 예약 / 다운그레이드 예약 / 등록 카드 마스킹)
  // ── 권한 분기: 결제수단·결제 라이프사이클 메타는 owner/admin 만 조회 가능 ──
  //   viewer/member 가 다른 사용자의 카드 마지막 4자리·청구 상태를 보지 못하도록
  //   응답 자체에서 제거한다. RLS 가 service role 전용이라 API 레벨 가드가 유일.
  const isPrivilegedRole = access.role === 'owner' || access.role === 'admin';

  type BillingKeyMeta = {
    card_last4: string | null;
    card_brand: string | null;
    status: string | null;
  };

  type SubMetaShape = {
    id?: string;
    auto_renew?: boolean;
    cancel_requested_at?: string | null;
    pending_plan?: string | null;
    pending_plan_tier?: number | null;
    pending_change_at?: string | null;
    billing_key_id?: string | null;
    portone_billing_keys?: BillingKeyMeta | BillingKeyMeta[] | null;
  };

  let subMeta: SubMetaShape | null = null;
  let bk: BillingKeyMeta | null = null;

  if (isPrivilegedRole) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select(
        'id, auto_renew, cancel_requested_at, pending_plan, pending_plan_tier, pending_change_at, billing_key_id, portone_billing_keys(card_last4, card_brand, status)',
      )
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing'])
      .maybeSingle();

    subMeta = data as SubMetaShape | null;
    bk = subMeta
      ? Array.isArray(subMeta.portone_billing_keys)
        ? ((subMeta.portone_billing_keys[0] as BillingKeyMeta | undefined) ?? null)
        : ((subMeta.portone_billing_keys as BillingKeyMeta | null) ?? null)
      : null;
  }

  return NextResponse.json({
    id: org.id,
    name: org.name,
    ownerId: org.owner_id,
    createdAt: org.created_at,
    role: access.role,
    plan: {
      planKey: sub.planKey,
      planLabel: sub.plan.label,
      planTier: sub.planTier,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
    },
    subscription: isPrivilegedRole
      ? {
          id: (subMeta?.id as string | undefined) ?? null,
          autoRenew: (subMeta?.auto_renew as boolean | undefined) ?? false,
          cancelRequestedAt:
            (subMeta?.cancel_requested_at as string | null | undefined) ?? null,
          pendingPlan:
            (subMeta?.pending_plan as string | null | undefined) ?? null,
          pendingPlanTier:
            (subMeta?.pending_plan_tier as number | null | undefined) ?? null,
          pendingChangeAt:
            (subMeta?.pending_change_at as string | null | undefined) ?? null,
          billingKey: bk
            ? {
                lastFour: bk.card_last4 ?? null,
                brand: bk.card_brand ?? null,
                status: bk.status ?? null,
              }
            : null,
        }
      : null,
    usage: {
      brandCount,
      styleCount,
      modelCount,
      memberCount,
      monthlyGenerations,
    },
    limits: {
      brandLimit: sub.plan.brandLimit ?? null,
      styleLimit: sub.plan.styleLimit ?? null,
      modelLimit: sub.plan.modelLimit ?? null,
      memberLimit: sub.plan.memberLimit ?? null,
      generationLimit: sub.generationLimit,
      dailyLimit: sub.plan.dailyLimit ?? null,
      channelExport: sub.plan.channelExport ?? null,
      priorityQueue: sub.plan.priorityQueue,
      watermark: sub.plan.watermark,
    },
  });
}

/**
 * PATCH /api/organizations/[id]
 * Body: { name: string }
 * organization 이름 변경. owner 또는 admin만 허용.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: organizationId } = await params;

  const access = await checkOrgAccess(organizationId, userId);
  if (!access.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (access.role !== 'owner' && access.role !== 'admin') {
    return NextResponse.json(
      { error: '이름 변경은 owner 또는 admin만 할 수 있습니다.' },
      { status: 403 },
    );
  }

  let body: { name?: unknown };
  try {
    body = (await req.json()) as { name?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  if (rawName.length === 0) {
    return NextResponse.json(
      { error: '이름은 1자 이상이어야 합니다.' },
      { status: 400 },
    );
  }
  if (rawName.length > 50) {
    return NextResponse.json(
      { error: '이름은 50자 이하여야 합니다.' },
      { status: 400 },
    );
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('organizations')
    .update({ name: rawName, updated_at: new Date().toISOString() })
    .eq('id', organizationId)
    .select('id, name, updated_at')
    .single();

  if (updateErr || !updated) {
    console.error('[organizations PATCH] update error:', updateErr?.message);
    return NextResponse.json(
      { error: 'Failed to update organization name' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    updatedAt: updated.updated_at,
  });
}
