export const features = {
  // Viral growth (optional)
  referrals: process.env.NEXT_PUBLIC_ENABLE_REFERRALS === "true",

  // Retention helpers (optional)
  templates: process.env.NEXT_PUBLIC_ENABLE_TEMPLATES === "true",
} as const;
