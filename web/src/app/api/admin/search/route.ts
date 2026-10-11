export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 관리자: Org / User 통합 검색.
 * - q가 UUID 형식: organizations.id 직접 매칭
 * - q에 '@' 포함: 이메일로 auth user 찾고, 그 user가 속한 org들 반환
 * - 그 외: organizations.name ILIKE
 *
 * 응답의 plan/usage/member count는 org별로 병렬 조회.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OrgSearchResult {
  orgId: string;
  orgName: string;
  ownerEmail: string | null;
  plan: string;
  planTier: number;
  planStatus: string;
  periodEnd: string | null;
  monthlyGenerations: number;
  memberCount: number;
}

interface OrgRow {
  id: string;
  name: string | null;
  owner_id: string;
}

/** 이메일로 auth user id 찾기 (GoTrue admin REST API). */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(normalized)}&per_page=50`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    );
    if (!res.ok) {
      console.error(
        "[findUserIdByEmail] GoTrue error:",
        res.status,
        await res.text(),
      );
      return null;
    }
    const json = (await res.json()) as {
      users?: Array<{ id: string; email?: string }>;
    };
    // filter는 부분 일치이므로 정확히 일치하는 항목만 선택
    const user = json.users?.find((u) => u.email?.toLowerCase() === normalized);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function thisYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function enrichOrg(
  org: OrgRow,
  ownerEmailOverride: string | null | undefined,
): Promise<OrgSearchResult> {
  const yearMonth = thisYearMonth();

  const [subRes, usageRes, memberRes, ownerEmailRes] = await Promise.all([
    supabaseAdmin
      .from("subscriptions")
      .select("plan, plan_tier, status, current_period_end")
      .eq("organization_id", org.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("usage_counters")
      .select("generations")
      .eq("organization_id", org.id)
      .eq("year_month", yearMonth)
      .is("brand_id", null)
      .maybeSingle(),
    supabaseAdmin
      .from("organization_members")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", org.id),
    // 이메일 검색 시에는 검색어 자체가 owner email일 가능성이 높지만 그렇지 않을 수도 있고
    // 또 멤버 검색 결과는 owner와 다를 수 있어, 항상 owner 이메일을 별도 조회.
    ownerEmailOverride !== undefined
      ? Promise.resolve({ data: { user: { email: ownerEmailOverride } } })
      : supabaseAdmin.auth.admin.getUserById(org.owner_id),
  ]);

  const sub = subRes.data as {
    plan: string | null;
    plan_tier: number | null;
    status: string | null;
    current_period_end: string | null;
  } | null;

  const ownerEmail =
    ownerEmailOverride !== undefined
      ? ownerEmailOverride
      : ((ownerEmailRes as { data?: { user?: { email?: string | null } } }).data
          ?.user?.email ?? null);

  return {
    orgId: org.id,
    orgName: org.name ?? "Unnamed",
    ownerEmail: ownerEmail ?? null,
    plan: sub?.plan ?? "free",
    planTier: sub?.plan_tier ?? 1,
    planStatus: sub?.status ?? "free",
    periodEnd: sub?.current_period_end ?? null,
    monthlyGenerations:
      (usageRes.data as { generations?: number } | null)?.generations ?? 0,
    memberCount: memberRes.count ?? 0,
  };
}

export async function GET(req: Request) {
  try {
    const auth = await requireCreditsAdmin(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) {
      return NextResponse.json({ results: [] });
    }

    let orgs: OrgRow[] = [];
    let emailOverride: string | null | undefined;

    if (UUID_RE.test(q)) {
      const { data, error } = await supabaseAdmin
        .from("organizations")
        .select("id, name, owner_id")
        .eq("id", q)
        .maybeSingle();
      if (error) {
        return NextResponse.json(
          { error: error.message ?? "Search failed" },
          { status: 500 },
        );
      }
      if (data) orgs = [data as OrgRow];
    } else if (q.includes("@")) {
      const userId = await findUserIdByEmail(q);
      if (!userId) {
        return NextResponse.json({ results: [] });
      }
      const { data: memberRows, error: memberErr } = await supabaseAdmin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId);
      if (memberErr) {
        return NextResponse.json(
          { error: memberErr.message ?? "Search failed" },
          { status: 500 },
        );
      }
      const orgIds = (memberRows ?? [])
        .map((r) => (r as { organization_id: string }).organization_id)
        .filter(Boolean);
      if (orgIds.length === 0) {
        return NextResponse.json({ results: [] });
      }
      const { data: orgRows, error: orgErr } = await supabaseAdmin
        .from("organizations")
        .select("id, name, owner_id")
        .in("id", orgIds)
        .limit(20);
      if (orgErr) {
        return NextResponse.json(
          { error: orgErr.message ?? "Search failed" },
          { status: 500 },
        );
      }
      orgs = (orgRows ?? []) as OrgRow[];
      // 이 경우 검색어 = 멤버 이메일이지만 owner와 동일한지는 알 수 없음.
      // owner email은 별도로 조회.
      emailOverride = undefined;
    } else {
      // ILIKE에 사용되는 q는 SQL injection 안전하게 escape (% _ \).
      const escaped = q
        .replace(/\\/g, "\\\\")
        .replace(/[%_]/g, (m) => `\\${m}`);
      const { data, error } = await supabaseAdmin
        .from("organizations")
        .select("id, name, owner_id")
        .ilike("name", `%${escaped}%`)
        .limit(20);
      if (error) {
        return NextResponse.json(
          { error: error.message ?? "Search failed" },
          { status: 500 },
        );
      }
      orgs = (data ?? []) as OrgRow[];
    }

    if (orgs.length === 0) {
      return NextResponse.json({ results: [] });
    }

    const results = await Promise.all(
      orgs.map((o) => enrichOrg(o, emailOverride)),
    );

    return NextResponse.json({ results });
  } catch (e) {
    console.error("[admin/search] Unhandled error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
