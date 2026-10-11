import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveModelUrls } from "@/lib/persona/personaUrlResolver";

export const runtime = "nodejs";

/** 모델 소유권 확인 — models.brand_id → brands.user_id = userId */
async function verifyModelOwnership(
  modelId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("models")
    .select("brand_id, brands!inner(user_id)")
    .eq("id", modelId)
    .single();
  if (!data) return false;
  const brand = data.brands as unknown as { user_id: string } | null;
  return brand?.user_id === userId;
}

/** GET /api/personas/[id] */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing model id" }, { status: 400 });
  }

  const owned = await verifyModelOwnership(id, userId);
  if (!owned) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  const { data, error: dbErr } = await supabaseAdmin
    .from("models")
    .select(
      "id, name, preset_type, selections, face_master_key, face_sheet_key, base_model, lora_config, generation_prompt, generation_seed, status, brand_id, created_at, updated_at",
    )
    .eq("id", id)
    .single();

  if (dbErr || !data) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  return NextResponse.json({ model: await resolveModelUrls(data) });
}

/** PATCH /api/personas/[id] */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  const owned = await verifyModelOwnership(id, userId);
  if (!owned) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  let body: { name?: string; preset_type?: string };
  try {
    body = (await req.json()) as { name?: string; preset_type?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: { name?: string; preset_type?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (trimmed) updates.name = trimmed;
  }
  if (typeof body.preset_type === "string") {
    const valid = ["k_beauty", "2_5d_ani", "custom"];
    if (valid.includes(body.preset_type))
      updates.preset_type = body.preset_type;
  }

  const { data, error: updateErr } = await supabaseAdmin
    .from("models")
    .update(updates)
    .eq("id", id)
    .select(
      "id, name, preset_type, selections, face_master_key, face_sheet_key, status, brand_id, created_at, updated_at",
    )
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  return NextResponse.json({ model: await resolveModelUrls(data) });
}

/** DELETE /api/personas/[id] */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;

  const owned = await verifyModelOwnership(id, userId);
  if (!owned) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  const { error: deleteErr } = await supabaseAdmin
    .from("models")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
