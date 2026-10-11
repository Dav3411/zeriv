import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2PublicUrl } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ id?: string }> },
) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  const params = await context.params;
  const fromParams = params?.id ?? "";
  const pathname = new URL(req.url).pathname;
  const parts = pathname.split("/").filter(Boolean);
  const fromPath = parts[parts.length - 1] ?? "";
  const jobId = fromParams || fromPath;

  if (!jobId) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, user_id, status, progress, error, result, payload, created_at, updated_at",
    )
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = job.result as Record<string, unknown> | null;

  // Render job: get public URL for result_key
  let renderResultUrl: string | null = null;
  if (
    (result?.type === "render_outfit" ||
      result?.type === "render_prompt" ||
      result?.type === "render_product_solo" ||
      result?.type === "render_quick_mood" ||
      result?.type === "render_quick_model" ||
      result?.type === "render_product_model") &&
    typeof result?.result_key === "string"
  ) {
    renderResultUrl = await getR2PublicUrl(result.result_key as string);
  }

  // get public URLs for grok_key / gpt_key (comparison & parallel results)
  let renderGeminiUrl: string | null = null;
  let renderGrokUrl: string | null = null;
  let renderGptUrl: string | null = null;
  if (
    result?.type === "render_product_solo" ||
    result?.type === "render_product_model" ||
    result?.type === "render_prompt"
  ) {
    if (typeof result?.gemini_key === "string") {
      renderGeminiUrl = await getR2PublicUrl(result.gemini_key as string);
    }
    if (typeof result?.grok_key === "string") {
      renderGrokUrl = await getR2PublicUrl(result.grok_key as string);
    }
    if (typeof result?.gpt_key === "string") {
      renderGptUrl = await getR2PublicUrl(result.gpt_key as string);
    }
  }

  // Product render: get public URL for step1_key for intermediate result
  let renderStep1Url: string | null = null;
  if (
    result?.type === "render_product_model" &&
    typeof result?.step1_key === "string"
  ) {
    renderStep1Url = await getR2PublicUrl(result.step1_key as string);
  }

  return NextResponse.json({
    job: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
      result: job.result,
      payload: job.payload,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    },
    renderResultUrl,
    renderGeminiUrl,
    renderGrokUrl,
    renderGptUrl,
    renderStep1Url,
  });
}
