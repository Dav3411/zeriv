"use client";

import { useState } from "react";
import Script from "next/script";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import {
  getPlanPrice,
  getProGenerationLimit,
  toProTier,
  type ProTier,
} from "@/lib/plans-brand";
import type { IamportResponse } from "@/types/iamport";

// 구매 가능한 플랜 (free/studio 제외)
// price는 plans-brand.ts의 getPlanPrice()로 산정 — 여기서 하드코딩하지 않음
const PLAN_BASE = {
  quick_plus: {
    name: "Quick Plus",
    features: [
      "스타일 1개",
      "이미지 생성 100장/월",
      "브랜드 1개",
      "팀원 1명",
      "채널별 내보내기 3채널",
      "워터마크 포함",
    ],
  },
  starter: {
    name: "Atelier",
    features: [
      "스타일 5개",
      "모델 2명",
      "이미지 생성 60장/월",
      "브랜드 1개",
      "팀원 1명",
      "채널별 내보내기 3채널",
    ],
  },
  label: {
    name: "Label",
    features: [
      "스타일 20개",
      "모델 5명",
      "이미지 생성 210장/월",
      "브랜드 1개",
      "팀원 3명",
      "채널별 내보내기",
    ],
  },
  pro: {
    name: "Pro",
    features: [
      "스타일 50개",
      "모델 10명",
      "브랜드 2개",
      "팀원 5명",
      "채널별 내보내기",
      "우선 생성 큐",
    ],
  },
} as const;

type PurchasablePlanKey = keyof typeof PLAN_BASE;

const SYSTEM_BRAND_ID = "00000000-0000-0000-0000-000000000001";

// ─── ENV (클라이언트) ─────────────────────────────────────────────────────────
// fail-fast: ENV 미설정 시 명확한 에러를 던져 운영 사고 방지
function readPublicEnv(): {
  impKey: string;
  channelKey: string;
  itemCode: string;
} {
  const impKey = process.env.NEXT_PUBLIC_PORTONE_V1_IMP_KEY;
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_V1_CHANNEL_KEY;
  const itemCode = process.env.NEXT_PUBLIC_GALAXIA_ITEM_CODE;
  if (!impKey) {
    throw new Error(
      "NEXT_PUBLIC_PORTONE_V1_IMP_KEY 환경변수가 설정되지 않았습니다.",
    );
  }
  if (!channelKey) {
    throw new Error(
      "NEXT_PUBLIC_PORTONE_V1_CHANNEL_KEY 환경변수가 설정되지 않았습니다.",
    );
  }
  if (!itemCode) {
    throw new Error(
      "NEXT_PUBLIC_GALAXIA_ITEM_CODE 환경변수가 설정되지 않았습니다.",
    );
  }
  return { impKey, channelKey, itemCode };
}

