export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 관리자: 어드민 감사 로그 조회.
 *
 * GET /api/admin/audit?limit=50&offset=0
 *
 * 응답:
 *   { logs: AuditLog[], total: number }
 *
 * - admin_audit_logs는 service-role only RLS, supabaseAdmin으로 조회.
 * - count는 'exact' (best-effort, 다소 비싸지만 페이지 네비게이션에 필요).
 * - limit 1~200, offset >=0.
 */

interface AuditLog {
  id: string;
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export async function GET(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const offsetRaw = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(200, Math.max(1, Math.floor(limitRaw)))
    : 50;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(0, Math.floor(offsetRaw))
    : 0;

  const { data, error, count } = await supabaseAdmin
    .from("admin_audit_logs")
    .select(
      "id, admin_user_id, action, target_type, target_id, details, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to load audit logs" },
      { status: 500 },
    );
  }

  const logs: AuditLog[] = (data ?? []).map((row) => ({
    id: row.id as string,
    adminUserId: row.admin_user_id as string,
    action: row.action as string,
    targetType: row.target_type as string,
    targetId: row.target_id as string,
    details: (row.details as Record<string, unknown> | null) ?? {},
    createdAt: row.created_at as string,
  }));

  return NextResponse.json({ logs, total: count ?? logs.length });
}
