import { Readable } from "stream";
import archiver from "archiver";
import sharp from "sharp";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getObjectFromR2 } from "@/lib/r2";
import { CHANNEL_PRESETS, type ChannelKey } from "@/lib/channelPresets";
import { getBrandSubscription } from "@/lib/brandSubscription";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { recordSignal } from "@/lib/creativeSignals";

export const runtime = "nodejs";

const VALID_KEYS = new Set<string>(CHANNEL_PRESETS.map((p) => p.key));

/**
 * POST /api/renders/[id]/download-channels
 * Body: { channels: ChannelKey[] }
 * Response: application/zip
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    // 1. 인증
    const { error, userId } = await requireUserId(req);
    if (error || !userId) {
      return new Response(JSON.stringify({ error: error ?? "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = await context.params;

    // 2. Body 파싱 및 유효성 검사
    let channels: ChannelKey[];
    let source: string | null = null;
    try {
      const body = (await req.json()) as {
        channels?: unknown;
        source?: unknown;
      };
      if (
        !Array.isArray(body.channels) ||
        body.channels.length === 0 ||
        !body.channels.every((k) => typeof k === "string" && VALID_KEYS.has(k))
      ) {
        return new Response(
          JSON.stringify({
            error: "channels must be a non-empty array of valid channel keys",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      channels = body.channels as ChannelKey[];
      source = typeof body.source === "string" ? body.source : null;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. assets 테이블에서 asset 조회
    const { data: asset, error: assetErr } = await supabaseAdmin
      .from("assets")
      .select("id, r2_key, brand_id, product_id")
      .eq("id", id)
      .single();

    if (assetErr || !asset) {
      return new Response(JSON.stringify({ error: "Asset not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. 접근 권한 확인 (owner 또는 member)
    const brandAccess = await dbGetBrand(asset.brand_id, userId);
    if (!brandAccess) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 브랜드 이름 조회
    const { data: brand } = await supabaseAdmin
      .from("brands")
      .select("id, name")
      .eq("id", asset.brand_id)
      .maybeSingle();

    // channelExport 한도 체크
    const subscription = await getBrandSubscription(asset.brand_id);
    const channelExport = subscription.plan.channelExport;
    // false = 채널 내보내기 불가 (Free 플랜)
    if (channelExport === false) {
      return new Response(
        JSON.stringify({
          error: `현재 플랜(${subscription.plan.label})에서는 채널별 내보내기를 사용할 수 없습니다. Atelier 이상 플랜으로 업그레이드해주세요.`,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }
    // number = 채널 수 제한, null = 무제한
    const channelLimit = channelExport;
    if (channelLimit !== null && channels.length > channelLimit) {
      return new Response(
        JSON.stringify({
          error: `현재 플랜(${subscription.plan.label})에서는 채널을 최대 ${channelLimit}개까지 선택할 수 있습니다. 업그레이드 후 더 많은 채널을 이용해보세요.`,
        }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    // 5. 제품 이름 조회
    const productId =
      typeof asset.product_id === "string" ? asset.product_id : null;

    let productName: string | null = null;
    if (productId) {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("name")
        .eq("id", productId)
        .single();
      productName = product?.name ?? null;
    }

    // 파일명용 슬러그 생성 (공백→언더바, 특수문자 제거)
    const slugify = (s: string) =>
      s
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w가-힣-]/g, "");
    const brandSlug = slugify(brand?.name ?? "Brand");
    const productSlug = productName ? slugify(productName) : null;

    // 6. R2에서 원본 이미지 획득
    let sourceBuffer: Buffer;
    try {
      const bucket = process.env.R2_BUCKET;
      if (!bucket) throw new Error("R2_BUCKET environment variable is not set");
      const r2Res = await getObjectFromR2({
        bucket,
        key: asset.r2_key,
      });
      if (!r2Res.body) {
        throw new Error("Empty R2 response body");
      }
      // 7. SdkStream → Buffer 변환
      const byteArray = await (
        r2Res.body as { transformToByteArray(): Promise<Uint8Array> }
      ).transformToByteArray();
      sourceBuffer = Buffer.from(byteArray);
    } catch (e) {
      console.error("[download-channels] R2 fetch error:", e);
      return new Response(
        JSON.stringify({ error: "Failed to fetch source image" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 8–9. sharp 리사이즈 + archiver ZIP 생성
    const archive = archiver("zip", { zlib: { level: 6 } });

    // archiver 에러 핸들링
    archive.on("error", (err) => {
      console.error("[download-channels] archiver error:", err);
      archive.abort();
    });

    // 선택한 채널들을 순서대로 리사이즈하여 archive에 추가
    const selectedPresets = CHANNEL_PRESETS.filter((p) =>
      channels.includes(p.key as ChannelKey),
    );

    // 파일명 접두사: BrandName_ProductName_ 또는 BrandName_
    const namePrefix = productSlug
      ? `${brandSlug}_${productSlug}_`
      : `${brandSlug}_`;

    try {
      for (const preset of selectedPresets) {
        const resized = await sharp(sourceBuffer)
          .flatten({ background: "#ffffff" })
          .resize(preset.w, preset.h, { fit: "cover", position: "attention" })
          .jpeg({ quality: 92 })
          .toBuffer();

        archive.append(resized, { name: `${namePrefix}${preset.filename}` });
      }
    } catch (e) {
      console.error("[download-channels] sharp error:", e);
      return new Response(
        JSON.stringify({ error: "Image processing failed" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // archiver Readable → Web ReadableStream 변환
    const webStream = Readable.toWeb(archive) as ReadableStream;

    // finalize() 호출 → archiver가 데이터 쓰기 시작.
    // 실제 전송은 클라이언트가 Response 스트림을 소비할 때 일어난다.
    archive.finalize();

    // 신호 기록 — 실패해도 다운로드 흐름 차단하지 않음
    recordSignal({
      assetId: asset.id,
      signalType: "download",
      userId,
      metadata: { channels, source: source ?? null },
    }).catch((err) =>
      console.error("[download-channels] recordSignal error:", err),
    );

    // 10. ZIP 스트림 반환
    const exportFilename = `${namePrefix}export_${new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "")}.zip`;
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        // RFC 5987: filename*= 로 비ASCII(한글 등) 파일명 지원
        "Content-Disposition": `attachment; filename="export.zip"; filename*=UTF-8''${encodeURIComponent(exportFilename)}`,
      },
    });
  } catch (err) {
    console.error("[download-channels] unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "서버 오류가 발생했습니다. 다시 시도해주세요." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
