/**
 * /blog/tag/[tag] — 태그별 포스트 목록 (서버 컴포넌트).
 * params.tag는 URL encoded 문자열.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePostRow, type BlogPostListItem } from "@/lib/blog";
import { BlogPostGrid } from "@/app/blog/_components/BlogPostGrid";

export const revalidate = 60;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

/**
 * 잘못된 UTF-8 시퀀스(예: %E0%A4%A 같은 malformed URI)로 인한
 * URIError: URI malformed 를 방어. 봇·크롤러가 임의 URL 호출 시 500 방지.
 */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function fetchPostsByTag(tag: string): Promise<BlogPostListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, cover_image_url, tags, published_at, author_name",
    )
    .eq("status", "published")
    .contains("tags", [tag])
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[blog/tag] fetch failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) =>
    normalizePostRow(row as BlogPostListItem & { tags: string[] | null }),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag: encoded } = await params;
  const tag = safeDecode(encoded);

  return {
    title: `${tag} 태그 글 | Zeriv 블로그`,
    description: `${tag} 관련 Zeriv 블로그 글 모음.`,
    alternates: {
      canonical: `${SITE_URL}/blog/tag/${encoded}`,
    },
    openGraph: {
      title: `#${tag} | Zeriv 블로그`,
      description: `${tag} 관련 Zeriv 블로그 글 모음.`,
      type: "website",
    },
  };
}

export default async function BlogTagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: encoded } = await params;
  const tag = safeDecode(encoded);
  const posts = await fetchPostsByTag(tag);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
      <Link
        href="/blog"
        className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors mb-6 inline-block"
      >
        ← 전체 글 보기
      </Link>

      <header className="mb-10">
        <h1
          className="text-4xl font-bold mb-2"
          style={{
            backgroundImage: "linear-gradient(135deg, #ec4899, #f97316)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          #{tag}
        </h1>
        <p className="text-sm text-zinc-500">{posts.length}개의 글</p>
      </header>

      {posts.length === 0 ? (
        <div
          className="rounded-2xl text-center py-20"
          style={{
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <p className="text-zinc-500 text-sm">
            &apos;{tag}&apos; 태그의 게시된 글이 없습니다.
          </p>
        </div>
      ) : (
        <BlogPostGrid posts={posts} />
      )}
    </div>
  );
}
