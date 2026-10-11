-- style_sheet_url: Gemini로 생성한 스타일 시트 이미지 URL
ALTER TABLE styles ADD COLUMN IF NOT EXISTS style_sheet_url text;
