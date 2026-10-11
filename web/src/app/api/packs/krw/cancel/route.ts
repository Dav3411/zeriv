/**
 * POST /api/packs/krw/cancel
 *
 * 사용자가 PortOne 결제창을 닫거나(X 버튼) 결제를 취소했을 때 클라이언트가
 * 즉시 호출. status='pending' 인 본인 소유 krw_pack_orders 를 그 자리에서
 * 'failed' 로 마킹해 BillingTab '처리 중' 누적을 차단한다.
 *
 * 왜 필요한가:
 *   기존 흐름은 cron sweep(/api/cron/portone-pending-sweep) 이 10분 grace 후
 *   PG 에 결제 존재 여부를 묻고 'failed' 마킹. 그러나
 *     (a) cron 미배포·일시 장애
 *     (b) PortOne findPaymentByMerchantUid 가 throw 만 반복 (M-1 fix 후에도
 *         PG 일시 장애 패턴이면 다음 cron 으로 위임만 반복됨)
 *   둘 다인 경우 pending 이 1시간+ 누적. 사용자 의도가 명확한 "결제창 X 닫기"
 *   는 클라이언트가 즉시 종결할 수 있어야 한다.
 *
 * 보안 invariant (반드시 보존):
 *   1) 인증 필수 — requireUserId 미통과 시 401.
 *   2) IDOR 차단 — order.user_id !== auth.userId 시 403.
 *   3) Race-safe 전이 — UPDATE ... WHERE id=? AND status='pending'.
 *      'paid'/'refunded'/'failed' 행은 절대 덮어쓰지 않음.
 *      특히 사용자가 결제 성공 직전에 X 를 누르고, 동시에 /complete 가 paid
 *      전이를 끝낸 경우 본 endpoint 는 0건 갱신이 되어 무해.
 *   4) status='failed' 만 사용 — CHECK 제약(pack_system.sql:79)이 허용하는
 *      ('pending','paid','failed','refunded') 중 사용자 취소 의미에 가장 가까운
 *      'failed' 를 선택. 새 enum 'cancelled' 도입은 마이그레이션 비용 회피 차원에서
 *      보류 — 의도는 refund_reason 에 명시 ('사용자 결제 취소 (PortOne 결제창 닫기)').
 *   5) merchant_uid 위변조 방어 — 클라이언트가 임의 merchant_uid 를 보내도
 *      소유권 검증 단계에서 본인 row 외 접근 불가.
 *
 * 멱등성:
 *   - 이미 'paid' 인 경우 200 { already_settled: true } 로 무해 반환.
 *     race 시 PG 는 paid 인데 사용자가 닫기를 누른 케이스 — 사용자 입장에선 충전 완료.
 *   - 이미 'failed'/'refunded' 인 경우 200 { already_resolved: true }.
 *   - 'pending' → 'failed' 전이는 0건이거나 1건. 1건이면 success, 0건이면 race 로
 *     누군가 먼저 처리. 두 케이스 모두 200 반환 (호출자는 추가 액션 불필요).
 */

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CancelBody = {
  merchant_uid?: unknown;
};

const CANCEL_REASON = "사용자 결제 취소 (PortOne 결제창 닫기)";

export async function POST(req: Request): Promise<NextResponse> {
  // ── 1) 인증 ────────────────────────────────────────────────────────────
  const { error: authErr, userId } = await requireUserId(req);
  if (authErr || !userId) {
    return NextResponse.json(
      { error: authErr ?? "Unauthorized" },
      { status: 401 },
    );
  }

  // ── 2) Body 파싱 ────────────────────────────────────────────────────────
  let body: CancelBody;
  try {
    body = (await req.json()) as CancelBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const merchantUid =
    typeof body.merchant_uid === "string" ? body.merchant_uid.trim() : "";
  if (!merchantUid) {
    return NextResponse.json(
      { error: "merchant_uid is required" },
      { status: 400 },
    );
  }

  // ── 3) 소유권 + 현재 status 조회 ────────────────────────────────────────
  // /complete 와 동일 패턴 — order 의 user_id 와 auth userId 가 일치하는지
  // 라우트 단에서 명시적으로 검증. RLS 는 service role 우회이므로 여기서 가드.
  const { data: orderRow, error: lookupErr } = await supabaseAdmin
    .from("krw_pack_orders")
    .select("id, user_id, status")
    .eq("merchant_uid", merchantUid)
    .maybeSingle();

  if (lookupErr) {
    console.error("[packs/cancel] order lookup error:", lookupErr.message);
    return NextResponse.json({ error: "Order lookup failed" }, { status: 500 });
  }
  if (!orderRow) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (orderRow.user_id !== userId) {
    console.warn(
      "[packs/cancel] user mismatch — possible IDOR attempt",
      {
        merchantUid,
        orderUserId: orderRow.user_id,
        requestUserId: userId,
      },
    );
    return NextResponse.json(
      { error: "Order does not belong to user" },
      { status: 403 },
    );
  }

  // ── 4) 멱등 응답 — 이미 정리된 케이스 ───────────────────────────────────
  if (orderRow.status === "paid") {
    // 사용자가 X 를 누르는 사이에 /complete 가 paid 전이를 완료한 race.
    // 사용자 입장에선 충전 완료이므로 cancel 시도는 무해. 클라이언트는 무시.
    return NextResponse.json({
      ok: true,
      already_settled: true,
      status: "paid",
    });
  }
  if (orderRow.status === "failed" || orderRow.status === "refunded") {
    return NextResponse.json({
      ok: true,
      already_resolved: true,
      status: orderRow.status,
    });
  }

  // ── 5) pending → failed atomic 전이 ─────────────────────────────────────
  // race-safe: WHERE id=? AND status='pending'. /complete 나 webhook 이 paid
  // 전이를 동시에 끝낸 경우 0건 갱신이 되어 paid 결제는 보존된다.
  const { data: updatedRows, error: updateErr } = await supabaseAdmin
    .from("krw_pack_orders")
    .update({
      status: "failed",
      refund_reason: CANCEL_REASON,
    })
    .eq("id", orderRow.id)
    .eq("status", "pending")
    .select("id, status");

  if (updateErr) {
    console.error("[packs/cancel] update error:", updateErr.message);
    return NextResponse.json({ error: "Cancel update failed" }, { status: 500 });
  }

  if (!updatedRows || updatedRows.length === 0) {
    // race: 다른 호출자(주로 /complete) 가 이미 paid 로 전이.
    // 최신 상태를 다시 조회해 사용자에게 정확한 신호 전달.
    const { data: latest } = await supabaseAdmin
      .from("krw_pack_orders")
      .select("status")
      .eq("id", orderRow.id)
      .maybeSingle();
    return NextResponse.json({
      ok: true,
      raced: true,
      status: latest?.status ?? "unknown",
    });
  }

  console.info("[packs/cancel] order cancelled by user", {
    orderId: orderRow.id,
    merchantUid,
    userId,
  });

  return NextResponse.json({
    ok: true,
    cancelled: true,
    status: "failed",
  });
}
