/**
 * 관리자 블로그 단건 API — 수정 + 삭제.
 *
 * PUT    /api/admin/blog/[id] — 부분 업데이트
 * DELETE /api/admin/blog/[id] — 삭제
 *
 * PUT 동작:
 *   - body 에 명시된 필드만 갱신 (undefined 필드는 무시).
 *   - status 가 'published' 로 바뀌고 published_at 이 null 이면 now() 자동 세팅.
 *   - status 가 'draft' 로 되돌아갈 때 published_at 은 그대로 둔다 (이력 보존).
 *   - slug 충돌 시 400.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePostRow, type BlogPost } from "@/lib/blog";

interface UpdateBody {
  title?: unknown;
  slug?: unknown;
  excerpt?: unknown;
  content?: unknown;
  cover_image_url?: unknown;
  tags?: unknown;
  status?: unknown;
  meta_title?: unknown;
  meta_description?: unknown;
  author_name?: unknown;
  published_at?: unknown;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function asTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 현재 상태 조회 — published_at 자동 세팅 분기에 필요.
  const { data: current, error: readErr } = await supabaseAdmin
    .from("blog_posts")
    .select("status, published_at")
    .eq("id", id)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.title === "string" && body.title.trim()) {
    updates.title = body.title.trim();
  }
  if (typeof body.slug === "string" && body.slug.trim()) {
    updates.slug = body.slug.trim();
  }
  if (body.excerpt !== undefined) {
    updates.excerpt =
      typeof body.excerpt === "string" && body.excerpt !== ""
        ? body.excerpt
        : null;
  }
  if (typeof body.content === "string") {
    updates.content = body.content;
  }
  if (body.cover_image_url !== undefined) {
    updates.cover_image_url =
      typeof body.cover_image_url === "string" && body.cover_image_url !== ""
        ? body.cover_image_url
        : null;
  }
  if (body.tags !== undefined) {
    updates.tags = asTags(body.tags);
  }
  if (body.meta_title !== undefined) {
    updates.meta_title =
      typeof body.meta_title === "string" && body.meta_title !== ""
        ? body.meta_title
        : null;
  }
  if (body.meta_description !== undefined) {
    updates.meta_description =
      typeof body.meta_description === "string" && body.meta_description !== ""
        ? body.meta_description
        : null;
  }
  if (typeof body.author_name === "string" && body.author_name.trim()) {
    updates.author_name = body.author_name.trim();
  }

  // status 처리
  if (body.status === "published" || body.status === "draft") {
    updates.status = body.status;
  }

  // 명시적으로 published_at 지정 시 (예: 예약 발행) 그대로 반영.
  if (body.published_at !== undefined) {
    if (body.published_at === null || body.published_at === "") {
      updates.published_at = null;
    } else if (typeof body.published_at === "string") {
      const d = new Date(body.published_at);
      if (!Number.isNaN(d.getTime())) {
        updates.published_at = d.toISOString();
      }
    }
  }

  // published 로 전환되는데 published_at 이 비어 있으면 now() 자동 세팅.
  // body.published_at 명시(null 포함)로 인해 updates.published_at 이 이미 설정된 경우는 제외.
  const finalStatus = (updates.status as string | undefined) ?? current.status;
  const finalPublishedAt =
    "published_at" in updates ? updates.published_at : current.published_at;
  if (finalStatus === "published" && !finalPublishedAt) {
    updates.published_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .update(updates)
    .eq("id", id)
    .select(
      "id, slug, title, excerpt, content, cover_image_url, tags, status, published_at, created_at, updated_at, meta_title, meta_description, author_name",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "slug 가 이미 다른 글에 사용되고 있습니다." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const post = normalizePostRow(data as BlogPost & { tags: string[] | null });
  return NextResponse.json({ post });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("blog_posts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
