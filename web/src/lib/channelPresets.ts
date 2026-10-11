export const CHANNEL_PRESETS = [
  // SNS
  {
    key: "instagram_feed_4x5",
    label: "인스타그램 피드",
    sub: "4:5 · 1080×1350",
    w: 1080,
    h: 1350,
    filename: "SNS_Instagram_Feed_4x5_1080x1350.jpg",
  },
  {
    key: "instagram_feed_1x1",
    label: "인스타그램 피드",
    sub: "1:1 · 1080×1080",
    w: 1080,
    h: 1080,
    filename: "SNS_Instagram_Feed_1x1_1080x1080.jpg",
  },
  {
    key: "instagram_story",
    label: "인스타그램 스토리",
    sub: "9:16 · 1080×1920",
    w: 1080,
    h: 1920,
    filename: "SNS_Instagram_Story_9x16_1080x1920.jpg",
  },
  // 커머스
  {
    key: "smartstore",
    label: "스마트스토어",
    sub: "1:1 · 860×860",
    w: 860,
    h: 860,
    filename: "Commerce_Smartstore_1x1_860x860.jpg",
  },
  {
    key: "coupang",
    label: "쿠팡",
    sub: "1:1 · 800×800",
    w: 800,
    h: 800,
    filename: "Commerce_Coupang_1x1_800x800.jpg",
  },
  {
    key: "oliveyoung",
    label: "올리브영",
    sub: "1:1 · 760×760",
    w: 760,
    h: 760,
    filename: "Commerce_OliveYoung_1x1_760x760.jpg",
  },
  // 광고
  {
    key: "meta_ad_wide",
    label: "메타 광고 (가로)",
    sub: "16:9 · 1200×628",
    w: 1200,
    h: 628,
    filename: "Ad_Meta_Wide_16x9_1200x628.jpg",
  },
  {
    key: "naver_da",
    label: "네이버 DA 광고",
    sub: "6:5 · 600×500",
    w: 600,
    h: 500,
    filename: "Ad_Naver_DA_6x5_600x500.jpg",
  },
  {
    key: "kakao_bizboard",
    label: "카카오 비즈보드",
    sub: "4:1 · 1029×258",
    w: 1029,
    h: 258,
    filename: "Ad_Kakao_Bizboard_4x1_1029x258.jpg",
  },
  // 동영상
  {
    key: "youtube_thumbnail",
    label: "유튜브 썸네일",
    sub: "16:9 · 1280×720",
    w: 1280,
    h: 720,
    filename: "Video_YouTube_Thumbnail_16x9_1280x720.jpg",
  },
] as const;

export type ChannelKey = (typeof CHANNEL_PRESETS)[number]["key"];

export const CHANNEL_PRESETS_MAP = Object.fromEntries(
  CHANNEL_PRESETS.map((p) => [p.key, p]),
) as Record<ChannelKey, (typeof CHANNEL_PRESETS)[number]>;

export const CHANNEL_GROUPS: {
  group: string;
  keys: ChannelKey[];
}[] = [
  {
    group: "SNS",
    keys: ["instagram_feed_4x5", "instagram_feed_1x1", "instagram_story"],
  },
  {
    group: "커머스",
    keys: ["smartstore", "coupang", "oliveyoung"],
  },
  {
    group: "광고",
    keys: ["meta_ad_wide", "naver_da", "kakao_bizboard"],
  },
  {
    group: "동영상",
    keys: ["youtube_thumbnail"],
  },
];
