"use client";

// 모바일 전용 슬라이드업 시트. md+ 에서는 렌더되지 않는다(md:hidden).
// ItemDetailPanel 을 재사용해 기존 상세 패널 콘텐츠를 그대로 표시한다.
//
// 열림 트리거:
//  1. 사용자가 ItemRow 를 탭 → onClickDetail → detailItemId 설정
//  2. 생성 완료(generating→succeeded/failed) 자동 열림 (page.tsx 의 effect)
//
// 닫기:
//  1. 핸들바 아래 backdrop 탭
//  2. 닫기 버튼
//  3. Escape 키

import { useEffect } from "react";
import type { QuickItem } from "./types";
import ItemDetailPanel from "./ItemDetailPanel";

interface Props {
  item: QuickItem | null;
  onClose: () => void;
  onDownload: (item: QuickItem) => void;
  onUpdate: (id: string, patch: Partial<QuickItem>) => void;
  mode?: "workspace" | "guest";
}

function StatusLabel({ item }: { item: QuickItem }) {
  if (item.status === "generating") {
    return (
      <span
        className="text-xs flex items-center gap-1 shrink-0"
        style={{ color: "#ffa4c6" }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: "#ffa4c6" }}
        />
        생성 중
      </span>
    );
  }
  if (item.status === "succeeded") {
    return (
      <span
        className="text-xs flex items-center gap-1 shrink-0"
        style={{ color: "#4ade80" }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "#4ade80" }}
        />
        완료
      </span>
    );
  }
  if (item.status === "failed") {
    return (
      <span
        className="text-xs flex items-center gap-1 shrink-0"
        style={{ color: "#f87171" }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "#f87171" }}
        />
        실패
      </span>
    );
  }
  return null;
}

export default function MobileDetailSheet({
  item,
  onClose,
  onDownload,
  onUpdate,
  mode = "workspace",
}: Props) {
  const open = item !== null;

  // body scroll lock — 시트가 열려있는 동안 배경 스크롤 방지
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape 키로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — md+ 에서는 숨김 */}
      <div
        className={`md:hidden fixed inset-0 transition-opacity duration-200 ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "rgba(0,0,0,0.6)", zIndex: 55 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 시트 본체 — md+ 에서는 숨김 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="이미지 상세"
        className={`md:hidden fixed inset-x-0 transition-transform ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          // 시트는 바닥에 딱 붙는다. 시트가 열린 동안 BulkActionBar / Mobile Bottom Nav
          // 모두 가려지지만, 닫으면 다시 노출되므로 UX 손해 없음.
          // z-index: SiteHeader 의 Mobile Bottom Nav 가 z-50 이라 그 위로 올린다.
          bottom: "env(safe-area-inset-bottom, 0px)",
          zIndex: 56,
          maxHeight: "85dvh",
          background: "var(--surface-1)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderTop: "1px solid var(--border-subtle)",
          paddingBottom: "clamp(12px, 1.5dvh, 20px)",
          transitionDuration: "280ms",
          transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
          overflowY: "auto",
        }}
      >
        {/* 핸들바 */}
        <div className="flex justify-center pt-3 pb-2">
          <div
            className="w-10 h-1 rounded-full"
            style={{ background: "var(--border-hover, rgba(255,255,255,0.2))" }}
          />
        </div>

        {/* 헤더: 파일명 + 상태 라벨 + 닫기 버튼 */}
        <div className="flex items-center gap-2 px-4 pb-2">
          <p
            className="text-sm font-medium flex-1 truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {item?.file.name ?? ""}
          </p>
          {item && <StatusLabel item={item} />}
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/[0.05]"
            style={{ color: "var(--text-muted)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 기존 ItemDetailPanel 재사용 */}
        <ItemDetailPanel
          item={item}
          onDownload={onDownload}
          onUpdate={onUpdate}
          mode={mode}
        />
      </div>
    </>
  );
}
