"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ─── TTL 캐시 (모듈 레벨, brandId별 Map) ────────────────────────────────────

const GENERATION_USAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5분

type CacheEntry = { value: GenerationUsageData; ts: number };
const _generationUsageCache = new Map<string, CacheEntry>();

// 마운트된 인스턴스들 (brandId별 subscribers)
const _generationUsageSubscribers = new Map<string, Set<() => void>>();

type GenerationUsageData = {
  monthlyGenerations: number;
  generationLimit: number | null;
};

function getGenerationUsageCache(brandId: string): GenerationUsageData | null {
  const entry = _generationUsageCache.get(brandId);
  if (!entry) return null;
  if (Date.now() - entry.ts > GENERATION_USAGE_CACHE_TTL_MS) {
    _generationUsageCache.delete(brandId);
    return null;
  }
  return entry.value;
}

function setGenerationUsageCache(brandId: string, v: GenerationUsageData) {
  _generationUsageCache.set(brandId, { value: v, ts: Date.now() });
}

/**
 * 캐시 무효화 + 마운트된 모든 인스턴스 즉시 refetch.
 * brandId를 전달하면 해당 브랜드만 무효화, 생략하면 전체 무효화.
 */
export function clearGenerationUsageCache(brandId?: string) {
  if (brandId) {
    _generationUsageCache.delete(brandId);
    const subs = _generationUsageSubscribers.get(brandId);
    if (subs) {
      for (const refetch of subs) {
        try {
          refetch();
        } catch {
          // unmount race 무시
        }
      }
    }
  } else {
    _generationUsageCache.clear();
    for (const subs of _generationUsageSubscribers.values()) {
      for (const refetch of subs) {
        try {
          refetch();
        } catch {
          // unmount race 무시
        }
      }
    }
  }
}

// ─── 타입 ──────────────────────────────────────────────────────────────────────

type UsageApiResponse = {
  usage?: { monthlyGenerations?: number };
  limits?: { generationLimit?: number | null };
};

