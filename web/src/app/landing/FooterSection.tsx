import Link from "next/link";
import { Logo } from "@/components/Logo";
import { FadeInOnScroll } from "./FadeInOnScroll";

export function FooterSection() {
  return (
    <>
      {/* FooterCTA */}
      <section
        className="relative overflow-hidden"
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* 배경 */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, #1a0a10 0%, #0d0609 40%, #09090b 100%)",
          }}
        />
        {/* 핑크 glow — top-center 더 풍부하게 */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(255,164,198,0.18) 0%, transparent 65%), radial-gradient(ellipse 40% 35% at 20% 80%, rgba(255,164,198,0.05) 0%, transparent 55%)",
          }}
        />

        {/* 콘텐츠 */}
        <div className="relative z-10 text-center px-6">
          <FadeInOnScroll>
            <h2
              className="font-headline text-[52px] sm:text-[64px] lg:text-[80px] font-extrabold leading-[1.04] tracking-[-0.02em]"
              style={{
                wordBreak: "keep-all",
                background:
                  "linear-gradient(135deg, #ffffff 0%, rgba(255,164,198,0.9) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              제품 이미지,
              <br />
              오늘부터 달라집니다
            </h2>
          </FadeInOnScroll>

          <FadeInOnScroll delay={0.15}>
            <Link
              href="/signup"
              className="mt-12 inline-flex items-center gap-3 text-base font-bold transition-all duration-300 hover:scale-[1.03] hover:opacity-95 active:scale-[0.97]"
              style={{
                paddingLeft: "28px",
                paddingRight: "12px",
                paddingTop: "12px",
                paddingBottom: "12px",
                borderRadius: "9999px",
                background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                color: "#000",
                boxShadow: "0 8px 36px rgba(255,164,198,0.42)",
              }}
            >
              지금 시작하기
              <span
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "9999px",
                  background: "rgba(0,0,0,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                →
              </span>
            </Link>
          </FadeInOnScroll>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop:
            "1px solid transparent",
          backgroundImage:
            "linear-gradient(#09090b, #09090b), linear-gradient(to right, transparent, rgba(255,164,198,0.15), transparent)",
          backgroundOrigin: "border-box",
          backgroundClip: "padding-box, border-box",
        }}
        className="px-6 py-10"
      >
        <div className="mx-auto max-w-[960px] space-y-6">
          {/* 상단 행: 로고 + 링크 + 카피라이트 */}
          <div className="flex flex-col items-center justify-between gap-5 sm:flex-row">
            <Logo width={100} height={24} />
            <div className="flex items-center gap-7 text-xs">
              <Link
                href="/terms"
                className="text-zinc-500 transition-colors duration-200 hover:text-zinc-300"
              >
                이용약관
              </Link>
              <Link
                href="/privacy"
                className="text-zinc-500 transition-colors duration-200 hover:text-zinc-300"
              >
                개인정보처리방침
              </Link>
              <Link
                href="/pricing"
                className="text-zinc-500 transition-colors duration-200 hover:text-zinc-300"
              >
                요금제
              </Link>
            </div>
            <span className="text-xs text-zinc-600">
              © 2026 Zeriv. All rights reserved.
            </span>
          </div>

          {/* 사업자 정보 */}
          <div
            className="text-[11px] leading-relaxed text-zinc-600"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.04)",
              paddingTop: "16px",
            }}
          >
            <p>
              상호: 예시 사업자 &nbsp;|&nbsp; 대표자: 예시 대표자 &nbsp;|&nbsp;
              사업자등록번호: 000-00-00000
            </p>
            <p className="mt-1">
              사업장소재지: 예시 사업장 주소
            </p>
            <p className="mt-1">
              이메일: support@example.com &nbsp;|&nbsp; 전화: 000-0000-0000
            </p>
            <p className="mt-1">
              통신판매업 신고번호: 예시 신고번호 &nbsp;|&nbsp;{" "}
              <a
                href="https://www.ftc.go.kr/bizCommPop.do?wrkr_no=0000000000"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors duration-200 hover:text-zinc-300"
                style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px" }}
              >
                사업자정보확인
              </a>
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
