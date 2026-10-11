"use client";

import { PlanDialogShell } from "@/components/subscription/PlanDialogShell";

/**
 * 렌더 API 가 INSUFFICIENT_PACK / DAILY_LIMIT 코드를 반환했을 때 표시하는 모달.
 *
 * 사용 예 (호출자 패턴 — 실제 render 페이지 통합은 별도 task):
 *
 * ```tsx
 * const [modal, setModal] = useState<'none' | 'insufficient' | 'purchase'>('none');
 * const [insufficientReason, setInsufficientReason] =
 *   useState<'INSUFFICIENT_PACK' | 'DAILY_LIMIT'>('INSUFFICIENT_PACK');
 *
 * // render 호출 catch:
 * if (response.code === 'INSUFFICIENT_PACK' || response.code === 'DAILY_LIMIT') {
 *   setInsufficientReason(response.code);
 *   setModal('insufficient');
 * }
 *
 * <InsufficientPackModal
 *   open={modal === 'insufficient'}
 *   onClose={() => setModal('none')}
 *   reason={insufficientReason}
 *   onPurchase={() => setModal('purchase')}
 *   onUpgrade={() => router.push('/pricing')}
 * />
 * ```
 */

type InsufficientPackModalProps = {
  open: boolean;
  onClose: () => void;
  /** render API 가 반환한 code. */
  reason: "INSUFFICIENT_PACK" | "DAILY_LIMIT";
  /** 사용자가 "구매" 선택 시. 호출자가 PackPurchaseModal 을 열도록. DAILY_LIMIT 에서는 호출되지 않음. */
  onPurchase: () => void;
  /** 사용자가 "업그레이드" 선택 시. 호출자가 pricing 으로 이동. */
  onUpgrade: () => void;
};

export function InsufficientPackModal({
  open,
  onClose,
  reason,
  onPurchase,
  onUpgrade,
}: InsufficientPackModalProps) {
  const isInsufficient = reason === "INSUFFICIENT_PACK";

  const heading = isInsufficient
    ? "이미지가 부족합니다"
    : "오늘의 한도에 도달했어요";

  const body = isInsufficient
    ? "이번 달 한도를 모두 사용했어요. 이미지를 충전하거나 플랜을 업그레이드하세요."
    : "하루 생성 한도를 모두 사용했습니다. 내일 다시 시도하거나 플랜을 업그레이드하세요.";

  return (
    <PlanDialogShell
      open={open}
      onClose={onClose}
      labelledBy="insufficient-pack-title"
    >
      {/* 아이콘 */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{
          background: "rgba(255,164,198,0.12)",
          border: "1px solid rgba(255,164,198,0.2)",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle
            cx="10"
            cy="10"
            r="8.5"
            stroke="#ffa4c6"
            strokeWidth="1.5"
          />
          <path
            d="M10 6v5"
            stroke="#ffa4c6"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="10" cy="14" r="1" fill="#ffa4c6" />
        </svg>
      </div>

      <h2
        id="insufficient-pack-title"
        className="font-headline text-xl font-bold text-white mt-5"
      >
        {heading}
      </h2>

      <p
        className="text-sm leading-relaxed mt-3"
        style={{ color: "var(--text-secondary)" }}
      >
        {body}
      </p>

      <div className="flex flex-col gap-2.5 mt-6">
        {/* Primary CTA */}
        {isInsufficient ? (
          <button
            type="button"
            className="w-full rounded-full py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              background: "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
              color: "#000",
            }}
            onClick={onPurchase}
          >
            장수 구매하기
          </button>
        ) : (
          <button
            type="button"
            className="w-full rounded-full py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              background: "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
              color: "#000",
            }}
            onClick={onUpgrade}
          >
            플랜 업그레이드
          </button>
        )}

        {/* Secondary CTA — INSUFFICIENT_PACK 에서만 노출 */}
        {isInsufficient && (
          <button
            type="button"
            className="w-full rounded-full py-3 text-sm font-medium transition-colors"
            style={{
              background: "transparent",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
            onClick={onUpgrade}
          >
            플랜 업그레이드
          </button>
        )}
      </div>
    </PlanDialogShell>
  );
}
