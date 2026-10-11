import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveModelUrls } from "@/lib/persona/personaUrlResolver";
import { getBrandSubscription } from "@/lib/brandSubscription";
import {
  getOrgIdFromBrand,
  getOrgModelCount,
} from "@/lib/organizationSubscription";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";

/** GET /api/personas?brandId=xxx — 브랜드 모델 목록 (URL 경로 유지) */
export async function GET(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId");

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  const brand = await dbGetBrand(brandId, userId);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const { data, error: dbErr } = await supabaseAdmin
    .from("models")
    .select(
      "id, name, preset_type, selections, face_master_key, face_sheet_key, brand_id, created_at, updated_at",
    )
    .eq("brand_id", brandId)
    .order("updated_at", { ascending: false });

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  const models = await Promise.all((data ?? []).map(resolveModelUrls));

  let modelCount = (data ?? []).length; // 기본: 브랜드 단위
  let modelLimit: number | null = null;
  try {
    const subscription = await getBrandSubscription(brandId);
    modelLimit = subscription?.plan.modelLimit ?? null;
    if (modelLimit !== null) {
      const orgId = await getOrgIdFromBrand(brandId);
      if (orgId) {
        modelCount = await getOrgModelCount(orgId);
      }
    }
  } catch {
    // fail open — modelLimit remains null
  }

  return NextResponse.json({ models, modelCount, modelLimit });
}

/** POST /api/personas — 모델 생성 */
export async function POST(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  let body: { name?: string; preset_type?: string; brand_id?: string };
  try {
    body = (await req.json()) as {
      name?: string;
      preset_type?: string;
      brand_id?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!body.brand_id) {
    return NextResponse.json(
      { error: "brand_id is required" },
      { status: 400 },
    );
  }

  const brand = await dbGetBrand(body.brand_id, userId);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  // 모델 한도 체크 (org 단위)
  const subscription = await getBrandSubscription(body.brand_id);
  const modelLimit = subscription?.plan.modelLimit ?? null;

  // modelLimit === 0: 해당 플랜은 AI 모델 자체가 미포함 (Quick Plus 등) — 즉시 차단.
  if (modelLimit === 0) {
    return NextResponse.json(
      {
        error: "AI 모델 생성은 Atelier 플랜부터 이용 가능합니다. 플랜을 업그레이드해주세요.",
      },
      { status: 402 },
    );
  }

  if (modelLimit !== null) {
    const orgId = await getOrgIdFromBrand(body.brand_id);
    const currentCount = orgId
      ? await getOrgModelCount(orgId)
      : await (async () => {
          const { count } = await supabaseAdmin
            .from("models")
            .select("id", { count: "exact", head: true })
            .eq("brand_id", body.brand_id);
          return count ?? 0;
        })();

    if (currentCount >= modelLimit) {
      return NextResponse.json(
        {
          error: `현재 플랜에서는 모델을 ${modelLimit}개까지 생성할 수 있습니다. 업그레이드 후 더 만들어보세요.`,
        },
        { status: 402 },
      );
    }
  }

  const presetType = (body.preset_type ?? "custom").trim();
  const validPresets = ["k_beauty", "2_5d_ani", "custom"];
  const preset = validPresets.includes(presetType) ? presetType : "custom";

  const { data, error: insertErr } = await supabaseAdmin
    .from("models")
    .insert({
      user_id: userId,
      brand_id: body.brand_id,
      name,
      preset_type: preset,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, name, preset_type, selections, face_master_key, face_sheet_key, brand_id, created_at, updated_at",
    )
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ model: await resolveModelUrls(data) });
}
