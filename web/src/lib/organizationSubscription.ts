import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getBrandPlanConfig,
  getProGenerationLimit,
  toProTier,
  type PlanKey,
  type BrandPlanConfig,
} from "@/lib/plans-brand";

/**
 * Organization-level 구독 상태.
 * brandSubscription.ts와 같은 인터페이스를 유지하되 organization 풀 기준으로 계산된다.
 */
export interface OrganizationSubscriptionState {
  organizationId: string;
  plan: BrandPlanConfig;
  planKey: PlanKey;
  /** Pro 플랜 전용 티어 (1~4). Pro 외 플랜은 항상 1. */
  planTier: number;
  status: string;
  currentPeriodEnd: string;
  /**
   * 실제 적용되는 월 이미지 생성 한도.
   * Pro 플랜은 planTier에 따라 동적 계산.
   * null이면 무제한.
   */
  generationLimit: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand → Organization 매핑
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 주어진 brandId가 속한 organization id를 반환한다.
 * brand가 없거나 organization_id가 NULL이면 null.
 */
export async function getOrgIdFromBrand(
  brandId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("brands")
    .select("organization_id")
    .eq("id", brandId)
    .maybeSingle();
  return (data?.organization_id as string | null) ?? null;
}

/**
 * userId가 owner로 등록된 default organization id를 반환한다.
 * 없으면 null. 신규 brand 생성 시 organization_id를 채워 넣을 때 사용.
 */
export async function getDefaultOrgIdForUser(
  userId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | null) ?? null;
}

/**
 * userId가 owner이거나 member로 속한 모든 organization을 반환한다.
 */
