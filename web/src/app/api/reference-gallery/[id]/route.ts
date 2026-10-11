import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { deleteObjectFromR2 } from "@/lib/r2";

export const runtime = "nodejs";

const R2_BUCKET = process.env.R2_BUCKET ?? "";

/**
 * DELETE /api/reference-gallery/[id]
 * Admin: can delete global (user_id IS NULL) images.
 * User: can delete only their own images.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const adminSecret = req.headers.get("x-admin-secret");
  let userId: string | null = null;
  let isAdmin = false;

  if (adminSecret) {
    const adminResult = await requireCreditsAdmin(req);
    if (!adminResult.ok) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }
    isAdmin = true;
  } else {
    const authResult = await requireUserId(req);
    if (authResult.error || !authResult.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = authResult.userId;
  }

  // Fetch the row
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("reference_gallery")
    .select("id, user_id, image_key")
    .eq("id", id)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Permission check
  if (isAdmin) {
    if (row.user_id !== null) {
      return NextResponse.json({ error: "Admin can only delete global images" }, { status: 403 });
    }
  } else {
    if (row.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Delete R2 object
  try {
    await deleteObjectFromR2({ bucket: R2_BUCKET, key: row.image_key });
  } catch {
    // R2 delete failure is non-fatal
  }

  // Delete DB row
  const { error: delErr } = await supabaseAdmin
    .from("reference_gallery")
    .delete()
    .eq("id", id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
