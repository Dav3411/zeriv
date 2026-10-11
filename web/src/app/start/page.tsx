"use client";

/**
 * `/start` — 퀵 vs 스튜디오 모드 선택 허브.
 *
 * 설계 결정:
 *   - GuestWorkspaceLayout 미사용. h-dvh + overflow:hidden 강제가 스크롤 가능한
 *     페이지에 맞지 않아 data-theme="guest-light" 래퍼를 직접 구성한다.
 *   - 배경 패턴: GuestWorkspaceLayout 과 동일한 8개 radial-gradient + 베이지 베이스.
 *   - 버튼 전체가 Link — 아이콘 + 제목만 내부에 표시.
 *   - 설명 텍스트는 버튼 바깥 아래 별도 배치.
 *   - 아이콘: SVG 인라인 (lucide-react 미설치, 신규 패키지 추가 금지).
 *   - 호버: onMouseEnter/Leave inline style 직접 조작 (CSS var 신뢰성 문제 회피).
 */

import Link from "next/link";
import { GuestSiteHeader } from "@/components/GuestSiteHeader";
import { GuestFooter } from "@/components/GuestFooter";

// GuestWorkspaceLayout 과 동일한 8개 radial-gradient 패턴.
// 향후 공유 상수로 추출 시 이곳과 GuestWorkspaceLayout 양쪽을 교체할 것.
const PAGE_BACKGROUND = [
  "radial-gradient(circle at 18% 25%, rgba(255,164,198,0.20) 0%, transparent 18%)",
  "radial-gradient(circle at 72% 12%, rgba(255,200,215,0.17) 0%, transparent 20%)",
  "radial-gradient(circle at 88% 38%, rgba(255,180,205,0.18) 0%, transparent 16%)",
  "radial-gradient(circle at 55% 60%, rgba(255,164,198,0.15) 0%, transparent 22%)",
  "radial-gradient(circle at 30% 78%, rgba(255,210,220,0.17) 0%, transparent 18%)",
  "radial-gradient(circle at 82% 85%, rgba(255,190,210,0.17) 0%, transparent 20%)",
  "radial-gradient(circle at 8% 50%, rgba(255,200,215,0.14) 0%, transparent 17%)",
  "radial-gradient(circle at 45% 35%, rgba(255,180,205,0.13) 0%, transparent 15%)",
  "#F7F4ED",
].join(", ");

// ─────────────────────────────────────────
// 기본 버튼 스타일 (공통)
// ─────────────────────────────────────────
const BASE_BTN_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  width: 340,
  height: 340,
  borderRadius: 36,
  border: "none",
  textDecoration: "none",
  cursor: "pointer",
  position: "relative",
  flexShrink: 0,
  transition: "transform 220ms ease, box-shadow 220ms ease, filter 220ms ease",
};

