export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 관리자: 잡 모니터 — 최근 N일 잡 목록 (status 필터 가능).
 *
 * GET /api/admin/jobs?status=all|queued|processing|succeeded|failed&days=1&limit=50
 *
 * 응답: { jobs: JobItem[] }
 *
 * 조인 전략:
 *   - jobs.brand_id → brands(id, name, organization_id)
 *   - brand.organization_id → organizations(id, name)
 *   PostgREST embedding은 다단계 외래키 nesting이 신뢰성 떨어져 직접 IN 조회로 분리.
 *
 * 순서: status에 queued/processing이 포함되면 priority DESC, created_at ASC
 *       그렇지 않으면 created_at DESC (완료된 잡은 시간순).
 */

const VALID_STATUS = new Set([
  "all",
  "queued",
  "processing",
  "succeeded",
  "failed",
  "pending",
]);

interface JobItem {
  id: string;
  status: string;
  progress: number | null;
  error: string | null;
  kind: string | null;
  priority: number | null;
  brandId: string | null;
  brandName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function GET(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const statusRaw = (url.searchParams.get("status") ?? "all").toLowerCase();
  const status = VALID_STATUS.has(statusRaw) ? statusRaw : "all";

  const daysRaw = Number(url.searchParams.get("days") ?? "1");
  const days = Number.isFinite(daysRaw)
    ? Math.min(30, Math.max(1, Math.floor(daysRaw)))
    : 1;

  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(200, Math.max(1, Math.floor(limitRaw)))
    : 50;

  const sinceIso = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 활성 잡(queued/processing)을 우선순위 큐 순서대로 보여주고
  // 완료/실패 잡은 시간 역순으로 보여준다.
  const isActiveQuery =
    status === "queued" ||
    status === "processing" ||
    status === "pending" ||
    status === "all";

  let query = supabaseAdmin
    .from("jobs")
    .select(
      "id, user_id, brand_id, status, progress, error, payload, priority, created_at, updated_at",
    )
    .gte("created_at", sinceIso)
    .limit(limit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  if (isActiveQuery) {
    // status가 "all"/"queued"/"processing"/"pending"일 때는 큐 순서를 우선.
    query = query
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });
  } else {
    // succeeded/failed만 필터링한 경우 최근 완료된 순서로.
    query = query.order("updated_at", { ascending: false });
  }

  const { data: jobRows, error: jobErr } = await query;
  if (jobErr) {
    return NextResponse.json(
      { error: jobErr.message ?? "Failed to load jobs" },
      { status: 500 },
    );
  }

  const rows = jobRows ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ jobs: [] });
  }

  const brandIds = Array.from(
    new Set(
      rows
        .map((r) => (r as { brand_id: string | null }).brand_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  const brandMap = new Map<
    string,
    { name: string | null; organization_id: string | null }
  >();
  if (brandIds.length > 0) {
    const { data: brandRows } = await supabaseAdmin
      .from("brands")
      .select("id, name, organization_id")
      .in("id", brandIds);
    for (const b of brandRows ?? []) {
      brandMap.set(b.id as string, {
        name: (b.name as string | null) ?? null,
        organization_id: (b.organization_id as string | null) ?? null,
      });
    }
  }

  const orgIds = Array.from(
    new Set(
      Array.from(brandMap.values())
        .map((b) => b.organization_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const orgNameMap = new Map<string, string | null>();
  if (orgIds.length > 0) {
    const { data: orgRows } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    for (const o of orgRows ?? []) {
      orgNameMap.set(o.id as string, (o.name as string | null) ?? null);
    }
  }

  const jobs: JobItem[] = rows.map((r) => {
    const brandId = (r as { brand_id: string | null }).brand_id ?? null;
    const brand = brandId ? brandMap.get(brandId) : undefined;
    const orgId = brand?.organization_id ?? null;
    const payload = (r as { payload: Record<string, unknown> | null }).payload;
    const kind =
      payload && typeof payload.kind === "string"
        ? (payload.kind as string)
        : null;
    return {
      id: r.id as string,
      status: r.status as string,
      progress: (r as { progress: number | null }).progress ?? null,
      error: (r as { error: string | null }).error ?? null,
      kind,
      priority: (r as { priority: number | null }).priority ?? null,
      brandId,
      brandName: brand?.name ?? null,
      organizationId: orgId,
      organizationName: orgId ? (orgNameMap.get(orgId) ?? null) : null,
      userId: (r as { user_id: string | null }).user_id ?? null,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  });

  return NextResponse.json({ jobs });
}
