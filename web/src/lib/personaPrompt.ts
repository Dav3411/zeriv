/**
 * personaPrompt.ts — AI Model closeup prompt builder (Layered Prompt Engine)
 * Ported from face_variants.py
 */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Layer 1: IDENTITY
const GENDER_PROMPT: Record<string, string> = {
  female: "East Asian woman",
  male: "East Asian man",
};

const AGE_GROUP_PROMPT: Record<string, string> = {
  early_20s: "in the late 10s with a youthful fresh face",
  late_20s: "in the early 20s with a confident mature glow",
  early_30s: "in the late 20s with an elegant sophisticated look",
  late_30s: "in the late 30s with a graceful distinguished presence",
  early_40s: "in the early 40s with a refined timeless appearance",
  late_40s: "in the late 40s with a distinguished mature elegance",
};

// Layer 2: FACE VARIANTS
const FACE_VARIANTS: Record<string, string[]> = {
  cat: [
    "She has a cat-like face with sharp upturned almond eyes, high cheekbones, a short philtrum, and thin defined lips.",
    "She has a cat-like face with large round eyes that tilt slightly upward, a soft small nose, a short philtrum, and pouty lips.",
    "She has a cat-like face with elongated eyes with a sharp feline lift, defined cheekbones, and full lips.",
    "She has a cat-like face with clear almond eyes gently curved upward, soft cheekbones, natural lips, and a small chin.",
    "She has a cat-like face with clear bright eyes and a gentle natural upturn at the outer corners, a slim high nose bridge, soft defined cheekbones, and natural full lips.",
    "She has a cat-like face with big upturned eyes, defined cheekbones, full plump lips, and a slim glamorous face.",
    "She has a cat-like face with softly curved upturned eyes, a dreamy gaze, delicate lips, and gentle cheekbones.",
    "She has a cat-like face with medium almond eyes with a cool tilt, minimal cheek volume, and neat lips.",
    "She has a cat-like face with wide bright eyes with a slight upturn, baby-soft cheeks, and small pouty lips.",
  ],
  dog: [
    "She has a puppy-like face with big round eyes with slightly droopy outer corners, a soft button nose, full soft cheeks, and a gentle round face.",
    "She has a puppy-like face with gentle droopy-outer-corner eyes, a round nose tip, plump cheeks, and a slightly chubby warm face.",
    "She has a puppy-like face with wide innocent round eyes, a soft nose, full cheeks, and an open friendly expression.",
    "She has a puppy-like face with bright sparkling round eyes, a soft button nose, and warm plump cheeks.",
    "She has a puppy-like face with calm steady round eyes, a broad soft nose, and full reliable cheeks.",
    "She has a puppy-like face with round eyes, a round nose, and soft dimpled cheeks.",
    "She has a puppy-like face with gentle droopy eyes, a soft brow ridge, and plump soft cheeks.",
    "She has a puppy-like face with clear round eyes, a straight nose, and balanced cheeks with a clean look.",
    "She has a puppy-like face with gentle round eyes, a round soft nose, full plump cheeks, and a cozy gentle chin.",
  ],
  fox: [
    "She has a fox-like face with narrow upturned almond eyes with sharp outer corners and high defined cheekbones.",
    "She has a fox-like face with elongated sharp upswept eyes and slim cheekbones.",
    "She has a fox-like face with seductive upturned eyes and defined cheekbones.",
    "She has a fox-like face with sleek narrow eyes with a sharp tilt, flat cheeks, and clean minimal urban features.",
    "She has a fox-like face with focused narrow almond eyes, structured cheekbones, and a sharp intellectual impression.",
    "She has a fox-like face with intense upturned eyes, strong cheekbones, and fierce elegant features.",
    "She has a fox-like face with elongated almond eyes with a subtle upward sweep and gentle polished cheekbones.",
    "She has a fox-like face with thin sharp eyes, an icy gaze, and minimal soft features.",
    "She has a fox-like face with narrow eyes, high cheekbones, and a mysterious alluring expression.",
  ],
  rabbit: [
    "She has a rabbit-like face with big sparkly round eyes, a small button nose, plump cheeks, a slightly protruding upper lip that gently overhangs the lower lip, a soft round chin, and delicate features.",
    "She has a rabbit-like face with wide innocent doe eyes, a tiny nose, an undefined gentle chin, and a soft round face.",
    "She has a rabbit-like face with clear round eyes, a small button nose, plump cheeks, a naturally forward-set full upper lip sitting slightly ahead of the lower lip, and harmless delicate features.",
    "She has a rabbit-like face with wide startled round eyes, a small nose, a gently protruding plump upper lip with a soft bunny-like pout, a soft round chin, and a timid delicate look.",
    "She has a rabbit-like face with soft dreamy round eyes, a tiny nose, extremely soft cheeks, a baby chin, and a fluffy gentle appearance.",
    "She has a rabbit-like face with small bright round eyes, an upturned tiny nose, a slightly prominent upper lip that overhangs the lower lip in a soft natural overjet, plump cheeks, and a petite cute look.",
    "She has a rabbit-like face with big clear dewy eyes, a small nose, a full upper lip that protrudes slightly forward giving a soft bunny pout, a round face, plump cheeks, and a lovely sweet appearance.",
    "She has a rabbit-like face with sparkling round eyes with long lashes, a petite nose, gentle cheeks, and a girlish delicate look.",
    "She has a rabbit-like face with gentle half-round eyes, a very small nose, ultra-soft cheeks, a subtly protruding upper lip that is fuller and more forward than the lower lip, and a marshmallow-soft face.",
  ],
  deer: [
    "She has a deer-like face with large gentle almond eyes and long lashes, a delicate slim nose, and refined symmetrical features.",
    "She has a deer-like face with long-lashed doe eyes, a slim elegant nose, a slim chin, and a graceful face.",
    "She has a deer-like face with soft wide almond eyes and long lashes, a delicate nose, and graceful symmetrical features.",
    "She has a deer-like face with clear almond eyes and natural long lashes, a straight slim nose, and clean refined features.",
    "She has a deer-like face with large serene eyes, a delicate high nose bridge, and a classical elegant face.",
    "She has a deer-like face with wide gentle doe eyes, a soft delicate nose, and pure innocent features.",
    "She has a deer-like face with deep calm almond eyes and long lashes, a slim nose, refined features, and a mysterious serene expression.",
    "She has a deer-like face with naturally expressive almond eyes, an elegant nose, and distinctively proportioned features.",
    "She has a deer-like face with soft natural almond eyes, delicate features, and a naturally beautiful appearance.",
  ],
  snake: [
    "She has a snake-like face with slightly narrow elongated eyes and a calm steady gaze, well-defined angular cheekbones, and clean bone structure.",
    "She has a snake-like face with calm steady almond eyes and defined cheekbones.",
    "She has a snake-like face with defined eyes, angular cheekbones, and a distinctive bone structure.",
    "She has a snake-like face with neutral elongated eyes, balanced bone structure, and an androgynous cool appearance.",
    "She has a snake-like face with narrow eyes, broad cheekbones, and a nonchalant cool look.",
    "She has a snake-like face with steady eyes, structured cheekbones, and a stubborn determined expression.",
    "She has a snake-like face with wide-set calm eyes, an open bone structure, and a refreshingly bold look.",
    "She has a snake-like face with steady narrow eyes, a heavy brow, a broad face, and a weighty presence.",
    "She has a snake-like face with sharp elongated eyes, balanced bone structure, and a sophisticated urban appearance.",
  ],
  hamster: [
    "She has a hamster-like face with big round sparkly eyes, extremely soft chubby cheeks, a tiny button nose, and a baby-faced round head.",
    "She has a hamster-like face with wide innocent round eyes, extra chubby cheeks, a tiny nose, and a round wide forehead.",
    "She has a hamster-like face with bright cheerful round eyes, extremely full chubby cheeks, a tiny button nose, and a baby-faced look.",
    "She has a hamster-like face with soft round eyes, puffy round cheeks, a tiny nose, and a cozy plump appearance.",
    "She has a hamster-like face with big round eyes, puffed-out cheeks, a small nose, and a round wide chubby face.",
    "She has a hamster-like face with round eyes, extremely soft cheeks, a tiny nose, and a plump appearance.",
    "She has a hamster-like face with wide sparkling eyes, lifted chubby cheeks, a small upturned nose, and a round cheerful face.",
    "She has a hamster-like face with gentle round eyes, maximum chubby cheeks, a hidden jaw, a round head, and an ultimate baby face.",
    "She has a hamster-like face with bright eyes, plump cheeks, a tiny pointed nose, and a round lively face.",
  ],
};

