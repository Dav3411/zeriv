import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadBufferToR2 } from "@/lib/r2";
import crypto from "crypto";
import {
  getBrandSubscription,
  type BrandSubscriptionState,
} from "@/lib/brandSubscription";
import {
  consumeOneGeneration,
  refundOneGeneration,
  type ConsumeOk,
} from "@/lib/packConsumption";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { recordSignal } from "@/lib/creativeSignals";

export const runtime = "nodejs";

const R2_BUCKET = process.env.R2_BUCKET ?? "zeriv-assets";

// ── Quick mode auto-match: 화이트리스트 ────────────────────────────────
// 워커의 Vision 매칭을 트리거하는 (category, format) 조합을 검증한다.
// `render_product_solo`(감성컷)와 `render_product_model`(모델컷)에서 공통 사용.
const QUICK_AUTO_MATCH_CATEGORIES: ReadonlySet<string> = new Set([
  "skincare",
  "makeup",
  "haircare",
  "food",
  "fashion",
  "lifestyle",
  "etc",
]);
const QUICK_AUTO_MATCH_FORMATS: ReadonlySet<string> = new Set([
  "mood",
  "model",
]);

/**
 * Quick auto-match 입력을 정규화한다.
 * - `auto_match=true`이면서 `category`/`mood_format`이 모두 화이트리스트에 속할 때만
 *   `effectiveAutoMatch=true`를 반환한다.
 * - 그 외에는 워커가 매칭을 시도하지 않도록 모두 null/false로 떨어뜨려 자유 프롬프트
 *   경로를 유지한다.
 */
function readQuickAutoMatchFields(formData: FormData): {
  effectiveAutoMatch: boolean;
  category: string | null;
  moodFormat: string | null;
} {
  const autoMatch = formData.get("auto_match") === "true";
  const rawCategory =
    (formData.get("category") as string | null)?.trim() || null;
  const rawMoodFormat =
    (formData.get("mood_format") as string | null)?.trim() || null;
  const category =
    autoMatch && rawCategory && QUICK_AUTO_MATCH_CATEGORIES.has(rawCategory)
      ? rawCategory
      : null;
  const moodFormat =
    autoMatch && rawMoodFormat && QUICK_AUTO_MATCH_FORMATS.has(rawMoodFormat)
      ? rawMoodFormat
      : null;
  const effectiveAutoMatch = autoMatch && !!category && !!moodFormat;
  return { effectiveAutoMatch, category, moodFormat };
}

/**
 * POST /api/render/create-job
 *
 * Two modes:
 *
 * 1) multipart/form-data (outfit pipeline):
 *    influencer_id, example_image, outfit_images[]
 *
 * 2) application/json (prompt pipeline):
 *    { influencer_id, prompt, pipeline: "render_prompt" }
 */
export async function POST(req: Request) {
  const { error, userId } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json(
      { error: error ?? "Unauthorized" },
      { status: 401 },
    );
  }

  const contentType = req.headers.get("content-type") ?? "";

  // ── JSON request (prompt / product pipelines without file upload) ────
  if (contentType.includes("application/json")) {
    // Clone req so we can peek at the pipeline field before dispatching
    const body = await req.json().catch(() => null);
    if (!body)
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    if (body.pipeline === "render_product_model")
      return handleProductModelJSON(body, userId);
    if (body.pipeline === "render_product_solo")
      return handleProductSoloJSON(body, userId);

    // Default: render_prompt (original handler, receives pre-parsed body)
    return handlePromptPipelineFromBody(body, userId);
  }

  // ── FormData request ────────────────────────────────────────────────
  // Could be outfit pipeline OR prompt pipeline with reference image
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const pipeline = (formData.get("pipeline") as string | null)?.trim();
  if (pipeline === "render_prompt") {
    return handlePromptPipelineWithFormData(formData, userId);
  }
  if (pipeline === "render_product_solo") {
    return handleObjectRenderWithFormData(formData, userId);
  }
  if (pipeline === "render_quick_mood") {
    return handleQuickMoodWithFormData(formData, userId);
  }
  if (pipeline === "render_quick_model") {
    return handleQuickModelWithFormData(formData, userId);
  }
  if (pipeline === "render_product_model") {
    return handleInfluencerProductWithFormData(formData, userId);
  }

  return handleOutfitPipelineWithFormData(formData, userId);
}

// ────────────────────────────────────────────────────────────────────────
// 이미지 1장 차감 — consumeOneGeneration (월구독 → 팩 fallback)
//
// 기존 checkGenerationLimit (사전 검증) + recordGenerationUsage (사후 +1) 패턴은
// 2026-05-13 종량제 도입과 함께 단일 atomic 차감 helper 로 통합되었다.
// 새 helper 는 job insert 직전 1회 호출 — 성공 시 source('subscription'|'pack')
// 반환, 실패 시 { ok:false, error, status, code? }. INSUFFICIENT_PACK 의 경우
// 클라이언트가 InsufficientPackModal 을 띄우도록 code 를 확인할 수 있다.
//
// 환불 (2026-05-15, Phase 2):
//   차감 후 R2 업로드 또는 job insert 가 실패하면 refundFailedConsume 가 best-effort
//   로 1장을 복원한다. 환불 자체가 실패해도 사용자에게는 동일한 500 에러를 반환하고
//   critical 로그로 운영자 개입 신호만 남긴다.
// ────────────────────────────────────────────────────────────────────────

