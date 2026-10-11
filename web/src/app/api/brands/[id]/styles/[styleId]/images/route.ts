import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2PublicUrl } from "@/lib/r2";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";

type JobRow = {
  id: string;
  result: { result_key?: string } | null;
  created_at: string;
  payload: { style_id?: string; kind?: string } | null;
};

// GET /api/brands/[id]/styles/[styleId]/images
// 특정 스타일로 생성된 이미지 목록을 반환한다.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; styleId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId, styleId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // styleId가 해당 brandId에 속하는 스타일인지 검증
  const { data: styleCheck } = await supabaseAdmin
    .from("styles")
    .select("id")
    .eq("id", styleId)
    .eq("brand_id", brandId)
    .single();

  if (!styleCheck) {
    return NextResponse.json({ error: "Style not found" }, { status: 404 });
  }

  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from("jobs")
    .select("id, result, created_at, payload")
    .eq("status", "succeeded")
    .contains("payload", { style_id: styleId })
    .order("created_at", { ascending: false })
    .limit(50);

  if (jobsError) {
    console.error("[style-images] jobs query failed:", jobsError);
    return NextResponse.json(
      { error: "Failed to fetch images" },
      { status: 500 },
    );
  }

  const images = (
    await Promise.all(
      ((jobs as JobRow[]) ?? []).map(async (job) => {
        const resultKey = job.result?.result_key;
        if (!resultKey) return null;
        return {
          id: job.id,
          url: await getR2PublicUrl(resultKey),
          kind: job.payload?.kind ?? "unknown",
          created_at: job.created_at,
        };
      }),
    )
  ).filter((img): img is NonNullable<typeof img> => img !== null);

  return NextResponse.json({ images });
}
