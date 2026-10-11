/**
 * backgroundPromptBuilder.ts — 배경 이미지 생성용 prompt 조합기
 *
 * 순수 함수 — 외부 의존성 없음. 단독 테스트 가능.
 * preset 조합 로직만 담당하며, 생성 API 호출은 하지 않는다.
 */

import {
  SCENE_PRESETS,
  CAMERA_PRESETS,
  LIGHTING_PRESETS,
  FLOOR_PRESETS,
  SUBJECT_ZONE_PRESETS,
  STYLE_MODE_PRESETS,
  type SelectedBackground,
} from "@/lib/background/backgroundPresets";

// ─────────────────────────────────────────────────────────────────────────────
// Output type
// ─────────────────────────────────────────────────────────────────────────────

export interface BackgroundPromptResult {
  prompt: string;
  negativePrompt: string;
}

export interface BackgroundPromptSnapshot extends BackgroundPromptResult {
  sceneType: string;
  styleMode: string;
  cameraProfile: string;
  lightingProfile: string;
  floorMaterial: string;
  subjectZonePreference: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Universal negative prompt fragments
// ─────────────────────────────────────────────────────────────────────────────

const UNIVERSAL_NEGATIVE = [
  "people, human, person, face, character, model",
  "crowded, busy foreground, props blocking center",
  "blurry, out of focus, low quality, watermark, text, logo",
  "extreme wide angle distortion, fisheye, cropped floor",
  "dark vignette, heavy grain, overexposed",
].join(", ");

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * buildBackgroundPrompt — preset 조합으로 배경 생성 prompt 생성.
 *
 * @param input - validated SelectedBackground (preset keys)
 * @returns { prompt, negativePrompt }
 */
export function buildBackgroundPrompt(input: SelectedBackground): BackgroundPromptResult {
  const scene = SCENE_PRESETS[input.sceneType];
  const camera = CAMERA_PRESETS[input.cameraProfile];
  const lighting = LIGHTING_PRESETS[input.lightingProfile];
  const floor = FLOOR_PRESETS[input.floorMaterial];
  const zone = SUBJECT_ZONE_PRESETS[input.subjectZonePreference];
  const style = STYLE_MODE_PRESETS[input.styleMode];

  const promptParts = [
    // Core: empty scene
    scene.sceneDescription,
    // Floor
    floor,
    // Subject zone constraint
    zone,
    // Camera
    camera,
    // Lighting
    lighting,
    // Style
    style.positive,
    // Compositing intent
    "clean cinematic background plate for compositing, no subject in frame, " +
    "visible floor and back wall, balanced composition",
  ];

  const negativeParts = [
    UNIVERSAL_NEGATIVE,
    scene.sceneNegative,
    style.negative,
  ];

  return {
    prompt: promptParts.join(", "),
    negativePrompt: negativeParts.join(", "),
  };
}

/**
 * buildBackgroundPromptSnapshot — prompt + 입력 옵션을 함께 담은 저장용 객체 반환
 */
export function buildBackgroundPromptSnapshot(
  input: SelectedBackground
): BackgroundPromptSnapshot {
  const { prompt, negativePrompt } = buildBackgroundPrompt(input);
  return {
    ...input,
    prompt,
    negativePrompt,
  };
}
