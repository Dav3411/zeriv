import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { getBrandSubscription } from "@/lib/brandSubscription";
import {
  getOrgIdFromBrand,
  getOrgGenerationCount,
  getOrgStyleCount,
  getOrgModelCount,
  getOrgMemberCount,
} from "@/lib/organizationSubscription";

export const runtime = "nodejs";

/**
 * GET /api/brands/[id]/usage
 *
 * 이제 사용량은 organization 풀 단위로 집계된다.
 * brand_id로 호출되지만 응답은 그 brand가 속한 organization의 합산.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  const brand = await dbGetBrand(brandId, userId);
  if (!brand)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const sub = await getBrandSubscription(brandId);
  const orgId = await getOrgIdFromBrand(brandId);

  const [monthlyGenerations, styleCount, modelCount, memberCount] =
    await Promise.all([
      orgId ? getOrgGenerationCount(orgId) : Promise.resolve(0),
      orgId ? getOrgStyleCount(orgId) : Promise.resolve(0),
      orgId ? getOrgModelCount(orgId) : Promise.resolve(0),
      orgId ? getOrgMemberCount(orgId) : Promise.resolve(0),
    ]);

  const plan = sub?.plan ?? null;

  return NextResponse.json({
    organizationId: orgId,
    planKey: sub?.planKey ?? null,
    planLabel: plan?.label ?? null,
    usage: {
      monthlyGenerations,
      styleCount,
      modelCount,
      memberCount,
    },
    limits: {
      generationLimit: plan?.generationLimit ?? null,
      styleLimit: plan?.styleLimit ?? null,
      modelLimit: plan?.modelLimit ?? null,
      memberLimit: plan?.memberLimit ?? null,
      dailyLimit: plan?.dailyLimit ?? null,
      priorityQueue: plan?.priorityQueue ?? false,
    },
    periodEnd: sub?.currentPeriodEnd ?? null,
  });
}
