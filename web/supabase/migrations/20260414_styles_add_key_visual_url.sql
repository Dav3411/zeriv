-- key_visual_url: Gemini로 생성한 키 비주얼(대표 상품 이미지) URL
ALTER TABLE styles ADD COLUMN IF NOT EXISTS key_visual_url text;
