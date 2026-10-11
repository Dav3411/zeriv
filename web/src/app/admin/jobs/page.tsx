"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

interface JobItem {
  id: string;
  status: string;
  progress: number | null;
  error: string | null;
  kind: string | null;
  priority: number | null;
  brandId: string | null;
  brandName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "queued", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
] as const;

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-blue-900/60 text-blue-300",
  pending: "bg-blue-900/60 text-blue-300",
  processing: "bg-amber-900/60 text-amber-300",
  succeeded: "bg-emerald-900/60 text-emerald-300",
  failed: "bg-red-900/60 text-red-300",
};

function fmtTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ko-KR", {
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

function shortId(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

function ageMinutes(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.floor(hr / 24)}d`;
  } catch {
    return "—";
  }
}

export default function AdminJobsPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [days, setDays] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user && typeof window !== "undefined") {
      const next = window.location.pathname || "/admin/jobs";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [authLoading, user, router]);

  const loadJobs = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/jobs?status=${encodeURIComponent(statusFilter)}&days=${days}&limit=100`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (res.status === 401 || res.status === 403) {
        setError("권한이 없습니다. 어드민 계정으로 로그인하세요.");
        return;
      }
      const json = (await res.json()) as { jobs?: JobItem[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "잡 조회 실패");
      }
      setJobs(json.jobs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "잡 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, statusFilter, days]);

  useEffect(() => {
    if (session?.access_token) {
      void loadJobs();
    }
  }, [session?.access_token, loadJobs]);

  async function cancelJob(jobId: string) {
    if (!session?.access_token) return;
    if (
      !window.confirm(
        `이 잡을 취소합니까?\n${jobId}\n\n진행 중인 작업이 강제로 failed 상태가 됩니다.`,
      )
    )
      return;
    setCancellingId(jobId);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        jobId?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "잡 취소 실패");
      }
      setToast(`✓ 잡 ${shortId(jobId)} 취소됨`);
      setTimeout(() => setToast(null), 2000);
      // 낙관적 업데이트
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, status: "failed", error: "cancelled by admin" }
            : j,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "잡 취소 실패");
      setTimeout(() => setError(null), 4000);
    } finally {
      setCancellingId(null);
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
      <div className="rounded-xl bg-zinc-800 border border-zinc-700 px-4 py-3 mb-6 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-zinc-100">잡 모니터</div>
          <div className="mt-1 text-sm text-zinc-400">
            최근 N일 jobs 큐 상태 — queued/processing은 priority DESC +
            created_at ASC 순
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          onClick={() => void loadJobs()}
          disabled={loading}
        >
          {loading ? "..." : "새로고침"}
        </button>
      </div>

      {/* 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-zinc-700 bg-zinc-900 p-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Status</span>
          <select
            className="rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">최근</span>
          <input
            type="number"
            min={1}
            max={30}
            className="w-16 rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            value={days}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) setDays(Math.min(30, Math.max(1, v)));
            }}
          />
          <span className="text-xs text-zinc-400">일</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {toast && (
        <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-300">
          {toast}
        </div>
      )}

      <div className="rounded-2xl border-2 border-zinc-700 bg-zinc-900 p-5">
        {jobs.length === 0 && !loading ? (
          <div className="text-center py-10 text-zinc-500 text-sm">
            잡이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="pb-2 text-xs font-medium text-zinc-400 w-24">
                    Status
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400 w-12 text-right">
                    Pri
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400">
                    Job ID / Kind
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400">
                    Org / Brand
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400 w-16 text-right">
                    진행
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400 w-28">
                    생성
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400 w-28">
                    수정
                  </th>
                  <th className="pb-2 text-xs font-medium text-zinc-400 w-20 text-right">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const cancellable =
                    j.status === "queued" ||
                    j.status === "processing" ||
                    j.status === "pending";
                  return (
                    <tr
                      key={j.id}
                      className="border-b border-zinc-800 hover:bg-zinc-800/40 align-top"
                    >
                      <td className="py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[j.status] ?? "bg-zinc-700 text-zinc-200"}`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-xs text-zinc-400 font-mono">
                        {j.priority ?? 0}
                      </td>
                      <td className="py-3">
                        <div
                          className="font-mono text-xs text-zinc-300"
                          title={j.id}
                        >
                          {shortId(j.id)}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {j.kind ?? "—"}
                        </div>
                        {j.error && (
                          <div
                            className="mt-0.5 text-[10px] text-red-400 truncate max-w-[280px]"
                            title={j.error}
                          >
                            {j.error}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-xs">
                        <div className="text-zinc-300">
                          {j.organizationName ?? (
                            <span className="text-zinc-600">—</span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {j.brandName ?? "—"}
                        </div>
                      </td>
                      <td className="py-3 text-right text-xs text-zinc-300 font-mono">
                        {j.progress != null ? `${j.progress}%` : "—"}
                      </td>
                      <td className="py-3 text-xs text-zinc-400">
                        <div>{fmtTimestamp(j.createdAt)}</div>
                        <div className="text-[10px] text-zinc-600 mt-0.5">
                          {ageMinutes(j.createdAt)} ago
                        </div>
                      </td>
                      <td className="py-3 text-xs text-zinc-400">
                        {fmtTimestamp(j.updatedAt)}
                      </td>
                      <td className="py-3 text-right">
                        {cancellable ? (
                          <button
                            type="button"
                            onClick={() => void cancelJob(j.id)}
                            disabled={cancellingId === j.id}
                            className="rounded-md bg-red-600/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600 disabled:opacity-40"
                          >
                            {cancellingId === j.id ? "..." : "취소"}
                          </button>
                        ) : (
                          <span className="text-zinc-700 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
