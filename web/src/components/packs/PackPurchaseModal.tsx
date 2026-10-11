"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { PlanDialogShell, InlineSpinner } from "@/components/subscription/PlanDialogShell";
import { supabase } from "@/lib/supabaseClient";
import type { IamportResponse } from "@/types/iamport";

/**
 * KRW 이미지 장수 팩 단건 구매 모달.
 *
 * 상태 머신:
 *   idle → submitting_checkout → submitting_pg → submitting_complete → success
 *   에러: error_checkout | error_pg | error_complete
 *
 * 사용 예 (호출자 패턴 — 실제 render 페이지 통합은 별도 task):
 *
 * ```tsx
 * const [modal, setModal] = useState<'none' | 'insufficient' | 'purchase'>('none');
 *
 * <PackPurchaseModal
 *   open={modal === 'purchase'}
 *   onClose={() => setModal('none')}
 *   onSuccess={(pack) => {
 *     setModal('none');
 *     void retryRender();
 *   }}
 * />
 * ```
 */

// ─── 팩 옵션 ──────────────────────────────────────────────────────────────────

export type PackSize = 1 | 10;

export type PackOption = {
  size: PackSize;
  priceKrw: number;
  expiryDays: number;
  badge?: string;
  isDefault?: boolean;
};

export const PACK_OPTIONS: PackOption[] = [
  { size: 1, priceKrw: 500, expiryDays: 30 },
  {
    size: 10,
    priceKrw: 4_500,
    expiryDays: 180,
    badge: "10% 할인 · 인기",
    isDefault: true,
  },
];

// ─── 상태 머신 타입 ────────────────────────────────────────────────────────────

type ModalPhase =
  | "idle"
  | "submitting_checkout"
  | "submitting_pg"
  | "submitting_complete"
  | "success"
  | "error_checkout"
  | "error_pg"
  | "error_complete";

// ─── Props ────────────────────────────────────────────────────────────────────

type PackResultPack = {
  id: string;
  remaining_count: number;
  initial_count: number;
  expires_at: string | null;
};

type PackPurchaseModalProps = {
  open: boolean;
  onClose: () => void;
  /** 결제·적립 성공 시 호출. 호출자가 render 자동 재시도 가능. */
  onSuccess?: (pack: PackResultPack) => void;
  /** PortOne IMP 결제창에 표시할 사용자 정보. 없어도 동작. */
  buyer?: { name?: string; email?: string };
  /** 팩 구매 대상 조직 ID. 미전달 시 세션에서 자동 조회 시도. */
  organizationId?: string;
  /** 모달 열릴 때 미리 선택할 팩 사이즈. 미지정 시 30 (기존 동작). */
  defaultSize?: PackSize;
};

// ─── ENV helper ───────────────────────────────────────────────────────────────

function getImpKey(): string {
  const key = process.env.NEXT_PUBLIC_PORTONE_V1_IMP_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_PORTONE_V1_IMP_KEY 환경변수가 설정되지 않았습니다.",
    );
  }
  return key;
}

function getChannelKey(): string {
  const key = process.env.NEXT_PUBLIC_PORTONE_V1_CHANNEL_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_PORTONE_V1_CHANNEL_KEY 환경변수가 설정되지 않았습니다.",
    );
  }
  return key;
}

/**
 * Galaxia 결제 시 bypass.galaxia.ITEM_CODE 로 전달. PG가 상품 식별자로 요구.
 * 실모드에서는 운영팀이 관리하는 상품 코드 사용 (galaxia/page.tsx 와 동일 env).
 */
function getItemCode(): string {
  const code = process.env.NEXT_PUBLIC_GALAXIA_ITEM_CODE;
  if (!code) {
    throw new Error(
      "NEXT_PUBLIC_GALAXIA_ITEM_CODE 환경변수가 설정되지 않았습니다.",
    );
  }
  return code;
}

