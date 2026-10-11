import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { buildPersonaPrompt, type PersonaPromptParams } from "@/lib/personaPrompt";
import { generatePersonaImage } from "@/lib/personaImage";

export const runtime = "nodejs";

const VALID_GENDERS = ["female", "male"];
const VALID_AGE_GROUPS = ["early_20s", "late_20s", "early_30s", "late_30s", "early_40s", "late_40s"];
const VALID_FACE_TYPES = ["dog", "cat", "fox", "rabbit", "deer", "snake", "hamster"];

export async function POST(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const gender = String(body.gender ?? "").trim();
  const age_group = String(body.age_group ?? "").trim();
  const face_type = String(body.face_type ?? "").trim();
  const hair_style = String(body.hair_style ?? "").trim();
  const bang = String(body.bang ?? "random").trim();
  const style_vibe = String(body.style_vibe ?? "").trim();
  const height_cm = typeof body.height_cm === "number" ? Math.round(body.height_cm) : 165;
  const body_type = typeof body.body_type === "string" ? body.body_type.trim() : "normal";

  if (!VALID_GENDERS.includes(gender)) return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
  if (!VALID_AGE_GROUPS.includes(age_group)) return NextResponse.json({ error: "Invalid age_group" }, { status: 400 });
  if (!VALID_FACE_TYPES.includes(face_type)) return NextResponse.json({ error: "Invalid face_type" }, { status: 400 });
  if (!hair_style || !style_vibe) return NextResponse.json({ error: "Missing hair_style or style_vibe" }, { status: 400 });

  const params: PersonaPromptParams = {
    gender, age_group, face_type, hair_style, bang, style_vibe, height_cm, body_type,
  };

  try {
    const prompt = buildPersonaPrompt(params);
    const seed = Math.floor(Math.random() * 2 ** 32);
    const imageB64 = await generatePersonaImage(prompt);

    return NextResponse.json({
      ok: true,
      previews: [{
        ok: true,
        image_b64: imageB64,
        face_seed: seed,
        face_prompt: prompt,
        preview_index: 0,
      }],
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Preview generation failed";
    return NextResponse.json({
      ok: true,
      previews: [{ ok: false, preview_index: 0, error: detail }],
    });
  }
}
