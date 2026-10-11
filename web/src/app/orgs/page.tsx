"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { PlanBadge } from "@/components/PlanBadge";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";

type OrgItem = {
  id: string;
  name: string;
  plan?: string | null;
  planTier?: number;
  currentPeriodEnd?: string | null;
  brandCount?: number;
  memberCount?: number;
};

function BuildingIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-zinc-400"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

export default function OrgsPage() {
  const { user, loading } = useRequireAuth();
  const { fetchWithAuth } = useFetchWithAuth();

  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setOrgsLoading(true);
    setFetchError(false);
    (async () => {
      try {
        const res = await fetchWithAuth("/api/organizations");
        if (!res.ok) {
          if (!cancelled) setFetchError(true);
          return;
        }
        const data = (await res.json()) as
          | OrgItem[]
          | { organizations?: OrgItem[] };
        if (!cancelled) {
          const list = Array.isArray(data) ? data : (data.organizations ?? []);
          // API 응답 필드 매핑 (서버가 다른 키를 쓸 경우 커버)
          setOrgs(
            list.map((o) => ({
              id: o.id,
              name: o.name,
              plan:
                ((o as Record<string, unknown>).planKey as string | null) ??
                o.plan ??
                null,
              planTier: o.planTier,
              currentPeriodEnd: o.currentPeriodEnd,
              brandCount:
                o.brandCount ??
                (
                  (o as Record<string, unknown>).usage as
                    | { brandCount?: number }
                    | undefined
                )?.brandCount,
              memberCount: o.memberCount,
            })),
          );
        }
      } catch {
        if (!cancelled) setFetchError(true);
      } finally {
        if (!cancelled) setOrgsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, fetchWithAuth]);

  if (loading) return null;
  if (!user) return null;

  return (
    <div
      className="h-dvh overflow-auto"
      style={{ background: "var(--surface-0)" }}
    >
      <SiteHeader />
      <main className="min-h-screen pt-11 lg:pt-14 lg:pl-[var(--sidebar-active-w,var(--sidebar-w-collapsed))] flex justify-center">
        <div
          className="w-full max-w-4xl px-4 sm:px-6 py-10 space-y-8"
          style={{
            paddingBottom:
              "calc(2.5rem + 56px + env(safe-area-inset-bottom))",
          }}
        >
          {/* 페이지 헤더 */}
          <header className="flex items-center justify-between gap-4">
            <h1 className="font-headline text-2xl lg:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              내 Organization
            </h1>
            <Link
              href="/orgs/new"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] sm:min-w-0 px-3 sm:px-4 py-2 rounded-full text-sm font-bold transition-all active:scale-95"
              style={{
                background: "var(--surface-3)",
                border: "1px solid var(--border-hover)",
                color: "var(--text-primary)",
              }}
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
              <span className="hidden sm:inline">새 Organization</span>
            </Link>
          </header>

          {/* 로딩 스켈레톤 */}
          {orgsLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[130px] rounded-2xl animate-pulse"
                  style={{ background: "var(--surface-2)" }}
                />
              ))}
            </div>
          )}

          {/* 에러 */}
          {!orgsLoading && fetchError && (
            <div
              className="rounded-2xl px-6 py-4 text-sm"
              style={{
                color: "#ef4444",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(248,113,113,0.2)",
              }}
            >
              Organization 목록을 불러오지 못했습니다. 다시 시도해주세요.
            </div>
          )}

          {/* 빈 상태 */}
          {!orgsLoading && !fetchError && orgs.length === 0 && (
            <div
              className="flex flex-col items-center justify-center py-24 gap-5 rounded-2xl border border-dashed"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "var(--surface-2)" }}
              >
                <BuildingIcon />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-400">
                  Organization이 없습니다.
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  시작하려면 Organization을 만들어보세요.
                </p>
              </div>
              <Link
                href="/orgs/new"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold transition-all active:scale-95"
                style={{
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-hover)",
                  color: "var(--text-primary)",
                }}
              >
                새 Organization 만들기
              </Link>
            </div>
          )}

          {/* Org 카드 그리드 */}
          {!orgsLoading && !fetchError && orgs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {orgs.map((org) => {
                const renewalDate =
                  org.currentPeriodEnd && org.plan !== "free"
                    ? new Date(org.currentPeriodEnd).toLocaleDateString(
                        "ko-KR",
                        { dateStyle: "medium" },
                      )
                    : null;
                const metaParts: string[] = [];
                if (typeof org.brandCount === "number")
                  metaParts.push(`${org.brandCount} brands`);
                if (typeof org.memberCount === "number")
                  metaParts.push(`${org.memberCount} members`);

                return (
                  <Link
                    key={org.id}
                    href={`/orgs/${org.id}`}
                    className="flex flex-col gap-3 p-5 rounded-2xl transition-all"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "rgba(255,164,198,0.2)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor =
                        "var(--border-subtle)";
                    }}
                  >
                    {/* 상단: 아이콘 + org 이름 */}
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "var(--surface-3)" }}
                      >
                        <BuildingIcon />
                      </div>
                      <p className="text-sm font-bold text-[var(--text-primary)] truncate flex-1">
                        {org.name}
                      </p>
                    </div>

                    {/* 플랜 뱃지 */}
                    {org.plan && (
                      <PlanBadge planKey={org.plan} planTier={org.planTier} />
                    )}

                    {/* 메타 + 갱신일 */}
                    <div className="space-y-0.5">
                      {metaParts.length > 0 && (
                        <p className="text-[11px] text-zinc-500">
                          {metaParts.join(" · ")}
                        </p>
                      )}
                      {renewalDate && (
                        <p className="text-[11px] text-zinc-600">
                          갱신일 {renewalDate}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
