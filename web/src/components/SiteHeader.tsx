"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useAuth } from "@/components/AuthProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { Logo } from "@/components/Logo";
import { getLastBrandId } from "@/components/BrandProvider";
import { PackBalance, clearPackBalanceCache } from "@/components/packs/PackBalance";
import { GenerationUsageBadge } from "@/components/packs/GenerationUsageBadge";
import { PackPurchaseModal } from "@/components/packs/PackPurchaseModal";

const STORAGE_KEY = "sidebar-collapsed";

/* ── TTL Cache ─── */
type TtlEntry<T> = { value: T; ts: number };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

function makeTtlCache<T>() {
  const map = new Map<string, TtlEntry<T>>();
  return {
    get(k: string): T | undefined {
      const e = map.get(k);
      if (!e) return undefined;
      if (Date.now() - e.ts > CACHE_TTL_MS) {
        map.delete(k);
        return undefined;
      }
      return e.value;
    },
    set(k: string, v: T) {
      map.set(k, { value: v, ts: Date.now() });
    },
    delete(k: string) {
      map.delete(k);
    },
    has(k: string): boolean {
      return this.get(k) !== undefined;
    },
  };
}

/* ── Breadcrumb separator ─── */
function BreadcrumbSep() {
  return (
    <span
      className="mx-2 text-sm select-none"
      style={{ color: "var(--text-muted)" }}
    >
      /
    </span>
  );
}

/* ── Breadcrumb Bar (always visible) ─── */
// Module-level cache so brand name persists across navigations without refetch
const brandNameCache = makeTtlCache<string>();
const brandLogoCache = makeTtlCache<string | null>();
const brandColorCache = makeTtlCache<string | null>();
const brandMemberCountCache = makeTtlCache<number>();
export function clearBrandNameCache(brandId: string) {
  brandNameCache.delete(brandId);
  brandLogoCache.delete(brandId);
  brandColorCache.delete(brandId);
  brandMemberCountCache.delete(brandId);
}

