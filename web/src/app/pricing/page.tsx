"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { OrgDropdown } from "@/components/OrgDropdown";
import { Logo } from "@/components/Logo";
import { FooterSection } from "@/app/landing/FooterSection";
import { FadeInOnScroll } from "@/app/landing/FadeInOnScroll";
import { useRouter } from "next/navigation";
import { PortonePayButton } from "@/components/PortonePayButton";
import { supabase } from "@/lib/supabaseClient";
import {
  BRAND_PLANS,
  getProPriceKrw,
  getProGenerationLimit,
  getPlanPrice,
  getPlanDisplayName,
  type ProTier,
} from "@/lib/plans-brand";
import { UpgradeConfirmDialog } from "@/components/subscription/UpgradeConfirmDialog";
import { DowngradeConfirmDialog } from "@/components/subscription/DowngradeConfirmDialog";
import { PackPurchaseModal, PACK_OPTIONS, type PackSize, type PackOption } from "@/components/packs/PackPurchaseModal";
import { clearPackBalanceCache } from "@/components/packs/PackBalance";

// UUID v4 형식 검증 (open redirect 방어)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// TODO: PayPal 연동 시 실제 USD 구독 가격으로 교체
const PAYPAL_PLANS = [
  {
    id: "starter",
    name: "Atelier",
    priceUsd: 22,
    desc: "5 styles · 60 images/mo · 1 member",
  },
  {
    id: "label",
    name: "Label",
    priceUsd: 74,
    desc: "20 styles · 210 images/mo · 3 members",
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 185,
    desc: "50 styles · 500~1,100 images/mo · 5 members",
  },
  {
    id: "studio",
    name: "House",
    priceUsd: 0,
    desc: "Unlimited — contact us",
  },
] as const;

const FAQ_ITEMS = [
  {
    q: "플랜은 언제부터 적용되나요?",
    a: "결제 완료 즉시 적용됩니다. 스타일 분석, 이미지 생성, 팀원 초대 등 플랜에 포함된 모든 기능이 바로 활성화됩니다.",
  },
  {
    q: "팀원 초대는 어떻게 하나요?",
    a: "설정 > 브랜드 탭에서 이메일로 초대할 수 있습니다. 초대받은 팀원은 동일한 브랜드 자산과 스타일에 접근 가능합니다.",
  },
  {
    q: "채널별 내보내기란 무엇인가요?",
    a: "인스타그램 피드, 스토리, 유튜브 썸네일 등 채널별로 최적화된 비율과 해상도로 이미지를 즉시 내보내는 기능입니다. Label 플랜부터 사용 가능합니다.",
  },
  {
    q: "Pro 플랜 티어를 변경할 수 있나요?",
    a: "언제든지 상위 티어로 업그레이드할 수 있으며, 즉시 적용되고 일할 차액만 청구됩니다. 하위 티어로의 다운그레이드는 다음 결제일부터 적용되며, 그때까지는 기존 티어를 그대로 사용하실 수 있습니다.",
  },
  {
    q: "플랜 업그레이드·다운그레이드·취소는 어떻게 하나요?",
    a: "설정 > 결제 탭에서 변경할 수 있습니다. 업그레이드는 즉시 적용되며 남은 기간만큼의 차액이 청구됩니다. 다운그레이드와 취소는 현재 결제 주기가 끝나는 시점에 적용되며, 그때까지는 기존 플랜을 모두 사용하실 수 있습니다. 환불은 없습니다.",
  },
  {
    q: "해외에서도 구독할 수 있나요?",
    a: "현재는 한국 원화 결제만 지원합니다. 글로벌 출시 시 USD 결제를 지원할 예정입니다.",
  },
] as const;

// ─── Pricing 전용 팩 카드 ────────────────────────────────────────────────────

