import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2Client } from "@/lib/r2";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

const R2_BUCKET = process.env.R2_BUCKET ?? "zeriv-assets";

export async function GET(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("user_id, result")
    .eq("id", jobId)
    .single();

  if (!job || job.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = job.result as Record<string, unknown> | null;
  const resultKey = result?.result_key;
  if (typeof resultKey !== "string") {
    return NextResponse.json({ error: "No result" }, { status: 404 });
  }

  try {
    const client = getR2Client();
    const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: resultKey });
    const r2Res = await client.send(command);

    if (!r2Res.Body) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const bytes = await r2Res.Body.transformToByteArray();
    // Buffer 로 wrapping: AWS SDK 가 반환하는 Uint8Array<ArrayBufferLike> 가
    // TS 5+ / Node 22+ 환경에서 BodyInit 에 직접 할당 안 됨. Buffer 는 BodyInit 호환.
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": r2Res.ContentType ?? "image/jpeg",
        "Content-Disposition": `attachment; filename="result.jpg"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
