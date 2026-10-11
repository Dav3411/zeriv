"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Brand } from "@/lib/brand.types";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { useAuth } from "@/components/AuthProvider";

/**
 * 게스트 brand 슬러그 — `/[brandName]/...` 의 첫 세그먼트가 이 값일 때
 * 인증·브랜드 fetch 를 모두 스킵하고 인메모리 더미 brand 를 노출한다.
 * 라우팅·예약어·미들웨어 분기와 일관되게 사용되는 단일 상수.
 *
 * `reservedBrandSlugs.ts` 의 RESERVED_BRAND_SLUGS 에도 동일 값이 포함되어
 * 사용자가 이 이름으로 brand 를 생성하지 못하도록 차단된다.
 */
export const GUEST_BRAND_SLUG = "guest";

/**
 * 게스트 더미 brand. id 와 name 모두 "guest" 로 통일하면 URL `/guest/quick`
 * 라우팅과 자연스럽게 매핑된다. 색상은 디자인 시스템의 핑크/베이지 기본값을
 * 그대로 따른다 — workspace 진입 시 사용자가 본인 brand color 로 즉시 교체.
 */
function makeGuestBrand(): Brand {
  return {
    id: GUEST_BRAND_SLUG,
    user_id: GUEST_BRAND_SLUG,
    name: "게스트",
    color: "#ffa4c6",
    primaryColor: "#ffa4c6",
    description: null,
    logo_url: null,
    logoUrl: null,
    activeProfileId: null,
    activeStyleId: null,
    active_style_id: null,
    meta: null,
    created_at: new Date(0).toISOString(),
  };
}

/**
 * brandId 또는 brandName 이 게스트 슬러그인지 판정.
 * BrandProvider 분기와 동일 로직을 외부에서도 쓰기 위한 공개 헬퍼.
 */
export function isGuestBrandRef(ref: string | null | undefined): boolean {
  if (!ref) return false;
  return ref.trim().toLowerCase() === GUEST_BRAND_SLUG;
}

interface BrandContextValue {
  brand: Brand | null;
  brandId: string | null;
  loading: boolean;
  error: string | null;
  /** Refresh brand data from server */
  refresh: () => void;
  /** 게스트 더미 brand 컨텍스트 여부. 페이지·하위 컴포넌트의 분기 키. */
  isGuest: boolean;
}

const BrandContext = createContext<BrandContextValue>({
  brand: null,
  brandId: null,
  loading: true,
  error: null,
  refresh: () => {},
  isGuest: false,
});

export function useBrand() {
  return useContext(BrandContext);
}

const LEGACY_LAST_BRAND_KEY = "last_brand_id";
const LAST_BRAND_KEY_PREFIX = "last_brand_id_";

function userScopedKey(userId: string): string {
  return `${LAST_BRAND_KEY_PREFIX}${userId}`;
}

/**
 * 특정 사용자의 마지막 활성 brand id를 조회.
 * userId가 null이면 legacy 키도 fallback으로 시도.
 */
export function getLastBrandId(userId: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    if (userId) {
      const v = window.localStorage.getItem(userScopedKey(userId))?.trim();
      if (v && v.length > 0) return v;
    }
    // 마이그레이션 fallback: legacy 키 (user-scoped 도입 전 데이터)
    const legacy = window.localStorage.getItem(LEGACY_LAST_BRAND_KEY)?.trim();
    return legacy && legacy.length > 0 ? legacy : null;
  } catch {
    return null;
  }
}

/** 활성 brand 변경 시 호출. user-scoped 키에 저장하고 legacy 키는 정리. */
export function setLastBrandId(userId: string, brandId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(userScopedKey(userId), brandId);
    // legacy 키가 남아있으면 삭제 (한 번 마이그레이션 완료 신호)
    window.localStorage.removeItem(LEGACY_LAST_BRAND_KEY);
  } catch {
    // ignore
  }
}

/** 특정 사용자의 last brand 정리 (brand 삭제 시 호출용). legacy 키도 함께 정리. */
export function clearLastBrandId(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(userScopedKey(userId));
    window.localStorage.removeItem(LEGACY_LAST_BRAND_KEY);
  } catch {
    // ignore
  }
}

export function BrandProvider({
  brandId,
  brandName,
  children,
}: {
  brandId?: string;
  brandName?: string;
  children: ReactNode;
}) {
  // 게스트 분기 — `/guest/...` 라우팅이 brandId/brandName 으로 "guest" 를 넘긴다.
  // 이 경우 어떤 fetch 도 하지 않고 메모리 내 더미 brand 를 즉시 컨텍스트에
  // 주입한다. 401 redirect 회피 + 네트워크 노이즈 제거 + lastBrandId 오염 방지.
  const isGuest = isGuestBrandRef(brandId) || isGuestBrandRef(brandName);

  const [brand, setBrand] = useState<Brand | null>(
    isGuest ? makeGuestBrand() : null,
  );
  const [resolvedBrandId, setResolvedBrandId] = useState<string | null>(
    isGuest ? GUEST_BRAND_SLUG : (brandId ?? null),
  );
  const [loading, setLoading] = useState(!isGuest);
  const [error, setError] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const { fetchWithAuth } = useFetchWithAuth();
  const { user } = useAuth();

  useEffect(() => {
    // 게스트 컨텍스트는 fetch 도 하지 않고 lastBrandId 도 건드리지 않는다.
    // (lastBrandId 에 "guest" 가 들어가면 다음 로그인 후 페이지가 게스트 브랜드로
    //  재진입을 시도해 404 또는 RLS 실패가 연쇄된다.)
    if (isGuest) {
      setBrand(makeGuestBrand());
      setResolvedBrandId(GUEST_BRAND_SLUG);
      setLoading(false);
      setError(null);
      return;
    }

    if (!brandId && !brandName) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = brandId
      ? `/api/brands/${brandId}`
      : `/api/brands/by-name/${encodeURIComponent(brandName!)}`;

    fetchWithAuth(url)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError("브랜드를 불러올 수 없습니다.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        const b = data.brand ?? data;
        setBrand(b);
        setResolvedBrandId(b.id ?? brandId ?? null);
        const userId = user?.id;
        if (userId) {
          if (b.id) setLastBrandId(userId, b.id);
          else if (brandId) setLastBrandId(userId, brandId);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("브랜드를 불러올 수 없습니다.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [brandId, brandName, rev, fetchWithAuth, user?.id, isGuest]);

  const refresh = () => setRev((r) => r + 1);

  return (
    <BrandContext.Provider
      value={{
        brand,
        brandId: resolvedBrandId,
        loading,
        error,
        refresh,
        isGuest,
      }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function BrandGuard({ children }: { children: ReactNode }) {
  const { brand, loading, error, isGuest } = useBrand();
  const router = useRouter();

  useEffect(() => {
    // 게스트는 fetch 자체를 하지 않으므로 error/brand 검사를 우회한다.
    if (isGuest) return;
    if (!loading && (error || !brand)) {
      router.replace("/");
    }
  }, [loading, error, brand, router, isGuest]);

  if (isGuest) return <>{children}</>;
  if (loading) return null;
  if (error || !brand) return null;
  return <>{children}</>;
}
