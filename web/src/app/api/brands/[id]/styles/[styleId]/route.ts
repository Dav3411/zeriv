import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import {
  dbGetStyle,
  dbUpdateStyle,
  dbArchiveStyle,
} from "@/lib/style/style.repository";
import {
  dbUpdateBrandProfile,
  dbGetBrandProfile,
} from "@/lib/style/style.repository";
import type { Style, StyleUpdateInput } from "@/lib/style/style.types";
import { resolveStyleUrls } from "@/lib/style/styleUrlResolver";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/brands/[id]/styles/[styleId] — 스타일 단건 조회
export async function GET(
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

  let style: Style | null = await dbGetStyle(styleId, brandId);

  // 아카이브된 스타일은 404로 처리 (마이그레이션으로 archived된 복사본 포함)
  if (style && (style as Style & { status?: string }).status === "archived") {
    style = null;
  }

  // 글로벌 템플릿 fallback — explore 의 모든 스타일은 별도 저장 없이
  // 모든 brand 에서 그대로 사용 가능하다. dbGetStyle 은 brand_id 일치
  // 조건이라 잡히지 않으므로, is_template=true && status=active 인
  // 행을 직접 조회해 반환한다. 권한은 위쪽 dbGetBrand 로 이미 검증됨.
  if (!style) {
    const { data: template } = await supabaseAdmin
      .from("styles")
      .select("*")
      .eq("id", styleId)
      .eq("is_template", true)
      .eq("status", "active")
      .maybeSingle();
    if (template) {
      style = template as Style;
    }
  }

  if (!style) {
    return NextResponse.json({ error: "Style not found" }, { status: 404 });
  }
  return NextResponse.json({ style: resolveStyleUrls(style) });
}

// PATCH /api/brands/[id]/styles/[styleId] — 스타일 수정
export async function PATCH(
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

  // 글로벌 템플릿(is_template=true)은 모든 brand 가 공유 사용하는
  // 읽기 전용 자원이므로 수정 불가. 한 brand 의 PATCH 가 다른 brand
  // 의 동일 스타일에까지 반영되는 cross-brand mutation 을 막기 위함.
  const { data: templateRow } = await supabaseAdmin
    .from("styles")
    .select("is_template")
    .eq("id", styleId)
    .maybeSingle();

  if (templateRow && (templateRow as { is_template: boolean }).is_template) {
    return NextResponse.json(
      { error: "Shared templates cannot be modified" },
      { status: 403 },
    );
  }

  const body = (await req.json()) as StyleUpdateInput;

  // 허용 필드만 추출
  const patch: StyleUpdateInput = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.color_palette !== undefined)
    patch.color_palette = body.color_palette;
  if (body.texture !== undefined) patch.texture = body.texture;
  if (body.lighting !== undefined) patch.lighting = body.lighting;
  if (body.mood_keywords !== undefined)
    patch.mood_keywords = body.mood_keywords;
  if (body.scene !== undefined) patch.scene = body.scene;
  if (body.prop_keywords !== undefined)
    patch.prop_keywords = body.prop_keywords;
  if (body.example_images !== undefined)
    patch.example_images = body.example_images;
  if (body.status !== undefined) patch.status = body.status;

  const style = await dbUpdateStyle(styleId, brandId, patch);
  return NextResponse.json({ style: resolveStyleUrls(style) });
}

// DELETE /api/brands/[id]/styles/[styleId] — 스타일 아카이브
export async function DELETE(
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

  // 글로벌 템플릿은 다른 brand 의 active_style_id 로도 참조될 수 있는
  // 공유 자원이므로, 단일 brand 의 삭제 요청으로 archive 하면 안 된다.
  // 명시적으로 거부.
  const { data: templateRow } = await supabaseAdmin
    .from("styles")
    .select("is_template")
    .eq("id", styleId)
    .maybeSingle();

  if (templateRow && (templateRow as { is_template: boolean }).is_template) {
    return NextResponse.json(
      { error: "Shared templates cannot be deleted" },
      { status: 403 },
    );
  }

  // 브랜드 소유 스타일 → 아카이브 처리
  await dbArchiveStyle(styleId, brandId);

  // active_style_id가 이 styleId면 null로 초기화
  const brandProfile = await dbGetBrandProfile(brandId);
  if (brandProfile?.active_style_id === styleId) {
    await dbUpdateBrandProfile(brandId, { active_style_id: null });
  }

  return NextResponse.json({ success: true });
}
