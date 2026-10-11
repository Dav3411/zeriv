"use client";

import { FadeInOnScroll } from "./FadeInOnScroll";

const TOOLS = [
  { label: "이미지 생성", desc: "의상 합성 · 장면 생성 · 제품 촬영 · 광고 촬영" },
  { label: "영상 생성", desc: "걷기 · 말하기 · 런웨이 · 제품 쇼케이스" },
  { label: "씬 렌더", desc: "광고 템플릿 · 배경 · 조명 · 카피 자동 구성" },
  { label: "숏폼 생성", desc: "Hook · 제품 · 베네핏 · CTA 씬 자동 편집" },
];

export function SocialSection() {
  return (
    <section className="relative flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(255,164,198,0.04) 0%, transparent 70%)" }} />

      <FadeInOnScroll>
        <h2
          className="text-3xl sm:text-4xl lg:text-[52px] font-bold text-white leading-[1.25] tracking-tight"
          style={{ wordBreak: "keep-all" }}
        >
          콘텐츠 제작의<br />모든 도구가 여기에
        </h2>
      </FadeInOnScroll>

      <FadeInOnScroll delay={0.15}>
        <div className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl w-full">
          {TOOLS.map((tool, i) => (
            <div
              key={tool.label}
              className="rounded-2xl p-5 text-left"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
            >
              <p className="text-sm font-bold text-white">{tool.label}</p>
              <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{tool.desc}</p>
            </div>
          ))}
        </div>
      </FadeInOnScroll>
    </section>
  );
}
