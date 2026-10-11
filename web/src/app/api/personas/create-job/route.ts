import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";
import { isNonEmpty } from "@/lib/serverUtils";
import { uploadBufferToR2 } from "@/lib/r2";
import { getBrandSubscription } from "@/lib/brandSubscription";
import {
  getOrgIdFromBrand,
  getOrgModelCount,
} from "@/lib/organizationSubscription";

export const runtime = "nodejs";

type ReqBody = {
  name?: string;
  gender?: string;
  age_group?: string;
  face_type?: string;
  hair_style?: string;
  style_vibe?: string;
  height_cm?: number;
  body_type?: string;
  /** 미리보기에서 선택된 이미지 — 있으면 재생성 없이 그대로 사용 */
  image_b64?: string;
  face_seed?: number;
  face_prompt?: string;
  /**
   * 모델을 자동으로 연결할 brand id.
   * 페이지 이탈 시 클라이언트가 후속 호출을 못 하더라도 worker 가 모델 INSERT 시
   * brand_id 를 함께 설정해 누락을 방지한다.
   */
  brand_id?: string;
  /** Stage-2 ComfyUI 생성 시 사용된 모델/LoRA 정보 */
  lora_config?: {
    model?: string;
    lora?: string | null;
    lora_strength?: number;
    ipadapter_weight?: number;
  };
};

const VALID_GENDERS = ["female", "male"];
const VALID_AGE_GROUPS = [
  "early_20s",
  "late_20s",
  "early_30s",
  "late_30s",
  "early_40s",
  "late_40s",
];
const VALID_FACE_TYPES = [
  "dog",
  "cat",
  "fox",
  "rabbit",
  "deer",
  "snake",
  "hamster",
];

