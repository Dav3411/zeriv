"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import type { Style, StyleType } from "@/lib/style/style.types";

// ── Types ────────────────────────────────────────────────

interface StyleSelectorProps {
  brandId: string;
  selectedStyleId?: string | null;
  onStyleSelect: (
    styleId: string,
    meta: { type: StyleType; name: string; imageUrl: string | null },
  ) => void;
  /** 레거시 호환: 기존 profileId 기반 콜백 */
  selectedProfileId?: string | null;
  onProfileSelect?: (
    profileId: string,
    meta: { scope: string; conceptId?: string },
  ) => void;
}

// ── Tab type ─────────────────────────────────────────────

type ActiveTab = "discover" | "my-studios";

// ── Constants ────────────────────────────────────────────

const DISCOVER_TYPES: StyleType[] = [
  "preset",
  "brand_recommended",
  "variant",
  "auto",
];

// ── Component ────────────────────────────────────────────

export default function StyleSelector({
  brandId,
  selectedStyleId,
  onStyleSelect,
  selectedProfileId,
  onProfileSelect,
}: StyleSelectorProps) {
  const { fetchWithAuth } = useFetchWithAuth();
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("discover");
  const ref = useRef<HTMLDivElement>(null);
  const onStyleSelectRef = useRef(onStyleSelect);
  const onProfileSelectRef = useRef(onProfileSelect);
  useEffect(() => {
    onStyleSelectRef.current = onStyleSelect;
    onProfileSelectRef.current = onProfileSelect;
  });

  // 레거시 호환: 실제 선택 ID는 새 시스템 우선
  const effectiveSelectedId = selectedStyleId ?? selectedProfileId;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch styles
  const loadStyles = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/brands/${brandId}/styles`);
      if (res.ok) {
        const data = await res.json();
        setStyles((data as { styles: Style[] }).styles ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [brandId, fetchWithAuth]);

  useEffect(() => {
    loadStyles();
  }, [loadStyles]);

  // 탭별 스타일 분류
  const discoverStyles = styles.filter((s) => DISCOVER_TYPES.includes(s.type));
  const myStyles = styles.filter((s) => s.type === "custom");
  const visibleStyles = activeTab === "discover" ? discoverStyles : myStyles;

  // 스타일 로드 후 선택된 게 없으면 discoverStyles 첫 번째 자동 선택
  useEffect(() => {
    if (discoverStyles.length > 0 && !effectiveSelectedId) {
      const first = discoverStyles[0];
      onStyleSelectRef.current(first.id, {
        type: first.type,
        name: first.name,
        imageUrl: first.key_visual_url ?? first.example_images?.[0] ?? null,
      });
      onProfileSelectRef.current?.(first.id, { scope: "brand" });
    }
  }, [styles, effectiveSelectedId]);

  // Selected style
  const selected = styles.find((s) => s.id === effectiveSelectedId);
  const displayStyle = selected ?? discoverStyles[0] ?? styles[0];

  const handleSelect = (s: Style) => {
    onStyleSelect(s.id, {
      type: s.type,
      name: s.name,
      imageUrl: s.key_visual_url ?? s.example_images?.[0] ?? null,
    });
    // 레거시 호환 콜백도 호출
    onProfileSelect?.(s.id, { scope: "brand" });
    setOpen(false);
  };

  if (loading && styles.length === 0) {
    return <div className="h-9 rounded-lg bg-zinc-800/50 animate-pulse" />;
  }

  if (styles.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button — 변경 없음 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-default,rgba(255,255,255,0.1))] bg-[var(--surface-2,#16161d)] hover:border-[var(--border-hover,rgba(255,255,255,0.16))] transition-colors text-left"
      >
        {/* Preview thumbnail */}
        {(displayStyle?.key_visual_url ?? displayStyle?.example_images?.[0]) ? (
          <div className="w-6 h-6 rounded overflow-hidden shrink-0 border border-white/10">
            <img
              src={
                displayStyle.key_visual_url ??
                displayStyle.example_images?.[0] ??
                ""
              }
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center shrink-0">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-zinc-600"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
            </svg>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <span className="text-xs text-zinc-200 truncate block">
            {displayStyle ? displayStyle.name : "스타일 선택"}
          </span>
          {displayStyle && (
            <span className="text-[10px] text-zinc-500 truncate block">
              {displayStyle.mood_keywords.slice(0, 3).join(", ")}
            </span>
          )}
        </div>

        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-zinc-500 shrink-0"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 rounded-xl border border-zinc-700 bg-[#1a1a24] shadow-xl p-3 min-w-[320px] max-h-[400px] overflow-y-auto">
          {/* Tab strip */}
          <div
            className="flex gap-1 p-1 mb-3 rounded-lg"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("discover")}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "discover"
                  ? "bg-zinc-700 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Discover
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("my-studios")}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "my-studios"
                  ? "bg-zinc-700 text-white shadow"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              My Studios
            </button>
          </div>

          {/* My Studios 빈 상태 */}
          {activeTab === "my-studios" && myStyles.length === 0 ? (
            <div className="py-8 flex flex-col items-center gap-3">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{
                  background: "rgba(255,164,198,0.06)",
                  border: "1px solid rgba(255,164,198,0.12)",
                }}
              >
                {/* 스파클 아이콘 */}
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,164,198,0.5)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                </svg>
              </div>
              <div className="text-center space-y-1">
                <p className="text-xs font-medium text-zinc-300">
                  아직 만든 스타일이 없어요
                </p>
                <p className="text-[10px] text-zinc-600 leading-relaxed px-4">
                  스타일 생성 페이지에서 나만의 촬영 스타일을 만들어보세요
                </p>
              </div>
            </div>
          ) : (
            /* 이미지 그리드 */
            <div className="grid grid-cols-3 gap-2">
              {visibleStyles.map((s) => {
                const imageUrl =
                  s.key_visual_url ?? s.example_images?.[0] ?? null;
                const paletteColors = Object.values(s.color_palette ?? {});
                const isSelected = s.id === effectiveSelectedId;

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelect(s)}
                    className={`text-left transition-all ${
                      isSelected
                        ? "ring-2 ring-pink-400/60 ring-offset-1 ring-offset-[#1a1a24] rounded-lg"
                        : ""
                    }`}
                  >
                    {/* 이미지 영역 */}
                    <div className="relative aspect-square overflow-hidden rounded-lg hover:scale-[1.02] transition-transform">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={s.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        /* 컬러 팔레트 폴백 */
                        <div
                          className="w-full h-full flex items-end justify-center pb-2 gap-1"
                          style={{
                            background: `linear-gradient(135deg, ${
                              paletteColors[0] ?? "#333"
                            }, ${paletteColors[1] ?? paletteColors[0] ?? "#555"})`,
                          }}
                        >
                          {paletteColors.slice(0, 3).map((color) => (
                            <div
                              key={color}
                              className="w-2 h-2 rounded-full border border-white/20"
                              style={{ background: color }}
                            />
                          ))}
                        </div>
                      )}

                      {/* 선택 상태 오버레이 */}
                      {isSelected && (
                        <div
                          className="absolute inset-0 flex items-end justify-end p-1"
                          style={{ background: "rgba(255,164,198,0.15)" }}
                        >
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ background: "#ffa4c6" }}
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 10 10"
                              fill="none"
                            >
                              <path
                                d="M2 5l2 2 4-4"
                                stroke="#000"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 스타일 이름 */}
                    <p className="mt-1 text-[10px] text-zinc-400 truncate text-center leading-tight">
                      {s.name}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
