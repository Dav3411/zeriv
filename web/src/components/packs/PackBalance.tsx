"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ─── TTL 캐시 (모듈 레벨) ──────────────────────────────────────────────────────
// SiteHeader 의 makeTtlCache 패턴과 동일 — 모듈 레벨로 분리해 마운트/언마운트 시에도 유지

const PACK_BALANCE_CACHE_TTL_MS = 5 * 60 * 1000; // 5분

let _packBalanceCacheValue: number | null = null;
let _packBalanceCacheTs = 0;

// 마운트된 PackBalance 인스턴스들 — clearPackBalanceCache 시 자동 refetch 트리거
const _packBalanceSubscribers = new Set<() => void>();

function getPackBalanceCache(): number | null {
  if (_packBalanceCacheValue === null) return null;
  if (Date.now() - _packBalanceCacheTs > PACK_BALANCE_CACHE_TTL_MS) {
    _packBalanceCacheValue = null;
    return null;
  }
  return _packBalanceCacheValue;
}

function setPackBalanceCache(v: number) {
  _packBalanceCacheValue = v;
  _packBalanceCacheTs = Date.now();
}

/**
 * 캐시 무효화 + 마운트된 모든 PackBalance 인스턴스 즉시 refetch.
 * 결제 성공 후 호출하면 헤더 잔량이 바로 갱신된다.
 */
export function clearPackBalanceCache() {
  _packBalanceCacheValue = null;
  _packBalanceCacheTs = 0;
  for (const refetch of _packBalanceSubscribers) {
    try {
      refetch();
    } catch {
      // 개별 인스턴스 refetch 실패는 무시 (unmount race 등)
    }
  }
}

// ─── 타입 ──────────────────────────────────────────────────────────────────────

type PackListResponse = {
  packs?: unknown[];
  totalRemaining?: number;
};

export type PackBalanceProps = {
  onClick?: () => void;
  className?: string;
  /** 다크 테마 여부. 기본값 true — 기존 호출부가 prop 을 생략해도 다크 스타일 유지. */
  isDark?: boolean;
};

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export function PackBalance({ onClick, className = "", isDark = true }: PackBalanceProps) {
  const cached = getPackBalanceCache();
  const [totalRemaining, setTotalRemaining] = useState<number | null>(cached);
  // null = 로딩 중 / undefined = 렌더링 skip (비로그인·에러)
  const [status, setStatus] = useState<"loading" | "ok" | "skip">(
    cached !== null ? "ok" : "loading",
  );
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function fetchBalance(force: boolean) {
      // 캐시 히트면 즉시 종료 (force === true 면 캐시 무시)
      if (!force) {
        const c = getPackBalanceCache();
        if (c !== null) {
          setTotalRemaining(c);
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

        const res = await fetch("/api/packs/list", {
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

        const json = (await res.json()) as PackListResponse;

        if (cancelledRef.current) return;

        if (typeof json.totalRemaining !== "number") {
          setStatus("skip");
          return;
        }

        setPackBalanceCache(json.totalRemaining);
        setTotalRemaining(json.totalRemaining);
        setStatus("ok");
      } catch {
        if (!cancelledRef.current) setStatus("skip");
      }
    }

    // 초기 fetch (캐시 우선)
    void fetchBalance(false);

    // clearPackBalanceCache 호출 시 강제 refetch 가 트리거되도록 subscribe
    const refetch = () => void fetchBalance(true);
    _packBalanceSubscribers.add(refetch);

    return () => {
      cancelledRef.current = true;
      _packBalanceSubscribers.delete(refetch);
    };
  }, []);

  // 비로그인 / 에러 → 렌더링 없음
  if (status === "skip") return null;

  // 로딩 중 → skeleton pill
  if (status === "loading") {
    return (
      <div
        className={`rounded-full px-3 py-1 flex items-center gap-1.5 animate-pulse ${className}`}
        style={{
          background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`,
          minWidth: "40px",
          minHeight: "28px",
          height: "28px",
        }}
      >
        <span
          className="block rounded-full"
          style={{
            width: "36px",
            height: "8px",
            background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          }}
        />
      </div>
    );
  }

  const isEmpty = totalRemaining === 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full flex items-center gap-1 transition-all hover:opacity-80 active:scale-95 ${className}`}
      style={
        isEmpty
          ? {
              background:
                "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
              border: "none",
              padding: "4px 12px",
              minHeight: "28px",
              height: "28px",
              color: "#000",
              fontWeight: 600,
              fontSize: "12px",
            }
          : {
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)"}`,
              padding: "4px 10px",
              minHeight: "28px",
              height: "28px",
            }
      }
    >
      {isEmpty ? (
        // 잔량 0 → 충전 CTA
        <span className="text-[12px] font-semibold">충전</span>
      ) : (
        <>
          {/* 이미지 아이콘 (사진) */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: isDark ? "#ffa4c6" : "#b83f74", flexShrink: 0 }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          {/* 숫자 + "장" — 모바일: 숫자만, 데스크탑: 풀 표기 */}
          <span
            className="text-[12px] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {(totalRemaining ?? 0).toLocaleString("ko-KR")}
            <span className="hidden sm:inline">장</span>
          </span>
        </>
      )}
    </button>
  );
}
