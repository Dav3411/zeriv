// ESM 모듈, sharp 사용
import sharp from "sharp";

/**
 * 워터마크 적용 여부 판단
 *
 * 시장 진입 단계 정책 (M0+): **모든 플랜에서 워터마크 미적용**.
 * - 쿠팡 셀러가 워터마크 있는 썸네일을 못 쓰면 entry tier 가치 0
 * - Atelier 업셀은 스타일 5개·AI 모델·생성 150장 차이로 충분
 * - 재활성 시: plans-brand.ts watermark 필드 + 여기서 plan별 분기 추가
 */
export async function shouldApplyWatermark(/* supabase, brandId */) {
  return false;
}

/**
 * 워터마크 SVG 생성
 * - 이미지 너비에 비례한 크기 (12%)
 * - 반투명 흰색 텍스트 + 어두운 그림자
 */
function buildWatermarkSvg(width) {
  const wmWidth = Math.max(120, Math.round(width * 0.12));
  const fontSize = Math.round(wmWidth * 0.28);
  const svgHeight = Math.round(fontSize * 1.6);
  return {
    svg: `<svg width="${wmWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
      <feOffset dx="0" dy="1" result="offsetblur" />
      <feFlood flood-color="#000000" flood-opacity="0.6" />
      <feComposite in2="offsetblur" operator="in" />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <text x="50%" y="60%" font-family="Inter, system-ui, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="#ffffff" fill-opacity="0.85"
        text-anchor="middle" filter="url(#shadow)" letter-spacing="0.04em">
    Zeriv
  </text>
</svg>`,
    wmWidth,
    svgHeight,
  };
}

/**
 * 이미지 buffer에 워터마크 적용
 * 우측 하단에 마진을 두고 배치 (left/top 좌표 방식 — gravity+offset 조합 버전 이슈 우회)
 */
export async function applyWatermark(imageBuffer) {
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const { svg, wmWidth, svgHeight } = buildWatermarkSvg(width);
  const margin = Math.round(width * 0.02); // 가로 2% 마진

  const left = Math.max(0, width - wmWidth - margin);
  const top = Math.max(0, height - svgHeight - margin);

  return sharp(imageBuffer)
    .composite([
      {
        input: Buffer.from(svg),
        left,
        top,
      },
    ])
    .png()
    .toBuffer();
}

/**
 * 한 번의 호출로 판단+적용을 처리하는 헬퍼
 * 워터마크 적용 실패 시 원본 buffer를 그대로 반환 (이미지 생성을 막지 않음)
 */
export async function applyWatermarkIfNeeded(supabase, brandId, imageBuffer) {
  try {
    const should = await shouldApplyWatermark(supabase, brandId);
    if (!should) return imageBuffer;
    return await applyWatermark(imageBuffer);
  } catch (err) {
    console.warn("[watermark] failed, returning original:", err?.message ?? err);
    return imageBuffer;
  }
}
