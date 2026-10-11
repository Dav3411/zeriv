"use client";

import { FadeInOnScroll } from "./FadeInOnScroll";

export function SolutionSection() {
  return (
    <section className="relative flex min-h-[80vh] flex-col items-center justify-center px-6 py-24 text-center">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(255,227,190,0.04) 0%, transparent 70%)",
        }}
      />

      <FadeInOnScroll>
        <p
          className="text-sm font-bold tracking-widest uppercase mb-5"
          style={{ color: "var(--brand-to)" }}
        >
          Zeriv Solution
        </p>
        <h2
          className="text-3xl sm:text-4xl lg:text-[52px] font-bold text-white leading-[1.25] tracking-tight max-w-3xl"
          style={{ wordBreak: "keep-all" }}
        >
          제품만 올리면,
          <br />
          썸네일과 상세페이지 이미지를 시스템이 만들어드립니다.
        </h2>
      </FadeInOnScroll>

      <FadeInOnScroll delay={0.15}>
        <p
          className="mt-6 text-base sm:text-lg max-w-md"
          style={{ color: "#8b8b99" }}
        >
          제품 사진을 올리면 썸네일에 최적화된 구도와 배경이 자동으로
          생성됩니다.
          <br />
          상세페이지용, SNS용, 배너용 이미지를 목적에 맞게 즉시 뽑아낼 수
          있습니다.
        </p>
      </FadeInOnScroll>
    </section>
  );
}