export async function listOrganizationsForUser(
  userId: string,
): Promise<Array<{ id: string; name: string; role: string; ownerId: string }>> {
  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("role, organization_id, organizations!inner(id, name, owner_id)")
    .eq("user_id", userId);

  type Row = {
    role: string;
    organization_id: string;
    organizations:
      | { id: string; name: string; owner_id: string }
      | { id: string; name: string; owner_id: string }[]
      | null;
  };

  return ((data ?? []) as Row[]).map((r) => {
    const org = Array.isArray(r.organizations)
      ? r.organizations[0]
      : r.organizations;
    return {
      id: org?.id ?? r.organization_id,
      name: org?.name ?? "",
      ownerId: org?.owner_id ?? "",
      role: r.role,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 구독 상태 조회
// ─────────────────────────────────────────────────────────────────────────────

/**
 * organization의 현재 활성 구독 플랜을 반환한다.
 * 구독이 없으면 Free 플랜 상태를 반환한다 (DB에 레코드를 생성하지 않음).
 */
export async function getOrganizationSubscription(
  organizationId: string,
): Promise<OrganizationSubscriptionState> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, status, current_period_end, plan_tier")
    .eq("organization_id", organizationId)
    .in("status", ["active", "trialing"])
    .maybeSingle();

  if (!data) {
    const freePlan = getBrandPlanConfig("free")!;
    return {
      organizationId,
      plan: freePlan,
      planKey: "free",
      planTier: 1,
      status: "free",
      currentPeriodEnd: "9999-12-31T23:59:59.000Z",
      generationLimit: freePlan.generationLimit,
    };
  }

  const planConfig = getBrandPlanConfig(data.plan);
  if (!planConfig) {
    const freePlan = getBrandPlanConfig("free")!;
    return {
      organizationId,
      plan: freePlan,
      planKey: "free",
      planTier: 1,
      status: data.status,
      currentPeriodEnd: data.current_period_end,
      generationLimit: freePlan.generationLimit,
    };
  }

  const planTier = toProTier(data.plan_tier as number | null);

  const generationLimit =
    data.plan === "pro"
      ? getProGenerationLimit(planTier)
      : planConfig.generationLimit;

  return {
    organizationId,
    plan: planConfig,
    planKey: data.plan as PlanKey,
    planTier,
    status: data.status,
    currentPeriodEnd: data.current_period_end,
    generationLimit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 카운트 헬퍼 (org 풀 단위)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 해당 organization이 소유한 brand 수.
 */
export async function getOrgBrandCount(
  organizationId: string,
): Promise<number> {
  const { count } = await supabaseAdmin
    .from("brands")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  return count ?? 0;
}

/**
 * organization 내 모든 brand에 걸친 active 스타일 합산.
 */
export async function getOrgStyleCount(
  organizationId: string,
): Promise<number> {
  const { data: brands } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId);

  const brandIds = (brands ?? []).map((b: { id: string }) => b.id);
  if (brandIds.length === 0) return 0;

  const { count } = await supabaseAdmin
    .from("styles")
    .select("id", { count: "exact", head: true })
    .in("brand_id", brandIds)
    .eq("status", "active")
    .neq("type", "auto");
  return count ?? 0;
}

/**
 * organization 내 모든 brand에 걸친 model 합산.
 */
export async function getOrgModelCount(
  organizationId: string,
): Promise<number> {
  const { data: brands } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId);

  const brandIds = (brands ?? []).map((b: { id: string }) => b.id);
  if (brandIds.length === 0) return 0;

  const { count } = await supabaseAdmin
    .from("models")
    .select("id", { count: "exact", head: true })
    .in("brand_id", brandIds);
  return count ?? 0;
}

/**
 * organization member 수 (owner 포함).
 */
export async function getOrgMemberCount(
  organizationId: string,
): Promise<number> {
  const { count } = await supabaseAdmin
    .from("organization_members")
    .select("user_id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  return count ?? 0;
}

/**
 * 이번 달 organization 단위 이미지 생성 횟수.
 * usage_counters의 org-마스터 row(brand_id IS NULL)를 읽는다.
 */
export async function getOrgGenerationCount(
  organizationId: string,
): Promise<number> {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const { data } = await supabaseAdmin
    .from("usage_counters")
    .select("generations")
    .eq("organization_id", organizationId)
    .is("brand_id", null)
    .eq("year_month", yearMonth)
    .maybeSingle();
  return (data?.generations as number | undefined) ?? 0;
}

/**
 * 오늘(UTC) organization 단위 이미지 생성 횟수.
 * org에 속한 모든 brand의 jobs를 합산.
 */
export async function getOrgDailyGenerationCount(
  organizationId: string,
): Promise<number> {
  const { data: brands } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId);

  const brandIds = (brands ?? []).map((b: { id: string }) => b.id);
  if (brandIds.length === 0) return 0;

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count } = await supabaseAdmin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .in("brand_id", brandIds)
    .not("status", "in", '("failed","cancelled")')
    .gte("created_at", startOfDay.toISOString());
  return count ?? 0;
}

/**
 * organization 카운터 +1. RPC로 atomic 처리 (race condition 방지).
 */
export async function incrementOrgGenerationCount(
  organizationId: string,
): Promise<void> {
  const yearMonth = new Date().toISOString().slice(0, 7);
  await supabaseAdmin.rpc("increment_org_generation_count", {
    p_org_id: organizationId,
    p_year_month: yearMonth,
  });
}

/**
 * organization 카운터 -1 (환불용).
 *
 * 사용처:
 *   /api/render/create-job 의 각 핸들러가 consumeOneGeneration → R2 업로드 →
 *   job insert 순서로 진행하다가 업로드/insert 가 실패한 경우, 차감한 1장을
 *   복원하기 위해 refundOneGeneration → decrementOrgGenerationCount 로 호출된다.
 *
 * 멱등성·정합성:
 *   - generations 가 음수가 되는 것을 막기 위해 greatest(0, generations - 1) 사용.
 *   - row 자체가 없거나 generations = 0 이면 noop. 동일 ConsumeOk 로 두 번
 *     호출되어도 안전 (단, 환불 호출자가 idempotent 책임을 짐).
 *   - atomic UPDATE — SELECT-then-UPDATE 가 아니라 단일 UPDATE 안에서 처리해
 *     race condition 없음.
 *
 * SoT 정합성:
 *   usage_counters 의 org-마스터 row(brand_id IS NULL) 만 -1. brand 단위 row 는
 *   더 이상 갱신하지 않는 정책(B6)에 맞춰 increment 와 동일하게 org 카운터만 조작.
 *
 * 에러 처리 — best-effort 환불 의도:
 *   RPC 오류 시 throw 한다. 단, 유일한 호출 경로인 `refundOneGeneration`
 *   (packConsumption.ts) 가 외곽 try-catch 로 이 throw 를 의도적으로 포획해
 *   `console.error` 만 남기고 사용자 흐름은 막지 않는다. 즉, 환불은 best-effort
 *   이며 실패는 운영자가 로그로 추적 후 수동 복구한다.
 */
export async function decrementOrgGenerationCount(
  organizationId: string,
): Promise<void> {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const { error } = await supabaseAdmin.rpc("decrement_org_generation_count", {
    p_org_id: organizationId,
    p_year_month: yearMonth,
  });
  if (error) {
    // throw 한다 — 단, 호출자(refundOneGeneration) 가 의도적으로 catch 해 로그만 남김.
    throw new Error(
      `decrement_org_generation_count RPC failed: ${error.message}`,
    );
  }
}
