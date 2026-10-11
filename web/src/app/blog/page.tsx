/**
 * /blog — 블로그 인덱스 (서버 컴포넌트).
 *
 * 서버: published posts fetch + SSR 메타데이터
 * 클라이언트: BlogIndexClient — 검색·태그 필터·페이지네이션
 *
 * 캐싱: revalidate 60s (ISR).
 */

import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePostRow, type BlogPostListItem } from "@/lib/blog";
import { BlogIndexClient } from "./_components/BlogIndexClient";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "블로그 | Zeriv — AI 제품 이미지 스튜디오",
  description:
    "쿠팡 썸네일 제작 가이드, AI 이미지 편집 팁, 커머스 이미지 최적화 노하우를 알아보세요.",
  openGraph: {
    title: "Zeriv 블로그",
    description: "쿠팡 썸네일 제작 가이드, AI 이미지 편집 팁",
    type: "website",
  },
};

async function fetchPublishedPosts(): Promise<BlogPostListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, cover_image_url, tags, published_at, author_name",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[blog/index] fetch failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) =>
    normalizePostRow(row as BlogPostListItem & { tags: string[] | null }),
  );
}

export default async function BlogIndexPage() {
  const posts = await fetchPublishedPosts();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
      {/* Header */}
      <header className="mb-10">
        <h1
          className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight"
          style={{
            backgroundImage: "linear-gradient(135deg, #ec4899, #f97316)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Zeriv 블로그
        </h1>
        <p className="text-zinc-500 text-base sm:text-lg max-w-2xl">
          쿠팡 썸네일 제작 가이드, AI 이미지 편집 팁, 커머스 이미지 최적화
          노하우를 정리합니다.
        </p>
      </header>

      {/* 검색·필터·그리드 — 클라이언트 컴포넌트 */}
      <BlogIndexClient allPosts={posts} />
    </div>
  );
}
