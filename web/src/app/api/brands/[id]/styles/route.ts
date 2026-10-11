import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUserId } from "@/lib/authServer";
import {
  dbListStyles,
  dbCreateStyle,
  dbUpdateBrandProfile,
  dbUpdateStyle,
} from "@/lib/style/style.repository";
import type { Style, StyleCreateInput } from "@/lib/style/style.types";
import { isValidPalette } from "@/lib/style/styleSheet";
import {
  resolveStyleListUrls,
  resolveStyleUrls,
} from "@/lib/style/styleUrlResolver";
import sharp from "sharp";
import { getBrandSubscription } from "@/lib/brandSubscription";
import {
  getOrgIdFromBrand,
  getOrgStyleCount,
} from "@/lib/organizationSubscription";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { inferStyleCategory } from "@/lib/style/styleCategory";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STYLE_ANALYSIS_SYSTEM_PROMPT = `당신은 브랜드 비주얼 스타일을 분석하는 시니어 크리에이티브 디렉터입니다.

입력된 레퍼런스 이미지들을 분석하여 비주얼 스타일 파라미터 JSON을 생성하세요.

## 분석 원칙
1. 이미지 우선 — 모든 시각적 스타일은 반드시 이미지 기준으로 분석
2. 공통 스타일 추출 — 여러 이미지에 반복적으로 나타나는 공통된 시각 규칙을 추출
3. 재현 가능성 중심 — 실제 생성 파라미터로 쓰일 수 있게 구조화
4. user_prompt가 있으면 mood_keywords와 prop_keywords에만 보조적으로 반영
5. 공간과 소품 — 배경 환경, 소재, 소품 등 바이브를 전달하는 물리적 요소를 적극 분석

반드시 아래 형식의 JSON만 출력하세요. 마크다운 없이 순수 JSON만.

출력 형식:
{
  "color_palette": { "색이름1": "#hex", "색이름2": "#hex", "...": "#hex" },
  "texture": { "finish": "matte|glossy|satin|metallic", "roughness": 0.0, "light_reflection": "low|medium|high" },
  "lighting": { "source": "natural|studio|mixed", "direction": "front|side|back|top", "contrast": "soft|medium|hard", "color_temperature": "warm|neutral|cool" },
  "scene": { "setting": "studio|outdoor|lifestyle|abstract", "background": "배경 소재/환경 한 구절 (영어)", "depth": "flat|shallow|deep" },
  "mood_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7"],
  "prop_keywords": ["prop1", "prop2", "prop3", "prop4", "prop5"]
}

각 필드 설명:
- color_palette: 이미지에서 실제로 반복·지배적으로 나타나는 색상만 추출. 없는 색은 만들지 말 것. 일반적으로 2~3색이면 충분하며 브랜드가 명확히 다색이 아니라면 3색을 초과하지 말 것. 각 색에는 역할을 나타내는 영어 이름(dominant, secondary, accent 등)을 키로 부여하고 값은 hex 문자열.
- texture.roughness: 0.0(매끈) ~ 1.0(거친)
- scene.setting: 촬영 환경 유형 (studio=스튜디오 세팅, outdoor=야외, lifestyle=생활공간, abstract=추상적/비사실적)
- scene.background: 배경의 소재·환경을 한 구절로 (예: "white seamless", "marble surface", "linen backdrop", "concrete floor", "wooden table")
- scene.depth: 배경 공간감 (flat=평면적, shallow=얕은 공간감, deep=깊은 공간감)
- mood_keywords: 이미지의 분위기를 나타내는 키워드 7개
- prop_keywords: 스타일을 설명하는 데 꼭 필요한 소품/물체 키워드만 포함. 소품이 스타일 정체성에 중요하지 않으면 빈 배열. 억지로 채우지 말 것. 필요한 경우 최대 5개.`;

type ImageInput = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
};

// 스타일 카테고리 자동 배정 (fire-and-forget)
async function assignCategoryAsync(style: Style): Promise<void> {
  if (style.category) return; // 이미 있으면 스킵
  try {
    const category = await inferStyleCategory(style);
    if (category) await dbUpdateStyle(style.id, style.brand_id, { category });
  } catch (e) {
    console.error("[assignCategory] failed:", e);
  }
}