/**
 * 차감 후 job insert / R2 업로드 실패 시 1장 환불 + 운영자 critical 로그.
 *
 * 환불 자체가 실패해도 throw 하지 않는다 (best-effort). 호출자는 곧바로
 * 사용자에게 500 응답을 반환할 수 있다.
 *
 * 핸들러별 호출 패턴:
 *   - FormData 5개 (R2 업로드 + insert): try-catch 로 감싸 catch 블록에서 호출.
 *     R2 업로드 자체가 throw 할 수 있으므로 명시적 try-catch 필수.
 *   - JSON 4개 (insert 만): insertErr 분기에서 호출. supabase-js v2 의 insert()
 *     는 네트워크/DB 오류도 `{ error, data: null }` 형태로 반환하고 throw 하지
 *     않으므로 try-catch 불필요 — insertErr 체크만으로 모든 실패 경로 커버.
 */
async function refundFailedConsume(
  consume: ConsumeOk,
  context: { pipeline: string; reason: string; detail?: unknown },
): Promise<void> {
  console.error("[create-job] job insert failed after consume — refunding", {
    pipeline: context.pipeline,
    reason: context.reason,
    source: consume.source,
    detail: context.detail,
  });
  await refundOneGeneration(consume);
}

// ────────────────────────────────────────────────────────────────────────
// style_reuse 신호 — 같은 style_id로 새 job을 생성할 때 이전 asset에 기록
// job insert 성공 후 비동기로 호출 (실패해도 사용자 흐름 차단하지 않음)
// ────────────────────────────────────────────────────────────────────────
function recordStyleReuseSignal(params: {
  brandId: string | null | undefined;
  styleId: string | null | undefined;
  newJobId: string;
  userId: string;
}): void {
  if (!params.brandId || !params.styleId) return;

  (async () => {
    try {
      const { data: prevAsset } = await supabaseAdmin
        .from("assets")
        .select("id")
        .eq("brand_id", params.brandId)
        .eq("style_id", params.styleId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!prevAsset?.id) return;
      await recordSignal({
        assetId: prevAsset.id as string,
        signalType: "style_reuse",
        userId: params.userId,
        metadata: { new_job_id: params.newJobId },
      });
    } catch (err) {
      console.error("[create-job] recordStyleReuseSignal error:", err);
    }
  })();
}

// ────────────────────────────────────────────────────────────────────────
// priority 값 반환 — studio(priorityQueue=true) 플랜이면 10, 그 외 0
// ────────────────────────────────────────────────────────────────────────
async function getJobPriority(
  brandId: string | null | undefined,
  sub?: BrandSubscriptionState | null,
): Promise<number> {
  if (!brandId) return 0;
  const resolvedSub =
    sub !== undefined ? sub : await getBrandSubscription(brandId);
  return resolvedSub?.plan.priorityQueue ? 10 : 0;
}

