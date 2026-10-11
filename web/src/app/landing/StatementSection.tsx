"use client";

import { FadeInOnScroll } from "./FadeInOnScroll";

export function StatementSection() {
  return (
    <section className="relative flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      <div
        className="absolute top-0 left-0 right-0 h-32 pointer-events-none z-10"
        style={{
          background:
            "linear-gradient(to bottom, rgba(25,25,25,0.6) 0%, transparent 100%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(255,227,190,0.04) 0%, transparent 70%)",
        }}
      />

      <FadeInOnScroll>
        <h2
          className="text-3xl sm:text-4xl lg:text-[52px] font-bold text-white leading-[1.25] tracking-tight max-w-3xl"
          style={{ wordBreak: "keep-all" }}
        >
          팔리는 제품 이미지가
          <br />
          촬영 없이 완성됩니다
        </h2>
      </FadeInOnScroll>

      <FadeInOnScroll delay={0.15}>
        <p
          className="mt-6 text-base sm:text-lg max-w-md"
          style={{ color: "#8b8b99" }}
        >
          썸네일, 상세페이지, 모델컷. 목적에 맞는 이미지를 즉시 뽑아보세요.
        </p>
      </FadeInOnScroll>
    </section>
  );
}
