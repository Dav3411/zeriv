"use client";

/**
 * `/quick` (legacy public 경로) → 새 진입점으로 redirect 만 수행.
 *
 * 동작:
 *   - 로그인 + 브랜드 보유 → `/{lastBrand}/quick` (?resume= 보존)
 *   - 로그인 + 브랜드 없음 → `/onboarding?next=/quick`
 *   - 비로그인              → `/guest/quick` (?resume= 보존)
 *
 * 본 페이지는 더 이상 UI 를 렌더하지 않는다. 게스트 UI 는 `/guest/quick`,
 * 워크스페이스 UI 는 `/{brandId}/quick` 에 일원화되었으며, 본 경로는 기존 북마크와
 * SEO 호환을 위해 유지된다. middleware 가 본 경로를 public 으로 통과시킨다.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { getLastBrandId } from "@/components/BrandProvider";

function LoadingShell() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--surface-0, #191919)" }}
    >
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-pink-300 border-t-transparent" />
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
          QUICK 모드로 이동 중...
        </p>
      </div>
    </div>
  );
}

function QuickLegacyRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();

  const resumeFlag = searchParams?.get("resume") === "1";
  const suffix = resumeFlag ? "?resume=1" : "";

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace(`/guest/quick${suffix}`);
      return;
    }

    let cancelled = false;
    void fetchWithAuth("/api/brands")
      .then((res) => (res.ok ? res.json() : []))
      .then((brands: { id: string }[]) => {
        if (cancelled) return;
        if (!Array.isArray(brands) || brands.length === 0) {
          // 온보딩에는 next 를 그대로 전달해 게스트 작업 상태(sessionStorage) 가
          // 가입·온보딩 완료 후에도 워크스페이스에서 자동 복원되도록 한다.
          router.replace(
            `/onboarding?next=${encodeURIComponent(`/quick${suffix}`)}`,
          );
          return;
        }
        const lastId = getLastBrandId(user.id);
        const ids = new Set(brands.map((b) => b.id));
        const target = lastId && ids.has(lastId) ? lastId : brands[0].id;
        router.replace(`/${target}/quick${suffix}`);
      })
      .catch(() => {
        if (cancelled) return;
        // 네트워크 실패 시 게스트 경로로 fallback — 사용자가 작업을 잃지 않도록.
        router.replace(`/guest/quick${suffix}`);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user, router, fetchWithAuth, suffix]);

  return <LoadingShell />;
}

export default function QuickLegacyRedirect() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <QuickLegacyRedirectInner />
    </Suspense>
  );
}
