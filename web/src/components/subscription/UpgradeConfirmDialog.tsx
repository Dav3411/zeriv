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
  proratedAmount: number;
  /** 다음 정기결제 예정 금액(원) */
  nextBillingAmount: number;
  /** 다음 정기결제 예정일 (ISO) */
  nextBillingDate: string;
  /** 서버 dryRun 견적 로딩 중 — 확인 버튼 비활성 */
  quoteLoading?: boolean;
  /** 서버 dryRun 견적 실패 메시지 — 표시되면 확인 버튼 비활성 */
  quoteError?: string | null;
  /**
   * 결제수단 미등록 모드 — admin 부여 등으로 billing_key 가 없는 경우.
   * true 이면 차액 정보 숨기고, onConfirm 은 결제수단 등록 플로우로 라우팅한다.
   */
  requiresPaymentMethodSetup?: boolean;
  /** 확정 시 호출 — onConfirm 가 throw 하면 에러 박스 표시 */
  onConfirm: () => Promise<void>;
};

export function UpgradeConfirmDialog({
  open,
  onClose,
  currentPlanName,
  newPlanName,
  proratedAmount,
  nextBillingAmount,
  nextBillingDate,
  quoteLoading = false,
  quoteError = null,
  requiresPaymentMethodSetup = false,
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
        e instanceof Error ? e.message : "업그레이드 처리에 실패했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  const formattedDate = nextBillingDate
    ? new Date(nextBillingDate).toLocaleDateString("ko-KR", {
        dateStyle: "long",
      })
    : "—";

  // 두 줄 끊김 방지를 위해 라벨 통일. 차액 정보는 정보 카드에 별도 표시되므로 손실 없음.
  const ctaLabel = "업그레이드";

  // 견적 로딩/실패 가드는 일반 업그레이드 모드에서만. 결제수단 등록 모드는
  // dryRun 자체를 부르지 않으므로 quoteLoading/Error 가드를 무시한다.
  const confirmDisabled = requiresPaymentMethodSetup
    ? loading
    : loading || quoteLoading || !!quoteError;

  return (
    <PlanDialogShell
      open={open}
      onClose={onClose}
      loading={loading}
      labelledBy="upgrade-confirm-title"
    >
      {/* 아이콘 */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{
          background: "rgba(255,164,198,0.12)",
          border: "1px solid rgba(255,164,198,0.2)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 13V3M8 3L3 8M8 3L13 8"
            stroke="#ffa4c6"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2
        id="upgrade-confirm-title"
        className="text-xl font-bold text-white mt-5"
      >
        플랜 업그레이드
      </h2>

      <DialogInfoCard
        rows={
          requiresPaymentMethodSetup
            ? [
                { label: "현재 플랜", value: currentPlanName },
                {
                  label: "변경 후 플랜",
                  value: (
                    <span style={{ color: "#ffa4c6" }}>{newPlanName}</span>
                  ),
                },
                {
                  label: "다음 정기결제",
                  value: `₩${nextBillingAmount.toLocaleString("ko-KR")}/월`,
                },
              ]
            : [
                { label: "현재 플랜", value: currentPlanName },
                {
                  label: "변경 후 플랜",
                  value: (
                    <span style={{ color: "#ffa4c6" }}>{newPlanName}</span>
                  ),
                },
                {
                  label: "즉시 청구 차액",
                  value: quoteLoading ? (
                    <span style={{ color: "var(--text-secondary)" }}>
                      계산 중...
                    </span>
                  ) : (
                    <span style={{ color: "#ffa4c6", fontWeight: 600 }}>
                      {proratedAmount > 0
                        ? `₩${proratedAmount.toLocaleString("ko-KR")}`
                        : "₩0"}
                    </span>
                  ),
                },
                { label: "효력 시점", value: "즉시" },
                {
                  label: "다음 정기결제",
                  value: quoteLoading
                    ? "계산 중..."
                    : `₩${nextBillingAmount.toLocaleString("ko-KR")} · ${formattedDate}`,
                },
              ]
        }
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

      <p
        className="text-xs leading-relaxed mt-4"
        style={{ color: "var(--text-secondary)" }}
      >
        {requiresPaymentMethodSetup ? (
          <>
            현재 결제수단이 등록되어 있지 않습니다.
            <br />
            카드를 등록하면 즉시 새 플랜이 적용됩니다.
          </>
        ) : (
          <>
            업그레이드 즉시 적용되며, 오늘 차액이 청구됩니다.
            <br />
            다음 결제일({formattedDate})부터는 새 플랜 전액이 청구됩니다.
          </>
        )}
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
            // I3: 로딩 중에는 onClick 자체도 무시 (disabled 만으로는 키보드 Enter 등 일부 케이스 누락 가능)
            if (loading) return;
            onClose();
          }}
          disabled={loading}
        >
          취소
        </button>
        <button
          type="button"
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "linear-gradient(135deg,#ffa4c6,#ffe3be)",
            color: "#000",
            cursor: confirmDisabled ? "not-allowed" : "pointer",
            opacity: confirmDisabled ? 0.6 : 1,
          }}
          onClick={handleConfirm}
          disabled={confirmDisabled}
        >
          {loading ? (
            <>
              <InlineSpinner color="#000" />
              처리 중...
            </>
          ) : !requiresPaymentMethodSetup && quoteLoading ? (
            <>
              <InlineSpinner color="#000" />
              견적 계산 중...
            </>
          ) : (
            <span className="whitespace-nowrap">{ctaLabel}</span>
          )}
        </button>
      </div>
    </PlanDialogShell>
  );
}
