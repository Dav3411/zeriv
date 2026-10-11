-- job 하나에 이미지 2개(grok + gpt) 저장 지원
-- job_id 단일 유니크 → (job_id, r2_key) 복합 유니크로 교체
ALTER TABLE assets DROP CONSTRAINT brand_assets_job_id_key;
ALTER TABLE assets ADD CONSTRAINT assets_job_id_r2_key_key UNIQUE (job_id, r2_key);
