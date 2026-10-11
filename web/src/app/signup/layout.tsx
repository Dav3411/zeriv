"use client";

/**
 * 회원가입 페이지 전용 레이아웃 — 라이트 테마 하드코딩.
 * 동작은 login/layout.tsx 와 동일.
 */

import { useEffect, type ReactNode } from "react";

export default function SignupLayout({ children }: { children: ReactNode }) {
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
