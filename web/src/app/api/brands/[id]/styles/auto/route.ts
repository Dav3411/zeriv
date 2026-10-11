import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUserId } from "@/lib/authServer";
import {
  dbCreateStyle,
  dbGetBrandProfile,
  dbUpdateStyle,
} from "@/lib/style/style.repository";
import type { StyleCreateInput, Style } from "@/lib/style/style.types";
import { resolveStyleUrls } from "@/lib/style/styleUrlResolver";
import { runStyleSheetPipeline } from "@/lib/style/styleSheetPipeline";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { inferStyleCategory } from "@/lib/style/styleCategory";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AUTO_STYLE_SYSTEM_PROMPT = `당신은 비주얼 스타일 디렉터입니다. 주어진 브랜드·사용자·제품·모델 정보를 분석해서 서로 확연히 구분되는 비주얼 스타일 2종을 JSON으로 생성하세요.

스타일은 오직 **시각적 방향성**만 담아야 합니다. 제품명·제품 카테고리·모델 특성(얼굴형, 나이대, 체형 등)을 직접 언급하거나 묘사하지 마세요. 이 정보들은 색감·라이팅·무드·배경을 결정하는 맥락으로만 참고합니다.

두 스타일은 다음 관점에서 명확히 달라야 합니다:
- 색감 (따뜻한 vs 차가운, 또는 다른 대비)
- 라이팅 (자연광 vs 스튜디오, soft vs hard 등)
- 배경/장면 (라이프스타일 vs 에디토리얼/스튜디오 등)
- 무드 키워드

각 스타일에 짧고 구체적인 이름을 영어로 붙이세요 (예: "Golden Hour Warmth", "Clean Studio Edge").

color_palette는 브랜드에서 실제로 반복·지배적으로 나타나는 색상만 포함합니다. 없는 색은 만들지 마세요. 일반적으로 2~3색이면 충분하며, 브랜드가 명확히 다색이 아니라면 3색을 초과하지 마세요. 각 키는 역할을 나타내는 영어 이름(dominant, secondary, accent 등), 값은 hex 문자열입니다.

반드시 아래 JSON 형식만 출력하세요. 마크다운 없이 순수 JSON:
{
  "style_a": {
    "name": "string",
    "color_palette": { "색이름1": "#hex", "색이름2": "#hex", "...": "#hex" },
    "texture": { "finish": "matte|glossy|satin|metallic", "roughness": 0.3, "light_reflection": "low|medium|high" },
    "lighting": { "source": "natural|studio|mixed", "direction": "front|side|back|top", "contrast": "soft|medium|hard", "color_temperature": "warm|neutral|cool" },
    "scene": { "setting": "studio|outdoor|lifestyle|abstract", "background": "영어로 한 구절 배경 묘사", "depth": "flat|shallow|deep" },
    "mood_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
    "prop_keywords": []
  },
  "style_b": {
    "name": "string",
    "color_palette": { "색이름1": "#hex", "색이름2": "#hex", "...": "#hex" },
    "texture": { "finish": "matte|glossy|satin|metallic", "roughness": 0.3, "light_reflection": "low|medium|high" },
    "lighting": { "source": "natural|studio|mixed", "direction": "front|side|back|top", "contrast": "soft|medium|hard", "color_temperature": "warm|neutral|cool" },
    "scene": { "setting": "studio|outdoor|lifestyle|abstract", "background": "영어로 한 구절 배경 묘사", "depth": "flat|shallow|deep" },
    "mood_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
    "prop_keywords": []
  }
}

prop_keywords는 씬의 분위기를 형성하는 배경 소품만 포함합니다. 아래 규칙을 반드시 지키세요.

규칙:
1. 사용자가 지정한 주 광고 제품(제품 필드에 명시된 것)은 절대 포함하지 않는다. 제품명·카테고리·제품의 외형을 암시하는 표현 모두 금지.
2. 주 제품이 바뀌어도 이 스타일에 남아야 할 소품만 포함한다.
3. 필요하지 않으면 빈 배열로 두세요. 억지로 채우지 마세요. 필요한 경우 최대 5개.

예시 (제품: 향수):
- 허용: ["dried flowers", "silk ribbon", "marble tray", "soft linen cloth"]
- 금지: ["perfume bottle", "fragrance bottle", "glass bottle"] ← 주 제품이므로 제외

예시 (제품: 립스틱):
- 허용: ["rose petals", "gold mirror", "velvet fabric"]
- 금지: ["lipstick", "lip color", "cosmetic tube"] ← 주 제품이므로 제외`;

type AutoStyleBody = {
  prompt?: string;
  productName?: string;
  productCategory?: string;
  modelSelections?: {
    face_type?: string;
    style_vibe?: string;
    age_group?: string;
  };
};

