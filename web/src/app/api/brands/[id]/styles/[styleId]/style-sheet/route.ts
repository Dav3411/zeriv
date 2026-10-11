import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { runStyleSheetPipeline } from "@/lib/style/styleSheetPipeline";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";
export const maxDuration = 180;

// POST /api/brands/[id]/styles/[styleId]/style-sheet
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; styleId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId, styleId } = await params;
  console.log(
    "[style-sheet] POST received — brandId:",
    brandId,
    "styleId:",
    styleId,
    "userId:",
    userId,
  );

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  try {
    const result = await runStyleSheetPipeline(brandId, styleId, userId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[style-sheet] pipeline failed:", msg);

    if (msg === "Style not found") {
      return NextResponse.json({ error: "Style not found" }, { status: 404 });
    }
    if (msg.includes("both empty")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to generate style sheet" },
      { status: 500 },
    );
  }
}
