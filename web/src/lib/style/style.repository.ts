import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type {
  Style,
  StyleCreateInput,
  StyleUpdateInput,
  BrandProfileFields,
} from "./style.types";

// ─── Styles CRUD ─────────────────────────────────────────────────────────────
// 권한 검증은 상위 레이어에서 dbGetBrand(brandId, userId)로 처리하고,
// 이하 함수들은 brand_id 범위만 강제한다. (owner+member 공유 접근)

export async function dbListStyles(brandId: string): Promise<Style[]> {
  // auto 타입은 사용자가 명시적으로 저장하기 전까지 목록에서 숨긴다.
  // neq("type","auto") 대신 in()을 사용 — DB에 'auto' enum 값이 없을 때도 안전하다.
  const { data, error } = await supabaseAdmin
    .from("styles")
    .select("*")
    .eq("brand_id", brandId)
    .eq("status", "active")
    .in("type", ["custom", "brand_recommended", "preset", "variant"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list styles: ${error.message}`);
  return (data ?? []) as Style[];
}

export async function dbGetStyle(
  styleId: string,
  brandId: string,
): Promise<Style | null> {
  const { data, error } = await supabaseAdmin
    .from("styles")
    .select("*")
    .eq("id", styleId)
    .eq("brand_id", brandId)
    .single();
  if (error || !data) return null;
  return data as Style;
}

export async function dbCreateStyle(
  brandId: string,
  userId: string,
  input: StyleCreateInput,
): Promise<Style> {
  const { data, error } = await supabaseAdmin
    .from("styles")
    .insert({
      brand_id: brandId,
      user_id: userId,
      name: input.name,
      type: input.type,
      color_palette: input.color_palette,
      texture: input.texture,
      lighting: input.lighting,
      mood_keywords: input.mood_keywords,
      scene: input.scene,
      prop_keywords: input.prop_keywords,
      example_images: input.example_images,
      style_sheet_url: input.style_sheet_url ?? null,
      key_visual_url: input.key_visual_url ?? null,
      parent_style_id: input.parent_style_id,
      is_template: input.is_template,
      category: input.category ?? null,
      status: input.status,
    })
    .select()
    .single();
  if (error || !data)
    throw new Error(`Failed to create style: ${error?.message}`);
  return data as Style;
}

export async function dbUpdateStyle(
  styleId: string,
  brandId: string,
  patch: StyleUpdateInput,
): Promise<Style> {
  const dbPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.type !== undefined) dbPatch.type = patch.type;
  if (patch.color_palette !== undefined)
    dbPatch.color_palette = patch.color_palette;
  if (patch.texture !== undefined) dbPatch.texture = patch.texture;
  if (patch.lighting !== undefined) dbPatch.lighting = patch.lighting;
  if (patch.mood_keywords !== undefined)
    dbPatch.mood_keywords = patch.mood_keywords;
  if (patch.scene !== undefined) dbPatch.scene = patch.scene;
  if (patch.prop_keywords !== undefined)
    dbPatch.prop_keywords = patch.prop_keywords;
  if (patch.example_images !== undefined)
    dbPatch.example_images = patch.example_images;
  if (patch.style_sheet_url !== undefined)
    dbPatch.style_sheet_url = patch.style_sheet_url;
  if (patch.key_visual_url !== undefined)
    dbPatch.key_visual_url = patch.key_visual_url;
  if (patch.parent_style_id !== undefined)
    dbPatch.parent_style_id = patch.parent_style_id;
  if (patch.is_template !== undefined) dbPatch.is_template = patch.is_template;
  if (patch.category !== undefined) dbPatch.category = patch.category;
  if (patch.status !== undefined) dbPatch.status = patch.status;

  const { data, error } = await supabaseAdmin
    .from("styles")
    .update(dbPatch)
    .eq("id", styleId)
    .eq("brand_id", brandId)
    .select()
    .single();
  if (error || !data)
    throw new Error(`Failed to update style: ${error?.message}`);
  return data as Style;
}

export async function dbArchiveStyle(
  styleId: string,
  brandId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("styles")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", styleId)
    .eq("brand_id", brandId);
  if (error) throw new Error(`Failed to archive style: ${error.message}`);
}

export async function dbCreateVariant(
  parentStyleId: string,
  userId: string,
  brandId: string,
  patch: StyleUpdateInput,
): Promise<Style> {
  const parent = await dbGetStyle(parentStyleId, brandId);
  if (!parent) throw new Error("Parent style not found");

  const variantInput: StyleCreateInput = {
    brand_id: parent.brand_id,
    name: patch.name ?? `${parent.name} (variant)`,
    type: "variant",
    color_palette: patch.color_palette ?? parent.color_palette,
    texture: patch.texture ?? parent.texture,
    lighting: patch.lighting ?? parent.lighting,
    mood_keywords: patch.mood_keywords ?? parent.mood_keywords,
    scene: patch.scene ?? parent.scene,
    prop_keywords: patch.prop_keywords ?? parent.prop_keywords,
    example_images: patch.example_images ?? parent.example_images,
    style_sheet_url: null,
    key_visual_url: null,
    parent_style_id: parentStyleId,
    is_template: false,
    category: parent.category ?? null,
    status: "active",
  };

  return dbCreateStyle(parent.brand_id, userId, variantInput);
}

// ─── Brand Profile Fields ────────────────────────────────────────────────────
// 권한 검증은 상위 레이어에서 수행한다. 이하 함수들은 brand_id 범위만 강제.

const BRAND_PROFILE_COLUMNS =
  "description, keywords, prohibited_rules, reference_images, color_palette, mood_summary, active_style_id";

export async function dbGetBrandProfile(
  brandId: string,
): Promise<BrandProfileFields | null> {
  const { data, error } = await supabaseAdmin
    .from("brands")
    .select(BRAND_PROFILE_COLUMNS)
    .eq("id", brandId)
    .single();
  if (error || !data) return null;
  return data as BrandProfileFields;
}

export async function dbUpdateBrandProfile(
  brandId: string,
  patch: Partial<BrandProfileFields>,
): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.keywords !== undefined) dbPatch.keywords = patch.keywords;
  if (patch.prohibited_rules !== undefined)
    dbPatch.prohibited_rules = patch.prohibited_rules;
  if (patch.reference_images !== undefined)
    dbPatch.reference_images = patch.reference_images;
  if (patch.color_palette !== undefined)
    dbPatch.color_palette = patch.color_palette;
  if (patch.mood_summary !== undefined)
    dbPatch.mood_summary = patch.mood_summary;
  if (patch.active_style_id !== undefined)
    dbPatch.active_style_id = patch.active_style_id;

  const { error } = await supabaseAdmin
    .from("brands")
    .update(dbPatch)
    .eq("id", brandId);
  if (error)
    throw new Error(`Failed to update brand profile: ${error.message}`);
}