// ────────────────────────────────────────────────────────────────────────
// Prompt pipeline: render_prompt (body already parsed by caller)
// ────────────────────────────────────────────────────────────────────────
async function handlePromptPipelineFromBody(
  body: {
    influencer_id?: string;
    prompt?: string;
    pipeline?: string;
    realism?: boolean;
    profile_id?: string;
    brand_id?: string;
    style_id?: string;
    aspect_ratio?: string;
    image_api?: string;
  },
  userId: string,
) {
  const influencerId = body.influencer_id?.trim();
  const prompt = body.prompt?.trim();
  const pipeline = body.pipeline?.trim();
  const profileId = body.profile_id?.trim() || null;
  const brandId = body.brand_id?.trim() || null;
  const styleId = body.style_id?.trim() || null;
  const aspectRatio = body.aspect_ratio?.trim() || "1:1";

  if (!influencerId)
    return NextResponse.json(
      { error: "influencer_id is required" },
      { status: 400 },
    );
  if (!prompt)
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  if (pipeline !== "render_prompt") {
    return NextResponse.json(
      { error: "pipeline must be render_prompt" },
      { status: 400 },
    );
  }

  // ── 이미지 생성 한도 체크 ──────────────────────────────────────────────
  // 브랜드 접근 권한 확인 (owner + member)
  if (brandId) {
    const brandAccess = await dbGetBrand(brandId, userId);
    if (!brandAccess) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 403 },
      );
    }
  }

  const sub = brandId ? await getBrandSubscription(brandId) : null;
  // ──────────────────────────────────────────────────────────────────────

  // Build query conditionally
  let infQuery = supabaseAdmin
    .from("models")
    .select("id, name, face_sheet_key")
    .eq("id", influencerId);
  if (brandId) {
    infQuery = infQuery.eq("brand_id", brandId);
  } else {
    infQuery = infQuery.eq("user_id", userId);
  }
  const { data: influencer, error: infErr } = await infQuery.single();

  if (infErr || !influencer)
    return NextResponse.json(
      { error: "Influencer not found" },
      { status: 404 },
    );
  if (!influencer.face_sheet_key) {
    return NextResponse.json(
      { error: "Influencer has no face sheet." },
      { status: 422 },
    );
  }

  const jobId = crypto.randomUUID();
  const pipelineLabel = "Prompt";
  const priority = await getJobPriority(brandId, sub);

  // job insert 직전 atomic 차감 — 월구독 → 팩 fallback
  const consume = await consumeOneGeneration(brandId);
  if (!consume.ok) {
    return NextResponse.json(
      { error: consume.error, code: consume.code },
      { status: consume.status },
    );
  }

  const { error: insertErr } = await supabaseAdmin.from("jobs").insert({
    id: jobId,
    user_id: userId,
    status: "queued",
    progress: 0,
    priority,
    ...(brandId && { brand_id: brandId }),
    payload: {
      kind: pipeline,
      name: `${influencer.name} ${pipelineLabel}`,
      influencer_id: influencerId,
      face_sheet_key: influencer.face_sheet_key,
      prompt,
      realism: body.realism === true,
      aspect_ratio: aspectRatio,
      ...(body.image_api === "grok" || body.image_api === "gpt"
        ? { image_api: body.image_api }
        : {}),
      ...(profileId && { profile_id: profileId }),
      ...(styleId && { style_id: styleId }),
    },
    source: process.env.JOB_SOURCE || "production",
  });

  if (insertErr) {
    // 차감 후 job insert 실패 — 1장 환불 (best-effort).
    await refundFailedConsume(consume, {
      pipeline: "render_prompt_json",
      reason: "jobs.insert failed",
      detail: insertErr.message,
    });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // style_reuse 신호 기록 (차감은 위 consumeOneGeneration 에서 완료)
  recordStyleReuseSignal({ brandId, styleId, newJobId: jobId, userId });
  return NextResponse.json({ jobId });
}

// ────────────────────────────────────────────────────────────────────────
// Prompt pipeline with FormData
// ────────────────────────────────────────────────────────────────────────
async function handlePromptPipelineWithFormData(
  formData: FormData,
  userId: string,
) {
  const influencerId = (formData.get("influencer_id") as string | null)?.trim();
  const prompt = (formData.get("prompt") as string | null)?.trim() ?? "";
  const realism = formData.get("realism") === "true";
  const profileId =
    (formData.get("profile_id") as string | null)?.trim() || null;
  const brandId = (formData.get("brand_id") as string | null)?.trim() || null;
  const styleId = (formData.get("style_id") as string | null)?.trim() || null;
  const aspectRatio =
    (formData.get("aspect_ratio") as string | null)?.trim() || "1:1";
  const imageApiRaw = (formData.get("image_api") as string | null)?.trim();
  const imageApi =
    imageApiRaw === "grok" || imageApiRaw === "gpt" ? imageApiRaw : undefined;

  if (!influencerId)
    return NextResponse.json(
      { error: "influencer_id is required" },
      { status: 400 },
    );
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // ── 이미지 생성 한도 체크 ──────────────────────────────────────────────
  // 브랜드 접근 권한 확인 (owner + member)
  if (brandId) {
    const brandAccess = await dbGetBrand(brandId, userId);
    if (!brandAccess) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 403 },
      );
    }
  }

  const sub = brandId ? await getBrandSubscription(brandId) : null;
  // ──────────────────────────────────────────────────────────────────────

  // Build query conditionally
  let infQuery = supabaseAdmin
    .from("models")
    .select("id, name, face_sheet_key")
    .eq("id", influencerId);
  if (brandId) {
    infQuery = infQuery.eq("brand_id", brandId);
  } else {
    infQuery = infQuery.eq("user_id", userId);
  }
  const { data: influencer, error: infErr } = await infQuery.single();

  if (infErr || !influencer)
    return NextResponse.json(
      { error: "Influencer not found" },
      { status: 404 },
    );
  if (!influencer.face_sheet_key) {
    return NextResponse.json(
      { error: "Influencer has no face sheet." },
      { status: 422 },
    );
  }

  const jobId = crypto.randomUUID();
  const priority = await getJobPriority(brandId, sub);

  // job insert 직전 atomic 차감 — 월구독 → 팩 fallback
  const consume = await consumeOneGeneration(brandId);
  if (!consume.ok) {
    return NextResponse.json(
      { error: consume.error, code: consume.code },
      { status: consume.status },
    );
  }

  const { error: insertErr } = await supabaseAdmin.from("jobs").insert({
    id: jobId,
    user_id: userId,
    status: "queued",
    progress: 0,
    priority,
    ...(brandId && { brand_id: brandId }),
    payload: {
      kind: "render_prompt",
      name: `${influencer.name} Prompt`,
      influencer_id: influencerId,
      face_sheet_key: influencer.face_sheet_key,
      prompt,
      realism,
      aspect_ratio: aspectRatio,
      ...(profileId && { profile_id: profileId }),
      ...(styleId && { style_id: styleId }),
      ...(imageApi ? { image_api: imageApi } : {}),
    },
    source: process.env.JOB_SOURCE || "production",
  });

  if (insertErr) {
    await refundFailedConsume(consume, {
      pipeline: "render_prompt_form",
      reason: "jobs.insert failed",
      detail: insertErr.message,
    });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // style_reuse 신호 기록 (차감은 위 consumeOneGeneration 에서 완료)
  recordStyleReuseSignal({ brandId, styleId, newJobId: jobId, userId });
  return NextResponse.json({ jobId });
}

