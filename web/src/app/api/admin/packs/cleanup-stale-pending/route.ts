/**
 * POST /api/admin/packs/cleanup-stale-pending
 *
 * 관리자 전용 일회성 정리 도구.
 * status='pending' + created_at < now() - olderThanMinutes 인 모든 krw_pack_orders
 * 를 일괄 회수한다. portone-pending-sweep cron 이 다양한 사유(미배포·재시도 무한루프·
 * grace window 안)로 처리하지 못한 케이스를 즉시 정리할 때 사용.
 *
 * 처리 흐름 (단일 row 기준):
 *   1) findPaymentByMerchantUid 로 PG 조회.
 *      - 결과 null  → 결제 미존재. status='failed' + refund_reason='관리자 cleanup ...'
 *      - 결과 paid  → settlePackOrder({caller:'sweep'}) 위임. /complete · /webhook ·
 *        sweep cron 과 완전히 동일한 단일 SoT 경로. 멱등 / race-safe.
 *      - throw     → PG 일시 장애 가능 (M-1 fix 가 보장하는 의미론). 이번 cleanup
 *        에서는 skip 하고 다음 cron 에 위임. 절대 failed 로 영구 마킹하지 않음.
 *
 * 보안:
 *   - requireCreditsAdmin (ADMIN_USER_IDS allowlist).
 *   - userId 파라미터로 특정 사용자만 좁히는 옵션 — admin 이 본인 5건 정리 시 사용.
 *
 * 응답:
 *   { processed, settled, failed, skipped, errors[], dryRun, target[] }
 *
 * Race-safety:
 *   - failed 마킹 UPDATE 는 .eq('status','pending') + .is('pg_tid', null) 가드.
 *     실시간 /complete · /webhook · sweep 과 동시에 돌아도 paid 결제는 보존.
 *   - settlePackOrder 자체가 pending → paid atomic 전이 + UNIQUE pack 인덱스로
 *     동일 호출자 무관 멱등.
 *
 * dryRun 모드:
 *   실제 변경 없이 대상 row 목록만 반환. 운영자가 영향 범위를 미리 확인할 수 있게.
 */

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { findPaymentByMerchantUid } from "@/lib/portone";
import { settlePackOrder } from "@/lib/packSettlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CleanupBody = {
  dryRun?: unknown;
  olderThanMinutes?: unknown;
  userId?: unknown;
  limit?: unknown;
};

type StalePending = {
  id: string;
  user_id: string | null;
  merchant_uid: string;
  amount_krw: number;
  created_at: string;
  status: string;
};

type RowOutcome =
  | { id: string; merchant_uid: string; action: "would_skip"; reason: string }
  | { id: string; merchant_uid: string; action: "settled"; idempotent: boolean }
  | { id: string; merchant_uid: string; action: "failed_marked"; reason: string }
  | { id: string; merchant_uid: string; action: "skipped"; reason: string }
  | { id: string; merchant_uid: string; action: "error"; reason: string };

const DEFAULT_OLDER_THAN_MIN = 60;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;

