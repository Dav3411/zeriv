/**
 * brand name 으로 사용 금지된 예약 슬러그 모음.
 *
 * 브랜드 슬러그는 URL `/[brandName]/...` 의 첫 세그먼트로 그대로 노출되므로
 * 라우팅 충돌과 보안 회피를 동시에 일으킬 수 있다. 다음 경로들과의 충돌을
 * 차단한다:
 *   - 게스트 진입점: `guest` (예약 슬러그, /guest/quick · /guest/studio)
 *   - 레거시 public 진입점: `quick`, `studio`
 *   - 인증·라우팅 시스템: `admin`, `api`, `auth`, `signup`, `login`, `onboarding`
 *   - 마케팅·정책 페이지: `pricing`, `explore`, `privacy`, `terms`
 *   - 정적 자산·Next 내부: `_next`, `favicon.ico`, `robots.txt`, `sitemap.xml`
 *
 * 비교는 정규화 후 수행한다 (NFKC + zero-width strip + 비표준 공백 정리 +
 * trim + lowercase). DB 에 brand name 이 어떤 케이스로 저장되든 라우팅은
 * lowercase 단일 매핑이어야 하며, 호모글리프·zero-width·NBSP 변종으로
 * 예약어 가드를 우회할 수 있어선 안 된다.
 *
 * Boundary:
 *   - 본 함수는 *예약어 매칭만* 본다. 길이·문자셋·UUID 변종 등의 형식 검증은
 *     호출자가 별도로 수행한다.
 *   - 입력값 자체는 mutate 하지 않는다. 정규화는 비교 시점에만 적용하며,
 *     DB 에 저장되는 원본 name 은 호출자가 그대로 보존한다.
 *   - 자동 슬러그 suffix 부여(`-1`, `-2` 등)는 호출자 책임.
 */
export const RESERVED_BRAND_SLUGS: ReadonlySet<string> = new Set([
  "guest",
  "studio",
  "quick",
  "admin",
  "api",
  "auth",
  "signup",
  "login",
  "onboarding",
  "pricing",
  "explore",
  "privacy",
  "terms",
  "robots.txt",
  "sitemap.xml",
  "_next",
  "favicon.ico",
]);

/**
 * 예약어 비교용 정규화 정규식 — `\uXXXX` escape 와 `RegExp` 생성자로 작성.
 *
 * 정규식 리터럴 안에 U+2028 LINE SEPARATOR / U+2029 PARAGRAPH SEPARATOR 를
 * raw 코드포인트로 넣으면 JS 파서가 line terminator 로 해석해 리터럴이
 * 깨진다 ("Unterminated regular expression"). 따라서 보이지 않는 문자는
 * 전부 escape 로 적고, 리터럴 대신 `RegExp` 생성자로 컴파일한다.
 * 모듈 스코프에서 1 회만 생성되므로 런타임 비용은 무시 가능.
 */

// zero-width / format 문자:
//   U+200B ZERO WIDTH SPACE
//   U+200C ZERO WIDTH NON-JOINER
//   U+200D ZERO WIDTH JOINER
//   U+2060 WORD JOINER
//   U+FEFF ZERO WIDTH NO-BREAK SPACE / BOM
//   U+180E MONGOLIAN VOWEL SEPARATOR (legacy zero-width)
const ZERO_WIDTH_RE = new RegExp(
  "[\\u200B-\\u200D\\u2060\\uFEFF\\u180E]",
  "g",
);

// 비표준 공백 → 일반 공백:
//   U+00A0 NO-BREAK SPACE
//   U+1680 OGHAM SPACE MARK
//   U+2000..U+200A 다양한 공백 (EN QUAD, EM QUAD, …, HAIR SPACE)
//   U+2028 LINE SEPARATOR
//   U+2029 PARAGRAPH SEPARATOR
//   U+202F NARROW NO-BREAK SPACE
//   U+205F MEDIUM MATHEMATICAL SPACE
//   U+3000 IDEOGRAPHIC SPACE
const NONSTANDARD_SPACE_RE = new RegExp(
  "[\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]",
  "g",
);

