/**
 * /blog/[slug] — 블로그 포스트 상세 (서버 컴포넌트).
 *
 * SEO 핵심:
 *   - generateMetadata 로 동적 title/description 제공.
 *   - Schema.org BlogPosting JSON-LD 임베드.
 *   - 마크다운 → HTML 변환은 서버에서 수행 (marked 동기 모드).
 *
 * 캐싱: revalidate 60s.
 *
 * 보안 노트:
 *   - 본문은 어드민이 작성한 신뢰 가능한 마크다운이므로 sanitize 하지 않는다.
 *   - 외부 사용자 입력으로 확장된다면 isomorphic-dompurify 등 필요.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalizePostRow,
  renderMarkdown,
  extractHeadings,
  calcReadingTime,
  type BlogPost,
  type BlogPostListItem,
} from "@/lib/blog";
import { BlogTOC } from "./BlogTOC";
import { BlogShareBar } from "@/app/blog/_components/BlogShareBar";
import { authorNameToSlug } from "@/lib/blogAuthors";

export const revalidate = 60;

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/+$/, "");

const SELECT_COLUMNS =
  "id, slug, title, excerpt, content, cover_image_url, tags, status, published_at, created_at, updated_at, meta_title, meta_description, author_name";

async function fetchPost(slug: string): Promise<BlogPost | null> {
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select(SELECT_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("[blog/[slug]] fetch failed:", error.message);
    return null;
  }
  if (!data) return null;
  return normalizePostRow(data as BlogPost & { tags: string[] | null });
}

async function fetchRelatedPosts(
  slug: string,
  tags: string[],
): Promise<BlogPostListItem[]> {
  if (tags.length === 0) return [];
  const { data } = await supabaseAdmin
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, cover_image_url, tags, published_at, author_name",
    )
    .eq("status", "published")
    .neq("slug", slug)
    .overlaps("tags", tags)
    .order("published_at", { ascending: false })
    .limit(3);
  return (data ?? []).map((row) =>
    normalizePostRow(row as BlogPostListItem & { tags: string[] | null }),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPost(slug);

  if (!post) {
    return {
      title: "글을 찾을 수 없습니다 | Zeriv 블로그",
      robots: { index: false, follow: false },
    };
  }

  const title = post.meta_title || `${post.title} | Zeriv 블로그`;
  const description =
    post.meta_description ||
    post.excerpt ||
    `${post.title} — Zeriv 블로그에서 더 많은 가이드를 확인하세요.`;
  const url = `${SITE_URL}/blog/${post.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: post.meta_title || post.title,
      description,
      type: "article",
      url,
      images: post.cover_image_url
        ? [{ url: post.cover_image_url }]
        : undefined,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      authors: [post.author_name],
      tags: post.tags,
    },
    twitter: {
      card: post.cover_image_url ? "summary_large_image" : "summary",
      title: post.meta_title || post.title,
      description,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await fetchPost(slug);
  if (!post) notFound();

  // post 확인 후 related posts 병렬 조회 (tags가 확정된 시점)
  const related = await fetchRelatedPosts(post.slug, post.tags);

  const html = renderMarkdown(post.content);
  const headings = extractHeadings(post.content);
  const readingMinutes = calcReadingTime(post.content);
  const showTOC = headings.filter((h) => h.level === 2).length >= 3;

  const blogPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt ?? post.meta_description ?? undefined,
    image: post.cover_image_url ?? undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: {
      "@type": "Organization",
      name: post.author_name,
    },
    publisher: {
      "@type": "Organization",
      name: "Zeriv",
      url: SITE_URL,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${post.slug}`,
    },
    keywords: post.tags.join(", "),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "블로그",
        item: `${SITE_URL}/blog`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: post.title,
        item: `${SITE_URL}/blog/${post.slug}`,
      },
    ],
  };

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
      {/* JSON-LD: Schema.org BlogPosting */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(blogPostingJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      {/* JSON-LD: Schema.org BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* Breadcrumb */}
      <nav className="mb-8 text-xs text-zinc-500" aria-label="Breadcrumb">
        <Link href="/blog" className="hover:text-zinc-800 transition-colors">
          블로그
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-500 truncate">{post.title}</span>
      </nav>

      {/* Header */}
      <header className="mb-10">
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/blog/tag/${encodeURIComponent(tag)}`}
                className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full text-pink-700 hover:opacity-75 transition-opacity"
                style={{
                  background: "rgba(236,72,153,0.08)",
                  border: "1px solid rgba(236,72,153,0.2)",
                }}
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-zinc-900 leading-tight tracking-tight mb-5">
          {post.title}
        </h1>

        {post.excerpt && (
          <p className="text-lg text-zinc-600 leading-relaxed mb-6">
            {post.excerpt}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <Link
            href={`/blog/author/${authorNameToSlug(post.author_name)}`}
            className="text-zinc-800 font-medium hover:text-pink-600 transition-colors"
          >
            {post.author_name}
          </Link>
          <span className="text-zinc-400">·</span>
          <time dateTime={post.published_at ?? undefined}>
            {formatDate(post.published_at)}
          </time>
        </div>
      </header>

      {/* Cover image */}
      {post.cover_image_url && (
        <div className="mb-10 -mx-4 sm:mx-0 sm:rounded-2xl overflow-hidden bg-zinc-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="w-full h-auto"
          />
        </div>
      )}

      {/* TOC — H2 3개 이상일 때만 */}
      {showTOC && (
        <BlogTOC headings={headings} readingMinutes={readingMinutes} />
      )}

      {/* Body */}
      <div className="prose-blog" dangerouslySetInnerHTML={{ __html: html }} />

      {/* 소셜 공유 — 글 본문 직후, CTA 위 */}
      <BlogShareBar
        url={`${SITE_URL}/blog/${post.slug}`}
        title={post.title}
      />

      {/* CTA 모듈 */}
      <aside
        className="mt-12 mb-12 rounded-2xl p-8 sm:p-7"
        style={{
          background:
            "linear-gradient(135deg, rgba(236,72,153,0.06), rgba(249,115,22,0.04))",
          border: "1px solid rgba(236,72,153,0.14)",
        }}
      >
        <h3 className="text-xl font-bold text-zinc-900 mb-1.5">
          쿠팡 썸네일, AI로 3분 만에
        </h3>
        <p className="text-sm text-zinc-500 mb-6">
          Zeriv로 지금 바로 만들어보세요
        </p>
        <div className="flex flex-wrap gap-3 items-center">
          <Link
            href="/signup"
            className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #ec4899, #f97316)",
            }}
          >
            무료로 시작하기 →
          </Link>
          <Link
            href="/guest/quick"
            className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold text-pink-600 transition-colors hover:bg-pink-50"
            style={{
              border: "1px solid rgba(236,72,153,0.3)",
            }}
          >
            게스트로 체험
          </Link>
          <Link
            href="/tools/coupang-thumbnail-size"
            className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
          >
            도구 보기
          </Link>
        </div>
      </aside>

      {/* Related Posts */}
      {related.length > 0 && (
        <section className="mb-12">
          <h2 className="text-base font-semibold text-zinc-700 mb-5">
            관련 글
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {related.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="group flex flex-col rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5"
                style={{
                  border: "1px solid rgba(0,0,0,0.07)",
                  background: "#fff",
                }}
              >
                {/* 썸네일 */}
                <div
                  className="w-full overflow-hidden"
                  style={{ aspectRatio: "16/9" }}
                >
                  {p.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.cover_image_url}
                      alt={p.title}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(236,72,153,0.08), rgba(249,115,22,0.05))",
                      }}
                    />
                  )}
                </div>

                {/* 카드 본문 */}
                <div className="flex flex-col flex-1 p-3.5">
                  <p
                    className="text-sm font-semibold text-zinc-800 leading-snug mb-2 group-hover:text-pink-600 transition-colors"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {p.title}
                  </p>
                  <time className="text-xs text-zinc-400 mt-auto">
                    {formatDate(p.published_at)}
                  </time>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-16 pt-8 border-t border-black/5">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-pink-600 hover:text-pink-700 transition-colors"
        >
          <span aria-hidden>←</span> 블로그 목록으로
        </Link>
      </footer>

      {/* Prose styles. 다크 테마에 맞춘 zinc 팔레트 + 핑크 액센트.
          서버 컴포넌트에서 그대로 출력하므로 styled-jsx 없이 일반 <style>. */}
      <style>{`
        .prose-blog { color: rgb(39 39 42); line-height: 1.75; }
        .prose-blog h1, .prose-blog h2, .prose-blog h3, .prose-blog h4 {
          color: rgb(24 24 27); font-weight: 700; line-height: 1.3;
        }
        .prose-blog h1 { font-size: 1.875rem; margin: 2.5rem 0 1rem; }
        .prose-blog h2 { font-size: 1.5rem;   margin: 2.25rem 0 0.875rem; }
        .prose-blog h3 { font-size: 1.25rem;  margin: 2rem 0 0.75rem; }
        .prose-blog h4 { font-size: 1.0625rem; margin: 1.75rem 0 0.5rem; }
        .prose-blog p  { color: rgb(39 39 42); margin: 0 0 1rem; }
        .prose-blog a  { color: rgb(219 39 119); text-decoration: none; }
        .prose-blog a:hover { text-decoration: underline; }
        .prose-blog strong { color: rgb(24 24 27); font-weight: 600; }
        .prose-blog em { color: rgb(63 63 70); }
        .prose-blog ul, .prose-blog ol {
          color: rgb(39 39 42); padding-left: 1.5rem; margin: 0 0 1rem;
        }
        .prose-blog ul { list-style: disc; }
        .prose-blog ol { list-style: decimal; }
        .prose-blog li { margin: 0.375rem 0; }
        .prose-blog li > p { margin: 0; }
        .prose-blog code {
          background: rgb(244 244 245); color: rgb(190 24 93);
          padding: 0.125rem 0.375rem; border-radius: 0.25rem;
          font-size: 0.875em;
        }
        .prose-blog pre {
          background: rgb(244 244 245); border: 1px solid rgb(228 228 231);
          border-radius: 0.75rem; padding: 1rem; overflow: auto;
          margin: 0 0 1.25rem; font-size: 0.875em;
        }
        .prose-blog pre code {
          background: transparent; color: rgb(39 39 42);
          padding: 0; border-radius: 0; font-size: 1em;
        }
        .prose-blog blockquote {
          border-left: 4px solid rgb(236 72 153);
          padding-left: 1rem; font-style: italic;
          color: rgb(113 113 122); margin: 1.25rem 0;
        }
        .prose-blog img {
          border-radius: 0.75rem; max-width: 100%; height: auto;
          margin: 1.5rem 0;
        }
        .prose-blog hr {
          border: 0; border-top: 1px solid rgb(228 228 231); margin: 2.5rem 0;
        }
        .prose-blog table {
          width: 100%; border-collapse: collapse; margin: 1.25rem 0;
          font-size: 0.875em;
        }
        .prose-blog th, .prose-blog td {
          border: 1px solid rgb(228 228 231); padding: 0.5rem 0.75rem;
          text-align: left;
        }
        .prose-blog th {
          background: rgb(249 250 251); color: rgb(24 24 27);
        }
      `}</style>
    </article>
  );
}
