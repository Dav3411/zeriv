import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const R2_PUBLIC_URL = (
  process.env.R2_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL ??
  ""
).replace(/\/$/, "");

function resolveImageUrl(entry: string): string {
  if (entry.startsWith("http")) return entry;
  return R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${entry}` : entry;
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("styles")
      .select("*")
      .eq("is_template", true)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const templates = (data ?? []).map((t) => ({
      ...t,
      example_images: (t.example_images ?? [])
        .map(resolveImageUrl)
        .filter(Boolean),
      key_visual_url: t.key_visual_url
        ? resolveImageUrl(t.key_visual_url)
        : null,
    }));

    return NextResponse.json({ templates });
  } catch (e) {
    console.error("[GET /api/templates] failed:", e);
    return NextResponse.json({ templates: [] });
  }
}
