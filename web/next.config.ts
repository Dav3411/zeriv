import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // PortOne V1 SDK 는 cdn.iamport.kr 에서 로드된다. (V2 SDK 는 사용하지 않음)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.iamport.kr", // Next.js + PortOne V1 SDK
      "style-src 'self' 'unsafe-inline'", // Tailwind inline style
      "img-src 'self' data: https: blob:", // R2, 외부 이미지
      "font-src 'self' data:",
      // api.resend.com은 서버-서버 호출이므로 제외. R2는 proxy 경유하므로 제외.
      // PortOne V1: SDK 가 *.iamport.kr (가맹점 PG 정보·V1 API) 와 *.iamport.co (신규 checkout-service) 양쪽을 호출.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paypal.com https://api-m.paypal.com https://*.iamport.kr https://*.iamport.co",
      "media-src 'self' https: blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      // PortOne 결제창은 *.iamport.kr / *.iamport.co 에서 iframe 으로 뜨고, Galaxia 결제창은 *.galaxiamoneytree.co.kr 에서 iframe/popup 으로 뜬다.
      "frame-src 'self' https://*.iamport.kr https://*.iamport.co https://*.galaxiamoneytree.co.kr",
      // 결제 완료 후 PG 측이 form POST 로 우리 도메인에 redirect 할 수 있으므로 self 외에 외부 도메인도 허용.
      "form-action 'self' https://*.iamport.kr https://*.iamport.co https://*.galaxiamoneytree.co.kr",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.r2.dev" }],
  },
  async headers() {
    if (process.env.NODE_ENV === "development") return [];
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
