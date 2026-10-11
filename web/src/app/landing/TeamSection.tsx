"use client";
import { useEffect, useRef, useState } from "react";
import { FadeInOnScroll } from "./FadeInOnScroll";

export function TeamSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // 섹션 하단이 뷰포트에 진입하는 순간부터 시작
      // rect.top: 섹션 상단이 뷰포트 상단 기준 위치
      // 섹션이 뷰포트에 들어올수록 rect.top이 작아짐
      const progress = 1 - rect.top / window.innerHeight;
      const opacity = Math.max(0, Math.min(0.55, progress * 0.9));
      setOverlayOpacity(opacity);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // 초기값
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden"
      style={{ minHeight: "80vh", background: "#09090b" }}
    >
      <img
        src="/landing/team.png"
        alt="팀 워크플로우"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: "center 20%" }}
      />

      {/* 스크롤 연동 오버레이 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(9,9,11,1) 0%, rgba(9,9,11,0.6) 30%, rgba(9,9,11,0.0) 70%)",
          opacity: overlayOpacity,
          transition: "opacity 0.1s linear",
        }}
      />

      <div className="absolute inset-0 flex items-end px-8 sm:px-12 lg:px-20 pb-16 sm:pb-20 lg:pb-24">
        <FadeInOnScroll>
          <div className="max-w-2xl">
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "rgba(255,164,198,0.5)",
                marginBottom: 16,
              }}
            >
              TEAM WORKFLOW
            </p>
            <h2
              className="text-[40px] sm:text-[52px] lg:text-[64px] font-bold text-white leading-[1.1] tracking-tight whitespace-pre-line"
              style={{
                wordBreak: "keep-all",
                textShadow: "0 2px 24px rgba(0,0,0,0.7)",
              }}
            >
              {"팀이 함께 만드는\n일관된 브랜드"}
            </h2>
            <p
              className="mt-4 text-base sm:text-lg leading-relaxed max-w-sm"
              style={{
                color: "rgba(255,255,255,0.65)",
                textShadow: "0 1px 12px rgba(0,0,0,0.5)",
              }}
            >
              생성된 에셋을 팀원과 공유하세요.
            </p>
          </div>
        </FadeInOnScroll>
      </div>
    </section>
  );
}
