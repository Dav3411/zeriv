"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface OverviewData {
  activeOrgs: number;
  paidOrgs: number;
  totalUsers: number;
  monthlyImagesTotal: number;
  monthlySignalsTotal: number;
  todaySignalsTotal: number;
  estimatedMrrKrw: number;
}

interface PlanDistEntry {
  planKey: string;
  count: number;
  mrrKrw: number;
}

interface SignalTypeEntry {
  signalType: string;
  count: number;
}

interface TopOrg {
  orgId: string;
  orgName: string;
  signalCount: number;
  planKey: string | null;
}

interface TopStyle {
  styleId: string;
  styleName: string;
  brandName: string;
  likes: number;
  score: number;
}

interface RecentOrg {
  orgId: string;
  orgName: string;
  ownerEmail: string | null;
  createdAt: string;
}

interface RecentOrder {
  orderId: string;
  orgName: string | null;
  planKey: string;
  amountKrw: number;
  paidAt: string;
}

interface DashboardData {
  ok: true;
  generatedAt: string;
  overview: OverviewData;
  planDistribution: PlanDistEntry[];
  signalsByType: SignalTypeEntry[];
  topActiveOrgs: TopOrg[];
  topLikedStyles: TopStyle[];
  recentOrgs: RecentOrg[];
  recentOrders: RecentOrder[];
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  quick_plus: "Quick Plus",
  starter: "Atelier",
  label: "Label",
  pro: "Pro",
  studio: "House",
  // legacy = 시장 진입 단계 hidden 플랜 (Label + Pro + House) 합산
  legacy: "기타 (legacy)",
};

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: "bg-zinc-700 text-zinc-300",
  quick_plus: "bg-pink-950/60 text-pink-300",
  starter: "bg-blue-900/60 text-blue-300",
  label: "bg-violet-900/60 text-violet-300",
  pro: "bg-amber-900/60 text-amber-300",
  studio: "bg-pink-900/60 text-pink-300",
  legacy: "bg-zinc-800 text-zinc-400",
};

const SIGNAL_LABELS: Record<string, string> = {
  download: "다운로드",
  feedback_positive: "좋아요",
  feedback_negative: "싫어요",
  style_reuse: "스타일 재사용",
  variation_request: "변형 요청",
};

