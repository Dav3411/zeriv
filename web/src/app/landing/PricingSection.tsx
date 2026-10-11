"use client";

import Link from "next/link";
import { FadeInOnScroll } from "./FadeInOnScroll";

type Plan = {
  id: string;
  name: string;
  price: number | null;
  pricePrefix?: string;
  desc: string;
  featured: boolean;
};

const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    desc: "이미지 5장/월 · 브랜드 1개 · 팀원 1명",
    featured: false,
  },
  {
    id: "quick_plus",
    name: "Quick Plus",
    price: 9900,
    desc: "1인 셀러 추천 · 스타일 1개 · 이미지 50장/월",
    featured: true,
  },
  {
    id: "starter",
    name: "Atelier",
    price: 29000,
    desc: "스타일 5개 · 모델 2명 · 이미지 200장/월 · 브랜드 4개 · 팀원 3명",
    featured: false,
  },
] as const;

export function PricingSection() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ padding: "160px 0", background: "var(--surface-1)" }}
    >
      {/* 배경 radial glow — top-center */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% 0%, rgba(255,164,198,0.07) 0%, transparent 65%)",
        }}
      />

      <div className="relative mx-auto max-w-[960px] px-6">
        <FadeInOnScroll>
          <p
            className="text-[11px] font-bold tracking-[0.18em] uppercase mb-5"
            style={{ color: "rgba(255,164,198,0.65)" }}
          >
            Pricing
          </p>
          <h2
            className="font-headline text-[36px] sm:text-[44px] lg:text-[52px] font-extrabold text-white leading-[1.06] tracking-[-0.02em]"
            style={{ wordBreak: "keep-all" }}
          >
            팀에 맞는 플랜을 선택하세요
          </h2>
          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: "rgba(255,255,255,0.62)" }}
          >
            Free 플랜으로 무료 체험 가능. 언제든 업그레이드하거나 취소할 수
            있습니다.
          </p>
        </FadeInOnScroll>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 max-w-3xl mx-auto">
          {PLANS.map((plan, i) => (
            <FadeInOnScroll key={plan.id} delay={i * 0.07}>
              <div
                className="relative rounded-3xl p-6 flex flex-col h-full transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: plan.featured
                    ? "rgba(255,164,198,0.04)"
                    : "var(--surface-0)",
                  border: plan.featured
                    ? "1px solid rgba(255,164,198,0.32)"
                    : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: plan.featured
                    ? "0 8px 32px rgba(255,164,198,0.10), 0 0 0 1px rgba(255,164,198,0.10)"
                    : "0 4px 16px rgba(0,0,0,0.3)",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  if (plan.featured) {
                    el.style.boxShadow =
                      "0 16px 48px rgba(255,164,198,0.16), 0 0 0 1px rgba(255,164,198,0.22)";
                  } else {
                    el.style.boxShadow =
                      "0 12px 36px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.08)";
                  }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  if (plan.featured) {
                    el.style.boxShadow =
                      "0 8px 32px rgba(255,164,198,0.10), 0 0 0 1px rgba(255,164,198,0.10)";
                  } else {
                    el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)";
                  }
                }}
              >
                {/* 추천 플랜 ribbon */}
                {plan.featured && (
                  <div
                    className="absolute -top-px left-1/2 -translate-x-1/2"
                    style={{
                      padding: "4px 14px",
                      borderRadius: "0 0 10px 10px",
                      background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#000",
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    추천
                  </div>
                )}

                <h3
                  className="text-[11px] uppercase tracking-[0.14em] font-bold"
                  style={{ color: "rgba(255,255,255,0.6)" }}
                >
                  {plan.name}
                </h3>

                <div className="mt-3">
                  <span
                    className="text-[10px] mb-1 block"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    {plan.pricePrefix ?? " "}
                  </span>
                  <div className="flex items-end gap-1">
                    {plan.price === null ? (
                      <span
                        className="font-headline font-black text-white leading-none"
                        style={{ fontSize: "28px", letterSpacing: "-0.02em" }}
                      >
                        별도 문의
                      </span>
                    ) : (
                      <>
                        <span
                          className="font-headline font-black text-white leading-none"
                          style={{ fontSize: "34px", letterSpacing: "-0.03em" }}
                        >
                          {plan.price.toLocaleString("ko-KR")}
                        </span>
                        <span
                          className="text-sm mb-0.5"
                          style={{ color: "rgba(255,255,255,0.5)" }}
                        >
                          원/월
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <ul
                  className="mt-4 text-xs leading-relaxed space-y-1.5"
                  style={{
                    color: "rgba(255,255,255,0.52)",
                    wordBreak: "keep-all",
                  }}
                >
                  {plan.desc.split(" · ").map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span
                        className="mt-0.5 w-1 h-1 rounded-full flex-shrink-0"
                        style={{
                          background: plan.featured
                            ? "rgba(255,164,198,0.6)"
                            : "rgba(255,255,255,0.3)",
                          marginTop: "5px",
                        }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeInOnScroll>
          ))}
        </div>

        <FadeInOnScroll delay={0.3}>
          <div className="mt-10 text-center">
            <Link
              href="/pricing"
              className="text-sm font-medium transition-all duration-200 hover:opacity-70"
              style={{ color: "var(--brand-from)" }}
            >
              플랜 자세히 보기 →
            </Link>
          </div>
        </FadeInOnScroll>
      </div>
    </section>
  );
}
