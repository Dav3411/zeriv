-- brand_products_patch.sql
-- brand_products 테이블 구체화 패치
--
-- 추가 내용:
--   - product_category : 카테고리 enum
--   - packaging_type   : 용기 형태 enum
--   - packaging_finish : 용기 마감 enum
--   - packaging_material : 용기 소재 enum
--   - dominant_colors  : 제품 자체 색상 (브랜드 색과 별개)
--   - is_transparent   : 제품 자체가 투명/반투명한지 (세럼, 오일 등)
--   - images           : 다각도 이미지 목록 (jsonb, ProductImage[])
--   - visual_keywords  : 이 제품의 프롬프트 키워드 (자동 주입)
--   - avoid_keywords   : 이 제품에 피해야 할 키워드
--   - hero_feature     : 대표 시각적 특성 (예: "gold flake serum texture")
--   - preferred_scale  : product_system.product_scale 오버라이드 기본값
--   - preferred_bg_treatment : 배경 처리 선호
--
-- ※ 멱등 설계: 여러 번 실행해도 안전함.

-- ─── enum types ───────────────────────────────────────────────────────────────

do $$ begin
  create type product_category as enum (
    'skincare',       -- 스킨케어 (세럼, 크림, 토너 등)
    'makeup',         -- 메이크업 (파운데이션, 립, 아이 등)
    'haircare',       -- 헤어케어 (샴푸, 트리트먼트 등)
    'fragrance',      -- 향수 / 바디미스트
    'bodycare',       -- 바디로션, 클렌저 등
    'supplement',     -- 건강기능식품 / 이너뷰티
    'food_beverage',  -- 식품 / 음료
    'fashion',        -- 의류 / 신발
    'accessory',      -- 가방, 주얼리, 선글라스 등
    'electronics',    -- 뷰티 디바이스, 가전
    'home',           -- 홈케어, 디퓨저
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type packaging_type as enum (
    'bottle',         -- 병 (유리/플라스틱)
    'tube',           -- 튜브
    'jar',            -- 단지 (크림류)
    'box',            -- 박스/케이스
    'pump_bottle',    -- 펌프 디스펜서
    'dropper',        -- 드로퍼 (세럼)
    'stick',          -- 스틱형 (립밤, 선스틱)
    'cushion',        -- 쿠션 컴팩트
    'palette',        -- 팔레트
    'sachet',         -- 소분 파우치
    'can',            -- 캔
    'pouch',          -- 파우치
    'ampoule',        -- 앰플 (바이알)
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type packaging_finish as enum (
    'glossy',         -- 광택
    'matte',          -- 무광
    'frosted',        -- 반투명 무광 (젖빛)
    'metallic',       -- 메탈릭
    'transparent',    -- 완전 투명
    'holographic',    -- 홀로그래픽
    'mixed'           -- 혼합
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type packaging_material as enum (
    'glass',
    'plastic',
    'metal',
    'paper_cardboard',
    'fabric',
    'mixed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type product_bg_treatment as enum (
    'clean_white',    -- 흰 배경 클린샷
    'brand_color',    -- 브랜드 주조색 배경
    'contextual',     -- 제품 세계관에 맞는 배경
    'transparent'     -- 배경 없음 (합성용)
  );
exception when duplicate_object then null;
end $$;

-- ─── brand_products 컬럼 추가 ─────────────────────────────────────────────────

alter table brand_products
  -- 카테고리 / 패키징
  add column if not exists product_category     product_category       not null default 'other',
  add column if not exists packaging_type       packaging_type         not null default 'other',
  add column if not exists packaging_finish     packaging_finish       not null default 'glossy',
  add column if not exists packaging_material   packaging_material     not null default 'plastic',

  -- 제품 자체 색상 (브랜드 색과 별개 — 합성 색조 참고용)
  -- 예: ['#F5D5C5', '#EAB8A0'] (제품 용기/내용물 색)
  add column if not exists dominant_colors      text[]                 not null default '{}',

  -- 제품 자체가 투명/반투명인지 (세럼, 오일, 젤 등)
  -- true면 ingredient_visualization='explicit' 자동 설정
  add column if not exists is_transparent       boolean                not null default false,

  -- 다각도 이미지 목록 (ProductImage[])
  -- [{ role: 'hero'|'packshot'|'angle'|'ingredient'|'lifestyle'|'texture',
  --    r2_key: string, url: string, width?: number, height?: number,
  --    has_transparent_bg: boolean, order_idx: number }]
  add column if not exists images               jsonb                  not null default '[]',

  -- 프롬프트 자동 주입 키워드
  -- 예: ['dewy gel texture', 'pearl shimmer finish', 'layered serum drop']
  add column if not exists visual_keywords      text[]                 not null default '{}',
  -- 예: ['powder finish', 'opaque texture', 'solid packaging']
  add column if not exists avoid_keywords       text[]                 not null default '{}',

  -- 대표 시각적 특성 (콘셉트 promptPrefix에 자동 삽입)
  -- 예: "translucent gold serum with suspended micro-pearls"
  add column if not exists hero_feature         text                   check (char_length(hero_feature) <= 300),

  -- 렌더링 기본값 (콘셉트 생성 시 product_system 자동 오버라이드)
  -- product_scale: product_system.product_scale 기본값
  add column if not exists preferred_scale      text                   not null default 'large'
                           check (preferred_scale in ('small', 'medium', 'large', 'macro')),
  -- 배경 처리 선호
  add column if not exists preferred_bg_treatment product_bg_treatment not null default 'contextual';

-- 카테고리별 조회용 인덱스
create index if not exists idx_brand_products_category
  on brand_products(brand_id, product_category)
  where status = 'active';
