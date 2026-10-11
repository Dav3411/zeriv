/**
 * QUICK 모드 풀 guest 흐름의 저장 게이트키퍼 (v4 — 저장 매체 native IndexedDB → localForage).
 *
 * 흐름:
 *   1) /quick (public) 에서 비로그인 사용자가 이미지 1~3장 업로드 + 행별 메타(형식·수량)
 *      입력 후 "생성" 클릭 → saveQuickGuestState() 로 localForage 에 직렬화
 *      → /signup?next=/quick&resume=1
 *   2) 가입/로그인 완료 → /quick?resume=1 → 브랜드 분기 → /[brand]/quick?resume=1
 *   3) 워크스페이스 quick 이 마운트 시 readAndConsumeQuickGuestState() 로 1회 복원 후 즉시 삭제.
 *
 * 저장 매체 결정 (v3 → v4 이후, native IndexedDB → localForage):
 *   - native IndexedDB 는 iOS Safari Private 모드에서 첫 put 이 DOMException 으로 실패하는
 *     알려진 버그가 있다. localForage 를 도입하면 IndexedDB 실패 시 자동으로 localStorage 로
 *     fallback 하여 모든 환경에서 일관된 동작을 보장한다.
 *   - driver 우선순위: IndexedDB → WebSQL → localStorage (localForage 기본값 그대로).
 *     명시적 setDriver 불필요.
 *   - localForage 는 Blob/Date/Number 등을 native 로 직렬화 가능. base64 변환 불필요.
 *
 * 저장 매체 결정 (런타임):
 *   - localForage 기본 driver 우선순위: IndexedDB → WebSQL → localStorage
 *   - 단, iOS Safari Private 의 WebKit Blob put 버그 (UnknownError: Error preparing Blob/File
 *     data to be stored in object store) 회피를 위해, 모듈 초기화 시 probeBlobIndexedDB() 로
 *     실제 Blob 저장 가능 여부를 한 번 검사한다. 실패 시 setDriver(LOCALSTORAGE) 로 강제 전환.
 *   - 이 probe 는 idempotent — 모든 saveQuickGuestState/readAndConsumeQuickGuestState 호출 시
 *     ensureCompatibleDriver() 를 통해 첫 호출 1회만 실행되고 이후 캐시됨.
 *
 * driver 별 합산 byte 가드:
 *   - IndexedDB driver 환경: quota 가 수십~수백MB+ 이므로 합산 byte 가드 없음.
 *   - localStorage driver 환경 (iOS Safari Private 등): quota ~5MB. 이 경우에만
 *     합산 byte 가드(FALLBACK_MAX_BYTES = 5MB)를 활성화해 too_large_fallback 반환.
 *   - driver 는 storage.ready() 이후 storage.driver() 로 확인 가능.
 *
 * 보안·견고성:
 *   - TTL 1시간 — 다른 세션이 남긴 stale state 가 되살아나지 않도록 차단.
 *   - mime 화이트리스트 + 매직넘버 검증(JPEG/PNG/WebP signature) — 사용자가 저장소를
 *     수동 조작해 SVG/HTML payload 를 image/png 로 위장하는 시나리오 차단. 저장 시점에
 *     blob.slice(0, 12).arrayBuffer() 로 검증, 읽을 때도 동일하게 재검증.
 *   - schema mismatch / 누락 필드 → 조용히 무시 + 삭제.
 *   - 이미지 Blob 은 클라이언트 메모리 + 로컬 저장소만 — 서버 전송 X.
 *
 * read+delete 원자성:
 *   - native IndexedDB 시절에는 get+delete 를 단일 readwrite 트랜잭션으로 원자적으로 처리.
 *   - localForage 는 단일 트랜잭션 API 가 없으므로 getItem → removeItem 을 순차 await.
 *   - 두 탭이 동시에 ?resume=1 로 진입하면 양쪽 모두 같은 state 를 소비할 수 있는
 *     race 가 이론적으로 존재한다. 그러나 TTL 이 짧고(1시간) consume-on-read 의도가
 *     있으므로 이 정도의 race 허용은 sessionStorage 시절 수준으로 감수한다.
 *
 * 스키마 버전: v4 그대로 유지. Blob 포맷 동일, driver 교체만 내부 구현 변경.
 *   localForage record: { v: 4, images: [{ mime, name, blob, format, count, gender? }, ...], savedAt }
 *   - images.length ≥ 1 (상한은 합산 byte 가드/quota 에 위임)
 *   - format ∈ "cutout" | "mood" | "model"
 *   - gender ∈ "female" | "male" — format === "model" 일 때만 의미 있음
 *   - count ∈ [1, 30]
 */

