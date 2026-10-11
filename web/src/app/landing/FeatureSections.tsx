/* eslint-disable @next/next/no-img-element */
"use client";

import type { CSSProperties, ReactNode } from "react";

import { FadeInOnScroll } from "./FadeInOnScroll";
import { TeamSection } from "./TeamSection";

type StyleCard = {
  src: string;
  label: string;
  name: string;
  color: string;
  labelBg: string;
  keywords: string[];
};

const styleCards: StyleCard[] = [
  {
    src: "/landing/a.png",
    label: "A",
    name: "MINIMAL",
    color: "#8B7040",
    labelBg: "#EDE8DF",
    keywords: [
      "Low Saturation",
      "Soft Light",
      "Clean Composition",
      "Smooth Texture",
      "Simple Typography",
    ],
  },
  {
    src: "/landing/b.png",
    label: "B",
    name: "PREMIUM",
    color: "#C9A96E",
    labelBg: "#1A1614",
    keywords: [
      "Deep Colors",
      "Directional Light",
      "Bold Composition",
      "Rich Texture",
      "Elegant Typography",
    ],
  },
  {
    src: "/landing/c.png",
    label: "C",
    name: "LOVELY",
    color: "#C06080",
    labelBg: "#F5E6EA",
    keywords: [
      "Bright Colors",
      "Soft Diffused Light",
      "Balanced Composition",
      "Light Texture",
      "Friendly Typography",
    ],
  },
];

function BrandConsistencyBlock() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: "#0e0e10" }}
    >
      {/* 배경 radial glow — top-right */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 45% at 85% 15%, rgba(255,164,198,0.06) 0%, transparent 65%)",
        }}
      />

      <div className="relative flex flex-col lg:flex-row lg:justify-center lg:items-center py-16 lg:gap-96">
        {/* 좌측 텍스트 영역 */}
        <div className="flex-none w-full lg:w-[420px] flex items-center justify-center px-8 lg:px-12 py-12 lg:py-0">
          <FadeInOnScroll>
            <div style={{ maxWidth: 420 }}>
              <p
                className="text-[11px] font-bold tracking-[0.18em] uppercase mb-5"
                style={{ color: "rgba(255,164,198,0.55)" }}
              >
                BRAND CONSISTENCY
              </p>
              <h2
                className="font-headline text-[36px] sm:text-[44px] lg:text-[54px] font-extrabold text-white whitespace-pre-line tracking-[-0.02em]"
                style={{ wordBreak: "keep-all", lineHeight: 1.06 }}
              >
                {"어떤 제품이든\n팔리는 비주얼로"}
              </h2>
              <p
                className="mt-6 text-base leading-relaxed whitespace-pre-line"
                style={{ color: "#a1a1aa" }}
              >
                {
                  "썸네일에 최적화된 구도, 조명, 배경.\n클릭률을 높이는 제품 이미지를 즉시 생성합니다."
                }
              </p>
            </div>
          </FadeInOnScroll>
        </div>

        {/* 우측 이미지 카드 스택 영역 */}
        <div className="flex-none w-full lg:w-[650px] relative py-6 pr-6 lg:pr-10 flex flex-col gap-2 justify-center">
          {/* 원형 — 좌측 경계에 겹침 */}
          <div
            className="hidden lg:flex items-center justify-center overflow-hidden absolute"
            style={{
              left: -80,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 10,
              width: 160,
              height: 160,
              borderRadius: "50%",
              background: "rgba(20,20,22,0.95)",
              border: "2px solid rgba(255,164,198,0.22)",
              boxShadow:
                "0 0 40px rgba(255,164,198,0.10), 0 16px 40px rgba(0,0,0,0.5)",
            }}
          >
            <img
              src="/landing/original.png"
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          {/* 3개 스타일 카드 */}
          {styleCards.map((card) => (
            <div
              key={card.label}
              className="flex w-full rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
              style={{
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                  "0 16px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,164,198,0.18)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                  "0 8px 24px rgba(0,0,0,0.4)";
              }}
            >
              {/* 이미지 영역 */}
              <div className="flex-1 relative aspect-[3/2] overflow-hidden">
                <img
                  src={card.src}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                  loading="lazy"
                  alt={`${card.name} style`}
                />
              </div>

              {/* 레이블 영역 */}
              <div
                className="w-[120px] lg:w-[180px] shrink-0"
                style={{
                  background: card.labelBg,
                  padding: "20px 16px",
                  borderLeft: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex items-baseline gap-2 mb-3">
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: card.color,
                      lineHeight: 1,
                    }}
                  >
                    {card.label}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      color: card.color,
                    }}
                  >
                    {card.name}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {card.keywords.map((k) => (
                    <p
                      key={k}
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.5)",
                        lineHeight: "1.6",
                      }}
                    >
                      · {k}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function IgIcon() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        flexShrink: 0,
        background:
          "linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <rect
          x="2"
          y="2"
          width="20"
          height="20"
          rx="5"
          stroke="white"
          strokeWidth="2.2"
        />
        <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="2.2" />
        <circle cx="17.5" cy="6.5" r="1.4" fill="white" />
      </svg>
    </div>
  );
}