type RawAutoStyle = {
  name: string;
  color_palette: StyleCreateInput["color_palette"];
  texture: StyleCreateInput["texture"];
  lighting: StyleCreateInput["lighting"];
  scene: StyleCreateInput["scene"];
  mood_keywords?: string[];
  prop_keywords?: string[];
};

// POST /api/brands/[id]/styles/auto — AI가 2종 스타일을 즉석 생성 후 type='auto'로 저장
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

  let body: AutoStyleBody = {};
  try {
    body = (await req.json()) as AutoStyleBody;
  } catch {
    // body 없이 호출해도 허용
  }

  const promptText = (body.prompt ?? "").trim();
  const productName = body.productName?.trim();
  const productCategory = body.productCategory?.trim();
  const modelSel = body.modelSelections;

  // 브랜드 프로필 로드 (무드/키워드)
  const brand = await dbGetBrandProfile(brandId);
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const brandKeywords =
    brand.keywords && brand.keywords.length > 0
      ? brand.keywords.join(", ")
      : "미지정";
  const brandMood = brand.mood_summary?.trim() || "미지정";

  const productLine = productName
    ? `${productName}${productCategory ? ` (${productCategory})` : ""}`
    : "미지정";

  const modelLine = modelSel
    ? [modelSel.face_type, modelSel.style_vibe, modelSel.age_group]
        .filter(Boolean)
        .join(", ") || "미지정"
    : "미지정";

  const userMessage =
    `브랜드 정보:\n` +
    `- 키워드: ${brandKeywords}\n` +
    `- 무드 요약: ${brandMood}\n\n` +
    `사용자 프롬프트: "${promptText || "미지정"}"\n` +
    `제품: ${productLine}\n` +
    `모델: ${modelLine}`;

  let message;
  try {
    message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: AUTO_STYLE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    console.error("[auto-style] Anthropic call failed:", e);
    return NextResponse.json(
      { error: "Failed to generate auto styles" },
      { status: 500 },
    );
  }

  const rawText = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  let parsed: { style_a?: RawAutoStyle; style_b?: RawAutoStyle };
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[auto-style] parse failed. raw:", rawText);
    return NextResponse.json(
      { error: "Failed to parse auto style response" },
      { status: 500 },
    );
  }

  if (!parsed.style_a || !parsed.style_b) {
    console.error("[auto-style] incomplete response. raw:", rawText);
    return NextResponse.json(
      { error: "Incomplete auto style response" },
      { status: 500 },
    );
  }

  const toCreateInput = (s: RawAutoStyle): StyleCreateInput => ({
    brand_id: brandId,
    name: s.name,
    type: "auto",
    color_palette: s.color_palette,
    texture: s.texture,
    lighting: s.lighting,
    mood_keywords: s.mood_keywords ?? [],
    scene: s.scene,
    prop_keywords: s.prop_keywords ?? [],
    example_images: [],
    style_sheet_url: null,
    key_visual_url: null,
    parent_style_id: null,
    is_template: false,
    category: null,
    status: "active",
  });

  let styleA: Style;
  let styleB: Style;
  try {
    [styleA, styleB] = await Promise.all([
      dbCreateStyle(brandId, userId, toCreateInput(parsed.style_a)),
      dbCreateStyle(brandId, userId, toCreateInput(parsed.style_b)),
    ]);
  } catch (e) {
    console.error("[auto-style] dbCreateStyle failed:", e);
    return NextResponse.json(
      { error: "Failed to persist auto styles" },
      { status: 500 },
    );
  }

  // 카테고리 자동 배정 (fire-and-forget, 순차 실행 — API rate limit 방어)
  void (async () => {
    if (!styleA.category) {
      try {
        const category = await inferStyleCategory(styleA);
        if (category)
          await dbUpdateStyle(styleA.id, styleA.brand_id, { category });
      } catch (e) {
        console.error("[assignCategory] styleA failed:", e);
      }
    }
    if (!styleB.category) {
      try {
        const category = await inferStyleCategory(styleB);
        if (category)
          await dbUpdateStyle(styleB.id, styleB.brand_id, { category });
      } catch (e) {
        console.error("[assignCategory] styleB failed:", e);
      }
    }
  })();

  // 스타일 시트 + 키 비주얼 생성을 응답 후 백그라운드에서 실행
  after(async () => {
    try {
      await runStyleSheetPipeline(styleA.brand_id, styleA.id, userId);
    } catch (e) {
      console.error("[auto] style-sheet pipeline failed:", e);
    }
  });
  after(async () => {
    try {
      await runStyleSheetPipeline(styleB.brand_id, styleB.id, userId);
    } catch (e) {
      console.error("[auto] style-sheet pipeline failed:", e);
    }
  });

  return NextResponse.json(
    { styleA: resolveStyleUrls(styleA), styleB: resolveStyleUrls(styleB) },
    { status: 201 },
  );
}
