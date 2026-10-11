import { NextResponse } from "next/server";
import { verifyMediaUrl, isValidObjectPath } from "@/lib/mediaSigner";
import { getObjectFromR2 } from "@/lib/r2";

export const runtime = "nodejs";

function getEnv(name: string): string | undefined {
  return process.env[name];
}

export async function GET(
  req: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const params = await context.params;
  const pathSegments = params?.path ?? [];
  const objectPath = pathSegments.join("/");
  const { searchParams } = new URL(req.url);
  const expStr = searchParams.get("exp");
  const sig = searchParams.get("sig");

  const secret = getEnv("MEDIA_TOKEN_SECRET");
  const bucket = getEnv("R2_BUCKET");

  if (!secret || !bucket) {
    return NextResponse.json(
      { error: "Media not configured" },
      { status: 503 },
    );
  }
  if (!objectPath || !expStr || !sig) {
    return NextResponse.json(
      { error: "Missing path, exp, or sig" },
      { status: 400 },
    );
  }
  if (!isValidObjectPath(objectPath)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const expSec = parseInt(expStr, 10);
  if (!Number.isFinite(expSec)) {
    return NextResponse.json({ error: "Invalid exp" }, { status: 400 });
  }

  if (!verifyMediaUrl({ objectPath, expSec, sig, secret })) {
    return NextResponse.json(
      { error: "Invalid or expired link" },
      { status: 403 },
    );
  }

  const rangeHeader = req.headers.get("range");

  try {
    const { body, contentType, contentLength, contentRange } =
      await getObjectFromR2({
        bucket,
        key: objectPath,
        ...(rangeHeader ? { range: rangeHeader } : {}),
      });

    if (!body) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=3600");

    if (rangeHeader) {
      if (contentRange) {
        headers.set("Content-Range", contentRange);
      }
      if (contentLength !== undefined) {
        headers.set("Content-Length", String(contentLength));
      }
      return new Response(body as unknown as ReadableStream, {
        status: 206,
        headers,
      });
    }

    if (contentLength !== undefined) {
      headers.set("Content-Length", String(contentLength));
    }
    return new Response(body as unknown as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.includes("NoSuchKey") ||
      message.includes("not found") ||
      message.includes("InvalidRange")
    ) {
      if (message.includes("InvalidRange")) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": "bytes */*" },
        });
      }
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to load media" },
      { status: 502 },
    );
  }
}
