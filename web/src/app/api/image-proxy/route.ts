import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/** GET /api/image-proxy?url=<encoded_url>
 *  서버 사이드에서 외부 이미지를 fetch해 반환 (CORS 우회용)
 *  - Cloudflare R2 도메인만 허용 (isAllowedHost 화이트리스트로 SSRF 방어)
 *  - 인증 불필요: <img> 태그에서 커스텀 헤더를 보낼 수 없고, R2 URL은 퍼블릭/서명된 시간제한 URL이므로 안전
 *  - 스트리밍으로 반환 (메모리 효율)
 */

// 모듈 수준: 배포 시 고정값이므로 한 번만 파싱
const ALLOWED_HOSTS: Set<string> = (() => {
  const hosts = new Set<string>();
  try {
    const r2 = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
    if (r2) hosts.add(new URL(r2).hostname);
  } catch {
    /* ignore */
  }
  return hosts;
})();

function isAllowedHost(hostname: string): boolean {
  // *.r2.dev suffix 허용 (Cloudflare R2 public buckets 전체)
  if (hostname.endsWith(".r2.dev")) return true;

  // 환경변수에서 파싱된 호스트
  return ALLOWED_HOSTS.has(hostname);
}

export async function GET(req: NextRequest) {
  // 1. URL 파라미터 검증
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new NextResponse("Missing url", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  // 2. 도메인 화이트리스트 검사
  if (!isAllowedHost(parsed.hostname)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 3. 스트리밍 프록시 (blob 버퍼링 없이 body 스트림 그대로 반환)
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(url, { signal: ac.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!upstreamRes.ok) {
      return new NextResponse("Upstream error", { status: upstreamRes.status });
    }
    return new NextResponse(upstreamRes.body, {
      headers: {
        "Content-Type": upstreamRes.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return new NextResponse("Upstream timeout", { status: 504 });
    }
    return new NextResponse("Fetch error", { status: 500 });
  }
}
