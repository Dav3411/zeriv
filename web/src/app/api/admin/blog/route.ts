/**
 * 관리자 블로그 API — 목록 + 생성.
 *
 * GET  /api/admin/blog — 전체 글 (draft 포함), 최신 작성 순
 * POST /api/admin/blog — 글 생성
 *
 * 인증: requireCreditsAdmin (로그인 + ADMIN_USER_IDS 화이트리스트).
 *
 * POST 동작:
 *   - slug 미지정 시 title 에서 자동 생성.
 *   - slug 충돌 시 400 반환 (어드민이 직접 수정).
 *   - status='published' 인데 published_at 이 비어 있으면 now() 자동 세팅.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateSlug, normalizePostRow, type BlogPost } from "@/lib/blog";

interface CreateBody {
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
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return v;
}

function asNullableString(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return null;
  return v;
}

function asTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

function asStatus(v: unknown): "draft" | "published" {
  return v === "published" ? "published" : "draft";
}

export async function GET(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, content, cover_image_url, tags, status, published_at, created_at, updated_at, meta_title, meta_description, author_name",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const posts = (data ?? []).map((row) =>
    normalizePostRow(row as BlogPost & { tags: string[] | null }),
  );

  return NextResponse.json({ posts });
}

export async function POST(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = asString(body.title)?.trim() ?? "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const requestedSlug = asString(body.slug)?.trim() ?? "";
  const slug = requestedSlug || generateSlug(title);
  if (!slug) {
    return NextResponse.json(
      {
        error:
          "slug 를 생성할 수 없습니다. 영문/숫자 문자를 포함한 title 을 사용하거나 slug 를 직접 지정하세요.",
      },
      { status: 400 },
    );
  }

  const status = asStatus(body.status);
  const publishedAt = status === "published" ? new Date().toISOString() : null;

  const insertRow = {
    title,
    slug,
    excerpt: asNullableString(body.excerpt),
    content: asString(body.content) ?? "",
    cover_image_url: asNullableString(body.cover_image_url),
    tags: asTags(body.tags),
    status,
    published_at: publishedAt,
    meta_title: asNullableString(body.meta_title),
    meta_description: asNullableString(body.meta_description),
    author_name: asString(body.author_name)?.trim() || "Zeriv Team",
  };

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .insert(insertRow)
    .select(
      "id, slug, title, excerpt, content, cover_image_url, tags, status, published_at, created_at, updated_at, meta_title, meta_description, author_name",
    )
    .single();

  if (error) {
    // Postgres unique violation
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `slug "${slug}" 이(가) 이미 존재합니다.` },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const post = normalizePostRow(data as BlogPost & { tags: string[] | null });
  return NextResponse.json({ post }, { status: 201 });
}
