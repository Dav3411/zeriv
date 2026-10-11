import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dbUpdateStyle } from "@/lib/style/style.repository";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
export const runtime = "nodejs";

type BackfillBody = {
  styleIds?: string[];
};

type JobRow = {
  result: { result_key?: string } | null;
};

// POST /api/brands/[id]/styles/auto/backfill
// example_images가 비어 있는 auto 스타일에 대해 첫 번째 성공 job의 result_key를
// r2 key 형태로 저장한다. URL 변환은 serve time에 수행한다.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  let body: BackfillBody = {};
  try {
    body = (await req.json()) as BackfillBody;
  } catch {
    // body 없이 호출해도 허용
  }

  // 대상 auto 스타일 조회 — example_images가 비어 있는 것만
  let query = supabaseAdmin
    .from("styles")
    .select("id")
    .eq("brand_id", brandId)
    .eq("type", "auto")
    .or("example_images.is.null,example_images.eq.{}");

  if (body.styleIds && body.styleIds.length > 0) {
    query = query.in("id", body.styleIds);
  }

  const { data: styles, error: stylesError } = await query;
  if (stylesError) {
    console.error("[auto-backfill] styles query failed:", stylesError);
    return NextResponse.json(
      { error: "Failed to query styles" },
      { status: 500 },
    );
  }

  if (!styles || styles.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  let updated = 0;

  for (const style of styles) {
    try {
      // 해당 스타일의 첫 번째 성공 job 조회
      const { data: job } = (await supabaseAdmin
        .from("jobs")
        .select("result")
        .eq("status", "succeeded")
        .contains("payload", { style_id: style.id })
        .order("created_at", { ascending: true })
        .limit(1)
        .single()) as { data: JobRow | null };

      const resultKey = job?.result?.result_key;
      if (!resultKey) continue;

      // Store r2 key — URL resolved at serve time
      await dbUpdateStyle(style.id, brandId, { example_images: [resultKey] });
      updated++;
    } catch (e) {
      console.error(`[auto-backfill] style ${style.id} 처리 실패, skip:`, e);
    }
  }

  return NextResponse.json({ updated });
}
