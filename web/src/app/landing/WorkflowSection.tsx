"use client";

import { FadeInOnScroll } from "./FadeInOnScroll";

const CARDS = [
  {
    title: "브랜드 스타일",
    desc: "등록한 레퍼런스와 설정을 저장합니다. 다음 작업에서 다시 설정할 필요가 없습니다.",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
  },
  {
    title: "제품 관리",
    desc: "제품 이미지를 등록해두면 언제든 꺼내 쓸 수 있습니다. 신제품도 바로 추가하면 됩니다.",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    ),
  },
  {
    title: "생성 이미지",
    desc: "만든 이미지를 모아두고 언제든 다시 활용하세요. 스타일별로 결과물을 한눈에 볼 수 있습니다.",
    icon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
];

export function WorkflowSection() {
  return (
    <section style={{ padding: "160px 0" }}>
      <div className="mx-auto max-w-[960px] px-6">
        <FadeInOnScroll>
          <p
            className="text-sm font-bold tracking-widest uppercase mb-5"
            style={{ color: "var(--brand-from)" }}
          >
            Brand Workspace
          </p>
          <h2
            className="text-3xl sm:text-4xl lg:text-[44px] font-bold text-white leading-tight"
            style={{ wordBreak: "keep-all" }}
          >
            모든 콘텐츠를
            <br />
            브랜드 단위로 관리하세요
          </h2>
          <p
            className="mt-5 text-sm sm:text-base max-w-lg"
            style={{ color: "#8b8b99" }}
          >
            모델, 제품, 캠페인, 에셋이 하나의 브랜드 워크스페이스 아래에
            체계적으로 정리됩니다.
          </p>
        </FadeInOnScroll>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {CARDS.map((card, i) => (
            <FadeInOnScroll key={card.title} delay={i * 0.1}>
              <div
                className="rounded-2xl p-7 h-full"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{
                    background: "rgba(255,164,198,0.08)",
                    color: "#ffa4c6",
                  }}
                >
                  {card.icon}
                </div>
                <h3 className="text-base font-bold text-white">{card.title}</h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "#8b8b99" }}
                >
                  {card.desc}
                </p>
              </div>
            </FadeInOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
