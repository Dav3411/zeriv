"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { PlanBadge } from "@/components/PlanBadge";
import { UsageMeter } from "@/components/UsageMeter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";

type OrgMeta = {
  id: string;
  name: string;
  plan?: {
    planKey?: string | null;
    planLabel?: string | null;
    planTier?: number;
    currentPeriodEnd?: string | null;
  };
  usage?: {
    monthlyGenerations?: number;
    styleCount?: number;
    modelCount?: number;
    memberCount?: number;
  };
  limits?: {
    generationLimit?: number | null;
    styleLimit?: number | null;
    modelLimit?: number | null;
    memberLimit?: number | null;
  };
};

type BrandItem = {
  id: string;
  name: string;
  primaryColor?: string | null;
  logoUrl?: string | null;
};

type MemberItem = {
  id: string;
  userId: string;
  nickname?: string | null;
  email?: string | null;
  role: string;
};

export default function OrgDetailPage() {
  const { user, loading } = useRequireAuth();
  const { fetchWithAuth } = useFetchWithAuth();
  const params = useParams<{ id: string }>();
  const orgId = params.id;

  const [org, setOrg] = useState<OrgMeta | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);

  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Org 메타 + 사용량 + 플랜
  useEffect(() => {
    if (!user || !orgId) return;
    let cancelled = false;
    setOrgLoading(true);
    setOrgError(null);
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/organizations/${orgId}`);
        if (!res.ok) {
          if (!cancelled) {
            if (res.status === 404)
              setOrgError("Organization을 찾을 수 없습니다.");
            else if (res.status === 403)
              setOrgError("이 Organization에 접근할 권한이 없습니다.");
            else setOrgError("Organization 정보를 불러올 수 없습니다.");
          }
          return;
        }
        const data = (await res.json()) as OrgMeta;
        if (!cancelled) setOrg(data);
      } catch {
        if (!cancelled) setOrgError("네트워크 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setOrgLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, orgId, fetchWithAuth]);

  // 브랜드 목록
  useEffect(() => {
    if (!user || !orgId) return;
    let cancelled = false;
    setBrandsLoading(true);
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/brands?org_id=${orgId}`);
        if (!res.ok) return;
        const data = (await res.json()) as
          | BrandItem[]
          | { brands?: BrandItem[] };
        if (!cancelled) {
          const list = Array.isArray(data) ? data : (data.brands ?? []);
          setBrands(list);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setBrandsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, orgId, fetchWithAuth]);

  // 멤버 목록
  useEffect(() => {
    if (!user || !orgId) return;
    let cancelled = false;
    setMembersLoading(true);
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/organizations/${orgId}/members`);
        if (!res.ok) return;
        const data = (await res.json()) as
          | MemberItem[]
          | { members?: MemberItem[] };
        if (!cancelled) {
          const list = Array.isArray(data) ? data : (data.members ?? []);
          setMembers(list);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, orgId, fetchWithAuth]);

  const planKey = org?.plan?.planKey ?? null;
  const planTier = org?.plan?.planTier;
  const renewalDate =
    org?.plan?.currentPeriodEnd && planKey !== "free"
      ? new Date(org.plan.currentPeriodEnd).toLocaleDateString("ko-KR", {
          dateStyle: "medium",
        })
      : null;

  const usageMetrics = useMemo(
    () => [
      {
        label: "이미지 생성",
        current: org?.usage?.monthlyGenerations ?? 0,
        limit: org?.limits?.generationLimit ?? null,
      },
      {
        label: "스타일",
        current: org?.usage?.styleCount ?? 0,
        limit: org?.limits?.styleLimit ?? null,
      },
      {
        label: "모델",
        current: org?.usage?.modelCount ?? 0,
        limit: org?.limits?.modelLimit ?? null,
      },
      {
        label: "팀원",
        current: org?.usage?.memberCount ?? 0,
        limit: org?.limits?.memberLimit ?? null,
      },
    ],
    [org],
  );

  if (loading) return null;
  if (!user) return null;

  const orgName = org?.name ?? "Organization";

  return (
    <div
      className="h-dvh overflow-auto"
      style={{ background: "var(--surface-0)" }}
    >
      <SiteHeader />
      <main className="min-h-screen pt-11 lg:pt-14 lg:pl-[var(--sidebar-active-w,var(--sidebar-w-collapsed))]">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-[calc(2.5rem+56px+env(safe-area-inset-bottom))] lg:pb-10 space-y-8">
          {orgError ? (
            <div
              className="rounded-2xl px-6 py-10 text-center"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <p className="text-sm text-zinc-400 mb-4">{orgError}</p>
              <Link
                href="/orgs"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Organization 목록으로
              </Link>
            </div>
          ) : (
            <>
              {/* 페이지 헤더 */}
              <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Link
                    href="/orgs"
                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label="뒤로"
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
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </Link>
                  {orgLoading ? (
                    <div
                      className="h-8 w-40 rounded-lg animate-pulse"
                      style={{ background: "var(--surface-3)" }}
                    />
                  ) : (
                    <div className="flex items-center gap-2.5">
                      <h1 className="font-headline text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                        {orgName}
                      </h1>
                      {planKey && (
                        <PlanBadge
                          planKey={planKey}
                          planTier={planTier}
                          size="md"
                        />
                      )}
                    </div>
                  )}
                </div>
                <Link
                  href={`/pricing?org_id=${orgId}`}
                  className="self-start sm:self-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  플랜 변경 →
                </Link>
              </header>

              {/* 메인 그리드 */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 좌측: 브랜드 섹션 */}
                <div className="lg:col-span-2 space-y-6">
                  <div
                    className="rounded-2xl"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      className="px-5 py-3 flex items-center justify-between"
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                        브랜드
                      </h2>
                      <Link
                        href={`/brands/new?org_id=${orgId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <svg
                          width="12"
                          height="12"
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
                        새 브랜드
                      </Link>
                    </div>

                    {brandsLoading ? (
                      <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-16 rounded-xl animate-pulse"
                            style={{ background: "var(--surface-2)" }}
                          />
                        ))}
                      </div>
                    ) : brands.length === 0 ? (
                      <div className="px-5 py-8 flex flex-col items-center gap-3">
                        <p className="text-sm text-zinc-500">
                          브랜드가 없습니다.
                        </p>
                        <Link
                          href={`/brands/new?org_id=${orgId}`}
                          className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          + 첫 브랜드 만들기
                        </Link>
                      </div>
                    ) : (
                      <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {brands.map((b) => {
                          const bc = b.primaryColor ?? "#ffa4c6";
                          return (
                            <Link
                              key={b.id}
                              href={`/${b.id}`}
                              className="flex items-center gap-3 p-3 rounded-xl transition-all min-h-[44px]"
                              style={{
                                background: "var(--surface-2)",
                                border: "1px solid var(--border-subtle)",
                              }}
                              onMouseEnter={(e) => {
                                (
                                  e.currentTarget as HTMLElement
                                ).style.borderColor = "var(--border-default)";
                              }}
                              onMouseLeave={(e) => {
                                (
                                  e.currentTarget as HTMLElement
                                ).style.borderColor = "var(--border-subtle)";
                              }}
                            >
                              {b.logoUrl ? (
                                <img
                                  src={b.logoUrl}
                                  alt={b.name}
                                  className="w-8 h-8 rounded-md object-cover shrink-0"
                                />
                              ) : (
                                <div
                                  className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center text-xs font-bold text-white"
                                  style={{ background: bc }}
                                >
                                  {b.name[0]?.toUpperCase() ?? "?"}
                                </div>
                              )}
                              <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                {b.name}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* 우측: 사이드 패널 */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-1 lg:gap-y-4">
                  {/* 현재 플랜 패널 */}
                  <div
                    className="rounded-2xl"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      className="px-4 py-3"
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        현재 플랜
                      </h3>
                    </div>
                    <div className="px-4 py-4 space-y-3">
                      {orgLoading ? (
                        <div
                          className="h-12 rounded-lg animate-pulse"
                          style={{ background: "var(--surface-2)" }}
                        />
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <PlanBadge
                              planKey={planKey}
                              planTier={planTier}
                              size="md"
                            />
                            <Link
                              href={`/pricing?org_id=${orgId}`}
                              className="text-[11px] text-pink-400 hover:text-pink-300 transition-colors"
                            >
                              플랜 변경 →
                            </Link>
                          </div>
                          {renewalDate && (
                            <p className="text-[11px] text-zinc-500">
                              다음 갱신일: {renewalDate}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* 이번 달 사용량 패널 */}
                  <div
                    className="rounded-2xl min-w-0"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      className="px-4 py-3"
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        이번 달 사용량
                      </h3>
                    </div>
                    <div className="px-4 py-4 space-y-2">
                      {orgLoading ? (
                        <div
                          className="h-20 rounded-lg animate-pulse"
                          style={{ background: "var(--surface-2)" }}
                        />
                      ) : (
                        usageMetrics.map((m) => (
                          <UsageMeter
                            key={m.label}
                            label={m.label}
                            current={m.current}
                            limit={m.limit}
                          />
                        ))
                      )}
                    </div>
                  </div>

                  {/* 멤버 패널 */}
                  <div
                    className="rounded-2xl col-span-2 lg:col-span-1"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      className="px-4 py-3"
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">멤버</h3>
                    </div>
                    <div className="px-4 py-3 space-y-1">
                      {membersLoading ? (
                        <div
                          className="h-12 rounded-lg animate-pulse"
                          style={{ background: "var(--surface-2)" }}
                        />
                      ) : members.length === 0 ? (
                        <p className="text-xs text-zinc-500 py-2">
                          멤버가 없습니다.
                        </p>
                      ) : (
                        <>
                          {members.slice(0, 5).map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-2.5 py-1.5"
                            >
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                style={{
                                  background: "var(--surface-3)",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {(m.nickname ??
                                  m.email ??
                                  "?")[0].toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-zinc-300 truncate">
                                  {m.nickname ?? m.email ?? m.userId}
                                </p>
                              </div>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0"
                                style={{
                                  background:
                                    m.role === "owner"
                                      ? "rgba(244,114,182,0.15)"
                                      : "var(--surface-3)",
                                  color:
                                    m.role === "owner"
                                      ? "#f472b6"
                                      : "var(--text-secondary)",
                                }}
                              >
                                {m.role === "owner" ? "오너" : "멤버"}
                              </span>
                            </div>
                          ))}
                          {members.length > 5 && (
                            <p className="text-[11px] text-zinc-600 pt-1">
                              외 {members.length - 5}명 더
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
