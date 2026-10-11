"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/AuthProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
type JobStatus = "queued" | "processing" | "succeeded" | "failed";

export type QueuedJob = {
  id: string;
  status: JobStatus;
  progress: number | null;
  error: string | null;
  result?: unknown;
  kind:
    | "persona"
    | "render_outfit"
    | "render_prompt"
    | "render_product_model"
    | "render_product_solo";
  name: string;
  createdAt: string;
  updatedAt: string;
  requeuedAt?: string | null;
};

type JobQueueContextValue = {
  jobs: QueuedJob[];
  addJob: (job: Pick<QueuedJob, "id" | "kind" | "name">) => void;
  dismissJob: (id: string) => void;
  getJob: (id: string) => QueuedJob | undefined;
  activeCount: number;
  refresh: () => void;
};

const DISMISSED_STORAGE_KEY = "zeriv_dismissed_jobs";

function loadDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr))
      return new Set(arr.filter((v): v is string => typeof v === "string"));
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveDismissedIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DISMISSED_STORAGE_KEY,
      JSON.stringify([...ids]),
    );
  } catch {
    /* ignore */
  }
}

const JobQueueContext = createContext<JobQueueContextValue | undefined>(
  undefined,
);

export function JobQueueProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();
  const [jobs, setJobs] = useState<QueuedJob[]>([]);
  const [dismissedIds, setDismissedIds] =
    useState<Set<string>>(loadDismissedIds);
  const intervalRef = useRef<number | null>(null);

  const hasActiveJobs = jobs.some(
    (j) => j.status === "queued" || j.status === "processing",
  );

  const fetchJobs = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetchWithAuth(`/api/jobs?limit=20&_t=${Date.now()}`, {
        method: "GET",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { jobs?: QueuedJob[] };
      if (Array.isArray(data.jobs)) {
        const MAX_JOBS = 20;
        // 진행률이 뒤로 가지 않도록 이전 값과 비교하여 max 유지
        // 로컬에서 addJob으로 추가했지만 API 응답에 아직 없는 active 잡은 보존
        setJobs((prev) => {
          const prevMap = new Map(prev.map((j) => [j.id, j]));
          const apiIds = new Set(data.jobs!.map((j) => j.id));
          const merged = data.jobs!.map((j) => {
            const old = prevMap.get(j.id);
            if (old && (j.status === "queued" || j.status === "processing")) {
              const oldProgress = old.progress ?? 0;
              const newProgress = j.progress ?? 0;
              if (newProgress < oldProgress) {
                return { ...j, progress: oldProgress };
              }
            }
            return j;
          });
          // API 응답에 없지만 로컬에서 아직 active인 잡 보존
          for (const pj of prev) {
            if (
              !apiIds.has(pj.id) &&
              (pj.status === "queued" || pj.status === "processing")
            ) {
              merged.push(pj);
            }
          }
          return merged.length > MAX_JOBS ? merged.slice(0, MAX_JOBS) : merged;
        });
      }
    } catch {
      // silently ignore
    }
  }, [user?.id, fetchWithAuth]);

  useEffect(() => {
    if (user?.id) {
      fetchJobs();
    } else {
      setJobs([]);
    }
  }, [user?.id, fetchJobs]);

  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!user?.id || !hasActiveJobs) return;

    intervalRef.current = window.setInterval(fetchJobs, 7000);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user?.id, hasActiveJobs, fetchJobs]);

  const updateDismissedIds = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      setDismissedIds((prev) => {
        const next = updater(prev);
        if (next !== prev) saveDismissedIds(next);
        return next;
      });
    },
    [],
  );

  const addJob = useCallback(
    (partial: Pick<QueuedJob, "id" | "kind" | "name">) => {
      const newJob: QueuedJob = {
        ...partial,
        status: "queued",
        progress: 0,
        error: null,
        result: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updateDismissedIds((prev) => {
        if (!prev.has(partial.id)) return prev;
        const next = new Set(prev);
        next.delete(partial.id);
        return next;
      });
      const MAX_JOBS = 20;
      setJobs((prev) => {
        const next = [newJob, ...prev.filter((j) => j.id !== partial.id)];
        return next.length > MAX_JOBS ? next.slice(0, MAX_JOBS) : next;
      });
    },
    [updateDismissedIds],
  );

  const dismissJob = useCallback(
    (id: string) => {
      updateDismissedIds((prev) => new Set(prev).add(id));
    },
    [updateDismissedIds],
  );

  const visibleJobs = useMemo(
    () => jobs.filter((j) => !dismissedIds.has(j.id)),
    [jobs, dismissedIds],
  );

  const getJob = useCallback(
    (id: string) => jobs.find((j) => j.id === id),
    [jobs],
  );

  const activeCount = useMemo(
    () =>
      jobs.filter((j) => j.status === "queued" || j.status === "processing")
        .length,
    [jobs],
  );

  const value = useMemo<JobQueueContextValue>(
    () => ({
      jobs: visibleJobs,
      addJob,
      dismissJob,
      getJob,
      activeCount,
      refresh: fetchJobs,
    }),
    [visibleJobs, addJob, dismissJob, getJob, activeCount, fetchJobs],
  );

  return (
    <JobQueueContext.Provider value={value}>
      {children}
    </JobQueueContext.Provider>
  );
}

export function useJobQueue() {
  const ctx = useContext(JobQueueContext);
  if (!ctx) throw new Error("useJobQueue must be used within JobQueueProvider");
  return ctx;
}
