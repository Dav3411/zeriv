/**
 * adminPath.ts — admin 경로 헬퍼.
 *
 * /admin/* 경로는 middleware에서 직접 접근 시 404 처리됨.
 * 실제 접근 경로는 NEXT_PUBLIC_ADMIN_BASE_PATH (e.g. "_fic") 를 통해 rewrite됨.
 *
 * ap("/admin/brands") → "/_fic/brands"
 * ap("/admin/brands") → "/admin/brands"  (env 미설정 시)
 */

const _raw = (process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? "").trim()
  .replace(/^\/+/, "")
  .replace(/\/+$/, "");

const _prefix = _raw ? `/${_raw}` : "/admin";

/**
 * /admin/* 경로를 실제 접근 가능한 admin base path로 변환.
 */
export function ap(path: string): string {
  if (!path.startsWith("/admin")) return path;
  return _prefix + path.slice("/admin".length);
}