// 브랜드의 모든 스타일 mood_keywords를 종합해 무드 요약 1줄 생성 후 저장 (fire-and-forget)
async function updateMoodSummary(brandId: string): Promise<void> {
  try {
    const styles = await dbListStyles(brandId);
    const allKeywords = styles.flatMap((s) => s.mood_keywords).filter(Boolean);
    if (allKeywords.length === 0) return;

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `다음 키워드들로 브랜드의 전체적인 무드를 한 문장(20자 이내)으로 요약해줘. 키워드: ${allKeywords.join(", ")}. 결과는 요약 문장만 출력.`,
        },
      ],
    });

    const summary = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("")
      .trim();

    if (summary) {
      await dbUpdateBrandProfile(brandId, { mood_summary: summary });
    }
  } catch (e) {
    console.error("[updateMoodSummary] failed:", e);
  }
}

// GET /api/brands/[id]/styles — 브랜드 스타일 목록
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const ownStyles = await dbListStyles(brandId);

  // 글로벌 템플릿(is_template=true)은 더 이상 brand 별로 "저장"되지 않고
  // /api/templates 에서 직접 사용된다. 이 엔드포인트는 "내 스타일"
  // 관점만 노출하므로 ownStyles 만 반환한다.

  // styleCount + styleLimit 계산 — ownStyles 기준
  const brandSub = await getBrandSubscription(brandId);
  const styleLimit = brandSub?.plan.styleLimit ?? null;
  let styleCount: number;
  if (styleLimit !== null) {
    const orgId = await getOrgIdFromBrand(brandId);
    styleCount = orgId
      ? await getOrgStyleCount(orgId)
      : await (async () => {
          const { count } = await supabaseAdmin
            .from("styles")
            .select("id", { count: "exact", head: true })
            .eq("brand_id", brandId)
            .eq("status", "active")
            .neq("type", "auto");
          return count ?? 0;
        })();
  } else {
    styleCount = ownStyles.length;
  }

  return NextResponse.json({
    styles: resolveStyleListUrls(ownStyles),
    styleCount,
    styleLimit,
  });
}

