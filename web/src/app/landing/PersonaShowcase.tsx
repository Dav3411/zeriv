"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { FadeInOnScroll } from "./FadeInOnScroll";

type TemplateItem = {
  id: string;
  name: string;
  category: string | null;
  key_visual_url: string | null;
  example_images: string[];
  mood_keywords: string[];
};

type ShowcaseImage = {
  src: string;
  category: string;
  alt: string;
};

function MarqueeRow({
  images,
  direction,
}: {
  images: ShowcaseImage[];
  direction: "left" | "right";
}) {
  // seamless loop을 위해 3배 복제
  const items = [...images, ...images, ...images];
  return (
    <div className="overflow-hidden h-[160px] sm:h-[200px] lg:h-[260px]">
      <div
        className={`flex gap-[3px] h-full ${direction === "left" ? "animate-marquee-left" : "animate-marquee-right"}`}
      >
        {items.map((img, i) => (
          <img
            key={`${img.src}-${i}`}
            src={img.src}
            alt={img.alt}
            className="h-full w-auto block flex-shrink-0 transition-transform duration-300 hover:scale-[1.02]"
            loading="eager"
          />
        ))}
      </div>
    </div>
  );
}

const staticFallback: ShowcaseImage[] = [
  { src: "/landing/showcase-1.png", category: "", alt: "ZERIV 예시 이미지" },
  { src: "/landing/showcase-2.png", category: "", alt: "ZERIV 예시 이미지" },
  { src: "/landing/showcase-3.png", category: "", alt: "ZERIV 예시 이미지" },
  { src: "/landing/showcase-4.png", category: "", alt: "ZERIV 예시 이미지" },
  { src: "/landing/showcase-5.png", category: "", alt: "ZERIV 예시 이미지" },
  { src: "/landing/showcase-6.png", category: "", alt: "ZERIV 예시 이미지" },
];

export function ModelShowcase() {
  const [images, setImages] = useState<ShowcaseImage[]>(staticFallback);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        const templates: TemplateItem[] = data.templates ?? [];
        const result: ShowcaseImage[] = [];
        const seen = new Set<string>();
        for (const t of templates) {
          const category = t.category ?? "기타";
          for (const src of t.example_images) {
            if (src && !seen.has(src)) {
              seen.add(src);
              result.push({ src, category, alt: t.name });
            }
          }
          if (t.key_visual_url && !seen.has(t.key_visual_url)) {
            seen.add(t.key_visual_url);
            result.push({ src: t.key_visual_url, category, alt: t.name });
          }
        }
        if (result.length > 0) setImages(result);
      })
      .catch(() => {
        /* fallback 유지 */
      })
      .finally(() => setLoading(false));
  }, []);

  // 인덱스 나머지로 3줄 균등 분배
  const rows = [0, 1, 2].map((rowIndex) =>
    images.filter((_, i) => i % 3 === rowIndex),
  );

  if (!loading && images.length === 0) return null;

  return (
    <section
      className="relative overflow-hidden"
      style={{ background: "#09090b", paddingTop: "160px", paddingBottom: "160px" }}
    >
      {/* 배경 radial glow — top-left */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 15% 20%, rgba(255,164,198,0.06) 0%, transparent 65%)",
        }}
      />

      <div className="relative max-w-[1100px] mx-auto px-6">
        {/* 헤드라인 */}
        <FadeInOnScroll>
          <p
            className="text-[11px] font-bold tracking-[0.18em] uppercase mb-4"
            style={{ color: "rgba(255,164,198,0.65)" }}
          >
            ZERIV에서 만든 이미지
          </p>
          <h2
            className="font-headline text-[44px] sm:text-[54px] lg:text-[68px] font-extrabold text-white leading-[1.04] tracking-[-0.02em]"
            style={{ wordBreak: "keep-all" }}
          >
            이런 이미지를 만들 수 있어요
          </h2>
        </FadeInOnScroll>
      </div>

      {/* 마키 섹션 — max-width 없이 전체 너비 */}
      {loading ? (
        <div className="flex flex-col gap-[3px] mt-12">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[160px] sm:h-[200px] lg:h-[260px] animate-pulse"
              style={{ background: "rgba(255,255,255,0.04)" }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-12 relative overflow-hidden">
          <div className="flex flex-col gap-[3px]">
            <MarqueeRow images={rows[0]} direction="left" />
            <MarqueeRow images={rows[1]} direction="right" />
            <MarqueeRow images={rows[2]} direction="left" />
          </div>
          {/* edge fade overlay */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background:
                "linear-gradient(to right, #09090b 0px, transparent 140px, transparent calc(100% - 140px), #09090b 100%)",
            }}
          />
        </div>
      )}
    </section>
  );
}