// Layer 2.3: DIVERSITY
const FACE_PROPORTIONS = [
  "",
  "She has a high prominent nose bridge.",
  "She has a low flat nose bridge and a slightly wide nose.",
  "She has full thick lips.",
  "She has thin delicate lips.",
  "She has a strong square jawline.",
  "She has a soft rounded jawline.",
  "She has a sharp pointed chin.",
  "She has a short chin and a compact lower face.",
  "She has a long philtrum.",
  "She has wide cheekbones and a flat mid-face.",
];

const MIDFACE_RATIO = [
  "",
  "",
  "Her eyes are set high on her face, leaving a long distance from the eyes down to the nose and mouth.",
  "Her eyes are set low on her face, leaving a compact lower face.",
  "She has a long mid-face — the vertical distance from her brow to the tip of her nose is noticeably large.",
  "She has a short mid-face — the distance from her brow to the tip of her nose is compact and close together.",
  "Her nose sits very close beneath her eyes, giving a short compressed mid-face.",
  "She has a long expanse between her brow ridge and her nose tip, making her mid-face the dominant feature.",
  "She has a very long philtrum — a large gap between her nose and upper lip.",
  "She has an extremely short philtrum — her nose and upper lip are very close together.",
  "Her eyebrows sit very close to her eyes, giving an intense focused expression.",
  "Her eyebrows are set high above her eyes, giving a wide open surprised look.",
  "Her eyes are noticeably large relative to her face size.",
  "Her eyes are noticeably small relative to her face size.",
];

