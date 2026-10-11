-- composition과 form_language는 스타일 시스템에서 제거됨.
-- 구도(composition)는 콘텐츠/템플릿 레벨에서 결정하기로 설계 변경.
ALTER TABLE styles DROP COLUMN IF EXISTS composition;
ALTER TABLE styles DROP COLUMN IF EXISTS form_language;