// ─── Cancel helper ────────────────────────────────────────────────────────────
//
// 사용자가 PortOne 결제창에서 X 닫기 / 취소를 눌렀을 때 호출.
// /api/packs/krw/cancel 가 race-safe 하게 status='pending' 행만 'failed' 로
// 마킹한다. paid 인 행은 절대 덮어쓰지 않으므로 race 시에도 안전.
//
// silent: 어떤 실패 사유로 cancel API 가 실패해도 사용자 UI 에는 영향을 주지
// 않는다. 최후의 fallback 으로 cron sweep(10분 grace) 이 회수한다.
async function cancelPendingOrder(
  token: string,
  merchantUid: string,
): Promise<void> {
  try {
    await fetch("/api/packs/krw/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ merchant_uid: merchantUid }),
    });
  } catch (err) {
    // 네트워크 단절 등. sweep cron 이 결국 정리하므로 사용자에게 노출 X.
    console.warn("[PackPurchaseModal] cancel notify failed:", err);
  }
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export function PackPurchaseModal({
  open,
  onClose,
  onSuccess,
  buyer,
  organizationId,
  defaultSize,
}: PackPurchaseModalProps) {
  const [selectedSize, setSelectedSize] = useState<PackSize>(defaultSize ?? 10);
  const [phase, setPhase] = useState<ModalPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [successPack, setSuccessPack] = useState<PackResultPack | null>(null);

  // defaultSize 가 변경될 때(Pricing 페이지에서 다른 카드 클릭) 선택값 동기화
  useEffect(() => {
    if (defaultSize !== undefined) {
      setSelectedSize(defaultSize);
    }
  }, [defaultSize]);

  const isSubmitting =
    phase === "submitting_checkout" ||
    phase === "submitting_pg" ||
    phase === "submitting_complete";

  function resetToIdle() {
    setPhase("idle");
    setErrorMessage(null);
    setCompletedOrderId(null);
  }

  function handleClose() {
    // submitting_* 전체 차단 (checkout API call / PG 창 / complete 정산)
    if (isSubmitting) return;
    onClose();
    // 모달이 닫힌 후 상태 초기화 (애니메이션 고려해 약간 지연 없이 즉시 처리)
    setPhase("idle");
    setErrorMessage(null);
    setCompletedOrderId(null);
    setSuccessPack(null);
  }

  async function getAuthSession(): Promise<{ token: string; userId: string }> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const userId = data.session?.user?.id;
    if (!token || !userId) throw new Error("로그인이 필요합니다.");
    return { token, userId };
  }

  async function getOrgId(token: string): Promise<string> {
    if (organizationId) return organizationId;

    // organizationId 미전달 시 세션 사용자의 owner org 우선, 없으면 첫 번째 org 사용.
    const res = await fetch("/api/organizations", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("조직 정보를 불러오지 못했습니다.");
    const json = (await res.json()) as {
      organizations?: Array<{ id?: string; role?: string }>;
    };
    const list = Array.isArray(json.organizations) ? json.organizations : [];
    const ownerOrg = list.find(
      (o) => o.role === "owner" && typeof o.id === "string" && o.id,
    );
    const fallback = list.find((o) => typeof o.id === "string" && o.id);
    const picked = ownerOrg ?? fallback;
    if (picked && typeof picked.id === "string") {
      return picked.id;
    }

    // 비구독 / 신규 가입 사용자 — organization 이 없으면 즉시 생성.
    // POST /api/organizations 가 owner row 까지 자동 등록.
    const createRes = await fetch("/api/organizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
    if (!createRes.ok) {
      throw new Error("조직을 생성하지 못했습니다.");
    }
    const created = (await createRes.json()) as { id?: string };
    if (typeof created.id !== "string" || !created.id) {
      throw new Error("조직 생성 응답이 올바르지 않습니다.");
    }
    return created.id;
  }

  async function handlePurchase() {
    if (isSubmitting || phase === "success") return;

    // ── 1) Checkout (pending order 생성) ─────────────────────────────────
    setPhase("submitting_checkout");
    setErrorMessage(null);
    setCompletedOrderId(null);

    let token: string;
    let userId: string;
    let orgId: string;
    let merchantUid: string;
    let amount: number;

    try {
      const session = await getAuthSession();
      token = session.token;
      userId = session.userId;
      orgId = await getOrgId(token);

      const checkoutRes = await fetch("/api/packs/krw/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packSize: selectedSize, organizationId: orgId }),
      });

      if (!checkoutRes.ok) {
        const body = (await checkoutRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "주문 생성 실패");
      }

      const checkoutData = (await checkoutRes.json()) as {
        merchant_uid: string;
        amount: number;
        expires_at: string;
        order_name: string;
        pack_size: number;
      };

      if (
        typeof checkoutData.merchant_uid !== "string" ||
        typeof checkoutData.amount !== "number"
      ) {
        throw new Error("서버 응답 형식이 올바르지 않습니다.");
      }

      merchantUid = checkoutData.merchant_uid;
      amount = checkoutData.amount;
    } catch (err) {
      // 내부 에러 메시지는 콘솔에만 남기고 사용자에게는 고정 문구 노출
      console.warn("[PackPurchaseModal] checkout failed:", err);
      setPhase("error_checkout");
      setErrorMessage("주문 생성에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }

    // ── 2) PG 결제창 호출 ─────────────────────────────────────────────────
    setPhase("submitting_pg");

    const pgResponse = await new Promise<IamportResponse>((resolve) => {
      const imp = window.IMP;
      if (!imp) {
        resolve({
          success: false,
          error_msg: "결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
        });
        return;
      }

      let channelKey: string;
      let itemCode: string;
      try {
        imp.init(getImpKey());
        channelKey = getChannelKey();
        itemCode = getItemCode();
      } catch (e) {
        resolve({
          success: false,
          error_msg: e instanceof Error ? e.message : "결제 초기화 실패",
        });
        return;
      }

      // Galaxia PG 요구사항:
      //   1) customer_id 1~20자 — V2 가 자동 발송하는 UUID(54자)는 거부됨.
      //      V1 에서 명시 전달. userId 의 hyphen 제거 후 앞 20자.
      //   2) bypass.galaxia.ITEM_CODE — 상품 식별자. 운영팀이 관리하는 코드.
      const customerId = userId.replace(/-/g, "").slice(0, 20);

      // 모바일은 콜백 대신 m_redirect_url 로 이동 → /checkout/pack/result 가
      // /api/packs/krw/complete 를 호출해 동일한 정산 흐름을 수행한다.
      // 데스크탑은 콜백 path 가 우선 — m_redirect_url 은 무시됨.
      const mRedirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/checkout/pack/result`
          : undefined;

      imp.request_pay(
        {
          channelKey,
          pay_method: "card",
          merchant_uid: merchantUid,
          amount,
          name: `이미지 ${selectedSize}장 충전`,
          customer_id: customerId,
          buyer_email: buyer?.email,
          buyer_name: buyer?.name,
          m_redirect_url: mRedirectUrl,
          bypass: {
            galaxia: {
              ITEM_CODE: itemCode,
            },
          },
        },
        (response) => resolve(response),
      );
    });

    if (!pgResponse.success) {
      // 사용자가 결제창 X 닫기 / 취소 / PG 실패 — 서버 측 pending row 를 즉시
      // 'failed' 마킹해 BillingTab '처리 중' 누적과 sweep cron 지연 의존성을 제거.
      // race-safe: cancel API 가 status='pending' 일 때만 전이. paid 라면 무해.
      // silent fail: cancel 호출 자체가 실패해도 사용자에게 보여줄 필요 없음
      //   (cron sweep 이 결국 회수). 사용자 경험은 기존 error_pg 그대로.
      void cancelPendingOrder(token!, merchantUid);

      setPhase("error_pg");
      setErrorMessage(
        pgResponse.error_msg ?? "결제가 완료되지 않았어요. 다시 시도하시겠어요?",
      );
      return;
    }

    const impUid = pgResponse.imp_uid;
    if (!impUid) {
      // success=true 인데 imp_uid 누락 = PG 응답 비정상. 결제가 실제로 발생했을
      // 가능성이 있으므로 cancel 호출 금지 — pending 을 failed 로 마킹하면 cron
      // sweep 의 paid 회수 경로(.eq('status','pending') 가드)도 차단되어 사용자
      // 환불이 필요한 상태가 된다. 그대로 두고 sweep 이 PG 와 대조해 settlePackOrder
      // 로 자가치유하도록 위임.
      setPhase("error_pg");
      setErrorMessage("결제 응답에 imp_uid 가 없습니다. 다시 시도해주세요.");
      return;
    }

    // ── 3) Complete (정산) ────────────────────────────────────────────────
    setPhase("submitting_complete");

    try {
      const completeRes = await fetch("/api/packs/krw/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token!}`,
        },
        body: JSON.stringify({ merchant_uid: merchantUid, imp_uid: impUid }),
      });

      if (!completeRes.ok) {
        const body = (await completeRes.json().catch(() => ({}))) as {
          error?: string;
          order_id?: string;
        };
        if (typeof body.order_id === "string") {
          setCompletedOrderId(body.order_id);
        } else {
          setCompletedOrderId(merchantUid);
        }
        setPhase("error_complete");
        setErrorMessage(body.error ?? "충전 처리 중 오류가 발생했습니다.");
        return;
      }

      const completeData = (await completeRes.json()) as {
        ok: boolean;
        idempotent: boolean;
        pack: PackResultPack;
      };

      if (
        !completeData.ok ||
        typeof completeData.pack !== "object" ||
        !completeData.pack
      ) {
        setCompletedOrderId(merchantUid);
        setPhase("error_complete");
        setErrorMessage("충전 처리 중 오류가 발생했습니다.");
        return;
      }

      setSuccessPack(completeData.pack);
      setPhase("success");
      onSuccess?.(completeData.pack);
    } catch {
      setCompletedOrderId(merchantUid);
      setPhase("error_complete");
      setErrorMessage("충전 처리 중 오류가 발생했습니다.");
    }
  }

  // ─── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* PortOne V1 SDK — 이미 로드된 경우 브라우저가 캐싱해 중복 실행 없음 */}
      <Script
        src="https://cdn.iamport.kr/v1/iamport.js"
        strategy="afterInteractive"
      />

      <PlanDialogShell
        open={open}
        onClose={handleClose}
        loading={isSubmitting}
        maxWidth="520px"
        labelledBy="pack-purchase-title"
      >
        {phase === "success" && successPack ? (
          <SuccessView
            pack={successPack}
            onConfirm={handleClose}
          />
        ) : (
          <PurchaseView
            selectedSize={selectedSize}
            onSelectSize={setSelectedSize}
            phase={phase}
            errorMessage={errorMessage}
            completedOrderId={completedOrderId}
            isSubmitting={isSubmitting}
            onPurchase={() => void handlePurchase()}
            onRetry={resetToIdle}
            onClose={handleClose}
          />
        )}
      </PlanDialogShell>
    </>
  );
}

