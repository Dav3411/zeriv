/**
 * /blog/rss.xml — RSS 2.0 피드.
 * published 글 최대 50건을 5분 캐시로 반환.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// 빌드 시 prerender 회피 + 새 글 발행 즉시 반영. Supabase env 가 없는
// 빌드 환경(Railway worker container 등)에서도 안전하게 통과한다.
export const dynamic = "force-dynamic";
export const revalidate = 300; // 5분 (런타임 fetch 캐시; force-dynamic 과 함께 fetch 캐시만 영향)

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type RssPostRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string | null;
  author_name: string;
};

async function fetchPostsForRss(): Promise<RssPostRow[]> {
  // sitemap.ts 와 동일 패턴 — env/DB 에러 시 빈 array 로 graceful degrade.
  // 빌드 환경에 Supabase env 가 없거나 일시 DB 장애여도 빈 RSS 가 반환된다.
  try {
    const { data, error } = await supabaseAdmin
      .from("blog_posts")
      .select("slug, title, excerpt, published_at, author_name")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return data as RssPostRow[];
  } catch (e) {
    console.error("[blog/rss] fetch failed:", e);
    return [];
  }
}

export async function GET() {
  const data = await fetchPostsForRss();

  const items = data
    .map(
      (post) => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${SITE_URL}/blog/${escapeXml(post.slug)}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${escapeXml(post.slug)}</guid>
      ${post.published_at ? `<pubDate>${new Date(post.published_at).toUTCString()}</pubDate>` : ""}
      <author>support@example.com (${escapeXml(post.author_name)})</author>
      <description><![CDATA[${post.excerpt ?? ""}]]></description>
    </item>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Zeriv 블로그</title>
    <link>${SITE_URL}/blog</link>
    <description>쿠팡 썸네일 제작 가이드, AI 이미지 편집 팁, 커머스 이미지 최적화 노하우</description>
    <language>ko</language>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
