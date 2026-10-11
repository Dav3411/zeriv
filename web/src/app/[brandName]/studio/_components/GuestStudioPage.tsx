"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * GuestStudioPage — `/guest/studio` 진입 시 렌더되는 비로그인 미리보기.
 *
 * 본 파일은 원래 `/app/studio/page.tsx` (StudioPublicEntry) 의 `Guest Preview` 렌더 영역을
 * 그대로 이전한 것이다. 차이점:
 *   - useAuth/router 분기 로직(로그인 사용자는 본인 brand 로 redirect) 은 상위
 *     `[brandName]/layout.tsx` 의 GuestWorkspaceLayoutWrapper 가 담당.
 *   - SiteHeader 는 GuestWorkspaceLayout 이 이미 부여하므로 본 컴포넌트는 페이지 본문만 렌더.
 *   - 모든 인증 필요 인터랙션은 `gateToSignup()` → `/signup?next=/guest/studio`.
 *
 * sessionStorage 스키마(`studio_guest_state_v1`)는 변경 없이 동일하게 유지.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ── 워크스페이스 STUDIO_BENTO 미러 ─────────────────────────────────────────
const STUDIO_BENTO: {
  src: string;
  col: string;
  row: string;
  objectPosition: string;
  fallback: string;
}[] = [
  {
    src: "/studio-showcase/showcase_01.png",
    col: "1",
    row: "1",
    objectPosition: "center",
    fallback: "#1e1a2e",
  },
  {
    src: "/studio-showcase/showcase_02.png",
    col: "2",
    row: "1 / span 2",
    objectPosition: "center",
    fallback: "#1a1e1a",
  },
  {
    src: "/studio-showcase/showcase_03.png",
    col: "3",
    row: "1 / span 2",
    objectPosition: "center top",
    fallback: "#1e1a18",
  },
  {
    src: "/studio-showcase/showcase_04.png",
    col: "1",
    row: "2",
    objectPosition: "center",
    fallback: "#1a1a1e",
  },
  {
    src: "/studio-showcase/showcase_05.png",
    col: "2",
    row: "3 / span 2",
    objectPosition: "center top",
    fallback: "#1e1a18",
  },
  {
    src: "/studio-showcase/showcase_06.png",
    col: "3",
    row: "3",
    objectPosition: "center",
    fallback: "#12141e",
  },
  {
    src: "/studio-showcase/showcase_07.png",
    col: "1",
    row: "3 / span 2",
    objectPosition: "center top",
    fallback: "#1a1e1a",
  },
  {
    src: "/studio-showcase/showcase_08.png",
    col: "3",
    row: "4",
    objectPosition: "center",
    fallback: "#1c1414",
  },
];

const ASPECT_RATIOS = [
  { value: "9:16", label: "9:16", rect: { x: 6, y: 3, width: 8, height: 14 } },
  { value: "3:4", label: "3:4", rect: { x: 5.5, y: 4, width: 9, height: 12 } },
  { value: "1:1", label: "1:1", rect: { x: 4, y: 4, width: 12, height: 12 } },
  { value: "4:3", label: "4:3", rect: { x: 4, y: 5.5, width: 12, height: 9 } },
  { value: "16:9", label: "16:9", rect: { x: 3, y: 6, width: 14, height: 8 } },
] as const;

type AspectRatio = (typeof ASPECT_RATIOS)[number]["value"];

const BATCH_COUNTS = [1, 2, 4, 8, 16, 32] as const;
type BatchCount = (typeof BATCH_COUNTS)[number];

// ── sessionStorage 스키마 ────────────────────────────────────────────────────
const STUDIO_GUEST_KEY = "studio_guest_state_v1";
const STUDIO_GUEST_MAX_BYTES = 4 * 1024;

type StudioGuestState = {
  prompt: string;
  aspectRatio: AspectRatio;
  batchCount: BatchCount;
  ts: number;
};