export async function POST(req: Request): Promise<NextResponse> {
  // ── 1) admin 인증 ───────────────────────────────────────────────────────
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // ── 2) Body 파싱 ────────────────────────────────────────────────────────
  let body: CleanupBody = {};
  try {
    // 빈 body 허용 — 모든 옵션이 default 갖춤.
    const text = await req.text();
    if (text.trim()) {
      body = JSON.parse(text) as CleanupBody;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dryRun = body.dryRun === true;

  const olderThanMinutes =
    typeof body.olderThanMinutes === "number" &&
    Number.isFinite(body.olderThanMinutes) &&
    body.olderThanMinutes >= 0
      ? Math.floor(body.olderThanMinutes)
      : DEFAULT_OLDER_THAN_MIN;

  const targetUserId =
    typeof body.userId === "string" && body.userId.trim()
      ? body.userId.trim()
      : null;
  if (targetUserId !== null) {
    // UUID 형식 사전 검증 — SQL 에러 차단.
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        targetUserId,
      )
    ) {
      return NextResponse.json({ error: "invalid userId" }, { status: 400 });
    }
  }

  const limit =
    typeof body.limit === "number" &&
    Number.isFinite(body.limit) &&
    body.limit > 0
      ? Math.min(Math.floor(body.limit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  // ── 3) 대상 조회 ────────────────────────────────────────────────────────
  const cutoff = new Date(
    Date.now() - olderThanMinutes * 60 * 1000,
  ).toISOString();

  let query = supabaseAdmin
    .from("krw_pack_orders")
    .select("id, user_id, merchant_uid, amount_krw, created_at, status")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (targetUserId) {
    query = query.eq("user_id", targetUserId);
  }

  const { data: pendingRaw, error: queryErr } = await query;

  if (queryErr) {
    console.error(
      "[admin/packs/cleanup-stale-pending] query error:",
      queryErr.message,
    );
    return NextResponse.json(
      { error: "Pending lookup failed" },
      { status: 500 },
    );
  }

  const pending = (pendingRaw ?? []) as StalePending[];

  // ── 4) dryRun — 변경 없이 대상만 반환 ───────────────────────────────────
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      processed: 0,
      target: pending.map((o) => ({
        id: o.id,
        user_id: o.user_id,
        merchant_uid: o.merchant_uid,
        amount_krw: o.amount_krw,
        created_at: o.created_at,
      })),
      olderThanMinutes,
      userId: targetUserId,
      limit,
    });
  }

  // ── 5) 단일 row 처리 ────────────────────────────────────────────────────
  let settled = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  const outcomes: RowOutcome[] = [];

  for (const order of pending) {
    try {
      const outcome = await reconcileStaleOrder(order);
      outcomes.push(outcome);
      switch (outcome.action) {
        case "settled":
          settled++;
          break;
        case "failed_marked":
          failed++;
          break;
        case "skipped":
          skipped++;
          break;
        case "error":
          errors.push(`${order.id}: ${outcome.reason}`);
          break;
        // would_skip 은 dryRun 전용이라 여기에 안 옴.
        default:
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${order.id}: ${msg}`);
      outcomes.push({
        id: order.id,
        merchant_uid: order.merchant_uid,
        action: "error",
        reason: msg,
      });
      console.error(
        "[admin/packs/cleanup-stale-pending] order reconcile error",
        { orderId: order.id, merchantUid: order.merchant_uid, message: msg },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    processed: pending.length,
    settled,
    failed,
    skipped,
    errors: errors.slice(0, 50),
    outcomes,
    olderThanMinutes,
    userId: targetUserId,
    limit,
  });
}

/**
 * 단일 stale pending 정리.
 *
 * 반환값으로 outcome.action 만 보고:
 *   settled       — PG 가 paid → settlePackOrder 가 idempotent 보장하며 paid 정렬
 *   failed_marked — PG 결제 미존재 → status='failed' 로 race-safe 마킹
 *   skipped       — PG 일시 장애 (throw). 영구 마킹하지 않고 다음 cron 위임
 *   error         — settlePackOrder 가 비즈니스 실패 코드로 떨어짐. 운영 확인 필요
 */
async function reconcileStaleOrder(order: StalePending): Promise<RowOutcome> {
  // 1) PG 조회. 일시 장애는 throw → skip.
  let pgPayment;
  try {
    pgPayment = await findPaymentByMerchantUid(order.merchant_uid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id: order.id,
      merchant_uid: order.merchant_uid,
      action: "skipped",
      reason: `PG 일시 장애 가능 (다음 cron 위임): ${msg}`,
    };
  }

  // 2-A) PG paid → settlePackOrder 위임 (단일 SoT).
  if (pgPayment && pgPayment.status === "paid") {
    const result = await settlePackOrder({
      merchantUid: order.merchant_uid,
      impUid: pgPayment.imp_uid,
      caller: "sweep",
    });

    if (result.ok) {
      return {
        id: order.id,
        merchant_uid: order.merchant_uid,
        action: "settled",
        idempotent: result.idempotent,
      };
    }

    // settlePackOrder 비즈니스 실패. AMOUNT/MERCHANT MISMATCH 만 명시적으로
    // failed 격리. 그 외는 운영 확인 가능하도록 error 로 노출.
    if (
      result.code === "AMOUNT_MISMATCH" ||
      result.code === "MERCHANT_MISMATCH"
    ) {
      await supabaseAdmin
        .from("krw_pack_orders")
        .update({
          status: "failed",
          refund_reason: `관리자 cleanup: ${result.code} (위변조 의심 — 운영 확인 필요)`,
        })
        .eq("id", order.id)
        .eq("status", "pending");
      return {
        id: order.id,
        merchant_uid: order.merchant_uid,
        action: "failed_marked",
        reason: `${result.code} — 위변조 의심`,
      };
    }

    return {
      id: order.id,
      merchant_uid: order.merchant_uid,
      action: "error",
      reason: `settlePackOrder ${result.code}: ${result.error}`,
    };
  }

  // 2-B) PG 결제 없음 또는 paid 가 아님 → failed 마킹 (race-safe).
  const pgStatusLabel = pgPayment?.status ?? "not_found";
  const { data: failedRows, error: failErr } = await supabaseAdmin
    .from("krw_pack_orders")
    .update({
      status: "failed",
      refund_reason: `관리자 cleanup: PG 상태 ${pgStatusLabel}`,
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .is("pg_tid", null)
    .select("id");

  if (failErr) {
    return {
      id: order.id,
      merchant_uid: order.merchant_uid,
      action: "error",
      reason: `failed update DB error: ${failErr.message}`,
    };
  }

  if (!failedRows || failedRows.length === 0) {
    // 동시에 /complete · /webhook · sweep · cancel 중 누군가가 먼저 처리.
    return {
      id: order.id,
      merchant_uid: order.merchant_uid,
      action: "skipped",
      reason: "다른 호출자가 먼저 정렬 (race)",
    };
  }

  return {
    id: order.id,
    merchant_uid: order.merchant_uid,
    action: "failed_marked",
    reason: `PG 상태 ${pgStatusLabel}`,
  };
}
