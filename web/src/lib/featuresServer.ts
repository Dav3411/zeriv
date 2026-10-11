export const serverFeatures = {
  referrals: process.env.ENABLE_REFERRALS === "true",
} as const;
