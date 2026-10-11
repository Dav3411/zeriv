"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Status = "processing" | "success" | "failed" | "pending_pg";
type FailureKind = "cancelled" | "error";

// issue 라우트가 503 으로 응답할 때 보내는 안내 코드.
// 사용자에게 "재시도하지 말고 잠시 후 자동 처리됨" 을 명시하기 위한 분기 키.
const PG_PENDING_CODES = new Set([
  "PG_TRANSIENT_RETRY_LATER", // step 6 (getCustomerInfo) PG 일시 장애로 pg_checking 전이
  "PG_CHECKING_IN_PROGRESS",  // 이미 pg_checking 상태인 intent 에 재진입
]);

export default function CheckoutResultPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // V1 빌링키 모드 (자동갱신) — 단일 경로
  // 모바일은 m_redirect_url로 이 페이지로 리다이렉트되며 imp_uid/imp_success 가 query에 담김.
  // intent_id 만 쿼리에 포함 — customer_uid/merchant_uid 는 서버 측 매핑 테이블에서 조회.
  const billingFlag = searchParams.get("billing");
  const impSuccess = searchParams.get("imp_success");
  const intentId = searchParams.get("intent_id") ?? "";
  const brandId = searchParams.get("brand_id") ?? "";
  const errorMsgParam = searchParams.get("error_msg");

  const [status, setStatus] = useState<Status>("processing");
  const [failureKind, setFailureKind] = useState<FailureKind>("error");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const calledRef = useRef(false);

  useEffect(() => {
    // 중복 호출 방지 (StrictMode/새로고침 race) — 동일 마운트 내에서만 가드.
    // 새로고침은 issue 라우트 측 멱등성으로 처리됨.
    if (calledRef.current) return;
    calledRef.current = true;

    async function process() {
      // 빌링키 모드만 지원 — billing=1 누락 시 잘못된 진입
      if (billingFlag !== "1") {
        setStatus("failed");
        setFailureKind("error");
        setErrorMsg("잘못된 결제 결과 페이지입니다.");
        return;
      }

      // V1 결제창 자체에서 사용자가 카드 등록 취소
      if (impSuccess === "false") {
        setStatus("failed");
        setFailureKind("cancelled");
        setErrorMsg(errorMsgParam ?? "카드 등록을 취소하셨습니다.");
        return;
      }

      if (!intentId) {
        setStatus("failed");
        setFailureKind("error");
        setErrorMsg("결제 정보가 누락되었습니다.");
        return;
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setStatus("failed");
          setFailureKind("error");
          setErrorMsg("로그인이 필요합니다");
          return;
        }

        const res = await fetch("/api/portone/billing-key/issue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ intentId }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
          };

          // PG 일시 장애 → sweep cron 이 자동 처리. 사용자 재시도 차단 + 안내.
          // 503 + PG_PENDING_CODES 일 때만 적용; 그 외 4xx/5xx 는 기존 failed 흐름.
          if (res.status === 503 && data.code && PG_PENDING_CODES.has(data.code)) {
            setStatus("pending_pg");
            setErrorMsg(
              data.error ??
                "결제 처리가 지연되고 있습니다. 잠시 후 자동 완료됩니다.",
            );
            return;
          }

          throw new Error(data.error ?? "빌링키 등록·결제 실패");
        }

        setStatus("success");
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "결제 처리 중 오류가 발생했습니다";
        setStatus("failed");
        setFailureKind("error");
        setErrorMsg(msg);
      }
    }

    void process();
  }, [billingFlag, impSuccess, intentId, errorMsgParam]);

  const failedTitle =
    failureKind === "cancelled"
      ? "정기결제 등록이 취소되었습니다"
      : "결제에 실패했습니다";

  return (
    <div
      style={{ background: "var(--surface-0)", minHeight: "100vh" }}
      className="flex items-center justify-center px-6"
    >
      <div
        className="w-full max-w-md rounded-2xl p-10 text-center"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {status === "processing" && (
          <>
            <div className="mx-auto mb-6 w-10 h-10 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
            <p className="text-white text-base font-semibold">
              결제 확인 중...
            </p>
            <p className="mt-2 text-sm" style={{ color: "#6b6b7b" }}>
              잠시만 기다려주세요
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div
              className="mx-auto mb-6 w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(255,164,198,0.12)",
                border: "1px solid rgba(255,164,198,0.3)",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path
                  d="M7 14L11.5 18.5L21 9"
                  stroke="#ffa4c6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-white text-xl font-bold">
              정기결제가 등록되었습니다
            </p>
            <p className="mt-2 text-sm" style={{ color: "#6b6b7b" }}>
              첫 결제와 함께 구독이 활성화되었습니다
            </p>
            <button
              onClick={() => router.push(brandId ? `/brands/${brandId}` : "/")}
              className="mt-8 w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                background: "linear-gradient(135deg,#ffa4c6,#ffe3be)",
                color: "#000",
              }}
            >
              브랜드 스튜디오로 이동
            </button>
          </>
        )}

        {status === "pending_pg" && (
          <>
            <div
              className="mx-auto mb-6 w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(251,191,36,0.10)",
                border: "1px solid rgba(251,191,36,0.25)",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path
                  d="M14 7V14L18 17"
                  stroke="var(--warning, #fbbf24)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="14"
                  cy="14"
                  r="10"
                  stroke="var(--warning, #fbbf24)"
                  strokeWidth="2.5"
                />
              </svg>
            </div>
            <p className="text-white text-xl font-bold">
              결제 처리가 지연되고 있습니다
            </p>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {errorMsg}
            </p>
            <p
              className="mt-2 text-xs leading-relaxed"
              style={{ color: "#6b6b7b" }}
            >
              카드는 청구되지 않았으며, 결제는 자동으로 완료됩니다.
              <br />
              5분 후 새로고침하거나 구독 페이지에서 상태를 확인해주세요.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-8 w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                background: "var(--surface-3)",
                color: "var(--text-primary)",
              }}
            >
              새로고침하여 다시 확인
            </button>
          </>
        )}

        {status === "failed" && (
          <>
            <div
              className="mx-auto mb-6 w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(255,80,80,0.08)",
                border: "1px solid rgba(255,80,80,0.2)",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path
                  d="M8 8L20 20M20 8L8 20"
                  stroke="rgba(255,100,100,0.8)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-white text-xl font-bold">{failedTitle}</p>
            <p
              className="mt-2 text-sm"
              style={{ color: "rgba(255,100,100,0.7)" }}
            >
              {errorMsg}
            </p>
            <button
              onClick={() => router.push("/pricing")}
              className="mt-8 w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                background: "var(--surface-3)",
                color: "var(--text-primary)",
              }}
            >
              다시 시도하기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