export type GenerationUsageBadgeProps = {
  brandId: string;
  /** 다크 테마 여부. 기본값 true. */
  isDark?: boolean;
  className?: string;
};

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export function GenerationUsageBadge({
  brandId,
  isDark = true,
  className = "",
}: GenerationUsageBadgeProps) {
  const cached = brandId ? getGenerationUsageCache(brandId) : null;

  const [data, setData] = useState<GenerationUsageData | null>(cached);
  const [status, setStatus] = useState<"loading" | "ok" | "skip">(
    cached !== null ? "ok" : "loading",
  );
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!brandId) {
      setStatus("skip");
      return;
    }

    cancelledRef.current = false;

    // brandId 변경 시 즉시 해당 brandId 상태로 동기화 (이전 brand의 stale 값 노출 방지)
    const c = getGenerationUsageCache(brandId);
    if (c) {
      setData(c);
      setStatus("ok");
    } else {
      setData(null);
      setStatus("loading");
    }

    async function fetchUsage(force: boolean) {
      if (!force) {
        const c = getGenerationUsageCache(brandId);
        if (c !== null) {
          setData(c);
          setStatus("ok");
          return;
        }
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (!token) {
          if (!cancelledRef.current) setStatus("skip");
          return;
        }

        const res = await fetch(`/api/brands/${brandId}/usage`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelledRef.current) return;

        if (res.status === 401) {
          setStatus("skip");
          return;
        }

        if (!res.ok) {
          setStatus("skip");
          return;
        }

        const json = (await res.json()) as UsageApiResponse;

        if (cancelledRef.current) return;

        const monthlyGenerations = json.usage?.monthlyGenerations;
        if (typeof monthlyGenerations !== "number") {
          setStatus("skip");
          return;
        }

        const generationLimit =
          json.limits?.generationLimit !== undefined
            ? (json.limits.generationLimit ?? null)
            : null;

        const value: GenerationUsageData = { monthlyGenerations, generationLimit };
        setGenerationUsageCache(brandId, value);
        setData(value);
        setStatus("ok");
      } catch {
        if (!cancelledRef.current) setStatus("skip");
      }
    }

    // 초기 fetch (캐시 우선)
    void fetchUsage(false);

    // clearGenerationUsageCache 호출 시 강제 refetch 트리거
    const refetch = () => void fetchUsage(true);
    if (!_generationUsageSubscribers.has(brandId)) {
      _generationUsageSubscribers.set(brandId, new Set());
    }
    _generationUsageSubscribers.get(brandId)!.add(refetch);

    return () => {
      cancelledRef.current = true;
      _generationUsageSubscribers.get(brandId)?.delete(refetch);
    };
  }, [brandId]);

  // 비로그인 / brandId 없음 / 에러 → 렌더링 없음
  if (status === "skip") return null;

  // 로딩 중 → skeleton pill
  if (status === "loading") {
    return (
      <div
        className={`rounded-full px-3 py-1 flex items-center gap-1.5 animate-pulse ${className}`}
        style={{
          background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`,
          minWidth: "56px",
          minHeight: "28px",
          height: "28px",
        }}
      >
        <span
          className="block rounded-full"
          style={{
            width: "40px",
            height: "8px",
            background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          }}
        />
      </div>
    );
  }

  if (!data) return null;

  const { monthlyGenerations: current, generationLimit: limit } = data;

  // 남은 생성량 계산
  type Severity = "normal" | "warning" | "error";
  const isUnlimited = limit === null;
  let remaining = 0;
  let severity: Severity = "normal";

  if (isUnlimited) {
    // 무제한: severity 항상 normal, remaining 표시 불필요
  } else if (limit === 0) {
    severity = "error";
  } else {
    remaining = Math.max(0, limit - current);
    if (remaining === 0) {
      severity = "error";
    } else if (remaining <= limit * 0.2) {
      severity = "warning";
    }
  }

  // 표시값 색상
  let currentColor: string;
  if (severity === "error") {
    currentColor = "var(--error)";
  } else if (severity === "warning") {
    currentColor = "var(--warning)";
  } else {
    currentColor = "var(--text-primary)";
  }

  // 배지 배경/테두리 (error 상태에서만 변경)
  const badgeBg =
    severity === "error"
      ? isDark
        ? "rgba(248,113,113,0.06)"
        : "rgba(248,113,113,0.05)"
      : isDark
        ? "rgba(255,255,255,0.04)"
        : "rgba(0,0,0,0.04)";

  const badgeBorder =
    severity === "error"
      ? isDark
        ? "1px solid rgba(248,113,113,0.25)"
        : "1px solid rgba(248,113,113,0.20)"
      : `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`;

  const badgeStyle: React.CSSProperties = {
    background: badgeBg,
    border: badgeBorder,
    padding: "4px 10px",
    minHeight: "28px",
    height: "28px",
  };

  // 표시값: 무제한이면 ∞, 그 외 remaining 숫자
  const remainingDisplay =
    isUnlimited ? "∞" : remaining.toLocaleString("ko-KR");

  // aria-label / title
  let accessibilityLabel: string;
  if (isUnlimited) {
    accessibilityLabel = "생성량 무제한";
  } else if (remaining > 0) {
    accessibilityLabel = `남은 생성량 ${remaining.toLocaleString("ko-KR")}회`;
  } else {
    accessibilityLabel = "생성량 소진됨, 결제 설정으로 이동";
  }

  const inner = (
    <>
      {/* Sparkles 아이콘 (인라인 SVG) */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isDark ? "#ffe3be" : "#c97b3a"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" />
        <path d="M20 3v4" />
        <path d="M22 5h-4" />
        <path d="M4 17v2" />
        <path d="M5 18H3" />
      </svg>

      {/* 남은 생성량 숫자 하나만 표시 */}
      <span style={{ fontSize: "12px", fontWeight: 600, color: currentColor }}>
        {remainingDisplay}
      </span>
    </>
  );

  if (severity === "error") {
    return (
      <a
        href="/settings?tab=billing"
        aria-label={accessibilityLabel}
        title={accessibilityLabel}
        className={`rounded-full inline-flex items-center gap-1.5 transition-all hover:opacity-80 ${className}`}
        style={{ ...badgeStyle, cursor: "pointer", textDecoration: "none" }}
      >
        {inner}
      </a>
    );
  }

  return (
    <div
      aria-label={accessibilityLabel}
      title={accessibilityLabel}
      className={`rounded-full inline-flex items-center gap-1.5 ${className}`}
      style={badgeStyle}
    >
      {inner}
    </div>
  );
}
