"use client";

/**
 * 클라이언트 이미지 압축 유틸 — Quick 모드(게스트/워크스페이스 공용) 진입점에서
 * 사용자가 추가한 이미지를 저장/업로드 전에 균질한 WebP(또는 JPEG) 로 변환한다.
 *
 * 결정 사항(상위 스펙):
 *   - 긴 변 1600px (비율 유지). 원본이 1600 이하여도 무조건 재인코딩.
 *   - 출력 mime: image/webp (지원 시) → image/jpeg fallback (iOS 16 이하 등 WebP 인코딩 미지원 환경).
 *   - 입력 mime 화이트리스트: image/jpeg | image/png | image/webp. 그 외는 throw.
 *   - 변환 실패 = throw. 호출자가 잡아서 토스트 처리 (모든 fallback 소진 후 진짜 실패만).
 *
 * 워커 호환성:
 *   - 워크스페이스 `worker.mjs` 의 `resizeForApi()` 가 1024px 다운샘플을 추가로
 *     수행하므로 1600px 입력은 안전. WebP 입력 또한 GPT Image 2 파이프라인이 수용.
 *   - JPEG fallback 산출물(image/jpeg) 도 워커 파이프라인이 수용한다.
 *   - 따라서 입력 mime/크기 정규화로 인한 결과 품질 회귀는 없다.
 *
 * 보안/메모리:
 *   - createImageBitmap 의 imageOrientation: "from-image" 로 EXIF orientation 보존.
 *   - createImageBitmap 실패 시 <img> + URL.createObjectURL fallback 사용.
 *     이 경로에서는 EXIF orientation 이 자동 적용되지 않을 수 있음 — 모바일 Safari 는
 *     CSS image-orientation: from-image 가 기본이므로 실질적 영향은 미미하나,
 *     일부 환경(데스크톱 WebView 등)에서 회전 누락 가능성 존재. 허용 trade-off.
 *   - bitmap.close() 또는 URL.revokeObjectURL() 을 cleanup 콜백으로 명시 호출.
 *   - SSR 가드: typeof window === "undefined" 면 throw (이 함수는 클라이언트 전용).
 *   - 매직넘버 검증은 호출자(quickGuestState 저장 경로)에서 그대로 유효 — 본 함수는
 *     File.type 만 신뢰. 변환 결과는 canvas API 가 생성하므로 시그니처 신뢰 가능.
 */

const MAX_DIM = 1600;
const WEBP_QUALITY = 0.85;
const JPEG_QUALITY = 0.85;

const ALLOWED_INPUT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * canvas.toBlob 의 Promise 래퍼. OffscreenCanvas 가 없는 환경에서만 사용.
 * null 반환은 인코딩 실패로 간주.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("canvas.toBlob returned null"));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

/** decode() 반환 인터페이스 — createImageBitmap 경로와 <img> 경로를 통일 */
interface DecodeResult {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** 반드시 finally 에서 호출. bitmap.close() 또는 URL.revokeObjectURL() 역할. */
  cleanup: () => void;
}

/**
 * <img> + URL.createObjectURL 을 이용한 이미지 디코드.
 * createImageBitmap 이 실패했을 때(iOS Safari 메모리 부족 등) 의 2차 경로.
 *
 * EXIF orientation 은 CSS/브라우저 기본값에 의존 — 보장하지 않음.
 */
async function decodeViaImg(file: File): Promise<DecodeResult> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("img load failed"));
      img.src = url;
    });
    // decode() 로 픽셀 데이터가 실제로 준비되도록 보장 (미지원 환경에선 무시).
    try {
      await img.decode();
    } catch {
      // decode() 미지원 / 이미 완료된 경우 무시
    }
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      throw new Error(
        `decoded image has invalid dimensions ${img.naturalWidth}x${img.naturalHeight}`,
      );
    }
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * 이미지 디코드 — createImageBitmap 1차, <img> fallback 2차.
 */
async function decode(file: File): Promise<DecodeResult> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => {
        try {
          bitmap.close();
        } catch {
          // 이미 닫힌 경우 무시
        }
      },
    };
  } catch {
    // createImageBitmap 실패 (iOS Safari 메모리 부족, 옵션 미지원 등) → <img> fallback
    return decodeViaImg(file);
  }
}

/**
 * canvas 컨텍스트에서 지정 mime 으로 인코딩. OffscreenCanvas 우선, HTMLCanvasElement fallback.
 * WebP / JPEG 두 포맷 모두 동일 경로로 처리.
 */
