/**
 * backgroundPresets.ts — 배경 생성 preset 정의 및 validation
 *
 * 각 preset은 prompt builder가 조합하는 재료다.
 * 새 preset 추가는 각 registry에만 하면 된다 — builder 수정 불필요.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Type definitions
// ─────────────────────────────────────────────────────────────────────────────

export type SceneType =
  | "modern_cafe"
  | "minimal_studio"
  | "urban_street"
  | "clean_bedroom"
  | "fashion_rooftop"
  | "luxury_hotel_lobby"
  | "night_city_street"
  | "bright_office";

export type StyleMode = "realistic" | "25d";

export type CameraProfile =
  | "eye_level_50mm"
  | "slight_low_50mm"
  | "editorial_centered"
  | "clean_fullbody_stage";

export type LightingProfile =
  | "warm_soft_right"
  | "soft_daylight_front"
  | "cool_neon_left"
  | "sunset_back_rim"
  | "flat_studio_clean";

export type FloorMaterial =
  | "wood"
  | "concrete"
  | "tile"
  | "plain_studio"
  | "asphalt";

export type SubjectZonePreference = "center" | "center_left" | "center_right";

export interface SelectedBackground {
  sceneType: SceneType;
  styleMode: StyleMode;
  cameraProfile: CameraProfile;
  lightingProfile: LightingProfile;
  floorMaterial: FloorMaterial;
  subjectZonePreference: SubjectZonePreference;
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset registries — prompt fragment sources
// ─────────────────────────────────────────────────────────────────────────────

export interface ScenePreset {
  sceneDescription: string;
  /** Scene-specific additions to negative prompt */
  sceneNegative: string;
  /** Recommended lightings for this scene (informational) */
  recommendedLightings: LightingProfile[];
}

export const SCENE_PRESETS: Record<SceneType, ScenePreset> = {
  modern_cafe: {
    sceneDescription:
      "empty modern cafe interior, minimalist design, wooden furniture in background, " +
      "coffee bar visible behind, warm ambient atmosphere, clean floor, no customers",
    sceneNegative: "outdoor, street, bedroom, studio backdrop, crowded tables",
    recommendedLightings: ["warm_soft_right", "soft_daylight_front"],
  },
  minimal_studio: {
    sceneDescription:
      "clean minimal studio environment, seamless background, neutral walls, " +
      "professional photo studio feel, empty floor, subtle gradient backdrop",
    sceneNegative: "outdoor, busy scene, props, furniture clutter, windows",
    recommendedLightings: ["flat_studio_clean", "soft_daylight_front"],
  },
  urban_street: {
    sceneDescription:
      "empty urban street background, city buildings behind, clean sidewalk, " +
      "urban architecture, no pedestrians, contemporary city feel",
    sceneNegative: "indoor, studio, nature, crowded street, cars in foreground",
    recommendedLightings: ["cool_neon_left", "soft_daylight_front", "sunset_back_rim"],
  },
  clean_bedroom: {
    sceneDescription:
      "clean modern bedroom interior, bed visible in background, soft decor, " +
      "organized space, empty floor area in foreground, minimal clutter",
    sceneNegative: "outdoor, street, studio, dark room, messy room",
    recommendedLightings: ["warm_soft_right", "soft_daylight_front"],
  },
  fashion_rooftop: {
    sceneDescription:
      "urban rooftop setting, city skyline in background, clean rooftop floor, " +
      "open sky, fashion editorial feel, empty foreground space",
    sceneNegative: "indoor, enclosed space, basement, crowded rooftop",
    recommendedLightings: ["sunset_back_rim", "soft_daylight_front", "cool_neon_left"],
  },
  luxury_hotel_lobby: {
    sceneDescription:
      "elegant luxury hotel lobby, marble floor, high ceiling, refined decor in background, " +
      "empty lobby foreground, grand architectural details, no guests",
    sceneNegative: "outdoor, casual setting, cluttered, budget interior",
    recommendedLightings: ["warm_soft_right", "flat_studio_clean"],
  },
  night_city_street: {
    sceneDescription:
      "nighttime urban street, neon lights and city glow in background, wet pavement reflections, " +
      "empty sidewalk foreground, cinematic night atmosphere, no pedestrians",
    sceneNegative: "daytime, indoor, bright outdoor, nature, suburban",
    recommendedLightings: ["cool_neon_left", "sunset_back_rim"],
  },
  bright_office: {
    sceneDescription:
      "bright modern office environment, clean workstations in background, large windows, " +
      "open plan office feel, empty floor area in foreground, professional setting",
    sceneNegative: "outdoor, night, dark, home, industrial",
    recommendedLightings: ["soft_daylight_front", "flat_studio_clean"],
  },
};

export const CAMERA_PRESETS: Record<CameraProfile, string> = {
  eye_level_50mm:
    "eye-level camera angle, 50mm lens perspective, minimal distortion, balanced framing, " +
    "straight-on full-body shot composition",
  slight_low_50mm:
    "slightly low camera angle, 50mm lens look, subtle upward perspective, " +
    "elongating full-body framing, clean composition",
  editorial_centered:
    "editorial camera framing, centered composition, wide but not extreme, " +
    "fashion magazine perspective, full-body centered",
  clean_fullbody_stage:
    "clean full-body stage framing, centered subject zone, minimal camera angle, " +
    "performance stage perspective, wide enough for full body",
};

