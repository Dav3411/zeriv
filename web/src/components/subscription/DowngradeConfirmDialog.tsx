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
  newPlanName: string;
  /** 다음 정기결제 금액(원) — 새 플랜 기준 */
  nextBillingAmount: number;
  /** 효력 시점 ISO (= current_period_end) */
  effectiveAt: string;
  /** 서버 dryRun 견적 로딩 중 — 확인 버튼 비활성 */
  quoteLoading?: boolean;
  /** 서버 dryRun 견적 실패 메시지 — 표시되면 확인 버튼 비활성 */
  quoteError?: string | null;
  onConfirm: () => Promise<void>;
};

export function DowngradeConfirmDialog({
  open,
  onClose,
  currentPlanName,
  newPlanName,
  nextBillingAmount,
  effectiveAt,
  quoteLoading = false,
  quoteError = null,
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
      setError(
        e instanceof Error ? e.message : "다운그레이드 예약에 실패했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  const formattedDate = effectiveAt
    ? new Date(effectiveAt).toLocaleDateString("ko-KR", { dateStyle: "long" })
    : "—";

  const confirmDisabled = loading || quoteLoading || !!quoteError;

  return (
    <PlanDialogShell
      open={open}
      onClose={onClose}
      loading={loading}
      labelledBy="downgrade-confirm-title"
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{
          background: "var(--surface-3)",
          border: "1px solid var(--border-default)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 3V13M8 13L3 8M8 13L13 8"
            stroke="var(--text-secondary)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2
        id="downgrade-confirm-title"
        className="text-xl font-bold text-white mt-5"
      >
        플랜 변경 예약
      </h2>

      <DialogInfoCard
        rows={[
          { label: "현재 플랜", value: currentPlanName },
          {
            label: "변경 후 플랜",
            value: (
              <span style={{ color: "var(--text-secondary)" }}>
                {newPlanName}
              </span>
            ),
          },
          { label: "효력 시점", value: formattedDate },
          { label: "추가 청구", value: "없음" },
          {
            label: "이후 정기결제",
            value: quoteLoading
              ? "계산 중..."
              : `₩${nextBillingAmount.toLocaleString("ko-KR")}/월`,
          },
        ]}
      />

      {quoteError && (
        <div
          className="rounded-xl p-3.5 text-xs mt-4"
          style={{
            background: "rgba(255,80,80,0.08)",
            border: "1px solid rgba(255,80,80,0.18)",
            color: "rgba(255,120,120,0.9)",
          }}
        >
          {quoteError}
        </div>
      )}

      <div
        className="rounded-xl p-3.5 mt-4 text-xs"
        style={{
          background: "rgba(255,164,198,0.05)",
          border: "1px solid rgba(255,164,198,0.15)",
          color: "rgba(255,164,198,0.7)",
        }}
      >
        {formattedDate} 전에 변경을 철회하려면 결제 탭에서 취소할 수 있습니다.
      </div>

      <p
        className="text-xs leading-relaxed mt-4"
        style={{ color: "var(--text-secondary)" }}
      >
        {formattedDate}까지는 {currentPlanName} 플랜을 계속 사용할 수 있습니다.
        <br />
        이후 {newPlanName} 플랜으로 자동 전환됩니다. 추가 청구나 환불은
        없습니다.
      </p>

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
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "var(--surface-3)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            cursor: confirmDisabled ? "not-allowed" : "pointer",
            opacity: confirmDisabled ? 0.6 : 1,
          }}
          onClick={handleConfirm}
          disabled={confirmDisabled}
        >
          {loading ? (
            <>
              <InlineSpinner />
              처리 중...
            </>
          ) : quoteLoading ? (
            <>
              <InlineSpinner />
              견적 계산 중...
            </>
          ) : (
            "다운그레이드 예약하기"
          )}
        </button>
      </div>
    </PlanDialogShell>
  );
}
