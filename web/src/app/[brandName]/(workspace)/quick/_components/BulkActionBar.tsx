"use client";

// 고정 하단 액션바 — 게스트/워크스페이스 공용.
//
// 모드별 차이:
//   - workspace: 데스크톱에서 사이드바 폭만큼 paddingLeft, 모바일에서는 SiteHeader 의
//                Mobile Bottom Nav 위로 올라가야 가려지지 않음 (bottom 에 nav 높이 추가).
//   - guest:     사이드바도 모바일 bottom nav 도 없으므로 paddingLeft 0, bottom 은
//                safe-area 만.
//
// 생성 CTA + 일괄 다운로드 + 상태 요약 텍스트. 게스트 모드에서는 생성이 일어나지 않아
// doneCount 가 영원히 0 이므로 다운로드 버튼은 자연스럽게 숨겨진다.

import { useEffect, useState } from "react";

interface Props {
  selectedCount: number;
  doneCount: number;
  isGenerating: boolean;
  onBulkGenerate: () => void;
  onBulkDownload: () => void;
  /**
   * 표시 모드. 기본값 "workspace" — 기존 호출부 호환 유지.
   * "guest" 는 사이드바·모바일 bottom nav 가 없는 게스트 셸 전용.
   */
  mode?: "workspace" | "guest";
}

function SpinnerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-spin"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  );
}

function DownloadIcon() {
  return (
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
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function BulkActionBar({
  selectedCount,
  doneCount,
  isGenerating,
  onBulkGenerate,
  onBulkDownload,
  mode = "workspace",
}: Props) {
  // A-1: Tailwind nested CSS variable arbitrary value 파싱 이슈 회피.
  // 사이드바는 lg(≥1024px) 에서만 보이므로 lg 미만에서는 paddingLeft 0.
  // window.matchMedia 로 lg 여부를 추적, inline style 로 분기한다.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const isGuest = mode === "guest";

  // bottom 계산:
  //   - 데스크톱: 항상 0 (사이드바는 좌측 패딩으로 흡수, footer 없음)
  //   - 모바일 + workspace: SiteHeader 의 Mobile Bottom Nav 외형 높이만큼 위로.
  //     nav 내부 = pt-1(4) + 아이콘 22 + gap-0.5(2) + text 12 + py-1×2(8) + pb 4 ≈ 52px
  //     + nav 가 자체 padding-bottom 으로 흡수한 env(safe-area-inset-bottom).
  //     따라서 BulkActionBar 의 bottom 도 동일하게 (52 + safe-area) 면 정확히 맞닿음.
  //   - 모바일 + guest:     GuestSiteHeader 는 모바일 bottom nav 가 없으므로 safe-area 만
  const bottom = isDesktop
    ? 0
    : isGuest
      ? "env(safe-area-inset-bottom, 0px)"
      : "calc(env(safe-area-inset-bottom, 0px) + 52px)";

  // paddingLeft 계산:
  //   - 데스크톱 + workspace: 사이드바 폭만큼 좌측 들여쓰기
  //   - 데스크톱 + guest:     사이드바 없음 → 0
  //   - 모바일:               양쪽 모드 모두 0
  const paddingLeft =
    isDesktop && !isGuest
      ? "var(--sidebar-active-w, var(--sidebar-w-collapsed))"
      : 0;

  return (
    <div
      className="fixed left-0 right-0 z-30 border-t"
      style={{
        bottom,
        background: isGuest ? "rgba(247,244,237,0.94)" : "var(--surface-1)",
        borderColor: "var(--border-subtle)",
        backdropFilter: "blur(12px)",
        paddingLeft,
        paddingBottom: isDesktop
          ? "max(env(safe-area-inset-bottom), 12px)"
          : 12,
      }}
    >
      <div className="px-3 sm:px-6 lg:px-10 pt-3 pb-0 flex items-center justify-end gap-3">
        {/* 다운로드 버튼 — 완료 항목이 있을 때만 표시.
            게스트 모드에서는 생성이 일어나지 않아 doneCount === 0 으로 자연 숨김. */}
        {doneCount > 0 && (
          <button
            type="button"
            onClick={onBulkDownload}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          >
            <DownloadIcon />
            {/* 모바일: 아이콘 + 숫자만 / 데스크톱: 전체 텍스트 */}
            <span className="hidden sm:inline">완료된 </span>
            {doneCount}개
            <span className="hidden sm:inline"> 다운로드</span>
          </button>
        )}

        {/* 생성 버튼 (CTA) + 게스트 전용 힌트.
            게스트는 "N개 생성"이 실제로 생성을 시작하지 않고 가입 페이지로 이동하므로
            인지 불일치를 줄이기 위해 버튼 바로 아래 미세 힌트를 노출한다. 버튼 레이블
            자체는 워크스페이스와 통일 유지. */}
        <div className="flex flex-col items-stretch">
          <button
            type="button"
            onClick={onBulkGenerate}
            disabled={selectedCount === 0 || isGenerating}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #ffa4c6, #ffe3be)" }}
          >
            {isGenerating ? <SpinnerIcon /> : null}
            {isGenerating ? (
              "생성 중..."
            ) : selectedCount === 0 ? (
              "일괄생성"
            ) : (
              <>
                {/* 모바일: "N개 생성" / 데스크톱: "선택된 N개 생성" */}
                <span className="hidden sm:inline">선택된 </span>
                {selectedCount}개 생성
              </>
            )}
          </button>
          {isGuest && selectedCount > 0 && !isGenerating && (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                textAlign: "center",
                marginTop: 4,
                marginBottom: 0,
                lineHeight: 1.2,
              }}
            >
              가입 후 즉시 생성됩니다
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