// ────────────────────────────────────────────────────────────────────────
// Influencer + Product pipeline
// ────────────────────────────────────────────────────────────────────────
async function handleInfluencerProductWithFormData(
  formData: FormData,
  userId: string,
) {
  const influencerId = (formData.get("influencer_id") as string | null)?.trim();
  const productImage = formData.get("product_image") as File | null;
  const prompt = (formData.get("prompt") as string | null)?.trim() ?? "";
  const styleId = (formData.get("style_id") as string | null)?.trim() || null;
  const brandId = (formData.get("brand_id") as string | null)?.trim() || null;
  const productId =
    (formData.get("product_id") as string | null)?.trim() || null;
  const aspectRatio =
    (formData.get("aspect_ratio") as string | null)?.trim() || "1:1";
  const imageApi = (formData.get("image_api") as string | null)?.trim();

  // Quick mode auto-match (모델컷 진입 경로). 워커가 (category, mood_format)
  // 후보 풀에서 Vision으로 한 패턴을 선택해 scenePrompt를 치환한다.
  const { effectiveAutoMatch, category, moodFormat } =
    readQuickAutoMatchFields(formData);

  if (!influencerId)
    return NextResponse.json(
      { error: "influencer_id is required" },
      { status: 400 },
    );
  if (!productImage || productImage.size === 0) {
    return NextResponse.json(
      { error: "product_image is required" },
      { status: 400 },
    );
  }

  // ── 이미지 생성 한도 체크 (업로드 이전) ──────────────────────────────────
  // 브랜드 접근 권한 확인 (owner + member)
  if (brandId) {
    const brandAccess = await dbGetBrand(brandId, userId);
    if (!brandAccess) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 403 },
      );
    }
  }

  const sub = brandId ? await getBrandSubscription(brandId) : null;
  // ──────────────────────────────────────────────────────────────────────

  // Build query conditionally
  let infQuery = supabaseAdmin
    .from("models")
    .select("id, name, face_sheet_key")
    .eq("id", influencerId);
  if (brandId) {
    infQuery = infQuery.eq("brand_id", brandId);
  } else {
    infQuery = infQuery.eq("user_id", userId);
  }
  const { data: influencer, error: infErr } = await infQuery.single();
  if (infErr || !influencer)
    return NextResponse.json(
      { error: "Influencer not found" },
      { status: 404 },
    );
  if (!influencer.face_sheet_key)
    return NextResponse.json(
      { error: "Influencer has no face sheet." },
      { status: 422 },
    );

  // R2 업로드 전 atomic 차감 — 402 거부 시 R2 누수 방지
  const consume = await consumeOneGeneration(brandId);
  if (!consume.ok) {
    return NextResponse.json(
      { error: consume.error, code: consume.code },
      { status: consume.status },
    );
  }

  const jobId = crypto.randomUUID();
  const prefix = `render/${influencerId}/${jobId}_input`;

  // 차감 이후의 모든 실패 경로(R2 / job insert)는 환불 후 500 반환.
  try {
    // Upload product image
    const productBuf = Buffer.from(await productImage.arrayBuffer());
    const productExt = productImage.type === "image/jpeg" ? "jpg" : "png";
    const productKey = `${prefix}/product.${productExt}`;
    await uploadBufferToR2({
      bucket: R2_BUCKET,
      key: productKey,
      contentType: productImage.type || "image/png",
      body: productBuf,
    });

    const priority = await getJobPriority(brandId, sub);

    const { error: insertErr } = await supabaseAdmin.from("jobs").insert({
      id: jobId,
      user_id: userId,
      status: "queued",
      progress: 0,
      priority,
      ...(brandId && { brand_id: brandId }),
      payload: {
        kind: "render_product_model",
        name: `${influencer.name} Product`,
        influencer_id: influencerId,
        face_sheet_key: influencer.face_sheet_key,
        product_image_key: productKey,
        prompt,
        aspect_ratio: aspectRatio,
        ...(styleId && { style_id: styleId }),
        ...(productId && { product_id: productId }),
        ...(imageApi === "grok" || imageApi === "gpt"
          ? { image_api: imageApi }
          : {}),
        ...(effectiveAutoMatch && {
          auto_match: true,
          category,
          mood_format: moodFormat,
        }),
      },
      source: process.env.JOB_SOURCE || "production",
    });

    if (insertErr) {
      await refundFailedConsume(consume, {
        pipeline: "render_product_model_form",
        reason: "jobs.insert failed",
        detail: insertErr.message,
      });
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // style_reuse 신호 기록 (차감은 위 consumeOneGeneration 에서 완료)
    recordStyleReuseSignal({ brandId, styleId, newJobId: jobId, userId });
    return NextResponse.json({ jobId });
  } catch (e) {
    await refundFailedConsume(consume, {
      pipeline: "render_product_model_form",
      reason: "R2 upload or job insert threw",
      detail: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "생성 작업 등록 실패" },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Object render pipeline
// ────────────────────────────────────────────────────────────────────────
async function handleObjectRenderWithFormData(
  formData: FormData,
  userId: string,
) {
  const objectImage = formData.get("object_image") as File | null;
  const prompt = (formData.get("prompt") as string | null)?.trim() ?? "";
  const styleId = (formData.get("style_id") as string | null)?.trim() || null;
  const brandId = (formData.get("brand_id") as string | null)?.trim() || null;
  const productId =
    (formData.get("product_id") as string | null)?.trim() || null;
  const aspectRatio =
    (formData.get("aspect_ratio") as string | null)?.trim() || "1:1";

  // Quick mode auto-match (mood/model patterns picked by Vision in worker).
  // When auto_match=true, the worker ignores `prompt` and uses the matched
  // pattern's scenePrompt instead. category/mood_format gate the candidate pool.
  const { effectiveAutoMatch, category, moodFormat } =
    readQuickAutoMatchFields(formData);

  if (!objectImage || objectImage.size === 0) {
    return NextResponse.json(
      { error: "object_image is required" },
      { status: 400 },
    );
  }

  // ── 이미지 생성 한도 체크 (업로드 이전) ──────────────────────────────────
  // 브랜드 접근 권한 확인 (owner + member)
  if (brandId) {
    const brandAccess = await dbGetBrand(brandId, userId);
    if (!brandAccess) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 403 },
      );
    }
  }

  const sub = brandId ? await getBrandSubscription(brandId) : null;
  // ──────────────────────────────────────────────────────────────────────

  // R2 업로드 전 atomic 차감 — 402 거부 시 R2 누수 방지
  const consume = await consumeOneGeneration(brandId);
  if (!consume.ok) {
    return NextResponse.json(
      { error: consume.error, code: consume.code },
      { status: consume.status },
    );
  }

  const jobId = crypto.randomUUID();
  const prefix = `render/objects/${jobId}_input`;

  try {
    const objectBuf = Buffer.from(await objectImage.arrayBuffer());
    const objectExt = objectImage.type === "image/jpeg" ? "jpg" : "png";
    const objectKey = `${prefix}/object.${objectExt}`;
    await uploadBufferToR2({
      bucket: R2_BUCKET,
      key: objectKey,
      contentType: objectImage.type || "image/png",
      body: objectBuf,
    });

    const priority = await getJobPriority(brandId, sub);

    const { error: insertErr } = await supabaseAdmin.from("jobs").insert({
      id: jobId,
      user_id: userId,
      status: "queued",
      progress: 0,
      priority,
      ...(brandId && { brand_id: brandId }),
      payload: {
        kind: "render_product_solo",
        name: "Object Render",
        object_image_key: objectKey,
        prompt,
        aspect_ratio: aspectRatio,
        ...(styleId && { style_id: styleId }),
        ...(productId && { product_id: productId }),
        ...(effectiveAutoMatch && {
          auto_match: true,
          category,
          mood_format: moodFormat,
        }),
      },
      source: process.env.JOB_SOURCE || "production",
    });

    if (insertErr) {
      await refundFailedConsume(consume, {
        pipeline: "render_product_solo_form",
        reason: "jobs.insert failed",
        detail: insertErr.message,
      });
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // style_reuse 신호 기록 (차감은 위 consumeOneGeneration 에서 완료)
    recordStyleReuseSignal({ brandId, styleId, newJobId: jobId, userId });
    return NextResponse.json({ jobId });
  } catch (e) {
    await refundFailedConsume(consume, {
      pipeline: "render_product_solo_form",
      reason: "R2 upload or job insert threw",
      detail: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "생성 작업 등록 실패" },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Quick Mood Render pipeline — 카테고리 없이 고정 프롬프트로 gpt-image-2 사용
// ────────────────────────────────────────────────────────────────────────
async function handleQuickMoodWithFormData(formData: FormData, userId: string) {
  const objectImage = formData.get("object_image") as File | null;
  const brandId = (formData.get("brand_id") as string | null)?.trim() || null;
  const aspectRatio =
    (formData.get("aspect_ratio") as string | null)?.trim() || "1:1";

  if (!objectImage || objectImage.size === 0) {
    return NextResponse.json(
      { error: "object_image is required" },
      { status: 400 },
    );
  }

  // ── 브랜드 접근 권한 확인 ─────────────────────────────────────────────
  if (brandId) {
    const brandAccess = await dbGetBrand(brandId, userId);
    if (!brandAccess) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 403 },
      );
    }
  }

  const sub = brandId ? await getBrandSubscription(brandId) : null;

  // R2 업로드 전 atomic 차감 — 402 거부 시 R2 누수 방지
  const consume = await consumeOneGeneration(brandId);
  if (!consume.ok) {
    return NextResponse.json(
      { error: consume.error, code: consume.code },
      { status: consume.status },
    );
  }

  const jobId = crypto.randomUUID();
  const prefix = `render/objects/${jobId}_input`;

  try {
    const objectBuf = Buffer.from(await objectImage.arrayBuffer());
    const objectExt = objectImage.type === "image/jpeg" ? "jpg" : "png";
    const objectKey = `${prefix}/object.${objectExt}`;
    await uploadBufferToR2({
      bucket: R2_BUCKET,
      key: objectKey,
      contentType: objectImage.type || "image/png",
      body: objectBuf,
    });

    const priority = await getJobPriority(brandId, sub);

    const { error: insertErr } = await supabaseAdmin.from("jobs").insert({
      id: jobId,
      user_id: userId,
      status: "queued",
      progress: 0,
      priority,
      ...(brandId && { brand_id: brandId }),
      payload: {
        kind: "render_quick_mood",
        name: "Quick Mood Render",
        object_image_key: objectKey,
        aspect_ratio: aspectRatio,
      },
      source: process.env.JOB_SOURCE || "production",
    });

    if (insertErr) {
      await refundFailedConsume(consume, {
        pipeline: "render_quick_mood",
        reason: "jobs.insert failed",
        detail: insertErr.message,
      });
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ jobId });
  } catch (e) {
    await refundFailedConsume(consume, {
      pipeline: "render_quick_mood",
      reason: "R2 upload or job insert threw",
      detail: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "생성 작업 등록 실패" },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Quick Model Render pipeline — persona/category 없이 성별 한 줄만 받아 gpt-image-2 사용
// ────────────────────────────────────────────────────────────────────────
async function handleQuickModelWithFormData(
  formData: FormData,
  userId: string,
) {
  const objectImage = formData.get("object_image") as File | null;
  const brandId = (formData.get("brand_id") as string | null)?.trim() || null;
  const genderRaw = (formData.get("gender") as string | null)?.trim() ?? "";
  // 알 수 없는 값은 기본값 female (워커도 동일 정책으로 fallback)
  const gender: "male" | "female" = genderRaw === "male" ? "male" : "female";

  if (!objectImage || objectImage.size === 0) {
    return NextResponse.json(
      { error: "object_image is required" },
      { status: 400 },
    );
  }

  // ── 브랜드 접근 권한 확인 ─────────────────────────────────────────────
  if (brandId) {
    const brandAccess = await dbGetBrand(brandId, userId);
    if (!brandAccess) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 403 },
      );
    }
  }

  const sub = brandId ? await getBrandSubscription(brandId) : null;

  // R2 업로드 전 atomic 차감 — 402 거부 시 R2 누수 방지
  const consume = await consumeOneGeneration(brandId);
  if (!consume.ok) {
    return NextResponse.json(
      { error: consume.error, code: consume.code },
      { status: consume.status },
    );
  }

  const jobId = crypto.randomUUID();
  const prefix = `render/objects/${jobId}_input`;

  try {
    const objectBuf = Buffer.from(await objectImage.arrayBuffer());
    const objectExt = objectImage.type === "image/jpeg" ? "jpg" : "png";
    const objectKey = `${prefix}/object.${objectExt}`;
    await uploadBufferToR2({
      bucket: R2_BUCKET,
      key: objectKey,
      contentType: objectImage.type || "image/png",
      body: objectBuf,
    });

    const priority = await getJobPriority(brandId, sub);

    const { error: insertErr } = await supabaseAdmin.from("jobs").insert({
      id: jobId,
      user_id: userId,
      status: "queued",
      progress: 0,
      priority,
      ...(brandId && { brand_id: brandId }),
      payload: {
        kind: "render_quick_model",
        name: "Quick Model Render",
        object_image_key: objectKey,
        gender,
      },
      source: process.env.JOB_SOURCE || "production",
    });

    if (insertErr) {
      await refundFailedConsume(consume, {
        pipeline: "render_quick_model",
        reason: "jobs.insert failed",
        detail: insertErr.message,
      });
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ jobId });
  } catch (e) {
    await refundFailedConsume(consume, {
      pipeline: "render_quick_model",
      reason: "R2 upload or job insert threw",
      detail: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "생성 작업 등록 실패" },
      { status: 500 },
    );
  }
}

