/**
 * GET /api/blog — 게시된 블로그 글 목록 (퍼블릭).
 *
 * 쿼리:
 *   - limit (default 20, max 50)
 *   - offset (default 0)
 *
 * 응답: { posts: BlogPostListItem[] }
 *
 * 인증: 없음. RLS 정책 "blog_posts_public_read" 가 status='published' 만
 * 노출하지만, 서비스 키를 쓰면 RLS 가 우회되므로 여기서도 status 필터를
 * 명시한다 (이중 방어).
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePostRow, type BlogPostListItem } from "@/lib/blog";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawLimit = Number(searchParams.get("limit") ?? `${DEFAULT_LIMIT}`);
  const rawOffset = Number(searchParams.get("offset") ?? "0");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.floor(rawOffset))
    : 0;

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, cover_image_url, tags, published_at, author_name",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const posts: BlogPostListItem[] = (data ?? []).map((row) =>
    normalizePostRow(row as BlogPostListItem & { tags: string[] | null }),
  );

  return NextResponse.json({ posts });
}