const FACE_SHAPES = [
  "",
  "",
  "She has an oval face shape — balanced and symmetrical with a softly rounded chin.",
  "She has a round face shape — full cheeks and a soft rounded chin.",
  "She has a square face shape — wide jaw and a flat angular chin.",
  "She has a heart-shaped face — high cheekbones tapering to a narrow pointed chin.",
  "She has a diamond face shape — wide prominent cheekbones and a narrow chin.",
  "She has an oblong face shape — long and narrow with a straight cheek line and a blunt chin.",
  "She has an inverted triangle face shape — broad upper face tapering down to a narrow slim chin.",
  "She has a soft rectangle face shape — slightly squared jawline and a wide flat blunt chin.",
];

const SKULL_SHAPES = [
  "",
  "",
  "She has a long narrow skull — a vertically elongated head with slim temples and a long slender face.",
  "She has a wide round skull — a broad short head with wide temples and a wide flat face.",
  "She has a wide flat skull with very broad temples and a short wide face.",
  "She has a moderately long skull with a gently elongated face.",
  "She has a compact round skull — short and wide with soft full temples.",
];

const CHEEKBONE_JAW = [
  "",
  "She has very wide prominent cheekbones that taper sharply down to a narrow delicate jaw.",
  "She has flat modest cheekbones with a wide strong jaw — the face is widest at the jaw.",
  "She has high angular cheekbones, the widest point of her face, narrowing above and below.",
  "She has flat low cheekbones with a broad square jaw and an evenly wide lower face.",
  "She has subtly wide cheekbones with a balanced jaw — a gentle taper from mid-face to chin.",
  "She has strong prominent cheekbones and an equally strong wide jaw, giving a powerful square silhouette.",
];

const CHIN_SHAPES = [
  "",
  "",
  "",
  "",
  "",
  "Her chin is gently rounded and blunt — not pointed.",
  "She has a wide flat chin with a squared blunt bottom edge.",
  "Her chin is broad and rounded, sitting wide at the base of the jaw.",
  "She has a soft blunt chin with no taper — wide and flat at the tip.",
  "Her chin is square and flat, giving the lower face a strong base.",
  "She has a slightly protruding rounded chin — full and blunt.",
];

const ORBITAL_DEPTH = [
  "",
  "",
  "She has deep-set eyes recessed beneath a prominent brow bone, casting a subtle shadow.",
  "She has flat shallow orbital bones — her eyes sit flush and forward on her face, wide open.",
  "She has slightly deep-set eyes with a faint brow bone shadow, giving a quiet intensity.",
  "She has prominent protruding eyes that sit forward on a flat orbital area.",
];