function PricingPackCard({
  option,
  onBuy,
}: {
  option: PackOption;
  onBuy: () => void;
}) {
  // 추천 팩(isDefault)에 "BEST DEAL" 리본 — PACK_OPTIONS 단일 소스
  const isBestDeal = option.isDefault === true;
  // badge에서 "인기" 문구 제거 — "20% 할인" 만 inline pill 로
  const discountBadge = option.badge?.replace(/\s*·\s*인기/, "") ?? null;

  return (
    <div
      className="relative rounded-2xl p-6 flex flex-col cursor-pointer"
      style={{
        background: option.isDefault
          ? "rgba(255,164,198,0.06)"
          : "rgba(255,255,255,0.03)",
        border: option.isDefault
          ? "2px solid rgba(255,164,198,0.4)"
          : "1px solid rgba(255,255,255,0.08)",
        transition: "transform 0.15s ease, border-color 0.15s ease",
      }}
      onClick={onBuy}
    >
      {/* BEST DEAL 리본 */}
      {isBestDeal && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-3 inline-flex items-center gap-1 px-3 py-1 rounded-full"
          style={{
            background:
              "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
          }}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-black whitespace-nowrap">
            🔥 BEST DEAL
          </span>
        </div>
      )}

      {/* 할인 배지 (인라인 pill) */}
      {discountBadge && (
        <span
          className="inline-block self-start text-[10px] font-bold px-2 py-0.5 rounded-full mb-3"
          style={{
            background:
              "linear-gradient(135deg,rgba(255,164,198,0.3),rgba(255,227,190,0.3))",
            color: "#ffa4c6",
            border: "1px solid rgba(255,164,198,0.3)",
          }}
        >
          {discountBadge}
        </span>
      )}

      {/* 장수 */}
      <div className="flex items-baseline gap-1 mt-auto">
        <span className="text-3xl font-bold text-white">
          {option.size.toLocaleString("ko-KR")}
        </span>
        <span className="text-base" style={{ color: "var(--text-secondary)" }}>
          장
        </span>
      </div>

      {/* 가격 */}
      <div
        className="text-xl font-semibold mt-1"
        style={{ color: option.isDefault ? "#ffa4c6" : "var(--text-primary)" }}
      >
        ₩{option.priceKrw.toLocaleString("ko-KR")}
      </div>

      {/* 만료일 pill */}
      <div className="mt-1.5">
        <span
          className="inline-flex px-2 py-0.5 rounded-full text-[10px]"
          style={{
            background: "rgba(39,39,42,0.5)",
            color: "var(--text-secondary)",
          }}
        >
          {option.expiryDays}일 후 만료
        </span>
      </div>

      {/* CTA */}
      <button
        type="button"
        className="mt-5 w-full rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
        style={{
          background:
            "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
          color: "#000",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onBuy();
        }}
      >
        구매하기
      </button>
    </div>
  );
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function FeatureItem({
  label,
  included,
  upsell = false,
}: {
  label: string;
  included: boolean;
  upsell?: boolean;
}) {
  // upsell variant: 상위 플랜으로의 유도 — X가 아닌 위쪽 화살표 아이콘 사용
  if (upsell) {
    return (
      <li className="flex items-center gap-2.5">
        <svg
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
          className="shrink-0"
        >
          <circle cx="7.5" cy="7.5" r="7.5" fill="rgba(255,164,198,0.07)" />
          <path
            d="M7.5 10.5V4.5M4.5 7.5L7.5 4.5L10.5 7.5"
            stroke="rgba(255,164,198,0.5)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
          {label}
        </span>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2.5">
      {included ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
          className="shrink-0"
        >
          <circle cx="7.5" cy="7.5" r="7.5" fill="rgba(255,164,198,0.15)" />
          <path
            d="M4.5 7.5L6.5 9.5L10.5 5.5"
            stroke="#ffa4c6"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
          className="shrink-0"
        >
          <circle cx="7.5" cy="7.5" r="7.5" fill="rgba(255,255,255,0.04)" />
          <path
            d="M5 5L10 10M10 5L5 10"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span
        className="text-sm"
        style={{
          color: included ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.3)",
        }}
      >
        {label}
      </span>
    </li>
  );
}

// ─── 플랜 키 / 랭크 ───────────────────────────────────────────────────────────

type PlanKey = "free" | "quick_plus" | "starter" | "label" | "pro" | "studio";

/**
 * 카드 ↔ 현재 구독 관계.
 * - none: 미구독 또는 다른 카테고리(studio 등) → 기존 구독 시작 플로우
 * - current: 동일 플랜+티어 (또는 free + 미구독)
 * - upgrade: 가격 기준 상향
 * - downgrade: 가격 기준 하향
 */
type PlanRelation = "none" | "current" | "upgrade" | "downgrade";

function computePlanRelation(
  cardKey: PlanKey,
  cardTier: number | null,
  currentKey: PlanKey | null,
  currentTier: number,
): PlanRelation {
  if (!currentKey) return "none";
  if (cardKey === "free") {
    if (currentKey === "free" || currentKey === null) return "current";
    return "downgrade";
  }
  if (cardKey === "studio" || currentKey === "studio") {
    // studio 는 별도 문의 — 비교 대상 외
    if (cardKey === currentKey) return "current";
    return "none";
  }
  const cardPrice = getPlanPrice(cardKey, cardTier ?? 1);
  const currentPrice = getPlanPrice(currentKey, currentTier);
  if (cardKey === currentKey && (cardTier ?? 1) === (currentTier ?? 1)) {
    return "current";
  }
  if (cardPrice > currentPrice) return "upgrade";
  if (cardPrice < currentPrice) return "downgrade";
  // 같은 가격 + 다른 티어 — 사이드그레이드. UX상 업그레이드로 분류해 즉시 적용.
  return "upgrade";
}

// ─── Free 카드 ────────────────────────────────────────────────────────────────

function FreeCard({
  isLoggedIn,
  activeBrandId,
  currentPlanKey,
}: {
  isLoggedIn: boolean;
  activeBrandId: string | null;
  currentPlanKey: PlanKey | null;
}) {
  const isCurrent = currentPlanKey === "free" || currentPlanKey === null;

  return (
    <div
      className="relative rounded-2xl p-7 h-full min-h-[580px] flex flex-col hover:-translate-y-1 transition-all duration-200"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* 플랜명 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p
          className="text-lg uppercase tracking-[0.16em] font-bold"
          style={{ color: "rgba(255,164,198,0.85)" }}
        >
          Free
        </p>
        {isCurrent && isLoggedIn && (
          <span
            className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-0.5"
            style={{
              background: "rgba(255,164,198,0.12)",
              color: "rgba(255,164,198,0.7)",
            }}
          >
            현재 이용 중
          </span>
        )}
      </div>

      {/* 이미지 환산 박스 */}
      <div
        className="mt-4 rounded-xl px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path d="M7 1L8.5 5H13L9.5 7.5L11 11.5L7 9L3 11.5L4.5 7.5L1 5H5.5L7 1Z" stroke="#ffa4c6" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
          <span className="text-sm font-medium text-white">매월 이미지 5장</span>
        </div>
        <p
          className="text-[11px] mt-1 ml-5"
          style={{ color: "var(--text-secondary)" }}
        >
          스타일 체험에 적합
        </p>
      </div>

      {/* 가격 */}
      <div className="mt-4 flex items-end gap-1">
        <span className="text-5xl font-black leading-none text-white">
          0
        </span>
        <span
          className="text-sm mb-1 whitespace-nowrap"
          style={{ color: "var(--text-secondary)" }}
        >
          원/월
        </span>
      </div>

      <div
        className="h-px my-8"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />

      <ul className="space-y-4 flex-1">
        <FeatureItem
          label={
            BRAND_PLANS.free.styleLimit === 0
              ? "스타일 세팅 불가"
              : `스타일 ${BRAND_PLANS.free.styleLimit}개`
          }
          included={(BRAND_PLANS.free.styleLimit ?? 0) > 0}
        />
        <FeatureItem
          label={
            BRAND_PLANS.free.modelLimit === 0
              ? "AI 모델 미포함"
              : `모델 ${BRAND_PLANS.free.modelLimit}명`
          }
          included={(BRAND_PLANS.free.modelLimit ?? 0) > 0}
        />
        <FeatureItem
          label={`이미지 생성 ${BRAND_PLANS.free.generationLimit ?? "무제한"}장/월`}
          included={(BRAND_PLANS.free.generationLimit ?? 0) > 0}
        />
        <FeatureItem
          label={`브랜드 ${BRAND_PLANS.free.brandLimit ?? "무제한"}개`}
          included={(BRAND_PLANS.free.brandLimit ?? 0) > 0}
        />
        <FeatureItem
          label={`팀원 ${BRAND_PLANS.free.memberLimit ?? "무제한"}명`}
          included={(BRAND_PLANS.free.memberLimit ?? 0) > 0}
        />
        <FeatureItem
          label="채널별 내보내기"
          included={Boolean(BRAND_PLANS.free.channelExport)}
        />
        <FeatureItem
          label="우선 생성 큐"
          included={BRAND_PLANS.free.priorityQueue}
        />
      </ul>

      {/* Sub-feature pills — 카드 하단으로 anchor (mt-auto) */}
      <div className="flex flex-wrap gap-1.5 mt-auto pt-5 min-h-[36px]">
        {["스타일 체험", "이미지 5장"].map((pill) => (
          <span
            key={pill}
            className="rounded-full px-2.5 py-1 text-[11px] self-start"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-secondary)",
            }}
          >
            {pill}
          </span>
        ))}
      </div>

      {/* CTA wrapper — null 일 때도 공간 예약해서 카드 간 정렬 유지 (min-h = py-3 buttons 와 동일) */}
      <div className="mt-5 min-h-[44px]">
        {!isLoggedIn ? (
          <Link
            href="/login?redirect=/pricing"
            className="block w-full rounded-xl py-3 text-sm font-semibold text-center transition-opacity hover:opacity-90"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.65)",
            }}
          >
            로그인 후 시작하기
          </Link>
        ) : !activeBrandId ? (
          <Link
            href="/brands/new"
            className="block w-full rounded-xl py-3 text-sm font-semibold text-center transition-opacity hover:opacity-90"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.65)",
            }}
          >
            시작하기
          </Link>
        ) : isCurrent ? (
          <div
            className="w-full rounded-xl py-3 text-sm font-semibold text-center"
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.25)",
              cursor: "default",
              pointerEvents: "none",
            }}
            aria-disabled="true"
          >
            현재 이용 중
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── 일반 유료 카드 (Atelier / Label) ─────────────────────────────────────────

interface SimplePlanData {
  id: "quick_plus" | "starter" | "label";
  name: string;
  price: number;
  styles: string;
  /** "0명" 또는 "—" 일 때는 included=false 처리 */
  models: string;
  /** false 면 "AI 모델" feature 항목 자체를 included=false 로 표시 */
  modelsIncluded: boolean;
  generations: string;
  brands: string;
  members: string;
  channelExport: string | false;
  priorityQueue: boolean;
  featured: boolean;
  /** true 면 카드 상단에 "MOST POPULAR" 리본 + glow 강조 */
  isPopular?: boolean;
  /** 이미지 환산 박스 메인 텍스트 */
  imageCountLabel: string;
  /** 이미지 환산 박스 보조 텍스트 (옵션) */
  imageCountSub?: string;
  /** Sub-feature pills 텍스트 배열 */
  pills: string[];
}

const SIMPLE_PLANS: SimplePlanData[] = [
  {
    id: "quick_plus",
    name: "Quick Plus",
    price: 9900,
    styles: "1개",
    models: "—", // 사용 안 됨 — modelsIncluded: false에서 분기 처리
    modelsIncluded: false,
    generations: "50장/월",
    brands: "1개",
    members: "1명",
    channelExport: "3채널",
    priorityQueue: false,
    featured: false,
    isPopular: false,
    imageCountLabel: "매월 이미지 50장",
    imageCountSub: "= 광고 시퀀스 ~5개",
    pills: ["3채널 내보내기", "월 50장"],
  },
  {
    id: "starter",
    name: "Atelier",
    price: 29000,
    styles: "5개",
    models: "2명",
    modelsIncluded: true,
    generations: "200장/월",
    brands: "4개",
    members: "3명",
    channelExport: "3채널",
    priorityQueue: false,
    featured: false,
    isPopular: true,
    imageCountLabel: "매월 이미지 200장",
    imageCountSub: "= 광고 시퀀스 ~20개",
    pills: ["우선 큐", "팀 협업", "월 200장"],
  },
  // ─── 시장 진입 단계: 3-tier 단순화 (Free / Quick Plus / Atelier) ───
  // Label / Pro T1-4 / House 는 paying user 검증 후 재도입 (M12+ 검토).
  // DB·enforcement 코드는 그대로 유지 — UI에서만 hidden.
];