export default function StartPage() {
  return (
    <div
      data-theme="guest-light"
      style={{
        background: PAGE_BACKGROUND,
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <GuestSiteHeader />

      <main
        style={{
          flex: 1,
          paddingTop: 60, // fixed 헤더(60px) 높이 보상
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: 24,
          paddingRight: 24,
          paddingBottom: 48,
        }}
      >
        {/* 페이지 제목 — dashed pill */}
        <h1
          style={{
            margin: 0,
            marginBottom: 64,
            textAlign: "center",
          }}
        >
          <span
            style={{
              display: "inline-block",
              padding: "11px 28px",
              borderRadius: 999,
              border: "1.5px dashed #E07A9A",
            }}
          >
            <span
              style={{
                color: "#1A1A22",
                fontSize: 38,
                letterSpacing: "-1.2px",
                fontWeight: 700,
                lineHeight: 1.1,
              }}
            >
              어떤 방식으로 만들까요?
            </span>
          </span>
        </h1>

        {/* 버튼 쌍 컨테이너: 데스크탑 row / 모바일 column */}
        <div
          className="start-button-grid"
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: 64,
          }}
        >
          {/* ────── 퀵 버튼 + 설명 ────── */}
          <QuickButtonGroup />

          {/* ────── 스튜디오 버튼 + 설명 ────── */}
          <StudioButtonGroup />
        </div>

        {/* 선택 불안 해소 보조 텍스트 */}
        <p
          style={{
            marginTop: 32,
            marginBottom: 0,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
            letterSpacing: "0.1px",
            lineHeight: 1.4,
          }}
        >
          언제든 다른 모드로 바꿀 수 있어요.
        </p>
      </main>

      <GuestFooter />

      {/* 모바일 반응형 */}
      <style>{`
        @media (max-width: 640px) {
          .start-button-grid {
            flex-direction: column !important;
            gap: 24px !important;
          }
          .start-button {
            width: 100% !important;
            max-width: 420px !important;
            height: auto !important;
            aspect-ratio: 1 / 1 !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────
// 퀵 버튼 + 설명 묶음
// ─────────────────────────────────────────
function QuickButtonGroup() {
  const baseBoxShadow =
    "0 12px 32px -6px rgba(255, 164, 198, 0.50), 0 4px 10px rgba(255, 140, 180, 0.25)";
  const hoverBoxShadow =
    "0 24px 56px -8px rgba(255, 164, 198, 0.65), 0 6px 16px rgba(255, 140, 180, 0.30)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <Link
        href="/quick"
        className="start-button"
        style={{
          ...BASE_BTN_STYLE,
          background:
            "linear-gradient(135deg, #FFB3CC 0%, #FFCFA8 55%, #FFE3BE 100%)",
          boxShadow: baseBoxShadow,
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "translateY(-4px)";
          el.style.boxShadow = hoverBoxShadow;
          el.style.filter = "brightness(1.06)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "translateY(0)";
          el.style.boxShadow = baseBoxShadow;
          el.style.filter = "";
        }}
      >
        {/* 추천 배지 — absolute 우상단 */}
        <span
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            background: "rgba(255,255,255,0.30)",
            border: "1px solid rgba(255,255,255,0.50)",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 700,
            padding: "5px 12px",
            borderRadius: 999,
            backdropFilter: "blur(4px)",
            lineHeight: 1,
          }}
        >
          추천
        </span>

        {/* Zap SVG 아이콘 */}
        <svg
          width="76"
          height="76"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>

        {/* 제목 */}
        <span
          style={{
            color: "#ffffff",
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: "-1.2px",
            lineHeight: 1,
          }}
        >
          퀵 썸네일
        </span>
      </Link>

      {/* 버튼 바깥 설명 */}
      <p
        style={{
          margin: 0,
          color: "var(--text-secondary)",
          fontSize: 13,
          fontWeight: 400,
          lineHeight: 1.45,
          textAlign: "center",
          maxWidth: 220,
        }}
      >
        이미지만 올리면 30초만에 썸네일 완성
      </p>
    </div>
  );
}

// ─────────────────────────────────────────
// 스튜디오 버튼 + 설명 묶음
// ─────────────────────────────────────────
function StudioButtonGroup() {
  const baseBoxShadow =
    "0 12px 36px -8px rgba(10, 8, 14, 0.65), 0 0 0 1px rgba(224, 122, 154, 0.20)";
  const hoverBoxShadow =
    "0 24px 64px -10px rgba(10, 8, 14, 0.75), 0 0 0 1px rgba(224, 122, 154, 0.45), inset 0 0 0 1px rgba(224, 122, 154, 0.14)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <Link
        href="/studio"
        className="start-button"
        style={{
          ...BASE_BTN_STYLE,
          background:
            "linear-gradient(135deg, #18151C 0%, #231D2B 60%, #2E2438 100%)",
          boxShadow: baseBoxShadow,
          // 스튜디오는 호버 시 filter 미사용 — BASE_BTN_STYLE 의 transition 에서 filter 제외
          transition: "transform 220ms ease, box-shadow 220ms ease",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "translateY(-4px)";
          el.style.boxShadow = hoverBoxShadow;
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.transform = "translateY(0)";
          el.style.boxShadow = baseBoxShadow;
        }}
      >
        {/* lucide wand-sparkles. 봉 본체는 흰색, 별빛 4쌍은 핑크→피치 그라디언트.
            (게스트 스튜디오 헤딩 아이콘과 동일 패턴 — UX 연속성) */}
        <svg
          width="76"
          height="76"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id="start-wand-sparkle-gradient"
              x1="0"
              y1="0"
              x2="24"
              y2="24"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#ffa4c6" />
              <stop offset="100%" stopColor="#ffe3be" />
            </linearGradient>
          </defs>
          {/* 봉 본체 (좌하 → 우상 대각선) */}
          <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
          {/* 봉 손잡이 끝 강조선 */}
          <path d="m14 7 3 3" />
          {/* 별빛 — 핑크→피치 그라디언트.
              상단 작은 십자(M11 3, M10 2)는 길이가 절반이므로
              stroke 두께도 비례 축소(1.0). 나머지는 기본 1.75. */}
          <g stroke="url(#start-wand-sparkle-gradient)">
            <path d="M5 6v4" />
            <path d="M7 8H3" />
            <path d="M19 14v4" />
            <path d="M21 16h-4" />
            <path d="M11 3H9" strokeWidth="1" />
            <path d="M10 2v2" strokeWidth="1" />
          </g>
        </svg>

        {/* 제목 */}
        <span
          style={{
            color: "#ffffff",
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: "-1.2px",
            lineHeight: 1,
          }}
        >
          스튜디오
        </span>
      </Link>

      {/* 버튼 바깥 설명 */}
      <p
        style={{
          margin: 0,
          color: "var(--text-secondary)",
          fontSize: 13,
          fontWeight: 400,
          lineHeight: 1.45,
          textAlign: "center",
          maxWidth: 220,
        }}
      >
        원하는 분위기와 컷을 자세히 만들어요
      </p>
    </div>
  );
}
