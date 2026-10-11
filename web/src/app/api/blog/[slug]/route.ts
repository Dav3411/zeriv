/**
 * GET /api/blog/[slug] — slug 로 게시된 단건 글 조회 (퍼블릭).
 *
 * 응답:
 *   - 200: { post: BlogPost }
 *   - 404: { error: "Not found" }
 *
 * 보안: status='published' 만 조회. draft 슬러그를 추측해도 404.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePostRow, type BlogPost } from "@/lib/blog";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, content, cover_image_url, tags, status, published_at, created_at, updated_at, meta_title, meta_description, author_name",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const post = normalizePostRow(data as BlogPost & { tags: string[] | null });
  return NextResponse.json({ post });
}
