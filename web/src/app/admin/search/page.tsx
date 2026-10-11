"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

interface OrgSearchResult {
  orgId: string;
  orgName: string;
  ownerEmail: string | null;
  plan: string;
  planTier: number;
  planStatus: string;
  periodEnd: string | null;
  monthlyGenerations: number;
  memberCount: number;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  quick_plus: "Quick Plus",
  starter: "Atelier",
  label: "Label",
  pro: "Pro",
  studio: "House",
};

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: "bg-zinc-700 text-zinc-300",
  quick_plus: "bg-pink-950/60 text-pink-300",
  starter: "bg-blue-900/60 text-blue-300",
  label: "bg-violet-900/60 text-violet-300",
  pro: "bg-amber-900/60 text-amber-300",
  studio: "bg-pink-900/60 text-pink-300",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

export default function AdminSearchPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OrgSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user && typeof window !== "undefined") {
      const next = window.location.pathname || "/admin/search";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [authLoading, user, router]);

  async function runSearch() {
    if (!session?.access_token) {
      setError("로그인이 필요합니다.");
      return;
    }
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError("권한이 없습니다. 어드민 계정으로 로그인하세요.");
          setResults(null);
          return;
        }
        let errMsg = "검색 실패";
        try {
          const errJson = (await res.json()) as { error?: string };
          errMsg = errJson.error ?? errMsg;
        } catch {
          // non-JSON error response (빈 body, HTML 등)
        }
        throw new Error(errMsg);
      }
      const json = (await res.json()) as {
        results?: OrgSearchResult[];
        error?: string;
      };
      setResults(json.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색 실패");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyOrgId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopyToast(id);
      setTimeout(() => setCopyToast(null), 1500);
    } catch {
      // 무시 — 보안 컨텍스트가 아닐 때는 silent fail
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 mb-6">
        <div className="text-lg font-semibold text-zinc-100">
          Org / User 검색
        </div>
        <div className="mt-1 text-sm text-zinc-400">
          이메일, Org 이름, UUID로 검색
        </div>
      </div>

      {/* 검색창 */}
      <div className="space-y-3 rounded-2xl border-2 border-zinc-700 bg-zinc-900 p-5 mb-6">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="user@email.com, Org 이름, 또는 UUID"
          />
          <button
            type="button"
            className="shrink-0 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            onClick={() => void runSearch()}
            disabled={loading || !query.trim()}
          >
            {loading ? "검색 중…" : "검색"}
          </button>
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
      </div>

      {/* 결과 */}
      {results !== null && (
        <div className="rounded-2xl border-2 border-zinc-700 bg-zinc-900 p-5">
          {results.length === 0 ? (
            <div className="text-center py-10 text-zinc-500 text-sm">
              일치하는 결과가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left">
                    <th className="pb-2 text-xs font-medium text-zinc-400">
                      Org
                    </th>
                    <th className="pb-2 text-xs font-medium text-zinc-400">
                      Owner 이메일
                    </th>
                    <th className="pb-2 text-xs font-medium text-zinc-400 text-center w-24">
                      플랜
                    </th>
                    <th className="pb-2 text-xs font-medium text-zinc-400 text-right w-24">
                      이번달 생성
                    </th>
                    <th className="pb-2 text-xs font-medium text-zinc-400 text-right w-16">
                      멤버
                    </th>
                    <th className="pb-2 text-xs font-medium text-zinc-400 text-right w-32">
                      구독 만료
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const planLabel =
                      r.plan === "pro" && r.planTier > 1
                        ? `${PLAN_LABELS[r.plan] ?? r.plan} T${r.planTier}`
                        : (PLAN_LABELS[r.plan] ?? r.plan);
                    return (
                      <tr
                        key={r.orgId}
                        className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors"
                      >
                        <td className="py-3">
                          <div className="font-medium text-zinc-100">
                            {r.orgName}
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyOrgId(r.orgId)}
                            className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors mt-0.5"
                            title="클릭하여 복사"
                          >
                            {r.orgId}
                            {copyToast === r.orgId && (
                              <span className="ml-2 text-emerald-400">
                                복사됨
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="py-3 text-zinc-300">
                          {r.ownerEmail ?? (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_BADGE_COLORS[r.plan] ?? "bg-zinc-700 text-zinc-300"}`}
                          >
                            {planLabel}
                          </span>
                        </td>
                        <td className="py-3 text-right font-bold text-emerald-400">
                          {fmtNum(r.monthlyGenerations)}
                        </td>
                        <td className="py-3 text-right text-zinc-300">
                          {r.memberCount}
                        </td>
                        <td className="py-3 text-right text-xs text-zinc-400">
                          {fmtDate(r.periodEnd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
