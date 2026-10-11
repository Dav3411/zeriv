import { FadeInOnScroll } from "./FadeInOnScroll";

export function PainSection() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: "#111113", padding: "160px 0" }}
    >
      {/* 배경 radial glow — bottom-right */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 80% 85%, rgba(255,164,198,0.06) 0%, transparent 65%)",
        }}
      />

      <div className="relative max-w-[800px] mx-auto px-6">
        {/* 큰 인용문 헤드라인 */}
        <FadeInOnScroll>
          <div className="relative">
            {/* 따옴표 장식 — 더 크고 더 subtle */}
            <span
              aria-hidden
              style={{
                fontSize: "160px",
                lineHeight: 0.5,
                color: "rgba(255,164,198,0.07)",
                fontFamily: "Georgia, serif",
                userSelect: "none",
                position: "absolute",
                top: "-24px",
                left: "-12px",
                pointerEvents: "none",
              }}
            >
              &ldquo;
            </span>
            <h2
              className="font-headline text-[44px] sm:text-[56px] lg:text-[68px] font-extrabold text-white leading-[1.06] tracking-[-0.02em] relative"
              style={{ wordBreak: "keep-all" }}
            >
              눈길을 끄는 제품 이미지,
              <br />
              찾는 것도 유지하는 것도
              <br />
              쉽지 않습니다.
            </h2>
          </div>
        </FadeInOnScroll>

        {/* border-left 서브텍스트 — 더 길고 핑크 글로우 추가 */}
        <div
          className="mt-16 space-y-5 pl-8"
          style={{
            borderLeft: "2px solid rgba(255,164,198,0.28)",
            boxShadow: "-4px 0 24px rgba(255,164,198,0.06)",
          }}
        >
          <FadeInOnScroll delay={0.15}>
            <p
              className="text-base sm:text-lg leading-relaxed"
              style={{ color: "#a1a1aa" }}
            >
              썸네일 하나 만들려고 스튜디오 예약, 모델 섭외, 후보정까지.
            </p>
          </FadeInOnScroll>
          <FadeInOnScroll delay={0.25}>
            <p
              className="text-base sm:text-lg leading-relaxed"
              style={{ color: "#a1a1aa" }}
            >
              상세페이지용 이미지는 또 따로, 채널마다 또 따로.
            </p>
          </FadeInOnScroll>
          <FadeInOnScroll delay={0.35}>
            <p
              className="text-base sm:text-lg leading-relaxed"
              style={{ color: "#a1a1aa" }}
            >
              그 작업을 매번, 처음부터 반복합니다.
            </p>
          </FadeInOnScroll>
        </div>
      </div>
    </section>
  );
}
