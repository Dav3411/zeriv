/**
 * personaPromptGemini.ts — Gemini-optimized model prompt builder
 * Ported from face_variants_gemini.py
 * Shorter comma-separated format optimized for Gemini image generation.
 */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const GENDER_PROMPT: Record<string, string> = {
  female: "beautiful East Asian woman",
  male: "handsome East Asian man",
};

const AGE_GROUP_PROMPT: Record<string, string> = {
  early_20s: "20-23 years old, youthful fresh face",
  late_20s: "27-29 years old, confident mature glow",
  early_30s: "30-34 years old, elegant sophisticated look",
  late_30s: "35-39 years old, graceful distinguished presence",
  early_40s: "40-44 years old, refined timeless beauty",
  late_40s: "45-49 years old, distinguished mature elegance",
};

const FACE_VARIANTS: Record<string, string[]> = {
  cat: [
    "soft cat-like facial beauty, gently upswept almond eyes with a subtle lifted tail, smooth high cheekbones, short philtrum, soft lips, feminine elegant face",
    "soft cat-like facial beauty, large clear eyes with a mild upward tilt at the outer corners, small delicate nose, short philtrum, naturally full lips, pretty approachable face",
    "soft cat-like facial beauty, dreamy almond eyes with a gentle feline lift, softly defined cheekbones, short philtrum, plush lips, graceful feminine face",
    "soft cat-like facial beauty, bright clear eyes with a slight upward curve at the outer corners, soft round cheeks, short philtrum, delicate lips, small chin, sweet youthful face",
    "soft cat-like facial beauty, elongated gentle eyes with a subtle lifted outer corner, smooth cheekbones, short philtrum, soft full lips, serene elegant face",
    "soft cat-like facial beauty, wide eyes with a mild upward slant, gentle cheekbones, short philtrum, glossy plump lips, charming warm impression",
    "soft cat-like facial beauty, softly tilted almond eyes with a languid upswept gaze, delicate cheekbones, short philtrum, tender lips, ethereal slim face",
    "soft cat-like facial beauty, clean almond eyes with a barely perceptible outer lift, smooth flat cheeks, short philtrum, natural lips, gentle cool face",
    "soft cat-like facial beauty, sparkling eyes with a soft upward tilt, baby-smooth cheeks, short philtrum, small pouty lips, fresh youthful face",
  ],
  dog: [
    "puppy-like facial structure, big round eyes with slightly droopy outer corners, soft button nose, full soft cheeks, friendly rounded face",
    "puppy-like facial structure, gentle droopy-outer-corner eyes, round nose tip, plump cheeks, slightly chubby warm face",
    "puppy-like facial structure, wide innocent round eyes, soft nose, full soft cheeks, gentle rounded chin, open friendly expression",
    "puppy-like facial structure, bright sparkling round eyes, soft button nose, warm plump cheeks, sunny cheerful face",
    "puppy-like facial structure, calm steady round eyes, broad soft nose, full cheeks, reliable broad face",
    "puppy-like facial structure, playful round eyes with slight squint, round nose, soft dimpled cheeks, mischievous face",
    "puppy-like facial structure, gentle droopy eyes, soft brow ridge, plump soft cheeks, tender warm face",
    "puppy-like facial structure, clear round eyes, straight nose, balanced cheeks, clean boyish face",
    "puppy-like facial structure, half-moon smiling eyes, round soft nose, full plump cheeks, gentle chin, cozy warm face",
  ],
  fox: [
    "fox-like facial structure, narrow upturned almond eyes with sharp outer corners, high defined cheekbones",
    "fox-like facial structure, elongated sharp upswept eyes, slim cheekbones",
    "fox-like facial structure, seductive upturned eyes, defined cheekbones",
    "fox-like facial structure, sleek narrow eyes with sharp tilt, flat cheeks, clean minimal features, urban sharp face",
    "fox-like facial structure, focused narrow almond eyes, structured cheekbones, intellectual sharp impression",
    "fox-like facial structure, intense upturned eyes, strong cheekbones, fierce elegant face",
    "fox-like facial structure, elongated almond eyes with subtle upward sweep, gentle cheekbones, polished sleek face",
    "fox-like facial structure, thin sharp eyes with icy gaze, minimal soft features, cold beautiful face",
    "fox-like facial structure, narrow eyes, high cheekbones, mysterious alluring face",
  ],
  rabbit: [
    "rabbit-like facial structure, big sparkly round eyes, small button nose, round soft face, plump cheeks, soft round chin, delicate features",
    "rabbit-like facial structure, wide innocent doe eyes, tiny nose, gentle undefined chin, soft round face",
    "rabbit-like facial structure, clear round eyes, small button nose, plump cheeks, soft round chin, delicate harmless features",
    "rabbit-like facial structure, slightly wide startled round eyes, small nose, soft round chin, gentle cheeks, timid delicate face",
    "rabbit-like facial structure, soft dreamy round eyes, tiny nose, extremely soft cheeks, baby chin, fluffy gentle face",
    "rabbit-like facial structure, small bright round eyes, upturned tiny nose, compact round face, plump cheeks, petite cute face",
    "rabbit-like facial structure, big clear dewy eyes, small nose, heart-shaped lips, round face, plump cheeks, lovely sweet face",
    "rabbit-like facial structure, sparkling round eyes with long lashes, petite nose, gentle cheeks, girlish delicate face",
    "rabbit-like facial structure, gentle half-round eyes, very small nose, ultra-soft cheeks, marshmallow soft face",
  ],
  deer: [
    "deer-like facial structure, large gentle almond eyes with long lashes, delicate slim nose, refined symmetrical features",
    "deer-like facial structure, long-lashed doe eyes, slim elegant nose, elegant slim chin, graceful face",
    "deer-like facial structure, soft wide almond eyes with long lashes, delicate nose, graceful symmetrical face",
    "deer-like facial structure, clear almond eyes with natural long lashes, straight slim nose, clean refined features",
    "deer-like facial structure, large serene eyes, delicate high nose bridge, classical elegant face",
    "deer-like facial structure, wide gentle doe eyes, soft delicate nose, pure innocent features",
    "deer-like facial structure, deep calm almond eyes with long lashes, slim nose, refined features, mysterious serene face",
    "deer-like facial structure, perfectly balanced almond eyes, elegant nose, goddess-like proportioned face",
    "deer-like facial structure, soft natural almond eyes, delicate features, naturally beautiful face",
  ],
  snake: [
    "snake-like facial structure, slightly narrow elongated eyes with calm steady gaze, well-defined angular cheekbones, clean bone structure",
    "snake-like facial structure, calm steady almond eyes, defined cheekbones",
    "snake-like facial structure, defined eyes, angular cheekbones, distinctive bone structure",
    "snake-like facial structure, neutral elongated eyes, balanced bone structure, androgynous cool face",
    "snake-like facial structure, narrow eyes, broad cheekbones, nonchalant cool face",
    "snake-like facial structure, steady eyes, structured cheekbones, stubborn determined face",
    "snake-like facial structure, wide-set calm eyes, open bone structure, refreshingly bold face",
    "snake-like facial structure, steady narrow eyes, heavy brow, broad face, weighty presence",
    "snake-like facial structure, sharp elongated eyes, balanced bone structure, sophisticated urban face",
  ],
  hamster: [
    "hamster-like facial structure, big round sparkly eyes, extremely soft chubby cheeks, tiny button nose, baby-faced round head",
    "hamster-like facial structure, wide innocent round eyes, extra chubby cheeks, tiny nose, round wide forehead",
    "hamster-like facial structure, bright cheerful round eyes, extremely full chubby cheeks, tiny button nose, soft undefined chin, baby-faced",
    "hamster-like facial structure, soft squinty smiling eyes, puffy round cheeks, tiny nose, cozy plump face",
    "hamster-like facial structure, big eager round eyes, puffed-out cheeks, small nose, round wide face, excited chubby face",
    "hamster-like facial structure, round eyes, extremely soft cheeks, tiny nose, sleepy plump face",
    "hamster-like facial structure, wide sparkling eyes, lifted chubby cheeks, small upturned nose, round face, excited happy face",
    "hamster-like facial structure, gentle round eyes, maximum chubby cheeks, hidden jaw, round head, ultimate baby face",
    "hamster-like facial structure, slightly squinted bright eyes, plump cheeks, tiny pointed nose, round face, cheeky sly face",
  ],
};