export default function GalaxiaCheckoutPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const rawPlan = searchParams.get("plan") ?? "starter";
  const planKey: PurchasablePlanKey = (
    rawPlan in PLAN_BASE ? rawPlan : "starter"
  ) as PurchasablePlanKey;
  const brandId = searchParams.get("brand_id") ?? SYSTEM_BRAND_ID;

  // Pro 티어 파라미터 (1~4, 기본 1)
  const rawTier = parseInt(searchParams.get("tier") ?? "1", 10);
  const planTier: ProTier = toProTier(rawTier);

  const plan = PLAN_BASE[planKey];
  const displayPrice = getPlanPrice(planKey, planTier);
  const displayName =
    planKey === "pro" ? `${plan.name} Tier ${planTier}` : plan.name;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  async function getAuthToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function callPrepare(token: string): Promise<{
    intentId: string;
    customerUid: string;
    merchantUid: string;
  }> {
    const res = await fetch("/api/portone/billing-key/prepare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ planKey, brandId, planTier }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "결제 준비 실패");
    }
    return (await res.json()) as {
      intentId: string;
      customerUid: string;
      merchantUid: string;
    };
  }

  async function callIssueRoute(params: {
    intentId: string;
    token: string;
  }): Promise<void> {
    const res = await fetch("/api/portone/billing-key/issue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.token}`,
      },
      body: JSON.stringify({ intentId: params.intentId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "빌링키 등록·결제 실패");
    }
  }

  async function handlePay() {
    setLoading(true);
    setResult(null);

    try {
      const token = await getAuthToken();
      if (!token) {
        window.location.href = "/login?redirect=/pricing";
        return;
      }

      // ENV는 핸들러 내에서 읽음 — Next.js가 빌드 타임에 inline. 누락 시 명확한 에러.
      const env = readPublicEnv();

      // V1 SDK 로드 검증
      if (!window.IMP) {
        throw new Error(
          "결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
        );
      }

      // imp_key로 초기화 (idempotent — 매 클릭마다 호출 OK)
      window.IMP.init(env.impKey);

      const userId = user?.id ?? "";
      if (!userId) {
        throw new Error("로그인이 필요합니다.");
      }

      // ── 서버에서 customer_uid / merchant_uid 발급 (IDOR 방지) ──────────
      const { intentId, customerUid, merchantUid } = await callPrepare(token);

      // customer_id — Galaxia ≤20자. UUID 첫 20자(`xxxxxxxx-xxxx-xxxx`).
      const customerId = userId.slice(0, 20);

      // V1 빌링키 발급 호출
      // 데스크톱: 콜백 / 모바일: m_redirect_url 리다이렉트
      const response = await new Promise<IamportResponse>((resolve) => {
        const imp = window.IMP;
        if (!imp) {
          resolve({
            success: false,
            error_msg: "결제 모듈이 사라졌습니다.",
          });
          return;
        }
        imp.request_pay(
          {
            channelKey: env.channelKey,
            pay_method: "card",
            merchant_uid: merchantUid,
            name: `Zeriv ${displayName} 정기결제`,
            amount: 0,
            customer_uid: customerUid,
            customer_id: customerId,
            buyer_email: user?.email ?? undefined,
            buyer_name: user?.email?.split("@")[0] ?? undefined,
            // intent_id 단일 키만 redirect URL 에 포함 — customer_uid 평문 노출 방지
            m_redirect_url: `${location.origin}/checkout/result?billing=1&intent_id=${encodeURIComponent(intentId)}&plan=${planKey}&brand_id=${brandId}&tier=${planTier}`,
            bypass: {
              galaxia: {
                ITEM_CODE: env.itemCode,
              },
            },
          },
          (resp) => resolve(resp),
        );
      });

      if (!response.success) {
        throw new Error(response.error_msg ?? "결제가 취소되었습니다");
      }

      await callIssueRoute({ intentId, token });

      setResult({
        success: true,
        message: "정기결제가 등록되었습니다.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "오류가 발생했습니다";
      setResult({ success: false, message: msg });
    } finally {
      setLoading(false);
    }
  }

  // 다음 결제 예정일 (오늘 + 30일) — 안내용 표시
  const nextBillingDate = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toLocaleDateString("ko-KR");

  return (
    <div
      style={{ background: "var(--surface-0)", minHeight: "100vh" }}
      className="px-6 py-16"
    >
      {/* PortOne V1 (아임포트) SDK */}
      <Script
        src="https://cdn.iamport.kr/v1/iamport.js"
        strategy="afterInteractive"
      />
      <div className="max-w-lg mx-auto">
        {/* 헤더 */}
        <div className="mb-10">
          <p
            className="text-[11px] uppercase tracking-[0.18em] font-bold mb-2"
            style={{ color: "rgba(255,164,198,0.55)" }}
          >
            구독 결제
          </p>
          <h1 className="text-2xl font-bold text-white">
            Zeriv {displayName} 플랜
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#6b6b7b" }}>
            등록한 카드로 매월 자동 결제됩니다. 언제든 설정 &gt; 결제 탭에서
            해지할 수 있습니다.
          </p>
        </div>

        {/* 상품 카드 */}
        <div
          className="rounded-2xl p-8 mb-6"
          style={{
            background: "rgba(255,164,198,0.05)",
            border: "2px solid rgba(255,164,198,0.3)",
          }}
        >
          <p
            className="text-[11px] uppercase tracking-[0.16em] font-bold mb-1"
            style={{ color: "rgba(255,164,198,0.9)" }}
          >
            {displayName}
          </p>
          {planKey === "pro" && (
            <p
              className="text-xs mt-1 mb-2"
              style={{ color: "rgba(255,164,198,0.5)" }}
            >
              {getProGenerationLimit(planTier).toLocaleString("ko-KR")}장/월
            </p>
          )}
          <div className="flex items-end gap-1 mt-3 mb-6">
            <span className="text-[42px] font-black leading-none text-white">
              {displayPrice.toLocaleString("ko-KR")}
            </span>
            <span className="text-sm mb-1" style={{ color: "#6b6b7b" }}>
              원/월
            </span>
          </div>

          <div
            className="h-px mb-6"
            style={{ background: "var(--border-subtle)" }}
          />

          <ul className="space-y-3">
            {plan.features.map((f) => (
              <li key={f} className="flex items-center gap-2.5">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  className="shrink-0"
                >
                  <circle
                    cx="7.5"
                    cy="7.5"
                    r="7.5"
                    fill="rgba(255,164,198,0.15)"
                  />
                  <path
                    d="M4.5 7.5L6.5 9.5L10.5 5.5"
                    stroke="#ffa4c6"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  {f}
                </span>
              </li>
            ))}
            {planKey === "pro" && (
              <li className="flex items-center gap-2.5">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  className="shrink-0"
                >
                  <circle
                    cx="7.5"
                    cy="7.5"
                    r="7.5"
                    fill="rgba(255,164,198,0.15)"
                  />
                  <path
                    d="M4.5 7.5L6.5 9.5L10.5 5.5"
                    stroke="#ffa4c6"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  이미지 생성{" "}
                  {getProGenerationLimit(planTier).toLocaleString("ko-KR")}장/월
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* 결제 수단 */}
        <div
          className="rounded-xl p-5 mb-6"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <p
            className="text-xs font-semibold mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            결제 수단
          </p>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg"
              style={{
                background: "rgba(255,164,198,0.08)",
                border: "1px solid rgba(255,164,198,0.3)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect
                  x="2"
                  y="4"
                  width="16"
                  height="12"
                  rx="2"
                  stroke="#ffa4c6"
                  strokeWidth="1.5"
                />
                <path d="M2 8H18" stroke="#ffa4c6" strokeWidth="1.5" />
                <rect
                  x="4"
                  y="11"
                  width="4"
                  height="2"
                  rx="0.5"
                  fill="#ffa4c6"
                  opacity="0.6"
                />
              </svg>
              <span
                className="text-sm font-medium"
                style={{ color: "rgba(255,164,198,0.9)" }}
              >
                신용/체크카드
              </span>
            </div>
          </div>
        </div>

        {/* 결제 버튼 */}
        <button
          onClick={() => void handlePay()}
          disabled={loading}
          className="w-full rounded-xl py-4 text-base font-bold transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg,#ffa4c6,#ffe3be)",
            color: "#000",
          }}
        >
          {loading
            ? "결제창 호출 중..."
            : `₩${displayPrice.toLocaleString("ko-KR")} 정기결제 등록하기`}
        </button>

        {/* 결과 표시 */}
        {result && (
          <div
            className="mt-4 rounded-xl p-4 text-center"
            style={{
              background: result.success
                ? "rgba(255,164,198,0.08)"
                : "rgba(255,80,80,0.08)",
              border: result.success
                ? "1px solid rgba(255,164,198,0.2)"
                : "1px solid rgba(255,80,80,0.2)",
            }}
          >
            <p
              className="text-sm font-medium"
              style={{
                color: result.success ? "#ffa4c6" : "rgba(255,100,100,0.8)",
              }}
            >
              {result.message}
            </p>
          </div>
        )}

        {/* 안내 */}
        <div
          className="mt-8 rounded-xl p-5"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <p
            className="text-xs font-semibold mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            구독 안내
          </p>
          <div className="space-y-2">
            {[
              { label: "결제 방식", value: "카드 자동결제 (정기결제)" },
              { label: "구독 기간", value: "결제일로부터 30일" },
              { label: "갱신 안내", value: "만료 3일 전 자동결제 시도" },
              { label: "다음 결제 예정일", value: nextBillingDate },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between">
                <span className="text-[11px]" style={{ color: "#4b4b5b" }}>
                  {label}
                </span>
                <span
                  className="text-[11px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
