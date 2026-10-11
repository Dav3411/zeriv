import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const VALID_KINDS = new Set([
  "persona",
  "render_outfit",
  "render_prompt",
  "render_product_model",
]);

export async function GET(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 50);

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const [activeResult, recentResult] = await Promise.all([
    supabaseAdmin
      .from("jobs")
      .select(
        // payload: kind/name 파싱 및 render_product_solo 필터에 사용 (응답에는 포함하지 않음)
        // result: QueuedJob 타입에 포함 — 목록 조회에서도 consumer가 사용 중이므로 유지
        "id, status, progress, error, result, payload, created_at, updated_at, requeued_at",
      )
      .eq("user_id", userId)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from("jobs")
      .select(
        // payload: kind/name 파싱 및 render_product_solo 필터에 사용 (응답에는 포함하지 않음)
        // result: QueuedJob 타입에 포함 — 목록 조회에서도 consumer가 사용 중이므로 유지
        "id, status, progress, error, result, payload, created_at, updated_at, requeued_at",
      )
      .eq("user_id", userId)
      .in("status", ["succeeded", "failed"])
      .gte("updated_at", thirtyMinAgo)
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);

  if (activeResult.error || recentResult.error) {
    console.error(
      JSON.stringify({
        action: "jobs_query_failed",
        active: activeResult.error?.message,
        recent: recentResult.error?.message,
      }),
    );
    return NextResponse.json({ error: "Failed to load jobs" }, { status: 500 });
  }

  const seen = new Set<string>();
  const jobs = [...(activeResult.data ?? []), ...(recentResult.data ?? [])]
    .filter((j) => {
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      const kind = (j.payload as Record<string, unknown> | null)?.kind;
      if (kind === "render_product_solo") return false;
      return true;
    })
    .slice(0, limit)
    .map((j) => {
      const payload = j.payload as Record<string, unknown> | null;
      const rawKind = typeof payload?.kind === "string" ? payload.kind : "";
      const kind = VALID_KINDS.has(rawKind) ? rawKind : "persona";
      const name =
        (payload?.name as string) ?? (payload?.title as string) ?? kind;
      return {
        id: j.id,
        status: j.status,
        progress: j.progress,
        error: j.error,
        result: j.result,
        kind,
        name,
        createdAt: j.created_at,
        updatedAt: j.updated_at,
        requeuedAt:
          (j as { requeued_at?: string | null }).requeued_at ?? undefined,
      };
    });

  return NextResponse.json({ jobs });
}
