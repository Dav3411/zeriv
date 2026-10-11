import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";

export const runtime = "nodejs";

/** 현재 유저의 기본 통계 */
export async function GET(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({});
}
