import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "쿠팡 썸네일 사이즈 자동 변환 — 800×800 무료 도구 | Zeriv",
  description:
    "쿠팡 800×800 + 스마트스토어 860 + 올리브영 760 + 인스타·메타·카카오 등 10채널 썸네일을 한 번에 자동 변환. 가입 없이 무료. 클라이언트 사이드 처리로 빠르고 안전.",
  keywords: [
    "쿠팡 썸네일 사이즈",
    "쿠팡 800x800",
    "스마트스토어 썸네일",
    "올리브영 이미지 사이즈",
    "이미지 사이즈 변환",
    "셀러 도구",
  ],
  openGraph: {
    title: "쿠팡 썸네일 사이즈 자동 변환 — 10채널 무료",
    description:
      "이미지 1장으로 쿠팡·스마트스토어·인스타·메타 등 10채널 사이즈 한 번에",
    type: "website",
    locale: "ko_KR",
    // OG 이미지: opengraph-image.tsx 에서 자동 생성 (Next.js 규약)
  },
  alternates: {
    canonical: "http://localhost:3000/tools/coupang-thumbnail-size",
  },
};

export default function CoupangThumbnailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