const HUMANIZE_FEATURES: [number, string][] = [
  [0.55, ""],
  [0.1, "single small beauty mark near lips"],
  [0.08, "soft puffy aegyo-sal under-eye fat"],
  [0.08, "tiny mole on cheek"],
  [0.07, "light natural freckles across nose and cheeks"],
  [0.05, "faint beauty mark near eye"],
  [0.04, "very subtle dimple on one cheek"],
  [0.03, "tiny beauty mark on chin"],
];

function pickHumanize(): string {
  const roll = Math.random();
  let cum = 0;
  for (const [prob, feature] of HUMANIZE_FEATURES) {
    cum += prob;
    if (roll < cum) return feature;
  }
  return "";
}

const ANCHOR: Record<string, string> = {
  cat: "distinct feline facial impression",
  dog: "distinct puppy-like facial impression",
  fox: "distinct fox-like facial impression",
  rabbit: "distinct rabbit-like facial impression",
  deer: "distinct deer-like facial impression",
  snake: "distinct snake-like facial impression, cool not fierce",
  hamster: "distinct hamster baby-face impression",
};

// Male-specific overrides: replaces feminine cosmetic descriptors with gender-neutral
// skincare/grooming equivalents for vibes that would otherwise produce inappropriate prompts.
const STYLE_VIBE_PROMPT_MALE: Record<string, string | string[]> = {
  asian_influencer:
    "natural filter-free look, clean groomed skin with skincare-first approach, casual trendy outfit, healthy natural skin, editorial street style",
};

