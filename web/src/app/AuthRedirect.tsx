"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { useRouter } from "next/navigation";
import { getLastBrandId } from "@/components/BrandProvider";

/**
 * 로그인 직후에만 워크스페이스/온보딩으로 자동 redirect.
 *
 * 동작 조건: sessionStorage 의 `zeriv-just-logged-in` flag 가 "1" 일 때만 동작.
 * - login/signup 성공 시 login/page.tsx 가 flag 설정 → "/" 로 이동 → 여기서 redirect
 * - 그 외 (로그인 상태에서 logo 클릭, 외부에서 / URL 공유 등) → 랜딩 페이지 그대로 노출
 *
 * 로딩 중에는 빈 다크 화면을 렌더해 테마 깜빡임을 방지하고,
 * 비로그인 방문자에게는 children(LandingPage) 을 그대로 노출한다.
 *
 * 이 design 은 LandingNav 의 "대시보드" 링크 (로그인 사용자용) 와 일관된다.
 */
const JUST_LOGGED_IN_KEY = "zeriv-just-logged-in";

export function AuthRedirect({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();
  const router = useRouter();
  // just-logged-in flag 발견 시에만 true — 그동안 빈 다크 화면을 노출하여 깜빡임 방지.
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (typeof window === "undefined") return;

    // 로그인 직후 1회만 redirect — 그 외는 랜딩 그대로
    const justLoggedIn = sessionStorage.getItem(JUST_LOGGED_IN_KEY) === "1";
    if (!justLoggedIn) return;
    sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
    setRedirecting(true);

    void fetchWithAuth("/api/brands")
      .then((res) => res.json())
      .then((brands: { id: string }[]) => {
        if (!brands || brands.length === 0) {
          router.replace("/onboarding");
          return;
        }
        const lastId = getLastBrandId(user.id);
        const brandIds = new Set(brands.map((b) => b.id));
        const target = lastId && brandIds.has(lastId) ? lastId : brands[0].id;
        // 로그인 직후 사용자는 즉시 작업 시작 가능하도록 퀵 썸네일 생성 페이지로.
        // 대시보드 우선이었던 이전 동작 대비 conversion funnel 단축.
        router.replace(`/${target}/quick`);
      })
      .catch(() => router.replace("/onboarding"));
  }, [loading, user, router, fetchWithAuth]);

  // 로딩 중 또는 로그인 직후 redirect 진행 중일 때만 빈 다크 화면.
  // 그 외 로그인 사용자도 랜딩 페이지 노출 (LandingNav 의 로그아웃·대시보드 버튼 사용).
  if (loading || redirecting) {
    return (
      <div
        className="landing-dark"
        style={{
          minHeight: "100vh",
          background: "var(--surface-0)",
        }}
      />
    );
  }

  return <>{children}</>;
}
