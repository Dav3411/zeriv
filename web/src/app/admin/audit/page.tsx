"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

interface AuditLog {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

const PAGE_SIZE = 50;

const ACTION_BADGE: Record<string, string> = {
  plan_change: "bg-amber-900/60 text-amber-300",
  account_delete: "bg-red-900/60 text-red-300",
  credits_adjust: "bg-emerald-900/60 text-emerald-300",
  job_cancel: "bg-blue-900/60 text-blue-300",
};

function fmtTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export default function AdminAuditPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user && typeof window !== "undefined") {
      const next = window.location.pathname || "/admin/audit";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [authLoading, user, router]);

  const loadLogs = useCallback(
    async (newOffset: number) => {
      if (!session?.access_token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/audit?limit=${PAGE_SIZE}&offset=${newOffset}`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
        );
        if (res.status === 401 || res.status === 403) {
          setError("권한이 없습니다. 어드민 계정으로 로그인하세요.");
          return;
        }
        const json = (await res.json()) as {
          logs?: AuditLog[];
          total?: number;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "감사 로그 조회 실패");
        }
        setLogs(json.logs ?? []);
        setTotal(json.total ?? 0);
        setOffset(newOffset);
      } catch (e) {
        setError(e instanceof Error ? e.message : "감사 로그 조회 실패");
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token],
  );

  useEffect(() => {
    if (session?.access_token) {
      void loadLogs(0);
    }
  }, [session?.access_token, loadLogs]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  const hasNext = offset + PAGE_SIZE < total;
  const hasPrev = offset > 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <>
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 mb-6 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-zinc-100">감사 로그</div>
          <div className="mt-1 text-sm text-zinc-400">
            어드민 권한 변경 이력 (plan_change, account_delete, credits_adjust,
            job_cancel)
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          onClick={() => void loadLogs(offset)}
          disabled={loading}
        >
          {loading ? "..." : "새로고침"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl border-2 border-zinc-700 bg-zinc-900 p-5">
        {logs.length === 0 && !loading ? (
          <div className="text-center py-10 text-zinc-500 text-sm">
            감사 로그가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="pb-2 text-xs font-medium text-zinc-400 w-44">
                    시각
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400 w-32">
                    액션
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400 w-28">
                    대상 종류
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400">
                    대상 ID
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400">
                    실행 어드민
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400 w-20 text-right">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expanded === log.id;
                  const detailsJson = JSON.stringify(log.details, null, 2);
                  const hasDetails =
                    detailsJson !== "{}" && detailsJson !== "null";
                  return (
                    <React.Fragment key={log.id}>
                      <tr className="border-b border-zinc-800 hover:bg-zinc-800/40 align-top">
                        <td className="py-3 text-xs text-zinc-300 font-mono">
                          {fmtTimestamp(log.createdAt)}
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[log.action] ?? "bg-zinc-700 text-zinc-200"}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 text-zinc-300 text-xs">
                          {log.targetType}
                        </td>
                        <td
                          className="py-3 font-mono text-xs text-zinc-400"
                          title={log.targetId}
                        >
                          {shortId(log.targetId)}
                        </td>
                        <td
                          className="py-3 font-mono text-xs text-zinc-500"
                          title={log.adminUserId}
                        >
                          {shortId(log.adminUserId)}
                        </td>
                        <td className="py-3 text-right">
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded(isExpanded ? null : log.id)
                              }
                              className="text-xs text-zinc-400 hover:text-zinc-200"
                            >
                              {isExpanded ? "▲" : "▼"}
                            </button>
                          ) : (
                            <span className="text-zinc-700 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-zinc-950/60">
                          <td colSpan={6} className="px-2 py-3">
                            <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
          <div>
            {total > 0
              ? `${pageStart}–${pageEnd} / ${total.toLocaleString("ko-KR")}`
              : "0개"}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-200 disabled:opacity-40"
              onClick={() => void loadLogs(Math.max(0, offset - PAGE_SIZE))}
              disabled={!hasPrev || loading}
            >
              이전
            </button>
            <button
              type="button"
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-zinc-200 disabled:opacity-40"
              onClick={() => void loadLogs(offset + PAGE_SIZE)}
              disabled={!hasNext || loading}
            >
              다음
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
