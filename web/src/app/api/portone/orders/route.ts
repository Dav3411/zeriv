import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getBrandPlanConfig } from "@/lib/plans-brand";

export const runtime = "nodejs";

interface PortoneOrderRow {
  id: string;
  merchant_uid: string;
  brand_id: string | null;
  user_id: string | null;
  plan_key: string;
  amount_krw: number;
  status: string;
  paid_at: string | null;
  order_type: string;
}

/**
 * GET /api/portone/orders?brand_id=X
 * 결제 완료(paid) 주문 목록을 최신순으로 조회한다 (최대 50건).
 * brand_id 파라미터가 있으면 해당 브랜드 주문만, 없으면 유저 전체 주문.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brand_id");

  // brand_id가 있으면 해당 브랜드의 organization 멤버·오너인지 확인
  if (brandId) {
    // legacy: brand 직접 owner
    const { data: ownerCheck } = await supabaseAdmin
      .from("brands")
      .select("id, organization_id")
      .eq("id", brandId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!ownerCheck) {
      // organization 멤버 검증
      const { data: brandRow } = await supabaseAdmin
        .from("brands")
        .select("organization_id")
        .eq("id", brandId)
        .maybeSingle();
      const orgId = (brandRow?.organization_id as string | null) ?? null;
      if (!orgId)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const { data: memberCheck } = await supabaseAdmin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!memberCheck)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let query = supabaseAdmin
    .from("portone_orders")
    .select(
      "id, merchant_uid, brand_id, user_id, plan_key, amount_krw, status, paid_at, order_type",
    )
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(50);

  if (brandId) {
    query = query.eq("brand_id", brandId);
  } else {
    query = query.eq("user_id", userId);
  }

  const { data: rows, error: dbError } = await query;

  if (dbError)
    return NextResponse.json(
      { error: "Failed to load orders" },
      { status: 500 },
    );

  const orders = ((rows ?? []) as PortoneOrderRow[]).map((r) => {
    const planConfig = getBrandPlanConfig(r.plan_key);
    return {
      id: r.id,
      merchantUid: r.merchant_uid,
      planKey: r.plan_key,
      planLabel: planConfig?.label ?? r.plan_key,
      amountKrw: r.amount_krw,
      paidAt: r.paid_at ?? "",
      orderType: r.order_type,
    };
  });

  return NextResponse.json({ orders });
}
