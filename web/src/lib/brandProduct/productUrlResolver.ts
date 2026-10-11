import { getR2PublicUrl } from "@/lib/r2";
import type { BrandProductRow, ProductImage } from "./brandProduct.types";

/**
 * 제품 응답 직전 R2 key → public URL 변환.
 *
 * DB에는 이미지 참조가 두 가지 형태로 저장된다:
 *  1) R2 key (예: "products/<id>/hero.png") — public URL로 변환 필요
 *  2) Full HTTPS URL (레거시) — 그대로 사용
 *
 * GET, POST, PATCH, DELETE 응답이 모두 동일한 모양을 가져야 클라이언트가
 * mutation 응답을 그대로 캐시/렌더에 사용할 수 있다. 본 헬퍼는 그 일관성을
 * 보장하기 위해 모든 핸들러에서 반환 직전에 적용한다.
 *
 * 변환 규칙:
 *  - images[].url: r2_key가 있으면 getR2PublicUrl(r2_key), 없으면 url 원본
 *  - image_url:    image_r2_key가 있으면 getR2PublicUrl(image_r2_key), 없으면 image_url 원본
 *
 * 주의:
 *  - 입력을 mutate하지 않는다 (얕은 복사 + 새 images 배열).
 *  - getR2PublicUrl은 R2_PUBLIC_URL 미설정 시 7일 signed URL을 반환하므로
 *    mutation 응답에 들어가도 즉시 만료되지는 않는다.
 */
export async function resolveProductUrls<
  T extends Pick<BrandProductRow, "images" | "image_r2_key" | "image_url">,
>(product: T): Promise<T> {
  const images = await Promise.all(
    (product.images ?? []).map(async (img: ProductImage) => {
      if (!img.r2_key) return img;
      try {
        return { ...img, url: await getR2PublicUrl(img.r2_key) };
      } catch {
        return img;
      }
    }),
  );
  let image_url = product.image_url;
  if (product.image_r2_key) {
    try {
      image_url = await getR2PublicUrl(product.image_r2_key);
    } catch {
      // R2 실패 시 원본 url 유지
    }
  }
  return { ...product, images, image_url };
}