function fmtKrw(n: number): string {
  if (n === 0) return "0원";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M원`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function fmtDate(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── 소형 카드 컴포넌트 ────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 flex flex-col gap-1">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
        {label}
      </div>
      <div className="text-2xl font-bold text-zinc-100">{value}</div>
      {sub && <div className="text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

// ─── CSS 막대 차트 ─────────────────────────────────────────────────────────────

function PlanBar({
  entry,
  maxCount,
}: {
  entry: PlanDistEntry;
  maxCount: number;
}) {
  const pct = maxCount > 0 ? Math.round((entry.count / maxCount) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 text-right text-sm font-medium text-zinc-300 shrink-0">
        {PLAN_LABELS[entry.planKey] ?? entry.planKey}
      </div>
      <div className="flex-1 bg-zinc-700 rounded-full h-5 overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-8 text-sm font-bold text-emerald-400 shrink-0">
        {entry.count}
      </div>
      <div className="w-20 text-xs text-zinc-500 text-right shrink-0">
        {entry.mrrKrw > 0 ? fmtKrw(entry.mrrKrw) : "—"}
      </div>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function PerformanceDashboardPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 인증 리다이렉트
  useEffect(() => {
    if (authLoading) return;
    if (!user && typeof window !== "undefined") {
      const next = window.location.pathname || "/admin/performance";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [authLoading, user, router]);

  async function fetchDashboard() {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/performance/dashboard", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (res.status === 401 || res.status === 403) {
        setError("권한이 없습니다. 어드민 계정으로 로그인하세요.");
        return;
      }
      const json = (await res.json()) as DashboardData | { error?: string };
      if (!res.ok || !("ok" in json)) {
        throw new Error(
          ("error" in json ? json.error : null) ?? "대시보드 데이터 로드 실패",
        );
      }
      setData(json as DashboardData);
      setLastFetched(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "대시보드 데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  }

  // 최초 fetch + 60초 자동 새로고침
  useEffect(() => {
    if (!session?.access_token) return;
    fetchDashboard();
    intervalRef.current = setInterval(fetchDashboard, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  const d = data;
  const maxPlanCount = d
    ? Math.max(...d.planDistribution.map((e) => e.count), 1)
    : 1;
  const maxSignalCount = d
    ? Math.max(...d.signalsByType.map((e) => e.count), 1)
    : 1;

  return (
    <>
      {/* 헤더 */}
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-100">
              성과 대시보드
            </div>
            <div className="mt-1 text-sm text-zinc-400">
              운영 지표 한눈에 보기 — 자동 새로고침 60초
              {lastFetched && (
                <span className="ml-2 text-zinc-500">
                  (마지막 업데이트: {fmtDate(lastFetched.toISOString())})
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading}
            className="shrink-0 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "불러오는 중…" : "새로고침"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-950/50 border border-red-800 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {!d && loading && (
        <div className="text-center py-20 text-zinc-500">
          데이터를 불러오는 중…
        </div>
      )}

      {d && (
        <div className="space-y-6">
          {/* 1. Overview KPI 카드 */}
          <section>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard
                label="활성 Org"
                value={fmtNum(d.overview.activeOrgs)}
                sub={`유료 ${fmtNum(d.overview.paidOrgs)}개 포함`}
              />
              <KpiCard
                label="총 사용자"
                value={fmtNum(d.overview.totalUsers)}
                sub="멤버십 distinct"
              />
              <KpiCard
                label="추정 MRR"
                value={fmtKrw(d.overview.estimatedMrrKrw)}
                sub="활성 구독 합산"
              />
              <KpiCard
                label="이번 달 이미지"
                value={fmtNum(d.overview.monthlyImagesTotal)}
                sub={new Date().toISOString().slice(0, 7)}
              />
              <KpiCard
                label="이번 달 신호"
                value={fmtNum(d.overview.monthlySignalsTotal)}
                sub="creative signals"
              />
              <KpiCard
                label="오늘 신호"
                value={fmtNum(d.overview.todaySignalsTotal)}
                sub="오늘 자정 기준"
              />
              <KpiCard
                label="유료 전환율"
                value={
                  d.overview.activeOrgs > 0
                    ? `${Math.round((d.overview.paidOrgs / d.overview.activeOrgs) * 100)}%`
                    : "0%"
                }
                sub={`${d.overview.paidOrgs} / ${d.overview.activeOrgs}`}
              />
              <KpiCard
                label="유저당 MRR"
                value={
                  d.overview.totalUsers > 0
                    ? fmtKrw(
                        Math.round(
                          d.overview.estimatedMrrKrw / d.overview.totalUsers,
                        ),
                      )
                    : "0원"
                }
                sub="ARPU 근사값"
              />
            </div>
          </section>

          {/* 2. 플랜 분포 */}
          <section className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">
              플랜 분포 (활성 구독 기준)
            </h2>
            <div className="space-y-3">
              {d.planDistribution.map((entry) => (
                <PlanBar
                  key={entry.planKey}
                  entry={entry}
                  maxCount={maxPlanCount}
                />
              ))}
            </div>
            <div className="mt-3 text-xs text-zinc-400">
              총 MRR:{" "}
              <span className="font-semibold text-emerald-400">
                {fmtKrw(d.overview.estimatedMrrKrw)}
              </span>
              {" · "}House 플랜은 문의 계약으로 MRR 0 처리
            </div>
          </section>

          {/* 3. 신호 타입별 */}
          <section className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">
              신호 타입별 (이번 달)
            </h2>
            {d.signalsByType.length === 0 ? (
              <div className="text-sm text-zinc-400">이번 달 신호 없음</div>
            ) : (
              <div className="space-y-2">
                {d.signalsByType.map((entry) => {
                  const pct = Math.round((entry.count / maxSignalCount) * 100);
                  return (
                    <div
                      key={entry.signalType}
                      className="flex items-center gap-3"
                    >
                      <div className="w-24 text-right text-xs font-medium text-zinc-300 shrink-0">
                        {SIGNAL_LABELS[entry.signalType] ?? entry.signalType}
                      </div>
                      <div className="flex-1 bg-zinc-700 rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-12 text-sm font-bold text-zinc-100 text-right shrink-0">
                        {fmtNum(entry.count)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. 활성 Top Org (이번 주) */}
          <section className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">
              활성 Top Org (최근 7일)
            </h2>
            {d.topActiveOrgs.length === 0 ? (
              <div className="text-sm text-zinc-400">데이터 없음</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="pb-2 text-left text-xs font-medium text-zinc-400 w-8">
                      #
                    </th>
                    <th className="pb-2 text-left text-xs font-medium text-zinc-400">
                      Org
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-zinc-400">
                      신호 수
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-zinc-400 w-24">
                      플랜
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.topActiveOrgs.map((org, i) => (
                    <tr
                      key={org.orgId}
                      className="border-b border-zinc-800 hover:bg-zinc-800 transition-colors"
                    >
                      <td className="py-2 text-zinc-400 font-mono text-xs">
                        {i + 1}
                      </td>
                      <td className="py-2 font-medium text-zinc-100">
                        {org.orgName}
                      </td>
                      <td className="py-2 text-right font-bold text-emerald-400">
                        {fmtNum(org.signalCount)}
                      </td>
                      <td className="py-2 text-right">
                        {org.planKey ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_BADGE_COLORS[org.planKey] ?? "bg-zinc-700 text-zinc-300"}`}
                          >
                            {PLAN_LABELS[org.planKey] ?? org.planKey}
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-xs">Free</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* 5. 좋아요 Top 스타일 */}
          <section className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">
              좋아요 Top 스타일
            </h2>
            {d.topLikedStyles.length === 0 ? (
              <div className="text-sm text-zinc-400">데이터 없음</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="pb-2 text-left text-xs font-medium text-zinc-400 w-8">
                      #
                    </th>
                    <th className="pb-2 text-left text-xs font-medium text-zinc-400">
                      스타일
                    </th>
                    <th className="pb-2 text-left text-xs font-medium text-zinc-400">
                      브랜드
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-zinc-400 w-16">
                      좋아요
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-zinc-400 w-20">
                      가중 점수
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.topLikedStyles.map((style, i) => (
                    <tr
                      key={style.styleId}
                      className="border-b border-zinc-800 hover:bg-zinc-800 transition-colors"
                    >
                      <td className="py-2 text-zinc-400 font-mono text-xs">
                        {i + 1}
                      </td>
                      <td className="py-2 font-medium text-zinc-100">
                        {style.styleName}
                      </td>
                      <td className="py-2 text-zinc-400">{style.brandName}</td>
                      <td className="py-2 text-right text-pink-400 font-bold">
                        {fmtNum(style.likes)}
                      </td>
                      <td className="py-2 text-right text-emerald-400 font-semibold">
                        {style.score > 0 ? `+${style.score}` : style.score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* 6. 최근 활동 */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 최근 가입 Org */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">
                최근 가입 Org
              </h2>
              {d.recentOrgs.length === 0 ? (
                <div className="text-sm text-zinc-400">없음</div>
              ) : (
                <ul className="space-y-3">
                  {d.recentOrgs.map((org) => (
                    <li key={org.orgId} className="flex flex-col gap-0.5">
                      <span className="font-medium text-zinc-100 text-sm">
                        {org.orgName}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {org.ownerEmail ?? org.orgId.slice(0, 12) + "…"}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {fmtDate(org.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 최근 결제 */}
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-300 mb-4 uppercase tracking-wide">
                최근 결제
              </h2>
              {d.recentOrders.length === 0 ? (
                <div className="text-sm text-zinc-400">없음</div>
              ) : (
                <ul className="space-y-3">
                  {d.recentOrders.map((order) => (
                    <li
                      key={order.orderId}
                      className="flex items-start justify-between gap-2"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium text-zinc-100 text-sm truncate">
                          {order.orgName ?? "—"}
                        </span>
                        <span className="text-xs text-zinc-400">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-xs ${PLAN_BADGE_COLORS[order.planKey] ?? "bg-zinc-700 text-zinc-300"}`}
                          >
                            {PLAN_LABELS[order.planKey] ?? order.planKey}
                          </span>
                          {" · "}
                          {fmtDate(order.paidAt)}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-emerald-400">
                        {fmtKrw(order.amountKrw)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* 푸터 메타 */}
          <div className="text-xs text-zinc-400 text-right pb-2">
            기준 시각: {fmtDate(d.generatedAt)} · 60초마다 자동 갱신
          </div>
        </div>
      )}
    </>
  );
}
