"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** 로딩 중에는 외부 클릭/Esc 닫기 막힘 */
  loading?: boolean;
  /** ARIA labelledby — 다이얼로그 안의 제목 element id 를 전달 */
  labelledBy?: string;
  /** 패널 최대 너비. 기본값 '420px'. */
  maxWidth?: string;
  children: ReactNode;
};

/**
 * 구독 라이프사이클 다이얼로그 공용 쉘.
 * - z-50 풀스크린 오버레이 + 패널
 * - 외부 클릭 / Esc 로 닫기 (로딩 중에는 차단)
 * - 모바일/데스크톱 동일 패널 레이아웃 (flex 가운데 정렬)
 * - X 버튼 hover 색상 (JS state — Tailwind hover variant 가 inline style 과 충돌하는 것 방지)
 * - role=dialog + aria-modal=true + aria-labelledby
 */
export function PlanDialogShell({
  open,
  onClose,
  loading = false,
  labelledBy,
  maxWidth = "420px",
  children,
}: Props) {
  const [closeHover, setCloseHover] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    window.addEventListener("keydown", onKey);
    // body 스크롤 잠금
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, loading, onClose]);

  if (!open) return null;

  // X 버튼 색 — loading > hover > default
  const closeColor = loading
    ? "var(--text-secondary)"
    : closeHover
      ? "var(--text-primary)"
      : "var(--text-secondary)";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-[10vh] sm:py-[15vh]"
      style={{
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
      onClick={() => {
        if (!loading) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="w-full rounded-2xl p-8 relative"
        style={{
          maxWidth,
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute top-4 right-4 transition-colors"
          style={{
            color: closeColor,
            cursor: loading ? "not-allowed" : "pointer",
          }}
          onMouseEnter={() => {
            if (!loading) setCloseHover(true);
          }}
          onMouseLeave={() => setCloseHover(false)}
          onFocus={() => {
            if (!loading) setCloseHover(true);
          }}
          onBlur={() => setCloseHover(false)}
          onClick={() => {
            if (!loading) onClose();
          }}
          aria-label="닫기"
          disabled={loading}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M4 4L14 14M14 4L4 14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}

/** 다이얼로그 공용 정보 카드 (label/value 행 묶음) */
export function DialogInfoCard({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) {
  return (
    <div
      className="rounded-xl p-4 mt-6"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              {row.label}
            </span>
            <span
              className="text-sm text-right"
              style={{ color: "var(--text-primary)" }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 인라인 spinner — 버튼 내 로딩용 */
export function InlineSpinner({ color }: { color?: string }) {
  return (
    <span
      className="inline-block w-3.5 h-3.5 rounded-full animate-spin align-[-2px] mr-2"
      style={{
        border: "2px solid currentColor",
        borderTopColor: color ?? "transparent",
        opacity: 0.6,
      }}
      aria-hidden
    />
  );
}
