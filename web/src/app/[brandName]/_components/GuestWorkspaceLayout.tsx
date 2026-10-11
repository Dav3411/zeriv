"use client";

/**
 * GuestWorkspaceLayout — `/guest/quick`, `/guest/studio` 진입 시의 셸.
 *
 * 일반 워크스페이스(`[brandName]/layout.tsx`)와의 차이:
 *   - useRequireAuth 호출 없음 → 비로그인도 그대로 진입
 *   - 사이드바 없음 → padding-left offset 없음
 *   - SiteHeader 대신 경량 GuestSiteHeader
 *   - GenerationToast 미렌더 (게스트는 생성 잡을 만들지 않음)
 *   - BrandProvider 는 게스트 분기로 in-memory 더미 brand 주입 (fetch 안 함)
 *
 * 본 컴포넌트는 layout 의 자식 트리만 감싸므로 page.tsx 가 직접 게스트 분기를
 * 처리해야 한다 (workspace quick/studio page 가 useBrand().isGuest 로 분기).
 *
 * variant:
 *   - "glow" (기본): 베이지 + 3개 코너 핑크 원 그라디언트
 *   - "plain": 베이지 단색 (#F7F4ED). 이미지·콘텐츠가 많은 페이지에서 배경
 *     산만함을 줄이기 위해 사용.
 *   - "dark": 다크 테마 배경(#191919).
 *   - "studio": 사진 스튜디오 메타포. 시클로라마 vertical 그라디언트 + 상단
 *     스포트라이트 radial. 카드들이 무대 조명을 받은 듯한 공간감.
 */

import { useEffect, type ReactNode } from "react";
import { BrandProvider } from "@/components/BrandProvider";
import { GuestSiteHeader } from "@/components/GuestSiteHeader";

const GLOW_BACKGROUND = [
  "radial-gradient(circle at 18% 20%, rgba(255,164,198,0.24) 0%, transparent 26%)",
  "radial-gradient(circle at 80% 15%, rgba(255,200,215,0.22) 0%, transparent 24%)",
  "radial-gradient(circle at 85% 80%, rgba(255,180,205,0.25) 0%, transparent 28%)",
  "#F7F4ED",
].join(", ");

const PLAIN_BACKGROUND = "#F7F4ED";

const DARK_BACKGROUND = "#191919";

// 스튜디오: 상단 키라이트(따뜻한 화이트) + 시클로라마(위 어둡고 아래 밝은) 그라디언트.
// 첫 레이어가 위에 올라가므로 spotlight 가 먼저, 그라디언트는 뒤에.
const STUDIO_BACKGROUND = [
  "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,240,220,0.45) 0%, transparent 60%)",
  "linear-gradient(180deg, #EDE8DC 0%, #F7F4ED 45%, #F7F4ED 100%)",
].join(", ");

export function GuestWorkspaceLayout({
  children,
  variant = "glow",
}: {
  children: ReactNode;
  variant?: "glow" | "plain" | "dark" | "studio";
}) {
  // 일반 워크스페이스와 동일하게 html overflow:hidden 적용해 layout shift 방지.
  // 셸은 h-dvh + flex 컬럼으로 main 만 스크롤하게 한다.
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  return (
    <BrandProvider brandId="guest">
      <div
        className="h-dvh flex flex-col overflow-hidden"
        data-theme="guest-light"
        style={{
          background:
            variant === "studio"
              ? STUDIO_BACKGROUND
              : variant === "dark"
                ? DARK_BACKGROUND
                : variant === "plain"
                  ? PLAIN_BACKGROUND
                  : GLOW_BACKGROUND,
          // 게스트 라이트 전용 스피너 색상 토큰 — 다크 모드는 fallback #ffa4c6 유지.
          ["--quick-spinner" as string]: "#C25A7E",
          // 게스트는 Mobile Bottom Nav 가 없어 BulkActionBar 가 화면 바닥에 거의 붙는다.
          // 회색 띠를 완전히 숨기기 위해 리스트 컨테이너 하단 padding 을 0 으로.
          ["--quick-bar-h" as string]: "0px",
        }}
      >
        <GuestSiteHeader />
        {/* 게스트 페이지는 콘텐츠량이 적어 페이지 전체 스크롤 허용.
            푸터가 자연스럽게 콘텐츠 아래에 배치되도록 main 을 스크롤 가능하게 둔다. */}
        <main className="flex flex-col flex-1 min-h-0 overflow-y-auto pt-[60px]">
          {children}
        </main>
      </div>
    </BrandProvider>
  );
}