import localforage from "localforage";

/**
 * localForage 인스턴스 — 모듈 최상위에서 생성.
 * localForage 의 createInstance 는 import 자체는 SSR 안전하며,
 * 실제 driver 초기화는 첫 비동기 호출(storage.ready()) 시점에 발생한다.
 */
const storage = localforage.createInstance({
  name: "zeriv-quick-guest",
  storeName: "state",
  description: "Guest quick mode 임시 보관소",
  // driver 우선순위: IndexedDB → WebSQL → localStorage (localForage 기본값)
  // localForage 가 환경 호환되는 첫 driver 를 자동 선택
});

/** localStorage fallback 환경(iOS Safari Private 등)의 합산 byte 상한. */
const FALLBACK_MAX_BYTES = 5 * 1024 * 1024; // 5MB

export const QUICK_GUEST_STATE_VERSION = 4;
const QUICK_GUEST_TTL_MS = 60 * 60 * 1000; // 1 hour

/** 단일 레코드 키. */
const RECORD_KEY = "current";

/**
 * Guest mode 가 지원하는 형식.
 * v3에서 model 추가. processRenderQuickModelJob 은 face_sheet 없이
 * object_image_key + gender 만으로 동작하므로 게스트도 사용 가능.
 */
export type QuickGuestFormat = "cutout" | "mood" | "model";

/**
 * Quick 모드 이미지 장 수 상한 — 게스트/워크스페이스 공용.
 * 30장 초과 시 saveQuickGuestState 및 addImagesWithCompressionAndGuard 에서 거절.
 */
export const MAX_IMAGES_QUICK = 30;

/** 행별 수량 한도. workspace 의 ItemRow count 범위와 동기화. */
const MIN_COUNT = 1;
const MAX_COUNT = 30;

export interface QuickGuestImage {
  /** Blob.type 과 동일. "image/jpeg" / "image/png" / "image/webp" 만 허용. */
  mime: string;
  /** 원본 파일 이름 (디버깅·UX 표시용) */
  name: string;
  /** 원본 이미지 Blob. localForage 가 native 로 저장. */
  blob: Blob;
  /** 행별 형식 선택. cutout|mood|model. */
  format: QuickGuestFormat;
  /** 행별 생성 수량. 1~30. */
  count: number;
  /** 모델컷 전용 성별. format === "model" 일 때만 의미 있음. */
  gender?: "female" | "male";
}

export interface QuickGuestState {
  /** schema version — 향후 호환되지 않는 변경 시 mismatch 무시 */
  v: typeof QUICK_GUEST_STATE_VERSION;
  /** ≥1 장, ≤MAX_IMAGES_QUICK(30) 장. 빈 배열은 절대 저장되지 않음.
   *  localStorage fallback 환경에서는 합산 byte 가드(5MB)도 적용. */
  images: QuickGuestImage[];
  /** Date.now() — TTL 검증용 */
  savedAt: number;
}

const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function isQuickGuestFormat(v: unknown): v is QuickGuestFormat {
  return v === "cutout" || v === "mood" || v === "model";
}

function isQuickGuestGender(v: unknown): v is "female" | "male" {
  return v === "female" || v === "male";
}

/**
 * 매직넘버 검증 — Blob 의 첫 12바이트로 declared mime 과 실제 시그니처 일치 확인.
 *
 * 반환값: 시그니처가 declared mime 과 일치하면 true.
 * IO 실패(arrayBuffer reject 등)는 false 로 처리 — 위장 시도와 동일하게 거절.
 */
async function verifyMagicBytes(blob: Blob, declaredMime: string): Promise<boolean> {
  let bytes: Uint8Array;
  try {
    const buf = await blob.slice(0, 12).arrayBuffer();
    bytes = new Uint8Array(buf);
  } catch {
    return false;
  }
  if (bytes.length < 12) return false;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (declaredMime === "image/jpeg") return isJpeg;
  if (declaredMime === "image/png") return isPng;
  if (declaredMime === "image/webp") return isWebp;
  return false;
}

