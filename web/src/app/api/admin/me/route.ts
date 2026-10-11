import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";

export async function GET(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json({ isAdmin: true });
}
