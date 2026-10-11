import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const R2_BUCKET = process.env.R2_BUCKET;

// 자사 R2 버킷 URL만 허용 (SSRF 방지)
function isAllowedUrl(targetUrl: URL): boolean {
  // R2_PUBLIC_URL이 설정된 경우: 해당 URL prefix로만 허용
  if (R2_PUBLIC_URL) {
    return targetUrl.href.startsWith(R2_PUBLIC_URL);
  }
  // R2_BUCKET이 설정된 경우: 버킷명이 hostname에 포함된 r2 도메인만 허용
  if (R2_BUCKET) {
    const h = targetUrl.hostname;
    return (
      (h.endsWith(".r2.cloudflarestorage.com") && h.startsWith(R2_BUCKET)) ||
      (h.endsWith(".r2.dev") && h.startsWith(R2_BUCKET))
    );
  }
  // 환경변수 미설정 시 전부 차단 (SSRF 방지 기본값)
  return false;
}

// GET /api/download?url=<encoded_url>&filename=<name>
// 서버 사이드에서 이미지를 가져와 attachment으로 반환 (CORS 우회)
// 인증 불필요: R2 버킷이 공개이므로 누구나 직접 접근 가능.
// SSRF 방지는 isAllowedUrl로 자사 R2 URL만 허용하여 처리한다.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get("url");
  const filename = req.nextUrl.searchParams.get("filename") ?? "image.png";

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  // 자사 R2 버킷 URL만 허용
  if (!isAllowedUrl(targetUrl)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  const upstream = await fetch(url, { redirect: "manual" });

  // redirect 응답은 SSRF 우회 방지를 위해 차단
  if (upstream.status >= 300 && upstream.status < 400) {
    return NextResponse.json(
      { error: "Redirects not allowed" },
      { status: 403 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Failed to fetch image" },
      { status: 502 },
    );
  }

  const contentType =
    upstream.headers.get("content-type") ?? "application/octet-stream";
  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
