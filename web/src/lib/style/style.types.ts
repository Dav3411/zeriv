export type StyleType =
  | "custom"
  | "brand_recommended"
  | "preset"
  | "variant"
  | "auto";
export type StyleStatus = "active" | "archived";

// 색 이름(역할) → hex. 개수·키 자유 (예: { dominant: "#...", warm: "#...", accent: "#..." })
export type ColorPalette = Record<string, string>;

export interface Texture {
  finish: "matte" | "glossy" | "satin" | "metallic";
  roughness: number; // 0.0 ~ 1.0
  light_reflection: "low" | "medium" | "high";
}

export interface Lighting {
  source: "natural" | "studio" | "mixed";
  direction: "front" | "side" | "back" | "top";
  contrast: "soft" | "medium" | "hard";
  color_temperature: "warm" | "neutral" | "cool";
}

export interface Scene {
  setting: "studio" | "outdoor" | "lifestyle" | "abstract";
  background: string; // e.g. "white seamless", "marble surface", "linen backdrop"
  depth: "flat" | "shallow" | "deep";
}

export interface Style {
  id: string;
  brand_id: string;
  user_id: string;
  name: string;
  type: StyleType;
  color_palette: ColorPalette;
  texture: Texture;
  lighting: Lighting;
  mood_keywords: string[];
  scene: Scene;
  prop_keywords: string[];
  example_images: string[];
  style_sheet_url: string | null;
  key_visual_url: string | null;
  parent_style_id: string | null;
  is_template: boolean;
  category: string | null;
  status: StyleStatus;
  created_at: string;
  updated_at: string;
}

export type StyleCreateInput = Omit<
  Style,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type StyleUpdateInput = Partial<
  Omit<Style, "id" | "brand_id" | "user_id" | "created_at" | "updated_at">
>;

// brands 테이블 확장 필드
export interface BrandProfileFields {
  description: string | null;
  keywords: string[];
  prohibited_rules: string[];
  reference_images: string[];
  color_palette: string[];
  mood_summary: string | null;
  active_style_id: string | null;
}