export async function POST(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const gender = body.gender?.trim() ?? "";
  const age_group = body.age_group?.trim() ?? "";
  const face_type = body.face_type?.trim() ?? "";
  const hair_style = body.hair_style?.trim() ?? "";
  const style_vibe = body.style_vibe?.trim() ?? "";
  const height_cm =
    typeof body.height_cm === "number" ? Math.round(body.height_cm) : 165;
  const body_type =
    typeof body.body_type === "string" ? body.body_type.trim() : "normal";
  const image_b64 =
    typeof body.image_b64 === "string" && body.image_b64.length > 0
      ? body.image_b64
      : null;
  const face_seed = typeof body.face_seed === "number" ? body.face_seed : null;
  const face_prompt =
    typeof body.face_prompt === "string" && body.face_prompt.length > 0
      ? body.face_prompt
      : null;
  const lora_config =
    body.lora_config && typeof body.lora_config === "object"
      ? body.lora_config
      : null;
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const brandIdRaw =
    typeof body.brand_id === "string" ? body.brand_id.trim() : "";
  const brandId =
    brandIdRaw.length > 0 && UUID_RE.test(brandIdRaw) ? brandIdRaw : null;

  // Validation
  if (!isNonEmpty(name) || name.length < 2) {
    return NextResponse.json(
      { error: "Name is required (min 2 characters)" },
      { status: 400 },
    );
  }
  if (!VALID_GENDERS.includes(gender)) {
    return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
  }
  if (!VALID_AGE_GROUPS.includes(age_group)) {
    return NextResponse.json({ error: "Invalid age_group" }, { status: 400 });
  }
  if (!VALID_FACE_TYPES.includes(face_type)) {
    return NextResponse.json({ error: "Invalid face_type" }, { status: 400 });
  }
  if (!isNonEmpty(hair_style)) {
    return NextResponse.json(
      { error: "hair_style is required" },
      { status: 400 },
    );
  }
  if (!isNonEmpty(style_vibe)) {
    return NextResponse.json(
      { error: "style_vibe is required" },
      { status: 400 },
    );
  }
  if (height_cm < 150 || height_cm > 190) {
    return NextResponse.json(
      { error: "height_cm must be between 150 and 190" },
      { status: 400 },
    );
  }
  const VALID_BODY_TYPES = [
    "slim",
    "normal",
    "muscular",
    "chubby",
    "curvy",
    "rugged",
    "brawny",
  ];
  if (!VALID_BODY_TYPES.includes(body_type)) {
    return NextResponse.json({ error: "Invalid body_type" }, { status: 400 });
  }

  // brand_id가 전달된 경우 소유권 + 플랜 한도를 사전 검증한다.
  // worker 가 모델 INSERT 시 brand_id 를 직접 설정하므로 한도 검사를 worker 까지
  // 미루면 한도 초과 모델이 그대로 만들어진다. 따라서 입큐 시점에서 막는다.
  // (race window: 동시 요청 시 약간 초과될 수 있으나, 기존 /api/brands/[id]/models
  //  사후 검증과 동일한 수준의 race 보장이며, 페이지 이탈 시 손실되던 시나리오가 사라진다.)
  if (brandId) {
    const { data: brandRow, error: brandErr } = await supabaseAdmin
      .from("brands")
      .select("id")
      .eq("id", brandId)
      .eq("user_id", userId)
      .maybeSingle();

    if (brandErr) {
      return NextResponse.json(
        { error: "Failed to verify brand" },
        { status: 500 },
      );
    }
    if (!brandRow) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const brandSub = await getBrandSubscription(brandId);
    const modelLimit = brandSub?.plan.modelLimit ?? null;
    // modelLimit === 0: 해당 플랜은 AI 모델 자체가 미포함 (Quick Plus 등) — 즉시 차단.
    if (modelLimit === 0) {
      return NextResponse.json(
        {
          error:
            "AI 모델 생성은 Atelier 플랜부터 이용 가능합니다. 플랜을 업그레이드해주세요.",
          limit: 0,
          current: 0,
        },
        { status: 403 },
      );
    }
    if (modelLimit !== null) {
      const orgId = await getOrgIdFromBrand(brandId);
      let current: number;
      if (orgId) {
        current = await getOrgModelCount(orgId);
      } else {
        const { count: modelCount, error: countErr } = await supabaseAdmin
          .from("models")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brandId);
        if (countErr) {
          return NextResponse.json(
            { error: "Failed to count models" },
            { status: 500 },
          );
        }
        current = modelCount ?? 0;
      }

      if (current >= modelLimit) {
        return NextResponse.json(
          { error: "모델 추가 한도 초과", limit: modelLimit, current },
          { status: 403 },
        );
      }
    }
  }

  const creditCost = Math.max(
    0,
    Math.floor(Number(process.env.PERSONA_CREDIT_COST ?? "0") || 0),
  );

  const jobId = crypto.randomUUID();
  let creditLedgerId: string | null = null;

  if (creditCost > 0) {
    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from("credit_wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (walletErr) {
      return NextResponse.json(
        { error: "Failed to load credits" },
        { status: 500 },
      );
    }

    const balance = Number(wallet?.balance ?? 0);
    if (!Number.isFinite(balance) || balance < creditCost) {
      return NextResponse.json(
        { error: "Insufficient credits" },
        { status: 402 },
      );
    }

    const { data: ledgerId, error: reserveErr } = await supabaseAdmin.rpc(
      "reserve_job_credits",
      {
        p_user_id: userId,
        p_job_id: jobId,
        p_amount: creditCost,
      },
    );

    if (reserveErr) {
      const message = reserveErr.message ?? "Failed to reserve credits";
      if (message.includes("INSUFFICIENT_CREDITS")) {
        return NextResponse.json(
          { error: "Insufficient credits" },
          { status: 402 },
        );
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }
    creditLedgerId = ledgerId as string;
  }

  // image_b64가 있으면 R2에 먼저 업로드하고 key만 payload에 저장.
  // payload는 jobs 테이블의 JSONB 컬럼이라 큰 base64가 들어가면 폴링 비용과 스토리지 부담이 커지므로
  // 이미지 바이트는 R2에 두고 참조만 DB에 남긴다.
  // R2 업로드가 실패하더라도 job 생성은 중단하지 않는다 — worker가 preview_image_key가 없는 경로로
  // Gemini 재생성 fallback을 수행하기 때문에 기존 동작과 동일하게 유지된다.
  let previewImageKey: string | null = null;
  if (image_b64) {
    try {
      const bucket = process.env.R2_BUCKET;
      if (!bucket) {
        throw new Error("R2_BUCKET is not configured");
      }
      const key = `previews/${userId}/${crypto.randomUUID()}.png`;
      const buffer = Buffer.from(image_b64, "base64");
      await uploadBufferToR2({
        bucket,
        key,
        contentType: "image/png",
        body: buffer,
      });
      previewImageKey = key;
    } catch (e) {
      console.error(
        "[personas/create-job] Failed to upload preview image to R2:",
        e,
      );
      previewImageKey = null;
    }
  }

  const { data, error: insertErr } = await supabaseAdmin
    .from("jobs")
    .insert({
      id: jobId,
      user_id: userId,
      status: "queued",
      progress: 0,
      payload: {
        kind: "persona",
        name,
        gender,
        age_group,
        face_type,
        hair_style,
        style_vibe,
        height_cm,
        body_type,
        ...(brandId ? { brand_id: brandId } : {}),
        ...(previewImageKey ? { preview_image_key: previewImageKey } : {}),
        ...(face_seed !== null ? { face_seed } : {}),
        ...(face_prompt ? { face_prompt } : {}),
        ...(lora_config ? { lora_config } : {}),
      },
      credit_ledger_id: creditLedgerId,
      credit_cost: creditCost,
      source: process.env.JOB_SOURCE || "production",
    })
    .select("id")
    .single();

  if (insertErr || !data) {
    if (creditLedgerId) {
      await supabaseAdmin.rpc("release_job_credits", {
        p_ledger_id: creditLedgerId,
      });
    }
    return NextResponse.json(
      { error: "Failed to create model job" },
      { status: 500 },
    );
  }

  return NextResponse.json({ jobId: data.id });
}
