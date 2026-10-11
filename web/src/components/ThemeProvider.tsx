"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * 앱 전역 테마 프로바이더.
 * - attribute="class" → <html class="light|dark"> 형태로 토글
 * - defaultTheme="light" → 초기 방문자(저장된 선택 없음)는 항상 라이트로 시작.
 *   비로그인 사용자의 OS 다크모드 설정에 따라 explore 등 공개 페이지가
 *   다크로 보이던 동작을 막기 위함. 사용자가 설정에서 다크/시스템을 선택하면
 *   그 값이 localStorage("zeriv-theme")에 저장되어 다음 방문부터 적용됨.
 * - enableSystem=true → "시스템" 옵션 자체는 유지 (사용자가 명시적으로 선택 가능)
 * - storageKey="zeriv-theme" → localStorage에 저장되는 키
 *
 * disableTransitionOnChange 는 전환 시 번쩍임을 줄이기 위해 활성화한다.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={true}
      storageKey="zeriv-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