// ─── 서브 뷰: 구매 폼 ─────────────────────────────────────────────────────────

type PurchaseViewProps = {
  selectedSize: PackSize;
  onSelectSize: (size: PackSize) => void;
  phase: ModalPhase;
  errorMessage: string | null;
  completedOrderId: string | null;
  isSubmitting: boolean;
  onPurchase: () => void;
  onRetry: () => void;
  onClose: () => void;
};

function PurchaseView({
  selectedSize,
  onSelectSize,
  phase,
  errorMessage,
  completedOrderId,
  isSubmitting,
  onPurchase,
  onRetry,
  onClose,
}: PurchaseViewProps) {
  const ctaLabel = (() => {
    switch (phase) {
      case "submitting_checkout":
        return "주문을 만들고 있어요...";
      case "submitting_pg":
        return "결제 창을 여는 중...";
      case "submitting_complete":
        return "이미지를 충전하고 있어요...";
      default:
        return "구매하기";
    }
  })();

  return (
    <>
      {/* 헤딩 */}
      <h2
        id="pack-purchase-title"
        className="font-headline text-2xl font-bold text-white"
      >
        이미지만 구매
      </h2>
      <p
        className="text-sm mt-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        원하는 장수를 선택하세요. 결제 즉시 충전됩니다.
      </p>

      {/* 팩 선택 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        {PACK_OPTIONS.map((opt) => (
          <PackCard
            key={opt.size}
            option={opt}
            selected={selectedSize === opt.size}
            onSelect={() => onSelectSize(opt.size)}
            disabled={isSubmitting}
          />
        ))}
      </div>

      {/* 에러 메시지 */}
      {(phase === "error_checkout" || phase === "error_pg") && errorMessage && (
        <div
          className="rounded-xl p-3.5 text-xs mt-4"
          style={{
            background: "rgba(255,80,80,0.08)",
            border: "1px solid rgba(255,80,80,0.18)",
            color: "rgba(255,120,120,0.9)",
          }}
        >
          {errorMessage}
        </div>
      )}

      {phase === "error_complete" && errorMessage && (
        <div
          className="rounded-xl p-3.5 text-xs mt-4 leading-relaxed"
          style={{
            background: "rgba(255,80,80,0.08)",
            border: "1px solid rgba(255,80,80,0.18)",
            color: "rgba(255,120,120,0.9)",
          }}
        >
          결제는 완료됐지만 충전 중 오류가 발생했어요. 고객지원에 주문번호를
          알려주시면 즉시 처리해드려요.
          {completedOrderId && (
            <span className="block mt-1 font-mono opacity-70">
              (주문번호: {completedOrderId})
            </span>
          )}
        </div>
      )}

      {/* CTA 버튼 */}
      <div className="mt-6">
        {phase === "error_complete" ? (
          // error_complete — 닫기만 노출 (재시도 = 재결제 위험)
          <button
            type="button"
            className="w-full rounded-full py-3 text-sm font-medium transition-colors"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
            onClick={onClose}
          >
            닫기
          </button>
        ) : phase === "error_checkout" || phase === "error_pg" ? (
          // error_checkout / error_pg — 재시도 가능
          <button
            type="button"
            className="w-full rounded-full py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              background:
                "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
              color: "#000",
            }}
            onClick={onRetry}
          >
            다시 시도
          </button>
        ) : (
          // idle / submitting
          <button
            type="button"
            className="w-full rounded-full py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
            style={{
              background:
                "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
              color: "#000",
            }}
            onClick={onPurchase}
            disabled={isSubmitting}
          >
            {isSubmitting && <InlineSpinner color="#000" />}
            {ctaLabel}
          </button>
        )}
      </div>
    </>
  );
}

