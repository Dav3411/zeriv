/**
 * 브랜드 단위 KRW 구독 플랜 (갤럭시아머니트리 연동용)
 * 기존 web/src/lib/plans.ts (PayPal USD 크레딧)와 독립적으로 공존한다.
 *
 * 플랜명: Free(무료) / Quick Plus(1인 셀러) / Atelier(1인) / Label(소규모 팀) / Pro T1~T4(팀) / House(에이전시)
 * planKey: free | quick_plus | starter | label | pro | studio
 * plan_tier: pro만 1~4 사용, 나머지는 1 고정
 *
 * Quick Plus 의도:
 *  - 1인 셀러 진입 가격대 (₩9,900). 워터마크 유지 + AI 모델 0개로 Atelier 업셀.
 *  - styleLimit=1: "1개 저장 → 두 번째는 Atelier" 핵심 trigger.
 *  - modelLimit=0: 모델 enforcement 코드는 `!== null && current >= modelLimit` 패턴이라
 *    0이어도 "current >= 0" 조건에서 자동 차단되지만, UX 메시지가 어색해질 수 있다.
 *    (예: "모델을 0개까지 생성할 수 있습니다") 별도 분기를 라우트에서 처리하지 않는 한
 *    이 동작 그대로 차단은 보장된다.
 */

export type PlanKey =
  | 'free'
  | 'quick_plus'
  | 'starter'
  | 'label'
  | 'pro'
  | 'studio';

export interface BrandPlanConfig {
  key: PlanKey;
  label: string;
  /** 고정 가격. pro는 0(티어에 따라 동적 계산). studio는 0(문의). */
  priceKrw: number;
  /** 스타일 생성 한도. null = 무제한 */
  styleLimit: number | null;
  /** 월 이미지 생성 한도. null = 무제한. pro는 티어에 따라 다름 — getProGenerationLimit 사용 */
  generationLimit: number | null;
  /** 일 생성 fair-use 한도. null = 없음 */
  dailyLimit: number | null;
  /** 브랜드 한도. null = 무제한 */
  brandLimit: number | null;
  /** 브랜드당 모델(사람 모델) 생성 한도. null = 무제한 */
  modelLimit: number | null;
  memberLimit: number | null;
  /** 채널 내보내기 한도. null = 무제한. false(0) = 불가 */
  channelExport: number | null | false;
  priorityQueue: boolean;
  /** 생성 이미지에 워터마크 표시 여부 */
  watermark: boolean;
  /** pricing 페이지에서 직접 구매 가능 여부. false면 문의만 가능 */
  purchasable: boolean;
}

// ─── Pro 티어 유틸 ────────────────────────────────────────────────────────────

export type ProTier = 1 | 2 | 3 | 4;

/** Pro 플랜 티어별 월 이미지 생성 한도 */
export function getProGenerationLimit(tier: ProTier): number {
  const limits: Record<ProTier, number> = {
    1: 500,
    2: 700,
    3: 900,
    4: 1100,
  };
  return limits[tier];
}

/** Pro 플랜 티어별 KRW 가격 */
export function getProPriceKrw(tier: ProTier): number {
  const prices: Record<ProTier, number> = {
    1: 249000,
    2: 339000,
    3: 429000,
    4: 519000,
  };
  return prices[tier];
}

// ─── 플랜 정의 ────────────────────────────────────────────────────────────────