function saveStudioGuestState(state: StudioGuestState): boolean {
  try {
    const serialized = JSON.stringify(state);
    if (serialized.length > STUDIO_GUEST_MAX_BYTES) return false;
    sessionStorage.setItem(STUDIO_GUEST_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

// ── ShowcaseImage — 로드 실패 시 fallback 색상 블록 ─────────────────────────
function ShowcaseImage({
  src,
  objectPosition,
  fallback,
}: {
  src: string;
  objectPosition: string;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="w-full h-full" style={{ background: fallback }} />
  ) : (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.03]"
      style={{ objectPosition }}
      onError={() => setFailed(true)}
    />
  );
}

export function GuestStudioPage() {
  const router = useRouter();

  // ── Guest UI 시각 상태 (auth 없이 동작하는 토글) ─────────────────────────
  const [promptText, setPromptText] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [batchCount, setBatchCount] = useState<BatchCount>(4);

  const [aspectDropdownOpen, setAspectDropdownOpen] = useState(false);
  const [batchDropdownOpen, setBatchDropdownOpen] = useState(false);

  // ── 모든 인증 필요 인터랙션 → /signup?next=/guest/studio ─────────────────
  const gateToSignup = useCallback(() => {
    saveStudioGuestState({
      prompt: promptText.trim(),
      aspectRatio,
      batchCount,
      ts: Date.now(),
    });
    // hard-coded path — open-redirect 차단. /guest/studio 는 layout 의 redirect 로
    // 로그인 사용자는 자기 brand /studio 로 이동.
    router.push("/signup?next=%2Fguest%2Fstudio");
  }, [promptText, aspectRatio, batchCount, router]);

  return (
    <div
      className="relative flex flex-col flex-1 min-h-0"
      style={{ background: "transparent" }}
    >
      {/* EMPTY STATE 영역 */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-52">
        <div className="flex flex-col items-center justify-start py-8 gap-8">
          <div className="w-full flex flex-col lg:flex-row items-stretch gap-3 max-w-[1200px] mx-auto px-4 md:px-8">
            {/* ── 좌 텍스트 패널 ─────────────────────────────────── */}
            <div className="flex flex-col gap-3 w-full lg:w-[38%] lg:flex-shrink-0 items-stretch text-center lg:text-left">
              <h2 style={{ margin: 0 }}>
                <span
                  style={{
                    // 게스트 퀵 페이지 헤더와 동일한 dashed pill 디자인 패턴.
                    // 보더용 박스(바깥 span) + 텍스트(안쪽 span) 분리.
                    // 벤토 정렬을 위해 폭 100% + 텍스트 가운데 정렬.
                    display: "block",
                    width: "100%",
                    padding: "clamp(12px, 3vw, 16px) clamp(20px, 5vw, 28px)",
                    borderRadius: 999,
                    border: "1.5px dashed #E07A9A",
                    background: "#FBF9F3",
                    boxShadow:
                      "0 1px 3px rgba(20,16,24,0.06), 0 8px 20px -6px rgba(194,90,126,0.12)",
                    textAlign: "center",
                  }}
                >
                  <span
                    className="text-[color:var(--text-primary)]"
                    style={{
                      // 퀵 페이지와 동일 사이즈/굵기/자간/lineHeight,
                      // 색상은 원래대로 "이미지" 검정 + "스튜디오" 핑크 그라디언트.
                      // inline-flex 로 아이콘과 텍스트 베이스라인 정렬.
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 12,
                      fontSize: "clamp(24px, 7vw, 38px)",
                      letterSpacing: "-1px",
                      fontWeight: 700,
                      lineHeight: 1.15,
                    }}
                  >
                    {/* lucide wand-sparkles. 봉 본체는 currentColor, 모든 별빛(좌상·
                        우하 십자 4쌍)은 핑크→피치 그라디언트로 마법 효과 강조. */}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{ flexShrink: 0, width: "clamp(22px, 5.5vw, 36px)", height: "clamp(22px, 5.5vw, 36px)" }}
                    >
                      <defs>
                        <linearGradient
                          id="wand-sparkle-gradient"
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
                      <g stroke="url(#wand-sparkle-gradient)">
                        <path d="M5 6v4" />
                        <path d="M7 8H3" />
                        <path d="M19 14v4" />
                        <path d="M21 16h-4" />
                        <path d="M11 3H9" strokeWidth="1" />
                        <path d="M10 2v2" strokeWidth="1" />
                      </g>
                    </svg>
                    이미지{" "}
                    <span
                      style={{
                        // 라이트 베이지 배경 위 가독성 확보를 위해 진한 핑크 그라디언트.
                        // brand-gradient-text(#ffa4c6→#ffe3be) 는 너무 옅어 wash-out.
                        background: "linear-gradient(135deg, #B04070, #E07A9A)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      스튜디오
                    </span>
                  </span>
                </span>
              </h2>

              <div
                className="w-full"
                style={{
                  // 게스트 헤딩 pill 과 동일한 dashed 보더 + 베이지 배경 + 그림자.
                  // 다단계 콘텐츠를 담으므로 pill 보다는 큰 카드형 radius/패딩 사용.
                  // flex: 1 로 좌측 컬럼의 남은 높이를 모두 차지 → 우측 이미지 카드와
                  // 외곽 사각형이 딱 맞도록 한다.
                  flex: 1,
                  borderRadius: 24,
                  padding: "clamp(16px, 4vw, 24px) clamp(16px, 4vw, 28px)",
                  border: "1.5px dashed #E07A9A",
                  background: "#FBF9F3",
                  boxShadow:
                    "0 4px 12px -4px rgba(20,16,24,0.08), 0 24px 60px -16px rgba(20,16,24,0.18)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* 라벨은 카드 좌상단에 고정. */}
                <p className="text-[11px] uppercase tracking-widest font-semibold text-[color:var(--text-muted)]">
                  시작하는 방법
                </p>
                {/* 3단계 리스트는 라벨 아래 남은 영역의 세로 중앙에 배치. */}
                <div
                  className="flex flex-col gap-5"
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {(
                    [
                      {
                        n: 1,
                        title: "스타일 선택",
                        desc: "원하는 스타일을 고르거나, Auto Style을 켜면 브랜드에 맞는 스타일을 자동으로 생성합니다.",
                      },
                      {
                        n: 2,
                        title: "제품 & 모델 선택",
                        desc: "합성할 제품 이미지와 브랜드 모델을 선택하세요.",
                      },
                      {
                        n: 3,
                        title: "렌더",
                        desc: "비율과 수량을 설정한 뒤 렌더 버튼을 누르세요. 여러 장을 한 번에 생성해 결과를 비교할 수 있습니다.",
                      },
                    ] as { n: number; title: string; desc: string }[]
                  ).map(({ n, title, desc }) => (
                    <div key={n} className="flex items-start gap-4 text-left">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                        style={{
                          // 핑크 그라디언트 + 인셋 하이라이트로 작은 칩처럼 도드라지게.
                          background:
                            "linear-gradient(135deg, #FFD6E2 0%, #FFE9D6 100%)",
                          border: "1.5px solid #E07A9A",
                          color: "#B04070",
                          boxShadow:
                            "inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 6px -2px rgba(194,90,126,0.25)",
                        }}
                      >
                        {n}
                      </div>
                      <div className="pt-1">
                        <p className="text-lg font-semibold text-[color:var(--text-primary)] mb-1.5">
                          {title}
                        </p>
                        <p className="text-[15px] text-[color:var(--text-secondary)] leading-relaxed">
                          {desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 우 이미지 벤토 그리드 — lg+ 에서만 표시 ────────── */}
            <div className="hidden lg:flex flex-1 min-w-0">
              <div
                style={{
                  // 헤딩 pill / 시작하는 방법 카드와 동일한 dashed 보더 + 베이지 + 그림자.
                  // 이미지가 보더에 닿지 않도록 내부 패딩 + overflow:hidden 으로
                  // 그리드 모서리도 카드 radius 에 맞춰 깎인다.
                  // flex: 1 + display: flex 로 좌측 컬럼 높이에 stretch.
                  flex: 1,
                  display: "flex",
                  borderRadius: 24,
                  padding: 12,
                  border: "1.5px dashed #E07A9A",
                  background: "#FBF9F3",
                  boxShadow:
                    "0 4px 12px -4px rgba(20,16,24,0.08), 0 24px 60px -16px rgba(20,16,24,0.18)",
                }}
              >
                <div
                  className="grid gap-1 overflow-hidden flex-1"
                  style={{
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gridTemplateRows: "repeat(4, 120px)",
                    borderRadius: 14,
                  }}
                >
                  {STUDIO_BENTO.map((item) => (
                    <div
                      key={item.src}
                      className="relative overflow-hidden"
                      style={{
                        gridColumn: item.col,
                        gridRow: item.row,
                        background: item.fallback,
                      }}
                    >
                      <ShowcaseImage
                        src={item.src}
                        objectPosition={item.objectPosition}
                        fallback={item.fallback}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 모바일 전용 — 작은 미리보기 그리드 */}
          <div className="lg:hidden w-full max-w-[1200px] mx-auto px-4 md:px-8">
            <div
              style={{
                borderRadius: 24,
                padding: 12,
                border: "1.5px dashed #E07A9A",
                background: "#FBF9F3",
                boxShadow:
                  "0 1px 3px rgba(20,16,24,0.06), 0 8px 20px -6px rgba(194,90,126,0.12)",
              }}
            >
              <div
                className="grid grid-cols-2 gap-1 overflow-hidden"
                style={{ borderRadius: 14 }}
              >
                {STUDIO_BENTO.slice(0, 4).map((item) => (
                  <div
                    key={item.src}
                    className="relative overflow-hidden aspect-[4/5]"
                    style={{ background: item.fallback }}
                  >
                    <ShowcaseImage
                      src={item.src}
                      objectPosition={item.objectPosition}
                      fallback={item.fallback}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* FLOATING INPUT BAR — 워크스페이스 시각 미러 */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex flex-col items-center pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:pb-4 px-0 lg:px-4 pointer-events-none">
        <div className="w-full max-w-none lg:max-w-5xl lg:mx-auto pointer-events-none relative">
          <div
            className="w-full lg:backdrop-blur-lg rounded-none lg:rounded-2xl shadow-none lg:shadow-2xl lg:shadow-black/40 grid pointer-events-auto border-t lg:border border-[color:var(--border-default)]"
            style={{
              gridTemplateColumns: "auto 1fr",
              background: "var(--surface-1)",
            }}
          >
            {/* 스타일 버튼 (auth gate) */}
            <button
              type="button"
              onClick={gateToSignup}
              className="relative w-14 sm:w-auto sm:aspect-square flex flex-col items-center justify-center overflow-hidden transition-colors rounded-none lg:rounded-l-2xl hover:bg-[var(--surface-2)]"
              style={{ borderRight: "1px solid var(--border-default)" }}
              aria-label="스타일 선택 (가입 후 사용 가능)"
            >
              <div className="flex flex-col items-center gap-1.5 text-[color:var(--text-muted)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[9px] font-medium">스타일</span>
              </div>
            </button>

            <div className="flex flex-col min-w-0">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder='예: "깔끔한 흰 스튜디오 배경, 자연광, 모델이 제품을 자연스럽게 들고 있는 모습"'
                className="w-full bg-transparent text-[color:var(--text-primary)] text-sm px-5 pt-5 pb-3 resize-none outline-none min-h-[80px] max-h-48 placeholder:text-[color:var(--text-muted)]"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    gateToSignup();
                  }
                }}
              />

              <div className="flex items-center justify-between px-3 pb-3 gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={gateToSignup}
                    className="flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-[var(--surface-3)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={gateToSignup}
                    className="flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors bg-[var(--surface-3)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21v-2a4 4 0 014-4h8a4 4 0 014 4v2" />
                    </svg>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Batch count 드롭다운 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setBatchDropdownOpen((v) => !v)}
                      className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect x="3" y="3" width="6" height="6" rx="1" fill="currentColor" />
                        <rect x="11" y="3" width="6" height="6" rx="1" fill="currentColor" />
                        <rect x="3" y="11" width="6" height="6" rx="1" fill="currentColor" />
                        <rect x="11" y="11" width="6" height="6" rx="1" fill="currentColor" />
                      </svg>
                      <span className="text-[9px] font-medium leading-none">
                        ×{batchCount}
                      </span>
                    </button>

                    {batchDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setBatchDropdownOpen(false)}
                        />
                        <div
                          className="absolute bottom-full mb-2 right-0 z-50 rounded-xl shadow-xl p-1.5 flex gap-1"
                          style={{
                            background: "var(--surface-2)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          {BATCH_COUNTS.map((count) => (
                            <button
                              key={count}
                              type="button"
                              onClick={() => {
                                setBatchCount(count);
                                setBatchDropdownOpen(false);
                              }}
                              className={`flex flex-col items-center gap-1.5 px-2.5 py-2 rounded-lg transition-colors ${
                                batchCount === count
                                  ? "bg-[var(--surface-3)] text-[color:var(--text-primary)]"
                                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-3)]"
                              }`}
                            >
                              <span className="text-[11px] font-medium leading-none">
                                ×{count}
                              </span>
                              <span className="text-[9px] leading-none opacity-60">
                                컷
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="w-px h-5 bg-[var(--border-default)]" />

                  {/* Aspect ratio 드롭다운 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setAspectDropdownOpen((v) => !v)}
                      className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
                    >
                      {(() => {
                        const cur = ASPECT_RATIOS.find(
                          (r) => r.value === aspectRatio,
                        )!;
                        return (
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <rect
                              x={cur.rect.x}
                              y={cur.rect.y}
                              width={cur.rect.width}
                              height={cur.rect.height}
                              rx="1.5"
                              fill="currentColor"
                              stroke="currentColor"
                              strokeWidth="1.25"
                            />
                          </svg>
                        );
                      })()}
                      <span className="text-[9px] font-medium leading-none">
                        {aspectRatio}
                      </span>
                    </button>

                    {aspectDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setAspectDropdownOpen(false)}
                        />
                        <div
                          className="absolute bottom-full mb-2 right-0 z-50 rounded-xl shadow-xl p-1.5 flex gap-1"
                          style={{
                            background: "var(--surface-2)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          {ASPECT_RATIOS.map(({ value, label, rect }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                setAspectRatio(value);
                                setAspectDropdownOpen(false);
                              }}
                              className={`flex flex-col items-center gap-1.5 px-2.5 py-2 rounded-lg transition-colors ${
                                aspectRatio === value
                                  ? ""
                                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-3)]"
                              }`}
                              style={
                                aspectRatio === value
                                  ? {
                                      background: "rgba(255,164,198,0.10)",
                                      color: "#ffa4c6",
                                      borderColor: "rgba(255,164,198,0.30)",
                                    }
                                  : undefined
                              }
                            >
                              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <rect
                                  x={rect.x}
                                  y={rect.y}
                                  width={rect.width}
                                  height={rect.height}
                                  rx="1.5"
                                  fill={
                                    aspectRatio === value
                                      ? "currentColor"
                                      : "none"
                                  }
                                  stroke="currentColor"
                                  strokeWidth="1.25"
                                />
                              </svg>
                              <span className="text-[9px] font-medium leading-none">
                                {label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="w-px h-5 bg-[var(--border-default)]" />

                  {/* 렌더 버튼 — auth gate */}
                  <button
                    type="button"
                    onClick={gateToSignup}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all text-black"
                    style={{
                      background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                    }}
                    aria-label="렌더 (가입 후 사용 가능)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-black">
                      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden lg:block mt-2 text-[11px] text-[color:var(--text-muted)] text-center pointer-events-auto">
            <Link
              href="/pricing"
              className="text-[color:var(--text-secondary)] underline hover:text-[color:var(--text-primary)] transition-colors"
            >
              플랜 보기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