export const LIGHTING_PRESETS: Record<LightingProfile, string> = {
  warm_soft_right:
    "soft warm indoor lighting from the right side, gentle shadows on the left, " +
    "cozy indoor ambient light, golden warm tones",
  soft_daylight_front:
    "soft diffused daylight from the front, even illumination, minimal harsh shadows, " +
    "natural daylight color temperature",
  cool_neon_left:
    "cool blue-purple neon accent light from the left, urban nighttime ambiance, " +
    "dramatic cool color cast, cinematic neon glow",
  sunset_back_rim:
    "warm sunset back-rim light, golden hour glow from behind, " +
    "subtle rim light outline, warm backlit atmosphere",
  flat_studio_clean:
    "flat clean studio lighting, even illumination from all sides, " +
    "no strong shadows, professional product-quality lighting",
};

export const FLOOR_PRESETS: Record<FloorMaterial, string> = {
  wood: "warm hardwood floor, visible wood grain texture, clean polished surface",
  concrete: "smooth concrete floor, industrial texture, matte surface finish",
  tile: "clean tile floor, subtle grout lines, reflective surface",
  plain_studio: "plain studio floor, seamless white or light grey surface, no texture",
  asphalt: "asphalt pavement, urban street surface, dry and clean",
};

export const SUBJECT_ZONE_PRESETS: Record<SubjectZonePreference, string> = {
  center: "clear open standing area in the center foreground, space reserved for a full-body subject in the middle",
  center_left: "clear open standing area in the left-center foreground, space reserved for a full-body subject on the left side",
  center_right: "clear open standing area in the right-center foreground, space reserved for a full-body subject on the right side",
};

export const STYLE_MODE_PRESETS: Record<StyleMode, { positive: string; negative: string }> = {
  realistic: {
    positive:
      "photorealistic, realistic textures, natural materials, cinematic but believable, " +
      "high quality photography, real environment",
    negative: "anime, cartoon, illustrated, 2D, flat design, cel shading, stylized",
  },
  "25d": {
    positive:
      "semi-realistic environment, slightly stylized textures, clean edges, " +
      "2.5D inspired background, anime-adjacent but usable as compositing plate",
    negative: "photorealistic, hyper-realistic, raw photograph, dark gritty texture",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Allowed value sets (for validation)
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED_SCENE_TYPES = new Set<string>(Object.keys(SCENE_PRESETS));
export const ALLOWED_STYLE_MODES = new Set<string>(["realistic", "25d"]);
export const ALLOWED_CAMERA_PROFILES = new Set<string>(Object.keys(CAMERA_PRESETS));
export const ALLOWED_LIGHTING_PROFILES = new Set<string>(Object.keys(LIGHTING_PRESETS));
export const ALLOWED_FLOOR_MATERIALS = new Set<string>(Object.keys(FLOOR_PRESETS));
export const ALLOWED_SUBJECT_ZONES = new Set<string>(Object.keys(SUBJECT_ZONE_PRESETS));

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string>;
}

export function validateBackgroundRequest(input: Partial<SelectedBackground>): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.sceneType || !ALLOWED_SCENE_TYPES.has(input.sceneType)) {
    errors.sceneType = `Invalid sceneType "${input.sceneType}". Allowed: ${[...ALLOWED_SCENE_TYPES].join(", ")}`;
  }
  if (!input.styleMode || !ALLOWED_STYLE_MODES.has(input.styleMode)) {
    errors.styleMode = `Invalid styleMode "${input.styleMode}". Allowed: realistic, 25d`;
  }
  if (!input.cameraProfile || !ALLOWED_CAMERA_PROFILES.has(input.cameraProfile)) {
    errors.cameraProfile = `Invalid cameraProfile "${input.cameraProfile}". Allowed: ${[...ALLOWED_CAMERA_PROFILES].join(", ")}`;
  }
  if (!input.lightingProfile || !ALLOWED_LIGHTING_PROFILES.has(input.lightingProfile)) {
    errors.lightingProfile = `Invalid lightingProfile "${input.lightingProfile}". Allowed: ${[...ALLOWED_LIGHTING_PROFILES].join(", ")}`;
  }
  if (!input.floorMaterial || !ALLOWED_FLOOR_MATERIALS.has(input.floorMaterial)) {
    errors.floorMaterial = `Invalid floorMaterial "${input.floorMaterial}". Allowed: ${[...ALLOWED_FLOOR_MATERIALS].join(", ")}`;
  }
  if (!input.subjectZonePreference || !ALLOWED_SUBJECT_ZONES.has(input.subjectZonePreference)) {
    errors.subjectZonePreference = `Invalid subjectZonePreference "${input.subjectZonePreference}". Allowed: center, center_left, center_right`;
  }

  return { valid: Object.keys(errors).length === 0, fieldErrors: errors };
}