export const BRAND_PLANS: Record<PlanKey, BrandPlanConfig> = {
  free: {
    key: 'free',
    label: 'Free',
    priceKrw: 0,
    styleLimit: 0,
    generationLimit: 5,
    dailyLimit: null,
    brandLimit: 1,
    modelLimit: 0,
    memberLimit: 1,
    channelExport: false,
    priorityQueue: false,
    // 모든 플랜 워터마크 제거 — 시장 진입 단계에선 차별화 요소로 부적합 (쿠팡 셀러 실사용 차단)
    watermark: false,
    purchasable: false,
  },
  quick_plus: {
    key: 'quick_plus',
    label: 'Quick Plus',
    priceKrw: 9900,
    styleLimit: 1,
    generationLimit: 50,
    dailyLimit: null,
    brandLimit: 1,
    // AI 모델은 Atelier+ 전용 — 의도적으로 0. enforcement 라우트에서 자동 차단됨.
    modelLimit: 0,
    memberLimit: 1,
    channelExport: 3,
    priorityQueue: false,
    // 워터마크 제거 — 쿠팡 썸네일 등 실사용 가능해야 진입 가치 있음.
    // Atelier 업셀은 스타일 5개·AI 모델 2명·생성 150장 차이로 충분.
    watermark: false,
    purchasable: true,
  },
  starter: {
    key: 'starter',
    label: 'Atelier',
    priceKrw: 29000,
    styleLimit: 5,
    generationLimit: 200,
    dailyLimit: null,
    brandLimit: 4,
    modelLimit: 2,
    memberLimit: 3,
    channelExport: 3,
    priorityQueue: false,
    watermark: false,
    purchasable: true,
  },
  label: {
    key: 'label',
    label: 'Label',
    priceKrw: 99000,
    styleLimit: 20,
    generationLimit: 210,
    dailyLimit: null,
    brandLimit: 1,
    modelLimit: 5,
    memberLimit: 3,
    channelExport: null,
    priorityQueue: false,
    watermark: false,
    purchasable: true,
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    // pro 가격은 티어 가변 — getProPriceKrw(tier) 사용
    priceKrw: 0,
    styleLimit: 50,
    // pro 생성 한도는 티어 가변 — getProGenerationLimit(tier) 사용
    generationLimit: null,
    dailyLimit: null,
    brandLimit: 2,
    modelLimit: 10,
    memberLimit: 5,
    channelExport: null,
    priorityQueue: true,
    watermark: false,
    purchasable: true,
  },
  studio: {
    key: 'studio',
    label: 'House',
    // studio 가격은 문의 — pricing 페이지에서 직접 구매 불가
    priceKrw: 0,
    styleLimit: null,
    generationLimit: null,
    dailyLimit: null,
    brandLimit: null,
    modelLimit: null,
    memberLimit: null,
    channelExport: null,
    priorityQueue: true,
    watermark: false,
    purchasable: false,
  },
};

// ─── 유틸 함수 ────────────────────────────────────────────────────────────────

export function getBrandPlanConfig(key: string): BrandPlanConfig | null {
  return BRAND_PLANS[key as PlanKey] ?? null;
}

/**
 * planTier를 ProTier로 안전 캐스팅. 범위 밖이면 1 반환.
 */
export function toProTier(tier: number | undefined | null): ProTier {
  if (tier === 2 || tier === 3 || tier === 4) return tier;
  return 1;
}

// ─── 가격·랭크 헬퍼 ────────────────────────────────────────────────────────────

/** 정기결제 가능한 KRW 플랜 키 — 'studio'는 문의 전용 */
export const KRW_BILLABLE_PLANS = [
  "quick_plus",
  "starter",
  "label",
  "pro",
] as const;
export type KrwBillablePlan = (typeof KRW_BILLABLE_PLANS)[number];

const PLAN_AMOUNTS_FIXED: Record<string, number> = {
  quick_plus: 9900,
  starter: 29000,
  label: 99000,
};

/**
 * 임의의 planKey + planTier 에 대한 월 정기 가격(원).
 * - free: 0
 * - pro: getProPriceKrw(toProTier(planTier))
 * - starter/label: 고정값
 * - studio 또는 알 수 없는 plan: 0 (문의 또는 비빌링 대상)
 *
 * 클라이언트가 보낸 amount 를 신뢰해서는 안 되며, 모든 결제는
 * 서버에서 이 함수로만 가격을 산정해야 한다.
 */
export function getPlanPrice(
  planKey: string,
  planTier?: number | null,
): number {
  if (planKey === "pro") return getProPriceKrw(toProTier(planTier ?? 1));
  if (planKey === "free") return 0;
  return PLAN_AMOUNTS_FIXED[planKey] ?? 0;
}

/**
 * 같은 플랜 내 티어 비교를 포함한 "랭크". 가격을 그대로 사용해서
 * pro T1 < pro T2 처럼 티어 변경도 자연스럽게 비교된다.
 *
 * 주의: studio(0)는 문의 전용이라 비교에서 제외하고 호출 측에서 처리해야 한다.
 */
export function getPlanRank(
  planKey: string,
  planTier?: number | null,
): number {
  return getPlanPrice(planKey, planTier);
}

/** 한국어 표시 라벨 — UI/orderName 공용 */
export const PLAN_DISPLAY_LABELS: Record<string, string> = {
  free: "Free",
  quick_plus: "Quick Plus",
  starter: "Atelier",
  label: "Label",
  pro: "Pro",
  studio: "House",
};

/** "Pro T2" 형태로 티어가 있는 플랜은 티어를 함께 표기 */
export function getPlanDisplayName(
  planKey: string,
  planTier?: number | null,
): string {
  const base = PLAN_DISPLAY_LABELS[planKey] ?? planKey;
  if (planKey === "pro") {
    return `${base} T${toProTier(planTier ?? 1)}`;
  }
  return base;
}
