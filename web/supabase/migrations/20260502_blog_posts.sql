-- ---------------------------------------------------------------------------
-- 20260502_blog_posts.sql
-- ---------------------------------------------------------------------------
-- 블로그 포스트 테이블. SEO 타겟 콘텐츠를 마크다운으로 저장한다.
--
-- 보안 모델:
--   - RLS 활성화. 퍼블릭은 status = 'published' 만 SELECT 가능.
--   - 관리자 CRUD 는 service-role (supabaseAdmin) 으로 RLS 우회하여 처리.
--   - INSERT/UPDATE/DELETE 정책은 만들지 않는다 — anon/authenticated 가
--     글을 작성·수정할 수 있으면 안 된다.
-- ---------------------------------------------------------------------------

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content text not null default '',
  cover_image_url text,
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  meta_title text,
  meta_description text,
  author_name text not null default 'Zeriv Team'
);

alter table blog_posts enable row level security;

-- 게시된 글만 누구나 읽을 수 있다 (anon 포함).
drop policy if exists "blog_posts_public_read" on blog_posts;
create policy "blog_posts_public_read" on blog_posts
  for select
  using (status = 'published');

-- updated_at 자동 갱신 트리거.
create or replace function update_blog_posts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_posts_updated_at on blog_posts;
create trigger blog_posts_updated_at
  before update on blog_posts
  for each row execute function update_blog_posts_updated_at();

-- 인덱스: slug 단건 조회, 게시 목록(최신순) 조회 최적화.
create unique index if not exists blog_posts_slug_idx on blog_posts (slug);
create index if not exists blog_posts_status_published_idx
  on blog_posts (status, published_at desc);

-- ---------------------------------------------------------------------------
-- 초기 시드: SEO 타겟 "쿠팡 썸네일"
-- ---------------------------------------------------------------------------
insert into blog_posts (
  slug, title, excerpt, content, tags, status, published_at,
  meta_title, meta_description, author_name
) values (
  'coupang-thumbnail-guide',
  '쿠팡 썸네일 완벽 가이드: 규격부터 AI 자동 생성까지',
  '쿠팡 마켓플레이스에서 클릭률을 높이는 썸네일 제작 방법을 알아보세요. 공식 규격, 금지 요소, AI로 자동 생성하는 방법까지 정리했습니다.',
  E'# 쿠팡 썸네일 완벽 가이드\n\n쿠팡에서 제품을 판매할 때 썸네일은 클릭률에 직접적인 영향을 미칩니다. 이 글에서는 쿠팡 썸네일 규격부터 AI로 자동 생성하는 방법까지 모두 알아봅니다.\n\n## 쿠팡 썸네일 공식 규격\n\n쿠팡 마켓플레이스는 상품 이미지에 대해 엄격한 기준을 적용합니다.\n\n- **크기**: 최소 1000×1000px, 권장 2000×2000px\n- **비율**: 1:1 정사각형\n- **배경**: 순백색 (#FFFFFF) 필수\n- **포맷**: JPG, PNG 지원\n- **용량**: 10MB 이하\n\n## 금지 사항\n\n쿠팡은 다음 요소가 포함된 썸네일을 반려합니다.\n\n- 텍스트, 워터마크, 로고 오버레이\n- 할인 문구, 이벤트 배지\n- 여러 제품을 합성한 이미지 (묶음 제외)\n- 그림자, 반사, 배경 소품\n- 손, 모델이 포함된 사용 장면\n\n## 좋은 썸네일의 조건\n\n1. **제품이 프레임을 꽉 채울 것** — 여백이 적을수록 제품이 크게 보입니다.\n2. **실제 배송 상태 그대로** — 패키지, 구성품 등 실물 그대로를 촬영합니다.\n3. **균일한 스튜디오 조명** — 그림자 없이 고르게 밝아야 합니다.\n4. **선명한 초점** — 가장자리까지 선명해야 합니다.\n\n## AI로 쿠팡 썸네일 자동 생성하기\n\nZeriv의 쿠팡 썸네일 생성기를 사용하면 제품 사진을 올리기만 해도 쿠팡 기준에 맞는 썸네일이 자동으로 만들어집니다.\n\n1. [쿠팡 썸네일 생성기](/thumbnail) 접속\n2. 제품 이미지 업로드 (JPG, PNG, WebP)\n3. AI가 자동으로 배경 제거 및 흰 배경 적용\n4. PNG 다운로드\n\n여러 제품을 한 번에 처리하려면 여러 파일을 선택하거나 ZIP 파일로 묶어서 업로드하면 됩니다.\n\n## 묶음 상품 썸네일\n\n2개 이상의 수량으로 설정하면 묶음 제품 썸네일도 자동으로 생성됩니다. 2개입, 3개입, 최대 30개입까지 지원합니다.\n\n## 마치며\n\n쿠팡 썸네일은 단순한 이미지가 아니라 클릭률과 직결되는 마케팅 자산입니다. 규격을 지키면서도 제품이 잘 보이는 썸네일을 만드는 것이 핵심입니다. Zeriv의 AI 썸네일 생성기로 시간을 절약하고 품질 좋은 썸네일을 만들어 보세요.',
  ARRAY['쿠팡', '썸네일', 'AI', '이커머스']::text[],
  'published',
  now(),
  '쿠팡 썸네일 완벽 가이드 — 규격·금지사항·AI 자동 생성 | Zeriv',
  '쿠팡 썸네일 공식 규격(1000px, 흰 배경), 금지 요소, AI로 자동 생성하는 방법까지. 클릭률을 높이는 쿠팡 썸네일 제작 완벽 가이드.',
  'Zeriv Team'
)
on conflict (slug) do nothing;