const STYLE_VIBE_PROMPT: Record<string, string | string[]> = {
  asian_influencer:
    "natural filter-free look, minimal makeup, casual trendy outfit, healthy natural skin, editorial street style",
  pure: "minimal natural makeup, soft pastel outfit, clean fair skin, innocent mood",
  cute: "cute kawaii makeup with blush, bright colorful outfit, playful accessories, peachy fresh skin",
  chic: "sharp minimal makeup, monochrome outfit, matte porcelain skin, cool composed mood",
  elegant:
    "refined makeup, pearl jewelry, luxe outfit, luminous satin skin, graceful mood",
  glam: "bold glamorous makeup with glitter, dramatic outfit, dewy radiant skin",
  dreamy:
    "soft ethereal makeup, iridescent accessories, pearl luminous skin, dreamy mood",
  soft_cool:
    "muted cool-tone makeup, relaxed minimal outfit, cool-toned clear skin",
  athletic: "fresh no-makeup look, sporty clean outfit, natural bare skin",
  intellectual: [
    "neat refined makeup, smart casual outfit, clean matte skin, composed mood",
    "neat refined makeup, smart casual outfit, thin-framed glasses, clean matte skin, intellectual composed mood",
  ],
  indie:
    "eclectic layered accessories, artistic makeup, warm natural skin, indie mood",
  model:
    "editorial high-fashion makeup, couture outfit, airbrushed matte skin, avant-garde mood",
  cyberpunk:
    "neon-accent makeup, metallic accessories, cool-toned futuristic outfit, smooth matte skin",
  k_pop_idol:
    "vibrant idol-stage makeup, sparkle accessories, dewy glass skin, energetic mood",
  fresh_fruit_girl:
    "juicy vivid lip color, colorful casual outfit, bright dewy skin, fresh cheerful mood",
  cold_beauty:
    "expressionless icy makeup, cool-toned minimal outfit, pale porcelain skin",
  anime_heroine:
    "2.5D anime illustration style, vibrant fantasy costume, large expressive eyes with detailed iris, smooth cel-shaded skin, soft gradient hair, luminous finish, digital art render",
  k_beauty_standard:
    "clean dewy glass skin, natural gradient lip, subtle eye makeup, clean-girl glow, fair bright complexion",
  seoul_street:
    "Seongsu minimal casual outfit, muted earth-tone makeup, natural matte skin",
  tokyo_harajuku:
    "layered pop colorful mix-match outfit, bold playful makeup, bright clear skin",
  j_idol_2d:
    "2.5D Japanese idol illustration style, sparkly idol stage outfit with frills and bows, large sparkling eyes with highlight dots, smooth cel-shaded pastel skin, soft digital art render, bishoujo aesthetic",
  jk: "Japanese high school student style, navy or dark blue school uniform blazer, white shirt, pleated skirt, clean natural makeup, fresh youthful skin, casual authentic school vibe",
  city_pop_vibe:
    "80s-90s retro analog makeup, warm film-grain skin tone, vintage outfit",
  wanghong:
    "polished editorial glam makeup, xiaohongshu aesthetic outfit, luminous dewy skin",
  pure_seductive:
    "subtle seductive makeup, soft feminine outfit, glass skin with warm glow",
  dominant_elegant:
    "powerful chic makeup, structured outfit, cool satin skin, authoritative aura",
  sweet_girl:
    "pastel pink sweet makeup, adorable feminine outfit, soft rosy skin",
  hong_kong_vintage:
    "retro 70s-80s glam makeup, vintage outfit, warm ivory skin",
  cinematic_retro:
    "90s film-noir moody makeup, analog outfit, contrasty warm skin tone",
  taipei_indie:
    "free-spirited eclectic accessories, artistic makeup, warm natural skin",
  acoustic_youth:
    "cozy natural makeup, warm earthy outfit, sun-kissed natural skin",
  taiwanese_romance:
    "lyrical soft makeup, romantic outfit, warm soft porcelain skin",
  dark_street:
    "no-makeup bare skin with subtle lip tint, black oversized hoodie or jacket, white crop top underneath, choker necklace, cool dark street or alley background, edgy casual mood",
  gyaru:
    "heavy dramatic eye makeup with thick lashes and dark liner, bright tan-toned skin, bold colorful outfit with layered accessories, bleached or brightly dyed hair style, flashy gyaru fashion, vibrant energetic mood",
};

