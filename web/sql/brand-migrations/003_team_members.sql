-- 003_team_members.sql
-- 팀원 초대 기능: brand_members에 role 추가, brand_invitations 신설

-- 1. brand_members 테이블 생성 (없는 경우)
CREATE TABLE IF NOT EXISTS brand_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (brand_id, user_id)
);

CREATE INDEX IF NOT EXISTS brand_members_brand_id_idx ON brand_members(brand_id);
CREATE INDEX IF NOT EXISTS brand_members_user_id_idx ON brand_members(user_id);

ALTER TABLE brand_members ENABLE ROW LEVEL SECURITY;

-- 1b. role 컬럼 추가
ALTER TABLE brand_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('owner', 'member'));

-- 2. 기존 owner 업데이트: brands.user_id와 일치하는 brand_members row는 owner
UPDATE brand_members bm
SET role = 'owner'
FROM brands b
WHERE bm.brand_id = b.id AND bm.user_id = b.user_id;

-- 3. brand_invitations 테이블 신설
CREATE TABLE IF NOT EXISTS brand_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  invitee_email text NOT NULL,
  token         text NOT NULL UNIQUE,
  invited_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz
);

CREATE INDEX IF NOT EXISTS brand_invitations_token_idx ON brand_invitations(token);
CREATE INDEX IF NOT EXISTS brand_invitations_brand_id_idx ON brand_invitations(brand_id);

-- 4. RLS
ALTER TABLE brand_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_invitations: owner can manage"
  ON brand_invitations FOR ALL
  USING (
    invited_by = auth.uid()
    OR brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
  );
