// [DISABLED - render-matting legacy]
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "disabled" }, { status: 410 });
}
/* eslint-disable */
/* 원본 코드:
import { NextRequest, NextResponse } from "next/server";
import { processMattingJob } from "@/lib/matting.service";

export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!secret || secret !== process.env.PIPELINE_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let render_job_id: string | undefined;
  try {
    const body = await req.json();
    render_job_id = body?.render_job_id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!render_job_id) {
    return NextResponse.json({ error: "render_job_id is required" }, { status: 400 });
  }

  const result = await processMattingJob(render_job_id);
  const status = result.status === "failed" ? 500 : 200;
  return NextResponse.json(result, { status });
}
*/