/**
 * iOS Safari Private 의 WebKit Blob put 버그 (UnknownError: Error preparing Blob/File
 * data to be stored in object store) 회피를 위한 능력 탐색.
 *
 * localForage 가 IndexedDB 를 선택한 환경에서, 작은 Blob 을 put 해보고 성공 여부 반환.
 * 실패 시 호출자(ensureCompatibleDriver)가 setDriver(LOCALSTORAGE) 로 강제 전환.
 *
 * probe 자체의 실패는 try/catch 로 흡수 — 호출자가 "false 반환 = IndexedDB Blob 저장 불가"
 * 로만 해석하면 충분.
 */
async function probeBlobIndexedDB(): Promise<boolean> {
  try {
    const probeKey = "__zeriv_blob_probe__";
    // 500KB 짜리 PNG 시그니처 + 패딩. 일반 사진 크기에 더 가까워 실패 패턴 잡을 확률 ↑.
    // iOS Safari Private 의 Blob IndexedDB 버그는 크기 의존적으로 나타나므로
    // 작은 Blob 은 통과하지만 수백 KB 는 실패하는 케이스를 사전 감지할 수 있다.
    const head = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const padding = new Uint8Array(500 * 1024);
    const probeBlob = new Blob([head, padding], { type: "image/png" });
    await storage.setItem(probeKey, probeBlob);
    await storage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * driver 호환성 확인 + 필요 시 localStorage 강제 전환.
 *
 * - 모든 saveQuickGuestState / readAndConsumeQuickGuestState 진입점에서 호출.
 * - Promise 캐시(driverProbeResult)로 첫 호출 1회만 실제 probe 수행, 이후는 즉시 resolve.
 * - IndexedDB driver 가 선택된 경우에만 probe — WebSQL/localStorage 환경은 Blob 호환성
 *   검증 불필요.
 * - probe 실패 시 setDriver(LOCALSTORAGE) — 이후의 setItem/getItem 은 모두 localStorage 로
 *   향한다. probe 가 IndexedDB 에 임시 키를 남겼더라도 driver 전환 후 호출되지 않으므로
 *   사용자 데이터에 영향 없음.
 *
 * 캐시 정책:
 *   - 성공·실패 모두 캐시. driver 가 런타임에 바뀌는 상황은 가정하지 않는다 (모듈 lifecycle 단위).
 *   - probe 자체가 throw 한 경우에도 (probeBlobIndexedDB 의 catch 로 false 반환)
 *     ensureCompatibleDriver 는 정상 resolve 한다.
 */
let driverProbeResult: Promise<void> | null = null;

async function ensureCompatibleDriver(): Promise<void> {
  if (driverProbeResult) return driverProbeResult;
  driverProbeResult = (async () => {
    await storage.ready();
    const currentDriver = storage.driver();
    if (currentDriver !== localforage.INDEXEDDB) return;

    const blobOk = await probeBlobIndexedDB();
    if (blobOk) return;

    // iOS Safari Private 의 WebKit Blob put 버그 확인. localStorage 로 전환.
    // setDriver 실패는 무시 — 후속 setItem 이 실패하면 정상 reason(encode_failed/quota_exceeded)
    // 으로 떨어진다.
    try {
      await storage.setDriver(localforage.LOCALSTORAGE);
      await storage.ready();
    } catch {
      // 전환 실패 시 IndexedDB 그대로 유지. 후속 setItem 의 실패가 사용자에게 노출됨.
    }
  })();
  return driverProbeResult;
}

/**
 * 현재 활성 driver 에 따라 합산 byte 상한을 반환.
 * localStorage driver 환경에서만 FALLBACK_MAX_BYTES(5MB) 반환.
 * IndexedDB / WebSQL driver 에서는 null (제한 없음).
 *
 * 호출 전에 반드시 `ensureCompatibleDriver()` 가 완료되어야 하며, 외부 진입점에서
 * await 로 보장한다. 직접 호출 시에도 storage.ready() 가 driver 선택을 마칠 때까지 대기.
 */
async function getEffectiveMaxBytes(): Promise<number | null> {
  await ensureCompatibleDriver();
  await storage.ready();
  const driver = storage.driver();
  // localforage.LOCALSTORAGE === "localStorageWrapper" (localforage v1.x 상수)
  if (driver === localforage.LOCALSTORAGE) {
    return FALLBACK_MAX_BYTES;
  }
  return null;
}

/**
 * 게스트 사전 검증용 외부 헬퍼.
 * - 반환값 number: localStorage fallback 환경에서 적용되는 합산 byte 상한(=5MB).
 *   호출자는 "기존 변환본들 합산 + 새 변환본"이 이 값을 초과하면 해당 이미지를 거절해야 한다.
 * - 반환값 null: IndexedDB 등 quota 가 넉넉한 driver 환경 — 사전 검증 불필요.
 * - SSR/import 안전. 첫 호출에서 `ensureCompatibleDriver()` 가 driver 선택을 마칠 때까지 대기.
 */
export async function getGuestFallbackLimit(): Promise<number | null> {
  return getEffectiveMaxBytes();
}

/**
 * 레코드 1개를 quietly 삭제. fire-and-forget — 호출자는 결과를 확인할 필요 없음.
 * void 반환을 유지한다 (sessionStorage 시절 시그니처 호환).
 */
export function clearQuickGuestState(): void {
  // 의도적 fire-and-forget. 실패해도 사용자 흐름과 무관하므로 swallow.
  storage.removeItem(RECORD_KEY).catch(() => {});
}

export interface SaveQuickGuestImageInput {
  file: File;
  format: QuickGuestFormat;
  count: number;
  /** format === "model" 일 때 필수. 다른 형식에서는 무시됨. */
  gender?: "female" | "male";
}

export interface SaveQuickGuestStateInput {
  images: SaveQuickGuestImageInput[];
}

export type SaveQuickGuestStateResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "unsupported_mime"
        | "encode_failed"
        | "quota_exceeded"
        | "no_images"
        | "too_many"
        | "too_large_fallback";
    };

/**
 * 이미지 ≥1장을 localForage 에 Blob 그대로 저장. 장 수 상한은 코드 상수로 강제하지 않는다.
 *
 * 검증 순서 (저렴한 것부터):
 *   1) length 가드          → no_images
 *   2) mime 화이트리스트    → unsupported_mime
 *   3) format/count/gender  → encode_failed
 *   4) 매직넘버 검증        → unsupported_mime (위장 거절)
 *   5) driver 확인 + byte 가드 (localStorage fallback 시 5MB 상한) → too_large_fallback
 *   6) setItem              → quota_exceeded / encode_failed
 *
 * NOTE:
 *   - localForage 환경에서 no_storage 는 사실상 발생하지 않는다. localForage 가 SSR 에서
 *     import 는 안전하며, window 미존재 환경의 실패는 setItem 에서 quota_exceeded/encode_failed 로 흡수.
 *   - too_large_fallback: localStorage driver fallback 환경 한정 5MB 초과 시 반환.
 *     일반 IndexedDB 환경에서는 절대 반환되지 않는다.
 *   - 입력 mime 화이트리스트는 image/jpeg|png|webp 유지. 현재 quick 모드 진입점에서 모든
 *     이미지가 WebP 로 변환된 뒤 들어오지만, 워커/미래 호출자 호환을 위해 셋 다 허용한다.
 */
export async function saveQuickGuestState(
  input: SaveQuickGuestStateInput,
): Promise<SaveQuickGuestStateResult> {
  // 첫 호출 시 IndexedDB Blob put 능력 탐색 + 필요 시 localStorage 전환.
  // 캐시되어 있으므로 두 번째 호출부터는 즉시 resolve.
  await ensureCompatibleDriver();

  const { images } = input;
  if (!Array.isArray(images) || images.length === 0) {
    return { ok: false, reason: "no_images" };
  }
  if (images.length > MAX_IMAGES_QUICK) {
    return { ok: false, reason: "too_many" };
  }

  // mime + count + format + gender sanity (각 행 독립 검증)
  for (const img of images) {
    if (!SUPPORTED_MIME.has(img.file.type)) {
      return { ok: false, reason: "unsupported_mime" };
    }
    if (!isQuickGuestFormat(img.format)) {
      return { ok: false, reason: "encode_failed" };
    }
    // model 형식은 gender 가 "female" | "male" 이어야 함.
    if (img.format === "model" && !isQuickGuestGender(img.gender)) {
      return { ok: false, reason: "encode_failed" };
    }
    if (
      typeof img.count !== "number" ||
      !Number.isFinite(img.count) ||
      img.count < MIN_COUNT ||
      img.count > MAX_COUNT
    ) {
      return { ok: false, reason: "encode_failed" };
    }
  }

  // 매직넘버 검증 — 저장 시점에 declared mime 과 실제 시그니처 일치 확인.
  // 저장소 직접 조작 우회는 read 시점에 한 번 더 검증되지만, 저장 시 거절이 UX 상 안전.
  for (const img of images) {
    const magicOk = await verifyMagicBytes(img.file, img.file.type);
    if (!magicOk) {
      return { ok: false, reason: "unsupported_mime" };
    }
  }

  // QuickGuestImage 모양으로 정규화. Blob 은 localForage 가 native 로 저장.
  const normalized: QuickGuestImage[] = images.map((img) => ({
    mime: img.file.type,
    // 저장 시점에도 name 가드 — 제어 문자 또는 255자 초과 시 기본값으로 대체.
    name:
      img.file.name &&
      img.file.name.length <= 255 &&
      !/[\x00-\x1F\x7F]/.test(img.file.name)
        ? img.file.name
        : "upload",
    blob: img.file,
    format: img.format,
    count: img.count,
    // gender 는 model 형식일 때만 저장. 다른 형식에서는 필드 자체를 생략.
    ...(img.format === "model" ? { gender: img.gender } : {}),
  }));

  const state: QuickGuestState = {
    v: QUICK_GUEST_STATE_VERSION,
    images: normalized,
    savedAt: Date.now(),
  };

  // driver 별 합산 byte 가드.
  // localStorage driver 환경(iOS Safari Private 등)에서만 활성화.
  let maxBytes: number | null;
  try {
    maxBytes = await getEffectiveMaxBytes();
  } catch {
    return { ok: false, reason: "encode_failed" };
  }

  if (maxBytes !== null) {
    // img.file.size 는 원본 Blob 크기. localForage 가 structured clone 으로 직렬화하면
    // 실제 저장 크기는 약간 더 커질 수 있어 setItem 시점의 quota_exceeded 가 이중 방어.
    const totalBytes = images.reduce((sum, img) => sum + img.file.size, 0);
    if (totalBytes > maxBytes) {
      return { ok: false, reason: "too_large_fallback" };
    }
  }

  try {
    await storage.setItem(RECORD_KEY, state);
    return { ok: true };
  } catch (err) {
    // iOS Safari Private 의 WebKit Blob IndexedDB 버그 회피 — probe 가 통과했더라도
    // 실제 사진 크기(수백 KB)에서 setItem 이 실패하는 크기 의존적 패턴 대응.
    // driver 가 IndexedDB 였다면 localStorage 로 강제 전환 후 1회 재시도.
    const driverBeforeRetry = storage.driver();
    let retryErr: unknown = null;

    if (driverBeforeRetry === localforage.INDEXEDDB) {
      try {
        await storage.setDriver(localforage.LOCALSTORAGE);
        await storage.ready();
        // setDriver 성공 → 캐시를 즉시 resolved Promise 로 교체.
        // 이후 ensureCompatibleDriver() 호출이 새 driver 상태를 빠르게 통과하도록.
        driverProbeResult = Promise.resolve();

        // localStorage 환경에서는 5MB 한도 재검사 필요.
        // 합산이 초과하면 setItem 전에 명확한 reason 으로 종료.
        const fallbackMax = await getEffectiveMaxBytes();
        if (fallbackMax !== null) {
          const totalBytes = images.reduce((sum, img) => sum + img.file.size, 0);
          if (totalBytes > fallbackMax) {
            clearQuickGuestState();
            return { ok: false, reason: "too_large_fallback" };
          }
        }

        await storage.setItem(RECORD_KEY, state);
        return { ok: true };
      } catch (e) {
        retryErr = e;
      }
    }

    // 원본 에러 또는 retry 에러 기준으로 reason 분류.
    clearQuickGuestState();
    const finalErr = retryErr ?? err;
    const errName =
      finalErr && typeof finalErr === "object" && "name" in finalErr
        ? String((finalErr as { name?: unknown }).name)
        : "";

    if (errName === "QuotaExceededError") {
      return { ok: false, reason: "quota_exceeded" };
    }
    return { ok: false, reason: "encode_failed" };
  }
}

/**
 * 저장된 guest state 를 1회 읽고 즉시 삭제.
 *
 * read+delete 원자성:
 *   - localForage 는 단일 트랜잭션 API 가 없으므로 getItem 직후 removeItem 을 순차 await.
 *   - 두 탭이 동시에 ?resume=1 로 진입하면 양쪽 모두 같은 state 를 소비할 수 있는
 *     race 가 이론적으로 존재한다. TTL 이 짧고(1시간) 단기 임시 보관용이므로
 *     이 수준의 race 는 허용한다 (sessionStorage 시절과 동등 수준).
 *   - removeItem 은 getItem 직후 즉시 await — 검증 실패 케이스에서도 이미 consume 된 상태.
 *     consume-on-read 의도이자 조작된 레코드의 재소비 방지.
 *
 * 폐기 트리거 (한 가지라도 깨지면 null 반환):
 *   - v !== 4 (v=1/v=2/v=3 잔재는 자동 폐기)
 *   - TTL 만료 / 시스템 시각 역행
 *   - images 가 배열이 아니거나 길이 < 1 (상한 없음 — 저장 시점에 합산 byte/quota 로 자연 제한)
 *   - 어느 한 image 의 mime / name / blob / format / count / gender 검증 실패
 *   - 매직넘버 위장 (Blob 의 첫 12바이트가 declared mime 과 불일치)
 */
export async function readAndConsumeQuickGuestState(): Promise<QuickGuestState | null> {
  // 저장 경로와 동일한 driver 선택을 보장 — 저장 시 localStorage 였다면 읽기도 localStorage.
  await ensureCompatibleDriver();

  let raw: unknown;
  try {
    raw = await storage.getItem<unknown>(RECORD_KEY);
    // read 직후 즉시 삭제. 검증 전이지만 consume-on-read 의도를 유지하기 위해
    // 검증 결과와 무관하게 선제 삭제한다.
    await storage.removeItem(RECORD_KEY);
  } catch {
    return null;
  }

  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  if (o.v !== QUICK_GUEST_STATE_VERSION) return null;
  if (typeof o.savedAt !== "number" || !Number.isFinite(o.savedAt)) return null;

  // TTL — 시계가 거꾸로 가는(시스템 시간 변경) 케이스도 만료로 처리.
  const age = Date.now() - o.savedAt;
  if (age < 0 || age > QUICK_GUEST_TTL_MS) return null;

  if (!Array.isArray(o.images)) return null;
  if (o.images.length < 1) return null;

  const validated: QuickGuestImage[] = [];

  for (const item of o.images) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;

    if (typeof r.mime !== "string" || !SUPPORTED_MIME.has(r.mime)) return null;

    // name 필드 강화 검증 — 제어 문자 포함 또는 과도하게 긴 이름 거절.
    if (
      typeof r.name !== "string" ||
      r.name.length > 255 ||
      /[\x00-\x1F\x7F]/.test(r.name)
    ) {
      return null;
    }

    // Blob 인스턴스 검증 — 다른 타입이 들어왔으면 위장 또는 손상.
    if (!(r.blob instanceof Blob)) return null;

    if (!isQuickGuestFormat(r.format)) return null;
    // model 형식은 gender 필드가 반드시 "female" | "male" 이어야 함.
    if (r.format === "model" && !isQuickGuestGender(r.gender)) return null;
    if (
      typeof r.count !== "number" ||
      !Number.isFinite(r.count) ||
      r.count < MIN_COUNT ||
      r.count > MAX_COUNT
    ) {
      return null;
    }

    // 매직넘버 재검증 — 저장소 수동 조작으로 Blob 을 SVG/HTML 로 교체했을 가능성 차단.
    const ok = await verifyMagicBytes(r.blob, r.mime);
    if (!ok) return null;

    validated.push({
      mime: r.mime,
      name: r.name || "upload",
      blob: r.blob,
      format: r.format,
      count: r.count,
      // gender 는 model 형식일 때만 포함. 다른 형식은 필드 생략.
      ...(r.format === "model" ? { gender: r.gender as "female" | "male" } : {}),
    });
  }

  return {
    v: QUICK_GUEST_STATE_VERSION,
    images: validated,
    savedAt: o.savedAt,
  };
}

/**
 * Guest image 의 Blob → File 객체 복원. 시그니처는 sessionStorage 시절과 동일.
 *
 * Blob 은 File 의 부모 타입이지만 name/lastModified 가 없으므로 `new File()` 로 감싼다.
 * 입력 blob 이 이미 File 인 경우에도 새 File 인스턴스를 만들어 name 을 보존한다
 * (저장 시점의 `img.file.name` 이 휘발성 검증을 통과한 정상 이름이라 신뢰 가능).
 *
 * 사용: 호출자는 `state.images.map(quickGuestStateToFile)` 형태로 단일 이미지 단위 변환.
 */
export function quickGuestStateToFile(image: QuickGuestImage): File {
  return new File([image.blob], image.name || "upload", {
    type: image.mime,
  });
}
