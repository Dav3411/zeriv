/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useState } from "react";
import { FadeInOnScroll } from "./FadeInOnScroll";
import { useAuth } from "@/components/AuthProvider";

// ── Scatter 갤러리 타입 ──────────────────────────────────────────────────────
type Depth = "front" | "mid" | "back";

type ScatterItem = {
  src: string;
  label: string;
  badge?: string;
  /** lg 이상: absolute 위치·크기·회전 (position, width, height, transform 포함) */
  style: React.CSSProperties;
  z: number;
  depth: Depth;
  /** 모바일 grid span (< lg 폴백) */
  mobileArea: string;
};

// ── 9장 배치 데이터 ─────────────────────────────────────────────────────────
const SCATTER_ITEMS: ScatterItem[] = [
  // 1. 모델컷 — 가장 크고 중앙 앵커
  {
    src: "/quick/modelcut.png",
    label: "모델컷",
    style: {
      position: "absolute",
      width: 288,
      height: 320,
      top: 60,
      left: "38%",
      transform: "rotate(3deg)",
    },
    z: 30,
    depth: "front",
    mobileArea: "col-span-2 row-span-2",
  },
  // 2. 누끼컷 — 우상단, bleeding
  {
    src: "/quick/multicut.png",
    label: "누끼컷",
    badge: "쿠팡 기준 충족",
    style: {
      position: "absolute",
      width: 200,
      height: 160,
      top: 0,
      right: -20,
      transform: "rotate(-7deg)",
    },
    z: 25,
    depth: "front",
    mobileArea: "col-span-2 row-span-1",
  },
  // 3. 감성컷 — 우측 중단, bleeding
  {
    src: "/quick/moodcut.png",
    label: "감성컷",
    style: {
      position: "absolute",
      width: 176,
      height: 176,
      top: 170,
      right: -30,
      transform: "rotate(9deg)",
    },
    z: 20,
    depth: "mid",
    mobileArea: "col-span-1 row-span-1",
  },
  // 4. 스킨케어
  {
    src: "/explore/product_01.png",
    label: "스킨케어",
    style: {
      position: "absolute",
      width: 160,
      height: 200,
      top: 340,
      right: "18%",
      transform: "rotate(-5deg)",
    },
    z: 22,
    depth: "mid",
    mobileArea: "col-span-1 row-span-1",
  },
  // 5. 단일 제품컷 — 좌상단 (위로 올려 모델컷 얼굴 영역 노출)
  {
    src: "/quick/singlecut.png",
    label: "단일 제품",
    style: {
      position: "absolute",
      width: 200,
      height: 160,
      top: -10,
      left: "14%",
      transform: "rotate(-10deg)",
    },
    z: 18,
    depth: "mid",
    mobileArea: "col-span-2 row-span-1",
  },
  // 6. 오가닉 — 좌중단
  {
    src: "/explore/product_03.png",
    label: "오가닉",
    style: {
      position: "absolute",
      width: 176,
      height: 176,
      top: 220,
      left: "10%",
      transform: "rotate(6deg)",
    },
    z: 15,
    depth: "back",
    mobileArea: "col-span-2 row-span-1",
  },
  // 7. 그라데이션 — 우하단, bleeding
  {
    src: "/explore/product_04.png",
    label: "그라데이션",
    style: {
      position: "absolute",
      width: 240,
      height: 180,
      top: 430,
      right: -40,
      transform: "rotate(-4deg)",
    },
    z: 18,
    depth: "mid",
    mobileArea: "col-span-2 row-span-1",
  },
  // 8. K-뷰티 — 좌하단
  {
    src: "/explore/kbeauty_01.png",
    label: "K-뷰티",
    style: {
      position: "absolute",
      width: 160,
      height: 200,
      top: 380,
      left: "6%",
      transform: "rotate(8deg)",
    },
    z: 12,
    depth: "back",
    mobileArea: "col-span-1 row-span-1",
  },
  // 9. 라이프스타일 — 중앙 우측, 모델컷 우하단
  {
    src: "/explore/lifestyle_01.png",
    label: "라이프스타일",
    style: {
      position: "absolute",
      width: 180,
      height: 220,
      top: 200,
      left: "62%",
      transform: "rotate(-3deg)",
    },
    z: 28,
    depth: "front",
    mobileArea: "col-span-1 row-span-1",
  },
];

// ── depth별 그림자 프리셋 ────────────────────────────────────────────────────
const DEPTH_SHADOW: Record<Depth, string> = {
  front: "0 24px 48px rgba(0,0,0,0.55)",
  mid: "0 16px 32px rgba(0,0,0,0.45)",
  back: "0 12px 24px rgba(0,0,0,0.35)",
};
const DEPTH_SHADOW_HOVER = "0 32px 60px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,164,198,0.30), 0 0 40px rgba(255,164,198,0.15)";
const DEPTH_OPACITY: Record<Depth, number> = {
  front: 1,
  mid: 0.97,
  back: 0.92,
};
const DEPTH_BLUR: Record<Depth, string> = {
  front: "none",
  mid: "none",
  back: "blur(0.3px)",
};

