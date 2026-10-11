"use client";

/**
 * BlogIndexClient — 클라이언트 측 검색·태그 필터·페이지네이션.
 * 서버에서 allPosts를 props로 받아 클라이언트에서 필터링.
 */

import { useState, useMemo } from "react";
import type { BlogPostListItem } from "@/lib/blog";
import { BlogPostGrid } from "./BlogPostGrid";
import { BlogTagChip } from "./BlogTagChip";
import { SearchInput } from "./SearchInput";

interface Props {
  allPosts: BlogPostListItem[];
}

function EmptyState({ query }: { query: string }) {
  return (
    <div
      className="rounded-2xl text-center py-20"
      style={{
        background: "#ffffff",
        border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <p className="text-zinc-500 text-sm">
        {query
          ? `"${query}"에 해당하는 글이 없습니다.`
          : "게시된 글이 없습니다."}
      </p>
    </div>
  );
}

export function BlogIndexClient({ allPosts }: Props) {
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(12);

  // 모든 unique 태그 추출 (count 내림차순)
  const allTags = useMemo(() => {
    const counts: Record<string, number> = {};
    allPosts.forEach((p) =>
      p.tags.forEach((t) => {
        counts[t] = (counts[t] ?? 0) + 1;
      }),
    );
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [allPosts]);

  // 태그 + 검색어 필터링
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPosts.filter((p) => {
      const matchesTag = !selectedTag || p.tags.includes(selectedTag);
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        (p.excerpt ?? "").toLowerCase().includes(q);
      return matchesTag && matchesSearch;
    });
  }, [allPosts, search, selectedTag]);

  // 태그 or 검색어 변경 시 표시 개수 초기화
  const handleTagSelect = (tag: string | null) => {
    setSelectedTag(tag);
    setDisplayCount(12);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setDisplayCount(12);
  };

  const displayed = filtered.slice(0, displayCount);
  const hasMore = filtered.length > displayCount;

  return (
    <>
      {/* 검색창 + RSS 링크 */}
      <div className="flex items-center gap-2 mb-6">
        <SearchInput value={search} onChange={handleSearch} />
        <a
          href="/blog/rss.xml"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all hover:opacity-80"
          style={{
            background: "rgba(249,115,22,0.06)",
            borderColor: "rgba(249,115,22,0.2)",
            color: "#ea580c",
          }}
          aria-label="RSS 피드 구독"
        >
          {/* RSS icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M4 11a9 9 0 0 1 9 9" />
            <path d="M4 4a16 16 0 0 1 16 16" />
            <circle cx="5" cy="19" r="1" />
          </svg>
          RSS
        </a>
      </div>

      {/* 태그 칩 가로 스크롤 */}
      <div
        className="flex gap-2 overflow-x-auto pb-2 mb-8"
        style={{ scrollbarWidth: "none" }}
      >
        <BlogTagChip
          tag="전체"
          selected={!selectedTag}
          onClick={() => handleTagSelect(null)}
        />
        {allTags.map((tag) => (
          <BlogTagChip
            key={tag}
            tag={tag}
            selected={selectedTag === tag}
            onClick={() =>
              handleTagSelect(selectedTag === tag ? null : tag)
            }
          />
        ))}
      </div>

      {/* 글 목록 */}
      {displayed.length === 0 ? (
        <EmptyState query={search} />
      ) : (
        <BlogPostGrid posts={displayed} />
      )}

      {/* 더보기 버튼 */}
      {hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setDisplayCount((c) => c + 12)}
            className="px-6 py-2.5 rounded-full text-sm font-medium border transition-all hover:opacity-80"
            style={{
              background: "transparent",
              borderColor: "rgba(236,72,153,0.3)",
              color: "#db2777",
            }}
          >
            더보기 ({filtered.length - displayCount}개)
          </button>
        </div>
      )}
    </>
  );
}
