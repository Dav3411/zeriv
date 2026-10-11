import {
  generateStyleSheet,
  generateKeyVisual,
  isValidPalette,
  type PropSheetParams,
} from "./styleSheet";
import { dbGetStyle, dbUpdateStyle } from "./style.repository";
import { uploadBufferToR2, r2KeyToPublicUrl } from "@/lib/r2";

const R2_BUCKET = process.env.R2_BUCKET ?? "";

export interface StyleSheetPipelineResult {
  // 호출자 호환을 위해 public URL을 반환한다.
  // DB에는 R2 key만 저장되며, 반환 시점에 key → URL 변환한다.
  style_sheet_url: string;
  key_visual_url: string | null;
}

/**
 * 스타일 시트 + 키 비주얼 생성 파이프라인
 *
 * 1) Style 조회 (소유권 확인)
 * 2) Color swatch + prop sheet 합성 (generateStyleSheet)
 * 3) Key visual 생성 (generateKeyVisual) — style sheet를 참조 이미지로 사용
 * 4) 두 버퍼를 R2에 업로드
 * 5) DB에 R2 key만 저장 (public URL이 아닌 key)
 *
 * 키 비주얼 생성 실패는 치명적이지 않으므로 style_sheet key는 저장하고
 * key_visual key는 null로 남긴다.
 *
 * 호출자에게 반환하는 값은 바로 사용 가능한 public URL이다.
 */
/**
 * 권한 검증은 caller에서 선행해야 한다 (dbGetBrand 등).
 * userId 파라미터는 더 이상 사용하지 않지만 호출 호환을 위해 유지하고 실제 쿼리는 brandId로 수행한다.
 */
export async function runStyleSheetPipeline(
  brandId: string,
  styleId: string,
  _userId: string,
): Promise<StyleSheetPipelineResult> {
  const style = await dbGetStyle(styleId, brandId);
  if (!style) throw new Error("Style not found");

  const palette = style.color_palette;
  const propKeywords = style.prop_keywords ?? [];
  const hasPalette = isValidPalette(palette);
  const hasProps = propKeywords.length > 0;

  if (!hasPalette && !hasProps) {
    throw new Error(
      "color_palette and prop_keywords are both empty — cannot generate style sheet",
    );
  }

  const propParams: PropSheetParams = {
    propKeywords,
    moodKeywords: style.mood_keywords ?? [],
    lighting: style.lighting,
    texture: style.texture,
    scene: style.scene,
    colorPalette: style.color_palette,
  };

  // 1) Style sheet 생성
  const styleSheetBuffer = await generateStyleSheet(palette, propParams);

  // 2) Style sheet R2 업로드 (DB에는 key만 저장)
  const sheetKey = `brands/${brandId}/styles/${styleId}/style_sheet.png`;
  await uploadBufferToR2({
    bucket: R2_BUCKET,
    key: sheetKey,
    contentType: "image/png",
    body: styleSheetBuffer,
  });

  // 3) Key visual 생성 (실패 허용)
  let kvKey: string | null = null;
  try {
    const keyVisualBuffer = await generateKeyVisual(
      {
        color_palette: style.color_palette,
        lighting: style.lighting,
        texture: style.texture,
        mood_keywords: style.mood_keywords ?? [],
        scene: style.scene,
        prop_keywords: style.prop_keywords ?? [],
      },
      styleSheetBuffer,
    );

    const kvKeyCandidate = `brands/${brandId}/styles/${styleId}/key_visual.png`;
    await uploadBufferToR2({
      bucket: R2_BUCKET,
      key: kvKeyCandidate,
      contentType: "image/png",
      body: keyVisualBuffer,
    });
    kvKey = kvKeyCandidate;
  } catch (err) {
    console.error(
      "[styleSheetPipeline] key visual generation failed (continuing):",
      err,
    );
  }

  // 4) DB 업데이트 — URL이 아닌 R2 key 저장
  await dbUpdateStyle(styleId, brandId, {
    style_sheet_url: sheetKey,
    key_visual_url: kvKey,
  });

  // 5) 호출자에게는 즉시 사용 가능한 public URL로 반환
  return {
    style_sheet_url: r2KeyToPublicUrl(sheetKey),
    key_visual_url: kvKey ? r2KeyToPublicUrl(kvKey) : null,
  };
}