// ── ScatterCard ──────────────────────────────────────────────────────────────
function ScatterCard({ item, index }: { item: ScatterItem; index: number }) {
  const [hovered, setHovered] = useState(false);

  // lg 이상: absolute scatter / lg 미만: 이 컴포넌트는 숨겨짐 (별도 BentoFallback 사용)
  const baseTransform = item.style.transform ?? "none";
  const hoverTransform = "scale(1.05) rotate(0deg)";

  return (
    <div
      className="group absolute cursor-pointer overflow-hidden transition-all duration-500"
      style={{
        ...item.style,
        zIndex: hovered ? 50 : item.z,
        transform: hovered ? hoverTransform : baseTransform,
        boxShadow: hovered ? DEPTH_SHADOW_HOVER : DEPTH_SHADOW[item.depth],
        opacity: hovered ? 1 : DEPTH_OPACITY[item.depth],
        filter: hovered ? "none" : DEPTH_BLUR[item.depth],
        border: "1px solid rgba(255,255,255,0.08)",
        background: "var(--surface-2)",
        willChange: "transform, box-shadow",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={item.src}
        alt={item.label}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
        loading={index < 2 ? "eager" : "lazy"}
      />
      {/* 하단 그라데이션 + 라벨 오버레이 */}
      <div
        className="absolute inset-x-0 bottom-0 p-3 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 60%, transparent 100%)",
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs lg:text-sm font-bold text-white drop-shadow">
            {item.label}
          </span>
          {item.badge && (
            <span
              className="text-[9px] lg:text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap font-semibold"
              style={{
                background: "rgba(255,164,198,0.20)",
                color: "#ffc8dd",
                border: "1px solid rgba(255,164,198,0.35)",
                backdropFilter: "blur(4px)",
              }}
            >
              {item.badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 모바일 폴백: 기존 4-col bento grid ──────────────────────────────────────
function BentoFallback() {
  return (
    <div
      className="grid grid-cols-4 gap-2.5"
      style={{
        gridAutoRows: "minmax(115px, 1fr)",
        maxHeight: "min(82vh, 800px)",
      }}
    >
      {SCATTER_ITEMS.map((item, i) => (
        <div
          key={`mobile-${item.src}-${i}`}
          className={`group relative overflow-hidden cursor-pointer transition-all duration-500 hover:-translate-y-1 ${item.mobileArea}`}
          style={{
            background: "var(--surface-2)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow:
              "0 20px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        >
          <img
            src={item.src}
            alt={item.label}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
            loading={i === 0 ? "eager" : "lazy"}
          />
          <div
            className="absolute inset-x-0 bottom-0 p-3 pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 60%, transparent 100%)",
            }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-white drop-shadow">
                {item.label}
              </span>
              {item.badge && (
                <span
                  className="text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap font-semibold"
                  style={{
                    background: "rgba(255,164,198,0.20)",
                    color: "#ffc8dd",
                    border: "1px solid rgba(255,164,198,0.35)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  {item.badge}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── StatCard — Borderless Number Stage (시안 A) ──────────────────────────────
function StatCard({
  label,
  value,
  hint,
  showDivider,
}: {
  label: string;
  value: string;
  hint: string;
  showDivider?: boolean;
}) {
  return (
    <div className="relative px-4 lg:px-6 text-center lg:text-left">
      {/* 수직 divider — lg에서만, 첫 cell 제외 */}
      {showDivider && (
        <div
          className="hidden lg:block absolute left-0 top-1/2 -translate-y-1/2 w-px"
          style={{
            height: "60%",
            background: "rgba(255,255,255,0.08)",
          }}
          aria-hidden
        />
      )}

      {/* 값 — text-5xl 그라데이션 */}
      <p
        className="text-4xl lg:text-5xl font-extrabold leading-none mb-3"
        style={{
          background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        {value}
      </p>

      {/* 라벨 — uppercase tracking */}
      <p
        className="text-[10px] font-bold uppercase tracking-widest mb-1"
        style={{ color: "rgba(255,255,255,0.45)" }}
      >
        {label}
      </p>

      {/* 힌트 — 최하 (라벨보다 더 흐림으로 위계 완성) */}
      <p
        className="text-[11px]"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        {hint}
      </p>
    </div>
  );
}

// ── HeroSection ──────────────────────────────────────────────────────────────
export function HeroSection() {
  const { user } = useAuth();
  return (
    <section
      className="relative overflow-x-clip"
      style={{
        minHeight: "100vh",
        background: "#09090b",
      }}
    >
      {/* 배경 radial glows — 다층 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 72% 38%, rgba(255,164,198,0.09) 0%, transparent 65%), radial-gradient(ellipse 40% 35% at 20% 80%, rgba(255,164,198,0.05) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 85% 85%, rgba(255,227,190,0.04) 0%, transparent 60%)",
        }}
      />

      <div
        className="relative mx-auto w-full max-w-[1480px] px-4 sm:px-8 lg:px-12
                   pt-[110px] lg:pt-[130px] pb-12 lg:pb-16
                   grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_1.4fr] gap-8 lg:gap-12 items-center"
      >
        {/* ── 좌측: minimal 텍스트 + CTA ─────────────────────────────────── */}
        <div className="lg:max-w-[460px]">
          <FadeInOnScroll>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-widest mb-6"
              style={{
                background: "rgba(255,164,198,0.08)",
                border: "1px solid rgba(255,164,198,0.32)",
                color: "#ffc8dd",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#ffa4c6" }}
              />
              쿠팡·스마트스토어 셀러용
            </div>
          </FadeInOnScroll>

          <FadeInOnScroll>
            <h1
              className="text-[40px] sm:text-[50px] lg:text-[60px] font-extrabold text-white leading-[1.04] tracking-[-0.02em]"
              style={{ wordBreak: "keep-all" }}
            >
              촬영 없이
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  fontFamily: "var(--font-poppins)",
                  fontWeight: 500,
                  display: "inline-block",
                  paddingRight: "0.15em",
                }}
              >
                제품 썸네일
              </span>
              <br />30초.
            </h1>
          </FadeInOnScroll>

          <FadeInOnScroll delay={0.1}>
            <p
              className="mt-5 text-base sm:text-lg leading-relaxed"
              style={{ color: "rgba(255,255,255,0.7)" }}
            >
              제품 사진 한 장이면 끝. 채널별 사이즈 자동.
            </p>
          </FadeInOnScroll>

          {/* CTA — 더 prominent */}
          <FadeInOnScroll delay={0.15}>
            <div className="mt-8 flex items-center gap-4">
              <Link
                href="/quick"
                className="btn btn-primary px-8 py-4 rounded-full text-base font-bold transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  boxShadow: "0 4px 28px rgba(255,164,198,0.4)",
                  borderRadius: "9999px",
                }}
              >
                지금 무료로 시작
              </Link>
              {!user && (
                <Link
                  href="/explore"
                  className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors duration-200"
                >
                  먼저 둘러보기 →
                </Link>
              )}
            </div>
          </FadeInOnScroll>

          {/* 가격 hint + 채널 — 한 줄로 압축 */}
          <FadeInOnScroll delay={0.2}>
            <p
              className="mt-5 text-xs"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              가입 즉시 Free 월 5장 영구 무료 · 정식 플랜 ₩9,900/월부터 (50장)
            </p>
          </FadeInOnScroll>
        </div>

        {/* ── 우측: 흩어진 필름 스트립 갤러리 ────────────────────────────── */}
        <FadeInOnScroll delay={0.15}>
          <div className="relative" aria-hidden="true">

            {/* 모바일/태블릿 폴백 (< lg): 4-col bento grid */}
            <div className="lg:hidden">
              <BentoFallback />
            </div>

            {/* lg 이상: scatter 콜라주 */}
            <div
              className="hidden lg:block relative"
              style={{ height: 640, overflow: "visible" }}
            >
              {/* 핑크 글로우 — 모델컷 뒤 */}
              <div
                aria-hidden
                className="absolute pointer-events-none"
                style={{
                  top: 100,
                  left: "35%",
                  width: 360,
                  height: 360,
                  background:
                    "radial-gradient(circle, rgba(255,164,198,0.22) 0%, transparent 70%)",
                  filter: "blur(40px)",
                  zIndex: 5,
                }}
              />

              {SCATTER_ITEMS.map((item, i) => (
                <ScatterCard key={`${item.src}-${i}`} item={item} index={i} />
              ))}
            </div>

            {/* 갤러리 외곽 글로우 */}
            <div
              className="absolute -inset-12 -z-10 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,164,198,0.13) 0%, transparent 65%)",
              }}
            />
          </div>
        </FadeInOnScroll>
      </div>

      {/* ── 하단 feature strip — 전체 폭 가로 4-col ───────────────────── */}
      <div className="relative mx-auto w-full max-w-[1480px] px-4 sm:px-8 lg:px-12 pb-16 lg:pb-20">
        <FadeInOnScroll delay={0.25}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-8 lg:gap-y-0">
            <StatCard label="평균 생성 시간" value="30초" hint="썸네일 1장 기준" />
            <StatCard label="채널 사이즈 자동" value="10채널" hint="커머스·SNS·광고·영상" showDivider />
            <StatCard label="신용카드" value="불필요" hint="가입 즉시 시작" showDivider />
            <StatCard label="시작 가격" value="₩0" hint="Free 월 5장 영구" showDivider />
          </div>
        </FadeInOnScroll>
      </div>

    </section>
  );
}
