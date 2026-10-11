/**
 * BlogPostGrid — 블로그 포스트 카드 그리드.
 * 인덱스/태그/저자 페이지에서 공통 사용.
 */

import Link from "next/link";
import type { BlogPostListItem } from "@/lib/blog";

interface Props {
  posts: BlogPostListItem[];
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

export function BlogPostGrid({ posts }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {posts.map((post) => (
        <article
          key={post.id}
          className="group rounded-2xl overflow-hidden flex flex-col transition-all hover:-translate-y-0.5"
          style={{
            background: "#ffffff",
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          {/* Cover image */}
          {post.cover_image_url ? (
            <Link
              href={`/blog/${post.slug}`}
              className="block aspect-[16/9] overflow-hidden bg-zinc-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.cover_image_url}
                alt={post.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                loading="lazy"
              />
            </Link>
          ) : (
            <Link
              href={`/blog/${post.slug}`}
              className="block aspect-[16/9] flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(236,72,153,0.06), rgba(249,115,22,0.04))",
              }}
              aria-label={post.title}
            >
              <span className="text-zinc-700 text-xs">Zeriv</span>
            </Link>
          )}

          {/* Body */}
          <div className="p-5 flex flex-col flex-1">
            {/* Tags */}
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {post.tags.slice(0, 3).map((tag) => (
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

            <h2 className="text-lg font-semibold text-zinc-900 mb-2 leading-snug">
              <Link
                href={`/blog/${post.slug}`}
                className="hover:text-pink-600 transition-colors"
              >
                {post.title}
              </Link>
            </h2>

            {post.excerpt && (
              <p className="text-sm text-zinc-600 leading-relaxed line-clamp-3 mb-4">
                {post.excerpt}
              </p>
            )}

            {/* Footer meta */}
            <div className="mt-auto flex items-center justify-between text-xs text-zinc-500 pt-3 border-t border-black/5">
              <span>{formatDate(post.published_at)}</span>
              <Link
                href={`/blog/${post.slug}`}
                className="text-pink-600 hover:text-pink-700 font-medium transition-colors"
              >
                읽기 →
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
