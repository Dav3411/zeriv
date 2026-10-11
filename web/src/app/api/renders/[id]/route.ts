import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2PublicUrl } from "@/lib/r2";

export const runtime = "nodejs";

/**
 * GET /api/renders/[id]
 * 렌더 상세 조회 (이미지 URL + 메타데이터)
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );

  const { id } = await context.params;

  const { data: job, error: dbErr } = await supabaseAdmin
    .from("jobs")
    .select("id, user_id, status, result, payload, created_at")
    .eq("id", id)
    .single();

  if (dbErr || !job)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.user_id !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = job.payload as Record<string, unknown>;
  const result = job.result as Record<string, unknown> | null;
  const resultKey = result?.result_key as string | undefined;
  const imageUrl = resultKey ? await getR2PublicUrl(resultKey) : null;

  return NextResponse.json({
    render: {
      id: job.id,
      kind: payload.kind as string,
      name: (payload.name as string) ?? "",
      imageUrl,
      createdAt: job.created_at,
    },
  });
}

/**
 * PATCH /api/renders/[id]
 * 렌더 이름 수정
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );

  const { id } = await context.params;
  const body = (await req.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name)
    return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // 소유권 확인
  const { data: job, error: fetchErr } = await supabaseAdmin
    .from("jobs")
    .select("id, user_id, payload")
    .eq("id", id)
    .single();

  if (fetchErr || !job)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.user_id !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = job.payload as Record<string, unknown>;
  const { error: updateErr } = await supabaseAdmin
    .from("jobs")
    .update({ payload: { ...payload, name } })
    .eq("id", id);

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/renders/[id]
 * 렌더 삭제 (soft delete via status change)
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );

  const { id } = await context.params;

  const { data: job, error: fetchErr } = await supabaseAdmin
    .from("jobs")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (fetchErr || !job)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.user_id !== userId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error: delErr } = await supabaseAdmin
    .from("jobs")
    .update({ status: "deleted" })
    .eq("id", id);

  if (delErr)
    return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
