"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useBrand } from "@/components/BrandProvider";
import { useAuth } from "@/components/AuthProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { UsageMeter } from "@/components/UsageMeter";

// ── Types ─────────────────────────────────────────────────────────────────────

type RenderItem = {
  id: string;
  kind: string;
  imageUrl: string;
  createdAt: string;
  aspectRatio: string | null;
};

type StyleRow = {
  id: string;
  status: string;
  created_at: string;
};

type ProductRow = { id: string; name: string; thumbnail_url?: string | null };

type OrgUsage = {
  usage: {
    brandCount: number;
    styleCount: number;
    modelCount: number;
    memberCount: number;
    monthlyGenerations: number;
  };
  limits: {
    generationLimit: number | null;
    styleLimit: number | null;
    modelLimit: number | null;
    memberLimit: number | null;
  };
  plan: {
    planKey: string | null;
    planLabel: string | null;
    planTier: number;
    status: string;
    currentPeriodEnd: string;
  };
} | null;

// ── Date util ─────────────────────────────────────────────────────────────────

function formatKoreanDate(d: Date): string {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 · ${days[d.getDay()]}요일`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NewStatCard({
  label,
  value,
  weeklyDelta,
  dotColor,
  sub,
  href,
}: {
  label: string;
  value: string | number;
  weeklyDelta?: number | null;
  dotColor: string;
  sub?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col justify-between p-5 rounded-2xl border border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)] transition-all"
      style={{ background: "var(--surface-1)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-[color:var(--text-secondary)]">
          {label}
        </span>
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      </div>
      <div className="mt-3">
        <p className="font-headline text-3xl font-bold text-[color:var(--text-primary)] tabular-nums leading-none">
          {value}
        </p>
        {weeklyDelta != null && (
          <p className="text-[11px] text-[color:var(--text-muted)] mt-1">
            +{weeklyDelta} 이번주
          </p>
        )}
        {sub && (
          <p className="text-[11px] text-[color:var(--text-muted)] mt-1">
            {sub}
          </p>
        )}
      </div>
    </Link>
  );
}

function RecentImagesRow({
  renders,
  brandId,
}: {
  renders: RenderItem[];
  brandId: string;
}) {
  const display = renders.slice(0, 8);
  const href = `/${brandId}/assets?tab=renders`;
  return (
    <div className="px-6 pb-6">
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
          const r = display[idx];
          return (
            <Link
              key={idx}
              href={href}
              className="relative rounded-lg overflow-hidden group block aspect-square"
              style={{ background: "var(--surface-2)" }}
            >
              {r ? (
                <img
                  src={r.imageUrl}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center rounded-lg border border-dashed"
                  style={{ borderColor: "var(--border-subtle)" }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function QuickActionItem({
  href,
  title,
  sub,
}: {
  href: string;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)] transition-all group"
      style={{ background: "var(--surface-2)" }}
    >
      <div
        className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
        style={{ background: "rgba(255,164,198,0.08)" }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffa4c6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[color:var(--text-primary)] leading-tight">
          {title}
        </p>
        <p className="text-xs text-[color:var(--text-secondary)] mt-0.5 truncate">
          {sub}
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
        className="text-[color:var(--text-muted)] group-hover:text-[color:var(--text-secondary)] transition-colors shrink-0"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BrandOverviewPage() {
  const { brand, brandId, loading, error } = useBrand();
  const { user } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();

  // Dashboard data
  const [renders, setRenders] = useState<RenderItem[]>([]);
  const [totalRenders, setTotalRenders] = useState(0);
  const [weeklyRenderCount, setWeeklyRenderCount] = useState<number | null>(
    null,
  );
  const [productCount, setProductCount] = useState(0);
  const [modelCount, setModelCount] = useState(0);
  const [styles, setStyles] = useState<StyleRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // New state
  const [credits, setCredits] = useState<number | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(true);
  const [nickname, setNickname] = useState<string | null>(null);
  const [orgUsage, setOrgUsage] = useState<OrgUsage>(null);

  const displayName = dataLoading ? null : (nickname ?? "사용자");

  const loadDashboard = useCallback(async () => {
    if (!brandId) return;
    setDataLoading(true);
    try {
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [rendersRes, prodRes, stylesRes, meRes, creditsRes, modelsRes] =
        await Promise.all([
          fetchWithAuth(
            `/api/renders?brandId=${brandId}&since=${sevenDaysAgo}`,
          ).catch(() => null),
          fetchWithAuth(`/api/brands/${brandId}/products`).catch(() => null),
          fetchWithAuth(`/api/brands/${brandId}/styles`).catch(() => null),
          user?.id
            ? fetchWithAuth(`/api/users/${user.id}/profile`).catch(() => null)
            : Promise.resolve(null),
          fetchWithAuth("/api/credits/balance").catch(() => null),
          fetchWithAuth(`/api/personas?brandId=${brandId}`).catch(() => null),
        ]);

      if (rendersRes?.ok) {
        const d = (await rendersRes.json()) as {
          renders: RenderItem[];
          total?: number;
          weeklyTotal?: number | null;
        };
        setRenders(d.renders ?? []);
        setTotalRenders(d.total ?? (d.renders ?? []).length);
        setWeeklyRenderCount(d.weeklyTotal ?? null);
      }

      if (prodRes?.ok) {
        const d = await prodRes.json();
        const prods = (d as { products: ProductRow[] }).products ?? [];
        setProductCount(prods.length);
      }

      if (stylesRes?.ok) {
        const d = await stylesRes.json();
        setStyles((d as { styles: StyleRow[] }).styles ?? []);
      }

      if (meRes?.ok) {
        const d = await meRes.json().catch(() => null);
        if (d?.nickname) setNickname(d.nickname);
      }

      if (creditsRes && creditsRes.ok) {
        try {
          const d = await creditsRes.json();
          if (d && typeof d.balance === "number") {
            setCredits(d.balance);
          }
        } catch {
          // credits 파싱 실패 시 무시
        }
      }

      if (modelsRes?.ok) {
        const d = (await modelsRes.json()) as { models: { id: string }[] };
        setModelCount((d.models ?? []).length);
      }
    } finally {
      setDataLoading(false);
    }
  }, [brandId, fetchWithAuth, user?.id]);

  useEffect(() => {
    if (!brandId) return;
    loadDashboard();
  }, [brandId, loadDashboard]);

  // 조직 사용량 fetch — 메인 로딩과 분리하여 대시보드 지연 방지
  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;

    (async () => {
      try {
        const orgsRes = await fetchWithAuth("/api/organizations");
        if (!orgsRes?.ok || cancelled) return;
        const orgsData = (await orgsRes.json()) as {
          organizations: { id: string }[];
        };
        const firstOrgId = orgsData.organizations[0]?.id;
        if (!firstOrgId || cancelled) return;

        const orgRes = await fetchWithAuth(`/api/organizations/${firstOrgId}`);
        if (!orgRes?.ok || cancelled) return;
        const orgData = await orgRes.json();
        if (!cancelled) setOrgUsage(orgData as OrgUsage);
      } catch {
        // 실패 시 orgUsage null 유지 (카드 숨김)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [brandId, fetchWithAuth]);

  // Refresh recent images when a new image is generated anywhere in this brand workspace
  useEffect(() => {
    function onGenComplete() {
      loadDashboard();
    }
    window.addEventListener("wonka:image-generated", onGenComplete);
    return () =>
      window.removeEventListener("wonka:image-generated", onGenComplete);
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 bg-[var(--surface-2)] rounded-lg" />
        <div className="h-28 bg-[var(--surface-2)] rounded-xl" />
        <div className="h-28 bg-[var(--surface-2)] rounded-xl" />
      </div>
    );
  }

  if (error || !brand) {
    return (
      <div className="text-center">
        <p className="text-red-400 text-sm">
          {error ?? "브랜드를 찾을 수 없습니다"}
        </p>
        <Link
          href="/brands"
          className="text-pink-400 text-sm mt-2 inline-block"
        >
          ← 브랜드 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* ── 헤더 ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {/* 브랜드 아바타 */}
          {(() => {
            const c = brand.color ?? brand.primaryColor ?? "#ffa4c6";
            const logo = brand.logoUrl ?? brand.logo_url;
            return logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logo}
                alt=""
                className="w-12 h-12 rounded-xl object-cover shrink-0"
                style={{ border: `1px solid ${c}40` }}
              />
            ) : (
              <div
                className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-lg font-bold text-white"
                style={{ background: c }}
              >
                {(brand.name ?? "?")[0].toUpperCase()}
              </div>
            );
          })()}
          {/* 텍스트 */}
          <div className="min-w-0">
            <p className="text-xs text-[color:var(--text-secondary)] mb-0.5">
              {brand.name}
            </p>
            <h1 className="font-headline text-2xl font-bold text-[color:var(--text-primary)] leading-tight">
              안녕하세요,{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {displayName}
              </span>
              님
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/settings?tab=brand`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-all"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
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
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            브랜드 설정
          </Link>
        </div>
      </header>

      {/* ── 12-col 그리드 ────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">
        {/* ── 시작 가이드 ─────────────────────────── col-span-12 */}
        {!dataLoading &&
          (() => {
            const profileDone = !!(brand.meta?.industry || brand.meta?.tagline);

            const doneFlags = [
              profileDone, // 1: 브랜드 프로필 설정
              productCount > 0, // 2: 첫 번째 제품 등록
              modelCount > 0, // 3: 모델 생성
              styles.length > 0, // 4: 커스텀 스타일 생성
              renders.length > 0, // 5: 첫 번째 이미지 생성
            ];

            const steps: {
              title: string;
              desc: string;
              href: string;
              cta: string;
            }[] = [
              {
                title: "브랜드 프로필 설정",
                desc: "산업군, 브랜드 소개 등 기본 정보 입력",
                href: `/settings?tab=brand`,
                cta: "설정하기",
              },
              {
                title: "첫 번째 제품 등록",
                desc: "제품명, 카테고리, 패키징 등록",
                href: `/${brandId}/products/new`,
                cta: "등록하기",
              },
              {
                title: "모델 생성",
                desc: "광고에 사용할 AI 모델 생성",
                href: `/${brandId}/models/new`,
                cta: "만들기",
              },
              {
                title: "커스텀 스타일 생성",
                desc: "브랜드 비주얼 스타일 만들기",
                href: `/${brandId}/styles/new`,
                cta: "만들기",
              },
              {
                title: "첫 번째 이미지 생성",
                desc: "브랜드 스타일로 이미지 만들기",
                href: `/${brandId}/studio`,
                cta: "만들기",
              },
            ];

            const doneCount = doneFlags.filter(Boolean).length;
            const pct = Math.round((doneCount / steps.length) * 100);
            const remaining = steps.length - doneCount;

            return (
              <div
                className="col-span-12 rounded-2xl overflow-hidden"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {/* 헤더 */}
                <div
                  className="flex sm:flex-row flex-col sm:items-center px-5 py-4 cursor-pointer select-none gap-0 sm:gap-3"
                  onClick={() => setOnboardingOpen((v) => !v)}
                >
                  {/* 행 1: 아이콘 + 텍스트 + 토글 */}
                  <div className="flex items-center gap-3 w-full sm:w-auto sm:flex-1">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "rgba(255,164,198,0.15)" }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ffa4c6"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                      </svg>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[color:var(--text-primary)] leading-tight">
                        시작 가이드
                      </p>
                      <p className="hidden sm:block text-xs text-[color:var(--text-secondary)] mt-0.5">
                        {doneCount}/{steps.length} 완료 · 약 {remaining}분 남음
                      </p>
                    </div>

                    {/* 토글: 모바일 32x32, 데스크톱 24x24 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setOnboardingOpen((v) => !v); }}
                      className="w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center shrink-0 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-all"
                      style={{
                        transform: onboardingOpen ? "rotate(0deg)" : "rotate(180deg)",
                        transition: "transform 0.2s",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 15l-6-6-6 6" />
                      </svg>
                    </button>
                  </div>

                  {/* 행 2 (모바일) / 행 1 우측 그룹 (데스크톱): 진행도바 + 퍼센트 */}
                  <div className="flex items-center gap-2 mt-2 sm:mt-0 sm:ml-auto sm:flex-none">
                    <div
                      className="flex-1 sm:flex-none sm:w-32 h-1.5 rounded-full overflow-hidden"
                      style={{ background: "var(--surface-3)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: "linear-gradient(90deg, #ffa4c6, #ffe3be)",
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-bold tabular-nums shrink-0"
                      style={{ color: "#ffa4c6" }}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>

                {/* 스텝 목록 */}
                {onboardingOpen && (
                  <div>
                    {steps.map((step, idx) => {
                      const done = doneFlags[idx];
                      return (
                        <div key={idx}>
                          <div
                            style={{
                              height: "1px",
                              background: "rgba(0,0,0,0.08)",
                            }}
                          />
                          <div className="flex items-center gap-4 px-5 py-4">
                            {/* 아이콘 */}
                            {done ? (
                              <div
                                className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center"
                                style={{
                                  background: "rgba(74,222,128,0.15)",
                                }}
                              >
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#4ade80"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </div>
                            ) : (
                              <div
                                className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold"
                                style={{
                                  border: "1px solid rgba(255,164,198,0.6)",
                                  color: "#ffa4c6",
                                  background: "rgba(255,164,198,0.1)",
                                }}
                              >
                                {idx + 1}
                              </div>
                            )}
                            {/* 텍스트 */}
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm font-medium leading-tight ${done ? "text-[color:var(--text-muted)]" : "text-[color:var(--text-primary)]"}`}
                              >
                                {step.title}
                              </p>
                              {step.desc && (
                                <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                                  {step.desc}
                                </p>
                              )}
                            </div>
                            {/* 우측 액션 */}
                            {done ? null : (
                              <Link
                                href={step.href}
                                className="shrink-0 px-4 py-2 rounded-xl text-sm font-bold text-black transition-all hover:opacity-90"
                                style={{
                                  background:
                                    "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                                }}
                              >
                                {step.cta}
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        {/* ── 플랜 사용량 ─────────────────────────────── col-span-12 */}
        {orgUsage ? (
          <div
            className="col-span-12 rounded-2xl border overflow-hidden"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--border-subtle)",
            }}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <h3 className="font-bold text-base text-[color:var(--text-primary)]">
                  플랜 사용량
                </h3>
                {(() => {
                  const d = new Date(orgUsage.plan.currentPeriodEnd);
                  const showReset =
                    d.getFullYear() < 9999 && orgUsage.plan.status !== "free";
                  if (!showReset) return null;
                  return (
                    <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                      {d.toLocaleDateString("ko-KR", {
                        month: "long",
                        day: "numeric",
                      })}
                      에 초기화
                    </p>
                  );
                })()}
              </div>
              {[
                orgUsage.limits.generationLimit,
                orgUsage.limits.styleLimit,
                orgUsage.limits.modelLimit,
                orgUsage.limits.memberLimit,
              ].some((l) => l !== null) && (
                <Link
                  href="/settings?tab=billing"
                  className="text-xs font-medium text-[color:var(--text-secondary)] hover:text-pink-400 transition-colors flex items-center gap-1"
                >
                  플랜 업그레이드
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              )}
            </div>
            {/* 미터 그리드 */}
            <div className="px-6 pb-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <UsageMeter
                  label="이미지 생성 (이번 달)"
                  current={orgUsage.usage.monthlyGenerations}
                  limit={orgUsage.limits.generationLimit}
                />
                <UsageMeter
                  label="스타일"
                  current={orgUsage.usage.styleCount}
                  limit={orgUsage.limits.styleLimit}
                />
                <UsageMeter
                  label="모델"
                  current={orgUsage.usage.modelCount}
                  limit={orgUsage.limits.modelLimit}
                />
                <UsageMeter
                  label="팀원"
                  current={orgUsage.usage.memberCount}
                  limit={orgUsage.limits.memberLimit}
                />
              </div>
            </div>
          </div>
        ) : dataLoading ? (
          /* 로딩 스켈레톤 */
          <div
            className="col-span-12 rounded-2xl border overflow-hidden"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="flex items-center justify-between px-6 py-4">
              <div className="space-y-1.5">
                <div className="h-4 w-28 rounded-lg bg-[var(--surface-2)] animate-pulse" />
                <div className="h-3 w-40 rounded-lg bg-[var(--surface-2)] animate-pulse" />
              </div>
              <div className="h-3 w-20 rounded-lg bg-[var(--surface-2)] animate-pulse" />
            </div>
            <div className="px-6 pb-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl animate-pulse"
                  style={{ background: "var(--surface-2)" }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* ── 스탯 카드 4개 ─────────────────────────────── col-span-12 */}
        <div className="col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {dataLoading ? (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-32 rounded-2xl bg-[var(--surface-2)] animate-pulse"
                />
              ))}
            </>
          ) : (
            <>
              <NewStatCard
                label="생성된 이미지"
                value={totalRenders}
                dotColor="bg-pink-400"
                href={`/${brandId}/assets?tab=renders`}
              />
              <NewStatCard
                label="스타일"
                value={styles.length}
                dotColor="bg-purple-400"
                href={`/${brandId}/assets?tab=styles`}
              />
              <NewStatCard
                label="모델"
                value={modelCount}
                dotColor="bg-blue-400"
                href={`/${brandId}/assets?tab=models`}
              />
              <NewStatCard
                label="제품"
                value={productCount}
                dotColor="bg-yellow-400"
                href={`/${brandId}/assets?tab=products`}
              />
            </>
          )}
        </div>

        {/* ── 최근 이미지 ───────────────────────────── col-span-8 */}
        <div
          className="col-span-12 lg:col-span-8 rounded-2xl border overflow-hidden flex flex-col"
          style={{
            background: "var(--surface-1)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-start justify-between px-6 py-4">
            <div>
              <h3 className="font-headline text-base font-bold text-[color:var(--text-primary)]">
                최근 이미지
              </h3>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                지난 7일간 {weeklyRenderCount ?? "..."}장
              </p>
            </div>
            <Link
              href={`/${brandId}/assets?tab=renders`}
              className="text-xs font-medium text-[color:var(--text-secondary)] hover:text-pink-400 transition-colors flex items-center gap-1 mt-1"
            >
              전체 보기
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          </div>
          {dataLoading ? (
            <div className="px-6 pb-6 flex-1">
              <div className="h-40 rounded-xl bg-[var(--surface-2)] animate-pulse" />
            </div>
          ) : renders.length === 0 ? (
            <div className="px-6 pb-6">
              <div
                className="flex flex-col items-center justify-center h-40 gap-3 rounded-xl border border-dashed"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-[color:var(--text-muted)]"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <p className="text-sm text-[color:var(--text-secondary)] font-headline">
                  생성된 이미지가 없습니다
                </p>
                <Link
                  href={`/${brandId}/studio`}
                  className="text-xs text-pink-400 hover:text-pink-300 transition-colors"
                >
                  스튜디오에서 이미지 생성하기 →
                </Link>
              </div>
            </div>
          ) : (
            <RecentImagesRow renders={renders} brandId={brandId!} />
          )}
        </div>

        {/* ── 빠른 실행 ─────────────────────────────── col-span-4 */}
        <div
          className="col-span-12 lg:col-span-4 rounded-2xl border overflow-hidden"
          style={{
            background: "var(--surface-1)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="px-6 py-4 pb-2">
            <h3 className="font-headline text-base font-bold text-[color:var(--text-primary)]">
              빠른 실행
            </h3>
          </div>
          <div className="px-4 pb-4 space-y-2">
            <QuickActionItem
              href={`/${brandId}/quick`}
              title="쿠팡·스마트스토어 썸네일"
              sub="one-click 퀵 썸네일 생성"
            />
            <QuickActionItem
              href={`/${brandId}/studio`}
              title="새 이미지 만들기"
              sub="AI 스튜디오 바로 가기"
            />
            <QuickActionItem
              href={`/${brandId}/styles/new`}
              title="스타일 만들기"
              sub="레퍼런스 이미지 분석"
            />
            <QuickActionItem
              href={`/${brandId}/products/new`}
              title="제품 등록하기"
              sub="새 제품 추가"
            />
            <QuickActionItem
              href={`/${brandId}/models/new`}
              title="모델 만들기"
              sub="AI 모델 등록"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
