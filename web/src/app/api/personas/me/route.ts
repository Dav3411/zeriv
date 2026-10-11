import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2PublicUrl } from "@/lib/r2";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";

/** GET /api/personas/me?brandId=xxx — 브랜드의 완성된 모델 목록 (status=done, URL 경로 유지) */
export async function GET(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId");

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  // 브랜드 접근 권한 확인 (owner 및 organization 멤버 허용)
  const access = await dbGetBrand(brandId, userId);
  if (!access) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const { data, error: dbErr } = await supabaseAdmin
    .from("models")
    .select(
      "id, name, selections, face_master_key, face_sheet_key, status, brand_id, created_at",
    )
    .eq("brand_id", brandId)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(100);

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  const models = await Promise.all(
    (data ?? []).map(async (p) => ({
      ...p,
      face_image_url: p.face_master_key
        ? await getR2PublicUrl(p.face_master_key)
        : null,
      face_sheet_url: p.face_sheet_key
        ? await getR2PublicUrl(p.face_sheet_key)
        : null,
    })),
  );

  return NextResponse.json({ models });
}
