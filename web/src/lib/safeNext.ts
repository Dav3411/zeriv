/**
 * `next` redirect 파라미터 검증 — open-redirect (CWE-601) 방어.
 *
 * 허용: same-origin root-relative path (예: `/quick`, `/onboarding?next=/x`)
 * 차단:
 *   - 절대 URL (https://evil.com)
 *   - protocol-relative (//evil.com)
 *   - 백슬래시 변종 (/\evil.com) — 일부 프록시·브라우저가 / 로 정규화 가능
 *   - javascript:, data:, file: 등 위험 프로토콜
 *   - 빈 문자열·null·undefined
 *
 * 실패 시 빈 문자열 반환 — 호출 측에서 fallback path 선택.
 *
 * 사용처 (검증 일관성 유지를 위해 모든 redirect 진입점에서 이 헬퍼 사용):
 *   - signup/page.tsx — 가입 후 `next` 보존 redirect
 *   - login/page.tsx — 로그인 후 `next` 보존 redirect
 *   - onboarding/page.tsx — 온보딩 분기에서 `nextPath` redirect
 *   - quick/page.tsx (public) — guest 복귀 redirect
 */
export function safeNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  // 1. 반드시 / 로 시작 (root-relative)
  if (!raw.startsWith("/")) return "";
  // 2. // (protocol-relative) 차단
  if (raw.startsWith("//")) return "";
  // 3. /\ (백슬래시 변종) 차단 — defense in depth
  if (raw.startsWith("/\\")) return "";
  // 4. URL API 로 추가 검증 — origin 동일성 보장
  try {
    const sentinel = "http://safe-next-sentinel.local";
    const u = new URL(raw, sentinel);
    if (u.origin !== sentinel) return "";
    return u.pathname + u.search + u.hash;
  } catch {
    return "";
  }
}
