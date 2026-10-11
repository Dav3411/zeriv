/**
 * blogAuthors.ts — 블로그 저자 프로필 상수.
 * author_name → slug 변환 유틸 포함.
 */

export interface AuthorProfile {
  slug: string;
  name: string;
  title: string;
  bio: string;
  avatarUrl?: string; // undefined이면 그라데이션 placeholder 사용
  social?: {
    twitter?: string;
    instagram?: string;
  };
}

export const AUTHOR_PROFILES: Record<string, AuthorProfile> = {
  "zeriv-team": {
    slug: "zeriv-team",
    name: "Zeriv Team",
    title: "AI 이미지 스튜디오",
    bio: "쿠팡 셀러를 위한 AI 썸네일 제작 도구를 만듭니다. 누끼·감성컷·모델컷·다채널 사이즈 변환을 한 번에.",
    social: {},
  },
};

/**
 * author_name → URL slug 변환.
 * 소문자 + 공백은 하이픈 + 특수문자 제거 (한글 유지).
 */
export function authorNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w가-힣-]/g, "");
}

/**
 * slug → AuthorProfile 반환. 등록되지 않은 slug면 기본 프로필 반환.
 */
export function getAuthorProfile(slug: string): AuthorProfile {
  return (
    AUTHOR_PROFILES[slug] ?? {
      slug,
      name: slug,
      title: "Zeriv 블로그 작성자",
      bio: "",
    }
  );
}