function MonitorIcon() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        flexShrink: 0,
        background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <rect x="2" y="3" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 16v5" />
      </svg>
    </div>
  );
}

function BagIcon() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        flexShrink: 0,
        background: "#27272a",
        border: "1px solid rgba(255,255,255,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    </div>
  );
}

const CARD_STYLE: CSSProperties = {
  position: "absolute",
  background: "rgba(20,20,24,0.97)",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 14,
  overflow: "hidden",
  boxShadow: "0 16px 48px rgba(0,0,0,0.65)",
};

function CardHeader({
  icon,
  name,
  size,
}: {
  icon: ReactNode;
  name: string;
  size: string;
}) {
  return (
    <div
      style={{
        padding: "7px 9px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {icon}
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </p>
        <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{size}</p>
      </div>
    </div>
  );
}

function MultiChannelDiagram() {
  const curves = [
    "M 261,155 C 231,155 231,238 342,238",
    "M 531,215 C 612,215 693,165 693,120",
    "M 279,465 C 249,465 249,365 342,365",
    "M 531,365 C 610,365 675,425 675,470",
  ];

  const dots: [number, number][] = [
    [255, 155],
    [345, 238],
    [531, 215],
    [693, 120],
    [345, 365],
    [275, 465],
    [531, 365],
    [675, 470],
  ];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "900 / 650",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {/* SVG 커브 레이어 */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
        viewBox="0 0 900 650"
        preserveAspectRatio="none"
        fill="none"
      >
        <defs>
          <filter
            id="curve-glow"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {curves.map((d, i) => (
          <g key={i}>
            <path
              d={d}
              stroke="rgba(255,164,198,0.06)"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <path
              d={d}
              stroke="rgba(255,215,228,0.9)"
              strokeWidth="1.5"
              strokeLinecap="round"
              filter="url(#curve-glow)"
            />
          </g>
        ))}

        {dots.map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="2.5"
            fill="rgba(255,215,228,0.9)"
            filter="url(#curve-glow)"
          />
        ))}
      </svg>

      {/* "Original Image" 플로팅 라벨 */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "38%",
          width: "28%",
          display: "flex",
          justifyContent: "center",
          zIndex: 20,
        }}
      >
        <div
          style={{
            background: "rgba(28,28,33,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            padding: "5px 12px",
            backdropFilter: "blur(8px)",
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
            Original Image
          </p>
        </div>
      </div>

      {/* 중앙 카드 */}
      <div
        style={{
          ...CARD_STYLE,
          top: "27%",
          left: "38%",
          width: "28%",
          height: "38%",
          borderRadius: 14,
          boxShadow: "0 24px 72px rgba(0,0,0,0.75)",
          zIndex: 10,
        }}
      >
        <img
          src="/landing/a.png"
          alt="Original product"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "62% 45%",
          }}
          loading="lazy"
        />
      </div>

      {/* 화살표들 */}
      <div
        style={{
          position: "absolute",
          top: "44%",
          left: "32%",
          transform: "translateY(-50%)",
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: -4,
          color: "rgba(255,255,255,0.45)",
          zIndex: 20,
          userSelect: "none",
        }}
      >
        {"<<"}
      </div>
      <div
        style={{
          position: "absolute",
          top: "44%",
          left: "70%",
          transform: "translateY(-50%)",
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: -4,
          color: "rgba(255,255,255,0.45)",
          zIndex: 20,
          userSelect: "none",
        }}
      >
        {">>"}
      </div>

      {/* Instagram Feed 카드 */}
      <div style={{ ...CARD_STYLE, top: "3%", left: "5%", width: "24%" }}>
        <CardHeader
          icon={<IgIcon />}
          name="Instagram Feed"
          size="1:1 (1080×1080)"
        />
        <img
          src="/landing/a.png"
          alt="Instagram"
          style={{
            width: "100%",
            aspectRatio: "1",
            objectFit: "cover",
            objectPosition: "68% 42%",
            display: "block",
          }}
          loading="lazy"
        />
      </div>

      {/* Story 카드 */}
      <div style={{ ...CARD_STYLE, top: "0%", left: "76%", width: "19%" }}>
        <CardHeader icon={<IgIcon />} name="Story" size="9:16 (1080×1920)" />
        <img
          src="/landing/a.png"
          alt="Story"
          style={{
            width: "100%",
            aspectRatio: "9/16",
            objectFit: "cover",
            objectPosition: "68% 30%",
            display: "block",
          }}
          loading="lazy"
        />
      </div>

      {/* Banner 카드 */}
      <div style={{ ...CARD_STYLE, top: "57%", left: "0%", width: "31%" }}>
        <CardHeader
          icon={<MonitorIcon />}
          name="Banner"
          size="16:9 (1920×1080)"
        />
        <div
          style={{
            position: "relative",
            aspectRatio: "16/7",
            overflow: "hidden",
            background:
              "linear-gradient(to right, #e8ddd2 0%, #e8ddd2 30%, #cfc4b6 58%, #ddd1c4 100%)",
          }}
        >
          <img
            src="/landing/a.png"
            alt="Banner"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "right center",
            }}
            loading="lazy"
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 3,
            }}
          >
            <p
              style={{
                fontSize: 8,
                fontWeight: 800,
                color: "#2c1f10",
                lineHeight: 1.4,
                textTransform: "uppercase",
              }}
            >
              {"SOFT\nSKIN\nRITUAL".split("\n").map((t, i) => (
                <span key={i} style={{ display: "block" }}>
                  {t}
                </span>
              ))}
            </p>
            <p style={{ fontSize: 7, color: "rgba(44,31,16,0.6)" }}>
              매일의 보습 루틴
            </p>
            <div
              style={{
                marginTop: 3,
                padding: "2px 6px",
                border: "1px solid rgba(44,31,16,0.4)",
                borderRadius: 3,
                display: "inline-block",
                width: "fit-content",
              }}
            >
              <p
                style={{ fontSize: 6, color: "#2c1f10", whiteSpace: "nowrap" }}
              >
                SHOP NOW
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Page 카드 */}
      <div style={{ ...CARD_STYLE, top: "58%", left: "73%", width: "20%" }}>
        <CardHeader
          icon={<BagIcon />}
          name="Detail Page"
          size="4:5 (960×1200)"
        />
        <img
          src="/landing/a.png"
          alt="Detail"
          style={{
            width: "100%",
            aspectRatio: "4/5",
            objectFit: "cover",
            objectPosition: "75% 33%",
            display: "block",
          }}
          loading="lazy"
        />
      </div>

      {/* AI 자동 변환 뱃지 */}
      <div
        style={{
          position: "absolute",
          top: "76%",
          left: "52%",
          transform: "translateX(-50%)",
          textAlign: "center",
          zIndex: 20,
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: "rgba(100,50,180,0.22)",
            border: "1px solid rgba(160,90,240,0.38)",
            boxShadow: "0 0 28px rgba(130,70,210,0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 6px",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2l1.4 4.2L18 8l-4.6 1.8L12 14l-1.4-4.2L6 8l4.6-1.8L12 2z"
              fill="rgba(200,130,255,0.95)"
            />
            <path
              d="M19 15l.7 2L21.7 18l-2 .7L19 20.7l-.7-2L16.3 18l2-.7L19 15z"
              fill="rgba(200,130,255,0.7)"
            />
            <path
              d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17z"
              fill="rgba(200,130,255,0.5)"
            />
          </svg>
        </div>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            whiteSpace: "nowrap",
          }}
        >
          AI 자동 변환
        </p>
        <p
          style={{
            fontSize: 10,
            color: "#71717a",
            whiteSpace: "nowrap",
            marginTop: 2,
          }}
        >
          채널별 최적화 완료!
        </p>
      </div>
    </div>
  );
}

