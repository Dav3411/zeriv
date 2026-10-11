import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/portone/subscription/cancel
 *
 * KRW (PortOne) 구독을 "기간 만료 시" 종료하도록 마킹한다 (Stripe 표준).
 * - revoke=false (기본): auto_renew=false, cancel_requested_at=now() 마킹.
 *   billing_key 는 active 유지 (사용자가 마음을 바꿀 가능성을 위해).
 * - revoke=true: auto_renew=true 복원 + cancel_requested_at=NULL.
 *   단 billing_key 가 active 이고 current_period_end 가 미래일 때만 허용.
 *
 * 권한: organization owner 또는 admin.
 */

type CancelBody = {
  organizationId?: string;
  revoke?: boolean;
};

type SubscriptionMetaRow = {
  id: string;
  status: string;
  auto_renew: boolean;
  cancel_requested_at: string | null;
  current_period_end: string | null;
  billing_key_id: string | null;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CancelBody;
  try {
    body = (await req.json()) as CancelBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const revoke = body.revoke === true;

  if (!organizationId || typeof organizationId !== "string") {
    return NextResponse.json(
      { error: "organizationId 가 필요합니다." },
      { status: 400 },
    );
  }

  // ── 권한: owner / admin ────────────────────────────────────────────────
  const { data: memberRow, error: memberError } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError) {
    console.error(
      "[subscription/cancel] member lookup error:",
      memberError.message,
    );
    return NextResponse.json(
      { error: "권한 확인에 실패했습니다." },
      { status: 500 },
    );
  }
  if (!memberRow || !["owner", "admin"].includes(memberRow.role as string)) {
    return NextResponse.json(
      { error: "구독 변경 권한이 없습니다." },
      { status: 403 },
    );
  }

  // ── active 구독 + 빌링키 상태 조회 ───────────────────────────────────
  const { data: subRow, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "id, status, auto_renew, cancel_requested_at, current_period_end, billing_key_id",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (subError) {
    console.error(
      "[subscription/cancel] subscription lookup error:",
      subError.message,
    );
    return NextResponse.json(
      { error: "구독 조회에 실패했습니다." },
      { status: 500 },
    );
  }
  if (!subRow) {
    return NextResponse.json(
      { error: "활성 구독이 없습니다." },
      { status: 404 },
    );
  }

  const sub = subRow as SubscriptionMetaRow;
  const nowIso = new Date().toISOString();
  const periodEnd = sub.current_period_end;

  if (revoke) {
    // ── 철회 분기 ────────────────────────────────────────────────────────
    if (sub.auto_renew && !sub.cancel_requested_at) {
      return NextResponse.json(
        { error: "취소 예약된 구독이 아닙니다." },
        { status: 409 },
      );
    }
    if (!periodEnd || new Date(periodEnd) <= new Date()) {
      return NextResponse.json(
        { error: "이미 만료된 구독은 철회할 수 없습니다." },
        { status: 400 },
      );
    }

    // 빌링키 active 여부 확인 — expired 면 철회 후에도 갱신 불가능
    if (sub.billing_key_id) {
      const { data: bk } = await supabaseAdmin
        .from("portone_billing_keys")
        .select("status")
        .eq("id", sub.billing_key_id)
        .maybeSingle();
      if (!bk || bk.status !== "active") {
        return NextResponse.json(
          { error: "결제수단이 만료되어 철회할 수 없습니다." },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "결제수단이 등록되어 있지 않아 철회할 수 없습니다." },
        { status: 400 },
      );
    }

    // 조건부 update — 동시 호출 race 방지
    const { data: updated, error: revokeErr } = await supabaseAdmin
      .from("subscriptions")
      .update({
        auto_renew: true,
        cancel_requested_at: null,
        updated_at: nowIso,
      })
      .eq("id", sub.id)
      .eq("status", "active")
      .select("id, current_period_end")
      .single();

    if (revokeErr || !updated) {
      console.error(
        "[subscription/cancel] revoke update error:",
        revokeErr?.message,
      );
      return NextResponse.json(
        { error: "철회 처리에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      cancelled: false,
      effectiveAt: updated.current_period_end,
    });
  }

  // ── 취소 예약 분기 ─────────────────────────────────────────────────────
  if (!sub.auto_renew && sub.cancel_requested_at) {
    return NextResponse.json(
      { error: "이미 해지 예약된 구독입니다." },
      { status: 409 },
    );
  }

  // 다운그레이드 예약과 충돌? — 정책상 해지가 우선이므로 pending_* 도 함께 클리어
  const { data: updated, error: cancelErr } = await supabaseAdmin
    .from("subscriptions")
    .update({
      auto_renew: false,
      cancel_requested_at: nowIso,
      pending_plan: null,
      pending_plan_tier: null,
      pending_change_at: null,
      updated_at: nowIso,
    })
    .eq("id", sub.id)
    .eq("status", "active")
    .select("id, current_period_end")
    .single();

  if (cancelErr || !updated) {
    console.error(
      "[subscription/cancel] cancel update error:",
      cancelErr?.message,
    );
    return NextResponse.json(
      { error: "해지 처리에 실패했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cancelled: true,
    effectiveAt: updated.current_period_end,
  });
}
