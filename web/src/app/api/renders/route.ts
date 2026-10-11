import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getR2PublicUrl, r2KeyToPublicUrl } from "@/lib/r2";
import { isHttpUrl } from "@/lib/style/styleUrlResolver";
import { getBatchUserFeedback } from "@/lib/creativeSignals";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";

/**
 * GET /api/renders?brandId=xxx
 *   [&jobId=www]                       // 단건 조회 (기존 로직 유지)
 *   [&personaId=yyy | &modelId=yyy]    // modelId 필터 (personaId는 하위호환)
 *   [&productId=zzz]                   // productId 필터
 *   [&styleId=sss]                     // styleId 필터
 *   [&kind=render_product_solo]        // kind 필터
 *   [&page=1&pageSize=48]              // 서버 사이드 페이지네이션 (명시 시에만 활성화)
 *
 * 브랜드의 완료된 렌더 에셋 목록 반환 (최신순).
 * assets 테이블의 brand_id/style_id/model_id/product_id 컬럼을 직접 읽어
 * jobs 테이블 의존성 없음.
 *
 * 하위 호환성: page 파라미터가 없으면 기존 동작(최대 1000개, DB 필터는 적용)을 유지.
 * page를 지정하면 offset 페이지네이션으로 전환하고 응답에 page/pageSize/totalPages 포함.
 */
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
  // personaId는 legacy alias — modelId로 통일하되 양쪽 모두 수용
  const modelIdFilter =
    url.searchParams.get("modelId") ?? url.searchParams.get("personaId");
  const productIdFilter = url.searchParams.get("productId");
  const styleIdFilter = url.searchParams.get("styleId");
  const kindFilter = url.searchParams.get("kind");
  const feedbackFilter = url.searchParams.get("feedback"); // "positive" 이면 좋아요한 에셋만
  const jobId = url.searchParams.get("jobId");
  const sinceFilter = url.searchParams.get("since"); // ISO 날짜 문자열

  // 페이지네이션 — page가 명시된 경우에만 활성화 (기존 호출처 호환)
  const pageParam = url.searchParams.get("page");
  const paginated = pageParam !== null;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "48", 10) || 48),
  );
  const offset = (page - 1) * pageSize;

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  // 브랜드 접근 권한 확인 (owner + org 멤버 모두 허용)
  const brand = await dbGetBrand(brandId, userId);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  // feedback=positive 필터: 해당 유저가 이 brand에서 좋아요한 asset_id 목록 미리 조회
  // brand_id 필터 필수 — 같은 user가 여러 브랜드 멤버일 때 다른 브랜드 좋아요 유입 차단
  let positiveAssetIds: string[] | null = null;
  if (feedbackFilter === "positive") {
    const { data: positiveSignals } = await supabaseAdmin
      .from("creative_signals")
      .select("asset_id")
      .eq("user_id", userId)
      .eq("brand_id", brandId)
      .eq("signal_type", "feedback_positive");
    positiveAssetIds = (positiveSignals ?? []).map(
      (s: { asset_id: string }) => s.asset_id,
    );
    // 좋아요한 에셋이 없으면 즉시 빈 응답 반환
    if (positiveAssetIds.length === 0) {
      return NextResponse.json({
        renders: [],
        total: 0,
        page,
        pageSize,
        totalPages: 1,
        weeklyTotal: null,
      });
    }
  }

  // 전체 개수 카운트 (r2_key not null인 에셋만)
  let countQuery = supabaseAdmin
    .from("assets")
    .select("*", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .not("r2_key", "is", null);

  let query = supabaseAdmin
    .from("assets")
    .select(
      "id, job_id, kind, r2_key, created_at, brand_id, style_id, model_id, product_id",
    )
    .eq("brand_id", brandId)
    .not("r2_key", "is", null);

  // 동일한 필터 조합을 count/select 쿼리에 각각 적용 (필터 일관성 보장)
  if (positiveAssetIds !== null) {
    countQuery = countQuery.in("id", positiveAssetIds);
    query = query.in("id", positiveAssetIds);
  }

  if (jobId) {
    countQuery = countQuery.eq("job_id", jobId);
    query = query.eq("job_id", jobId);
  } else {
    if (modelIdFilter) {
      countQuery = countQuery.eq("model_id", modelIdFilter);
      query = query.eq("model_id", modelIdFilter);
    }
    if (productIdFilter) {
      countQuery = countQuery.eq("product_id", productIdFilter);
      query = query.eq("product_id", productIdFilter);
    }
    if (styleIdFilter) {
      countQuery = countQuery.eq("style_id", styleIdFilter);
      query = query.eq("style_id", styleIdFilter);
    }
    if (kindFilter) {
      countQuery = countQuery.eq("kind", kindFilter);
      query = query.eq("kind", kindFilter);
    }
  }

  // weeklyTotal 전용 count 쿼리 — sinceFilter가 있을 때만 생성.
  // 메인 countQuery에는 since를 적용하지 않아 전체 개수를 보존한다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sinceCountQuery: any = null;
  if (sinceFilter) {
    let sq = supabaseAdmin
      .from("assets")
      .select("*", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .not("r2_key", "is", null)
      .gte("created_at", sinceFilter);

    if (positiveAssetIds !== null) {
      sq = sq.in("id", positiveAssetIds);
    }

    if (jobId) {
      sq = sq.eq("job_id", jobId);
    } else {
      if (modelIdFilter) sq = sq.eq("model_id", modelIdFilter);
      if (productIdFilter) sq = sq.eq("product_id", productIdFilter);
      if (styleIdFilter) sq = sq.eq("style_id", styleIdFilter);
      if (kindFilter) sq = sq.eq("kind", kindFilter);
    }

    sinceCountQuery = sq;
  }

  query = query.order("created_at", { ascending: false });

  if (jobId) {
    query = query.limit(1);
  } else if (paginated) {
    query = query.range(offset, offset + pageSize - 1);
  } else {
    // 레거시 호출처 호환: 명시적 page가 없을 때의 기본 상한.
    // 각 행마다 R2 presigned URL을 생성하므로 이 값이 응답 지연을
    // 선형적으로 좌우한다. 기존 동작 보존을 위해 50 유지.
    query = query.limit(50);
  }

  const [{ count: totalDbCount }, { data: assets, error: dbErr }, sinceResult] =
    await Promise.all([
      countQuery,
      query,
      sinceCountQuery ?? Promise.resolve({ count: null }),
    ]);

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  // ── Style 정보 ────────────────────────────────────────────────────────────
  const styleIds = [
    ...new Set((assets ?? []).map((a: any) => a.style_id).filter(Boolean)),
  ];

  const styleInfoMap: Record<
    string,
    { name: string; type: string | null; imageUrl: string | null }
  > = {};
  if (styleIds.length > 0) {
    const { data: styles } = await supabaseAdmin
      .from("styles")
      .select("id, name, type, key_visual_url")
      .in("id", styleIds);
    for (const s of styles ?? []) {
      const rawUrl = s.key_visual_url ?? null;
      let imageUrl: string | null = null;
      if (rawUrl) {
        try {
          imageUrl = isHttpUrl(rawUrl) ? rawUrl : r2KeyToPublicUrl(rawUrl);
        } catch {
          imageUrl = rawUrl;
        }
      }
      styleInfoMap[s.id] = {
        name: s.name,
        type: s.type ?? null,
        imageUrl,
      };
    }
  }

  // ── Model 정보 ────────────────────────────────────────────────────────────
  const modelIds = [
    ...new Set((assets ?? []).map((a: any) => a.model_id).filter(Boolean)),
  ];

  const modelInfoMap: Record<
    string,
    { name: string; face_image_url: string | null }
  > = {};
  if (modelIds.length > 0) {
    const { data: modelsData } = await supabaseAdmin
      .from("models")
      .select("id, name, face_master_key")
      .in("id", modelIds)
      .eq("brand_id", brandId);
    await Promise.all(
      (modelsData ?? []).map(async (m) => {
        modelInfoMap[m.id] = {
          name: m.name,
          face_image_url: m.face_master_key
            ? await getR2PublicUrl(m.face_master_key)
            : null,
        };
      }),
    );
  }

  // ── Product 정보 ─────────────────────────────────────────────────────────
  const productIds = [
    ...new Set((assets ?? []).map((a: any) => a.product_id).filter(Boolean)),
  ];

  const productInfoMap: Record<
    string,
    { name: string; product_category: string | null; image_url: string | null }
  > = {};
  if (productIds.length > 0) {
    const { data: productsData } = await supabaseAdmin
      .from("products")
      .select("id, name, product_category, image_url, image_r2_key, images")
      .in("id", productIds)
      .eq("brand_id", brandId);
    await Promise.all(
      ((productsData ?? []) as any[]).map(async (p) => {
        const images: { role?: string; url?: string; r2_key?: string }[] =
          Array.isArray(p.images) ? p.images : [];
        const heroImg =
          images.find((i) => i.role === "hero") ?? images[0] ?? null;
        const heroUrl = heroImg
          ? heroImg.r2_key
            ? await getR2PublicUrl(heroImg.r2_key)
            : (heroImg.url ?? null)
          : p.image_r2_key
            ? await getR2PublicUrl(p.image_r2_key)
            : (p.image_url ?? null);
        productInfoMap[p.id] = {
          name: p.name,
          product_category: p.product_category ?? null,
          image_url: heroUrl,
        };
      }),
    );
  }

  // 사용자 피드백 상태 batch 조회
  const assetIds = (assets ?? []).map((a: any) => a.id as string);
  const feedbackMap = await getBatchUserFeedback(assetIds, userId);

  const rendersRaw = await Promise.all(
    (assets ?? []).map(async (a: any) => {
      const styleInfo = a.style_id ? styleInfoMap[a.style_id] : null;
      const modelInfo = a.model_id ? modelInfoMap[a.model_id] : null;
      const productInfo = a.product_id ? productInfoMap[a.product_id] : null;
      return {
        id: a.id,
        jobId: a.job_id,
        kind: a.kind,
        name: "",
        imageUrl: a.r2_key ? await getR2PublicUrl(a.r2_key) : null,
        createdAt: a.created_at,
        styleId: a.style_id ?? null,
        styleName: styleInfo?.name ?? null,
        styleType: styleInfo?.type ?? null,
        styleImageUrl: styleInfo?.imageUrl ?? null,
        modelId: a.model_id ?? null,
        productId: a.product_id ?? null,
        modelName: modelInfo?.name ?? null,
        modelImageUrl: modelInfo?.face_image_url ?? null,
        productName: productInfo?.name ?? null,
        productCategory: productInfo?.product_category ?? null,
        productImageUrl: productInfo?.image_url ?? null,
        userFeedback: feedbackMap[a.id] ?? null,
      };
    }),
  );

  // DB에서 이미 필터링했으므로 imageUrl 누락(R2 서명 실패 등)만 추가 제거
  const renders = rendersRaw.filter((r: any) => r.imageUrl);

  const weeklyTotal = sinceCountQuery ? (sinceResult.count ?? null) : null;

  if (paginated) {
    const total = totalDbCount ?? renders.length;
    return NextResponse.json({
      renders,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      weeklyTotal,
    });
  }

  return NextResponse.json({
    renders,
    total: totalDbCount ?? renders.length,
    weeklyTotal,
  });
}