function MultiChannelBlock() {
  return (
    <section
      className="relative overflow-hidden flex items-center py-[100px] lg:py-[120px]"
      style={{ background: "#0e0e10", minHeight: "80vh" }}
    >
      {/* 배경 radial glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 60% 50%, rgba(255,164,198,0.05) 0%, transparent 65%)",
        }}
      />

      <div className="relative w-full max-w-[1400px] mx-auto px-6 lg:px-16 flex flex-col lg:flex-row items-center gap-16 lg:gap-12">
        {/* 좌측 텍스트 영역 */}
        <FadeInOnScroll>
          <div className="w-full lg:w-[420px] flex-none">
            <p
              className="text-[11px] font-bold tracking-[0.18em] uppercase mb-5"
              style={{ color: "rgba(255,164,198,0.55)" }}
            >
              MULTI-CHANNEL
            </p>
            <h2
              className="font-headline text-[36px] sm:text-[44px] lg:text-[54px] font-extrabold text-white leading-[1.06] tracking-[-0.02em] whitespace-pre-line"
              style={{ wordBreak: "keep-all" }}
            >
              {"썸네일부터 상세페이지까지,\n한 번에 완성"}
            </h2>
            <p
              className="mt-6 text-base leading-relaxed whitespace-pre-line max-w-[360px]"
              style={{ color: "#a1a1aa" }}
            >
              {
                "대표이미지, 상세페이지, SNS, 배너.\n목적에 맞는 사이즈와 구도로 자동 생성됩니다."
              }
            </p>
          </div>
        </FadeInOnScroll>

        {/* 우측 다이어그램 */}
        <FadeInOnScroll delay={0.15} className="flex-1 min-w-0">
          <MultiChannelDiagram />
        </FadeInOnScroll>
      </div>
    </section>
  );
}

