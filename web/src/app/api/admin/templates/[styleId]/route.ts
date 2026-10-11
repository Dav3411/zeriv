export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ styleId: string }> },
) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { styleId } = await params;

  // 어드민은 모든 스타일을 관리 가능 — is_template 필터 없이 존재만 확인
  const { data: style, error: fetchErr } = await supabaseAdmin
    .from("styles")
    .select("id")
    .eq("id", styleId)
    .single();

  if (fetchErr || !style) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    is_template?: unknown;
    category?: unknown;
    example_images?: unknown;
    key_visual_url?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};
  if (body.is_template !== undefined) updates.is_template = body.is_template;
  if (body.category !== undefined) updates.category = body.category;
  if (body.example_images !== undefined)
    updates.example_images = body.example_images;
  if (body.key_visual_url !== undefined)
    updates.key_visual_url = body.key_visual_url;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("styles")
    .update(updates)
    .eq("id", styleId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
