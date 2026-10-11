import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2PublicUrl } from "@/lib/r2";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";

/** GET /api/brands/[id]/assets — 브랜드 에셋 목록 (커서 페이지네이션) */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  // Verify brand access (owner + member)
  const brand = await dbGetBrand(brandId, userId);
  if (!brand)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // Parse query parameters
  const url = new URL(req.url);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(limitParam, 1), 50);
  const before = url.searchParams.get("before"); // ISO datetime for cursor

  let query = supabaseAdmin
    .from("assets")
    .select("id, job_id, kind, r2_key, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data: rows, error: queryErr } = await query;

  if (queryErr)
    return NextResponse.json({ error: queryErr.message }, { status: 500 });

  const assets = await Promise.all(
    (rows ?? []).map(
      async ({
        r2_key,
        ...rest
      }: {
        r2_key: string;
        id: string;
        job_id: string;
        kind: string;
        created_at: string;
      }) => ({
        ...rest,
        image_url: await getR2PublicUrl(r2_key),
      }),
    ),
  );

  return NextResponse.json({ assets });
}