const BODY_TYPE_PROMPT: Record<string, string> = {
  slim: "slim face and slender neck, narrow shoulders",
  normal: "",
  muscular: "toned face with defined jaw, firm broad shoulders",
  chubby: "round soft face with full cheeks, gentle neck, rounded shoulders",
  curvy:
    "slim defined face with soft feminine contour, elegant long neck, smooth round shoulders with visible collarbone, voluptuous impression",
  rugged: "strong square face, sturdy neck, solid broad shoulders",
  brawny:
    "massive square face, very thick neck, extremely wide muscular shoulders, heavyweight build",
};

const HAIR_STYLE_PROMPT: Record<string, string> = {
  short: "short sleek hair",
  long: "long straight silky hair, sleek and smooth with no waves",
  bob: "chin-length bob hair",
  wave_long: "long wavy hair falling past the shoulders",
  wave_bob: "chin-length wavy bob hair",
  twoblock: "two-block undercut hair",
  updo: "elegant updo bun",
  pixie: "pixie cut hair",
  braids: "braided hair",
  ponytail: "high ponytail hair",
  curtain: "curtain bangs hair",
  hime: "hime cut hair",
  shaggy: "shaggy layered hair",
  blunt_bob: "blunt cut bob hair",
  side_part: "side-parted hair",
  middle_part: "middle-parted straight hair",
  undercut: "undercut fade hair",
  slickback: "slicked-back hair",
  // Male hairstyles (keys aligned with UI HAIR_STYLE_MALE)
  buzz_cut: "buzz cut hair, uniformly clipped short",
  crew_cut: "crew cut hair, short sides with slightly longer top",
  fade: "fade haircut, tapered sides",
  slick_back: "slicked-back hair, smoothly swept away from the forehead",
  curtains: "curtain hair, center-parted with hair falling to sides",
  center_part: "center-parted hair",
  textured_crop: "textured crop hair, short and messy",
  regent: "regent hairstyle, voluminous swept-back",
  wolf_cut: "wolf cut hair, shaggy layered",
  perm: "permed hair with loose curls",
  man_bun: "man bun hair",
};

const NO_BANG_STYLES = new Set([
  "updo",
  "pixie",
  "ponytail",
  "braids",
  "slickback",
  "slick_back",
  "buzz_cut",
  "crew_cut",
  "fade",
  "man_bun",
]);