function BreadcrumbBar({
  pathname,
  activeBrandId,
  activeOrg,
  navItems,
  searchParams,
  t,
}: {
  pathname: string;
  activeBrandId: string | null;
  activeOrg: { id: string; name: string } | null;
  navItems: { href: string; label: string; match: boolean }[];
  searchParams: ReturnType<typeof useSearchParams>;
  t: ReturnType<typeof useTranslations>;
}) {
  const { fetchWithAuth } = useFetchWithAuth();
  const cached = activeBrandId ? brandNameCache.get(activeBrandId) : null;
  const [brandName, setBrandName] = useState<string | null>(cached ?? null);

  useEffect(() => {
    if (!activeBrandId) {
      setBrandName(null);
      return;
    }
    // Use cache if available
    if (brandNameCache.has(activeBrandId)) {
      setBrandName(brandNameCache.get(activeBrandId)!);
      return;
    }
    fetchWithAuth(`/api/brands/${activeBrandId}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const b = data.brand ?? data;
          const name = b.name ?? null;
          if (name) brandNameCache.set(activeBrandId, name);
          brandLogoCache.set(activeBrandId, b.logoUrl ?? null);
          brandColorCache.set(activeBrandId, b.color ?? b.primaryColor ?? null);
          setBrandName(name);
          window.dispatchEvent(new CustomEvent("brandCacheUpdated"));
        }
      })
      .catch(() => {});
  }, [activeBrandId, fetchWithAuth]);

  // Fetch sub-page name (concept/product/model detail pages)
  const [subPageName, setSubPageName] = useState<string | null>(null);
  useEffect(() => {
    if (!activeBrandId) {
      setSubPageName(null);
      return;
    }
    const bp = `/${activeBrandId}`;
    let endpoint: string | null = null;
    if (
      pathname.startsWith(`${bp}/campaigns/`) &&
      pathname !== `${bp}/campaigns`
    ) {
      const id = pathname.split("/campaigns/")[1]?.split(/[/?]/)[0];
      if (id) endpoint = `/api/brands/${activeBrandId}/concepts/${id}`;
    } else if (pathname.startsWith(`${bp}/concepts/`)) {
      const id = pathname.split("/concepts/")[1]?.split(/[/?]/)[0];
      if (id) endpoint = `/api/brands/${activeBrandId}/concepts/${id}`;
    } else if (
      pathname.startsWith(`${bp}/products/`) &&
      !pathname.endsWith("/new")
    ) {
      const id = pathname.split("/products/")[1]?.split(/[/?]/)[0];
      if (id) endpoint = `/api/brands/${activeBrandId}/products/${id}`;
    } else if (
      pathname.startsWith(`${bp}/models/`) &&
      !pathname.endsWith("/new")
    ) {
      const id = pathname.split("/models/")[1]?.split(/[/?]/)[0];
      if (id) endpoint = `/api/personas/${id}`;
    } else if (
      pathname.startsWith(`${bp}/styles/`) &&
      !pathname.endsWith("/new")
    ) {
      const id = pathname.split("/styles/")[1]?.split(/[/?]/)[0];
      if (id) endpoint = `/api/brands/${activeBrandId}/styles/${id}`;
    }
    if (!endpoint) {
      setSubPageName(null);
      return;
    }
    setSubPageName(null);
    fetchWithAuth(endpoint)
      .then(async (res) => {
        if (!res.ok) return;
        const d = await res.json();
        const name =
          d.style?.name ??
          d.concept?.name ??
          d.product?.name ??
          d.model?.name ??
          d.model?.influencer?.name ??
          d.name ??
          null;
        setSubPageName(name);
      })
      .catch(() => {});
  }, [activeBrandId, pathname, fetchWithAuth]);

  if (pathname.endsWith("/explore")) return null;

  const crumbs: { label: string; href?: string; dim?: boolean }[] = [];

  if (activeOrg && pathname !== "/orgs") {
    crumbs.push({ label: activeOrg.name, href: `/orgs/${activeOrg.id}` });
  }

  const isInBrandWorkspace = !!pathname.match(/^\/([0-9a-f-]{36})(\/|$)/);

  if (activeBrandId && isInBrandWorkspace) {
    crumbs.push({
      label: brandName ?? "...",
      href: `/${activeBrandId}`,
    });
  }

  const activeItem = navItems.find((n) => n.match);

  if (pathname === "/brands") {
    crumbs.push({ label: "내 브랜드" });
  } else if (pathname === "/brands/new") {
    crumbs.push({ label: "내 브랜드", href: "/brands" });
    crumbs.push({ label: "새 브랜드 만들기" });
  } else if (activeBrandId && isInBrandWorkspace) {
    const bp = `/${activeBrandId}`;
    const tab = searchParams.get("tab");
    // Sub-pages with detail (e.g. /concepts/[id], /products/[id], /models/[id])
    if (
      pathname.startsWith(`${bp}/campaigns/`) &&
      pathname !== `${bp}/campaigns`
    ) {
      crumbs.push({ label: "캠페인", href: `${bp}/campaigns` });
      crumbs.push({ label: subPageName ?? "..." });
    } else if (pathname.startsWith(`${bp}/concepts/`)) {
      crumbs.push({ label: "캠페인", href: `${bp}/campaigns` });
      crumbs.push({ label: subPageName ?? "..." });
    } else if (pathname === `${bp}/styles/new`) {
      crumbs.push({ label: "에셋", href: `${bp}/assets` });
      crumbs.push({ label: "스타일", href: `${bp}/assets?tab=styles` });
      crumbs.push({ label: "생성" });
    } else if (
      pathname.startsWith(`${bp}/styles/`) &&
      pathname !== `${bp}/styles`
    ) {
      crumbs.push({ label: "에셋", href: `${bp}/assets` });
      crumbs.push({ label: "스타일", href: `${bp}/assets?tab=styles` });
      crumbs.push({ label: subPageName ?? "..." });
    } else if (pathname === `${bp}/products/new`) {
      crumbs.push({ label: "에셋", href: `${bp}/assets` });
      crumbs.push({ label: "제품", href: `${bp}/assets?tab=products` });
      crumbs.push({ label: "등록" });
    } else if (
      pathname.startsWith(`${bp}/products/`) &&
      pathname !== `${bp}/products/new`
    ) {
      crumbs.push({ label: "에셋", href: `${bp}/assets` });
      crumbs.push({ label: "제품", href: `${bp}/assets?tab=products` });
      crumbs.push({ label: subPageName ?? "..." });
    } else if (pathname === `${bp}/models/new`) {
      crumbs.push({ label: "에셋", href: `${bp}/assets` });
      crumbs.push({ label: "모델", href: `${bp}/assets?tab=models` });
      crumbs.push({ label: "생성" });
    } else if (
      pathname.startsWith(`${bp}/models/`) &&
      pathname !== `${bp}/models`
    ) {
      crumbs.push({ label: "에셋", href: `${bp}/assets` });
      crumbs.push({ label: "모델", href: `${bp}/assets?tab=models` });
      crumbs.push({ label: subPageName ?? "..." });
    } else if (pathname === `${bp}/assets`) {
      if (tab === "styles") {
        crumbs.push({ label: "에셋", href: `${bp}/assets` });
        crumbs.push({ label: "스타일" });
      } else if (tab === "products") {
        crumbs.push({ label: "에셋", href: `${bp}/assets` });
        crumbs.push({ label: "제품" });
      } else if (tab === "models") {
        crumbs.push({ label: "에셋", href: `${bp}/assets` });
        crumbs.push({ label: "모델" });
      } else if (tab === "renders") {
        crumbs.push({ label: "에셋", href: `${bp}/assets` });
        crumbs.push({ label: "렌더" });
      } else {
        // tab=all 또는 tab 없음
        crumbs.push({ label: "에셋" });
      }
    } else if (activeItem) {
      const isOverview = activeItem.href === bp;
      if (!isOverview) {
        crumbs.push({ label: activeItem.label });
      }
    }
  } else if (pathname === "/orgs") {
    crumbs.push({ label: "내 Organization" });
  } else if (pathname.startsWith("/orgs/")) {
    // org 페이지: 첫 크럼(org 이름)만으로 충분
  } else if (activeItem) {
    crumbs.push({ label: activeItem.label });
  } else {
    const segment = pathname.split("/").filter(Boolean).pop();
    if (segment) crumbs.push({ label: segment });
  }

  return (
    <div
      className="hidden lg:flex fixed top-0 right-0 items-center h-11 z-40 breadcrumb-bar"
      style={{
        left: "var(--sidebar-active-w, var(--sidebar-w))",
        background: "var(--surface-0)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center px-6 min-w-0">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center">
            {i > 0 && <BreadcrumbSep />}
            {crumb.dim ? (
              crumb.href ? (
                <Link
                  href={crumb.href}
                  className="text-sm hover:opacity-80 transition-opacity truncate max-w-[200px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="text-sm truncate max-w-[200px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {crumb.label}
                </span>
              )
            ) : crumb.href && i < crumbs.length - 1 ? (
              <Link
                href={crumb.href}
                className="text-sm font-medium hover:opacity-80 transition-opacity truncate max-w-[200px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className="text-sm font-bold truncate max-w-[200px]"
                style={{ color: "var(--text-primary)" }}
              >
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function BrandRow({
  b,
  bc,
  isActive,
  onClose,
}: {
  b: {
    id: string;
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
    role?: string;
  };
  bc: string;
  isActive: boolean;
  onClose: () => void;
}) {
  return (
    <Link
      href={`/${b.id}`}
      onClick={onClose}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all brand-row"
      data-active={isActive ? "true" : undefined}
      style={isActive ? { background: "var(--accent-overlay)" } : undefined}
    >
      {b.logoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={b.logoUrl}
          alt=""
          className="w-9 h-9 rounded-lg object-cover shrink-0"
        />
      ) : (
        <div
          className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-sm font-bold text-white"
          style={{ background: bc }}
        >
          {b.name[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      <span
        className="text-sm font-medium truncate flex-1"
        style={{ color: "var(--text-primary)" }}
      >
        {b.name}
      </span>
      {b.role && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0"
          style={{
            background:
              b.role === "owner"
                ? "rgba(244,114,182,0.15)"
                : "rgba(161,161,170,0.10)",
            color: b.role === "owner" ? "#f472b6" : "#71717a",
          }}
        >
          {b.role === "owner" ? "오너" : "멤버"}
        </span>
      )}
      {isActive && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-pink-400"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { fetchWithAuth } = useFetchWithAuth();
  const isHome = pathname === "/";
  const t = useTranslations();
  const { resolvedTheme, setTheme } = useTheme();
  const { user, session, loading: authLoading, signOut } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [brandSwitcherOpen, setBrandSwitcherOpen] = useState(false);
  const [orgs, setOrgs] = useState<
    { id: string; name: string; brandCount?: number }[]
  >([]);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [allBrands, setAllBrands] = useState<
    {
      id: string;
      name: string;
      logoUrl: string | null;
      primaryColor: string | null;
      role?: string;
      planKey?: string | null;
      organizationId?: string | null;
    }[]
  >([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [mobileAccountMenuOpen, setMobileAccountMenuOpen] = useState(false);
  const [mobileInfoExpanded, setMobileInfoExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [mounted, setMounted] = useState(false);
  // 테마 전용 mount 가드. `mounted` 는 RAF 안에서 true 가 되어 사이드바 트랜지션 용도로
  // 쓰이지만, 테마 분기는 그보다 빠르게(첫 effect 시점에) 결정되어야 하므로 별도 state.
  // SSR 시 false → 라이트(기본값) 마크업이 노출되어 hydration mismatch 가 없다.
  const [themeMounted, setThemeMounted] = useState(false);
  const [sidebarMemberCount, setSidebarMemberCount] = useState<number | null>(
    null,
  );
  const [nickname, setNickname] = useState<string | null>(null);
  const [packModalOpen, setPackModalOpen] = useState(false);

  // SSR 이후 localStorage에서 상태 복원 (트랜지션 없이)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "0") {
      setCollapsed(false);
      setShowLabels(true);
    }
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // 테마 mount: next-themes 의 resolvedTheme 은 클라이언트에서만 결정되므로
  // 첫 렌더 직후 themeMounted 를 true 로 전환해 분기 색상을 적용한다.
  useEffect(() => {
    setThemeMounted(true);
  }, []);

  // SSR/첫 렌더에서는 isDark = false → 라이트 모드 기본값을 안전하게 사용.
  const isDark = themeMounted && resolvedTheme === "dark";
  const menuRef = useRef<HTMLDivElement>(null);
  const accountBtnRef = useRef<HTMLButtonElement>(null);
  const mobileAccountBtnRef = useRef<HTMLButtonElement>(null);
  const mobileAccountMenuRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // 계정 드롭다운 위치 계산 (fixed positioning)
  const accountMenuPos = (() => {
    if (!accountBtnRef.current) return { bottom: 0, left: 0 };
    const rect = accountBtnRef.current.getBoundingClientRect();
    return {
      bottom: window.innerHeight - rect.top + 4,
      left: collapsed ? rect.right + 4 : rect.left,
      width: collapsed ? undefined : rect.width,
    };
  })();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      setHoverExpanded(false);
      if (next) {
        // 접기: 텍스트 즉시 숨기기
        setShowLabels(false);
      } else {
        // 펼치기: 즉시 텍스트 보이기
        setShowLabels(true);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
        setInfoExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!mobileAccountMenuOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        mobileAccountBtnRef.current?.contains(target) ||
        mobileAccountMenuRef.current?.contains(target)
      )
        return;
      setMobileAccountMenuOpen(false);
      setMobileInfoExpanded(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mobileAccountMenuOpen]);

  useEffect(() => {
    if (!user || !session?.access_token) {
      setCredits(null);
      setPlanName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/credits/balance", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { balance?: number };
        if (!cancelled && typeof data.balance === "number") {
          setCredits(data.balance);
        }
      } catch {
        // silently ignore
      }
    })();
    (async () => {
      try {
        const res = await fetch("/api/subscription/plan", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { plan?: { name?: string } | null };
        if (!cancelled && !activeBrandId) {
          setPlanName(data.plan?.name ?? null);
        }
      } catch {
        // silently ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, session?.access_token]);

  useEffect(() => {
    if (!user || !session?.access_token) {
      setNickname(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/users/${encodeURIComponent(user.id)}/profile`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.nickname) setNickname(d.nickname);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, session?.access_token]);

  // Org 목록 fetch
  useEffect(() => {
    if (!user || !session?.access_token) {
      setOrgs([]);
      return;
    }
    fetch("/api/organizations", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : { organizations: [] }))
      .then((data: { organizations?: { id: string; name: string }[] }) => {
        setOrgs(Array.isArray(data) ? data : (data.organizations ?? []));
      })
      .catch(() => setOrgs([]));
  }, [user, session?.access_token]);

  // Detect brand context: from URL path (/brands/{uuid}/...) or query param (?brandId=...)
  const searchParams = useSearchParams();
  const brandMatch = pathname.match(/^\/([0-9a-f-]{36})(\/|$)/);
  const activeBrandId =
    brandMatch?.[1] ??
    searchParams.get("brandId") ??
    (mounted ? getLastBrandId(user?.id ?? null) : null);

  // Helper: append ?brandId= to existing page URLs when inside brand context
  const bHref = (path: string) =>
    activeBrandId ? `${path}?brandId=${activeBrandId}` : path;

  // 활성 org 결정: 현재 activeBrand의 organizationId 우선, 없으면 orgs[0] fallback
  const activeOrg = useMemo(() => {
    if (activeBrandId) {
      const activeBrand = allBrands.find((b) => b.id === activeBrandId);
      if (activeBrand?.organizationId) {
        const matched = orgs.find((o) => o.id === activeBrand.organizationId);
        if (matched) return matched;
      }
    }
    return orgs[0] ?? null;
  }, [activeBrandId, allBrands, orgs]);
  const isMultiOrg = orgs.length > 1;

  // 브랜드 스위처용: allBrands를 org별로 그룹화 (key는 orgId 사용 — 이름 충돌 방지)
  const groupedBrands = useMemo(() => {
    const m = new Map<
      string,
      { orgId: string; orgName: string; brands: typeof allBrands }
    >();
    for (const b of allBrands) {
      const orgId = b.organizationId ?? "no-org";
      const orgName = orgs.find((o) => o.id === orgId)?.name ?? "기타";
      if (!m.has(orgId)) m.set(orgId, { orgId, orgName, brands: [] });
      m.get(orgId)!.brands.push(b);
    }
    return Array.from(m.values());
  }, [allBrands, orgs]);

  const fetchBrandsAndOpen = useCallback(() => {
    setBrandSwitcherOpen(true);
    setAllBrands([]);
    setBrandsLoading(true);
    fetchWithAuth("/api/brands")
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        setAllBrands(
          ((d.brands ?? d) as {
            id: string;
            name: string;
            logoUrl: string | null;
            primaryColor: string | null;
            role?: string;
            planKey?: string | null;
            organizationId?: string | null;
          }[]) ?? [],
        );
      })
      .catch(() => {})
      .finally(() => setBrandsLoading(false));
  }, [fetchWithAuth]);

  // 사이드바용 브랜드 정보 (BreadcrumbBar가 fetch 후 캐시에 저장)
  const [sidebarBrandName, setSidebarBrandName] = useState<string | null>(
    activeBrandId ? (brandNameCache.get(activeBrandId) ?? null) : null,
  );
  const [sidebarBrandLogo, setSidebarBrandLogo] = useState<string | null>(
    activeBrandId ? (brandLogoCache.get(activeBrandId) ?? null) : null,
  );
  const [sidebarBrandColor, setSidebarBrandColor] = useState<string | null>(
    activeBrandId ? (brandColorCache.get(activeBrandId) ?? null) : null,
  );
  useEffect(() => {
    if (!activeBrandId) return;
    // 이미 캐시에 있으면 즉시 반영
    if (brandNameCache.has(activeBrandId)) {
      setSidebarBrandName(brandNameCache.get(activeBrandId)!);
      setSidebarBrandLogo(brandLogoCache.get(activeBrandId) ?? null);
      setSidebarBrandColor(brandColorCache.get(activeBrandId) ?? null);
      return;
    }
    // 캐시가 채워지면 BreadcrumbBar가 brandCacheUpdated 이벤트를 dispatch함
    function handleCacheUpdated() {
      if (brandNameCache.has(activeBrandId!)) {
        setSidebarBrandName(brandNameCache.get(activeBrandId!)!);
        setSidebarBrandLogo(brandLogoCache.get(activeBrandId!) ?? null);
        setSidebarBrandColor(brandColorCache.get(activeBrandId!) ?? null);
      }
    }
    window.addEventListener("brandCacheUpdated", handleCacheUpdated);
    return () =>
      window.removeEventListener("brandCacheUpdated", handleCacheUpdated);
  }, [activeBrandId]);

  useEffect(() => {
    if (!activeBrandId) return;
    if (brandMemberCountCache.has(activeBrandId)) {
      setSidebarMemberCount(brandMemberCountCache.get(activeBrandId)!);
      return;
    }
    fetchWithAuth(`/api/brands/${activeBrandId}/members`)
      .then(async (res) => {
        if (!res.ok) return;
        const d = await res.json();
        const count = d.members?.length ?? 0;
        brandMemberCountCache.set(activeBrandId, count);
        setSidebarMemberCount(count);
      })
      .catch(() => {});
  }, [activeBrandId, fetchWithAuth]);

  useEffect(() => {
    if (!activeBrandId) return;
    let cancelled = false;
    fetchWithAuth(`/api/brands/${activeBrandId}/subscription`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const d = (await res.json()) as { planLabel?: string };
        if (d.planLabel && !cancelled) setPlanName(d.planLabel);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeBrandId, fetchWithAuth]);

  // ── Top-level nav ──
  // 비로그인: 풀 메뉴 미리보기 (탐색·대시보드·Quick·스튜디오·편집·에셋·설정).
  //   public path (탐색·Quick) 는 직접 진입, 그 외는 /login?next=... 로 분기.
  //   목적: 비로그인 사용자에게 제품 capability 즉시 인지 + 로그인 동기 부여.
  // 로그인 + 브랜드 없음: 브랜드/설정/편집 (기존)
  const topLevelNav = !user
    ? [
        {
          href: "/explore",
          label: "탐색",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          ),
          match: pathname.startsWith("/explore"),
        },
        {
          href: "/login?next=/brands",
          label: "대시보드",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          ),
          match: false,
        },
        {
          href: "/quick",
          label: "퀵 썸네일",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          ),
          match: pathname === "/quick",
        },
        {
          href: "/studio",
          label: "스튜디오",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          ),
          match: pathname === "/studio",
        },
        {
          href: "/login?next=/brands",
          label: "에셋",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          ),
          match: false,
        },
        {
          href: "/login?next=/settings",
          label: "설정",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ),
          match: false,
        },
      ]
    : [
        {
          href: "/brands",
          label: t("common.brands"),
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
            </svg>
          ),
          match: pathname === "/brands" || pathname.startsWith("/brands/"),
        },
        {
          href: "/settings",
          label: "설정",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ),
          match: pathname.startsWith("/settings"),
        },
        {
          href: "/edit",
          label: "편집",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          ),
          match: pathname.startsWith("/edit"),
        },
      ];

  type NavItem = {
    href: string;
    label: string;
    icon: React.ReactNode;
    match: boolean;
    sectionLabel?: string;
  };

  // ── Brand workspace nav (플랫 리스트) ──
  const bp = `/${activeBrandId}`;
  const brandNav: NavItem[] = activeBrandId
    ? [
        // 탐색
        {
          href: bHref(`/explore`),
          label: "탐색",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          ),
          match: pathname.startsWith(`/explore`),
        },
        // 대시보드
        {
          href: bp,
          label: "대시보드",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          ),
          match: pathname === bp,
        },
        // Quick 썸네일
        {
          href: `${bp}/quick`,
          label: "퀵 썸네일",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          ),
          match: pathname.startsWith(`${bp}/quick`),
        },
        // 스튜디오
        {
          href: `${bp}/studio`,
          label: "스튜디오",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          ),
          match: pathname.startsWith(`${bp}/studio`),
        },
        // 에셋
        {
          href: `${bp}/assets`,
          label: "에셋",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          ),
          match: pathname.startsWith(`${bp}/assets`),
        },
        // 설정
        {
          href: "/settings",
          label: "설정",
          icon: (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ),
          match: pathname.startsWith("/settings"),
        },
      ]
    : [];

  const navItems: NavItem[] = activeBrandId ? brandNav : topLevelNav;

  return (
    <>
      {/* ── Desktop Sidebar ──────────────────────────────────── */}
      <aside
        ref={sidebarRef}
        className={`hidden lg:flex fixed left-0 top-0 z-50 h-screen flex-col overflow-hidden ${collapsed && !hoverExpanded ? "sidebar-width-collapsed" : "sidebar-width"} ${mounted ? "transition-[width] duration-200" : ""}`}
        style={{
          // 다크/라이트 모두 CSS 변수만 사용 — themeMounted=false 인 SSR/첫 프레임에서
          // isDark 분기가 라이트로 폴백되어 다크 사용자가 깜빡임 보는 회귀 방지.
          // 다크 톤은 #202020 → #282828 (이전 #131313 → #151515 보다 미세하게 밝음).
          background:
            "linear-gradient(180deg, var(--surface-1) 0%, var(--surface-2) 100%)",
          borderRight: "1px solid var(--border-subtle)",
        }}
        onMouseEnter={() => {
          if (collapsed) {
            setHoverExpanded(true);
            setShowLabels(true);
            requestAnimationFrame(() => {
              setTimeout(() => {
                const active = navRef.current?.querySelector(
                  "[data-active='true']",
                ) as HTMLElement | null;
                if (active)
                  active.scrollIntoView({
                    block: "nearest",
                    behavior: "smooth",
                  });
              }, 220);
            });
          }
        }}
        onMouseLeave={() => {
          if (collapsed) {
            setShowLabels(false);
            setHoverExpanded(false);
          }
        }}
      >
        {/* Logo + collapse toggle */}
        <div className="shrink-0 flex items-center h-11 whitespace-nowrap">
          <Link
            href="/"
            className="w-[3.25rem] shrink-0 flex items-center justify-center"
            onClick={(e) => {
              if (isHome) {
                e.preventDefault();
                window.location.reload();
              }
            }}
          >
            <Logo width={28} height={28} iconOnly />
          </Link>
          {showLabels && (
            <>
              <button
                type="button"
                onClick={toggleCollapsed}
                className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors ml-auto mr-3 ${
                  isDark
                    ? "text-zinc-600 hover:text-zinc-200 hover:bg-white/10"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-black/5"
                }`}
                title={collapsed ? "사이드바 고정" : "사이드바 접기"}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  {!collapsed && (
                    <rect
                      x="4"
                      y="4"
                      width="4"
                      height="16"
                      rx="0.5"
                      fill="currentColor"
                      stroke="none"
                      opacity="0.4"
                    />
                  )}
                </svg>
              </button>
            </>
          )}
        </div>

        {/* 미로그인 로그인/회원가입 버튼 */}
        {!authLoading && !user && (
          <>
            {showLabels ? (
              <div className="space-y-1.5 px-3 py-2">
                <Link
                  href="/login"
                  className={`flex items-center justify-center px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                    isDark
                      ? "text-zinc-300 hover:text-white"
                      : "text-zinc-700 hover:text-zinc-900"
                  }`}
                  style={{
                    border: "1px solid var(--border-default)",
                    background: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.03)",
                  }}
                >
                  {t("common.signIn")}
                </Link>
                <Link
                  href="/login?mode=signup"
                  className="flex items-center justify-center px-4 py-1.5 rounded-full text-sm font-semibold transition-all hover:opacity-90"
                  style={{
                    background: "var(--brand-gradient)",
                    color: "#000",
                  }}
                >
                  {t("common.signUp")}
                </Link>
              </div>
            ) : (
              <Link
                href="/login"
                className={`flex items-center py-2.5 rounded-xl transition-colors whitespace-nowrap ${
                  isDark ? "hover:bg-white/5" : "hover:bg-black/5"
                }`}
                title={t("common.signIn")}
              >
                <div className="w-[3.25rem] shrink-0 flex items-center justify-center">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={isDark ? "text-zinc-400" : "text-zinc-600"}
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
              </Link>
            )}
          </>
        )}

        {/* Org 정보 행 */}
        {user &&
          activeOrg &&
          (isMultiOrg ? (
            <button
              type="button"
              onClick={fetchBrandsAndOpen}
              className="group shrink-0 flex items-center gap-1.5 h-5 mt-3 cursor-pointer overflow-hidden whitespace-nowrap mx-2 px-3 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
            >
              {showLabels && (
                <>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-zinc-500 group-hover:text-zinc-400 transition-colors"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 22V12h6v10M3 9h18" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-400 transition-colors truncate flex-1 text-left">
                    {activeOrg.name}
                  </span>
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-zinc-500 group-hover:text-zinc-400 transition-colors"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </>
              )}
            </button>
          ) : (
            <div className="shrink-0 flex items-center gap-1.5 h-5 mt-3 overflow-hidden whitespace-nowrap cursor-default mx-2 px-3">
              {showLabels && (
                <>
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-zinc-500"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 22V12h6v10M3 9h18" />
                  </svg>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 truncate flex-1">
                    {activeOrg.name}
                  </span>
                </>
              )}
            </div>
          ))}

        {/* 브랜드 프로필 (클릭 → 브랜드 전환) */}
        {activeBrandId &&
          user &&
          (() => {
            const c = sidebarBrandColor ?? "#ffa4c6";
            return (
              <button
                type="button"
                onClick={fetchBrandsAndOpen}
                className={`shrink-0 flex items-center h-14 mt-1.5 transition-colors cursor-pointer overflow-hidden whitespace-nowrap ${
                  showLabels
                    ? `mx-2 px-3 rounded-xl ${isDark ? "hover:bg-white/[0.07]" : "hover:bg-black/[0.05]"}`
                    : `w-full ${isDark ? "hover:bg-white/5" : "hover:bg-black/5"}`
                }`}
                style={
                  showLabels
                    ? {
                        background: isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.03)",
                        border: `1px solid ${isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)"}`,
                      }
                    : { border: "1px solid transparent" }
                }
                title={!showLabels ? (sidebarBrandName ?? "브랜드") : undefined}
              >
                <div
                  className={
                    showLabels
                      ? "shrink-0"
                      : "w-[3.25rem] shrink-0 flex items-center justify-center"
                  }
                >
                  {sidebarBrandLogo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={sidebarBrandLogo}
                      alt=""
                      className="w-8 h-8 rounded-md object-cover"
                      style={{ border: `1px solid ${c}40` }}
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold text-white"
                      style={{ background: c }}
                    >
                      {(sidebarBrandName ?? "?")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                {showLabels && (
                  <>
                    <div className="flex-1 min-w-0 ml-2.5 text-left">
                      <p
                        className="text-sm font-bold truncate leading-tight"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {sidebarBrandName ?? "..."}
                      </p>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {[
                          planName ?? "Free",
                          sidebarMemberCount !== null
                            ? `${sidebarMemberCount}명`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 ml-2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </>
                )}
              </button>
            );
          })()}

        {/* + 만들기 버튼 — 제거됨 */}
        {false && activeBrandId && user && (
          <div className="shrink-0 mt-1 mb-3 relative">
            <button
              type="button"
              onClick={() => setCreateMenuOpen((v) => !v)}
              className="flex items-center justify-center h-9 rounded-full font-bold text-sm active:scale-95 overflow-hidden whitespace-nowrap"
              style={{
                background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                color: "#000",
                boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
                position: "absolute",
                left: "calc((3.25rem - 2.25rem) / 2)",
                right: showLabels
                  ? "0.5rem"
                  : "calc(100% - 3.25rem + (3.25rem - 2.25rem) / 2)",
                transition: "right 0.2s ease",
              }}
              title={!showLabels ? "만들기" : undefined}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span
                className="transition-all duration-200 overflow-hidden"
                style={{
                  maxWidth: showLabels ? "60px" : "0px",
                  opacity: showLabels ? 1 : 0,
                  marginLeft: showLabels ? "6px" : "0px",
                }}
              >
                만들기
              </span>
            </button>
            <div className="h-9" />

            {createMenuOpen && (
              <div
                className="fixed inset-0 z-[100] flex items-center justify-center"
                onClick={() => setCreateMenuOpen(false)}
              >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                {/* Modal */}
                <div
                  className="relative z-[101] rounded-2xl w-[480px] max-w-[90vw] max-h-[80vh] overflow-y-auto flex flex-col"
                  style={{
                    // 토큰 기반: 라이트/다크 자동 분기. 라이트에선 warm white(#fffcf8), 다크에선 #16161d.
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-default)",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 헤더 */}
                  <div
                    className="flex items-center justify-between px-6 pt-6 pb-4"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <h2
                      className="text-base font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      무엇을 만들까요?
                    </h2>
                    <button
                      type="button"
                      onClick={() => setCreateMenuOpen(false)}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* 콘텐츠 */}
                  <div className="px-6 py-5 space-y-6">
                    {/* 리소스 섹션 */}
                    <div>
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest mb-3"
                        style={{ color: "rgba(255,164,198,0.45)" }}
                      >
                        리소스
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          {
                            href: `/${activeBrandId}/models/new`,
                            label: "모델",
                            desc: "AI 모델 등록",
                            icon: (
                              <>
                                <rect
                                  x="4"
                                  y="4"
                                  width="16"
                                  height="16"
                                  rx="2"
                                />
                                <rect x="9" y="9" width="6" height="6" />
                                <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
                              </>
                            ),
                          },
                          {
                            href: `/${activeBrandId}/styles/new`,
                            label: "스타일",
                            desc: "브랜드 스타일 생성",
                            icon: (
                              <>
                                <path d="M12 2L2 7l10 5 10-5-10-5" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                              </>
                            ),
                          },
                        ].map(({ href, label, desc, icon }) => (
                          <Link
                            key={href}
                            href={href}
                            onClick={() => setCreateMenuOpen(false)}
                            className="group card card-interactive p-4 flex flex-col gap-3 hover:border-pink-400/30 transition-all"
                          >
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{
                                background: "rgba(255,164,198,0.08)",
                                color: "#ffa4c6",
                              }}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                {icon}
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {label}
                              </p>
                              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                                {desc}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>

                    {/* 생성 섹션 */}
                    <div>
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest mb-3"
                        style={{ color: "rgba(255,164,198,0.45)" }}
                      >
                        생성
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          {
                            href: `/${activeBrandId}/products/new`,
                            label: "제품",
                            desc: "제품 등록 및 관리",
                            icon: (
                              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                            ),
                          },
                          {
                            href: `${bp}/studio`,
                            label: "스튜디오",
                            desc: "AI 이미지 렌더링",
                            icon: (
                              <>
                                <rect
                                  x="3"
                                  y="3"
                                  width="18"
                                  height="18"
                                  rx="2"
                                />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <path d="M21 15l-5-5L5 21" />
                              </>
                            ),
                          },
                        ].map(({ href, label, desc, icon }) => (
                          <Link
                            key={href}
                            href={href}
                            onClick={() => setCreateMenuOpen(false)}
                            className="group card card-interactive p-4 flex flex-col gap-3 hover:border-pink-400/30 transition-all"
                          >
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{
                                background: "rgba(255,164,198,0.08)",
                                color: "#ffa4c6",
                              }}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                {icon}
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {label}
                              </p>
                              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                                {desc}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 메인 영역 — nav + jobs */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Nav */}
          <nav
            ref={navRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-0.5 mt-6 soft-scroll"
          >
            {navItems.map((item, i) => {
              const { href, label, icon, match, sectionLabel } = item;
              const showHeader =
                sectionLabel &&
                (i === 0 || navItems[i - 1].sectionLabel !== sectionLabel);
              return (
                // 비로그인 nav 의 일부 항목은 href 가 동일 (모두 /login?next=...) 하므로
                // href 단독으로는 중복 발생. label 합성으로 unique 키 보장.
                <React.Fragment key={`${href}__${label}`}>
                  {showHeader && showLabels && (
                    <div className="px-[0.875rem] pt-5 pb-1">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                        {sectionLabel}
                      </p>
                    </div>
                  )}
                  <Link
                    href={href}
                    data-active={match ? "true" : undefined}
                    className={`relative flex items-center h-10 overflow-hidden whitespace-nowrap transition-colors text-[13px] font-semibold ${
                      match
                        ? isDark
                          ? "text-white bg-white/[0.06]"
                          : "text-zinc-900"
                        : isDark
                          ? "text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.03]"
                          : "text-zinc-600 hover:text-zinc-900 hover:bg-black/[0.04]"
                    }`}
                    style={
                      match && !isDark
                        ? { background: "rgba(255,164,198,0.10)" }
                        : undefined
                    }
                    title={!showLabels ? label : undefined}
                  >
                    {match && (
                      <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-pink-400" />
                    )}
                    <span
                      className={`w-[3.25rem] shrink-0 flex items-center justify-center ${match ? "text-pink-400" : ""}`}
                    >
                      {icon}
                    </span>
                    {showLabels && (
                      <span className="flex-1 text-left text-[13px] font-medium truncate pr-3">
                        {label}
                      </span>
                    )}
                  </Link>
                </React.Fragment>
              );
            })}
          </nav>
        </div>
        {/* end 메인 영역 */}

        {/* Bottom */}
        <div
          className="shrink-0 pb-2 space-y-1"
          style={{
            borderTop: user ? "1px solid var(--border-subtle)" : "none",
            paddingTop: "8px",
          }}
        >
          {authLoading ? null : user ? (
            <>
              {/* 테마 토글 (라이트 ↔ 다크) */}
              <button
                type="button"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
                title={isDark ? "라이트 모드" : "다크 모드"}
                className={`w-full flex items-center h-10 rounded-lg text-sm transition-all duration-150 whitespace-nowrap ${
                  isDark
                    ? "text-zinc-400 hover:text-white hover:bg-white/5"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-black/5"
                }`}
              >
                <div className="w-[3.25rem] shrink-0 flex items-center justify-center">
                  {isDark ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="4" />
                      <line x1="12" y1="2" x2="12" y2="4" />
                      <line x1="12" y1="20" x2="12" y2="22" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="2" y1="12" x2="4" y2="12" />
                      <line x1="20" y1="12" x2="22" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
                    </svg>
                  )}
                </div>
                {showLabels && (
                  <span className="truncate text-xs pr-3">
                    {isDark ? "라이트 모드" : "다크 모드"}
                  </span>
                )}
              </button>
              <Link
                href="/pricing"
                className={`w-full flex items-center h-10 rounded-lg text-sm transition-all duration-150 whitespace-nowrap ${
                  isDark
                    ? "text-zinc-400 hover:text-white hover:bg-white/5"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-black/5"
                }`}
              >
                <div className="w-[3.25rem] shrink-0 flex items-center justify-center">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </svg>
                </div>
                {showLabels && (
                  <span className="truncate text-xs pr-3">요금제</span>
                )}
              </Link>
              <div ref={menuRef}>
                <button
                  ref={accountBtnRef}
                  type="button"
                  className={`w-full flex items-center h-10 rounded-lg text-sm transition-all duration-150 whitespace-nowrap ${
                    isDark
                      ? "text-zinc-300 hover:text-white hover:bg-white/5"
                      : "text-zinc-700 hover:text-zinc-900 hover:bg-black/5"
                  }`}
                  onClick={() => {
                    setAccountMenuOpen((v) => !v);
                    setInfoExpanded(false);
                  }}
                >
                  <div className="w-[3.25rem] shrink-0 flex items-center justify-center">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{
                        background: isDark
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(0,0,0,0.06)",
                        color: isDark ? "#a1a1aa" : "#52525b",
                        border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                      }}
                    >
                      {(user.email ?? user.id).charAt(0).toUpperCase()}
                    </div>
                  </div>
                  {showLabels && (
                    <div className="flex flex-col min-w-0 pr-3 items-start">
                      {nickname && (
                        <span
                          className="truncate text-xs font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {nickname}
                        </span>
                      )}
                      <span
                        className="truncate text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {user.email ?? user.id}
                      </span>
                    </div>
                  )}
                </button>
                {accountMenuOpen ? (
                  <div
                    className="fixed rounded-xl overflow-hidden shadow-2xl py-1 z-[60]"
                    style={{
                      background: isDark ? "#1c1c1f" : "#ffffff",
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.10)"}`,
                      boxShadow: isDark
                        ? "0 24px 48px rgba(0,0,0,0.6)"
                        : "0 24px 48px rgba(0,0,0,0.18)",
                      minWidth: "200px",
                      ...accountMenuPos,
                    }}
                  >
                    <Link
                      href="/account"
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        isDark
                          ? "text-zinc-300 hover:text-white hover:bg-white/5"
                          : "text-zinc-700 hover:text-zinc-900 hover:bg-black/5"
                      }`}
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                      </svg>
                      {t("common.account")}
                    </Link>
                    <div className="relative">
                      <button
                        type="button"
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                          isDark
                            ? "text-zinc-300 hover:text-white hover:bg-white/5"
                            : "text-zinc-700 hover:text-zinc-900 hover:bg-black/5"
                        }`}
                        onClick={() => setInfoExpanded((v) => !v)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span className="flex-1">
                          {t("common.infoSupport")}
                        </span>
                        <span
                          className="text-[10px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {infoExpanded ? "▴" : "▾"}
                        </span>
                      </button>
                      {infoExpanded ? (
                        <div
                          className="px-4 py-2 border-t space-y-2 text-xs"
                          style={{
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-muted)",
                          }}
                        >
                          <p>
                            <Link
                              href="/terms"
                              className="transition-colors hover:opacity-80"
                              onClick={() => setAccountMenuOpen(false)}
                            >
                              {t("common.termsOfService")}
                            </Link>
                          </p>
                          <p>
                            <Link
                              href="/privacy"
                              className="transition-colors hover:opacity-80"
                              onClick={() => setAccountMenuOpen(false)}
                            >
                              {t("common.privacyPolicy")}
                            </Link>
                          </p>
                          <p>
                            <Link
                              href="/blog"
                              className="transition-colors hover:opacity-80"
                              onClick={() => setAccountMenuOpen(false)}
                            >
                              블로그
                            </Link>
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                        isDark
                          ? "text-red-400 hover:text-red-300 hover:bg-white/5"
                          : "text-red-600 hover:text-red-700 hover:bg-black/5"
                      }`}
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                      onClick={async () => {
                        setAccountMenuOpen(false);
                        await signOut();
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      {t("common.signOut")}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </aside>

      {/* 워크스페이스 전환 모달 — aside(desktop only) 바깥에 배치해야 모바일에서도 노출됨. */}
      {brandSwitcherOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          onClick={() => setBrandSwitcherOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-[101] rounded-2xl w-[400px] max-w-[90vw] max-h-[70vh] flex flex-col"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2
                className="text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                워크스페이스 전환
              </h2>
              <button
                type="button"
                onClick={() => setBrandSwitcherOpen(false)}
                className="transition-colors hover:opacity-70"
                style={{ color: "var(--text-muted)" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 목록 */}
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {brandsLoading ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  불러오는 중...
                </div>
              ) : allBrands.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  브랜드가 없습니다.
                </div>
              ) : (
                groupedBrands.map((group) => (
                  <div key={group.orgId}>
                    <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                      {group.orgName}
                    </p>
                    <div className="space-y-0.5">
                      {group.brands.map((b) => {
                        const bc = b.primaryColor ?? "#ffa4c6";
                        const isActive = b.id === activeBrandId;
                        return (
                          <BrandRow
                            key={b.id}
                            b={b}
                            bc={bc}
                            isActive={isActive}
                            onClose={() => setBrandSwitcherOpen(false)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 하단 버튼 영역 */}
            <div
              className="px-3 pb-4 pt-2 space-y-2"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <Link
                href="/brands"
                onClick={() => setBrandSwitcherOpen(false)}
                className={`flex items-center justify-center gap-2 w-full h-9 rounded-xl text-sm font-medium transition-colors ${
                  isDark
                    ? "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-black/[0.04]"
                }`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
                </svg>
                브랜드 관리
              </Link>
              <Link
                href="/brands/new"
                onClick={() => setBrandSwitcherOpen(false)}
                className="flex items-center justify-center gap-2 w-full h-10 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: "var(--brand-gradient)", color: "#000" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                새 브랜드 만들기
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Breadcrumb Bar ──────────────────────────────────── */}
      <BreadcrumbBar
        pathname={pathname}
        activeBrandId={activeBrandId}
        activeOrg={activeOrg}
        navItems={navItems}
        searchParams={searchParams}
        t={t}
      />

      {/* ── PackBalance 배지 — 데스크탑 breadcrumb 우측 ─────── */}
      {user && (
        <div
          className="hidden lg:flex fixed top-0 right-0 z-40 h-11 items-center pr-5 gap-1.5"
          style={{ pointerEvents: "auto" }}
        >
          {activeBrandId && (
            <GenerationUsageBadge brandId={activeBrandId} isDark={isDark} />
          )}
          <PackBalance onClick={() => setPackModalOpen(true)} isDark={isDark} />
        </div>
      )}

      {/* ── Content padding helper ── */}
      <style>
        {collapsed
          ? `:root { --sidebar-active-w: var(--sidebar-w-collapsed); }`
          : `:root { --sidebar-active-w: var(--sidebar-w); }`}
      </style>
      {mounted && (
        <style>{`.lg-pl-sidebar { transition: padding-left 0.2s ease; } .breadcrumb-bar { transition: left 0.2s ease; }`}</style>
      )}

      {/* ── Mobile Header ──────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 nav-glass h-[52px]">
        <div className="px-4 h-full flex items-center justify-between">
          <Link
            href="/"
            onClick={(e) => {
              if (isHome) {
                e.preventDefault();
                window.location.reload();
              }
            }}
          >
            <Logo width={120} height={26} />
          </Link>

          {/* Pack 잔량 배지 + 계정 메뉴 버튼 — 모바일 헤더 우측 클러스터.
              둘 다 user 가 있을 때만 노출. 하나의 flex 그룹으로 묶어
              "로고 좌 / [배지+버튼] 우" 2-자식 구조를 만든다.
              배지 먼저, 계정 트리거를 뒤에 두는 순서는 디자이너 확정. */}
          {user && (
            <div className="flex items-center gap-2">
              {activeBrandId && (
                <GenerationUsageBadge brandId={activeBrandId} isDark={isDark} />
              )}
              <PackBalance
                onClick={() => setPackModalOpen(true)}
                isDark={isDark}
              />
              <button
                ref={mobileAccountBtnRef}
                type="button"
                onClick={() => {
                  setMobileAccountMenuOpen((v) => !v);
                  setMobileInfoExpanded(false);
                }}
                aria-label="계정 메뉴"
                aria-expanded={mobileAccountMenuOpen}
                className={`min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full transition-colors ${isDark ? "hover:bg-white/5" : "hover:bg-black/5"}`}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: isDark
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.06)",
                    color: isDark ? "#a1a1aa" : "#52525b",
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                  }}
                >
                  {(user.email ?? user.id).charAt(0).toUpperCase()}
                </div>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Mobile Account Dropdown ────────────────────────── */}
      {user && mobileAccountMenuOpen && (
        <div
          ref={mobileAccountMenuRef}
          className="lg:hidden fixed rounded-xl overflow-hidden py-1 z-[60]"
          style={{
            top: 50,
            right: 12,
            minWidth: 220,
            background: isDark ? "#1c1c1f" : "#ffffff",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.10)"}`,
            boxShadow: isDark
              ? "0 24px 48px rgba(0,0,0,0.6)"
              : "0 24px 48px rgba(0,0,0,0.18)",
          }}
        >
          {/* 조직·브랜드 전환 (isMultiOrg 여부에 따라 라벨 분기) */}
          <button
            type="button"
            onClick={() => {
              setMobileAccountMenuOpen(false);
              setMobileInfoExpanded(false);
              fetchBrandsAndOpen();
            }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
              isDark
                ? "text-zinc-300 hover:text-white hover:bg-white/5"
                : "text-zinc-700 hover:text-zinc-900 hover:bg-black/5"
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            {isMultiOrg ? "조직·브랜드 전환" : "브랜드 전환"}
          </button>

          {/* 설정 */}
          <Link
            href="/settings"
            onClick={() => {
              setMobileAccountMenuOpen(false);
              setMobileInfoExpanded(false);
            }}
            className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
              isDark
                ? "text-zinc-300 hover:text-white hover:bg-white/5"
                : "text-zinc-700 hover:text-zinc-900 hover:bg-black/5"
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            설정
          </Link>

          {/* 정보 및 지원 */}
          <div className="relative">
            <button
              type="button"
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
                isDark
                  ? "text-zinc-300 hover:text-white hover:bg-white/5"
                  : "text-zinc-700 hover:text-zinc-900 hover:bg-black/5"
              }`}
              onClick={() => setMobileInfoExpanded((v) => !v)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span className="flex-1">{t("common.infoSupport")}</span>
              <span
                className="text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                {mobileInfoExpanded ? "▴" : "▾"}
              </span>
            </button>
            {mobileInfoExpanded && (
              <div
                className="px-4 py-2 border-t space-y-2 text-xs"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                <p>
                  <Link
                    href="/terms"
                    className="transition-colors hover:opacity-80"
                    onClick={() => setMobileAccountMenuOpen(false)}
                  >
                    {t("common.termsOfService")}
                  </Link>
                </p>
                <p>
                  <Link
                    href="/privacy"
                    className="transition-colors hover:opacity-80"
                    onClick={() => setMobileAccountMenuOpen(false)}
                  >
                    {t("common.privacyPolicy")}
                  </Link>
                </p>
                <p>
                  <Link
                    href="/blog"
                    className="transition-colors hover:opacity-80"
                    onClick={() => setMobileAccountMenuOpen(false)}
                  >
                    블로그
                  </Link>
                </p>
              </div>
            )}
          </div>

          {/* 로그아웃 */}
          <button
            type="button"
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left ${
              isDark
                ? "text-red-400 hover:text-red-300 hover:bg-white/5"
                : "text-red-600 hover:text-red-700 hover:bg-black/5"
            }`}
            style={{ borderTop: "1px solid var(--border-subtle)" }}
            onClick={async () => {
              setMobileAccountMenuOpen(false);
              await signOut();
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t("common.signOut")}
          </button>
        </div>
      )}

      {/* ── Pack Purchase Modal (SiteHeader 진입점) ─────────── */}
      {user && (
        <PackPurchaseModal
          open={packModalOpen}
          onClose={() => setPackModalOpen(false)}
          onSuccess={() => {
            // 결제 성공 → 헤더 배지 즉시 갱신
            clearPackBalanceCache();
          }}
        />
      )}

      {/* ── Mobile Bottom Nav ──────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 nav-glass"
        style={{
          borderBottom: "none",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <div
          className="flex items-center justify-around px-1 pt-1"
          style={{
            paddingBottom: "calc(0.25rem + env(safe-area-inset-bottom))",
          }}
        >
          {/* 탐색 */}
          <Link
            href={activeBrandId ? bHref("/explore") : "/explore"}
            className={`flex flex-col items-center gap-0.5 flex-1 py-1 rounded-lg text-[10px] font-medium transition-colors ${pathname.startsWith("/explore") ? "text-pink-400" : "text-zinc-400"}`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            탐색
          </Link>
          {/* 대시보드 */}
          <Link
            href={
              activeBrandId ? bp : user ? "/brands" : "/login?next=/brands"
            }
            className={`flex flex-col items-center gap-0.5 flex-1 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              activeBrandId
                ? pathname === bp
                  ? "text-pink-400"
                  : "text-zinc-400"
                : pathname === "/brands" || pathname.startsWith("/brands/")
                  ? "text-pink-400"
                  : "text-zinc-400"
            }`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            대시보드
          </Link>
          {/* 퀵 썸네일 */}
          <Link
            href={
              activeBrandId ? `${bp}/quick` : user ? "/brands" : "/quick"
            }
            className={`flex flex-col items-center gap-0.5 flex-1 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              activeBrandId
                ? pathname.startsWith(`${bp}/quick`)
                  ? "text-pink-400"
                  : "text-zinc-400"
                : pathname === "/quick"
                  ? "text-pink-400"
                  : "text-zinc-400"
            }`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            퀵 썸네일
          </Link>
          {/* 스튜디오 */}
          <Link
            href={
              activeBrandId ? `${bp}/studio` : user ? "/brands" : "/studio"
            }
            className={`flex flex-col items-center gap-0.5 flex-1 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              activeBrandId
                ? pathname.startsWith(`${bp}/studio`)
                  ? "text-pink-400"
                  : "text-zinc-400"
                : pathname === "/studio"
                  ? "text-pink-400"
                  : "text-zinc-400"
            }`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            스튜디오
          </Link>
          {/* 에셋 */}
          <Link
            href={
              activeBrandId
                ? `${bp}/assets`
                : user
                  ? "/brands"
                  : "/login?next=/brands"
            }
            className={`flex flex-col items-center gap-0.5 flex-1 py-1 rounded-lg text-[10px] font-medium transition-colors ${
              activeBrandId
                ? pathname.startsWith(`${bp}/assets`)
                  ? "text-pink-400"
                  : "text-zinc-400"
                : "text-zinc-400"
            }`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            에셋
          </Link>
        </div>
      </nav>
    </>
  );
}
