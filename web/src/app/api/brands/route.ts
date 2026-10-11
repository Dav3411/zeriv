import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getDefaultOrgIdForUser,
  getOrganizationSubscription,
  getOrgBrandCount,
} from "@/lib/organizationSubscription";
import { isReservedBrandSlug } from "@/lib/reservedBrandSlugs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 쿼리 파라미터 — org_id로 단일 org 필터 가능
  const url = new URL(req.url);
  const orgIdFilter = url.searchParams.get("org_id")?.trim() || null;
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validatedOrgIdFilter =
    orgIdFilter && UUID_RE.test(orgIdFilter) ? orgIdFilter : null;

  // organization_members로 참여한 모든 organization id 조회
  const { data: orgRows, error: orgErr } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId);

  if (orgErr) {
    console.error(
      "[brands GET] organization_members query failed:",
      orgErr.message,
    );
    return NextResponse.json(
      { error: "Failed to load organizations" },
      { status: 500 },
    );
  }

  const memberOrgIds = (orgRows ?? []).map(
    (r: { organization_id: string }) => r.organization_id,
  );

  let query = supabaseAdmin
    .from("brands")
    .select("*")
    .order("created_at", { ascending: false });

  if (validatedOrgIdFilter) {
    // 특정 org 요청 — 멤버십 확인 후 그 org의 brand만 반환
    if (!memberOrgIds.includes(validatedOrgIdFilter)) {
      return NextResponse.json(
        { error: "Organization access denied" },
        { status: 403 },
      );
    }
    query = query.eq("organization_id", validatedOrgIdFilter);
  } else if (memberOrgIds.length > 0) {
    // 전체 조회 — 멤버인 모든 org의 brand + legacy owner brand
    query = query.or(
      `user_id.eq.${userId},organization_id.in.(${memberOrgIds.join(",")})`,
    );
  } else {
    // org 멤버십 전혀 없음 — legacy owner brand만
    query = query.eq("user_id", userId);
  }

  const { data, error: dbError } = await query;

  if (dbError)
    return NextResponse.json(
      { error: "Failed to fetch brands" },
      { status: 500 },
    );

  // organization 단위 plan 조회 (org당 1번씩)
  const uniqueOrgIds = Array.from(
    new Set(
      (data ?? [])
        .map((b: Record<string, unknown>) => b.organization_id as string | null)
        .filter((v): v is string => typeof v === 'string'),
    ),
  );

  type SubRow = {
    organization_id: string;
    plan: string;
    current_period_end: string | null;
  };
  let subMap = new Map<string, SubRow>();
  if (uniqueOrgIds.length > 0) {
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("organization_id, plan, current_period_end")
      .in("organization_id", uniqueOrgIds)
      .in("status", ["active", "trialing"]);
    subMap = new Map(
      (subs ?? [])
        .filter((s: SubRow) => s.organization_id !== null)
        .map((s: SubRow) => [s.organization_id, s]),
    );
  }

  const brands = (data ?? []).map((b: Record<string, unknown>) => {
    const orgId = b.organization_id as string | null;
    const sub = orgId ? subMap.get(orgId) : undefined;
    return {
      ...b,
      organizationId: orgId,
      primaryColor: b.primary_color,
      logoUrl: (b.logo_url as string | null) ?? null,
      role: b.user_id === userId ? "owner" : "member",
      planKey: sub?.plan ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
    };
  });
  return NextResponse.json(brands);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description } = body;

  // 타입·필수값 검증을 먼저 수행 — `name=1` 같은 비문자열 입력이 예약어 가드
  // 까지 흘러가 "예약어" 메시지로 떨어지면 사용자가 원인을 알기 어렵다.
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // 예약 슬러그 차단 — URL `/[brandName]/...` 의 첫 세그먼트로 그대로 노출되는
  // 값이므로 라우팅·정적 자산·게스트 경로와 충돌하면 안 된다. 정규화 (NFKC +
  // zero-width strip + 비표준 공백 정리) 는 헬퍼 내부 처리.
  if (isReservedBrandSlug(name)) {
    return NextResponse.json(
      {
        error:
          "이 이름은 시스템 예약어로 사용할 수 없습니다. 다른 이름을 선택해 주세요.",
      },
      { status: 400 },
    );
  }

  const primaryColor = body.primaryColor ?? body.color ?? body.primary_color;

  // organizationId 결정:
  //   1) body.organizationId가 명시되면 그 org 사용 (owner/admin/member 검증)
  //   2) 아니면 user의 default organization 사용 (가장 오래된 owner=user인 org)
  let organizationId: string | null = null;
  const requestedOrgId =
    typeof body.organizationId === 'string' ? body.organizationId.trim() : '';

  if (requestedOrgId) {
    const { data: membership } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('organization_id', requestedOrgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json(
        { error: 'organization access denied' },
        { status: 403 },
      );
    }
    organizationId = requestedOrgId;
  } else {
    organizationId = await getDefaultOrgIdForUser(userId);
    if (!organizationId) {
      // user에 organization이 없는 비정상 — 자동 생성 (마이그레이션 누락 방어)
      const { data: createdOrg, error: createErr } = await supabaseAdmin
        .from('organizations')
        .insert({ name: 'My Organization', owner_id: userId })
        .select('id')
        .single();
      if (createErr || !createdOrg) {
        console.error('[brands POST] org auto-create failed:', createErr?.message);
        return NextResponse.json(
          { error: 'Failed to bootstrap organization' },
          { status: 500 },
        );
      }
      await supabaseAdmin
        .from('organization_members')
        .insert({
          organization_id: createdOrg.id,
          user_id: userId,
          role: 'owner',
        });
      organizationId = createdOrg.id as string;
    }
  }

  // 위 분기에서 organizationId는 항상 non-null이지만 TS narrowing이 안 되므로 명시 가드
  if (!organizationId) {
    return NextResponse.json(
      { error: 'Failed to determine organization' },
      { status: 500 },
    );
  }

  // brandLimit 체크 — organization 풀 기준
  const orgSub = await getOrganizationSubscription(organizationId);
  const brandLimit = orgSub.plan.brandLimit; // null = 무제한

  if (brandLimit !== null) {
    const currentBrandCount = await getOrgBrandCount(organizationId);
    if (currentBrandCount >= brandLimit) {
      const upgradeMsg =
        orgSub.planKey === 'pro'
          ? 'House 플랜으로 업그레이드하면 브랜드를 무제한으로 만들 수 있습니다.'
          : orgSub.planKey === 'studio'
            ? ''
            : 'Pro 플랜은 브랜드 2개, House 플랜은 무제한 생성이 가능합니다.';
      return NextResponse.json(
        {
          error: `현재 플랜에서는 브랜드를 ${brandLimit}개까지 생성할 수 있습니다. ${upgradeMsg}`,
        },
        { status: 402 },
      );
    }
  }

  const { data, error: dbError } = await supabaseAdmin
    .from("brands")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      name,
      primary_color: primaryColor,
      description,
    })
    .select()
    .single();

  if (dbError || !data)
    return NextResponse.json(
      { error: "Failed to create brand" },
      { status: 500 },
    );
  return NextResponse.json(
    {
      ...data,
      organizationId: data.organization_id,
      primaryColor: data.primary_color,
    },
    { status: 201 },
  );
}
