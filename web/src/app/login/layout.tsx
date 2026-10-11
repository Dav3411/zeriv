"use client";

/**
 * 로그인 페이지 전용 레이아웃 — 라이트 테마 하드코딩.
 *
 * next-themes 의 사용자 토글 값과 무관하게 진입 시 <html> 에 'light' 클래스를
 * 주입하고 'dark' 를 제거한다. 페이지 이탈 시 복원하지 않으므로 사용자가
 * 다크를 원하면 다른 페이지에서 직접 토글해야 한다 (의도된 동작).
 *
 * localStorage 의 zeriv-theme 값까지 덮어써 next-themes 가 다음 마운트에서
 * 다시 다크로 돌리는 것을 방지한다.
 */

import { useEffect, type ReactNode } from "react";

export default function LoginLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove("dark");
    html.classList.add("light");
    html.style.colorScheme = "light";
    try {
      window.localStorage.setItem("zeriv-theme", "light");
    } catch {
      // sessionStorage 가 막힌 환경 — 조용히 무시.
    }
  }, []);

  return <>{children}</>;
}