const CAMERA_PROMPT =
  "close-up headshot from shoulders up only, " +
  "full head and hair fully visible with ample space above, " +
  "shoulders visible but cut off at mid-shoulder, no chest or torso visible, " +
  "facing directly forward, neutral plain background, " +
  "symmetric composition";

const QUALITY_PROMPT =
  "photorealistic, 8K, soft studio lighting, sharp focus, no text, no watermark";
const QUALITY_PROMPT_2D =
  "2.5D digital illustration, anime art style, cel-shading, clean line art, vibrant colors, soft gradient, high detail, no text, no watermark";

export type PersonaPromptParams = {
  gender: string;
  age_group: string;
  face_type: string;
  hair_style: string;
  bang?: string;
  style_vibe: string;
  height_cm?: number;
  body_type?: string;
  skin_tone?: string;
  face_shape?: string;
  double_eyelid?: string;
};

// Shorter keyword descriptors aligned to Gemini prompt style
const SKIN_TONE_GEMINI: Record<string, string> = {
  light: "fair light skin",
  medium: "natural medium skin",
  tan: "warm tan skin",
};
const FACE_SHAPE_GEMINI: Record<string, string> = {
  oval: "oval face shape",
  round: "round face shape",
  square: "square jaw face shape",
  heart: "heart-shaped face",
};
const DOUBLE_EYELID_GEMINI: Record<string, string> = {
  double: "double eyelid",
  mono: "monolid eyes",
  inner: "inner double eyelid",
};

export function buildGeminiPersonaPrompt(params: PersonaPromptParams): string {
  const {
    face_type,
    style_vibe,
    gender,
    age_group,
    hair_style,
    body_type = "normal",
  } = params;
  const bangKey = params.bang ?? "random";

  const variants = FACE_VARIANTS[face_type] ?? FACE_VARIANTS.cat;
  const variant = pick(variants);

  const vibeMap =
    gender === "male" && STYLE_VIBE_PROMPT_MALE[style_vibe]
      ? STYLE_VIBE_PROMPT_MALE
      : STYLE_VIBE_PROMPT;
  const vibeVal = vibeMap[style_vibe] ?? "";
  const vibeMod = Array.isArray(vibeVal) ? pick(vibeVal) : vibeVal;

  const is2d = style_vibe === "anime_heroine" || style_vibe === "j_idol_2d";
  const quality = is2d ? QUALITY_PROMPT_2D : QUALITY_PROMPT;

  const skinTone = params.skin_tone
    ? (SKIN_TONE_GEMINI[params.skin_tone] ?? "")
    : "";
  const faceShape = params.face_shape
    ? (FACE_SHAPE_GEMINI[params.face_shape] ?? "")
    : "";
  const eyelid = params.double_eyelid
    ? (DOUBLE_EYELID_GEMINI[params.double_eyelid] ?? "")
    : "";

  const components = [
    GENDER_PROMPT[gender] ?? "person",
    AGE_GROUP_PROMPT[age_group] ?? "",
    eyelid, // user 지정 값 — variant보다 먼저 등장해야 함
    faceShape, // user 지정 값 — variant보다 먼저 등장해야 함
    skinTone, // user 지정 값 — vibe보다 먼저 등장해야 함
    variant,
    pickHumanize(),
    ANCHOR[face_type] ?? "",
    vibeMod,
    BODY_TYPE_PROMPT[body_type] ?? "",
    HAIR_STYLE_PROMPT[hair_style] ?? hair_style,
    hasBang(bangKey, hair_style, gender),
    CAMERA_PROMPT,
    quality,
  ];

  return components.filter(Boolean).join(", ");
}

function hasBang(bangKey: string, hairStyle: string, gender: string): string {
  if (bangKey === "has_bang" && !NO_BANG_STYLES.has(hairStyle))
    return gender === "male"
      ? "with bangs covering his forehead"
      : "with bangs covering her forehead";
  if (bangKey === "none") return "no bangs, forehead fully exposed";
  return "";
}

/** Gemini를 사용하는 style_vibe 목록 */
export const GEMINI_STYLE_VIBES = new Set(["k_beauty_standard", "k_pop_idol"]);
