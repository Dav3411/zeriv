import { NextRequest, NextResponse } from "next/server";
import { secureCompare } from "@/lib/secureCompare";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/purge-auto-styles
// 7일 이상 경과한 type='auto' && status='active' 스타일을 status='archived'로 soft delete.
// custom으로 승격되지 않은 임시 auto 스타일을 정리한다.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !secureCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("styles")
    .update({ status: "archived" })
    .eq("type", "auto")
    .eq("status", "active")
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[purge-auto-styles] failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const purged = (data ?? []).map((r: { id: string }) => r.id);
  console.log(`[purge-auto-styles] archived ${purged.length} styles`);
  return NextResponse.json({ purged: purged.length, ids: purged });
}
