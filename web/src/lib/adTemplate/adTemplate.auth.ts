/**
 * adTemplate.auth.ts — Admin API 인증 헬퍼.
 *
 * 현재: x-internal-secret 헤더로 단순 검증.
 * 향후: Supabase admin JWT 검증으로 교체 가능.
 */

import { NextRequest, NextResponse } from "next/server";
import { secureCompare } from "@/lib/secureCompare";

export function requireAdminSecret(req: NextRequest): NextResponse | null {
  const secret = req.headers.get("x-internal-secret");
  if (secureCompare(secret ?? "", process.env.PIPELINE_INTERNAL_SECRET ?? ""))
    return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
