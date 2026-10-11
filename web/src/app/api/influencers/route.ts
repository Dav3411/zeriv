import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2PublicUrl } from "@/lib/r2";

export const runtime = "nodejs";

/** GET /api/influencers
 * query:
 *   q    — name ILIKE '%q%' (optional; if omitted returns all user's influencers)
 *   ids  — comma-separated IDs for bulk lookup (optional)
 *   limit — default 20
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const rawQ = url.searchParams.get("q")?.trim() ?? "";
  const q = rawQ.slice(0, 100); // 최대 100자
  const ids = url.searchParams.get("ids");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 50);

  let query = supabaseAdmin
    .from("models")
    .select("id, name, face_master_key, canonical_c1_key, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (ids) {
    const idList = ids
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (idList.length > 0) query = query.in("id", idList);
  } else if (q) {
    const sanitizedQ = q.replace(/[%_\\]/g, ""); // 와일드카드 제거 (lossless search)
    if (sanitizedQ) {
      query = query.ilike("name", `%${sanitizedQ}%`);
    }
  }

  const { data, error: dbErr } = await query;
  if (dbErr)
    return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // getR2PublicUrl은 R2_PUBLIC_URL과 NEXT_PUBLIC_R2_PUBLIC_URL을 모두 체크하고
  // 둘 다 미설정인 경우 7일 signed URL로 fallback한다 (개발 환경 안전성).
  const influencers = await Promise.all(
    (data ?? []).map(async (inf) => ({
      ...inf,
      face_image_url: inf.face_master_key
        ? await getR2PublicUrl(inf.face_master_key)
        : null,
      canonical_c1_url: inf.canonical_c1_key
        ? await getR2PublicUrl(inf.canonical_c1_key)
        : null,
    })),
  );

  return NextResponse.json({ influencers });
}
