import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadBufferToR2 } from "@/lib/r2";
import { resolveModelUrls } from "@/lib/persona/personaUrlResolver";

export const runtime = "nodejs";

const R2_BUCKET = process.env.R2_BUCKET ?? "";

/** POST /api/personas/[id]/face — upload face reference image (Face-ID). Body: multipart/form-data with file, or raw image bytes. */
export async function POST(
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

  const { id: modelId } = await params;

  const { data: model, error: fetchErr } = await supabaseAdmin
    .from("models")
    .select("id, face_master_key")
    .eq("id", modelId)
    .eq("user_id", userId)
    .single();

  if (fetchErr || !model) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let body: ArrayBuffer;
  let contentTypeToUse = "image/png";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") ?? formData.get("face");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file in form (use field 'file' or 'face')" },
        { status: 400 },
      );
    }
    body = await file.arrayBuffer();
    contentTypeToUse = file.type || "image/png";
  } else {
    body = await req.arrayBuffer();
    if (contentType.startsWith("image/")) {
      contentTypeToUse = contentType.split(";")[0].trim();
    }
  }

  const buffer = Buffer.from(body);
  if (buffer.length === 0) {
    return NextResponse.json({ error: "Empty image" }, { status: 400 });
  }

  if (!R2_BUCKET) {
    return NextResponse.json(
      { error: "R2_BUCKET not configured" },
      { status: 500 },
    );
  }

  const key = `personas/${userId}/${modelId}/face.${contentTypeToUse === "image/jpeg" ? "jpg" : "png"}`;

  try {
    await uploadBufferToR2({
      bucket: R2_BUCKET,
      key,
      contentType: contentTypeToUse,
      body: buffer,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Upload failed: ${msg}` },
      { status: 500 },
    );
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("models")
    .update({
      face_master_key: key,
      updated_at: new Date().toISOString(),
    })
    .eq("id", modelId)
    .eq("user_id", userId)
    .select(
      "id, name, preset_type, face_master_key, face_sheet_key, updated_at",
    )
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // GET/PATCH 응답과 동일한 모양 (face_image_url, face_sheet_url) 보장.
  // face_master_key는 updated에 이미 포함되어 있으므로 별도 노출하지 않는다.
  return NextResponse.json({ model: await resolveModelUrls(updated) });
}