function VirtualModelBlock() {
  return (
    <section
      className="relative overflow-hidden flex items-center py-[120px]"
      style={{ background: "#09090b", minHeight: "100vh" }}
    >
      {/* 배경 radial glow — bottom-left */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 45% at 15% 80%, rgba(255,164,198,0.06) 0%, transparent 65%)",
        }}
      />

      <div className="relative w-full max-w-[1200px] mx-auto px-6 lg:px-16 flex flex-col lg:flex-row-reverse items-center gap-16 lg:gap-20">
        {/* 텍스트 */}
        <FadeInOnScroll>
          <div className="w-full lg:w-[420px] flex-none">
            <p
              className="text-[11px] font-bold tracking-[0.18em] uppercase mb-5"
              style={{ color: "rgba(255,164,198,0.55)" }}
            >
              VIRTUAL MODEL
            </p>
            <h2
              className="font-headline text-[36px] sm:text-[44px] lg:text-[54px] font-extrabold text-white leading-[1.06] tracking-[-0.02em] whitespace-pre-line"
              style={{ wordBreak: "keep-all" }}
            >
              {"모델 섭외 없이\n원하는 모델 컷"}
            </h2>
            <p
              className="mt-6 text-base leading-relaxed whitespace-pre-line max-w-[360px]"
              style={{ color: "#a1a1aa" }}
            >
              {
                "우리 브랜드에 딱 맞는 가상 모델을 보유하고,\n필요할 때마다 모델컷을 완성하세요."
              }
            </p>
          </div>
        </FadeInOnScroll>

        {/* 이미지 쌍 */}
        <FadeInOnScroll className="flex-1 flex items-center justify-center lg:h-[600px]">
          <div className="flex flex-row items-center py-[70px] max-sm:py-[36px]">
            {/* model1 — 아래로 내림 */}
            <div className="relative translate-y-[60px] z-[1] max-sm:translate-y-[32px]">
              <img
                src="/landing/model1.png"
                alt="가상 모델 예시 1"
                className="w-[280px] h-[280px] max-sm:w-[160px] max-sm:h-[160px] object-cover rounded-3xl transition-transform duration-300 hover:scale-[1.02]"
                style={{
                  filter: "brightness(0.92) saturate(0.85)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow:
                    "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
                }}
                loading="lazy"
              />
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 50%, rgba(14,14,16,0.6) 100%)",
                }}
              />
            </div>

            {/* model2 — 위로 올림, 겹침 */}
            <div className="relative -translate-y-[60px] -ml-6 z-10 max-sm:-translate-y-[32px] max-sm:-ml-4">
              <img
                src="/landing/model2.png"
                alt="가상 모델 예시 2"
                className="w-[280px] h-[280px] max-sm:w-[160px] max-sm:h-[160px] object-cover rounded-3xl transition-transform duration-300 hover:scale-[1.02]"
                style={{
                  filter: "brightness(0.92) saturate(0.85)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow:
                    "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
                }}
                loading="lazy"
              />
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent 50%, rgba(14,14,16,0.6) 100%)",
                }}
              />
            </div>
          </div>
        </FadeInOnScroll>
      </div>
    </section>
  );
}

export function FeatureSections() {
  return (
    <>
      <BrandConsistencyBlock />

      <VirtualModelBlock />

      <MultiChannelBlock />

      <TeamSection />
    </>
  );
}
