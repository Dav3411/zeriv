import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { getBrandSubscription } from "@/lib/brandSubscription";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  const brand = await dbGetBrand(brandId, userId);
  if (!brand)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const sub = await getBrandSubscription(brandId);

  return NextResponse.json({
    organizationId: sub.organizationId,
    planKey: sub.planKey,
    planLabel: sub.plan.label,
    planTier: sub.planTier,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd,
    channelExport: sub.plan.channelExport ?? null,
    modelLimit: sub.plan.modelLimit ?? null,
    styleLimit: sub.plan.styleLimit ?? null,
    memberLimit: sub.plan.memberLimit ?? null,
    generationLimit: sub.generationLimit,
    dailyLimit: sub.plan.dailyLimit ?? null,
    priorityQueue: sub.plan.priorityQueue,
    watermark: sub.plan.watermark,
  });
}
