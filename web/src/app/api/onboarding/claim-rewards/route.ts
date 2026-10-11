import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ claimedStepKeys: [] });
}

export async function POST() {
  return NextResponse.json({ awarded: [], allClaimed: [] });
}
