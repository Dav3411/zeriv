export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2PublicUrl, r2KeyToPublicUrl } from "@/lib/r2";
import { isHttpUrl } from "@/lib/style/styleUrlResolver";

type JobRow = {
  id: string;
  result: { result_key?: string } | null;
  payload: { style_id?: string; kind?: string; name?: string } | null;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ styleId: string }> },
) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { styleId } = await params;

  // 어드민은 모든 스타일 접근 가능 — 소유권 대신 존재 여부만 확인
  const { data: style, error: fetchErr } = await supabaseAdmin
    .from("styles")
    .select("id, key_visual_url")
    .eq("id", styleId)
    .single();

  if (fetchErr || !style) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: jobs, error: jobsErr } = await supabaseAdmin
    .from("jobs")
    .select("id, payload, result")
    .eq("status", "succeeded")
    .contains("payload", { style_id: styleId })
    .order("created_at", { ascending: false });

  if (jobsErr) {
    return NextResponse.json({ error: jobsErr.message }, { status: 500 });
  }

  const validJobs = ((jobs as JobRow[]) ?? []).filter(
    (job) => job.result?.result_key,
  );

  const jobIds = validJobs.map((j) => j.id);
  const { data: assetRows } = await supabaseAdmin
    .from("assets")
    .select("id, job_id")
    .in("job_id", jobIds);
  const assetByJobId = Object.fromEntries(
    (assetRows ?? []).map((a: { id: string; job_id: string }) => [
      a.job_id,
      a.id,
    ]),
  );

  const renders = await Promise.all(
    validJobs.map(async (job) => ({
      jobId: job.id,
      assetId: assetByJobId[job.id] ?? null,
      resultKey: job.result!.result_key!,
      url: await getR2PublicUrl(job.result!.result_key!),
      kind: job.payload?.kind ?? "",
      name: job.payload?.name ?? "",
    })),
  );

  const rawKv =
    (style as { id: string; key_visual_url: string | null }).key_visual_url ??
    null;
  let styleKeyVisual: { key: string; url: string } | null = null;
  if (rawKv) {
    try {
      const url = isHttpUrl(rawKv) ? rawKv : r2KeyToPublicUrl(rawKv);
      styleKeyVisual = { key: rawKv, url };
    } catch {
      styleKeyVisual = null;
    }
  }

  return NextResponse.json({ renders, styleKeyVisual });
}
