"use client";

/**
 * BlogTOC — 블로그 글 목차 + 읽기 시간 표시.
 *
 * - H2 3개 미만이면 렌더하지 않는다 (서버에서 조건 체크 후 렌더하는 것을 권장하나
 *   클라이언트 안전망으로도 체크).
 * - details/summary 로 토글 가능. 기본 open.
 * - IntersectionObserver 로 현재 읽고 있는 섹션을 핑크로 하이라이트.
 */

import { useEffect, useState } from "react";
import type { Heading } from "@/lib/blog";

interface BlogTOCProps {
  headings: Heading[];
  readingMinutes: number;
}

export function BlogTOC({ headings, readingMinutes }: BlogTOCProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );

    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  // H2 3개 미만이면 숨김
  const h2Count = headings.filter((h) => h.level === 2).length;
  if (h2Count < 3) return null;

  return (
    <details
      className="mb-8 rounded-xl overflow-hidden group"
      open
      style={{
        background: "rgba(0,0,0,0.02)",
        border: "1px solid rgba(0,0,0,0.07)",
      }}
    >
      <summary
        className="px-4 py-3.5 flex items-center justify-between cursor-pointer select-none"
        style={{ listStyle: "none" }}
      >
        <div className="flex items-center">
          <span className="text-[13px] font-semibold text-zinc-700">목차</span>
          <span className="text-xs text-zinc-400 ml-3">
            읽기 시간 약 {readingMinutes}분
          </span>
        </div>
        {/* chevron — details[open]이면 rotate */}
        <svg
          className="w-4 h-4 text-zinc-400 transition-transform group-open:rotate-180"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </summary>

      <ul className="px-4 pb-4 flex flex-col gap-0.5">
        {headings.map((h) => {
          const isActive = activeId === h.id;
          return (
            <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
              <a
                href={`#${h.id}`}
                className={[
                  "block py-1 transition-colors",
                  h.level === 2
                    ? "text-[13px] text-zinc-600 hover:text-pink-500"
                    : "text-xs text-zinc-400 hover:text-zinc-600",
                ].join(" ")}
                style={
                  isActive
                    ? { color: "#ec4899", fontWeight: 500 }
                    : undefined
                }
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
