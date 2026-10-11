/**
 * brandProduct.types.ts
 * 브랜드 제품 엔티티 타입 정의.
 *
 * 제품 데이터는 두 가지 방향으로 렌더링 파이프라인에 영향을 준다:
 *   1. 합성 레이어 : images[].url, has_transparent_bg → ProductInsertionSpec
 *   2. 프롬프트 레이어 : visual_keywords, hero_feature, packaging 정보
 *                       → 프롬프트 빌드 시 제품 속성 반영
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export type ProductCategory =
  | "skincare"
  | "makeup"
  | "haircare"
  | "fragrance"
  | "bodycare"
  | "supplement"
  | "food_beverage"
  | "fashion"
  | "accessory"
  | "electronics"
  | "home"
  | "other";

export type PackagingType =
  | "bottle"
  | "tube"
  | "jar"
  | "box"
  | "pump_bottle"
  | "dropper"
  | "stick"
  | "cushion"
  | "palette"
  | "sachet"
  | "can"
  | "pouch"
  | "ampoule"
  | "other";

export type PackagingFinish =
  | "glossy"
  | "matte"
  | "frosted"
  | "metallic"
  | "transparent"
  | "holographic"
  | "mixed";

export type PackagingMaterial =
  | "glass"
  | "plastic"
  | "metal"
  | "paper_cardboard"
  | "fabric"
  | "mixed";

export type ProductBgTreatment =
  | "clean_white"
  | "brand_color"
  | "contextual"
  | "transparent";

export type ProductPreferredScale = "small" | "medium" | "large" | "macro";

export type ProductInsertionMode =
  | "none"
  | "graphic_insert"
  | "side_packshot"
  | "ending_packshot"
  | "handheld_supported";

// ─── Product Image ────────────────────────────────────────────────────────────

/**
 * 제품의 개별 이미지 (다각도 / 용도별).
 * images: ProductImage[] 로 products.images 에 저장됨.
 */
export type ProductImageRole =
  | "hero" // 대표 이미지 (합성 기본값)
  | "packshot" // 정면 패키지 클린샷
  | "angle" // 측면/후면 각도
  | "texture" // 텍스처 클로즈업 (내용물 질감)
  | "ingredient" // 성분/원료 시각화
  | "lifestyle"; // 라이프스타일 컨텍스트 (배경 있음)

export interface ProductImage {
  role: ProductImageRole;
  r2_key: string;
  url: string;
  width?: number;
  height?: number;
  has_transparent_bg: boolean;
  order_idx: number;
}

// ─── Product Row (DB) ─────────────────────────────────────────────────────────

export interface BrandProductRow {
  id: string;
  brand_id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null; // legacy — use product_category
  product_category: ProductCategory;
  status: "active" | "archived";

  // 패키징 물성
  packaging_type: PackagingType;
  packaging_finish: PackagingFinish;
  packaging_material: PackagingMaterial;
  dominant_colors: string[]; // hex[], 제품 자체 색상
  is_transparent: boolean; // 내용물이 투명/반투명

  // 이미지 (다각도)
  images: ProductImage[];
  product_sheet_key: string | null; // 전체 이미지 그리드 시트 R2 키
  // 단축 접근 (images[role='hero'] 의 url — 없으면 legacy image_url 사용)
  image_r2_key: string | null; // legacy 필드 (images[0].r2_key)
  image_url: string | null; // legacy 필드 (images[0].url)
  has_transparent_bg: boolean; // legacy 필드 (images[0].has_transparent_bg)

  // 프롬프트 주입 키워드
  visual_keywords: string[]; // 생성 시 promptPrefix에 자동 삽입
  avoid_keywords: string[]; // 생성 시 negativePrompt에 자동 삽입
  hero_feature: string | null; // 대표 시각 특성 문장

  // 렌더링 기본 설정 (콘셉트 생성 시 product_system 자동 파생)
  preferred_scale: ProductPreferredScale;
  preferred_bg_treatment: ProductBgTreatment;
  default_insertion_mode: ProductInsertionMode;

  // 합성 규칙 프리셋 (null이면 전역 INSERTION_MODE_RULES 사용)
  // 구조: ProductInsertionRulesPreset (insertionRules.ts 참조)
  insertion_rules: Record<string, unknown> | null;

  // 자유 메타
  product_meta: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

// ─── Input (API 요청용) ───────────────────────────────────────────────────────

export interface CreateBrandProductInput {
  brandId: string;
  name: string;
  description?: string;
  productCategory: ProductCategory;
  packagingType: PackagingType;
  packagingFinish: PackagingFinish;
  packagingMaterial: PackagingMaterial;
  dominantColors?: string[];
  isTransparent?: boolean;
  visualKeywords?: string[];
  avoidKeywords?: string[];
  heroFeature?: string;
  preferredScale?: ProductPreferredScale;
  preferredBgTreatment?: ProductBgTreatment;
  defaultInsertionMode?: ProductInsertionMode;
  productMeta?: Record<string, unknown>;
}

export interface AddProductImageInput {
  productId: string;
  role: ProductImageRole;
  r2Key: string;
  url: string;
  width?: number;
  height?: number;
  hasTransparentBg?: boolean;
}
