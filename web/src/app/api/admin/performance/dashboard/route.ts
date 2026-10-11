export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getProPriceKrw, toProTier } from "@/lib/plans-brand";

// ─── 플랜 가격 상수 ──────────────────────────────────────────────────────────

const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 29000,
  label: 99000,
  studio: 0,
};

function getSubMonthlyKrw(plan: string, planTier: number | null): number {
  if (plan === "pro") return getProPriceKrw(toProTier(planTier));
  return PLAN_PRICES[plan] ?? 0;
}

// ─── 응답 타입 ───────────────────────────────────────────────────────────────

interface PlanDistributionEntry {
  planKey: string;
  count: number;
  mrrKrw: number;
}

interface SignalTypeEntry {
  signalType: string;
  count: number;
}

interface TopActiveOrg {
  orgId: string;
  orgName: string;
  signalCount: number;
  planKey: string | null;
}

interface TopLikedStyle {
  styleId: string;
  styleName: string;
  brandName: string;
  likes: number;
  score: number;
}

interface RecentOrg {
  orgId: string;
  orgName: string;
  ownerEmail: string | null;
  createdAt: string;
}

interface RecentOrder {
  orderId: string;
  orgName: string | null;
  planKey: string;
  amountKrw: number;
  paidAt: string;
}

interface DashboardResponse {
  ok: true;
  generatedAt: string;
  overview: {
    activeOrgs: number;
    paidOrgs: number;
    totalUsers: number;
    monthlyImagesTotal: number;
    monthlySignalsTotal: number;
    weekSignalsTotal: number;
    todaySignalsTotal: number;
    estimatedMrrKrw: number;
  };
  planDistribution: PlanDistributionEntry[];
  signalsByType: SignalTypeEntry[];
  signalsDailyTrend: { date: string; count: number }[];
  topActiveOrgs: TopActiveOrg[];
  topLikedStyles: TopLikedStyle[];
  recentOrgs: RecentOrg[];
  recentOrders: RecentOrder[];
}

/**
 * GET /api/admin/performance/dashboard
 * 관리자 전용 운영 가시성 통합 대시보드 데이터.
 * requireCreditsAdmin (ADMIN_USER_IDS allowlist).
 */
