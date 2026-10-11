/**
 * /blog/author/[slug] — 저자별 포스트 목록 (서버 컴포넌트).
 * slug에서 author_name을 역산하지 않고, DB에서 slug 패턴으로 매칭하는 대신
 * AUTHOR_PROFILES에 등록된 프로필과 DB author_name을 매핑.
 *
 * 미등록 저자: slug를 name으로 사용하는 fallback 프로필 표시.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePostRow, type BlogPostListItem } from "@/lib/blog";
import {
  getAuthorProfile,
  AUTHOR_PROFILES,
} from "@/lib/blogAuthors";
import { BlogPostGrid } from "@/app/blog/_components/BlogPostGrid";

export const revalidate = 60;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

async function fetchAuthorPosts(
  authorName: string,
): Promise<BlogPostListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, cover_image_url, tags, published_at, author_name",
    )
    .eq("status", "published")
    .eq("author_name", authorName)
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[blog/author] fetch failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) =>
    normalizePostRow(row as BlogPostListItem & { tags: string[] | null }),
  );
}

/** slug → DB author_name 역매핑. 등록된 프로필이 있으면 그 name 사용. */
function resolveAuthorName(slug: string): string {
  const profile = AUTHOR_PROFILES[slug];
  if (profile) return profile.name;
  // 미등록: slug를 그대로 name으로 사용 (공백 복원 불가 — fallback)
  return slug;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = getAuthorProfile(slug);

  return {
    title: `${profile.name} | Zeriv 블로그`,
    description: profile.bio || `${profile.name}이 작성한 Zeriv 블로그 글 모음.`,
    alternates: {
      canonical: `${SITE_URL}/blog/author/${slug}`,
    },
    openGraph: {
      title: `${profile.name} | Zeriv 블로그`,
      description: profile.bio || `${profile.name}이 작성한 Zeriv 블로그 글 모음.`,
      type: "profile",
    },
  };
}

export default async function BlogAuthorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = getAuthorProfile(slug);
  const authorName = resolveAuthorName(slug);
  const posts = await fetchAuthorPosts(authorName);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
      <Link
        href="/blog"
        className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors mb-6 inline-block"
      >
        ← 전체 글 보기
      </Link>

      {/* 저자 프로필 카드 */}
      <header className="mb-12">
        <div className="flex items-center gap-5 mb-6">
          {/* 아바타 */}
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              className="w-16 h-16 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
              style={{
                background: "linear-gradient(135deg, #ec4899, #f97316)",
              }}
              aria-hidden
            >
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{profile.name}</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{profile.title}</p>
          </div>
        </div>

        {profile.bio && (
          <p className="text-sm text-zinc-600 leading-relaxed max-w-2xl">
            {profile.bio}
          </p>
        )}

        <p className="text-sm text-zinc-400 mt-4">{posts.length}개의 글</p>
      </header>

      {posts.length === 0 ? (
        <div
          className="rounded-2xl text-center py-20"
          style={{
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <p className="text-zinc-500 text-sm">게시된 글이 없습니다.</p>
        </div>
      ) : (
        <BlogPostGrid posts={posts} />
      )}
    </div>
  );
}
