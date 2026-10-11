import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordSignal, getUserFeedback } from "@/lib/creativeSignals";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";

/**
 * POST /api/assets/[id]/feedback
 * Body: { feedback: 'positive' | 'negative' | null }
 *
 * null이면 기존 피드백 삭제 (취소).
 * positive/negative는 기존 피드백을 삭제 후 새로 insert (토글은 recordSignal 내부 처리).
 *
 * 응답: { feedback: 'positive' | 'negative' | null }
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  const { id: assetId } = await context.params;

  let feedback: "positive" | "negative" | null;
  try {
    const body = (await req.json()) as { feedback?: unknown };
    if (
      body.feedback !== "positive" &&
      body.feedback !== "negative" &&
      body.feedback !== null
    ) {
      return NextResponse.json(
        { error: "feedback must be 'positive', 'negative', or null" },
        { status: 400 },
      );
    }
    feedback = body.feedback as "positive" | "negative" | null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // asset 조회 및 권한 확인
  const { data: asset, error: assetErr } = await supabaseAdmin
    .from("assets")
    .select("id, brand_id")
    .eq("id", assetId)
    .maybeSingle();

  if (assetErr || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // 해당 asset이 사용자 소속 org의 brand에 속하는지 확인
  const brandAccess = await dbGetBrand(asset.brand_id, userId);
  if (!brandAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // null이면 기존 피드백만 삭제
  if (feedback === null) {
    await supabaseAdmin
      .from("creative_signals")
      .delete()
      .eq("asset_id", assetId)
      .eq("user_id", userId)
      .in("signal_type", ["feedback_positive", "feedback_negative"]);

    return NextResponse.json({ feedback: null });
  }

  // recordSignal 내부에서 기존 피드백 삭제 후 새로 insert
  try {
    await recordSignal({
      assetId,
      signalType: feedback === "positive" ? "feedback_positive" : "feedback_negative",
      userId,
    });
  } catch (err) {
    console.error("[feedback] recordSignal error:", err);
    return NextResponse.json(
      { error: "Failed to record feedback" },
      { status: 500 },
    );
  }

  const result = await getUserFeedback(assetId, userId);
  return NextResponse.json({ feedback: result });
}