export async function GET(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const now = new Date();
  const yearMonth = now.toISOString().slice(0, 7); // YYYY-MM
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();
  const sevenDaysAgoIso = new Date(
    now.getTime() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const thirtyDaysAgoIso = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // ─── 병렬 쿼리 실행 ─────────────────────────────────────────────────────────

  const [
    orgsResult,
    subscriptionsResult,
    usageResult,
    signalsMonthResult,
    signalsTodayResult,
    signalsWeekResult, // 5: 7일 count
    signalsByTypeRawResult, // 6: signal_type 그룹
    signalsDailyRawResult, // 7: 14일 일별 추세
    membersResult, // 8: organization_members
    topOrgsRawResult, // 9: brand_id 7일 신호
    topStylesRawResult, // 10: asset_id 30일 신호
    recentOrgsResult, // 11: organizations 최근 5개
    recentOrdersResult, // 12: portone_orders
  ] = await Promise.all([
    // 1. organizations 총 수
    supabaseAdmin
      .from("organizations")
      .select("id", { count: "exact", head: true }),

    // 2. 활성 구독 (plan, plan_tier, organization_id)
    supabaseAdmin
      .from("subscriptions")
      .select("id, plan, plan_tier, organization_id")
      .in("status", ["active", "trialing"]),

    // 3. usage_counters 이번 달 sum (org-마스터 행 기준: brand_id IS NULL)
    supabaseAdmin
      .from("usage_counters")
      .select("generations")
      .eq("year_month", yearMonth)
      .is("brand_id", null)
      .not("organization_id", "is", null),

    // 4a. creative_signals 이번 달 카운트
    supabaseAdmin
      .from("creative_signals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${yearMonth}-01T00:00:00.000Z`),

    // 4b. creative_signals 오늘 카운트
    supabaseAdmin
      .from("creative_signals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayIso),

    // 4b'. creative_signals 이번 주(7일) 카운트
    supabaseAdmin
      .from("creative_signals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgoIso),

    // 4c. creative_signals 이번 달 타입별 그룹 (클라이언트 측 집계)
    supabaseAdmin
      .from("creative_signals")
      .select("signal_type")
      .gte("created_at", `${yearMonth}-01T00:00:00.000Z`),

    // 4d. creative_signals 최근 14일 일별 추세용 (클라이언트 측 그룹화)
    supabaseAdmin
      .from("creative_signals")
      .select("created_at")
      .gte(
        "created_at",
        new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      )
      .order("created_at", { ascending: true }),

    // 5. organization_members distinct user_id (전체 행 가져와서 클라이언트 집계)
    supabaseAdmin.from("organization_members").select("user_id"),

    // 6. 최근 7일 신호 많은 org Top 10 — creative_signals에서 brand_id별로 집계 후 조인
    supabaseAdmin
      .from("creative_signals")
      .select("brand_id")
      .gte("created_at", sevenDaysAgoIso),

    // 7. style_id별 feedback_positive 합산 — 최근 30일 + 5000행 상한 (대규모 테이블 스캔 방지)
    supabaseAdmin
      .from("creative_signals")
      .select("asset_id, signal_type, weight")
      .in("signal_type", [
        "feedback_positive",
        "feedback_negative",
        "download",
        "style_reuse",
        "variation_request",
      ])
      .gte("created_at", thirtyDaysAgoIso)
      .limit(5000),

    // 8. 최근 가입 org 5개
    supabaseAdmin
      .from("organizations")
      .select("id, name, owner_id, created_at")
      .order("created_at", { ascending: false })
      .limit(5),

    // 9. 최근 portone_orders (status='paid', 5개)
    supabaseAdmin
      .from("portone_orders")
      .select("id, organization_id, plan_key, amount_krw, paid_at, created_at")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(5),
  ]);

  // ─── 집계 처리 ───────────────────────────────────────────────────────────────

  // 1. 총 org 수
  const activeOrgs = orgsResult.count ?? 0;

  // 2. 플랜 분포 및 MRR 계산
  const subs = subscriptionsResult.data ?? [];
  const paidPlanKeys = new Set([
    "quick_plus",
    "starter",
    "label",
    "pro",
    "studio",
  ]);
  const paidOrgs = subs.filter((s) =>
    paidPlanKeys.has(s.plan as string),
  ).length;

  const planCountMap = new Map<string, { count: number; mrrKrw: number }>();
  let estimatedMrrKrw = 0;
  for (const sub of subs) {
    const plan = (sub.plan as string) || "free";
    const tier = sub.plan_tier as number | null;
    const monthlyKrw = getSubMonthlyKrw(plan, tier);
    estimatedMrrKrw += monthlyKrw;

    const existing = planCountMap.get(plan) ?? { count: 0, mrrKrw: 0 };
    planCountMap.set(plan, {
      count: existing.count + 1,
      mrrKrw: existing.mrrKrw + monthlyKrw,
    });
  }

  // free: 구독 없는 org 수 = totalOrgs - paidOrgs
  const freeCount = Math.max(0, activeOrgs - paidOrgs);

  // 시장 진입 단계 (M0-M12): 활성 플랜 3개만 분포 표시 (Free / Quick Plus / Atelier).
  // Label / Pro / House 는 UI hidden 상태이므로 분포에서 제외.
  // 단, 이미 Label/Pro/House 구독자가 있으면 "기타 (legacy)" 항목으로 합산 노출.
  const activePlanKeys = ["free", "quick_plus", "starter"];
  const legacyPlanKeys = ["label", "pro", "studio"];

  const planDistribution: PlanDistributionEntry[] = activePlanKeys.map(
    (planKey) => {
      if (planKey === "free") {
        return { planKey, count: freeCount, mrrKrw: 0 };
      }
      const entry = planCountMap.get(planKey) ?? { count: 0, mrrKrw: 0 };
      return { planKey, count: entry.count, mrrKrw: entry.mrrKrw };
    },
  );

  // legacy 합산 — 0보다 클 때만 표시
  const legacyAgg = legacyPlanKeys.reduce(
    (acc, k) => {
      const e = planCountMap.get(k);
      if (e) {
        acc.count += e.count;
        acc.mrrKrw += e.mrrKrw;
      }
      return acc;
    },
    { count: 0, mrrKrw: 0 },
  );
  if (legacyAgg.count > 0) {
    planDistribution.push({
      planKey: "legacy",
      count: legacyAgg.count,
      mrrKrw: legacyAgg.mrrKrw,
    });
  }

  // 3. 이번 달 이미지 생성 합산
  const usageRows = usageResult.data ?? [];
  const monthlyImagesTotal = usageRows.reduce(
    (sum, r) => sum + (Number(r.generations) || 0),
    0,
  );

  // 4. 신호 집계
  const monthlySignalsTotal = signalsMonthResult.count ?? 0;
  const todaySignalsTotal = signalsTodayResult.count ?? 0;
  const weekSignalsTotal = signalsWeekResult.count ?? 0;

  // 14일 일별 추세 집계
  const dailyCountMap = new Map<string, number>();
  for (const row of signalsDailyRawResult.data ?? []) {
    const dateKey = (row.created_at as string).slice(0, 10); // YYYY-MM-DD
    dailyCountMap.set(dateKey, (dailyCountMap.get(dateKey) ?? 0) + 1);
  }
  const signalsDailyTrend = Array.from(dailyCountMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  // 타입별 집계
  const signalTypeCountMap = new Map<string, number>();
  for (const row of signalsByTypeRawResult.data ?? []) {
    const t = (row.signal_type as string) || "unknown";
    signalTypeCountMap.set(t, (signalTypeCountMap.get(t) ?? 0) + 1);
  }
  const signalsByType: SignalTypeEntry[] = Array.from(
    signalTypeCountMap.entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([signalType, count]) => ({ signalType, count }));

  // 5. 총 사용자 수 (distinct user_id)
  const memberRows = membersResult.data ?? [];
  const uniqueUserIds = new Set(memberRows.map((r) => r.user_id as string));
  const totalUsers = uniqueUserIds.size;

  // 6. Top Active Orgs (이번 주 7일 신호 기준 brand_id → org 매핑)
  // creative_signals에 organization_id가 없으므로 brand_id → organization_id 조인 필요
  const signalRows = topOrgsRawResult.data ?? [];
  const brandSignalCount = new Map<string, number>();
  for (const row of signalRows) {
    const bid = row.brand_id as string | null;
    if (bid) brandSignalCount.set(bid, (brandSignalCount.get(bid) ?? 0) + 1);
  }

  let topActiveOrgs: TopActiveOrg[] = [];
  if (brandSignalCount.size > 0) {
    const topBrandIds = Array.from(brandSignalCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([bid]) => bid);

    const { data: brandsData } = await supabaseAdmin
      .from("brands")
      .select("id, organization_id")
      .in("id", topBrandIds);

    // organization_id → signal count 집계
    const orgSignalMap = new Map<string, number>();
    for (const brand of brandsData ?? []) {
      const oid = brand.organization_id as string | null;
      if (!oid) continue;
      const signals = brandSignalCount.get(brand.id as string) ?? 0;
      orgSignalMap.set(oid, (orgSignalMap.get(oid) ?? 0) + signals);
    }

    const topOrgIds = Array.from(orgSignalMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([oid]) => oid);

    if (topOrgIds.length > 0) {
      const { data: orgsData } = await supabaseAdmin
        .from("organizations")
        .select("id, name")
        .in("id", topOrgIds);

      // 해당 org의 활성 구독 플랜
      const topOrgSubMap = new Map<string, string>();
      for (const sub of subs) {
        const oid = sub.organization_id as string | null;
        if (oid && topOrgIds.includes(oid)) {
          topOrgSubMap.set(oid, sub.plan as string);
        }
      }

      topActiveOrgs = topOrgIds.map((oid) => {
        const org = (orgsData ?? []).find((o) => o.id === oid);
        return {
          orgId: oid,
          orgName: (org?.name as string) ?? oid.slice(0, 8),
          signalCount: orgSignalMap.get(oid) ?? 0,
          planKey: topOrgSubMap.get(oid) ?? null,
        };
      });
    }
  }

  // 7. 좋아요 Top 스타일 (feedback_positive 기준)
  // asset_id별 가중 점수 계산
  const SIGNAL_WEIGHTS: Record<string, number> = {
    feedback_positive: 3.0,
    feedback_negative: -3.0,
    download: 1.0,
    style_reuse: 2.0,
    variation_request: -0.5,
  };
  const assetScoreMap = new Map<string, { likes: number; score: number }>();
  for (const row of topStylesRawResult.data ?? []) {
    const aid = row.asset_id as string | null;
    if (!aid) continue;
    const st = row.signal_type as string;
    const w = Number(row.weight) || SIGNAL_WEIGHTS[st] || 0;
    const existing = assetScoreMap.get(aid) ?? { likes: 0, score: 0 };
    assetScoreMap.set(aid, {
      likes: existing.likes + (st === "feedback_positive" ? 1 : 0),
      score: existing.score + w,
    });
  }

  // 상위 asset_id 20개 추출 (score 기준)
  const topAssetIds = Array.from(assetScoreMap.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 20)
    .map(([aid]) => aid);

  let topLikedStyles: TopLikedStyle[] = [];
  if (topAssetIds.length > 0) {
    const { data: assetsData } = await supabaseAdmin
      .from("assets")
      .select("id, style_id, brand_id")
      .in("id", topAssetIds)
      .not("style_id", "is", null);

    const styleIds = [
      ...new Set(
        (assetsData ?? []).map((a) => a.style_id as string).filter(Boolean),
      ),
    ];
    const brandIds = [
      ...new Set(
        (assetsData ?? []).map((a) => a.brand_id as string).filter(Boolean),
      ),
    ];

    const [stylesResult, brandsResult] = await Promise.all([
      styleIds.length > 0
        ? supabaseAdmin.from("styles").select("id, name").in("id", styleIds)
        : Promise.resolve({ data: [] }),
      brandIds.length > 0
        ? supabaseAdmin.from("brands").select("id, name").in("id", brandIds)
        : Promise.resolve({ data: [] }),
    ]);

    const styleMap = new Map(
      (stylesResult.data ?? []).map((s) => [s.id as string, s.name as string]),
    );
    const brandMap = new Map(
      (brandsResult.data ?? []).map((b) => [b.id as string, b.name as string]),
    );

    // style_id별 score/likes 집계
    const styleScoreMap = new Map<
      string,
      { likes: number; score: number; brandId: string }
    >();
    for (const asset of assetsData ?? []) {
      const sid = asset.style_id as string | null;
      const bid = asset.brand_id as string | null;
      if (!sid) continue;
      const assetScore = assetScoreMap.get(asset.id as string) ?? {
        likes: 0,
        score: 0,
      };
      const ex = styleScoreMap.get(sid);
      if (!ex) {
        styleScoreMap.set(sid, {
          likes: assetScore.likes,
          score: assetScore.score,
          brandId: bid ?? "",
        });
      } else {
        styleScoreMap.set(sid, {
          likes: ex.likes + assetScore.likes,
          score: ex.score + assetScore.score,
          brandId: ex.brandId || bid || "",
        });
      }
    }

    topLikedStyles = Array.from(styleScoreMap.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 10)
      .map(([sid, v]) => ({
        styleId: sid,
        styleName: styleMap.get(sid) ?? sid.slice(0, 8),
        brandName: brandMap.get(v.brandId) ?? "-",
        likes: v.likes,
        score: Math.round(v.score * 10) / 10,
      }));
  }

  // 8. 최근 가입 org 5개 + ownerEmail 조인
  // ownerIds 5개 정도라서 listUsers() 전체 스캔 대신 getUserById 병렬 호출 (50명+ 환경 안전)
  const recentOrgsRaw = recentOrgsResult.data ?? [];
  const ownerIds = recentOrgsRaw
    .map((o) => o.owner_id as string)
    .filter(Boolean);
  const ownerEmailMap = new Map<string, string>();
  if (ownerIds.length > 0) {
    const ownerResults = await Promise.all(
      ownerIds.map((id) => supabaseAdmin.auth.admin.getUserById(id)),
    );
    for (const { data } of ownerResults) {
      if (data?.user) {
        ownerEmailMap.set(data.user.id, data.user.email ?? "");
      }
    }
  }
  const recentOrgs: RecentOrg[] = recentOrgsRaw.map((o) => ({
    orgId: o.id as string,
    orgName: (o.name as string) || "Unnamed",
    ownerEmail: ownerEmailMap.get(o.owner_id as string) ?? null,
    createdAt: o.created_at as string,
  }));

  // 9. 최근 결제 5개 + org name
  const recentOrdersRaw = recentOrdersResult.data ?? [];
  const orderOrgIds = recentOrdersRaw
    .map((o) => o.organization_id as string | null)
    .filter((id): id is string => Boolean(id));
  const orderOrgNameMap = new Map<string, string>();
  if (orderOrgIds.length > 0) {
    const { data: orderOrgsData } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .in("id", orderOrgIds);
    for (const org of orderOrgsData ?? []) {
      orderOrgNameMap.set(org.id as string, (org.name as string) || "Unnamed");
    }
  }
  const recentOrders: RecentOrder[] = recentOrdersRaw.map((o) => ({
    orderId: o.id as string,
    orgName: o.organization_id
      ? (orderOrgNameMap.get(o.organization_id as string) ?? null)
      : null,
    planKey: (o.plan_key as string) || "unknown",
    amountKrw: Number(o.amount_krw) || 0,
    paidAt: (o.paid_at ?? o.created_at) as string,
  }));

  // ─── 응답 조립 ────────────────────────────────────────────────────────────────

  const response: DashboardResponse = {
    ok: true,
    generatedAt: now.toISOString(),
    overview: {
      activeOrgs,
      paidOrgs,
      totalUsers,
      monthlyImagesTotal,
      monthlySignalsTotal,
      weekSignalsTotal,
      todaySignalsTotal,
      estimatedMrrKrw,
    },
    planDistribution,
    signalsByType,
    signalsDailyTrend,
    topActiveOrgs,
    topLikedStyles,
    recentOrgs,
    recentOrders,
  };

  return NextResponse.json(response);
}