// POST /api/brands/[id]/styles — 스타일 생성
// 모드 A: Content-Type: application/json — 직접 입력
// 모드 B: Content-Type: multipart/form-data — AI 분석
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // ── organization 풀 기준 스타일 한도 체크 ────────────────────────────
  const brandSub = await getBrandSubscription(brandId);
  const styleLimit = brandSub?.plan.styleLimit ?? null;

  // styleLimit === 0: 해당 플랜은 스타일 생성 자체가 미포함 — 즉시 차단.
  if (styleLimit === 0) {
    return NextResponse.json(
      {
        error:
          "스타일 생성은 Quick Plus 플랜부터 이용 가능합니다. 플랜을 업그레이드해주세요.",
        code: "STYLE_LIMIT_EXCEEDED",
      },
      { status: 403 },
    );
  }

  if (styleLimit !== null) {
    const orgId = await getOrgIdFromBrand(brandId);
    // org 풀 합산 — 같은 org의 다른 brand 스타일까지 포함
    const totalCount = orgId
      ? await getOrgStyleCount(orgId)
      : await (async () => {
          const { count } = await supabaseAdmin
            .from("styles")
            .select("id", { count: "exact", head: true })
            .eq("brand_id", brandId)
            .eq("status", "active")
            .neq("type", "auto");
          return count ?? 0;
        })();
    if (totalCount >= styleLimit) {
      return NextResponse.json(
        {
          error: `현재 플랜(${brandSub!.plan.label})은 스타일을 최대 ${styleLimit}개까지 생성할 수 있습니다. 플랜을 업그레이드해주세요.`,
        },
        { status: 403 },
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────

  const contentType = req.headers.get("content-type") ?? "";

  // ── 모드 B: AI 분석 (multipart/form-data) ──────────────────────────────
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const name = formData.get("name") as string | null;
    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const imageFiles = formData.getAll("images[]") as File[];
    if (imageFiles.length > 5) {
      return NextResponse.json(
        { error: "최대 5장까지 업로드 가능합니다" },
        { status: 400 },
      );
    }

    const userPrompt = (formData.get("user_prompt") as string | null) ?? "";

    if (imageFiles.length === 0 && !userPrompt.trim()) {
      return NextResponse.json(
        { error: "이미지 또는 텍스트 설명이 필요합니다" },
        { status: 400 },
      );
    }

    // 이미지를 base64로 변환 (magic bytes로 실제 포맷 감지)
    function detectMimeType(
      buf: Buffer,
    ): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
      if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
      if (
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47
      )
        return "image/png";
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
        return "image/gif";
      if (
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50
      )
        return "image/webp";
      // 감지 실패 시 기본값 반환
      return "image/jpeg";
    }

    const MAX_BYTES = 4 * 1024 * 1024; // 4MB (여유 있게)

    const imageBlocks: Anthropic.ImageBlockParam[] = await Promise.all(
      imageFiles.map(async (file) => {
        let buffer = Buffer.from(await file.arrayBuffer());
        let wasResized = false;

        // 4MB 초과 시 short edge 1568px로 리사이즈 후 JPEG 재인코딩
        if (buffer.length > MAX_BYTES) {
          buffer = Buffer.from(
            await sharp(buffer)
              .resize({
                width: 1568,
                height: 1568,
                fit: "inside",
                withoutEnlargement: true,
              })
              .jpeg({ quality: 85 })
              .toBuffer(),
          );
          wasResized = true;
        }

        const base64 = buffer.toString("base64");
        const mimeType:
          | "image/jpeg"
          | "image/png"
          | "image/gif"
          | "image/webp" = wasResized ? "image/jpeg" : detectMimeType(buffer);

        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType,
            data: base64,
          },
        };
      }),
    );

    const userText =
      imageFiles.length > 0
        ? userPrompt.trim()
          ? `사용자 의도 (보조): ${userPrompt.trim()}\n\n위 이미지들을 분석하여 스타일 JSON을 생성하세요.`
          : "위 이미지들을 분석하여 스타일 JSON을 생성하세요."
        : `다음 스타일 설명을 분석하여 스타일 JSON을 생성하세요.\n\n${userPrompt.trim()}`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: STYLE_ANALYSIS_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            imageBlocks.length > 0
              ? [...imageBlocks, { type: "text", text: userText }]
              : [{ type: "text", text: userText }],
        },
      ],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    let analyzed: Record<string, unknown>;
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      analyzed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse model response", raw: rawText },
        { status: 500 },
      );
    }

    const palette = analyzed.color_palette as StyleCreateInput["color_palette"];
    if (!isValidPalette(palette)) {
      return NextResponse.json(
        { error: "color_palette가 유효하지 않습니다", raw: rawText },
        { status: 500 },
      );
    }

    const input: StyleCreateInput = {
      brand_id: brandId,
      name: name.trim(),
      type: "custom",
      color_palette: palette,
      texture: analyzed.texture as StyleCreateInput["texture"],
      lighting: analyzed.lighting as StyleCreateInput["lighting"],
      mood_keywords: (analyzed.mood_keywords as string[]) ?? [],
      scene: analyzed.scene as StyleCreateInput["scene"],
      prop_keywords: (analyzed.prop_keywords as string[]) ?? [],
      example_images: [],
      style_sheet_url: null,
      key_visual_url: null,
      parent_style_id: null,
      is_template: false,
      category: null,
      status: "active",
    };

    const style = await dbCreateStyle(brandId, userId, input);
    void updateMoodSummary(brandId);
    void assignCategoryAsync(style);
    return NextResponse.json(
      { style: resolveStyleUrls(style) },
      { status: 201 },
    );
  }

  // ── 모드 A: 직접 입력 (application/json) ────────────────────────────────
  const body = await req.json();
  const {
    name,
    color_palette,
    texture,
    lighting,
    mood_keywords,
    type,
    scene,
    prop_keywords,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!color_palette || !texture || !lighting) {
    return NextResponse.json(
      {
        error: "color_palette, texture, lighting are required",
      },
      { status: 400 },
    );
  }

  const input: StyleCreateInput = {
    brand_id: brandId,
    name: name.trim(),
    type: type ?? "custom",
    color_palette,
    texture,
    lighting,
    mood_keywords: mood_keywords ?? [],
    scene: scene ?? { setting: "studio", background: "", depth: "flat" },
    prop_keywords: prop_keywords ?? [],
    example_images: [],
    style_sheet_url: null,
    key_visual_url: null,
    parent_style_id: null,
    is_template: false,
    category: null,
    status: "active",
  };

  const style = await dbCreateStyle(brandId, userId, input);
  void updateMoodSummary(brandId);
  void assignCategoryAsync(style);
  return NextResponse.json({ style: resolveStyleUrls(style) }, { status: 201 });
}
