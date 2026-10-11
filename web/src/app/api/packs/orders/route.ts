import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/packs/orders
 *
 * 인증 사용자의 KRW 팩 주문 목록 (최근 200건 상한, 기본 50건).
 * pending / paid / failed / refunded 전부 반환.
 *
 * Query params:
 *   limit          기본 50, 최대 200
 *   offset         기본 0
 *   organizationId (선택) — 지정 시 해당 org 만 필터, 멤버십 검증 포함
 *
 * 보안:
 *   - krw_pack_orders 는 service-role only (RLS bypass 없음).
 *     user_id = userId 필터로 열람 범위를 제한한다.
 *   - organizationId 제공 시 organization_members 에서 멤버십 확인 후 필터.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organizationId")?.trim() ?? "";
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );
  const offset = Math.max(
    parseInt(searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  // organizationId UUID 형식 검증
  if (
    organizationId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      organizationId,
    )
  ) {
    return NextResponse.json(
      { error: "invalid organizationId" },
      { status: 400 },
    );
  }

  // organizationId 가 있으면 멤버십 확인
  if (organizationId) {
    const { data: member } = await supabaseAdmin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let query = supabaseAdmin
    .from("krw_pack_orders")
    .select(
      "id, created_at, paid_at, pack_size, amount_krw, status, merchant_uid, refunded_at, refund_reason, expires_at, organization_id",
      { count: "exact" },
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error: queryErr, count } = await query;
  if (queryErr) {
    console.error("[packs/orders] query error:", queryErr.message);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    orders: data ?? [],
    total: count ?? 0,
  });
}