function SimplePlanCard({
  plan,
  isLoggedIn,
  activeBrandId,
  currentPlanKey,
  currentPlanTier,
  onUpgrade,
  onDowngrade,
}: {
  plan: SimplePlanData;
  isLoggedIn: boolean;
  activeBrandId: string | null;
  currentPlanKey: PlanKey | null;
  currentPlanTier: number;
  onUpgrade: (
    planKey: "quick_plus" | "starter" | "label" | "pro",
    planTier: number,
  ) => void;
  onDowngrade: (
    planKey: "quick_plus" | "starter" | "label" | "pro",
    planTier: number,
  ) => void;
}) {
  const [hovered, setHovered] = useState<boolean>(false);

  const relation = computePlanRelation(
    plan.id,
    1,
    currentPlanKey,
    currentPlanTier,
  );
  const isCurrent = relation === "current";
  // isPopular 또는 현재 구독 여부로 강조 외형 결정
  const isPopular = plan.isPopular ?? false;
  const highlight = isPopular || plan.featured || isCurrent;

  return (
    <div
      className="relative rounded-2xl p-7 h-full min-h-[580px] flex flex-col"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={
        isCurrent
          ? {
              background: "rgba(255,164,198,0.04)",
              border: "1px solid rgba(255,164,198,0.30)",
              boxShadow: "0 0 0 1px rgba(255,164,198,0.08)",
              transform: hovered ? "translateY(-4px)" : undefined,
              transition: "all 0.2s ease",
            }
          : isPopular
            ? {
                background:
                  "radial-gradient(circle at top, rgba(255,164,198,0.06), transparent 70%), rgba(255,164,198,0.05)",
                border: "2px solid rgba(255,164,198,0.5)",
                boxShadow: hovered
                  ? "0 0 80px rgba(255,164,198,0.15), 0 0 0 1px rgba(255,164,198,0.18), 0 24px 72px rgba(255,164,198,0.18)"
                  : "0 0 60px rgba(255,164,198,0.08), 0 0 0 1px rgba(255,164,198,0.12), 0 20px 60px rgba(255,164,198,0.12)",
                transform: hovered ? "translateY(-4px)" : undefined,
                transition: "all 0.2s ease",
              }
            : highlight
              ? {
                  background: "rgba(255,164,198,0.05)",
                  border: "2px solid rgba(255,164,198,0.45)",
                  boxShadow:
                    "0 0 0 1px rgba(255,164,198,0.12), 0 20px 60px rgba(255,164,198,0.12)",
                  transform: hovered ? "translateY(-4px)" : undefined,
                  transition: "all 0.2s ease",
                }
              : {
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  transform: hovered ? "translateY(-4px)" : undefined,
                  transition: "all 0.2s ease",
                }
      }
    >
      {/* MOST POPULAR 리본 */}
      {isPopular && !isCurrent && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-3 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full"
          style={{
            background:
              "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1L8.5 5H13L9.5 7.5L11 11.5L7 9L3 11.5L4.5 7.5L1 5H5.5L7 1Z"
              stroke="#000"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[11px] font-bold uppercase tracking-wider text-black whitespace-nowrap">
            MOST POPULAR
          </span>
        </div>
      )}

      {/* 플랜명 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p
          className="text-lg uppercase tracking-[0.16em] font-bold"
          style={{
            color:
              isPopular || plan.featured
                ? "rgba(255,164,198,1)"
                : "rgba(255,164,198,0.85)",
          }}
        >
          {plan.name}
        </p>
        {isCurrent && (
          <span
            className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-0.5"
            style={{
              background: "rgba(255,164,198,0.12)",
              color: "rgba(255,164,198,0.7)",
            }}
          >
            현재 이용 중
          </span>
        )}
      </div>

      {/* 이미지 환산 박스 */}
      <div
        className="mt-4 rounded-xl px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path
              d="M7 1L8.5 5H13L9.5 7.5L11 11.5L7 9L3 11.5L4.5 7.5L1 5H5.5L7 1Z"
              stroke="#ffa4c6"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-sm font-medium text-white">
            {plan.imageCountLabel}
          </span>
        </div>
        {plan.imageCountSub && (
          <p
            className="text-[11px] mt-1 ml-5"
            style={{ color: "var(--text-secondary)" }}
          >
            {plan.imageCountSub}
          </p>
        )}
      </div>

      {/* 가격 */}
      <div className="mt-4 flex items-end gap-1">
        <span className="text-5xl font-black leading-none text-white">
          {plan.price.toLocaleString("ko-KR")}
        </span>
        <span
          className="text-sm mb-1 whitespace-nowrap"
          style={{ color: "var(--text-secondary)" }}
        >
          원/월
        </span>
      </div>

      <div
        className="h-px my-8"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />

      <ul className="space-y-4 flex-1">
        <FeatureItem label={`스타일 ${plan.styles}`} included={true} />
        {plan.modelsIncluded ? (
          <FeatureItem label={`모델 ${plan.models}`} included={true} />
        ) : (
          <FeatureItem label="AI 모델 미포함" included={false} />
        )}
        <FeatureItem
          label={`이미지 생성 ${plan.generations}`}
          included={true}
        />
        <FeatureItem label={`브랜드 ${plan.brands}`} included={true} />
        <FeatureItem label={`팀원 ${plan.members}`} included={true} />
        <FeatureItem
          label={
            plan.channelExport !== false
              ? `채널별 내보내기 ${plan.channelExport}`
              : "채널별 내보내기"
          }
          included={plan.channelExport !== false}
        />
        <FeatureItem label="우선 생성 큐" included={plan.priorityQueue} />
      </ul>

      {/* Sub-feature pills — 카드 하단으로 anchor (mt-auto) */}
      <div className="flex flex-wrap gap-1.5 mt-auto pt-5 min-h-[36px]">
        {plan.pills.map((pill) => (
          <span
            key={pill}
            className="rounded-full px-2.5 py-1 text-[11px] self-start"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-secondary)",
            }}
          >
            {pill}
          </span>
        ))}
      </div>

      {/* CTA wrapper — 일관된 공간 예약 (min-h = py-3 buttons 높이) */}
      <div className="mt-5 min-h-[44px]">
        {!isLoggedIn ? (
          <Link
            href="/login?redirect=/pricing"
            className="block w-full rounded-xl py-3 text-sm font-semibold text-center transition-opacity hover:opacity-90"
            style={
              isPopular || plan.featured
                ? {
                    background: "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
                    color: "#000",
                  }
                : {
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.65)",
                  }
            }
          >
            로그인 후 시작하기
          </Link>
        ) : !activeBrandId ? (
          <Link
            href={`/brands/new?next=/pricing&plan=${plan.id}`}
            className="block w-full rounded-xl py-3 text-sm font-semibold text-center transition-opacity hover:opacity-90"
            style={
              isPopular || plan.featured
                ? {
                    background: "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))",
                    color: "#000",
                  }
                : {
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.65)",
                  }
            }
          >
            시작하기
          </Link>
        ) : relation === "current" ? (
          <div
            className="w-full rounded-xl py-3 text-sm font-semibold text-center"
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.25)",
              cursor: "default",
              pointerEvents: "none",
            }}
            aria-disabled="true"
          >
            현재 이용 중
          </div>
        ) : relation === "upgrade" ? (
          <PortonePayButton
            planKey={plan.id}
            brandId={activeBrandId}
            mode="upgrade"
            label="업그레이드"
            onUpgrade={() => onUpgrade(plan.id, 1)}
            className={
              isPopular || plan.featured
                ? "w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 text-black"
                : "w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 text-white/65 bg-white/[0.08]"
            }
            buttonStyle={
              isPopular || plan.featured
                ? { background: "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))" }
                : undefined
            }
          />
        ) : relation === "downgrade" ? (
          <PortonePayButton
            planKey={plan.id}
            brandId={activeBrandId}
            mode="downgrade"
            label="다운그레이드"
            onDowngrade={() => onDowngrade(plan.id, 1)}
            className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            // 중립 톤 — inline style 로 우선순위 보장
            buttonStyle={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.55)",
            }}
          />
        ) : (
          <PortonePayButton
            planKey={plan.id}
            brandId={activeBrandId}
            label="시작하기"
            className={
              isPopular || plan.featured
                ? "w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 text-black"
                : "w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 text-white/65 bg-white/[0.08]"
            }
            buttonStyle={
              isPopular || plan.featured
                ? { background: "var(--brand-gradient, linear-gradient(135deg,#ffa4c6,#ffe3be))" }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

// ─── Pro 카드 (티어 슬라이더) ──────────────────────────────────────────────────

const PRO_TIERS: ProTier[] = [1, 2, 3, 4];

// M12+ 재도입 예정. 현재는 3-tier 단순화로 UI에서 hidden — 의도적 unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ProCard({
  isLoggedIn,
  activeBrandId,
  currentPlanKey,
  currentPlanTier,
  onUpgrade,
  onDowngrade,
}: {
  isLoggedIn: boolean;
  activeBrandId: string | null;
  currentPlanKey: PlanKey | null;
  currentPlanTier: number;
  onUpgrade: (
    planKey: "quick_plus" | "starter" | "label" | "pro",
    planTier: number,
  ) => void;
  onDowngrade: (
    planKey: "quick_plus" | "starter" | "label" | "pro",
    planTier: number,
  ) => void;
}) {
  const [selectedTier, setSelectedTier] = useState<ProTier>(
    currentPlanKey === "pro" ? ((currentPlanTier as ProTier) ?? 1) : 1,
  );

  const price = getProPriceKrw(selectedTier);
  const generationLimit = getProGenerationLimit(selectedTier);

  const isCurrentPlan = currentPlanKey === "pro";
  const isSameTier = isCurrentPlan && currentPlanTier === selectedTier;

  // 가격 기반 relation — Pro 내부 티어 비교에도 정확히 동작.
  const relation = computePlanRelation(
    "pro",
    selectedTier,
    currentPlanKey,
    currentPlanTier,
  );

  return (
    <div
      className="relative rounded-2xl p-7 h-full min-h-[580px] flex flex-col"
      style={
        isSameTier
          ? {
              // SimplePlanCard 와 동일한 isCurrent 강조 외형
              background: "rgba(255,164,198,0.04)",
              border: "1px solid rgba(255,164,198,0.30)",
              boxShadow: "0 0 0 1px rgba(255,164,198,0.08)",
            }
          : {
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }
      }
    >
      <div className="flex items-center gap-2 flex-wrap">
        <p
          className="text-lg uppercase tracking-[0.16em] font-bold"
          style={{ color: "rgba(255,164,198,0.85)" }}
        >
          Pro
        </p>
        {isSameTier && (
          <span
            className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-0.5"
            style={{
              background: "rgba(255,164,198,0.12)",
              color: "rgba(255,164,198,0.7)",
            }}
          >
            현재 이용 중
          </span>
        )}
      </div>

      {/* 가격 */}
      <div className="mt-3 flex items-end gap-1">
        <span className="text-[44px] font-black leading-none text-white">
          {price.toLocaleString("ko-KR")}
        </span>
        <span
          className="text-sm mb-1 whitespace-nowrap"
          style={{ color: "rgba(255,255,255,0.75)" }}
        >
          원/월
        </span>
      </div>

      <div
        className="h-px my-8"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />

      <ul className="space-y-4 flex-1">
        <FeatureItem label="스타일 50개" included={true} />
        <FeatureItem label="모델 10명" included={true} />
        <FeatureItem
          label={`이미지 생성 ${generationLimit.toLocaleString("ko-KR")}장/월`}
          included={true}
        />
        <FeatureItem label="브랜드 2개" included={true} />
        <FeatureItem label="팀원 5명" included={true} />
        <FeatureItem label="채널별 내보내기" included={true} />
        <FeatureItem label="우선 생성 큐" included={true} />
      </ul>

      {/* 티어 선택 */}
      <div className="mt-6 flex items-center justify-between gap-1">
        {PRO_TIERS.map((tier) => {
          const isActive = selectedTier === tier;
          const isCurTier = isCurrentPlan && currentPlanTier === tier;
          return (
            <button
              key={tier}
              onClick={() => setSelectedTier(tier)}
              className="relative flex-1 py-1.5 text-center text-xs font-semibold transition-colors"
              style={{
                color: isActive ? "#ffa4c6" : "rgba(255,255,255,0.3)",
                borderBottom: isActive
                  ? "2px solid #ffa4c6"
                  : "2px solid rgba(255,255,255,0.06)",
              }}
            >
              T{tier}
              {isCurTier && (
                <span
                  className="absolute top-0 right-1.5 w-1.5 h-1.5 rounded-full"
                  style={{ background: "#ffa4c6" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {!isLoggedIn ? (
          <Link
            href="/login?redirect=/pricing"
            className="block w-full rounded-xl py-3 text-sm font-semibold text-center transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg,#ffa4c6,#ffe3be)",
              color: "#000",
            }}
          >
            로그인 후 시작하기
          </Link>
        ) : !activeBrandId ? (
          <Link
            href={`/brands/new?next=/pricing&plan=pro`}
            className="block w-full rounded-xl py-3 text-sm font-semibold text-center transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg,#ffa4c6,#ffe3be)",
              color: "#000",
            }}
          >
            시작하기
          </Link>
        ) : relation === "current" ? (
          <div
            className="w-full rounded-xl py-3 text-sm font-semibold text-center"
            style={{
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.25)",
              cursor: "default",
              pointerEvents: "none",
            }}
            aria-disabled="true"
          >
            현재 이용 중
          </div>
        ) : relation === "upgrade" ? (
          <PortonePayButton
            planKey="pro"
            brandId={activeBrandId}
            planTier={selectedTier}
            mode="upgrade"
            label="업그레이드"
            onUpgrade={() => onUpgrade("pro", selectedTier)}
            className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 text-black [background:linear-gradient(135deg,#ffa4c6,#ffe3be)]"
          />
        ) : relation === "downgrade" ? (
          <PortonePayButton
            planKey="pro"
            brandId={activeBrandId}
            planTier={selectedTier}
            mode="downgrade"
            label="다운그레이드"
            onDowngrade={() => onDowngrade("pro", selectedTier)}
            className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            buttonStyle={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.55)",
            }}
          />
        ) : (
          <PortonePayButton
            planKey="pro"
            brandId={activeBrandId}
            planTier={selectedTier}
            label="시작하기"
            className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-90 text-black [background:linear-gradient(135deg,#ffa4c6,#ffe3be)]"
          />
        )}
      </div>
    </div>
  );
}

// ─── House 카드 ───────────────────────────────────────────────────────────────

// M12+ 재도입 예정. 현재는 3-tier 단순화로 UI에서 hidden — 의도적 unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function HouseCard({ currentPlanKey }: { currentPlanKey: PlanKey | null }) {
  const isCurrent = currentPlanKey === "studio";

  return (
    <div
      className="relative rounded-2xl p-7 h-full min-h-[580px] flex flex-col"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <p
          className="text-lg uppercase tracking-[0.16em] font-bold"
          style={{ color: "rgba(255,164,198,0.85)" }}
        >
          House
        </p>
        {isCurrent && (
          <span
            className="text-[10px] font-semibold tracking-wide rounded-full px-2 py-0.5"
            style={{
              background: "rgba(255,164,198,0.12)",
              color: "rgba(255,164,198,0.7)",
            }}
          >
            현재 이용 중
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end gap-1" style={{ minHeight: "44px" }}>
        <span className="text-[44px] font-black leading-none text-white">
          문의
        </span>
      </div>

      <div
        className="h-px my-8"
        style={{ background: "rgba(255,255,255,0.06)" }}
      />

      <ul className="space-y-4 flex-1">
        <FeatureItem label="스타일 무제한" included={true} />
        <FeatureItem label="모델 무제한" included={true} />
        <FeatureItem label="이미지 생성 무제한" included={true} />
        <FeatureItem label="브랜드 무제한" included={true} />
        <FeatureItem label="팀원 15명+" included={true} />
        <FeatureItem label="채널별 내보내기" included={true} />
        <FeatureItem label="우선 생성 큐" included={true} />
        <FeatureItem label="전담 온보딩 지원" included={true} />
      </ul>

      <div className="mt-9">
        <div
          className="w-full rounded-xl py-3 text-sm font-semibold text-center"
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          별도 문의
        </div>
      </div>
    </div>
  );
}

// ─── PayPal 해외 결제 섹션 (접기) ─────────────────────────────────────────────

function PaypalSection({
  isLoggedIn,
  onCheckout: _onCheckout,
}: {
  isLoggedIn: boolean;
  onCheckout: (planId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-5 transition-colors hover:bg-white/[0.02]"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "#ffffff",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <svg
              width="20"
              height="24"
              viewBox="0 0 256 302"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M217.168476,23.5070146 C203.234077,7.62479651 178.045612,0.815753338 145.823355,0.815753338 L52.3030619,0.815753338 C45.7104431,0.815753338 40.1083819,5.6103852 39.0762042,12.1114399 L0.136468302,259.076601 C-0.637664968,263.946149 3.13311322,268.357876 8.06925331,268.357876 L65.804612,268.357876 L80.3050438,176.385849 L79.8555471,179.265958 C80.8877248,172.764903 86.4481659,167.970272 93.0324607,167.970272 L120.46841,167.970272 C174.366398,167.970272 216.569147,146.078116 228.897012,82.7490197 C229.263268,80.8761167 229.579581,79.0531577 229.854273,77.2718188 C228.297683,76.4477414 228.297683,76.4477414 229.854273,77.2718188 C233.525163,53.8646924 229.829301,37.9325302 217.168476,23.5070146"
                fill="#27346A"
              />
              <path
                d="M102.396976,68.8395929 C103.936919,68.1070797 105.651665,67.699203 107.449652,67.699203 L180.767565,67.699203 C189.449511,67.699203 197.548776,68.265236 204.948824,69.4555699 C207.071448,69.7968545 209.127479,70.1880831 211.125242,70.6375799 C213.123006,71.0787526 215.062501,71.5781934 216.943728,72.1275783 C217.884341,72.4022708 218.808307,72.6852872 219.715624,72.9849517 C223.353218,74.2002577 226.741092,75.61534 229.854273,77.2718188 C233.525163,53.8563683 229.829301,37.9325302 217.168476,23.5070146 C203.225753,7.62479651 178.045612,0.815753338 145.823355,0.815753338 L52.2947379,0.815753338 C45.7104431,0.815753338 40.1083819,5.6103852 39.0762042,12.1114399 L0.136468302,259.068277 C-0.637664968,263.946149 3.13311322,268.349552 8.0609293,268.349552 L65.804612,268.349552 L95.8875974,77.5798073 C96.5035744,73.6675208 99.0174265,70.4627756 102.396976,68.8395929 Z"
                fill="#27346A"
              />
              <path
                d="M228.897012,82.7490197 C216.569147,146.069792 174.366398,167.970272 120.46841,167.970272 L93.0241367,167.970272 C86.4398419,167.970272 80.8794007,172.764903 79.8555471,179.265958 L61.8174095,293.621258 C61.1431644,297.883153 64.4394738,301.745495 68.7513129,301.745495 L117.421821,301.745495 C123.182038,301.745495 128.084882,297.550192 128.983876,291.864891 L129.458344,289.384335 L138.631407,231.249423 L139.222412,228.036354 C140.121406,222.351053 145.02425,218.15575 150.784467,218.15575 L158.067979,218.15575 C205.215193,218.15575 242.132193,199.002194 252.920115,143.605884 C257.423406,120.456802 255.092683,101.128442 243.181019,87.5519756 C239.568397,83.4399129 235.081754,80.0437153 229.854273,77.2718188 C229.571257,79.0614817 229.263268,80.8761167 228.897012,82.7490197 Z"
                fill="#2790C3"
              />
              <path
                d="M216.952052,72.1275783 C215.070825,71.5781934 213.13133,71.0787526 211.133566,70.6375799 C209.135803,70.1964071 207.071448,69.8051785 204.957148,69.4638939 C197.548776,68.265236 189.457835,67.699203 180.767565,67.699203 L107.457976,67.699203 C105.651665,67.699203 103.936919,68.1070797 102.4053,68.8479169 C99.0174265,70.4710996 96.5118984,73.6675208 95.8959214,77.5881313 L80.3133678,176.385849 L79.8638711,179.265958 C80.8877248,172.764903 86.4481659,167.970272 93.0324607,167.970272 L120.476734,167.970272 C174.374722,167.970272 216.577471,146.078116 228.905336,82.7490197 C229.271592,80.8761167 229.579581,79.0614817 229.862597,77.2718188 C226.741092,75.623664 223.361542,74.2002577 219.723948,72.9932757 C218.816631,72.6936112 217.892665,72.4022708 216.952052,72.1275783"
                fill="#1F264F"
              />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">
              해외 결제 (PayPal)
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#6b6b7b" }}>
              USD 크레딧 구독 · 글로벌 카드 결제 지원
            </p>
          </div>
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          className="shrink-0 transition-transform duration-200"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            color: "#6b6b7b",
          }}
        >
          <path
            d="M4.5 7L9 11.5L13.5 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="px-6 pb-7 pt-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <p className="text-xs mb-5" style={{ color: "#6b6b7b" }}>
            한국 외 지역에서 결제하거나 PayPal 계정으로 구독하려면 아래 플랜을
            선택하세요.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {PAYPAL_PLANS.map((plan) => (
              <div
                key={plan.id}
                className="rounded-xl p-4 flex flex-col"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-[0.14em] font-bold"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  {plan.name}
                </p>
                <div className="mt-2 flex items-end gap-0.5">
                  {plan.priceUsd > 0 ? (
                    <>
                      <span className="text-2xl font-black leading-none text-white">
                        ${plan.priceUsd}
                      </span>
                      <span
                        className="text-xs mb-0.5"
                        style={{ color: "#6b6b7b" }}
                      >
                        /mo
                      </span>
                    </>
                  ) : (
                    <span className="text-xl font-black leading-none text-white opacity-40">
                      문의
                    </span>
                  )}
                </div>
                <p
                  className="text-[11px] mt-1 leading-relaxed"
                  style={{ color: "#4b4b5b" }}
                >
                  {plan.desc}
                </p>
                <div className="mt-4">
                  {isLoggedIn ? (
                    <button
                      disabled
                      className="w-full rounded-lg py-1.5 text-xs font-semibold"
                      style={{
                        background: "rgba(0,112,243,0.08)",
                        color: "rgba(0,112,243,0.4)",
                        cursor: "not-allowed",
                      }}
                    >
                      구독하기
                    </button>
                  ) : (
                    <Link
                      href="/login?redirect=/pricing"
                      className="block w-full rounded-lg py-1.5 text-xs font-semibold text-center transition-opacity hover:opacity-90"
                      style={{
                        background: "rgba(0,112,243,0.10)",
                        color: "rgba(0,112,243,0.6)",
                      }}
                    >
                      로그인
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[11px]" style={{ color: "#3b3b4b" }}>
            결제 연동 준비 중 · PayPal을 통해 USD로 결제됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 요금제 페이지 다크 헤더 (로그인 상태 분기) ───────────────────────────────

function GuestPricingHeader() {
  const [isCtaHover, setIsCtaHover] = useState(false);
  const { user } = useAuth();
  return (
    <header
      className="fixed top-0 left-0 right-0 h-[60px] z-40 flex items-center justify-between px-7"
      style={{
        background: "rgba(9,9,11,0.85)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)",
      }}
    >
      <Link
        href="/"
        className="flex items-center"
        aria-label="홈으로"
      >
        <Logo width={112} height={28} />
      </Link>

      <nav className="flex items-center gap-2">
        {user ? (
          <Link
            href="/brands"
            className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.55)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.85)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "rgba(255,255,255,0.55)")
            }
          >
            ← 대시보드
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
              style={{ color: "rgba(255,255,255,0.55)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "rgba(255,255,255,0.85)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "rgba(255,255,255,0.55)")
              }
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="rounded-full font-semibold transition-all hover:-translate-y-px"
              style={{
                background: "var(--brand-gradient)",
                color: "#1A1A22",
                fontSize: 14,
                fontWeight: 700,
                padding: "10px 18px",
                boxShadow: isCtaHover
                  ? "inset 0 1px 0 rgba(255,255,255,0.6), 0 6px 14px -4px rgba(255,164,198,0.45)"
                  : "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 2px rgba(255,164,198,0.25)",
              }}
              onMouseEnter={() => setIsCtaHover(true)}
              onMouseLeave={() => setIsCtaHover(false)}
            >
              무료로 시작
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { user, loading, session } = useAuth();
  const isLoggedIn = !loading && !!user;
  const searchParams = useSearchParams();
  const orgIdParam = searchParams.get("org_id");
  const brandIdParam = searchParams.get("brand_id");
  const validatedOrgId =
    orgIdParam && UUID_RE.test(orgIdParam) ? orgIdParam : null;
  const validatedBrandId =
    brandIdParam && UUID_RE.test(brandIdParam) ? brandIdParam : null;

  // org 목록
  const [orgs, setOrgs] = useState<
    { id: string; name: string; brandCount?: number }[]
  >([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [currentPlanKey, setCurrentPlanKey] = useState<PlanKey | null>(null);
  const [currentPlanTier, setCurrentPlanTier] = useState<number>(1);
  // 결제수단(빌링키) 활성 여부 — null=모름(기본 일반 모드), false=결제수단 등록 필요(admin 부여 등)
  const [hasActiveBillingKey, setHasActiveBillingKey] = useState<
    boolean | null
  >(null);

  // org 목록 fetch + 초기 선택
  useEffect(() => {
    if (!user || !session?.access_token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/organizations", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as
          | {
              organizations?: {
                id: string;
                name: string;
                usage?: { brandCount?: number };
              }[];
            }
          | { id: string; name: string; usage?: { brandCount?: number } }[];
        const rawList = Array.isArray(data) ? data : (data.organizations ?? []);
        const list = rawList.map((o) => ({
          id: o.id,
          name: o.name,
          brandCount: o.usage?.brandCount,
        }));
        if (cancelled) return;
        setOrgs(list);

        // 선택 우선순위: ?org_id > ?brand_id → org 변환 > 첫 번째 org
        if (validatedOrgId && list.find((o) => o.id === validatedOrgId)) {
          setSelectedOrgId(validatedOrgId);
        } else if (validatedBrandId) {
          // brand_id → org 자동 변환
          try {
            const bRes = await fetch(`/api/brands/${validatedBrandId}`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (bRes.ok && !cancelled) {
              const bData = (await bRes.json()) as {
                brand?: { organizationId?: string | null };
                organizationId?: string | null;
              };
              const orgId =
                bData.brand?.organizationId ?? bData.organizationId ?? null;
              if (orgId && list.find((o) => o.id === orgId)) {
                setSelectedOrgId(orgId);
                return;
              }
            }
          } catch {
            /* ignore */
          }
          setSelectedOrgId(list[0]?.id ?? null);
        } else {
          setSelectedOrgId(list[0]?.id ?? null);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session?.access_token]);

  // 선택된 org의 첫 번째 brand → activeBrandId
  useEffect(() => {
    if (!user) return;

    if (validatedBrandId && !validatedOrgId) {
      // 기존 ?brand_id 호환: 직접 brand 검증
      supabase
        .from("brands")
        .select("id")
        .eq("id", validatedBrandId)
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }: { data: { id: string } | null }) => {
          if (data) {
            setActiveBrandId(data.id);
          } else {
            supabase
              .from("brands")
              .select("id")
              .eq("user_id", user.id)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle()
              .then(({ data: fallback }: { data: { id: string } | null }) => {
                if (fallback) setActiveBrandId(fallback.id);
              });
          }
        });
    } else {
      supabase
        .from("brands")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
        .then(({ data }: { data: { id: string } | null }) => {
          if (data) setActiveBrandId(data.id);
        });
    }
  }, [user, validatedBrandId, validatedOrgId]);

  useEffect(() => {
    if (!activeBrandId) {
      setCurrentPlanKey(null);
      setCurrentPlanTier(1);
      setHasActiveBillingKey(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          if (!cancelled) {
            setCurrentPlanKey(null);
            setCurrentPlanTier(1);
            setHasActiveBillingKey(null);
          }
          return;
        }
        // org 기준 플랜 조회 (selectedOrgId 우선)
        const queryId = selectedOrgId ?? activeBrandId;
        const endpoint = selectedOrgId
          ? `/api/organizations/${queryId}`
          : `/api/brands/${queryId}/subscription`;
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) {
            setCurrentPlanKey(null);
            setCurrentPlanTier(1);
            setHasActiveBillingKey(null);
          }
          return;
        }
        const raw = (await res.json()) as Record<string, unknown>;
        // org 응답: { plan: { planKey, planTier, status, currentPeriodEnd } }
        // brand 응답: { planKey, planTier, status, currentPeriodEnd }
        const planKey = selectedOrgId
          ? (((raw.plan as Record<string, unknown> | undefined)?.planKey as
              | string
              | null
              | undefined) ?? null)
          : ((raw.planKey as string | null | undefined) ?? null);
        const planTier = selectedOrgId
          ? (((raw.plan as Record<string, unknown> | undefined)?.planTier as
              | number
              | null
              | undefined) ?? 1)
          : ((raw.planTier as number | null | undefined) ?? 1);
        const status = selectedOrgId
          ? (((raw.plan as Record<string, unknown> | undefined)?.status as
              | string
              | null
              | undefined) ?? null)
          : ((raw.status as string | null | undefined) ?? null);
        const currentPeriodEnd = selectedOrgId
          ? (((raw.plan as Record<string, unknown> | undefined)
              ?.currentPeriodEnd as string | null | undefined) ?? null)
          : ((raw.currentPeriodEnd as string | null | undefined) ?? null);

        if (cancelled) return;
        if (
          planKey &&
          planKey !== "free" &&
          (status === "active" || status === "trialing") &&
          currentPeriodEnd &&
          new Date(currentPeriodEnd) > new Date()
        ) {
          setCurrentPlanKey(planKey as PlanKey);
          setCurrentPlanTier(planTier ?? 1);
        } else {
          setCurrentPlanKey(null);
          setCurrentPlanTier(1);
        }

        // 결제수단 상태 — org 응답에서만 가져온다 (owner/admin 한정 노출).
        // subscription === null 이면 viewer 권한이거나 brand 경로라 알 수 없음 → null.
        // billingKey === null 이면 admin 부여 등으로 결제수단 미등록 → false.
        if (selectedOrgId) {
          const subscription =
            (raw.subscription as Record<string, unknown> | null | undefined) ??
            null;
          if (!subscription) {
            setHasActiveBillingKey(null);
          } else {
            const billingKeyMeta =
              (subscription.billingKey as
                | { status?: string | null }
                | null
                | undefined) ?? null;
            setHasActiveBillingKey(billingKeyMeta?.status === "active");
          }
        } else {
          setHasActiveBillingKey(null);
        }
      } catch {
        if (!cancelled) {
          setCurrentPlanKey(null);
          setCurrentPlanTier(1);
          setHasActiveBillingKey(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBrandId, selectedOrgId]);

  const selectedOrgName =
    orgs.find((o) => o.id === selectedOrgId)?.name ?? null;
  const isMultiOrg = orgs.length > 1;
  const router = useRouter();
  const fromSettings = searchParams.get("from") === "settings";

  // UI #6: from=settings 진입 시 카드 그리드(=현재 플랜 카드 위치)로 자동 스크롤
  // currentPlanKey 가 결정된 직후 1회만 동작.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!fromSettings || scrolledRef.current) return;
    if (!gridRef.current) return;
    // currentPlanKey 가 fetch 되기 전(loading) 에는 카드 강조가 없으니 결정 후로 미룬다.
    if (currentPlanKey === null) return;
    scrolledRef.current = true;
    gridRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [fromSettings, currentPlanKey]);

  // ── 업그레이드/다운그레이드 다이얼로그 상태 ─────────────────────────────
  type PendingChange = {
    planKey: "quick_plus" | "starter" | "label" | "pro";
    planTier: number;
  };
  const [pendingUpgrade, setPendingUpgrade] = useState<PendingChange | null>(
    null,
  );
  const [pendingDowngrade, setPendingDowngrade] =
    useState<PendingChange | null>(null);

  // 다이얼로그에 필요한 효력 시점·다음 결제일·서버 산정 견적 — 다이얼로그 오픈 시점에 fetch.
  // dryRun=true 호출은 결제·DB 변경 없이 서버 권한 가격 계산만 반환하므로
  // 클라이언트가 직접 재계산하는 것보다 정합성이 보장된다 (M3 해결).
  const [periodEndForDialog, setPeriodEndForDialog] = useState<string | null>(
    null,
  );
  const [dryRunQuote, setDryRunQuote] = useState<{
    prorationAmount: number;
    nextBillingAmount: number;
    effectiveAt: string | null;
  } | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunError, setDryRunError] = useState<string | null>(null);

  useEffect(() => {
    const target = pendingUpgrade ?? pendingDowngrade;
    if (!target) {
      setDryRunQuote(null);
      setDryRunError(null);
      return;
    }
    // 결제수단 미등록 상태(admin 부여 등)에서 업그레이드 다이얼로그를 띄울 때는
    // 서버 dryRun 이 결제수단 검증에서 400 을 내려 무의미한 에러로 막힌다.
    // 다이얼로그가 결제수단 등록 모드로 표시되므로 dryRun 자체를 skip 한다.
    if (pendingUpgrade && hasActiveBillingKey === false) {
      setDryRunQuote(null);
      setDryRunError(null);
      setDryRunLoading(false);
      return;
    }
    let cancelled = false;
    setDryRunLoading(true);
    setDryRunError(null);
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token || !selectedOrgId) return;

        // organization 정보 (current_period_end) 와 dryRun 견적을 병렬 fetch
        const [orgRes, dryRes] = await Promise.all([
          fetch(`/api/organizations/${selectedOrgId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/portone/subscription/change-plan`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              organizationId: selectedOrgId,
              targetPlan: target.planKey,
              targetPlanTier: target.planTier,
              dryRun: true,
            }),
          }),
        ]);

        if (cancelled) return;

        if (orgRes.ok) {
          const data = (await orgRes.json()) as {
            plan?: { currentPeriodEnd?: string | null };
          };
          setPeriodEndForDialog(data.plan?.currentPeriodEnd ?? null);
        }

        if (dryRes.ok) {
          const data = (await dryRes.json()) as {
            prorationAmount?: number;
            nextBillingAmount?: number;
            effectiveAt?: string | null;
          };
          setDryRunQuote({
            prorationAmount: data.prorationAmount ?? 0,
            nextBillingAmount: data.nextBillingAmount ?? 0,
            effectiveAt: data.effectiveAt ?? null,
          });
        } else {
          const data = (await dryRes.json().catch(() => ({}))) as {
            error?: string;
          };
          setDryRunError(data.error ?? "견적 계산에 실패했습니다.");
        }
      } catch {
        if (!cancelled) setDryRunError("견적 조회에 실패했습니다.");
      } finally {
        if (!cancelled) setDryRunLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingUpgrade, pendingDowngrade, selectedOrgId, hasActiveBillingKey]);

  // 변경 API 호출 — 성공 시 페이지 refresh
  async function callChangePlan(target: PendingChange): Promise<void> {
    if (!selectedOrgId) {
      throw new Error("Organization 정보를 찾을 수 없습니다.");
    }
    // 결제수단 미등록 → 결제수단 등록 플로우(/checkout/galaxia)로 라우팅.
    // billing-key/issue 라우트가 빌링키 발급 + 첫 결제 + 새 plan 활성화까지 처리한다.
    // 다운그레이드는 결제수단이 필수이므로 이 분기는 업그레이드(pendingUpgrade)에 한함.
    if (pendingUpgrade && hasActiveBillingKey === false) {
      if (!activeBrandId) {
        throw new Error("브랜드 정보를 찾을 수 없습니다.");
      }
      const params = new URLSearchParams({
        plan: target.planKey,
        brand_id: activeBrandId,
        tier: String(target.planTier),
      });
      setPendingUpgrade(null);
      router.push(`/checkout/galaxia?${params.toString()}`);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("로그인이 필요합니다.");
    const res = await fetch("/api/portone/subscription/change-plan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organizationId: selectedOrgId,
        targetPlan: target.planKey,
        targetPlanTier: target.planTier,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "플랜 변경에 실패했습니다.");
    }
    // 다이얼로그 자체가 닫히고, 카드 강조 갱신을 위해 refresh
    setPendingUpgrade(null);
    setPendingDowngrade(null);
    router.refresh();
    // currentPlan 재조회 강제 — selectedOrgId 의존 effect 가 다시 트리거되도록 한 번 set
    setSelectedOrgId((id) => id);
  }

  // 다이얼로그용 가격 — 서버 dryRun 응답을 신뢰. fallback 으로만 클라이언트 재계산.
  // (서버 응답이 도착하기 전 다이얼로그가 깜빡 빈 상태로 보이지 않도록 fallback 유지)
  const fallbackUpgradeNewPrice = pendingUpgrade
    ? getPlanPrice(pendingUpgrade.planKey, pendingUpgrade.planTier)
    : 0;
  const fallbackUpgradeCurrentPrice = currentPlanKey
    ? getPlanPrice(currentPlanKey, currentPlanTier)
    : 0;
  const fallbackUpgradeRemainingDays = periodEndForDialog
    ? Math.max(
        1,
        Math.ceil(
          (new Date(periodEndForDialog).getTime() - Date.now()) / 86_400_000,
        ),
      )
    : 30;
  const fallbackUpgradeProration = pendingUpgrade
    ? Math.max(
        0,
        Math.ceil(
          ((fallbackUpgradeNewPrice - fallbackUpgradeCurrentPrice) *
            fallbackUpgradeRemainingDays) /
            30,
        ),
      )
    : 0;

  const upgradeProration =
    dryRunQuote?.prorationAmount ?? fallbackUpgradeProration;
  const upgradeNewPrice =
    dryRunQuote?.nextBillingAmount ?? fallbackUpgradeNewPrice;

  const fallbackDowngradeNewPrice = pendingDowngrade
    ? getPlanPrice(pendingDowngrade.planKey, pendingDowngrade.planTier)
    : 0;
  const downgradeNewPrice =
    dryRunQuote?.nextBillingAmount ?? fallbackDowngradeNewPrice;

  const handlePaypalCheckout = (_planId: string) => {
    // TODO: PayPal 연동 시 실제 결제 API 호출로 교체
  };

  // ── 종량제 팩 모달 ──────────────────────────────────────────────────────────
  const [packModalSize, setPackModalSize] = useState<PackSize | null>(null);

  function openPackModal(size: PackSize) {
    if (!isLoggedIn) {
      router.push("/login?redirect=/pricing");
      return;
    }
    setPackModalSize(size);
  }

  return (
    <div
      className="landing-dark dark"
      style={{ background: "#09090b", minHeight: "100vh" }}
    >
      <GuestPricingHeader />

      <main className="pb-0">
        {/* ── [1] 헤딩 ──────────────────────────────────────────────────────── */}
        <section className="relative flex flex-col items-center justify-center px-6 pt-28 pb-20 text-center">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 60% 80% at 50% 40%, rgba(255,164,198,0.09) 0%, transparent 70%)",
            }}
          />
          <FadeInOnScroll className="w-full">
            <p
              className="text-[11px] uppercase tracking-[0.18em] font-bold mb-5 text-center"
              style={{ color: "rgba(255,164,198,0.55)" }}
            >
              Pricing
            </p>
            <h1
              className="font-headline text-3xl sm:text-4xl lg:text-[48px] font-bold leading-tight tracking-tight text-white"
              style={{ wordBreak: "keep-all" }}
            >
              브랜드 콘텐츠를 더 <br className="hidden sm:block" />
              <span className="brand-gradient-text">
                스마트하게 운영하는 방법
              </span>
            </h1>
            <p
              className="mt-5 text-sm sm:text-base max-w-[480px] mx-auto"
              style={{ color: "#8b8b99" }}
            >
              팀 규모와 운영 방식에 맞는 플랜을 선택하세요.
              <br />
              언제든 업그레이드하거나 취소할 수 있습니다.
            </p>
          </FadeInOnScroll>
        </section>

        {/* ── [2] 플랜 카드 그리드 ──────────────────────────────────────────── */}
        <section className="px-6 pb-24">
          <div className="max-w-[1480px] mx-auto">
            <FadeInOnScroll delay={0.1}>
              {/* Org 선택 + 안내 배너 — 다중 org 사용자에게만 노출 */}
              {isLoggedIn && isMultiOrg && (
                <>
                  <div className="flex items-center gap-3 mb-8">
                    <label className="text-sm text-zinc-400 shrink-0">
                      적용 대상
                    </label>
                    <OrgDropdown
                      orgs={orgs}
                      selectedOrgId={selectedOrgId}
                      onChange={setSelectedOrgId}
                    />
                  </div>
                  <div
                    className="px-4 py-3 rounded-xl mb-8"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      선택한 플랜은{" "}
                      <span className="text-white font-medium">
                        {selectedOrgName ?? "내 Organization"}
                      </span>{" "}
                      Organization에 적용됩니다. 이 Organization의 모든 브랜드가
                      동일한 한도를 공유합니다.
                    </p>
                  </div>
                </>
              )}

              {/* 3열 그리드 (시장 진입): Free / Quick Plus / Atelier */}
              {/* Label / Pro / House 는 M12+ 재도입 검토 — 코드는 유지, UI hidden */}
              <div
                ref={gridRef}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 scroll-mt-20 max-w-5xl mx-auto"
              >
                <FreeCard
                  isLoggedIn={isLoggedIn}
                  activeBrandId={activeBrandId}
                  currentPlanKey={currentPlanKey}
                />
                {SIMPLE_PLANS.map((plan) => (
                  <SimplePlanCard
                    key={plan.id}
                    plan={plan}
                    isLoggedIn={isLoggedIn}
                    activeBrandId={activeBrandId}
                    currentPlanKey={currentPlanKey}
                    currentPlanTier={currentPlanTier}
                    onUpgrade={(k, t) =>
                      setPendingUpgrade({ planKey: k, planTier: t })
                    }
                    onDowngrade={(k, t) =>
                      setPendingDowngrade({ planKey: k, planTier: t })
                    }
                  />
                ))}
              </div>
            </FadeInOnScroll>
          </div>
        </section>

        {/* ── PayPal 해외 결제 섹션 — 시장 진입 단계에서는 비노출 (글로벌 진출 시 재도입) */}

        {/* ── [3] 종량제 팩 섹션 ──────────────────────────────────────────── */}
        <section
          className="px-6 pb-24 pt-16"
          style={{
            background: "rgba(255,164,198,0.04)",
            borderTop: "1px solid rgba(255,164,198,0.12)",
            borderBottom: "1px solid rgba(255,164,198,0.12)",
          }}
        >
          <div className="max-w-[1480px] mx-auto">
            <FadeInOnScroll delay={0.1}>
              <div className="max-w-5xl mx-auto">
                {/* 섹션 헤딩 */}
                <div className="text-center mb-10">
                  <p
                    className="text-[11px] uppercase tracking-[0.18em] font-bold mb-4"
                    style={{ color: "rgba(255,164,198,0.70)" }}
                  >
                    Add-on
                  </p>
                  <h2
                    className="font-headline text-2xl sm:text-3xl font-bold text-white"
                    style={{ wordBreak: "keep-all" }}
                  >
                    이미지만 충전
                  </h2>
                  <p
                    className="mt-3 text-sm max-w-[440px] mx-auto"
                    style={{ color: "#8b8b99", wordBreak: "keep-all" }}
                  >
                    구독이 없어도, 구독 중에도 — 필요한 만큼 바로 충전합니다.
                  </p>
                </div>

                {/* 팩 카드 그리드 — 2개 옵션이라 max-w-2xl 중앙 정렬로 폭 제한 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  {PACK_OPTIONS.map((opt) => (
                    <PricingPackCard
                      key={opt.size}
                      option={opt}
                      onBuy={() => openPackModal(opt.size)}
                    />
                  ))}
                </div>
              </div>
            </FadeInOnScroll>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────────── */}
        <section className="px-6 pt-24 pb-32">
          <div className="max-w-[720px] mx-auto">
            <FadeInOnScroll delay={0.1}>
              <p
                className="text-[11px] uppercase tracking-[0.18em] font-bold mb-5 text-center"
                style={{ color: "rgba(255,164,198,0.55)" }}
              >
                FAQ
              </p>
              <h2
                className="font-headline text-2xl sm:text-3xl font-bold text-white text-center mb-10"
                style={{ wordBreak: "keep-all" }}
              >
                자주 묻는 질문
              </h2>
            </FadeInOnScroll>

            <FadeInOnScroll delay={0.2}>
              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {FAQ_ITEMS.map((item, i) => (
                  <div
                    key={item.q}
                    className="flex flex-col sm:flex-row gap-4 sm:gap-8 px-6 py-5"
                    style={{
                      borderTop:
                        i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)",
                      background:
                        i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                    }}
                  >
                    <p
                      className="text-sm font-semibold text-white shrink-0 sm:w-60"
                      style={{ wordBreak: "keep-all" }}
                    >
                      {item.q}
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: "#8b8b99", wordBreak: "keep-all" }}
                    >
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            </FadeInOnScroll>
          </div>
        </section>
      </main>

      <FooterSection />

      {/* ── 종량제 팩 구매 다이얼로그 ───────────────────────────────────── */}
      {packModalSize !== null && (
        <PackPurchaseModal
          open={true}
          onClose={() => setPackModalSize(null)}
          defaultSize={packModalSize}
          onSuccess={() => {
            // 결제 성공 → 헤더 배지 즉시 갱신 + 모달 닫기
            clearPackBalanceCache();
            setPackModalSize(null);
          }}
        />
      )}

      {/* ── 업그레이드/다운그레이드 다이얼로그 ─────────────────────────────── */}
      {pendingUpgrade && currentPlanKey && (
        <UpgradeConfirmDialog
          open={true}
          onClose={() => setPendingUpgrade(null)}
          currentPlanName={getPlanDisplayName(currentPlanKey, currentPlanTier)}
          newPlanName={getPlanDisplayName(
            pendingUpgrade.planKey,
            pendingUpgrade.planTier,
          )}
          proratedAmount={upgradeProration}
          nextBillingAmount={upgradeNewPrice}
          nextBillingDate={periodEndForDialog ?? ""}
          quoteLoading={dryRunLoading}
          quoteError={dryRunError}
          requiresPaymentMethodSetup={hasActiveBillingKey === false}
          onConfirm={() => callChangePlan(pendingUpgrade)}
        />
      )}
      {pendingDowngrade && currentPlanKey && (
        <DowngradeConfirmDialog
          open={true}
          onClose={() => setPendingDowngrade(null)}
          currentPlanName={getPlanDisplayName(currentPlanKey, currentPlanTier)}
          newPlanName={getPlanDisplayName(
            pendingDowngrade.planKey,
            pendingDowngrade.planTier,
          )}
          nextBillingAmount={downgradeNewPrice}
          effectiveAt={periodEndForDialog ?? ""}
          quoteLoading={dryRunLoading}
          quoteError={dryRunError}
          onConfirm={() => callChangePlan(pendingDowngrade)}
        />
      )}
    </div>
  );
}
