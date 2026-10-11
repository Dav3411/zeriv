export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminAudit";
import { getBrandPlanConfig, toProTier, type PlanKey } from "@/lib/plans-brand";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 관리자: Organization 구독 플랜 부여.
 * 로그인 + ADMIN_USER_IDS allowlist 필요.
 *
 * POST body: {
 *   organizationId: string,
 *   planKey: "free"|"starter"|"label"|"pro"|"studio",
 *   periodDays?: number,
 *   planTier?: 1|2|3|4  (pro 플랜 전용, 나머지는 무시됨)
 * }
 * - periodDays: 구독 종료일을 오늘 기준 며칠 후로 할지 (기본 30, 1~365).
 *   free/studio는 period_end를 100년 후로 고정 (무기한).
 */
export async function POST(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: {
    organizationId?: string;
    planKey?: string;
    periodDays?: number;
    planTier?: number;
  };
  try {
    body = (await req.json()) as {
      organizationId?: string;
      planKey?: string;
      periodDays?: number;
      planTier?: number;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // organizationId 검증 (UUID 형식)
  const organizationId = body.organizationId?.trim() ?? "";
  if (!organizationId) {
    return NextResponse.json(
      { error: "Missing organizationId" },
      { status: 400 },
    );
  }
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(organizationId)) {
    return NextResponse.json(
      { error: "organizationId must be a valid UUID" },
      { status: 400 },
    );
  }

  // planKey 검증
  const planKey = (body.planKey ?? "").trim().toLowerCase() as PlanKey;
  const planConfig = getBrandPlanConfig(planKey);
  if (!planConfig) {
    return NextResponse.json(
      {
        error:
          "Invalid planKey. Use: free, quick_plus, starter, label, pro, studio",
      },
      { status: 400 },
    );
  }

  // planTier: pro만 사용, 나머지는 1로 강제
  const planTier = planKey === "pro" ? toProTier(body.planTier) : 1;

  // periodDays 검증
  // free/studio는 무기한 처리
  let periodEndsAt: string;
  if (planKey === "free" || planKey === "studio") {
    // 100년 후 = 사실상 무기한
    periodEndsAt = new Date(
      Date.now() + 100 * 365 * 24 * 60 * 60 * 1000,
    ).toISOString();
  } else {
    const periodDays = Math.min(
      365,
      Math.max(1, Math.floor(Number(body.periodDays) || 30)),
    );
    periodEndsAt = new Date(
      Date.now() + periodDays * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  // organizations 테이블에서 organizationId 존재 확인
  const { data: org, error: orgErr } = await supabaseAdmin
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();

  if (orgErr) {
    return NextResponse.json(
      { error: orgErr.message ?? "Failed to look up organization" },
      { status: 500 },
    );
  }
  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    );
  }

  const nowIso = new Date().toISOString();

  // organization 단위 active 구독 조회 후 update / 없으면 insert
  const { data: existingSub } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("organization_id", organizationId)
    .in("status", ["active", "trialing"])
    .maybeSingle();

  if (existingSub?.id) {
    const { error: subUpdateErr } = await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: planKey,
        plan_tier: planTier,
        status: "active",
        current_period_end: periodEndsAt,
        auto_renew: false,
        last_renewed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", existingSub.id);
    if (subUpdateErr) {
      return NextResponse.json(
        { error: subUpdateErr.message ?? "Failed to update subscription" },
        { status: 500 },
      );
    }
  } else {
    const { error: subInsertErr } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        organization_id: organizationId,
        plan: planKey,
        plan_tier: planTier,
        status: "active",
        current_period_end: periodEndsAt,
        auto_renew: false,
        last_renewed_at: nowIso,
        updated_at: nowIso,
      });
    if (subInsertErr) {
      return NextResponse.json(
        { error: subInsertErr.message ?? "Failed to create subscription" },
        { status: 500 },
      );
    }
  }

  const periodDaysActual =
    planKey === "free" || planKey === "studio"
      ? null
      : Math.min(365, Math.max(1, Math.floor(Number(body.periodDays) || 30)));

  await logAdminAction({
    adminUserId: auth.userId,
    action: "plan_change",
    targetType: "organization",
    targetId: organizationId,
    details: {
      planKey,
      planTier,
      periodDays: periodDaysActual,
      periodEndsAt,
    },
  });

  return NextResponse.json({
    ok: true,
    organizationId,
    organizationName: org.name as string | null,
    planKey,
    planTier,
    planLabel:
      planKey === "pro"
        ? `${planConfig.label} Tier ${planTier}`
        : planConfig.label,
    periodEndsAt,
    periodDays: periodDaysActual,
  });
}
