export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminAudit";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 관리자: 잡 강제 취소.
 *
 * POST /api/admin/jobs/[id]/cancel
 *
 * - status가 queued/processing/pending인 잡만 failed로 전환.
 *   (succeeded/failed 잡은 cancel 불가 — race로 인해 already-completed인 경우 409 반환)
 * - 동시성: status 조건을 .in() 절에 포함하여 update가 0행이면 race로 간주.
 * - 잡이 잡고 있는 크레딧 reserve의 release는 별도 청소 잡이 수행 (이 핸들러는 잡 상태만 변경).
 */

export async function POST(
  req: Request,
  context: { params: Promise<{ id?: string }> },
) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const params = await context.params;
  const fromParams = params?.id ?? "";
  const pathname = new URL(req.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  // .../api/admin/jobs/[id]/cancel — id는 끝에서 두 번째
  const fromPath = parts[parts.length - 2] ?? "";
  const jobId = (fromParams || fromPath).trim();

  if (!jobId) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const cancelMessage = `cancelled by admin ${auth.userId}`;

  // status 조건과 함께 update — 동시에 worker가 잡으려고 할 때의 race 방지
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("jobs")
    .update({
      status: "failed",
      error: cancelMessage,
      updated_at: nowIso,
    })
    .eq("id", jobId)
    .in("status", ["queued", "processing", "pending"])
    .select("id, status")
    .maybeSingle();

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message ?? "Failed to cancel job" },
      { status: 500 },
    );
  }

  if (!updated) {
    // 잡이 없거나 이미 완료/실패 상태였음 — 둘 다 unprocessable 영역.
    // 잡 존재 여부를 별도 조회하여 404 vs 409 구분.
    const { data: existing } = await supabaseAdmin
      .from("jobs")
      .select("id, status")
      .eq("id", jobId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: `Job is already ${(existing as { status: string }).status}`,
      },
      { status: 409 },
    );
  }

  await logAdminAction({
    adminUserId: auth.userId,
    action: "job_cancel",
    targetType: "job",
    targetId: jobId,
    details: { previousStatusGate: ["queued", "processing", "pending"] },
  });

  return NextResponse.json({ ok: true, jobId });
}
