"use client";

import { Suspense, use, useEffect, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import {
  BrandProvider,
  BrandGuard,
  isGuestBrandRef,
  getLastBrandId,
} from "@/components/BrandProvider";
import { GenerationToast } from "@/components/GenerationToast";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuth } from "@/components/AuthProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { safeNext } from "@/lib/safeNext";
import { GuestWorkspaceLayout } from "./_components/GuestWorkspaceLayout";

export default function BrandWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ brandName: string }>;
}) {
  const { brandName: brandId } = use(params);
  const isGuestRoute = isGuestBrandRef(brandId);

  // 게스트 라우트는 별도 셸로 분기 — useRequireAuth/SiteHeader/BrandGuard 모두 우회.
  // 컴포넌트 트리 자체를 다르게 렌더하므로 두 경로의 훅 호출 순서가 일관되어야
  // React Hook rules 에 안전하다 → 본 컴포넌트는 항상 동일한 훅 시퀀스를 호출.
  if (isGuestRoute) {
    // GuestWorkspaceLayoutWrapper 는 useSearchParams() 를 사용하므로 Next.js
    // App Router 의 CSR bailout 규칙상 Suspense 경계가 필요하다. signup/page
    // 의 동일 패턴을 따른다 — fallback 은 게스트 셸과 시각 충돌이 없는 빈
    // 컨테이너 (배경만 유지) 로 둬서, 라우트 전환 시 깜빡임을 최소화한다.
    return (
      <Suspense
        fallback={
          <div
            className="h-dvh flex flex-col"
            style={{ background: "var(--surface-0)" }}
          />
        }
      >
        <GuestWorkspaceLayoutWrapper>{children}</GuestWorkspaceLayoutWrapper>
      </Suspense>
    );
  }

  return (
    <AuthenticatedBrandLayout brandId={brandId}>
      {children}
    </AuthenticatedBrandLayout>
  );
}

/**
 * 로그인 사용자가 `/guest/*` 에 직접 들어오면 본인 last brand 또는 첫 brand 로
 * redirect 한다. 비로그인이면 게스트 UI 를 그대로 보여준다.
 *
 * redirect 는 `useEffect` 안에서 비동기로 수행되며, 그 동안 게스트 셸이
 * 잠시 노출될 수 있다 — 이는 워크스페이스 quick/studio 의 기존 redirecting 분기와
 * 동일한 UX 트레이드오프이며, 깜빡임을 피하려면 별도 LoadingShell 이 필요하지만
 * 게스트 UI 가 즉시 가능한 작업이므로 그대로 노출하는 편이 빠르다.
 *
 * **쿼리스트링 보존**: `usePathname()` 은 path 만, `useSearchParams()` 는
 * search 만 반환한다. 두 값을 합쳐 redirect target 을 만들어야 게스트
 * 작업물(예: `/guest/quick?resume=1` 의 IndexedDB resume 토큰) 이
 * 가입·로그인 후에도 살아남는다. 이를 빼먹으면 사용자가 업로드한 이미지가
 * 영구 소실된다.
 */
function GuestWorkspaceLayoutWrapper({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();

  useEffect(() => {
    if (loading || !user) return;

    // 로그인 사용자가 게스트 라우트에 도달 — 본인 brand 로 redirect.
    let cancelled = false;

    // 비정상 입력(`/guest//quick` 같은 다중 슬래시) 을 방어적으로 정규화.
    // Next.js 가 결과적으로 정규화해 주긴 하지만, replace 결과가 `/{target}//quick`
    // 처럼 깨지지 않도록 정규식 적용 전에 슬래시를 단일화한다.
    const rawPath = pathname ?? "/guest/quick";
    const normalizedPath = rawPath.replace(/\/{2,}/g, "/");
    const qs = searchParams?.toString() ?? "";
    const search = qs ? `?${qs}` : "";

    void fetchWithAuth("/api/brands")
      .then((res) => (res.ok ? res.json() : []))
      .then((brands: { id: string }[]) => {
        if (cancelled) return;
        if (!Array.isArray(brands) || brands.length === 0) {
          // brand 없음 — 온보딩으로. next 보존해 게스트 작업이 살아남도록.
          // path + search 를 묶어 safeNext 로 1 차 검증한 뒤 인코딩.
          // safeNext 는 same-origin root-relative 만 허용하므로 open-redirect
          // (CWE-601) 위험 없음.
          const candidate = `${normalizedPath}${search}` || "/guest/quick";
          const validated = safeNext(candidate) || "/guest/quick";
          const next = encodeURIComponent(validated);
          router.replace(`/onboarding?next=${next}`);
          return;
        }
        const lastId = getLastBrandId(user.id);
        const ids = new Set(brands.map((b) => b.id));
        const target = lastId && ids.has(lastId) ? lastId : brands[0].id;

        // pathname 첫 segment `/guest` 만 `/{target}` 으로 치환, 나머지 보존.
        // 예: `/guest/quick?resume=1` → `/{target}/quick?resume=1`
        const replacedPath = normalizedPath.replace(
          /^\/guest(\/|$)/,
          `/${target}$1`,
        );
        router.replace(`${replacedPath}${search}`);
      })
      .catch(() => {
        // 네트워크 실패 — 사용자를 게스트 UI 에 머무르게 두는 게 안전.
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user, router, fetchWithAuth, pathname, searchParams]);

  // /guest/studio 는 사진 스튜디오 메타포 배경(시클로라마 + 상단 스포트라이트).
  // 그 외(/guest/quick 등)는 핑크 글로우 그라디언트.
  const variant: "glow" | "plain" | "dark" | "studio" = pathname?.startsWith(
    "/guest/studio",
  )
    ? "studio"
    : "glow";

  return (
    <GuestWorkspaceLayout variant={variant}>{children}</GuestWorkspaceLayout>
  );
}

/**
 * 기존(인증) 워크스페이스 레이아웃. 동작·시각은 변경 전과 동일.
 */
function AuthenticatedBrandLayout({
  brandId,
  children,
}: {
  brandId: string;
  children: ReactNode;
}) {
  useRequireAuth();

  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, []);

  return (
    <BrandProvider brandId={brandId}>
      <div
        className="h-dvh flex flex-col overflow-hidden"
        style={{ background: "var(--surface-0)" }}
      >
        <SiteHeader />
        <BrandGuard>
          <main className="flex flex-col flex-1 min-h-0 overflow-hidden pt-11 lg:pl-[var(--sidebar-active-w,var(--sidebar-w-collapsed))] transition-[padding-left] duration-200">
            {children}
          </main>
        </BrandGuard>
      </div>
      <GenerationToast />
    </BrandProvider>
  );
}