/**
 * 예약어 비교용 정규화.
 *
 * 호모글리프·zero-width·비표준 공백을 통한 가드 우회를 차단한다.
 * 정규화 순서:
 *   1) NFKC — 전각 `Ａ` (U+FF21) 같은 compatibility 문자를 ASCII 로 접는다.
 *      단, U+0261 `ɡ` 같은 별도 코드포인트는 NFKC 로 접히지 않으므로
 *      본 단계만으로는 모든 호모글리프를 막을 수 없다.
 *   2) zero-width / format 문자 strip — NFKC 로 흡수되지 않으므로 별도 제거.
 *      `ad​min` 우회 방어.
 *   3) 비표준 공백 → 일반 공백 — NBSP 등으로 양끝을 감싼 입력도 trim 으로
 *      잡히도록 정규화.
 *   4) trim + lowercase — 기존 정책.
 *
 * 한계: cross-script 호모글리프 (Cyrillic `а` 등) 는 NFKC 로 접히지
 * 않는다. 본 함수 범위 밖이며, `SAFE_BRAND_NAME_RE` 화이트리스트 도입 시
 * 추가 정밀 차단 가능.
 */
function normalizeForReservedCheck(name: string): string {
  let s = name.normalize("NFKC");
  s = s.replace(ZERO_WIDTH_RE, "");
  s = s.replace(NONSTANDARD_SPACE_RE, " ");
  return s.trim().toLowerCase();
}

export function isReservedBrandSlug(name: string): boolean {
  if (typeof name !== "string") return false;
  return RESERVED_BRAND_SLUGS.has(normalizeForReservedCheck(name));
}

/**
 * Brand name 화이트리스트 정규식 — 안전한 문자만 허용.
 *
 * 허용: 모든 언어의 글자(\p{L}), 숫자(\p{N}), 공백, 언더스코어, 하이픈.
 * 차단: zero-width, 제어문자, 이모지·기호, 슬래시·점·쿼리스트링 위험문자.
 *
 * Cross-script 호모글리프 (Cyrillic `а` 등) 는 \p{L} 에 포함되므로 본
 * 정규식만으로는 막을 수 없다. 본 정규식은 *URL 안전성* 과 *명백한 위험
 * 문자열 차단* 용이며, 호모글리프 정밀 차단은 별도 정책이 필요하다.
 *
 * 회귀 우려 (기존 DB 에 이미 저장된 brand name 과의 호환성) 때문에 현재
 * API 가드에서 즉시 사용하지는 않는다 — export 만 해 두고 후속 도입.
 */
export const SAFE_BRAND_NAME_RE = /^[\p{L}\p{N} _\-]+$/u;

/**
 * 예약어와 충돌하지 않는 brand name 으로 만든다.
 * 충돌 시 `-1`, `-2`, … 형식의 suffix 를 붙여 첫 번째 비충돌 후보를 반환.
 *
 * 무한 루프 방어로 최대 99 회까지만 시도하며, 그래도 충돌이면 입력에
 * 짧은 random suffix 를 붙여 반환한다.
 *
 * 입력은 mutate 하지 않는다 — 정규화는 `isReservedBrandSlug` 내부에서만
 * 적용되며, 반환되는 base/candidate 는 호출자가 받은 원본 문자열 기반이다.
 */
export function makeNonReservedBrandSlug(name: string): string {
  const base = name.trim();
  if (!base) return base;
  if (!isReservedBrandSlug(base)) return base;
  for (let i = 1; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (!isReservedBrandSlug(candidate)) return candidate;
  }
  // 이 코드 경로는 실무적으로 도달 불가 (예약어 목록이 작음). 방어적 fallback.
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}
