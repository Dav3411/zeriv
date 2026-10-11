-- product_insertion_rules_patch.sql
-- 제품별 합성 규칙 프리셋 추가
--
-- 목적:
--   현재 INSERTION_MODE_RULES 가 전역 하드코딩이라 모든 제품에 동일 규칙 적용됨.
--   제품마다 "이 제품은 항상 side_packshot + drop_shadow 없음" 같은 규칙을 저장해
--   brand_image_jobs 생성 시 자동으로 제품 프리셋을 사용하도록 함.
--
-- 변경:
--   brand_products 에 insertion_rules jsonb 컬럼 추가
--   구조: ProductInsertionRulesPreset (아래 참고)
--
-- ※ 멱등 설계

alter table brand_products
  add column if not exists insertion_rules jsonb;

comment on column brand_products.insertion_rules is
'제품별 합성 규칙 오버라이드. null이면 전역 INSERTION_MODE_RULES 사용.
구조: {
  preferredMode: InsertionMode,        -- 이 제품에 사용할 기본 모드
  maxWidthRatio?: number,              -- 전역값 덮어쓰기 (0~1)
  maxHeightRatio?: number,
  applyDropShadow?: boolean,
  autoRemoveBackground?: boolean,
  defaultAnchor?: string,              -- bottom_center | side_left | side_right 등
  allowOverflow?: boolean,
  padding?: number                     -- safe area 내부 여백 (px, 기본 0)
}';
