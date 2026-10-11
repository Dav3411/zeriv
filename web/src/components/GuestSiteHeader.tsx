"use client";

import { useState } from "react";

/**
 * GuestSiteHeader — 비로그인 게스트 페이지(`/guest/quick`, `/guest/studio`) 전용
 * 경량 헤더. 일반 `SiteHeader` 는 사이드바·드롭다운·breadcrumb 등 인증·브랜드
 * 컨텍스트에 단단히 묶여있어 prop 분기로 게스트 모드를 끼우면 복잡도가 폭발한다.
 * 본 컴포넌트는 의도적으로 자체 코드 경로를 가지고, 디자인 토큰·로고만 공유한다.
 *
 * 레이아웃 결정:
 *   - 데스크톱: 워크스페이스의 fixed breadcrumb 바(h-11)와 같은 높이로 유지해
 *     게스트→가입→워크스페이스 전이가 점프 없이 자연스럽게 이어진다.
 *   - 모바일: 같은 h-11 sticky top, 가운데 정렬 로고 + 우측 액션 버튼 2개.
 *   - 사이드바는 없음. 게스트는 브랜드 컨텍스트가 없기 때문.
 *
 * 액션:
 *   - "로그인": `/login` (next 없음 — 로그인 후 본인 브랜드로 가는 게 자연스럽다.
 *               게스트 작업 상태는 sessionStorage 에 별도 보존되므로 데이터는 살아남는다.)
 *   - "무료로 시작": `/signup` — 동일 정책.
 *   - 로고 클릭: `/` (랜딩).
 *
 * 게스트 페이지 자체에서 SiteHeader 의 GenerationToast·BrandGuard 등은 렌더하지
 * 않으므로 본 헤더에도 추가 위젯이 없다.
 */

import Link from "next/link";
import { Logo } from "@/components/Logo";

export function GuestSiteHeader() {
  const [isCtaHover, setIsCtaHover] = useState(false);
  return (
    <header
      className="fixed top-0 left-0 right-0 h-[60px] z-40 flex items-center justify-between px-7 breadcrumb-bar"
      style={{
        // 셸(#F7F4ED)과 동일 hex의 92% 불투명도 — 셸·헤더·CTA 바 세 레이어 베이지 통일.
        background: "rgba(247,244,237,0.92)",
        borderBottom: "1px solid var(--border-subtle)",
        backdropFilter: "blur(10px)",
        boxShadow:
          "0 1px 2px rgba(20,16,24,0.04), 0 8px 24px -12px rgba(20,16,24,0.08)",
      }}
    >
      <Link
        href="/"
        className="flex items-center"
        aria-label="홈으로"
      >
        <Logo width={112} height={28} />
      </Link>

      <nav className="flex items-center gap-2">
        <Link
          href="/login"
          className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors hover:text-[color:var(--text-primary)]"
          style={{
            color: "var(--text-secondary)",
          }}
        >
          로그인
        </Link>
        <Link
          href="/signup"
          className="rounded-full font-semibold transition-all hover:-translate-y-px"
          style={{
            background: "var(--brand-gradient)",
            color: "#1A1A22",
            fontSize: 14,
            fontWeight: 700,
            padding: "10px 18px",
            boxShadow: isCtaHover
              ? "inset 0 1px 0 rgba(255,255,255,0.6), 0 6px 14px -4px rgba(255,164,198,0.45)"
              : "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(255,164,198,0.25)",
          }}
          onMouseEnter={() => setIsCtaHover(true)}
          onMouseLeave={() => setIsCtaHover(false)}
        >
          무료로 시작
        </Link>
      </nav>
    </header>
  );
}
