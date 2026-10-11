"use client";

import { useState } from "react";
import {
  PlanDialogShell,
  DialogInfoCard,
  InlineSpinner,
} from "./PlanDialogShell";

type Props = {
  open: boolean;
  onClose: () => void;
  currentPlanName: string;
  /** 만료 시각 ISO (= current_period_end) */
  periodEnd: string;
  onConfirm: () => Promise<void>;
};

export function CancelSubscriptionDialog({
  open,
  onClose,
  currentPlanName,
  periodEnd,
  onConfirm,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "해지 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const formattedDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString("ko-KR", { dateStyle: "long" })
    : "—";

  return (
    <PlanDialogShell
      open={open}
      onClose={onClose}
      loading={loading}
      labelledBy="cancel-subscription-title"
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{
          background: "rgba(239,68,68,0.10)",
          border: "1px solid rgba(239,68,68,0.20)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 2L14 13H2L8 2Z"
            stroke="rgba(239,68,68,0.8)"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M8 6.5V9.5"
            stroke="rgba(239,68,68,0.8)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.5" r="0.8" fill="rgba(239,68,68,0.8)" />
        </svg>
      </div>

      <h2
        id="cancel-subscription-title"
        className="text-xl font-bold text-white mt-5"
      >
        구독 해지
      </h2>

      <p
        className="text-xs leading-relaxed mt-4"
        style={{ color: "var(--text-secondary)" }}
      >
        해지 후에도 {formattedDate}까지는 {currentPlanName} 플랜 기능을 모두
        사용할 수 있습니다.
        <br />
        이후 무료 플랜으로 전환되며 스타일·이미지 생성 한도가 축소됩니다.
      </p>

      <DialogInfoCard
        rows={[
          { label: "현재 플랜", value: currentPlanName },
          {
            label: "서비스 만료",
            value: <span style={{ color: "#ffa4c6" }}>{formattedDate}</span>,
          },
          { label: "만료 후 플랜", value: "Free" },
        ]}
      />

      {error && (
        <div
          className="rounded-xl p-3.5 text-xs mt-4"
          style={{
            background: "rgba(255,80,80,0.08)",
            border: "1px solid rgba(255,80,80,0.18)",
            color: "rgba(255,120,120,0.9)",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex gap-2 mt-6">
        <button
          type="button"
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-subtle)",
            cursor: loading ? "not-allowed" : "pointer",
          }}
          onClick={() => {
            if (loading) return;
            onClose();
          }}
          disabled={loading}
        >
          유지하기
        </button>
        <button
          type="button"
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors transition-opacity hover:opacity-90"
          style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "rgba(239,68,68,0.85)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
          onClick={handleConfirm}
          disabled={loading}
        >
          {loading ? (
            <>
              <InlineSpinner />
              처리 중...
            </>
          ) : (
            "해지 예약"
          )}
        </button>
      </div>
    </PlanDialogShell>
  );
}
