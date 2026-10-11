// Single source of truth for Quick mode auto-match patterns.
// Imported by:
//   - web/src/lib/moodPatterns.ts (re-exports with TS types + helpers)
//   - web/scripts/worker.mjs (Vision auto-match candidate list)
//
// IMPORTANT (mood pool invariants):
//   - All scenePrompts describe ENVIRONMENT only — props, surface, lighting,
//     composition, mood. No people, no body parts (hands, hair, skin, lips, ...).
//     The product itself is placed by the downstream image generator.
//   - 35 entries total: 7 categories x 5 mood patterns.
//   - Model-cut patterns will be appended later under format: "model".

/**
 * @typedef {"skincare" | "makeup" | "haircare" | "food" | "fashion" | "lifestyle" | "etc"} CategoryKey
 * @typedef {"mood" | "model"} QuickFormat
 * @typedef {{ key: string, category: CategoryKey, format: QuickFormat, name: string, visualHints: string[], scenePrompt: string }} QuickPattern
 */

/** @type {QuickPattern[]} */
export const QUICK_PATTERNS = [
  // ── Skincare (5) ────────────────────────────────────────────────────────
  {
    key: "skincare_water_drop",
    category: "skincare",
    format: "mood",
    name: "워터드롭 매크로",
    visualHints: [
      "transparent bottle",
      "glass dropper",
      "water droplets",
      "dewy surface",
      "blue gradient backdrop",
      "macro close-up",
      "cool clean lab",
    ],
    scenePrompt:
      "An ultra clean macro close-up scene built around hydration. The seamless backdrop is a soft blue-to-pale-cyan gradient that fades into a frosted white horizon, evoking a clinical skincare laboratory. The product rests on a polished glass surface scattered with crystal-clear water droplets of varying sizes, some perfectly spherical and others elongated as if mid-roll. A faint dew sheen coats the surrounding glass, and a single slow trickle of water catches the light. Lighting is a cool 5500K studio backlight combined with a soft frontal fill, producing crisp specular highlights on every droplet and a subtle blue rim around the product. The composition is tightly framed, shallow depth, with a dewy, scientific, fresh hydration mood throughout.",
  },
  {
    key: "skincare_nature_flatlay",
    category: "skincare",
    format: "mood",
    name: "자연주의 플랫레이",
    visualHints: [
      "beige linen",
      "wooden tray",
      "green tea leaves",
      "river pebbles",
      "dried lavender",
      "top-down 90 degrees",
      "warm morning sun",
    ],
    scenePrompt:
      "A serene top-down naturalist flatlay shot at a strict 90-degree overhead angle. The base surface is a softly wrinkled beige linen cloth layered over warm pale oak planks, with a small round wooden tray off to one side. Around the product, fresh green tea leaves, a few smooth river pebbles, sprigs of dried lavender, and a scattering of raw cotton fibers are arranged with intentional asymmetry. Soft warm morning sunlight enters from the upper left, casting long, gentle shadows across the linen and giving every organic element a tactile glow. The palette is grounded in earthen creams, sage greens, and oat tones, producing a calm, botanical, vegan skincare mood with strong artisanal authenticity.",
  },
  {
    key: "skincare_hanbang",
    category: "skincare",
    format: "mood",
    name: "한방 헤리티지",
    visualHints: [
      "celadon ceramic bowl",
      "white porcelain",
      "ginseng root",
      "hanji paper",
      "gold rim light",
      "dark oriental backdrop",
      "premium heritage",
    ],
    scenePrompt:
      "A premium oriental heritage scene with deep heritage gravitas. The backdrop is a charcoal-to-aubergine wash that recedes into shadow, while the foreground is built on textured hanji paper laid over dark walnut wood. A pale celadon bowl and a white porcelain dish hold sliced ginseng root, dried angelica, and a few goji berries, with a small bronze ladle set at an angle. A narrow warm 3000K gold rim light skims from the back-right, gilding the edges of the ceramic and the product while the rest of the scene drops into soft shadow. The result is contemplative and ceremonial, with a refined Korean hanbang apothecary mood that feels both ancient and luxurious.",
  },
  {
    key: "skincare_bathroom_minimal",
    category: "skincare",
    format: "mood",
    name: "욕실 미니멀",
    visualHints: [
      "white bathroom tile",
      "marble counter",
      "eucalyptus branch",
      "folded cotton towel",
      "soft window daylight",
      "calm spa",
      "subtle steam",
    ],
    scenePrompt:
      "A calm modern bathroom counter scene captured at eye level with a slight downward tilt. The setting is a matte white tiled wall meeting a pale honed marble countertop, with a tall window just out of frame casting cool, diffused side daylight across the surface. A neatly folded soft cotton towel, a small eucalyptus branch in a simple ceramic vase, and a clear glass of water sit beside the product, all spaced with generous negative space. A barely-there veil of steam softens the upper third of the frame, and faint condensation beads on the mirror edge. Lighting is even and contemplative at around 5000K, with soft shadows and an airy, dewy, hydrated daily ritual mood across an unoccupied countertop.",
  },
  {
    key: "skincare_summer_ocean",
    category: "skincare",
    format: "mood",
    name: "여름 바다",
    visualHints: [
      "wet beach sand",
      "seashells",
      "coral fragments",
      "ocean horizon",
      "splashing water",
      "bright midday sun",
      "summer vacation",
    ],
    scenePrompt:
      "A bright, refreshing summer beach scene set on damp golden sand at the water's edge. The horizon shows a clean turquoise sea meeting a bleached blue sky, slightly out of focus to keep attention on the foreground. Around the product, real seashells, bits of pale coral, smooth sea-worn pebbles, and a few strands of fresh seaweed are arranged in a loose natural cluster, with cold mist and small splashing droplets frozen in midair. The light is bright direct midday sun at around 5800K, producing crisp hard-edged shadows and brilliant highlights on every wet surface. The overall mood is exhilarating, cool, and unmistakably suncare-summer-vacation.",
  },

  // ── Makeup (5) ──────────────────────────────────────────────────────────
  {
    key: "makeup_color_block",
    category: "makeup",
    format: "mood",
    name: "컬러 매칭 솔리드",
    visualHints: [
      "seamless paper backdrop",
      "saturated single color",
      "hard side light",
      "color swatch streak",
      "editorial pop",
      "minimal styling",
    ],
    scenePrompt:
      "A bold editorial color-block scene built around a single saturated hue chosen to match the product's signature shade — coral, berry, nude, or terracotta. The backdrop is a seamless matte paper sweep that runs from wall to floor without a visible seam, painted in that same saturated color. Beside the product, a long fluid streak of a matching cream or pigment is dragged across the surface like a living swatch. A single hard side light from camera left carves a sharp, defined shadow along the floor, and a faint specular highlight rims the product. The composition leaves generous negative space above for editorial breathing room. The mood is confident, graphic, and unmistakably modern color-cosmetics campaign.",
  },
  {
    key: "makeup_fruit_metaphor",
    category: "makeup",
    format: "mood",
    name: "과일 디저트 메타포",
    visualHints: [
      "sliced cherry",
      "halved plum",
      "peach",
      "juice droplets",
      "glossy white surface",
      "vivid color story",
      "juicy texture",
    ],
    scenePrompt:
      "A juicy, sensual fruit-metaphor scene that translates the product's color story into edible form. The surface is a glossy white acrylic that catches subtle reflections, set against a soft cream backdrop. Sliced cherries, a halved plum showing its rich purple flesh, a quartered peach with visible fibers, and a sprig of red currants are arranged in a loose painterly cluster around the product. Tiny droplets of juice, a few sugar crystals, and a faint sheen of nectar dot the surface. Lighting is soft window daylight with a subtle frontal bounce, producing a dewy gloss across every fruit slice and the product itself. The palette is vivid red-violet-coral, with a craving-inducing, juicy cosmetics mood.",
  },
  {
    key: "makeup_luxury_dark",
    category: "makeup",
    format: "mood",
    name: "럭셔리 미니멀 다크",
    visualHints: [
      "dark wine satin",
      "black marble surface",
      "warm gold spotlight",
      "deep shadows",
      "high contrast",
      "sensual editorial",
    ],
    scenePrompt:
      "A high-contrast luxury editorial scene in a low-key dark register. The backdrop is a draped wine-burgundy satin fabric that catches a single warm 3000K spotlight from above-right, while the foreground surface is honed black marble with subtle pale veining. A small gold tray, a single drop earring or fine chain, and a sealed letter sit beside the product as restrained styling cues. The spotlight is tightly focused, leaving most of the frame in deep velvet shadow, with only the product, the satin's silken sheen, and a thin gold rim along the marble's edge fully illuminated. The mood is sensual, mature, and unapologetically prestige beauty.",
  },
  {
    key: "makeup_glitter_jewel",
    category: "makeup",
    format: "mood",
    name: "글리터 주얼리",
    visualHints: [
      "deep blue velvet",
      "scattered glitter",
      "rhinestones",
      "pearl chain",
      "sharp pin light",
      "festive sparkle",
    ],
    scenePrompt:
      "A festive holiday-glam scene set against a deep midnight-blue velvet surface that absorbs ambient light and lets every sparkle pop. Around the product, fine silver and champagne glitter is scattered like a soft constellation, accented by clusters of clear rhinestones, a draped strand of small pearls, and a single curved gold chain catching the highlight. A sharp tight pin light from above-front creates concentrated specular flares on every faceted stone and a controlled glow on the velvet's pile, while the corners drop into rich blue-black shadow. The palette balances jewel tones with metallic silver and gold, producing a celebratory, gift-worthy, holiday-collection mood.",
  },
  {
    key: "makeup_pastel_studio",
    category: "makeup",
    format: "mood",
    name: "파스텔 스튜디오",
    visualHints: [
      "pastel paper backdrop",
      "lilac or mint or butter",
      "soft top light",
      "candy tone",
      "modern minimal pop",
      "MZ studio",
    ],
    scenePrompt:
      "A clean modern studio scene built around a single pastel hue — lilac, mint, or butter yellow — used as a seamless matte paper sweep that wraps from wall to floor. Lighting is an even, broad soft top light at 5200K, producing only a faint, soft shadow directly beneath the product to anchor it without weight. Tiny coordinating props — a translucent acrylic cube, a small pastel ribbon curl, or a single cotton-candy-colored bead — are placed with deliberate sparsity, leaving the composition airy and graphic. The post-treatment pushes saturation gently to keep the color reading candy-like rather than pastel-washed. The overall mood is youthful, modern, MZ-studio, social-media-ready cosmetics minimalism.",
  },

  // ── Haircare (5) ────────────────────────────────────────────────────────
  {
    key: "haircare_clean_bathroom",
    category: "haircare",
    format: "mood",
    name: "클린 욕실 미니멀",
    visualHints: [
      "matte white tile",
      "eucalyptus branch",
      "rattan basket",
      "natural daylight",
      "modern spa",
      "minimal shelf",
    ],
    scenePrompt:
      "A clean modern bathroom shelf scene built on matte white square tiles with sand-colored grout, photographed slightly above eye level. A tall window just out of frame floods the scene with soft cool side daylight at around 5500K, producing gentle gradient shadows. The product sits on a narrow oak floating shelf alongside a small woven rattan basket, a folded sage-green linen towel, and a single fresh eucalyptus branch in a slim ceramic vase. A faint diffuse mist softens the upper background, hinting at a recent shower without obscuring detail. The palette stays in cool whites, oat, and muted green, evoking a serene, spa-grade modern minimal haircare ritual.",
  },
  {
    key: "haircare_luxury_salon",
    category: "haircare",
    format: "mood",
    name: "럭셔리 살롱 다크",
    visualHints: [
      "black marble surface",
      "gold tray",
      "dark wooden comb",
      "glossy reflections",
      "warm spot light",
      "salon prestige",
    ],
    scenePrompt:
      "A prestige salon scene in a dark luxe register. The surface is honed black marble with cool gray veining, set against a charcoal velvet backdrop that gradients into deep shadow. A polished gold tray holds a dark walnut comb and a small crystal perfume atomizer, placed beside the product to suggest a high-end grooming altar. A warm 3000K spotlight is angled from camera right, producing controlled specular highlights on the marble and a soft glow along the gold tray's edge, while the rest of the frame falls into rich black. A faint mirror reflection catches a sliver of warm light on the far edge. The mood is sculptural, evening-time, and unmistakably premium-salon haircare.",
  },
  {
    key: "haircare_botanical_green",
    category: "haircare",
    format: "mood",
    name: "보태니컬 식물 베이스",
    visualHints: [
      "sage cream surface",
      "rosemary sprig",
      "eucalyptus leaves",
      "green tea leaves",
      "morning dew droplets",
      "vegan natural",
      "45 degree top angle",
    ],
    scenePrompt:
      "A botanical naturalist scene shot at a 45-degree elevated angle. The base surface is a sage-cream textured paper that reads almost like dried clay, lightly dusted with crushed herb particles. Around the product, fresh sprigs of rosemary, full eucalyptus stems, glossy green tea leaves, and a single sliced lemon half are arranged in an organic spray, with delicate dew droplets clinging to the leaves. The light is a soft diffused morning daylight at 5200K, gently wrapping the leaves and giving every droplet a small bright catchlight. The palette stays anchored in muted sage, oat, and yellow-green, producing a calm, vegan-friendly, plant-derived haircare mood with quiet authenticity.",
  },
  {
    key: "haircare_morning_window",
    category: "haircare",
    format: "mood",
    name: "아침 창가 무드",
    visualHints: [
      "cream painted wall",
      "sheer linen curtain",
      "soft morning side light",
      "small ceramic vase",
      "calm interior",
      "no people",
    ],
    scenePrompt:
      "A still, contemplative interior scene at an apartment window in early morning. A cream-painted wall meets a pale wooden ledge, where the product sits beside a small fluted ceramic vase holding a single dried pampas stem. A sheer ivory linen curtain drifts gently in the breeze just outside the frame, filtering soft warm 3500K side light into a silky volumetric beam that traces the ledge. The shadows are long and gentle, the air feels still, and a faint dust glow hangs in the slanted light. The palette is warm cream, ivory, and aged paper, producing a quiet, slow-living morning ritual mood across an empty windowsill.",
  },
  {
    key: "haircare_vanity_dresser",
    category: "haircare",
    format: "mood",
    name: "드레서 데일리 루틴",
    visualHints: [
      "warm wood vanity",
      "vintage mirror edge",
      "dried lavender bunch",
      "small perfume bottle",
      "afternoon gold light",
      "cozy ritual",
    ],
    scenePrompt:
      "A cozy afternoon vanity-dresser scene captured at a slight low angle to imply intimacy. The surface is warm walnut wood with a soft polished sheen, and the partial edge of an oval vintage brass-framed mirror is visible at the right edge of the frame. The product is placed alongside a small bunch of dried lavender tied with twine, a faceted vintage perfume atomizer, and a folded silk ribbon in dusty pink. The light is golden late-afternoon sun at 3200K coming from camera left, casting warm long shadows and giving the wood a honeyed glow. The mood is nostalgic, romantic, and unmistakably daily-grooming ritual frozen on a quiet, unattended dresser.",
  },

  // ── Food (5) ────────────────────────────────────────────────────────────
  {
    key: "food_dark_moody",
    category: "food",
    format: "mood",
    name: "다크 무드 컬리퍼플",
    visualHints: [
      "dark earthenware",
      "charcoal background",
      "purple undertone",
      "single sidelight",
      "rising steam",
      "editorial food",
    ],
    scenePrompt:
      "A signature dark-mood editorial food scene with the unmistakable purple-charcoal palette of premium grocery branding. The backdrop is a deep matte charcoal wash with a faint cool-violet undertone, and the surface is dark-stained walnut, almost black, with a worn matte finish. The product sits among a black ceramic ttukbaegi, a rough black earthenware plate, and a few sprigs of fresh thyme. A single hard sidelight from camera left at a low angle carves dramatic dimensional shadows and rim-lights the edges of every dish. Soft tendrils of steam rise from the bowl, catching the light. The palette is deliberately aubergine-charcoal, producing a moody, gourmet, premium-grocery editorial mood.",
  },
  {
    key: "food_brunch_table",
    category: "food",
    format: "mood",
    name: "브런치 식탁",
    visualHints: [
      "linen runner",
      "white ceramic dishes",
      "wooden cutting board",
      "morning window light",
      "gauze curtain diffuser",
      "30 degree angle",
      "cozy weekend",
    ],
    scenePrompt:
      "A warm weekend brunch-table scene shot from a 30-degree elevated angle. The surface is pale oak planks dressed with a softly wrinkled cream linen runner. The product sits among matte white ceramic plates, a small wooden cutting board with halved figs and a sprig of basil, a glass of fresh-pressed juice, and a tiny cluster of wildflowers in a clear bud vase. Morning sunlight at 4500K filters through a gauze linen curtain just out of frame, producing dappled, gentle volumetric beams across the runner and soft, painterly shadows beneath each prop. The palette is cream, ivory, gold, with quiet pops of fig-purple and basil green. The mood is a cozy, slow Sunday-morning brunch.",
  },
  {
    key: "food_rustic_wood",
    category: "food",
    format: "mood",
    name: "러스틱 우드 마끈",
    visualHints: [
      "rough wood cutting board",
      "twine bundles",
      "fresh rosemary",
      "earth-dusted produce",
      "raw linen napkin",
      "farm to table",
    ],
    scenePrompt:
      "A rustic farm-to-table scene built on a deeply grained, raw oak cutting board sitting on a coarse undyed linen cloth. Around the product, a small bundle of fresh rosemary and basil tied with rough natural twine, a few earth-dusted heirloom potatoes, a half-cut country bread loaf showing its open crumb, and a small bowl of coarse sea salt are arranged with the gentle disorder of a working kitchen. Soft window daylight enters from the upper left at 4500K, producing organic shadows that emphasize every wood grain, twine fiber, and crumbly texture. The palette stays in honest earth tones — wheat, ochre, sage, raw linen — for an authentic, artisanal, homestead farmhouse mood.",
  },
  {
    key: "food_action_macro",
    category: "food",
    format: "mood",
    name: "액션 텍스처 매크로",
    visualHints: [
      "pouring liquid",
      "splash droplets",
      "ice cubes",
      "condensation",
      "frozen high-shutter motion",
      "soft beige backdrop",
      "advertising freshness",
    ],
    scenePrompt:
      "A high-energy macro advertising scene that freezes a moment of pour-and-splash action right beside the product. The backdrop is a softly blurred warm beige gradient that pushes all attention forward. A glass tumbler beside the product holds clear ice cubes glistening with sharp specular highlights, while a stream of amber or clear liquid is captured mid-pour with airborne droplets suspended in midair. Cold condensation beads cling to the glass and the immediate surface around it. Lighting is a strong cool-white key from camera left at 5500K with a tight rim from behind, producing crisp edges on every droplet. The mood is fresh, kinetic, premium beverage advertising at the crispest moment of contact.",
  },
  {
    key: "food_pastel_minimal",
    category: "food",
    format: "mood",
    name: "파스텔 미니멀",
    visualHints: [
      "pastel mint backdrop",
      "even flat lighting",
      "single product hero",
      "color block square",
      "subtle drop shadow",
      "social media ready",
    ],
    scenePrompt:
      "A clean pastel-minimal scene that places the product as a single floating hero against a seamless pale mint paper sweep that runs from wall to floor without a visible seam. Lighting is an even broad soft front-and-top light at 5200K, producing only a faint elliptical drop shadow directly beneath the product to give it gentle weight without grounding it heavily. Tiny matching props — a single straw or a small folded napkin in the same color family — are placed with deliberate restraint, leaving substantial breathing space on all sides. The framing is square or near-square, perfectly suited for social-feed thumbnails. The mood is graphic, candy-toned, modern beverage minimalism.",
  },

  // ── Fashion (5) ─────────────────────────────────────────────────────────
  {
    key: "fashion_concrete_street",
    category: "fashion",
    format: "mood",
    name: "콘크리트 스트릿 플랫레이",
    visualHints: [
      "rough concrete pavement",
      "scattered urban props",
      "hard daylight",
      "cool color tone",
      "gritty editorial",
      "top-down street",
    ],
    scenePrompt:
      "A gritty street-editorial flatlay set on a rough concrete pavement with subtle cracks and faint white road paint marks. Around the product, urban detritus — a crumpled receipt, a flattened soda can, a single subway card, an empty sneaker box flap — is scattered with deliberate carelessness. The angle is a strict overhead top-down, framed asymmetrically. Lighting is hard direct midday sun at 5800K from camera-back-right, producing crisp graphic shadows and high-contrast specular hits on metal surfaces. Color grading leans cool-cyan and slightly desaturated for an unmistakable street-editorial bite. The palette stays in cool gray, asphalt, and accents of sodium-amber, producing a confident, urban, streetwear flatlay mood.",
  },
  {
    key: "fashion_beige_minimal",
    category: "fashion",
    format: "mood",
    name: "베이지 페이퍼 미니멀",
    visualHints: [
      "cream linen surface",
      "soft side daylight",
      "long faint shadow",
      "refined negative space",
      "vertical 4 by 5 frame",
      "contemporary fashion",
    ],
    scenePrompt:
      "A refined contemporary minimal scene built on a smooth cream-toned matte paper surface that gradients into pale oat where it meets the back wall. The product is placed slightly off-center to leave intentional, generous negative space on one side. A single soft side daylight at 5000K enters from camera left, producing a long, gentle, soft-edged shadow that anchors the product without weight. The framing tends vertical, around 4:5, with elegant top-and-bottom breathing room. The palette stays strictly in cream, ivory, oat, and warm white, with no competing colors. The mood is calm, considered, contemporary fashion editorial — quiet luxury that lets material and silhouette speak.",
  },
  {
    key: "fashion_vintage_wood",
    category: "fashion",
    format: "mood",
    name: "빈티지 우드 스타일링",
    visualHints: [
      "warm vintage walnut",
      "leather notebook",
      "vintage watch",
      "tungsten warmth",
      "curated still life",
      "story driven",
      "45 degree angle",
    ],
    scenePrompt:
      "A curated vintage still-life scene shot at a 45-degree angle that feels like leafing through a heritage catalogue. The surface is a warm medium-tone walnut tabletop with visible age-worn grain. Around the product, a tan leather-bound notebook with a brass corner, a vintage analog wristwatch with a leather strap, a small brass key on a ribbon, and an open fountain pen rest in a deliberate, magazine-styled arrangement. Lighting is warm tungsten at 3000K from camera right, producing rich amber highlights and deep umber shadows. A faint film-grain treatment is implied in the post-processing. The palette is cognac, walnut, brass, and ivory, evoking a heritage, story-driven, classic-fashion-feature mood.",
  },
  {
    key: "fashion_pastel_pop",
    category: "fashion",
    format: "mood",
    name: "컬러 페이퍼 팝",
    visualHints: [
      "saturated pastel paper",
      "even soft lighting",
      "no shadow",
      "vivid post-treatment",
      "Y2K candy",
      "graphic frame",
    ],
    scenePrompt:
      "A vivid Y2K-candy fashion scene built on a single saturated pastel paper backdrop — bubblegum pink, mint, or lilac — that wraps seamlessly from wall to floor. Lighting is an extremely even broad-soft front-fill at 5500K with practically no shadow, giving the scene a flat graphic, magazine-cover quality. Tiny coordinating props — a small acrylic cube, a glossy plastic ribbon, a single inflated foil heart — are placed in the corners as graphic accents, all in the same color family. The post-treatment pushes saturation hard while keeping every surface clean and color-pure, leaning into the candy-pop register. The framing is centered and graphic. The mood is loud, playful, unapologetically Y2K fashion-pop.",
  },
  {
    key: "fashion_gallery_studio",
    category: "fashion",
    format: "mood",
    name: "갤러리 스튜디오 디스플레이",
    visualHints: [
      "white gallery wall",
      "minimal metal rack",
      "large window",
      "long architectural shadow",
      "museum quiet",
      "wide angle",
    ],
    scenePrompt:
      "A quiet gallery-studio scene that treats the product as a museum object. The space is a wide white-walled studio with a polished concrete floor, photographed at a wide angle that emphasizes architectural emptiness. A simple matte black metal display rack or a thin wooden pedestal holds the product centrally, with no other styling. A large floor-to-ceiling window just out of frame at camera left admits a single shaft of cool 5500K daylight, casting a long, elongated, architectural shadow across the floor. The palette is strict white, soft gray, and the product's own color, with high negative space. The mood is contemplative, exhibition-like, contemporary fashion gallery quiet.",
  },

  // ── Lifestyle (5) ───────────────────────────────────────────────────────
  {
    key: "lifestyle_sunlit_wood",
    category: "lifestyle",
    format: "mood",
    name: "햇살 우드 테이블",
    visualHints: [
      "medium oak table",
      "afternoon sun",
      "long warm shadow",
      "dried flower bunch",
      "ceramic mug",
      "slow living",
    ],
    scenePrompt:
      "A warm afternoon slow-living scene set on a medium-toned oak table with subtle grain and a soft satin finish. The product sits among a small earthenware mug holding pale tea, a loose bunch of dried wildflowers tied with twine, an open softcover book lying cover-down, and a small ceramic dish with two acorns. Late-afternoon sunlight at around 4000K streams in from camera left, producing crisp long shadows and a honeyed glow that warms every surface. Tiny dust motes are visible drifting in the slanted beam. The palette is honey, oak, sage, and ivory, all anchored in warm earth-tone temperature. The mood is unhurried, deeply cozy, and unmistakably slow-living afternoon ritual.",
  },
  {
    key: "lifestyle_scandi_minimal",
    category: "lifestyle",
    format: "mood",
    name: "스칸디 미니멀 플랫레이",
    visualHints: [
      "white linen",
      "even soft top light",
      "neutral palette",
      "single accent color",
      "refined flatlay",
      "front overhead",
    ],
    scenePrompt:
      "A refined Scandi-minimal flatlay shot at a clean front-overhead angle. The base is a smoothly pressed white linen cloth laid over pale ash wood, giving the scene a cool textile texture. Around the product, only one or two carefully chosen accents in a single muted color — soft sage, dusty blue, or terracotta — appear: a small folded napkin, a single ceramic dish, perhaps a single sprig of dried grass. Lighting is an even broad soft top light at 5200K with no harsh shadow, and only a faint envelope of soft gray beneath each object. The palette is overwhelmingly neutral with one carefully placed accent. The mood is calm, considered, Nordic-minimal home aesthetic.",
  },
  {
    key: "lifestyle_living_vignette",
    category: "lifestyle",
    format: "mood",
    name: "거실 vignette",
    visualHints: [
      "apartment corner",
      "monstera plant",
      "rattan basket",
      "warm floor lamp",
      "lived-in depth",
      "wide angle interior",
    ],
    scenePrompt:
      "A warm Korean-apartment living-room corner captured at a slightly wide angle to suggest space and depth. The product is placed on a low warm-walnut side table beside a soft beige fabric sofa, with a tall monstera plant in a woven rattan basket rising behind it, a stack of two coffee-table books on the floor, and a soft cream rug underfoot. A single warm 3000K floor lamp casts a pool of golden light from camera right, while soft late-afternoon daylight from a window at camera left fills the cool side. The depth of field is moderate, leaving the back wall comfortably soft. The palette is cream, walnut, sage, and warm gold. The mood is genuinely lived-in, cozy, real-home interior — captured as a quiet, unoccupied vignette.",
  },
  {
    key: "lifestyle_butter_terracotta",
    category: "lifestyle",
    format: "mood",
    name: "버터·테라코타 컬러 그라운드",
    visualHints: [
      "butter yellow paper",
      "terracotta sweep",
      "sage accent",
      "soft side gradient",
      "magazine flatlay",
      "muted props",
    ],
    scenePrompt:
      "A magazine-styled colored-ground scene built on a single saturated yet earthy paper backdrop — butter yellow or warm terracotta — sweeping from wall to floor. The light is a broad soft front-fill at 5000K with a subtle gradient that brightens the upper-left and gently darkens the lower-right, giving the flat surface a sense of dimension. Tiny props in coordinating tones — a small framed line drawing, a slim ceramic tray, a single dried palm leaf — are placed sparingly. The product anchors the composition slightly off-center, with thoughtful negative space above. The post-treatment keeps colors warm and a touch creamy, like a printed page. The mood is editorial, design-magazine-chic, contemporary lifestyle still life.",
  },
  {
    key: "lifestyle_dark_dining",
    category: "lifestyle",
    format: "mood",
    name: "다크 무드 다이닝 디테일",
    visualHints: [
      "dark stained wood",
      "deep charcoal shadow",
      "candle warmth",
      "leather coaster",
      "intimate close framing",
      "evening dinner",
    ],
    scenePrompt:
      "An intimate evening dining detail captured close to the surface. The table is dark-stained oak with a worn matte finish, and the backdrop falls into deep charcoal shadow. Beside the product, a small dark leather coaster, a heavy black ceramic dish with crumbled bread, a sprig of rosemary, and a half-burned beeswax candle in a brass holder are arranged like the corner of a real dinner table. The candle and a single warm 2700K key light from camera right cast a tight pool of golden glow across the immediate surface, while the rest of the frame drops into rich black. A faint waxy aroma is visually implied through soft halation. The mood is quiet, candlelit, mature, intimate dinner moment.",
  },

  // ── 모델컷 (35) ─────────────────────────────────────────────────────────
  // IMPORTANT (model pool invariants):
  //   - scenePrompts describe a human subject from the NECK DOWN (or back/side),
  //     with the product in hand or in active use.
  //   - Face identity and expression are minimized — the face sheet is composited
  //     separately. Use "neutral expression", "face cropped/turned away", or
  //     "identity-light" framing.
  //   - 35 entries total: 7 categories x 5 model patterns.

  // ── Skincare model (5) ──────────────────────────────────────────────────
  {
    key: "skincare_model_pump_drop",
    category: "skincare",
    format: "model",
    name: "손바닥 펌프 매크로",
    visualHints: [
      "dropper bottle",
      "palm",
      "watery droplet",
      "low-viscosity",
      "transparent serum",
      "soft daylight",
      "no face",
    ],
    scenePrompt:
      "An intimate macro scene focusing on a single outstretched palm against a seamless white-to-cream backdrop bathed in soft side daylight at 5000K. A glass dropper bottle is held a few centimeters above the palm's center, and a single pellucid serum droplet hangs at the dropper tip, captured just before it falls. The liquid is nearly water-clear, showing faint blue-pink iridescence where light refracts through it. The hand is angled slightly downward, fingertips toward camera, revealing the pale inside of the wrist. Nails are a clean nude. The framing cuts below the wrist, excluding face and arm entirely. The backdrop is shadowless, and shallow depth of field throws the bottle slightly soft while the droplet and palm's skin texture remain razor-sharp. The mood is clinical, dewy, and quietly luxurious — a precise moment of skincare ritual.",
  },
  {
    key: "skincare_model_cheek_macro",
    category: "skincare",
    format: "model",
    name: "광대-턱 사이드 매크로",
    visualHints: [
      "side cheek crop",
      "glowy skin",
      "fingertip press",
      "glass skin",
      "plumped",
      "rim light",
      "hair strand",
    ],
    scenePrompt:
      "An extreme side-profile crop that isolates only the cheekbone-to-jawline region, with the eyes and mouth falling outside the frame — achieving a fully identity-light composition. The skin surface is radiant glass-skin, lit with a warm 4500K key from the front and a cool silver rim light from behind that carves a luminous edge along the cheekbone's apex. Two fingertips — middle and ring finger — press gently into the cheek in a feather-light absorption motion, creating a slight plump indent in the skin. A single fine hair strand falls across the upper cheek, adding softness. The color palette is warm ivory skin tone against a cool pale gray backdrop, making every pore and glow point readable at high magnification. The mood is dewy, plumped, and aspirationally glass-skinned, evoking premium skincare absorbing in real time.",
  },
  {
    key: "skincare_model_sheet_mask",
    category: "skincare",
    format: "model",
    name: "누운 시트마스크 탑샷",
    visualHints: [
      "top-down lying",
      "sheet mask",
      "fanned hair",
      "white linen",
      "eyes closed",
      "ritual",
      "calm",
    ],
    scenePrompt:
      "A strict 90-degree top-down shot looking down at a subject lying on crisp white linen, head centered in the lower two-thirds of frame. A translucent sheet mask covers the lower face from just below the eyes to the chin, edges pressed neatly against the jaw. Eyes are gently closed — lids relaxed, expression completely neutral — so the face reads as a peaceful, identity-light surface. Hair fans out symmetrically above the head in a soft arc across the pillow, a few strands loose. Both hands rest at the temples, fingertips lightly pressing the mask edges. Lighting is a broad diffuse softbox overhead at 5200K producing even, shadow-free illumination that reveals every embossed texture on the mask surface. The mood is ritual, calm, meditative self-care suspended in stillness.",
  },
  {
    key: "skincare_model_pad_wipe",
    category: "skincare",
    format: "model",
    name: "토너패드 와이프 클로즈업",
    visualHints: [
      "round cotton pad",
      "embossed texture",
      "swipe motion",
      "side cheek",
      "ASMR",
      "soaked toner",
    ],
    scenePrompt:
      "A close-cropped side-cheek frame showing only the cheekbone and jaw area — eyes and mouth outside frame for an identity-light composition. Two fingers grip a round cotton toner pad, its embossed grid texture clearly visible and soaked dark with transparent toner. The pad moves diagonally from cheekbone toward jawline, caught mid-stroke in crisp stillness. A faint wet sheen trails behind on the skin's surface, catching cool 5000K side light to produce a glossy ASMR-like texture. The background is a clean off-white gradient that keeps all attention on the tactile contact. Depth of field is shallow enough to blur the wrist behind while keeping the pad's embossed pattern and the skin's pore texture in sharp focus. The mood is refreshingly clinical, cleanly satisfying, and unmistakably a toning ritual.",
  },
  {
    key: "skincare_model_sunscreen_spread",
    category: "skincare",
    format: "model",
    name: "손등 선크림 발림성",
    visualHints: [
      "back of hand",
      "sunscreen dollop",
      "spreading motion",
      "no white cast",
      "transparent finish",
      "daily UV",
    ],
    scenePrompt:
      "A clean macro study of the back of one hand, palm down, filling approximately 70 percent of the frame against a soft daylight white-to-pale-cream backdrop. A white dollop of sunscreen rests on the knuckle area of the middle and ring fingers, and the index finger of the other hand enters from the left edge, already mid-stroke blending the cream outward. On the right side of the hand, where blending is nearly complete, the skin shows a transparent, no-white-cast finish — the texture disappears as if the skin drank it. On the left, the original white dollop remains glossy and full. The light is a diffuse 5500K overhead window that shows both the unblended and blended state with equal clarity. Nails are minimal and natural. The mood is practical and reassuring — a real-world daily UV-protection ritual showing effortless invisible finish.",
  },

  // ── Makeup model (5) ────────────────────────────────────────────────────
  {
    key: "makeup_model_lip_macro",
    category: "makeup",
    format: "model",
    name: "입술 글로시 매크로",
    visualHints: [
      "lip-only crop",
      "parted lips",
      "glossy highlight",
      "lip wand",
      "cupid bow",
      "juicy",
    ],
    scenePrompt:
      "An extreme macro frame cropping from just below the nose to just above the chin tip, centering entirely on the lips in an identity-light composition. The lips are slightly parted, the cupid's bow clearly defined, the entire surface coated in a mirror-like gloss with a bright blown-out specular highlight at each lip's center. From the right edge, a lip-gloss wand enters at a shallow angle, its tapered paddle tip just making contact with the lower lip — caught at the precise moment of application. The shade is a translucent berry-coral. A cool 5500K front key and a warm 3000K backlight give the gloss dual-tone shimmer: cool on the highlight peak, warm in the swell. The surrounding skin is intentionally neutral. The mood is luscious, glossy, and irresistibly juicy.",
  },
  {
    key: "makeup_model_hand_swatch",
    category: "makeup",
    format: "model",
    name: "손등 컬러 스왓치",
    visualHints: [
      "back of hand",
      "multiple swatch stripes",
      "fingertip blending",
      "palette half-in-frame",
      "side light",
      "shimmer",
    ],
    scenePrompt:
      "A cosmetics-counter macro of the back of a hand laid flat against a matte white surface, with three to five parallel color swatch stripes drawn horizontally across the knuckle area using cream eyeshadow or blush pigment. Each stripe is a distinct shade — graduating from nude through warm terracotta to deep plum shimmer. The index finger of the other hand enters from the left, actively blending the far-right stripe in a circular motion, showing how pigment sheers out and reveals shimmer. A compact palette sits half inside the frame at upper-right, its open pan matching the swatched colors. Cool 5500K raking side light from the left makes every shimmer particle sparkle individually. The mood is precise, editorial, and sensorially inviting — a real shade test in progress.",
  },
  {
    key: "makeup_model_eye_crop",
    category: "makeup",
    format: "model",
    name: "눈가 반-크롭",
    visualHints: [
      "horizontal strip crop",
      "single eye",
      "glittery lid",
      "winged liner",
      "inner corner shimmer",
      "mascara wand entry",
    ],
    scenePrompt:
      "A tight horizontal strip crop spanning from the nose bridge to just beyond the outer corner of one eye, with the brow above and cheek below both cropped out — a fully identity-light framing. The visible eyelid carries a rich champagne-to-copper glittery eyeshadow gradient deepened with smoky plum at the crease. A precise black liquid liner traces the upper lash line into a sharp elongated wing. The inner corner catches a pressed pearl shimmer that flares in the key light. From the far right, a mascara wand enters diagonally, bristles a centimeter from the upper lashes — suggesting the very next step. A cool 5500K front key paired with a warm rim from above-right separates glitter facets into individual points of light. The mood is dramatic and meticulous — editorial eye makeup mid-application.",
  },
  {
    key: "makeup_model_chin_rest",
    category: "makeup",
    format: "model",
    name: "턱-손받침 하프바디",
    visualHints: [
      "half body",
      "chin on hand",
      "dewy base",
      "neutral knit",
      "soft pastel gradient",
      "polished",
      "identity-light",
    ],
    scenePrompt:
      "A half-body frame cropped from collarbone to just above the brow line — forehead and crown excluded for a deliberately identity-light editorial feel. The subject wears a fitted ivory ribbed-knit top; one hand is raised, the back of the hand resting lightly under the chin, fingers loosely curled. Skin shows flawless dewy base makeup, lit with a soft 5000K front fill and a pastel-rose gradient background transitioning from pale blush at the lower edge to near-white at the top. The neck and décolletage catch a faint luminizer glow, and the nails carry a sheer rose gel finish. Depth of field keeps hand and jawline equally sharp while the background stays smoothly out of focus. The mood is polished and clean-beauty — a showcase of flawless base.",
  },
  {
    key: "makeup_model_nape_back",
    category: "makeup",
    format: "model",
    name: "후두부-귀-목선",
    visualHints: [
      "back three-quarter",
      "nape",
      "ear",
      "hair tuck gesture",
      "amber backlight",
      "fragrance feel",
    ],
    scenePrompt:
      "A three-quarter back-turned composition where the subject faces roughly 150 degrees away from camera, revealing the nape, one ear, and the upper shoulder blade. One hand reaches upward in a graceful gesture, tucking a loose strand of hair behind the ear — the movement frozen at peak elegance. A warm amber backlight at 3200K grazes the nape from above-left, contouring the neck's curve and rimming the ear and hair wisps with a golden halo reminiscent of a fragrance campaign. The opposite shoulder is bare or in a minimal thin-strap ivory garment. The background is deep smoky taupe that absorbs ambient light, letting the amber rim be the sole source of drama. The face is entirely away from camera — zero identity visible. The mood is intimate and quietly glamorous.",
  },

  // ── Haircare model (5) ──────────────────────────────────────────────────
  {
    key: "haircare_model_hair_flow",
    category: "haircare",
    format: "model",
    name: "후두부 흐르는 머릿결",
    visualHints: [
      "back view long hair",
      "hand sweeping strands",
      "rim light",
      "neutral background",
      "glossy",
      "mid-shot",
    ],
    scenePrompt:
      "A medium-length back-view shot framing the subject from shoulder to waist, showing a full cascade of long straight hair falling unobstructed down the back. One open hand sweeps a wide swath of hair from crown toward tips in a single fluid motion, caught at the midpoint of the stroke. A narrow cool 6000K pin light rims the hair from directly above, creating a brilliant glossy highlight band along every swept strand that reveals individual hair fibers in near-fiber-optic clarity. The background is neutral medium-gray, keeping all attention on texture and movement. The second arm hangs naturally at the side. No face or front-of-body in frame. The mood is confidently clinical and aspirationally shiny — a hair-care commercial's signature beauty shot.",
  },
  {
    key: "haircare_model_wet_wash",
    category: "haircare",
    format: "model",
    name: "샤워실 헤어워시",
    visualHints: [
      "wet hair",
      "foam at crown",
      "fingers massaging scalp",
      "water droplets",
      "bathroom tile",
      "cool tone",
    ],
    scenePrompt:
      "A back-and-shoulder close shot inside a shower, framing from the nape of the neck to mid-shoulder blade. The hair is completely saturated with water, lying flat and darkened against the scalp. A generous dome of white lather crowns the top of the head, and both hands are partially buried in it — fingers spread, pressing and kneading in an active scalp-massage motion. Individual large water droplets roll down the shoulder blades and neck, each one catching the cool 6500K overhead shower light as a bright specular point. The background is pale gray subway tile with white grout, slightly steam-softened. The overall color temperature is cool and clean. No face visible — the frame cuts at the chin line. The mood is fresh, invigorating, and deeply satisfying — the sensory peak of a scalp-cleansing ritual captured in high-detail.",
  },
  {
    key: "haircare_model_oil_apply",
    category: "haircare",
    format: "model",
    name: "손바닥 오일 + 머리끝 도포",
    visualHints: [
      "oil drop on palm",
      "fingertip rub",
      "hair tip squeeze",
      "beige background",
      "two-hand frame",
      "daylight",
    ],
    scenePrompt:
      "A split-action macro capturing two gestures in one horizontal frame: on the left, a palm faces upward with a single amber hair-oil droplet at its center, catching daylight as a warm golden bead; on the right, those fingers are now gathered around the bottom few centimeters of a hair section, gently squeezing and smoothing the tips in a sealing motion. The transition reads naturally because the tight frame keeps both hands connected. The background is a warm beige paper that complements the amber oil tone. Soft 5000K diffuse window daylight from above-left produces gentle highlight definition on each finger and a faint sheen on the oiled tips. No face visible. The mood is nourishing and ritualistic — the defining gesture of a repair-oil treatment.",
  },
  {
    key: "haircare_model_brush_side",
    category: "haircare",
    format: "model",
    name: "빗질 모션 사이드",
    visualHints: [
      "side profile",
      "paddle brush",
      "mid stroke",
      "vanity mirror blur",
      "white studio",
      "backlit hair",
    ],
    scenePrompt:
      "A clean side-profile medium shot framing the subject from the ear to below the shoulder, the face cropped at the cheek — identity-light by design. A large oval paddle brush with a wooden handle is held at the crown and caught mid-stroke, exactly halfway through a smooth downward pull aligning the full length of straight hair. Behind the subject, slightly out of focus, the beveled edge of a vanity mirror reflects a warm 3200K light source that rims the back of the hair with a thin gold line. A narrow backlight from above separates the hair silhouette from the white studio ground with a luminous outline. The bristles leave faint alignment traces in the hair surface below the stroke. The mood is clean, precise, and aspirationally smooth.",
  },
  {
    key: "haircare_model_hair_toss",
    category: "haircare",
    format: "model",
    name: "머리카락 휘날림",
    visualHints: [
      "three-quarter",
      "hair toss",
      "frozen motion",
      "fan-shape strands",
      "gradient backdrop",
      "side key",
      "bare shoulder",
    ],
    scenePrompt:
      "A three-quarter medium shot capturing the exact peak of a hair-toss, shutter speed fast enough to freeze every strand mid-air. The hair fans out in a dramatic arc above and to one side of the head, individual strands separated and luminous, forming a near-perfect semi-circular silhouette. One bare shoulder is visible, adding contextual lightness. The background is a smooth gradient from pale blush at the bottom to near-white at the top, contrasting the hair's color and making its airborne shape pop. A cool 6000K side key from camera right skims every airborne strand, producing a highlight ribbon along the outer arc of the toss. The chin is raised, face turned away — entirely identity-light while reading as dynamically energized. The mood is kinetic, confident, and visually arresting.",
  },

  // ── Food model (5) ──────────────────────────────────────────────────────
  {
    key: "food_model_cup_sip",
    category: "food",
    format: "model",
    name: "손이 컵 잡고 한 모금",
    visualHints: [
      "hands holding mug",
      "lips near rim",
      "steam rising",
      "knit sleeve",
      "warm daylight",
      "cafe blur",
    ],
    scenePrompt:
      "A cozy medium shot cropped from collarbone to just below the chin, framing both hands cradling a wide ceramic mug at chest height, lips approaching the rim — caught the instant before contact, expression neutral and identity-light. The subject wears a chunky cream ribbed-knit sleeve visible at both wrists. A delicate coil of steam rises from the dark liquid surface and softens in warm 3500K side daylight from a window blurring behind the scene. The mug is a simple matte clay vessel in terracotta or sage. The background reads as a soft-focus cafe interior — warm amber and ivory with a faint suggestion of shelving. The palette is warm amber, cream, and earthy clay. The mood is slow, warming, and unmistakably cafe-morning comfort.",
  },
  {
    key: "food_model_bite",
    category: "food",
    format: "model",
    name: "한 입 베어물기",
    visualHints: [
      "bite mark",
      "food cross section",
      "both hands holding food",
      "mouth corner",
      "slight overhead",
      "wood table blur",
    ],
    scenePrompt:
      "A near-macro upper-torso frame showing both hands holding a food item — a thick sandwich, a filled bread roll, or a layered tart — at mouth height, rotated so the freshly bitten cross-section faces the camera. The bite reveals interior layers: fillings, sauces, crumb structure, and color contrast. At the right edge, the corner of the mouth is just visible, lips relaxed around the tail end of the bite — enough to show the eating gesture without revealing any identity. Crumbs and a faint sauce smear on one finger add natural detail. The angle is slightly overhead at about 20 degrees. A warm-toned wooden table blurs softly in the lower background. The mood is genuinely appetizing — the decisive moment of a real-food bite, unfiltered.",
  },
  {
    key: "food_model_pour_serve",
    category: "food",
    format: "model",
    name: "식탁 위 손이 푸어링",
    visualHints: [
      "top-down 30 degree",
      "hands only",
      "pouring stream",
      "ceramic kettle",
      "linen napkin",
      "banchan layout",
    ],
    scenePrompt:
      "A 30-degree overhead composition showing only hands and forearms above a carefully styled Korean table setting — no face or upper body in frame. The left hand steadies a pale celadon ceramic kettle, tilting it so a thin arching stream of tea pours into a small handleless cup, while the right hand lightly steadies the cup. Around this central action, the table carries the restrained abundance of Korean premium food content: small banchan dishes, a folded natural-flax linen napkin, a carved wooden spoon, and a single chrysanthemum blossom at one corner. Broad soft daylight at 5200K from above-left produces gentle graduated shadows that give the celadon and linen full tactile depth. The mood is ceremonial, refined, and unmistakably Korean food culture.",
  },
  {
    key: "food_model_label_front",
    category: "food",
    format: "model",
    name: "제품 들고 정면 라벨",
    visualHints: [
      "torso medium",
      "product front",
      "label aligned",
      "kitchen counter blur",
      "casual sleeve",
      "second hand action",
    ],
    scenePrompt:
      "A chest-to-hip medium shot inside a softly blurred kitchen, showing a person holding a packaged food product — a jar, bottle, or pouch — with both hands at mid-torso height. The product label faces the camera squarely in sharp focus. The primary hand grips the product from behind while the secondary hand reaches to the cap or seal in the act of opening it, suggesting the product is moments from use. The subject wears a casual linen or cotton long-sleeve top with slightly rolled cuffs. Behind, a kitchen counter with pale tiles and a cutting board blur gently into a warm 4500K ambient tone. No face visible — the frame cuts at the collarbone. The mood is approachable and purchase-motivating — a confident product-presentation moment in a real kitchen.",
  },
  {
    key: "food_model_communal",
    category: "food",
    format: "model",
    name: "둥글게 둘러앉은 식탁",
    visualHints: [
      "over the shoulder",
      "multiple hands",
      "abundant table",
      "banchan spread",
      "communal mood",
      "warm saturation",
    ],
    scenePrompt:
      "A wide medium shot filmed over one person's shoulder, looking across an abundantly set round table where four to five people are seated — only hands, arms, and lower torsos visible, all reaching simultaneously toward shared dishes. The table is loaded in Korean communal style: a central main dish surrounded by six to eight banchan plates, rice bowls, soup, chopsticks, and spoons. Multiple hands are caught mid-reach — some pinching with chopsticks, some ladling soup, one lifting a lid. The foreground shoulder and sleeve ground the viewer as a participant. Lighting is warm and saturated at 3500K, giving food and hands a convivial golden glow. The mood is generous, celebratory, and deeply communal — the living center of Korean food culture.",
  },

  // ── Fashion model (5) ───────────────────────────────────────────────────
  {
    key: "fashion_model_full_street",
    category: "fashion",
    format: "model",
    name: "거리 풀바디 정면 스냅",
    visualHints: [
      "full body front",
      "urban concrete wall",
      "hands in pockets",
      "oversized fit",
      "neutral palette",
      "contrapposto",
    ],
    scenePrompt:
      "A full-body street-snap frame in an 8:10 portrait ratio, shot against a rough urban concrete wall in natural overcast daylight at 6000K. The subject stands in a relaxed contrapposto — weight shifted to one hip, one hand tucked into a trouser pocket, the other hanging loosely near a tote bag strap. The outfit is oversized and layered: a wide-shoulder blazer over a minimal tee, straight-leg trousers with a slight break at the ankle, and clean low-profile sneakers. The palette is strictly neutral — chalk, oat, stone gray, and one quiet accent. The face is partially in shadow or turned slightly, minimizing identity while keeping styling fully legible. The framing leaves comfortable margin at head and feet. The mood is effortlessly cool and street-editorial.",
  },
  {
    key: "fashion_model_lower_crop",
    category: "fashion",
    format: "model",
    name: "하반신 + 신발 컷",
    visualHints: [
      "lower body crop",
      "shoe centered",
      "asphalt floor",
      "rolled-up hem",
      "walking step",
      "top-down angle",
    ],
    scenePrompt:
      "A lower-body-only crop spanning from hip or knee down to the ground, eliminating everything above the waist for a completely identity-free composition centered on garment and footwear. The subject is caught mid-walking-step — one foot forward, one back, a slight heel lift on the trailing foot. The trousers are slim or straight with a deliberately rolled-up hem that exposes the ankle and draws the eye down to the shoe, occupying the lower third of the frame. The footwear — a sneaker, loafer, or minimalist boot — is in sharp focus while the upper leg softens slightly. The ground is textured asphalt or polished concrete with tonal depth. Cool overcast daylight at 6000K creates flat, graphic shadows. The mood is fashion-forward, detail-oriented, and street-credible.",
  },
  {
    key: "fashion_model_bag_half",
    category: "fashion",
    format: "model",
    name: "가방을 든 손 하프바디",
    visualHints: [
      "half body",
      "bag centered",
      "hand grip on top handle",
      "neutral wall",
      "warm beige",
      "refined accessory focus",
    ],
    scenePrompt:
      "A chest-to-upper-thigh half-body frame against a flat warm beige studio wall. The structured leather bag is positioned at the center of the composition — its top handle gripped from above by one hand, the leather's grain and hardware in precise focus. The second hand reaches to the bag's side, fingers lightly touching the strap in an accessory-arranging gesture, adding life to what could otherwise be a static product shot. The subject wears a minimal thin knit or tailored shirt that disappears visually so the bag commands the eye. The face is cropped at the chin or collarbone. Warm 4800K side light from camera left creates a modeling shadow along the bag's sides that reveals its three-dimensional structure and leather quality. The mood is refined and quietly aspirational.",
  },
  {
    key: "fashion_model_back_walk",
    category: "fashion",
    format: "model",
    name: "후면 워킹 컷",
    visualHints: [
      "back view full body",
      "walking motion",
      "vanishing perspective",
      "backlight rim",
      "coat back detail",
      "hair flow",
    ],
    scenePrompt:
      "A full-body back-view shot as the subject walks away from camera down a narrow urban lane or gallery corridor, the full silhouette — head to heel — visible. The perspective vanishes gently toward the background, giving depth and movement. A strong backlight at 4200K floods from the corridor's far end, rimming the entire silhouette — shoulders, coat hem, and hair — with a warm luminous outline that separates the figure from the space. The coat's back seam, collar, or hem detail renders in clear profile. Long hair or a loosely tucked scarf catches the backlight and ripples with walking motion. The ground is polished stone or worn concrete. The face is entirely away from camera. The mood is confident, directional, and cinematic — the signature fashion editorial back-walk.",
  },
  {
    key: "fashion_model_mirror_indoor",
    category: "fashion",
    format: "model",
    name: "거울 실내 캐주얼 착샷",
    visualHints: [
      "full length mirror selfie",
      "phone in hand",
      "plain wall",
      "pastel palette",
      "hip lean",
      "daily ootd",
    ],
    scenePrompt:
      "An indoor full-length mirror OOTD composition set against a clean plain wall — soft white or palest blush — with the mirror's simple frame visible at the edges. The subject stands with one hip lightly leaning against the wall, one hand holding a phone at chest height as if taking the photo, the other hand resting casually on the opposite hip. The outfit is a casual-chic daily look in a pastel palette — lavender, butter, or mint — with simple white sneakers and a minimal bag. The mirror's reflection shows the full front of the outfit while the phone hand partially obscures the face, keeping the composition identity-light while feeling authentic. Soft diffuse indoor daylight at 5200K fills the scene evenly. The mood is relatable, casually aspirational, and immediately recognizable as a personal OOTD story post.",
  },

  // ── Lifestyle model (5) ─────────────────────────────────────────────────
  {
    key: "lifestyle_model_sofa",
    category: "lifestyle",
    format: "model",
    name: "소파 거실 무드 앉음",
    visualHints: [
      "living room interior",
      "sofa sitting",
      "mug in hands",
      "beige wood palette",
      "candle nearby",
      "knit loungewear",
    ],
    scenePrompt:
      "A wide medium interior shot of a warm Korean-apartment living room, framing the subject from knees to just below the chin on a soft beige fabric sofa. Legs are tucked sideways in a curled relaxed posture, and both hands cradle a wide matte ceramic mug at mid-chest height. The subject wears a chunky oatmeal-colored knit loungewear set — wide-leg trousers and an oversized top with visible rib texture. To the left, a low walnut side table holds a lit candle and a diffuser. Behind, warm 3200K pendant lighting casts a pooled glow, while cool 5000K daylight from a window on the left balances the scene. The palette is cream, warm walnut, sage, and muted terracotta. Face cropped at the chin. The mood is deeply cozy and aspirationally restful — a Sunday afternoon preserved.",
  },
  {
    key: "lifestyle_model_candle_hand",
    category: "lifestyle",
    format: "model",
    name: "캔들 점화 손 컷",
    visualHints: [
      "hand close-up",
      "candle flame as keylight",
      "amber glow",
      "dim interior",
      "lighter or match",
      "ritual",
    ],
    scenePrompt:
      "An intimate close-up in which two hands and a candle fill the frame against a deeply dimmed interior — no face, no upper body. The left hand steadies a wide-mouth ceramic vessel on a dark walnut surface; the right holds a long match that has just sparked: the flame tip barely touches the wick, on the edge of catching. The only meaningful light comes from the match flame — a warm amber 2700K point source wrapping the hands in soft golden glow and rimming the candle vessel's edge, leaving all else in shadow. A thin thread of smoke rises from the freshly lit wick. The background dissolves to near-black. The palette is amber, charcoal, and pale candle wax. The mood is slow, ritual, and meditative.",
  },
  {
    key: "lifestyle_model_desk_journal",
    category: "lifestyle",
    format: "model",
    name: "책상 다이어리 톱다운 손",
    visualHints: [
      "top-down desk",
      "hand writing",
      "journal open",
      "masking tape",
      "soft daylight",
      "light wood",
      "flatlay",
    ],
    scenePrompt:
      "A 45-degree elevated desk-scene composition where the writing surface occupies 65 percent of the frame. The base is a light birch or ash desk with a smooth matte finish. An open dot-grid journal lies at the center, and one hand — sleeve barely visible at the wrist — holds a fine-tip pen mid-word above the page. The specific words are intentionally indistinct; only the writing act and the pen nib's contact with paper are sharp. Around the journal: a washi-tape dispenser with a pale floral strip peeling up, a ceramic espresso cup with a dark ring at its rim, two stacked softcover books, and a single trailing philodendron leaf. Soft 5200K window daylight from the upper left traces long shadows across every item. The mood is contemplative and authentically creative — a genuine journaling moment mid-thought.",
  },
  {
    key: "lifestyle_model_kitchen_cook",
    category: "lifestyle",
    format: "model",
    name: "주방 카운터 요리 동작",
    visualHints: [
      "kitchen counter",
      "hands cooking",
      "cutting board",
      "apron",
      "pendant warm light",
      "white tile backsplash",
    ],
    scenePrompt:
      "A front-facing medium shot across the kitchen counter, framing the subject from waist to just below the chin — face cropped out for an identity-light composition. The subject wears a clean white linen apron over a rolled-up sleeve chambray shirt, both hands active: one presses a knife through a bundle of scallions on a light wood cutting board while the other steadies the bundle at the far end. The counter is styled with restraint — a small ceramic bowl of sea salt, a pressed garlic clove, and a sprig of thyme beside the board. The backsplash is white subway tile with matte gray grout. Two warm 3200K pendant lights produce a focused pool of amber light that separates the subject from the cooler tiled wall. The mood is approachable domestic expertise — cooking as a quiet, confident daily pleasure.",
  },
  {
    key: "lifestyle_model_bedroom_routine",
    category: "lifestyle",
    format: "model",
    name: "침실 정돈 루틴",
    visualHints: [
      "bedroom side profile",
      "vanity mirror",
      "morning light",
      "robe loungewear",
      "brushing or perfume spritz",
    ],
    scenePrompt:
      "A calm side-profile medium shot inside a minimal bedroom, capturing the subject from hip to chin in a soft satin robe in ivory or blush. The subject is seated on the bed's edge or standing before a low vanity mirror — the mirror's frame just visible at one corner. One hand lifts a wide-tooth comb or paddle brush in a smooth downward stroke, while the other rests on the opposite shoulder. Alternatively the hand holds a perfume atomizer at the collarbone, a faint mist cloud dispersing in morning light. Soft warm 3800K daylight from a window off camera right wraps the robe in a delicate satin sheen. The bed behind is softly out of focus in rumpled cream linen. Face cropped at the chin. The mood is quietly intimate — an unobserved morning beauty ritual.",
  },

  // ── Etc model (5) ───────────────────────────────────────────────────────
  {
    key: "etc_model_in_hand",
    category: "etc",
    format: "model",
    name: "인핸드 클로즈업",
    visualHints: [
      "hand holding product",
      "close-up",
      "fingers on button",
      "soft daylight",
      "neutral background",
      "tactile",
    ],
    scenePrompt:
      "A clean hand-held product macro in which one or both hands fill the majority of the frame, holding the product 30 to 50 centimeters from camera. The grip is natural — thumb on the front face, fingers curled around the body, index fingertip resting lightly on the primary button or cap as if about to engage it. The product tilts slightly upward so the label and hand geometry both read clearly. The background is a softly blurred single-color wall in warm oat or pale gray, or a natural-light window with gentle bokeh. Diffuse 5000K daylight from above-left produces a faint modeling shadow that gives hand and product dimensional depth. Nails are minimal. The mood is tactile, trustworthy, and approachable — a hand-feel demo that makes the product feel tangible through a screen.",
  },
  {
    key: "etc_model_desk_pov",
    category: "etc",
    format: "model",
    name: "데스크 POV 사용 컷",
    visualHints: [
      "top-down view",
      "desk surface",
      "hands and forearms",
      "coffee mug prop",
      "contextual scene",
      "warm indoor",
    ],
    scenePrompt:
      "A first-person POV shot looking straight down at a desk surface, camera at eye-level angled downward at about 70 degrees. Two forearms and hands extend into the lower frame, oriented as a real user would hold them. The product sits on the desk between the hands, engaged or in active use. Around it: an open laptop keyboard at the upper edge, a ceramic mug of dark coffee to the right, and an open notebook with a pen to the left. The desk surface is warm light oak. Soft warm ambient light at 4000K from a pendant above-right gives the scene a cozy, productive afternoon quality. No face, shoulders, or upper body. The mood is immediate and familiar — the product slots seamlessly into a real work session.",
  },
  {
    key: "etc_model_back_lifestyle",
    category: "etc",
    format: "model",
    name: "후면 라이프스타일",
    visualHints: [
      "back view",
      "full or half body",
      "indoor lifestyle scene",
      "natural light",
      "candid pose",
      "no face",
    ],
    scenePrompt:
      "A candid back-view lifestyle shot framing the subject from waist or hip to just above head height, showing the back and shoulders in a real interior environment — a living room, home yoga space, or bathroom. The subject is engaged in a natural activity: reaching for something on a shelf, rolling out a yoga mat, or standing at a window looking out, with the product held in one hand or visible on a nearby surface. Posture is relaxed and unstaged. Natural diffuse daylight at 5200K enters from one side, producing soft directional light across the clothing and room. The background shows genuine interior depth — furniture, plants, and architectural detail — without being cluttered. No face visible from any angle. The mood is authentic and contextually grounding — placing the product inside a real lifestyle without performance.",
  },
  {
    key: "etc_model_companion",
    category: "etc",
    format: "model",
    name: "동반자 동행 (펫/아이)",
    visualHints: [
      "pet or child centered",
      "adult hand or knees only",
      "low eye-level",
      "carpet floor",
      "caring gesture",
    ],
    scenePrompt:
      "A low eye-level shot at roughly 40 centimeters off the ground, placing the camera at the height of a small dog, cat, or toddler who is the compositional center. The animal or child occupies 50 to 60 percent of the frame — their expression and posture the emotional anchor. An adult is present only in fragments: a hand extending from the right edge to offer the product, or knees and lower legs visible behind as a reassuring presence. The floor is a plush cream or warm gray carpet filling the lower half with cozy texture. Warm 4000K afternoon light from a window at camera right bathes the scene in soft golden tones. The product appears naturally in the hand or nearby without being intrusively staged. The mood is warm, gentle, and trust-building.",
  },
  {
    key: "etc_model_action_fragment",
    category: "etc",
    format: "model",
    name: "동작 단편",
    visualHints: [
      "cropped limb",
      "motion in progress",
      "mid-action gesture",
      "directional light",
      "clean backdrop",
      "no face",
    ],
    scenePrompt:
      "A high-speed-freeze action fragment isolating a single limb — wrist, forearm, ankle, or shin — in the middle of a dynamic motion, captured at 1/200 second or faster. The cropped limb occupies the diagonal of the frame: a forearm turning a jar lid, a wrist flicking a cap open, or a foot mid-step onto a yoga mat. The background is a clean white studio cyclorama or smooth matte gym floor in pale gray. A single strong directional light at 5500K from one side creates a crisp modeling shadow that underscores the limb's form and direction of force. The composition is tight and graphic — only the limb, the product interface point, and the clean backdrop in frame. No face, no torso, no identity. The mood is energetic, precise, and visually arresting.",
  },

  // ── Etc (5) ─────────────────────────────────────────────────────────────
  {
    key: "etc_deskterior",
    category: "etc",
    format: "mood",
    name: "데스크테리어 톱뷰",
    visualHints: [
      "pale oak desk",
      "keyboard edge",
      "ceramic mug",
      "small monstera",
      "neutral palette",
      "30 to 45 degree angle",
    ],
    scenePrompt:
      "A clean modern desktop scene captured between top-down and a 30-degree elevation. The base is a pale oak or birch desk with a smooth matte finish. The visible edge of a low-profile mechanical keyboard runs along one side, and a closed slim laptop sits to the back. Around the product, a small ceramic mug of black coffee, a tiny potted monstera, an open softcover notebook with a fountain pen across it, and a single folded gray cable are arranged with intentional negative space. Soft window daylight at 5200K from camera left produces gentle long shadows that emphasize the wood grain. The palette is strictly neutral — oat, cream, soft gray, with a single sage-green accent. The mood is calm, productive, modern home-office aesthetic.",
  },
  {
    key: "etc_homecafe_window",
    category: "etc",
    format: "mood",
    name: "홈카페 윈도우 사이드",
    visualHints: [
      "ivory linen runner",
      "sunlit window",
      "warm backlight rim",
      "ceramic mug blurred",
      "dried flower",
      "shallow depth",
      "slow morning",
    ],
    scenePrompt:
      "A serene home-cafe window-side scene captured close to a south-facing window. An ivory linen runner sits on a pale wooden ledge, the warm 3000K backlight rimming every object's edge with a luminous golden halo. Behind the product, a soft-focus ceramic mug holding a cappuccino with delicate foam, a small bud vase with a single dried wildflower, and a closed leather-bound notebook fall gracefully out of focus into a creamy bokeh. A few crumbs and a folded paper napkin add lived-in detail in the immediate foreground. The depth of field is intentionally shallow. The palette is cream, gold, ivory, and warm pale brown. The mood is unhurried, latte-quiet, weekend slow-morning ritual.",
  },
  {
    key: "etc_pastel_studio",
    category: "etc",
    format: "mood",
    name: "페일 파스텔 스튜디오",
    visualHints: [
      "butter yellow paper",
      "mint accent prop",
      "crisp top light",
      "small ribbon",
      "candy palette",
      "MZ studio",
    ],
    scenePrompt:
      "A clean studio scene built on a single pale butter-yellow paper sweep that wraps from wall to floor without a visible seam. Tiny coordinating props in the same family — a small mint-green acrylic cube, a thin curled satin ribbon, a single pastel marble — are placed in the corners as graphic accents. Lighting is a crisp narrow top-front key at 5200K, producing a single short, defined drop shadow directly beneath the product, giving it presence without grounding it heavily. The post-treatment leans saturated-candy, with cleanly separated color blocks. The framing is centered and graphic, ready for a square thumbnail. The mood is fresh, modern, MZ-studio, social-friendly product display.",
  },
  {
    key: "etc_warm_living",
    category: "etc",
    format: "mood",
    name: "따뜻한 라이빙 디테일",
    visualHints: [
      "warm beige rug",
      "hardwood floor",
      "house plant",
      "soft daylight",
      "real home corner",
      "cozy ambient",
    ],
    scenePrompt:
      "A warm real-home corner detail framed wide enough to feel inhabited. The base is a hardwood floor in honey oak partially covered by a thick warm-beige textured rug with subtle weave. The product sits on the rug beside a single felt slipper, a small earthenware planter holding a fiddle-leaf fig, a folded knit throw in cream, and an open paperback lying cover-down. Soft late-afternoon daylight at 4000K spills across the rug from a window just out of frame, producing gentle elongated shadows and a quiet glow. The framing is slightly low and wide, like a casual cellphone snap elevated. The palette stays in honey, beige, cream, and forest green. The mood is genuine, lived-in, warm-home cozy — captured as a still, unattended corner.",
  },
  {
    key: "etc_dark_cleantech",
    category: "etc",
    format: "mood",
    name: "다크 무드 클린텍",
    visualHints: [
      "matte black backdrop",
      "side spotlight",
      "metal stand",
      "carbon texture",
      "single accent color",
      "sleek tech ad",
    ],
    scenePrompt:
      "A sleek dark-tech scene built on a deep matte-black backdrop and a brushed-charcoal carbon-fiber surface that picks up only the cleanest specular highlights. The product is presented on a slim machined-aluminum stand, with a single thin LED light strip running behind it in one accent color — saturated red, cyan, or champagne gold — that throws a controlled colored rim around its silhouette. The key light is a tight cool 5500K side spotlight from camera left that carves the product's edge, while the rest of the frame remains absorbed in matte black. A faint reflection of the accent color glows on the carbon surface. The mood is precision-engineered, modern, premium consumer-tech advertising.",
  },
];

/**
 * Filter patterns by category and format.
 * @param {CategoryKey} category
 * @param {QuickFormat} format
 * @returns {QuickPattern[]}
 */
export function getPatternsFor(category, format) {
  return QUICK_PATTERNS.filter(
    (p) => p.category === category && p.format === format,
  );
}

/**
 * Find a pattern by its unique key.
 * @param {string} key
 * @returns {QuickPattern | undefined}
 */
export function getPatternByKey(key) {
  return QUICK_PATTERNS.find((p) => p.key === key);
}
