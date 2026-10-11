-- Auto Style Mode — Phase 1
-- 2026-04-13
-- styles.type enum 에 'auto' 값 추가.
-- auto 타입은 AI가 즉석에서 생성한 일회성 스타일이며, 사용자가 명시적으로
-- "스타일 저장"을 누르기 전까지는 스튜디오의 스타일 목록(GET /styles)에서 숨김 처리한다.

ALTER TYPE style_type ADD VALUE IF NOT EXISTS 'auto';
