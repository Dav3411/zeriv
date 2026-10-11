import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { dbGetStyle, dbUpdateStyle } from "@/lib/style/style.repository";
import type { StyleUpdateInput } from "@/lib/style/style.types";
import { resolveStyleUrls } from "@/lib/style/styleUrlResolver";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { getBrandSubscription } from "@/lib/brandSubscription";
import {
  getOrgIdFromBrand,
  getOrgStyleCount,
} from "@/lib/organizationSubscription";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// POST /api/brands/[id]/styles/[styleId]/save
// auto 타입 스타일을 사용자 계정에 custom 타입으로 승격한다.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; styleId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId, styleId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  let body: { name?: string } = {};
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    // body optional
  }

  const existing = await dbGetStyle(styleId, brandId);
  if (!existing) {
    return NextResponse.json({ error: "Style not found" }, { status: 404 });
  }
  if (existing.brand_id !== brandId) {
    return NextResponse.json({ error: "Brand mismatch" }, { status: 400 });
  }
  if (existing.type !== "auto") {
    return NextResponse.json(
      { error: "Only auto styles can be saved" },
      { status: 400 },
    );
  }

  // ── 스타일 한도 체크 (auto → custom 승격 시점) ─────────────────────────
  const brandSub = await getBrandSubscription(brandId);
  const styleLimit = brandSub?.plan.styleLimit ?? null;

  // styleLimit === 0: 해당 플랜은 스타일 저장 자체가 미포함 — 즉시 차단.
  if (styleLimit === 0) {
    return NextResponse.json(
      {
        error:
          "스타일 저장은 Quick Plus 플랜부터 이용 가능합니다. 플랜을 업그레이드해주세요.",
        code: "STYLE_LIMIT_EXCEEDED",
      },
      { status: 403 },
    );
  }

  if (styleLimit !== null) {
    const orgId = await getOrgIdFromBrand(brandId);
    const currentCount = orgId
      ? await getOrgStyleCount(orgId)
      : await (async () => {
          const { count } = await supabaseAdmin
            .from("styles")
            .select("id", { count: "exact", head: true })
            .eq("brand_id", brandId)
            .eq("status", "active")
            .neq("type", "auto");
          return count ?? 0;
        })();
    if (currentCount >= styleLimit) {
      return NextResponse.json(
        {
          error: `현재 플랜(${brandSub!.plan.label})은 스타일을 최대 ${styleLimit}개까지 저장할 수 있습니다. 플랜을 업그레이드해주세요.`,
          code: "STYLE_LIMIT_EXCEEDED",
        },
        { status: 403 },
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────

  const patch: StyleUpdateInput = { type: "custom" };
  if (body.name && body.name.trim()) patch.name = body.name.trim();

  try {
    const style = await dbUpdateStyle(styleId, brandId, patch);
    return NextResponse.json({ style: resolveStyleUrls(style) });
  } catch (e) {
    console.error("[auto-style/save] dbUpdateStyle failed:", e);
    return NextResponse.json(
      { error: "Failed to save style" },
      { status: 500 },
    );
  }
}