// ─── 서브 뷰: 성공 확인 ──────────────────────────────────────────────────────

type SuccessViewProps = {
  pack: PackResultPack;
  onConfirm: () => void;
};

function SuccessView({ pack, onConfirm }: SuccessViewProps) {
  return (
    <div className="text-center py-4">
      {/* 성공 아이콘 */}
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
        style={{
          background: "rgba(255,164,198,0.15)",
          border: "1px solid rgba(255,164,198,0.3)",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12L10 17L19 7"
            stroke="#ffa4c6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2
        id="pack-purchase-title"
        className="font-headline text-2xl font-bold text-white mt-5"
      >
        이미지 {pack.initial_count}장이 충전됐어요!
      </h2>
      <p
        className="text-sm mt-2"
        style={{ color: "var(--text-secondary)" }}
      >
        지금 바로 생성을 이어가세요.
      </p>

      <button
        type="button"
        className="w-full rounded-full py-3 text-sm font-semibold transition-opacity hover:opacity-90 mt-8"
        style={{
          background:
            "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
          color: "#000",
        }}
        onClick={onConfirm}
      >
        확인
      </button>
    </div>
  );
}

// ─── 서브 컴포넌트: 팩 카드 ───────────────────────────────────────────────────

type PackCardProps = {
  option: PackOption;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
};

function PackCard({ option, selected, onSelect, disabled }: PackCardProps) {
  return (
    <button
      type="button"
      className="text-left rounded-2xl p-4 transition-transform hover:-translate-y-1 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      style={{
        border: selected
          ? "2px solid #ffa4c6"
          : "1px solid rgba(255,255,255,0.10)",
        background: selected
          ? "rgba(255,164,198,0.06)"
          : "rgba(255,255,255,0.04)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        transition: "transform 0.15s ease, border-color 0.15s ease",
      }}
      onClick={onSelect}
      disabled={disabled}
    >
      {/* 배지 */}
      {option.badge && (
        <span
          className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-2"
          style={{
            background: "linear-gradient(135deg,rgba(255,164,198,0.3),rgba(255,227,190,0.3))",
            color: "#ffa4c6",
            border: "1px solid rgba(255,164,198,0.3)",
          }}
        >
          {option.badge}
        </span>
      )}

      {/* 장수 */}
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-black text-white">
          {option.size.toLocaleString("ko-KR")}
        </span>
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          장
        </span>
      </div>

      {/* 가격 */}
      <div
        className="text-base font-bold mt-1"
        style={{ color: selected ? "#ffa4c6" : "var(--text-primary)" }}
      >
        ₩{option.priceKrw.toLocaleString("ko-KR")}
      </div>

      {/* 만료 */}
      <div
        className="text-xs mt-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {option.expiryDays}일 후 만료
      </div>
    </button>
  );
}