// Layer 2.5: HUMANIZE
const HUMANIZE_FEATURES: [number, string][] = [
  [0.55, ""],
  [0.1, "She has a single small beauty mark near her lips."],
  [0.08, "She has soft puffy aegyo-sal under her eyes."],
  [0.08, "She has a tiny mole on her cheek."],
  [0.07, "She has light natural freckles across her nose and cheeks."],
  [0.05, "She has a faint beauty mark near her eye."],
  [0.04, "She has a very subtle dimple on one cheek."],
  [0.03, "She has a tiny beauty mark on her chin."],
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

// Layer 2.7: BEAUTY ARCHETYPE
const BEAUTY_ARCHETYPES = [
  "She radiates a natural girl-next-door charm — warm, approachable, and softly pretty.",
  "She exudes a cold and distant elegance — icy, striking, and intense.",
  "She carries a sultry and magnetic allure — captivating, smoldering, and deeply expressive.",
  "She has an unconventional and memorable presence — striking and full of personality.",
  "She has a youthful fresh-faced sweetness — pure, bright, and innocently charming.",
  "She carries a refined and graceful elegance — poised, composed, and timelessly striking.",
  "She has a dreamy and ethereal quality — soft, mysterious, and otherworldly.",
  "She projects a calm intellectual composure — confident, thoughtful, and quietly compelling.",
  "She has an adorable and bubbly energy — endearing, sweet, and irresistibly cute.",
];

// Layer 2.6: EYE DETAIL
const EYE_DETAIL: Record<
  string,
  { eyelid: string[]; corner: string[]; spacing: string[] }
> = {
  cat: {
    eyelid: [
      "",
      "hooded eyelid",
      "half-hooded eyelid",
      "narrow sultry bedroom eyes",
      "heavy-lidded seductive eyes",
      "half-lidded sleepy seductive eyes with heavy upper lids",
    ],
    corner: [
      "upturned outer corners",
      "upturned outer corners",
      "sharply upswept outer corners",
      "straight horizontal corners",
    ],
    spacing: ["", "", "slightly close-set eyes", "slightly wide-set eyes"],
  },
  dog: {
    eyelid: [
      "",
      "",
      "soft double eyelid",
      "deep double eyelid",
      "half-lidded sleepy attractive eyes with a relaxed gentle upper lid",
      "heavy-lidded drowsy eyes with a soft languid gaze",
    ],
    corner: [
      "downturned outer corners",
      "downturned outer corners",
      "droopy outer corners",
      "droopy outer corners",
      "straight horizontal corners",
    ],
    spacing: ["", "wide-set eyes", "slightly wide-set eyes"],
  },
  fox: {
    eyelid: [
      "hooded eyelid",
      "hooded eyelid",
      "half-hooded eyelid",
      "heavy-lidded seductive eyes",
      "narrow sultry bedroom eyes",
      "half-lidded languid eyes with heavy drowsy upper lids and a smoldering gaze",
    ],
    corner: [
      "upturned outer corners",
      "sharply upswept outer corners",
      "sharply upswept outer corners",
    ],
    spacing: ["", "", "slightly close-set eyes", "close-set eyes"],
  },
  rabbit: {
    eyelid: [
      "",
      "",
      "soft double eyelid",
      "deep double eyelid",
      "half-lidded narrow sleepy eyes with a relaxed upper eyelid",
      "slightly droopy upper eyelid creating a sleepy yet alluring look",
    ],
    corner: ["", "upturned outer corners", "straight horizontal corners"],
    spacing: ["wide-set eyes", "wide-set eyes", "slightly wide-set eyes", ""],
  },
  deer: {
    eyelid: [
      "",
      "",
      "soft double eyelid",
      "deep double eyelid",
      "half-lidded dreamy eyes with heavy upper lids and a doe-eyed sleepy look",
      "languid heavy-lidded eyes with a sleepy feminine gaze",
    ],
    corner: ["", "upturned outer corners", "straight horizontal corners"],
    spacing: ["", "wide-set eyes", "slightly wide-set eyes"],
  },
  snake: {
    eyelid: [
      "monolid",
      "monolid",
      "half-hooded eyelid",
      "hooded eyelid",
      "narrow sultry bedroom eyes",
      "",
      "half-lidded sleepy cool eyes with a nonchalant heavy-lidded gaze",
    ],
    corner: ["", "", "straight horizontal corners", "downturned outer corners"],
    spacing: ["", "slightly close-set eyes", "close-set eyes"],
  },
  hamster: {
    eyelid: [
      "",
      "",
      "soft double eyelid",
      "deep double eyelid",
      "half-lidded sleepy cute eyes with a relaxed drowsy expression",
      "heavy-lidded drowsy eyes with small narrow opening",
    ],
    corner: ["", "upturned outer corners", "straight horizontal corners"],
    spacing: ["wide-set eyes", "wide-set eyes", "slightly wide-set eyes", ""],
  },
};

function pickEyeDetail(faceType: string, eyelidOverride?: string): string {
  const pool = EYE_DETAIL[faceType] ?? EYE_DETAIL.cat;
  const eyelid = eyelidOverride ?? pick(pool.eyelid);
  const parts = [eyelid, pick(pool.corner), pick(pool.spacing)].filter(Boolean);
  return parts.length ? `Her eyes have ${parts.join(", ")}.` : "";
}

// Layer 2.6b: DOUBLE EYELID (user-selected override for eyelid slot)
const DOUBLE_EYELID_PROMPT: Record<string, string> = {
  double: "soft double eyelid crease",
  mono: "monolid with no visible crease",
  inner: "subtle inner double eyelid, barely visible crease",
};

// Layer 2.8b: SKIN TONE (user-selected override)
const SKIN_TONE_PROMPT: Record<string, string> = {
  light: "Her skin tone is cool porcelain to soft peachy-fair.",
  medium: "Her skin tone is natural warm golden beige.",
  tan: "Her skin tone is warm honey-tan to golden brown.",
};

// Layer 2.3b: FACE SHAPE (user-selected override)
const FACE_SHAPE_PROMPT: Record<string, string> = {
  oval: "She has an oval face shape — balanced and symmetrical with a softly rounded chin.",
  round: "She has a round face shape — full cheeks and a soft rounded chin.",
  square: "She has a square face shape — wide jaw and a flat angular chin.",
  heart:
    "She has a heart-shaped face — high cheekbones tapering to a narrow pointed chin.",
};

// Layer 2.8: SKIN TONE
const SKIN_TONES = [
  "cool porcelain skin",
  "warm ivory skin",
  "golden beige skin",
  "light honey-warm skin",
  "soft peachy-fair skin",
  "neutral matte fair skin",
  "warm golden tan skin",
  "cool-toned clear pale skin",
];

// Layer 2.9: BROWS
const BROW_SHAPES = [
  "",
  "thick dark straight eyebrows",
  "full bold dark brown eyebrows with a natural arch",
  "strong straight dark brows sitting low over the eyes",
  "soft naturally arched medium-brown eyebrows",
  "gently curved medium-thickness eyebrows in a warm brown tone",
  "sharply angled dark eyebrows",
  "thin light-brown eyebrows with a delicate natural arch",
  "sparse barely-there fair eyebrows, softly defined",
  "delicate pale feathery eyebrows with minimal definition",
  "thin pencil-fine light eyebrows drawn in a gentle curve",
  "soft ash-brown eyebrows, light and barely visible",
  "high arched light-colored thin eyebrows",
];

// Layer 2.95: NOSE + LIPS
const NOSE_SHAPES = [
  "",
  "a high prominent nose bridge with a slim tip",
  "a low flat nose bridge with a slightly wide nose",
  "a small upturned nose tip",
  "a straight nose with a defined tip",
  "a soft round nose tip with a medium bridge",
  "a wide nose with a flat bridge",
  "a long slender nose with an elongated bridge that dominates the mid-face",
  "a short petite nose with a compact low-profile bridge",
];
const LIP_SHAPES = [
  "",
  "full thick lips",
  "thin delicate lips",
  "a wide broad mouth that stretches far to both sides",
  "a small narrow compact mouth",
  "a defined cupid's bow upper lip",
  "slightly pouty full lips",
  "a very wide mouth with strong lip corners",
  "a tiny small mouth with a short lip line",
];

function pickNoseLips(): string {
  const nose = pick(NOSE_SHAPES);
  const lips = pick(LIP_SHAPES);
  const parts: string[] = [];
  if (nose) parts.push(`She has ${nose}.`);
  if (lips) parts.push(`She has ${lips}.`);
  return parts.join(" ");
}

// Layer 4: STYLE
const STYLE_VIBE_PROMPT: Record<string, string | string[]> = {
  asian_influencer: [
    "She wears a soft glam everyday makeup look: dewy glass skin with a subtle glow, soft gradient lip in a muted rose or peach tone, light wispy lash extensions, barely-there gradient blush high on the cheeks, and a clean straight brow with soft feathered texture. She wears a casual-chic crewneck street outfit fully covering the chest and shoulders, looking effortlessly put-together.",
    "She wears a polished daily makeup look: satin-finish skin with a light foundation, a terracotta-nude gradient lip, thin precise eyeliner along the upper lash line, soft brown shadow on the lid, and neatly groomed straight brows. She wears a smart casual turtleneck or high-neck blouse fully covering the chest and shoulders.",
    "She wears a warm cafe-toned makeup look: warm peach dewy skin, a warm brown gradient lip with a glossy center, soft brown eyeshadow blended on the outer lid, a short natural lash curl, and soft arched brows in a warm brown tone. She wears a cozy knit sweater or crewneck top fully covering the chest and shoulders.",
    "She wears a fresh cool-toned makeup look: cool porcelain skin with a blue-pink shimmer highlight on the high points, a sheer pink gradient lip, a thin cool-gray liner flick, and full straight brows. She wears a light summer casual long-sleeve top or high-neck blouse fully covering the chest and shoulders.",
    "She wears a clear pink feminine makeup look: milky dewy skin, a juicy pink glossy lip, soft pink cloud blush centered on the cheeks, a subtle pink shimmer on the inner eye corners, and soft feathered natural brows. She wears a sweet pastel crewneck or high-neck top fully covering the chest and shoulders.",
    "She wears a warm earth-tone makeup look: golden-warm matte skin, a warm orange-brick gradient lip, a sheer amber shimmer on the eyelid, soft russet blush on the cheek apples, and natural straight brows in a warm tone. She wears a casual earth-tone crewneck sweater fully covering the chest and shoulders.",
    "She wears a chic nude minimal makeup look: semi-matte refined skin, a nude beige-pink lip with a defined cupid's bow, thin crisp upper liner with no eyeshadow, subtle lower lash-line freckle dots, and clean straight sharp brows. She wears a sleek minimal turtleneck or mock-neck top fully covering the chest and shoulders.",
    "She wears a pure dewy daily makeup look: pore-blurring glass skin, a barely-tinted sheer moisturizing lip, soft pink gradient blush swept lightly under the eyes, a natural no-liner eye with a lifted lash curl, and straight soft brows with a light texture. She wears a soft everyday crewneck sweatshirt or knit top fully covering the chest and shoulders.",
    "She wears a street casual sun-kissed makeup look: warm sun-kissed skin with a healthy natural flush on the nose bridge and cheeks, a warm berry-nude gradient lip, subtle brown liner on the waterline, dense natural lash volume, and slightly undone brushed-up brows. She wears a relaxed street casual hoodie or crewneck top fully covering the chest and shoulders.",
    "She wears a luminous holiday glow makeup look: highlighted skin with a pearl sheen on the high points, a rosy-coral gradient lip, soft gold shimmer dusted on the lid center, a gentle peachy blush, and polished arched brows with a subtle lift. She wears a refined high-neck blouse or mock-neck top fully covering the chest and shoulders.",
    "She wears 2026 K-pop idol makeup: a soft coral-peach bitten-lip gradient, flat natural feathery brows, and a pearl inner-corner highlight. Her skin is pore-blurring dewy glass skin. She wears a casual-chic idol jacket or crewneck outfit fully covering the chest and shoulders.",
    "She wears 2026 K-pop idol makeup: a strawberry-tinted soft gradient lip, straight soap brows, high blush placed just under the eyes for a youthful lifted look, and subtle shimmer on the eyelid. Her skin is luminous matte glass skin. She wears a sleek fitted idol stage jacket or high-neck uniform fully covering the chest and shoulders.",
    "She wears 2026 K-pop idol makeup: a glossy cherry-pink center gradient lip, gold-toned inner corner highlight, soft cloud-blush high on the cheekbones, and feathery natural brows. Her skin is radiant dewy skin. She wears a trendy idol costume with holographic accents, high neckline fully covering the chest and shoulders.",
    "She wears 2026 K-pop idol stage makeup: a vivid rose-pink ombre gradient lip, sparkle glitter on the inner corners and under-eye, flat arched brows in a natural brown tone. Her skin is glass-skin luminous. She wears a glittery idol performance jacket or turtleneck stage outfit fully covering the chest and shoulders.",
  ],
};

// Layer 4 (male override): STYLE VIBE — gender-specific overrides
// Only keys that require content-level changes beyond pronoun substitution are listed here.
// Feminine cosmetic descriptors (lash extensions, gradient lip, blush, eyeshadow, etc.)
// are replaced with male grooming/skincare equivalents.
const STYLE_VIBE_PROMPT_MALE: Record<string, string | string[]> = {
  asian_influencer: [
    "He has a soft dewy skincare look: lightweight moisturizer giving a healthy satin glow, skin barrier care with minimal product layering, clean groomed straight brows set with a clear brow gel. He wears a casual-chic crewneck street outfit fully covering the chest and shoulders, looking effortlessly put-together.",
    "He has a polished daily grooming look: satin-finish skin with light BB cushion coverage, clean hydrated matte skin, neatly groomed straight brows with a light brow gel. He wears a smart casual turtleneck or high-neck knit fully covering the chest and shoulders.",
    "He has a warm cafe-toned skincare look: warm peachy dewy skin with a healthy sun-kissed flush from toner and serum layering, light CC cream for an even tone, brushed-up groomed brows. He wears a cozy knit sweater or crewneck top fully covering the chest and shoulders.",
    "He has a fresh cool-toned skincare look: cool porcelain skin with a blue-based moisturizer giving a glass-skin sheen, clean hydrated barrier glow, full straight brows neatly defined with brow gel. He wears a light long-sleeve crewneck or high-neck top fully covering the chest and shoulders.",
    "He has a clean milky skincare look: milky dewy skin from essence and serum layers, soft healthy flush from vitamin C serum, clean natural straight brows shaped with light gel. He wears a sweet pastel crewneck or high-neck top fully covering the chest and shoulders.",
    "He has a warm earth-tone grooming look: golden-warm matte skin with light CC cream finishing, sun-kissed healthy tone from SPF and serum care, natural straight brows brushed up with clear brow gel. He wears a casual earth-tone crewneck sweater fully covering the chest and shoulders.",
    "He has a chic nude minimal skincare look: semi-matte refined skin from lightweight moisturizer and SPF, clean pore-minimized finish with no product buildup, sharp clean straight brows. He wears a sleek minimal turtleneck or mock-neck top fully covering the chest and shoulders.",
    "He has a pure dewy daily grooming look: pore-blurring glass skin from toner and moisturizer layering, healthy sheen without shine, soft straight brows with light natural texture set by brow gel. He wears a soft everyday crewneck sweatshirt or knit top fully covering the chest and shoulders.",
    "He has a street casual sun-kissed grooming look: warm sun-kissed skin with a healthy natural flush from outdoor activity, light tinted sunscreen for a natural even tone, slightly undone brushed-up brows. He wears a relaxed street casual hoodie or crewneck top fully covering the chest and shoulders.",
    "He has a luminous glass-skin grooming look: highlighted skin with a natural sheen from layered serum and moisturizer, healthy pearl-like glow, polished groomed straight brows with a clean defined shape. He wears a refined high-neck top or mock-neck sweater fully covering the chest and shoulders.",
    "He has a 2026 K-pop idol grooming look: pore-blurring dewy glass skin with light BB cushion, clean moisturized barrier glow, flat natural feathery brows set neatly with clear brow gel. He wears a casual-chic idol crewneck outfit fully covering the chest and shoulders.",
    "He has a 2026 K-pop idol stage grooming look: luminous matte glass skin with light CC cream, healthy even skin tone from skincare-first approach, straight soap brows neatly brushed up. He wears a sleek fitted idol stage jacket or high-neck uniform fully covering the chest and shoulders.",
    "He has a 2026 K-pop idol radiant grooming look: radiant dewy skin with a pearl-like sheen from essence layering, glass skin finish with minimal product, natural groomed brows with soft texture. He wears a trendy idol crewneck costume with a high neckline fully covering the chest and shoulders.",
    "He has a 2026 K-pop idol performance grooming look: glass-skin luminous finish from toner and serum care, healthy clear skin with an even tone, clean arched brows in a natural brown tone set with brow gel. He wears a refined idol performance jacket or turtleneck stage outfit fully covering the chest and shoulders.",
  ],
};

// Layer 4.5: BODY TYPE
const BODY_TYPE_PROMPT: Record<string, string> = {
  slim: "She has a slim face, slender neck, and narrow shoulders.",
  normal: "",
  muscular: "She has a toned face with a defined jaw and firm broad shoulders.",
  chubby:
    "She has a wide full round face where the cheeks are very broad and puffy, making the facial features — eyes, nose, and mouth — appear small and clustered together in the center of a large face. There is a lot of empty skin space between the features and the face edges. Her nose and lips look naturally soft and small relative to her wide face. She has a soft rounded jawline, a thick soft neck, and rounded shoulders.",
  curvy:
    "She has a slim defined face with a soft feminine contour, an elegant long neck, and smooth round shoulders with a visible collarbone.",
  rugged:
    "She has a strong square face, a sturdy neck, and solid broad shoulders.",
  brawny:
    "She has a very large wide face with heavy jowls and thick facial flesh. Her eyes appear small set within a broad heavy face. Her nose is broad and flat from facial mass. She has a very thick neck with no visible jawline definition and extremely wide muscular shoulders.",
};

// Layer 5: HAIR
const HAIR_STYLE_PROMPT: Record<string, string> = {
  long: "long straight silky hair falling past the shoulders, sleek and smooth with no waves",
  bob: "chin-length bob haircut with blunt ends framing the face",
  wave_long:
    "long wavy hair with gentle S-shaped waves falling past the shoulders, voluminous and flowing",
  wave_bob: "chin-length wavy bob with soft S-shaped waves framing the face",
  pixie: "very short pixie cut, tapered at the back and sides, textured on top",
  short: "short sleek hair cut above the ears, neatly styled close to the head",
  updo: "elegant updo with hair pinned up into a bun, exposing the neck",
  ponytail: "long hair tied into a sleek high ponytail at the crown",
  shaggy:
    "shaggy layered haircut with choppy ends and textured layers throughout",
  braids: "long hair gathered into a loose low braid resting over one shoulder",
  hime: "long straight hair with straight blunt-cut bangs and two straight side locks cut to jaw length framing the face",
  garma_perm:
    "side-parted perm with voluminous permed waves, clean side part dividing the hair, soft curls throughout",
  shoulder_length:
    "shoulder-length straight hair cut to the collarbone, sleek and clean with a soft natural swing",
  // Male hairstyles
  buzz_cut: "extremely short buzz cut, uniformly clipped all over the head",
  crew_cut: "short crew cut with closely trimmed sides and slightly longer top",
  twoblock: "two-block undercut with short sides and longer top section",
  slick_back_undercut:
    "slick back undercut with shaved sides and longer top hair slicked back smoothly away from the forehead",
  fade: "fade haircut with gradually tapered sides blending into skin",
  curtains:
    "curtain haircut with center-parted hair falling to either side of the face",
  center_part: "center-parted hair with equal sections on both sides",
  textured_crop: "short textured crop with messy natural texture on top",
  regent: "regent style with voluminous swept-back top and tight sides",
  wolf_cut: "wolf cut with shaggy layered top and curtain-style fringe",
  perm: "permed hair with loose natural curls throughout",
  man_bun: "hair pulled back into a bun at the crown or nape",
};

const NO_BANG_STYLES = new Set([
  "pixie",
  "updo",
  "ponytail",
  "braids",
  "curtains",
  "buzz_cut",
  "crew_cut",
  "fade",
  "slick_back_undercut",
  "man_bun",
]);

/**
 * Applies gender-specific pronoun substitution to a fully composed prompt.
 * When gender === "male", rewrites feminine pronouns to masculine equivalents.
 * The order matters: longer/more specific patterns must precede shorter ones
 * to avoid partial overwrites (e.g. `Her` before `She`). Word boundaries
 * prevent accidental matches inside other tokens.
 */
function applyGenderPronouns(text: string, gender: string): string {
  if (gender !== "male") return text;
  return (
    text
      .replace(/\bShe has\b/g, "He has")
      .replace(/\bshe has\b/g, "he has")
      .replace(/\bShe wears\b/g, "He wears")
      .replace(/\bshe wears\b/g, "he wears")
      .replace(/\bShe is\b/g, "He is")
      .replace(/\bshe is\b/g, "he is")
      .replace(/\bShe radiates\b/g, "He radiates")
      .replace(/\bShe exudes\b/g, "He exudes")
      .replace(/\bShe carries\b/g, "He carries")
      .replace(/\bShe projects\b/g, "He projects")
      // Possessive "Her" (start of sentence) must come before subject "She".
      .replace(/\bHer\b/g, "His")
      .replace(/\bher\b/g, "his")
      .replace(/\bShe\b/g, "He")
      .replace(/\bshe\b/g, "he")
  );
}

// ---------------------------------------------------------------------------
// Build function
// ---------------------------------------------------------------------------

const EYELID_EARLY: Record<string, string> = {
  double: "soft double eyelid crease",
  mono: "monolid eyes",
  inner: "inner double eyelid",
};

const SKIN_EARLY: Record<string, string> = {
  light: "fair porcelain skin",
  medium: "warm golden beige skin",
  tan: "warm honey-tan skin",
};

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

export function buildPersonaPrompt(params: PersonaPromptParams): string {
  const {
    face_type,
    style_vibe,
    gender,
    age_group,
    hair_style,
    body_type = "normal",
  } = params;

  const variant = pick(FACE_VARIANTS[face_type] ?? FACE_VARIANTS.cat);
  const vibeMap =
    gender === "male" && STYLE_VIBE_PROMPT_MALE[style_vibe]
      ? STYLE_VIBE_PROMPT_MALE
      : STYLE_VIBE_PROMPT;
  const vibeVal = vibeMap[style_vibe] ?? "";
  const vibeMod = Array.isArray(vibeVal) ? pick(vibeVal) : vibeVal;
  const is2d = style_vibe === "anime_heroine" || style_vibe === "j_idol_2d";

  const identity = GENDER_PROMPT[gender] ?? "person";
  const age = AGE_GROUP_PROMPT[age_group] ?? "";
  const body = BODY_TYPE_PROMPT[body_type] ?? "";
  const hair = HAIR_STYLE_PROMPT[hair_style] ?? hair_style;
  const bangKey = params.bang ?? "random";
  const hasBang = bangKey === "has_bang" && !NO_BANG_STYLES.has(hair_style);

  const faceShape = params.face_shape
    ? (FACE_SHAPE_PROMPT[params.face_shape] ?? pick(FACE_SHAPES))
    : pick(FACE_SHAPES);
  // user가 face_shape 지정 시 skull/cheekbone 랜덤 픽은 모순을 일으키므로 생략
  const skullShape = params.face_shape ? "" : pick(SKULL_SHAPES);
  const cheekboneJaw = params.face_shape ? "" : pick(CHEEKBONE_JAW);
  const chinShape = pick(CHIN_SHAPES);
  const diversity = pick(FACE_PROPORTIONS);
  const midface = pick(MIDFACE_RATIO);
  const eyelidOverride = params.double_eyelid
    ? DOUBLE_EYELID_PROMPT[params.double_eyelid]
    : undefined;
  const eyeDetail = pickEyeDetail(face_type, eyelidOverride);
  const orbitalDepth = pick(ORBITAL_DEPTH);
  const skinTone = params.skin_tone
    ? (SKIN_TONE_PROMPT[params.skin_tone] ??
      `Her skin tone is ${pick(SKIN_TONES)}.`)
    : `Her skin tone is ${pick(SKIN_TONES)}.`;
  const brow = pick(BROW_SHAPES);
  const browShape = brow ? `She has ${brow}.` : "";
  const noseLips = pickNoseLips();
  const humanize = pickHumanize();
  const archetype = pick(BEAUTY_ARCHETYPES);

  const parts: string[] = [];

  // eyelid·skin_tone을 첫 문장에 삽입해 가장 이른 위치에서 강조
  const earlyMods: string[] = [];
  if (params.double_eyelid)
    earlyMods.push(EYELID_EARLY[params.double_eyelid] ?? "");
  if (params.skin_tone) earlyMods.push(SKIN_EARLY[params.skin_tone] ?? "");
  const filteredMods = earlyMods.filter(Boolean);
  const earlyModStr =
    filteredMods.length > 0 ? ` with ${filteredMods.join(", ")}` : "";

  parts.push(
    `z-realism, RAW photo, photorealistic, ultra detailed portrait of an ${identity}${earlyModStr} ${age}.`,
  );

  if (hasBang)
    parts.push(`She has bangs covering her forehead. Hair: ${hair}.`);
  else if (bangKey === "none")
    parts.push(`No bangs. Forehead fully exposed. Hair: ${hair}.`);
  else parts.push(`Hair: ${hair}.`);

  parts.push(archetype);
  parts.push(variant);
  if (faceShape) parts.push(faceShape);
  if (skullShape) parts.push(skullShape);
  if (midface) parts.push(midface);
  if (diversity) parts.push(diversity);
  if (cheekboneJaw) parts.push(cheekboneJaw);
  if (chinShape) parts.push(chinShape);
  if (orbitalDepth) parts.push(orbitalDepth);
  if (eyeDetail) parts.push(eyeDetail);
  if (browShape) parts.push(browShape);
  if (noseLips) parts.push(noseLips);
  parts.push(skinTone);
  if (body) parts.push(body);
  if (humanize) parts.push(humanize);
  if (vibeMod) parts.push(vibeMod);

  const framing =
    body_type === "chubby" || body_type === "brawny"
      ? "Wide medium shot framing from the chest up. The face is large but must have very generous empty space on all sides — left, right, top, and bottom — the face must not touch or come close to any edge of the frame. The entire head and hair are fully visible. "
      : "Medium shot framing from the chest up, the face occupies roughly the upper half of the frame. The entire head and hair are fully visible with generous empty space on all sides. ";

  parts.push(
    `The subject is fully clothed. ${framing}The subject is looking directly at the camera, head facing straight forward, no head tilt, no turning. Neutral expression, symmetric composition, against a neutral plain background.`,
  );

  if (is2d) {
    parts.push(
      "Rendered as a 2.5D digital illustration with anime art style, cel-shading, clean line art, vibrant colors, soft gradients, and high detail. No text or watermarks.",
    );
  } else {
    parts.push(
      "ultra detailed natural photograph, highly detailed face. Soft studio lighting, sharp focus, natural skin texture, realistic skin pores. Unretouched, unfiltered, no beauty filter, no smoothing, no color grading. No text or watermarks.",
    );
  }

  // Gender normalization: all constants are authored in feminine voice
  // (historical artifact). Apply a single pass of pronoun rewriting for
  // male personas so the generative model receives coherent masculine text.
  const raw = parts.join(" ");
  return applyGenderPronouns(raw, gender);
}

export function buildMicroPrompts(
  params: PersonaPromptParams,
  n = 4,
): Array<{ prompt: string; seed: number }> {
  return Array.from({ length: n }, () => ({
    prompt: buildPersonaPrompt(params),
    seed: Math.floor(Math.random() * 2 ** 32),
  }));
}