// ────────────────────────────────────────────────────────────────────────
// Outfit pipeline (existing)
// ────────────────────────────────────────────────────────────────────────
async function handleOutfitPipelineWithFormData(
  formData: FormData,
  userId: string,
) {
  const profileId =
    (formData.get("profile_id") as string | null)?.trim() || null;
  const brandId = (formData.get("brand_id") as string | null)?.trim() || null;
  const influencerId = (formData.get("influencer_id") as string | null)?.trim();
  if (!influencerId)
    return NextResponse.json(
      { error: "influencer_id is required" },
      { status: 400 },
    );

  const exampleImage = formData.get("reference_image") as File | null;
  if (!exampleImage || exampleImage.size === 0) {
    return NextResponse.json(
      { error: "reference_image is required" },
      { status: 400 },
    );
  }

  const outfitImages: File[] = [];
  for (const entry of formData.getAll("outfit_images")) {
    if (entry instanceof File && entry.size > 0) outfitImages.push(entry);
  }
  if (outfitImages.length === 0)
    return NextResponse.json(
      { error: "At least 1 outfit image is required" },
      { status: 400 },
    );
  if (outfitImages.length > 9)
    return NextResponse.json(
      { error: "Maximum 9 outfit images allowed" },
      { status: 400 },
    );

  // ── 이미지 생성 한도 체크 (업로드 이전) ──────────────────────────────────
  // 브랜드 접근 권한 확인 (owner + member)
  if (brandId) {
    const brandAccess = await dbGetBrand(brandId, userId);
    if (!brandAccess) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 403 },
      );
    }
  }

  const sub = brandId ? await getBrandSubscription(brandId) : null;
  // ──────────────────────────────────────────────────────────────────────

  // Build query conditionally
  let infQuery = supabaseAdmin
    .from("models")
    .select("id, name, face_sheet_key, face_master_key")
    .eq("id", influencerId);
  if (brandId) {
    infQuery = infQuery.eq("brand_id", brandId);
  } else {
    infQuery = infQuery.eq("user_id", userId);
  }
  const { data: influencer, error: infErr } = await infQuery.single();

  if (infErr || !influencer)
    return NextResponse.json(
      { error: "Influencer not found" },
      { status: 404 },
    );
  if (!influencer.face_sheet_key) {
    return NextResponse.json(
      { error: "Influencer has no face sheet. Please regenerate." },
      { status: 422 },
    );
  }

  const jobId = crypto.randomUUID();
  const prefix = `render/${influencerId}/${jobId}_input`;
  const priority = await getJobPriority(brandId, sub);

  async function uploadFile(file: File, key: string): Promise<string> {
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/jpeg" ? "jpg" : "png";
    const fullKey = `${prefix}/${key}.${ext}`;
    await uploadBufferToR2({
      bucket: R2_BUCKET,
      key: fullKey,
      contentType: file.type || "image/png",
      body: buf,
    });
    return fullKey;
  }

  // R2 업로드 (최대 10장) 전 atomic 차감 — 402 거부 시 R2 누수 방지
  const consume = await consumeOneGeneration(brandId);
  if (!consume.ok) {
    return NextResponse.json(
      { error: consume.error, code: consume.code },
      { status: consume.status },
    );
  }

  try {
    const referenceKey = await uploadFile(exampleImage, "reference");
    const outfitKeys: string[] = [];
    for (let i = 0; i < outfitImages.length; i++) {
      outfitKeys.push(await uploadFile(outfitImages[i], `outfit_${i}`));
    }

    const { error: insertErr } = await supabaseAdmin.from("jobs").insert({
      id: jobId,
      user_id: userId,
      status: "queued",
      progress: 0,
      priority,
      ...(brandId && { brand_id: brandId }),
      payload: {
        kind: "render_outfit",
        name: `${influencer.name} Outfit`,
        influencer_id: influencerId,
        face_sheet_key: influencer.face_sheet_key,
        reference_image_key: referenceKey,
        outfit_image_keys: outfitKeys,
        outfit_count: outfitKeys.length,
        ...(profileId && { profile_id: profileId }),
      },
      source: process.env.JOB_SOURCE || "production",
    });

    if (insertErr) {
      await refundFailedConsume(consume, {
        pipeline: "render_outfit",
        reason: "jobs.insert failed",
        detail: insertErr.message,
      });
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ jobId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed";
    await refundFailedConsume(consume, {
      pipeline: "render_outfit",
      reason: "R2 upload or job insert threw",
      detail: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────
// Product + Model pipeline (JSON, no file upload — uses R2 key directly)
// ────────────────────────────────────────────────────────────────────────
async function handleProductModelJSON(
  body: {
    influencer_id?: string;
    product_image_key?: string;
    prompt?: string;
    profile_id?: string;
    brand_id?: string;
    pipeline?: string;
    aspect_ratio?: string;
  },
  userId: string,
) {
  const influencerId = body.influencer_id?.trim();
  const productImageKey = body.product_image_key?.trim();
  const prompt = body.prompt?.trim() ?? "";
  const profileId = body.profile_id?.trim() || null;
  const brandId = body.brand_id?.trim() || null;
  const aspectRatio = body.aspect_ratio?.trim() || "1:1";

  if (!influencerId)
    return NextResponse.json(
      { error: "influencer_id is required" },
      { status: 400 },
    );
  if (!productImageKey)
    return NextResponse.json(
      { error: "product_image_key is required" },
      { status: 400 },
    );

  // ── 이미지 생성 한도 체크 ──────────────────────────────────────────────
  // 브랜드 접근 권한 확인 (owner + member)
  if (brandId) {
    const brandAccess = await dbGetBrand(brandId, userId);
    if (!brandAccess) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 403 },
      );
    }
  }

  const sub = brandId ? await getBrandSubscription(brandId) : null;
  // ──────────────────────────────────────────────────────────────────────

  // Build query conditionally
  let infQuery = supabaseAdmin
    .from("models")
    .select("id, name, face_sheet_key")
    .eq("id", influencerId);
  if (brandId) {
    infQuery = infQuery.eq("brand_id", brandId);
  } else {
    infQuery = infQuery.eq("user_id", userId);
  }
  const { data: influencer, error: infErr } = await infQuery.single();

  if (infErr || !influencer)
    return NextResponse.json(
      { error: "Influencer not found" },
      { status: 404 },
    );
  if (!influencer.face_sheet_key)
    return NextResponse.json(
      { error: "Influencer has no face sheet." },
      { status: 422 },
    );

  const jobId = crypto.randomUUID();
  const priority = await getJobPriority(brandId, sub);

  // job insert 직전 atomic 차감 — 월구독 → 팩 fallback
  const consume = await consumeOneGeneration(brandId);
  if (!consume.ok) {
    return NextResponse.json(
      { error: consume.error, code: consume.code },
      { status: consume.status },
    );
  }

  const { error: insertErr } = await supabaseAdmin.from("jobs").insert({
    id: jobId,
    user_id: userId,
    status: "queued",
    progress: 0,
    priority,
    ...(brandId && { brand_id: brandId }),
    payload: {
      kind: "render_product_model",
      name: `${influencer.name} Product`,
      influencer_id: influencerId,
      face_sheet_key: influencer.face_sheet_key,
      product_image_key: productImageKey,
      prompt,
      aspect_ratio: aspectRatio,
      ...(profileId && { profile_id: profileId }),
    },
    source: process.env.JOB_SOURCE || "production",
  });

  if (insertErr) {
    await refundFailedConsume(consume, {
      pipeline: "render_product_model_json",
      reason: "jobs.insert failed",
      detail: insertErr.message,
    });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ jobId });
}

