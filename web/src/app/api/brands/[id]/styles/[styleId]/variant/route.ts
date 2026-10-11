import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUserId } from "@/lib/authServer";
import { dbCreateVariant, dbGetStyle } from "@/lib/style/style.repository";
import type { StyleUpdateInput } from "@/lib/style/style.types";
import { resolveStyleUrls } from "@/lib/style/styleUrlResolver";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VARIANT_SYSTEM_PROMPT = `당신은 비주얼 스타일 디렉터입니다. 주어진 부모 스타일의 JSON과 변형 지시어를 바탕으로 수정된 스타일 파라미터를 JSON으로 출력합니다.

규칙:
- name 필드는 출력하지 않습니다 (호출자가 지정합니다)
- 변형 지시어의 방향성을 반영하되, 브랜드 정체성은 유지합니다
- 출력은 순수 JSON만 (마크다운 없이)
- 출력 구조는 부모 스타일과 동일해야 합니다 (color_palette, texture, lighting, mood_keywords, scene, prop_keywords)`;

// POST /api/brands/[id]/styles/[styleId]/variant — 배리언트 생성
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; styleId: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandId, styleId } = await params;
  const body = (await req.json()) as {
    name?: string;
    instruction?: string;
    patch?: StyleUpdateInput;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(brandId, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const parentStyle = await dbGetStyle(styleId, brandId);
  if (!parentStyle) {
    return NextResponse.json({ error: "Style not found" }, { status: 404 });
  }

  let variantPatch: StyleUpdateInput = {
    ...(body.patch ?? {}),
    name: body.name.trim(),
  };

  // AI instruction이 있으면 Claude로 파라미터 변형
  if (body.instruction?.trim()) {
    const parentJson = JSON.stringify(
      {
        color_palette: parentStyle.color_palette,
        texture: parentStyle.texture,
        lighting: parentStyle.lighting,
        mood_keywords: parentStyle.mood_keywords,
        scene: parentStyle.scene,
        prop_keywords: parentStyle.prop_keywords,
      },
      null,
      2,
    );

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: VARIANT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `부모 스타일:\n${parentJson}\n\n변형 방향: "${body.instruction.trim()}"`,
          },
        ],
      });
    } catch (e) {
      console.error("[variant] Anthropic call failed:", e);
      return NextResponse.json(
        { error: "Failed to generate variant" },
        { status: 500 },
      );
    }

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned) as Partial<StyleUpdateInput>;
      variantPatch = {
        ...variantPatch,
        ...parsed,
        name: body.name.trim(), // name은 항상 사용자가 지정한 값 사용
      };
    } catch {
      console.error("[variant] parse failed. raw:", rawText);
      return NextResponse.json(
        { error: "Failed to parse variant response" },
        { status: 500 },
      );
    }
  }

  const variant = await dbCreateVariant(styleId, userId, brandId, variantPatch);

  return NextResponse.json(
    { style: resolveStyleUrls(variant) },
    { status: 201 },
  );
}
