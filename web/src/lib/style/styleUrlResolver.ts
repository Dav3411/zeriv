import { r2KeyToPublicUrl } from "@/lib/r2";
import type { Style } from "./style.types";

/**
 * DB에 저장된 값이 이미 완성된 URL인지 판별.
 * 마이그레이션 이전 레거시 행은 URL로 저장되어 있을 수 있으므로
 * key → URL 변환 전에 방어적으로 확인한다.
 *
 * 다른 API 라우트에서도 동일한 판별 로직이 필요하므로 export하여 재사용한다.
 */
export function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

/**
 * 단일 값(R2 key 또는 legacy URL) → public URL.
 * - 이미 URL이면 그대로 반환 (레거시 데이터 호환)
 * - key이면 r2KeyToPublicUrl로 변환
 * - R2_PUBLIC_URL 미설정 개발 환경에서는 key 원문 반환 (fallback)
 *   production에서는 r2KeyToPublicUrl가 throw하여 계약 위반을 명시적으로 표면화해야 하지만,
 *   API 레이어에서는 스타일 조회가 전체 500으로 번지지 않도록 방어한다.
 */
function resolveOne(value: string | null): string | null {
  if (!value) return null;
  if (isHttpUrl(value)) return value;
  try {
    return r2KeyToPublicUrl(value);
  } catch {
    return value;
  }
}

/**
 * Style 레코드의 이미지 필드(key_visual_url, style_sheet_url, example_images)를
 * API 응답용 public URL로 변환한다.
 *
 * 저장 계약:
 * - key_visual_url, style_sheet_url: 신규 데이터는 R2 key, 레거시는 https URL
 * - example_images: 신규 데이터는 R2 key, 레거시는 https URL
 *
 * 방어 전략:
 * - startsWith("http") 체크로 이미 URL인 값은 변환하지 않음
 * - 마이그레이션이 끝나기 전까지 key/URL 혼재 상태를 안전하게 다룬다
 */
export function resolveStyleUrls<
  T extends Pick<
    Style,
    "key_visual_url" | "style_sheet_url" | "example_images"
  >,
>(style: T): T {
  return {
    ...style,
    key_visual_url: resolveOne(style.key_visual_url),
    style_sheet_url: resolveOne(style.style_sheet_url),
    // example_images도 resolveOne과 동일 fallback 정책 (개발 환경 안전성 확보)
    example_images: (style.example_images ?? [])
      .map((img) => resolveOne(img))
      .filter((img): img is string => img !== null),
  };
}

/**
 * Style 배열을 한 번에 변환. API 목록 응답용.
 */
export function resolveStyleListUrls<
  T extends Pick<
    Style,
    "key_visual_url" | "style_sheet_url" | "example_images"
  >,
>(styles: T[]): T[] {
  return styles.map(resolveStyleUrls);
}
