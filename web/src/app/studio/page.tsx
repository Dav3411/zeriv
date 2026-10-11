"use client";

/**
 * `/studio` (legacy public 경로) → 새 진입점으로 redirect 만 수행.
 *
 * 동작:
 *   - 로그인 + 브랜드 보유 → `/{lastBrand}/studio`
 *   - 로그인 + 브랜드 없음 → `/onboarding?next=/studio`
 *   - 비로그인              → `/guest/studio`
 *
 * 본 페이지는 더 이상 UI 를 렌더하지 않는다. 게스트 UI 는 `/guest/studio`,
 * 워크스페이스 UI 는 `/{brandId}/studio` 에 일원화되었으며, 본 경로는 기존 북마크와
 * SEO 호환을 위해 유지된다.
 */

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { getLastBrandId } from "@/components/BrandProvider";

function LoadingShell() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--surface-0)" }}
    >
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-pink-300 border-t-transparent" />
        <p className="mt-4 text-sm text-[color:var(--text-muted)]">
          스튜디오로 이동 중...
        </p>
      </div>
    </div>
  );
}

function StudioLegacyRedirectInner() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/guest/studio");
      return;
    }

    let cancelled = false;
    void fetchWithAuth("/api/brands")
      .then((res) => (res.ok ? res.json() : []))
      .then((brands: { id: string }[]) => {
        if (cancelled) return;
        if (!Array.isArray(brands) || brands.length === 0) {
          router.replace(`/onboarding?next=${encodeURIComponent("/studio")}`);
          return;
        }
        const lastId = getLastBrandId(user.id);
        const ids = new Set(brands.map((b) => b.id));
        const target = lastId && ids.has(lastId) ? lastId : brands[0].id;
        router.replace(`/${target}/studio`);
      })
      .catch(() => {
        if (cancelled) return;
        router.replace("/guest/studio");
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user, router, fetchWithAuth]);

  return <LoadingShell />;
}

export default function StudioLegacyRedirect() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <StudioLegacyRedirectInner />
    </Suspense>
  );
}
