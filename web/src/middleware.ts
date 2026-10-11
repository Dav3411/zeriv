import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

// 외부 요청이 보낼 수 있는 모든 가짜 "내부 rewrite" 표식.
// 과거 구현에서 사용되던 헤더이며, 외부에서 위조 시 admin 보호를 우회할 수 있어
// 미들웨어 진입 즉시 strip 한다.
const INTERNAL_REWRITE_HEADERS = ["x-internal-admin-rewrite"] as const;

function isPublic(pathname: string): boolean {
  // pathname 정규화 — trailing slash 단일화. Next.js 가 일반적으로 정규화하지만
  // 방어적으로 한 번 더 처리해 prefix/exact 비교가 trailing slash 변종에 안전하게
  // 동작하도록 한다. (`/guest/quick/` 등에 대비)
  const p = pathname.replace(/\/+$/, "") || "/";

  if (p === "/" || p === "/explore") return true;
  if (p.startsWith("/login")) return true;
  if (p.startsWith("/signup")) return true;
  if (p.startsWith("/auth/")) return true;
  if (p.startsWith("/pricing")) return true;
  if (p.startsWith("/privacy")) return true;
  if (p.startsWith("/terms")) return true;
  if (p.startsWith("/api/")) return true;

  // /guest/quick · /guest/studio — 신규 게스트 진입점. exact match 만 허용해
  // `/guest/quick/...` 같은 prefix 우회를 차단한다.
  // (next/router 가 다이내믹 path traversal `..` 을 origin 까지 정규화하지만
  //  prefix 매칭은 우회 가능성이 남아있어 방어적으로 exact 비교한다.)
  if (p === "/guest/quick" || p === "/guest/studio") return true;

  // /start — 모드 선택 페이지. 비로그인 사용자도 진입 가능.
  // 랜딩 CTA("/start")와 실제 도구 사이의 퀵 vs 스튜디오 선택 허브.
  if (p === "/start") return true;

  // /quick, /studio (legacy) — 비로그인 사용자도 진입할 수 있어야 redirect 페이지가
  // 동작한다 (page.tsx 에서 즉시 /guest/quick 으로 client redirect).
  // 신규 북마크는 발생시키지 않지만 기존 북마크 호환을 위해 public 유지.
  if (p === "/quick" || p === "/studio") return true;

  if (p === "/robots.txt" || p === "/sitemap.xml") return true;
  return false;
}

function sanitizeNext(raw: string): string {
  const trimmed = raw.trim();
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return "/";
  }
  if (
    decoded.startsWith("/") &&
    !decoded.startsWith("//") &&
    !/^\/\\/.test(decoded)
  ) {
    return trimmed;
  }
  return "/";
}

function getAdminBasePath(): string {
  const raw = (process.env.ADMIN_BASE_PATH ?? "").trim().replace(/\/+$/, "");
  return raw ? (raw.startsWith("/") ? raw : "/" + raw) : "";
}

function getAdminAllowlist(): Set<string> {
  const raw = (process.env.ADMIN_USER_IDS ?? "").trim();
  if (!raw) return new Set();
  const ids = raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return new Set(ids);
}

/**
 * 외부 incoming 요청에서 내부 전용 헤더를 strip 한다.
 * 이렇게 strip 한 Headers 인스턴스를 downstream rewrite/forward 요청의 베이스로
 * 사용하면, 외부 클라이언트가 위조한 헤더가 전파되지 않는다.
 */
function stripInternalHeaders(source: Headers): Headers {
  const cleaned = new Headers(source);
  for (const name of INTERNAL_REWRITE_HEADERS) {
    cleaned.delete(name);
  }
  return cleaned;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 외부에서 위조 가능한 내부 헤더는 모든 처리에 앞서 제거한다.
  const cleanedHeaders = stripInternalHeaders(request.headers);

  // /admin/* 는 외부에서 직접 접근 시 항상 404.
  // (시크릿 베이스 경로의 내부 rewrite 결과는 같은 미들웨어를 재실행하지 않으므로
  // 이 가드에 걸리지 않는다 — Next.js 미들웨어 동작.)
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // 공개 경로는 통과 (단, 위조 헤더가 제거된 request 로 forward).
  if (isPublic(pathname)) {
    return NextResponse.next({ request: { headers: cleanedHeaders } });
  }

  // Supabase 환경변수 누락은 prod 에서 발생해서는 안 되는 구성 사고이며,
  // 통과시키면 모든 비공개 페이지가 인증 없이 노출된다 (fail-open).
  // → 비공개 경로는 fail-closed 로 차단하고 로그인 페이지로 보낸다.
  // (공개 경로·정적 자산은 위 분기와 matcher 에서 이미 제외되었으므로
  // 랜딩·이미지·favicon 등은 영향받지 않는다.)
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", sanitizeNext(pathname));
    return NextResponse.redirect(loginUrl);
  }

  // 쿠키 기반 세션 확인
  const response = NextResponse.next({ request: { headers: cleanedHeaders } });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: Record<string, unknown>) {
        request.cookies.delete(name);
        response.cookies.set({ name, value: "", maxAge: 0, ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", sanitizeNext(pathname));
    return NextResponse.redirect(loginUrl);
  }

  // 인증된 사용자: admin 시크릿 경로 처리
  const ADMIN_BASE_PATH = getAdminBasePath();

  if (!ADMIN_BASE_PATH) {
    return response;
  }

  if (pathname === ADMIN_BASE_PATH) {
    return NextResponse.redirect(
      new URL(ADMIN_BASE_PATH + "/performance", request.url),
    );
  }

  if (!pathname.startsWith(ADMIN_BASE_PATH + "/")) {
    return response;
  }

  const allowlist = getAdminAllowlist();
  if (allowlist.size === 0) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", sanitizeNext(pathname));
    loginUrl.searchParams.set("admin_error", "no_allowlist");
    return NextResponse.redirect(loginUrl);
  }

  if (!allowlist.has(user.id.toLowerCase())) {
    const homeUrl = new URL("/", request.url);
    homeUrl.searchParams.set("admin_error", "not_allowed");
    return NextResponse.redirect(homeUrl);
  }

  // 시크릿 경로 → 내부 /admin 으로 rewrite.
  // Next.js 미들웨어는 rewrite 결과 URL 에 대해 같은 요청 사이클에서 다시 실행되지
  // 않으므로, 위 /admin/* 404 가드에 걸리지 않는다.
  // 위조 가능 헤더는 이미 stripInternalHeaders 로 제거된 상태에서 forward 한다.
  const suffix = pathname.slice(ADMIN_BASE_PATH.length) || "/";
  const url = request.nextUrl.clone();
  url.pathname = `/admin${suffix}`;
  return NextResponse.rewrite(url, { request: { headers: cleanedHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm|ogg|mov)$).*)",
  ],
};