// ────────────────────────────────────────────────────────────────────────
// Product Solo pipeline (JSON, no file upload — uses R2 key directly — styleId 포함)
// ────────────────────────────────────────────────────────────────────────
async function handleProductSoloJSON(
  body: {
    object_image_key?: string;
    prompt?: string;
    style_id?: string;
    brand_id?: string;
    pipeline?: string;
    aspect_ratio?: string;
  },
  userId: string,
) {
  const objectImageKey = body.object_image_key?.trim();
  const prompt = body.prompt?.trim() ?? "";
  const styleId = body.style_id?.trim() || null;
  const brandId = body.brand_id?.trim() || null;
  const aspectRatio = body.aspect_ratio?.trim() || "1:1";

  if (!objectImageKey)
    return NextResponse.json(
      { error: "object_image_key is required" },
      { status: 400 },
    );

  // ── 이미지 생성 한도 체크 ──────────────────────────────────────────────
  // 브랜드 접근 권한 확인 (owner + member)
  if (brandId) {
    const brandAccess = await dbGetBrand(brandId, userId);
    if (!brandAccess) {
      return NextResponse.json(
        { error: "Brand not found or access denied" },
        { status: 403 },
      );
    }
  }

  const sub = brandId ? await getBrandSubscription(brandId) : null;
  // ──────────────────────────────────────────────────────────────────────

  const jobId = crypto.randomUUID();
  const priority = await getJobPriority(brandId, sub);

  // job insert 직전 atomic 차감 — 월구독 → 팩 fallback
  const consume = await consumeOneGeneration(brandId);
  if (!consume.ok) {
    return NextResponse.json(
      { error: consume.error, code: consume.code },
      { status: consume.status },
    );
  }

  const { error: insertErr } = await supabaseAdmin.from("jobs").insert({
    id: jobId,
    user_id: userId,
    status: "queued",
    progress: 0,
    priority,
    ...(brandId && { brand_id: brandId }),
    payload: {
      kind: "render_product_solo",
      name: "Product Render",
      object_image_key: objectImageKey,
      prompt,
      aspect_ratio: aspectRatio,
      ...(styleId && { style_id: styleId }),
    },
    source: process.env.JOB_SOURCE || "production",
  });

  if (insertErr) {
    await refundFailedConsume(consume, {
      pipeline: "render_product_solo_json",
      reason: "jobs.insert failed",
      detail: insertErr.message,
    });
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // style_reuse 신호 기록 (차감은 위 consumeOneGeneration 에서 완료)
  recordStyleReuseSignal({ brandId, styleId, newJobId: jobId, userId });
  return NextResponse.json({ jobId });
}
