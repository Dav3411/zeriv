"use client";

/**
 * /checkout/pack/result
 *
 * KRW 이미지 장수 팩 단건 결제 — 모바일 m_redirect_url 콜백 페이지.
 *
 * 데스크탑 흐름: imp.request_pay 의 콜백이 PackPurchaseModal 내부에서 직접 처리되므로
 * 이 페이지는 호출되지 않는다.
 *
 * 모바일 흐름: PortOne V1 결제창이 새 탭/풀스크린으로 열리고, 완료 후 m_redirect_url
 * 로 이동. 이 페이지에서 imp_uid + merchant_uid 를 추출해 /api/packs/krw/complete
 * 호출 → 결과 표시.
 *
 * Idempotency: webhook(/api/packs/krw/webhook) 이 이미 정산을 시도했을 수 있다.
 * /complete 는 멱등이라 안전하게 재호출 가능 — settlePackOrder 가 이미 paid 상태면
 * idempotent 응답을 반환한다.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Status = "processing" | "success" | "failed";
type FailureKind = "cancelled" | "error";

export default function PackCheckoutResultPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // PortOne V1 모바일 redirect 가 쿼리에 자동으로 채워주는 값들
  const impSuccess = searchParams.get("imp_success");
  const impUid = searchParams.get("imp_uid") ?? "";
  const merchantUid = searchParams.get("merchant_uid") ?? "";
  const errorMsgParam = searchParams.get("error_msg");

  const [status, setStatus] = useState<Status>("processing");
  const [failureKind, setFailureKind] = useState<FailureKind>("error");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [packSize, setPackSize] = useState<number | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    async function process() {
      // 결제창에서 사용자가 취소
      if (impSuccess === "false") {
        setStatus("failed");
        setFailureKind("cancelled");
        setErrorMsg(errorMsgParam ?? "결제를 취소하셨습니다.");
        return;
      }

      if (!impUid || !merchantUid) {
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
          setErrorMsg("로그인이 필요합니다.");
          return;
        }

        // 멱등: webhook 이 이미 처리했어도 같은 응답 반환
        const res = await fetch("/api/packs/krw/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            merchant_uid: merchantUid,
            imp_uid: impUid,
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            order_id?: string;
          };
          setStatus("failed");
          setFailureKind("error");
          setErrorMsg(
            body.order_id
              ? `${body.error ?? "충전 처리 실패"} (주문번호: ${body.order_id})`
              : body.error ?? "충전 처리 중 오류가 발생했어요.",
          );
          return;
        }

        const data = (await res.json()) as {
          ok?: boolean;
          pack?: { initial_count?: number };
        };
        if (!data.ok || !data.pack) {
          setStatus("failed");
          setFailureKind("error");
          setErrorMsg("충전 응답이 올바르지 않습니다.");
          return;
        }

        setPackSize(data.pack.initial_count ?? null);
        setStatus("success");
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "결제 처리 중 오류가 발생했어요.";
        setStatus("failed");
        setFailureKind("error");
        setErrorMsg(msg);
      }
    }

    void process();
  }, [impSuccess, impUid, merchantUid, errorMsgParam]);

  const failedTitle =
    failureKind === "cancelled"
      ? "결제가 취소되었습니다"
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
              충전 처리 중...
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
            <p className="font-headline text-white text-xl font-bold">
              {packSize !== null
                ? `이미지 ${packSize}장이 충전됐어요!`
                : "이미지가 충전됐어요!"}
            </p>
            <p className="mt-2 text-sm" style={{ color: "#6b6b7b" }}>
              지금 바로 생성을 이어가세요.
            </p>
            <button
              onClick={() => router.push("/")}
              className="mt-8 w-full rounded-full py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                background:
                  "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
                color: "#000",
              }}
            >
              홈으로 이동
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