async function encodeCanvas(
  source: CanvasImageSource,
  dstW: number,
  dstH: number,
  mime: string,
  quality: number,
): Promise<Blob> {
  const hasOffscreen =
    typeof OffscreenCanvas !== "undefined" &&
    typeof (OffscreenCanvas.prototype as unknown as {
      convertToBlob?: unknown;
    }).convertToBlob === "function";

  if (hasOffscreen) {
    const oc = new OffscreenCanvas(dstW, dstH);
    const ctx = oc.getContext("2d");
    if (!ctx) throw new Error("OffscreenCanvas getContext('2d') returned null");
    ctx.drawImage(source, 0, 0, dstW, dstH);
    return oc.convertToBlob({ type: mime, quality });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas getContext('2d') returned null");
    ctx.drawImage(source, 0, 0, dstW, dstH);
    return canvasToBlob(canvas, mime, quality);
  }
}

/**
 * 단일 이미지 압축. 입력 File → WebP(또는 JPEG fallback) File.
 *
 * 처리 순서:
 *   1) SSR / mime 검증
 *   2) decode() — createImageBitmap → <img> fallback
 *   3) 긴 변 1600 기준 비율 계산
 *   4) encodeCanvas() — WebP 1차 시도
 *      - blob.type === "image/webp" → 성공
 *      - 그 외 (iOS 16 이하 silent fallback) → JPEG 0.85 로 재시도
 *   5) WebP 인코딩 중 예외 throw 시에도 JPEG 재시도
 *   6) JPEG 도 blob.type !== "image/jpeg" 이면 그제야 throw
 *   7) Blob → File (mime/확장자는 실제 인코딩 포맷에 맞게 동적 결정)
 *
 * 실패 시 throw — 호출자에서 잡아 사용자에게 토스트로 알린다.
 */
export async function compressImage(file: File): Promise<File> {
  if (typeof window === "undefined") {
    throw new Error("compressImage must run in the browser");
  }
  if (!ALLOWED_INPUT_MIME.has(file.type)) {
    throw new Error(`unsupported input mime: ${file.type || "(none)"}`);
  }

  // 1) 디코딩
  const decoded = await decode(file);

  try {
    const { source, width: srcW, height: srcH } = decoded;

    if (srcW <= 0 || srcH <= 0) {
      throw new Error(`decoded image has invalid dimensions ${srcW}x${srcH}`);
    }

    // 2) 긴 변 1600 기준 비율 계산
    const longest = Math.max(srcW, srcH);
    const scale = longest > MAX_DIM ? MAX_DIM / longest : 1;
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));

    // 3) WebP 인코딩 1차 시도, JPEG fallback 2차
    let blob: Blob;
    let usedMime: "image/webp" | "image/jpeg";

    // WebP 시도 — 예외 throw 또는 mime 불일치 모두 JPEG fallback 으로 처리
    let webpBlob: Blob | null = null;
    try {
      webpBlob = await encodeCanvas(source, dstW, dstH, "image/webp", WEBP_QUALITY);
    } catch {
      // iOS 16 이하 등 WebP 인코딩 자체가 throw → JPEG fallback 으로 이어짐
    }

    if (webpBlob && webpBlob.type === "image/webp" && webpBlob.size > 0) {
      blob = webpBlob;
      usedMime = "image/webp";
    } else {
      // WebP 실패 (예외 or silent mime fallback) → JPEG 0.85 재시도
      const jpegBlob = await encodeCanvas(
        source,
        dstW,
        dstH,
        "image/jpeg",
        JPEG_QUALITY,
      );
      if (!jpegBlob || jpegBlob.size === 0) {
        throw new Error("JPEG encode returned empty blob");
      }
      if (jpegBlob.type !== "image/jpeg") {
        throw new Error(`JPEG encode produced wrong mime: ${jpegBlob.type}`);
      }
      blob = jpegBlob;
      usedMime = "image/jpeg";
    }

    // 4) File 로 wrap — 확장자/mime 은 실제 인코딩 포맷에 맞게 결정
    const base = file.name.replace(/\.[^./\\]+$/, "");
    const safeBase = base.length > 0 ? base : "image";
    const ext = usedMime === "image/webp" ? "webp" : "jpg";
    const outName = `${safeBase}.${ext}`;

    return new File([blob], outName, {
      type: usedMime,
      lastModified: Date.now(),
    });
  } finally {
    // 메모리/URL 해제 — throw 경로에서도 반드시 실행
    decoded.cleanup();
  }
}
