import Anthropic from "@anthropic-ai/sdk";
import type { Style } from "./style.types";

export const STYLE_CATEGORIES = [
  "클린/미니멀",
  "로맨틱/플로럴",
  "럭셔리/다크",
  "비비드/팝",
  "내추럴/오가닉",
  "아쿠아/크리스탈",
] as const;

export type StyleCategory = (typeof STYLE_CATEGORIES)[number];

const CATEGORY_SYSTEM_PROMPT = `당신은 비주얼 스타일 분류 전문가입니다.

아래 6개 카테고리 중 하나로 스타일을 분류하세요:

1. 클린/미니멀 — 여백, 모노톤, 심플한 구성, 깔끔한 라인
2. 로맨틱/플로럴 — 부드러운 색감, 꽃 모티프, 여성스러운 분위기, 파스텔
3. 럭셔리/다크 — 어두운 톤, 고급스러운 소재감, 강한 대비, 에디토리얼
4. 비비드/팝 — 강렬하고 선명한 색상, 팝아트적 에너지, 과감한 그래픽, 골드·네온·원색, bold·electric·playful·vibrant·radiant·high-impact 키워드, warm high-key 조명, Y2K·글리터·여름 무드
5. 내추럴/오가닉 — 자연 소재, 흙빛 색조, 에코 무드, 따뜻한 질감
6. 아쿠아/크리스탈 — 물·수분·얼음·크리스탈 모티프, 투명하고 맑은 질감, aqua·crystalline·hydrating·icy·water·fluid 키워드, 수면(水面)·물방울·파도·유리 소품, cool-tone 또는 clear 팔레트, 반투명·고반사 텍스처

입력된 스타일 JSON을 분석해서 카테고리 이름만 그대로 출력하세요.
JSON 없이 카테고리 이름 텍스트만 반환합니다. 예: 클린/미니멀`;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * 스타일 데이터를 분석해 카테고리 반환.
 * 분류 실패 시 null 반환 (caller에서 무시).
 */
export async function inferStyleCategory(
  style: Pick<
    Style,
    | "color_palette"
    | "mood_keywords"
    | "lighting"
    | "texture"
    | "scene"
    | "prop_keywords"
  >,
): Promise<StyleCategory | null> {
  const styleJson = JSON.stringify(
    {
      color_palette: style.color_palette,
      mood_keywords: style.mood_keywords,
      lighting: style.lighting,
      texture: style.texture,
      scene: style.scene,
      prop_keywords: style.prop_keywords,
    },
    null,
    2,
  );

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 50,
    system: CATEGORY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: styleJson,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("")
    .trim();

  // 반환된 텍스트가 유효한 카테고리인지 확인 (첫 줄만 취해 공백 제거)
  const normalized = raw.split("\n")[0].trim();
  const matched = STYLE_CATEGORIES.find((c) => c === normalized);
  return matched ?? null;
}
