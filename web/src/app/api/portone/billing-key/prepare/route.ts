import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOrgIdFromBrand } from "@/lib/organizationSubscription";
import { KRW_BILLABLE_PLANS, toProTier } from "@/lib/plans-brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 정기결제 가능한 KRW 플랜 — plans-brand 의 단일 source 를 그대로 사용.
// 향후 plan 추가 시 plans-brand.ts 한 곳만 갱신하면 자동 반영된다.
const ALLOWED_PLANS = new Set<string>(KRW_BILLABLE_PLANS);

/**
 * POST /api/portone/billing-key/prepare
 *
 * 빌링키 발급 의도를 서버에서 등록한다.
 * - 클라이언트는 customer_uid / merchant_uid 를 임의로 만들 수 없다 (IDOR 차단)
 * - prepare 시점에 brand 소유권 + organization 권한을 모두 검증한다
 * - 응답한 customerUid / merchantUid 는 결제창에 그대로 사용되며,
 *   issue 라우트는 같은 키로 매핑 테이블을 조회해 소유권을 한 번 더 검증한다
 *
 * 응답:
 *   { intentId, customerUid, merchantUid }
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { planKey?: string; brandId?: string; planTier?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { planKey, brandId } = body;
  if (!planKey || !brandId) {
    return NextResponse.json(
      { error: "planKey, brandId are required" },
      { status: 400 },
    );
  }
  if (!ALLOWED_PLANS.has(planKey)) {
    return NextResponse.json(
      { error: `Unsupported planKey: ${planKey}` },
      { status: 400 },
    );
  }

  const planTier = planKey === "pro" ? toProTier(body.planTier) : 1;

  // brand 소유권 검증
  const { data: brand, error: brandError } = await supabaseAdmin
    .from("brands")
    .select("id, organization_id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .maybeSingle();

  if (brandError) {
    console.error(
      "[billing-key/prepare] brand lookup error:",
      brandError.message,
    );
    return NextResponse.json({ error: "Brand lookup failed" }, { status: 500 });
  }
  if (!brand) {
    return NextResponse.json(
      { error: "Brand not found or unauthorized" },
      { status: 403 },
    );
  }

  const organizationId =
    (brand.organization_id as string | null) ??
    (await getOrgIdFromBrand(brandId));
  if (!organizationId) {
    return NextResponse.json(
      { error: "Organization not found for this brand" },
      { status: 500 },
    );
  }

  // organization 권한 검증 — owner/admin 만 결제 가능
  const { data: memberRow, error: memberError } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError) {
    console.error(
      "[billing-key/prepare] member lookup error:",
      memberError.message,
    );
    return NextResponse.json(
      { error: "Permission check failed" },
      { status: 500 },
    );
  }
  if (!memberRow || !["owner", "admin"].includes(memberRow.role as string)) {
    return NextResponse.json(
      { error: "이 Organization에 결제 권한이 없습니다." },
      { status: 403 },
    );
  }

  // customer_uid (V1 빌링키 식별자) — 예측 어려운 random 8자 + userId 8자, 총 ≤30자
  // bk_<8>_<8> = 19자
  const customerUid = `bk_${userId.slice(0, 8)}_${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)}`;

  // merchant_uid (주문번호) — UNIQUE 제약을 만족하도록 충돌이 거의 없는 값
  const merchantUid = `bk_issue_${planKey}_${Date.now()}_${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)}`;

  const { data: intent, error: insertError } = await supabaseAdmin
    .from("billing_key_issue_intents")
    .insert({
      user_id: userId,
      brand_id: brandId,
      organization_id: organizationId,
      plan_key: planKey,
      plan_tier: planTier,
      customer_uid: customerUid,
      merchant_uid: merchantUid,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !intent) {
    console.error(
      "[billing-key/prepare] intent insert error:",
      insertError?.message,
    );
    return NextResponse.json(
      { error: "결제 준비 실패. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    intentId: intent.id,
    customerUid,
    merchantUid,
  });
}
