/* eslint-disable @next/next/no-img-element */

import { FadeInOnScroll } from "./FadeInOnScroll";

type Mode = {
  num: string;
  badge: string;
  title: string;
  desc: string;
  img: string;
};

const MODES: Mode[] = [
  {
    num: "01",
    badge: "QUICK 썸네일 모드",
    title: "30초 만에\n판매용 썸네일",
    desc: "제품 사진만 올리면\n쿠팡·11번가·네이버 사이즈 썸네일이\n즉시 생성됩니다.\n1인 셀러의 일상 사용에 최적.",
    img: "/landing1.png",
  },
  {
    num: "02",
    badge: "스튜디오 모드",
    title: "브랜드 스타일까지\n원하는대로",
    desc: "스타일 라이브러리를 학습시키고\nAI 모델·구도·배경을 직접 설정해\n상세페이지·광고용 이미지를 만듭니다.\n다품목 셀러·브랜드 운영자용.",
    img: "/landing2.png",
  },
];

const BG = "#09090b";

type ModeBlockProps = {
  mode: Mode;
  textSide: "left" | "right";
};

function ModeBlock({ mode, textSide }: ModeBlockProps) {
  const textOnLeft = textSide === "left";
  const rowDirection = textOnLeft ? "lg:flex-row" : "lg:flex-row-reverse";

  return (
    <div
      className={`flex flex-col ${rowDirection} items-center`}
      style={{ minHeight: "55vh" }}
    >
      {/* Text half */}
      <div
        className={`flex-1 flex items-center py-10 lg:py-0 px-8 ${textOnLeft ? "lg:justify-end lg:pr-10 lg:pl-16" : "lg:justify-start lg:pl-10 lg:pr-16"}`}
      >
        <FadeInOnScroll>
          <div style={{ maxWidth: "400px" }}>
            {/* 큰 숫자 — line-height 줄이고 더 크게 */}
            <div
              className="font-headline font-black leading-[0.85] mb-3"
              style={{
                fontSize: "96px",
                color: "rgba(255,164,198,0.12)",
                letterSpacing: "-0.04em",
              }}
            >
              {mode.num}
            </div>
            <p
              className="text-[11px] font-bold tracking-[0.18em] uppercase mb-4"
              style={{ color: "rgba(255,164,198,0.65)" }}
            >
              {mode.badge}
            </p>
            <h3
              className="font-headline text-[32px] sm:text-[42px] font-extrabold text-white leading-[1.06] tracking-[-0.02em] whitespace-pre-line"
              style={{ wordBreak: "keep-all" }}
            >
              {mode.title}
            </h3>
            <p
              className="mt-5 text-base leading-relaxed whitespace-pre-line"
              style={{ color: "#a1a1aa" }}
            >
              {mode.desc}
            </p>
          </div>
        </FadeInOnScroll>
      </div>

      {/* Image half */}
      <div
        className={`flex-1 flex items-center py-8 lg:py-12 px-8 ${textOnLeft ? "lg:justify-start lg:pl-10 lg:pr-16" : "lg:justify-end lg:pr-10 lg:pl-16"}`}
      >
        <FadeInOnScroll>
          <img
            src={mode.img}
            alt={mode.badge}
            className="w-full rounded-3xl transition-transform duration-300 hover:scale-[1.01]"
            style={{
              maxWidth: "580px",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow:
                "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
            }}
            loading="lazy"
          />
        </FadeInOnScroll>
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: BG,
        paddingTop: "120px",
        paddingBottom: "120px",
      }}
    >
      {/* 배경 radial glow — center */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,164,198,0.05) 0%, transparent 65%)",
        }}
      />

      {/* Header */}
      <div className="relative max-w-[1100px] mx-auto px-6 mb-16 text-center">
        <p
          className="text-[11px] font-bold tracking-[0.18em] uppercase mb-5"
          style={{ color: "rgba(255,164,198,0.55)" }}
        >
          HOW IT WORKS
        </p>
        <h2
          className="font-headline text-[44px] sm:text-[54px] font-extrabold text-white leading-[1.04] tracking-[-0.02em] whitespace-pre-line"
          style={{ wordBreak: "keep-all" }}
        >
          {"30초 썸네일부터\n전문 스튜디오까지"}
        </h2>
      </div>

      {/* Mode blocks */}
      <div className="relative">
        {MODES.map((mode, i) => (
          <ModeBlock
            key={mode.num}
            mode={mode}
            textSide={i % 2 === 0 ? "left" : "right"}
          />
        ))}
      </div>
    </section>
  );
}
