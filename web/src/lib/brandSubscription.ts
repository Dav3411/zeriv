import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  getBrandPlanConfig,
  type BrandPlanConfig,
  type PlanKey,
} from '@/lib/plans-brand';
import {
  getOrganizationSubscription,
  getOrgIdFromBrand,
  getOrgGenerationCount,
  getOrgDailyGenerationCount,
  incrementOrgGenerationCount,
  decrementOrgGenerationCount,
} from '@/lib/organizationSubscription';

/**
 * 기존 brand-단위 구독 인터페이스.
 *
 * 호환성 보장을 위해 시그니처는 유지하되, 내부적으로는
 * organization 단위 구독(getOrganizationSubscription)에 위임한다.
 *
 * 즉, 이제 brand의 plan은 그 brand가 속한 organization의 plan과 동일하다.
 */
export interface BrandSubscriptionState {
  plan: BrandPlanConfig;
  planKey: PlanKey;
  planTier: number;
  status: string;
  currentPeriodEnd: string;
  generationLimit: number | null;
  /** 위임 대상 organization id (NULL이면 free fallback) */
  organizationId: string | null;
}

/**
 * brandId의 plan 상태를 반환한다. 내부적으로 brand → org 위임.
 *
 * brand에 organization이 없을 수 없는 정상 흐름이지만, 마이그레이션 직후
 * organization_id가 채워지지 않은 brand가 있을 수 있어 fallback으로 free.
 */
export async function getBrandSubscription(
  brandId: string,
): Promise<BrandSubscriptionState> {
  const orgId = await getOrgIdFromBrand(brandId);

  if (!orgId) {
    // organization 매핑이 없는 비정상 상태 — Free fallback (안전 기본값)
    const freePlan = getBrandPlanConfig('free')!;
    return {
      plan: freePlan,
      planKey: 'free',
      planTier: 1,
      status: 'free',
      currentPeriodEnd: '9999-12-31T23:59:59.000Z',
      generationLimit: freePlan.generationLimit,
      organizationId: null,
    };
  }

  const orgSub = await getOrganizationSubscription(orgId);
  return {
    plan: orgSub.plan,
    planKey: orgSub.planKey,
    planTier: orgSub.planTier,
    status: orgSub.status,
    currentPeriodEnd: orgSub.currentPeriodEnd,
    generationLimit: orgSub.generationLimit,
    organizationId: orgSub.organizationId,
  };
}

/**
 * 브랜드의 오늘(UTC) 이미지 생성 횟수.
 * organization 풀 합산 결과를 반환 (이제 한도가 org 단위이므로).
 *
 * brand에 org가 없으면 brand 단위 fallback (단일 brand만 합산).
 */
export async function getBrandDailyGenerationCount(
  brandId: string,
): Promise<number> {
  const orgId = await getOrgIdFromBrand(brandId);
  if (orgId) {
    return getOrgDailyGenerationCount(orgId);
  }
  // Fallback: org 매핑 없는 비정상 상태 — 단일 brand 기준
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('brand_id', brandId)
    .not('status', 'in', '("failed","cancelled")')
    .gte('created_at', startOfDay.toISOString());
  return count ?? 0;
}

/**
 * 브랜드의 이번 달 이미지 생성 횟수.
 * organization 풀 합산을 반환.
 */
export async function getBrandGenerationCount(
  brandId: string,
): Promise<number> {
  const orgId = await getOrgIdFromBrand(brandId);
  if (orgId) {
    return getOrgGenerationCount(orgId);
  }
  // Fallback: org 매핑 없는 비정상 상태 — 단일 brand 기준 (legacy 컬럼)
  const yearMonth = new Date().toISOString().slice(0, 7);
  const { data } = await supabaseAdmin
    .from('usage_counters')
    .select('generations')
    .eq('brand_id', brandId)
    .eq('year_month', yearMonth)
    .maybeSingle();
  return (data?.generations as number | undefined) ?? 0;
}

/**
 * 브랜드 카운터 +1.
 * 이제 organization 단위 카운터를 atomic +1.
 *
 * SoT(B6)는 org 카운터이므로 brand 단위 legacy row는 더 이상 갱신하지 않는다.
 */
export async function incrementBrandGenerationCount(
  brandId: string,
): Promise<void> {
  const orgId = await getOrgIdFromBrand(brandId);
  if (!orgId) {
    // 비정상: organization 매핑 없음 — silently skip (정상 흐름에서는 발생 안 함)
    console.warn(
      '[incrementBrandGenerationCount] no organization mapping for brand:',
      brandId,
    );
    return;
  }
  await incrementOrgGenerationCount(orgId);
}

/**
 * 브랜드 카운터 -1 (환불용).
 *
 * 사용처:
 *   /api/render/create-job 의 각 핸들러가 consumeOneGeneration → R2 업로드 →
 *   job insert 순서로 진행하다가 업로드/insert 가 실패한 경우, 차감된 1장을
 *   복원하기 위해 packConsumption.refundOneGeneration 에서 호출된다.
 *
 * 음수 방지:
 *   내부 RPC(decrement_org_generation_count)가 greatest(generations - 1, 0)
 *   로 clamp 한다. 따라서 이미 0 이거나 row 가 없는 경우 noop.
 *
 * SoT 정합성:
 *   incrementBrandGenerationCount 와 짝을 이룸 — org-마스터 row(brand_id IS NULL)
 *   만 갱신한다. brand 단위 legacy row 는 건드리지 않는다(B6 정책).
 */
export async function decrementBrandGenerationCount(
  brandId: string,
): Promise<void> {
  const orgId = await getOrgIdFromBrand(brandId);
  if (!orgId) {
    // 비정상: organization 매핑 없음 — increment 와 동일하게 silently skip.
    // 정상 흐름에서는 발생하지 않는다 (이미 차감에 실패했을 것).
    console.warn(
      '[decrementBrandGenerationCount] no organization mapping for brand:',
      brandId,
    );
    return;
  }
  await decrementOrgGenerationCount(orgId);
}
