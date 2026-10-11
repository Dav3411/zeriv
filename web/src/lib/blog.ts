/**
 * blog.ts — 블로그 도메인 공용 유틸.
 *
 * 서버 전용 함수가 섞여 있어도 안전하도록, marked import 는
 * 마크다운 렌더 함수 안에서 사용한다 (lazy 형태). marked 자체는
 * 브라우저에서도 동작하지만, 우리 블로그 페이지는 모두 서버 컴포넌트이므로
 * 이 모듈은 사실상 서버 사이드에서만 호출된다.
 */

import { marked } from "marked";

// marked.use는 전역 상태를 변경한다. 모듈 초기화 시 1회 실행.
// heading token { depth, tokens } — marked v18 기준.
marked.use({
  renderer: {
    heading(token) {
      const innerHtml = this.parser.parseInline(token.tokens);
      const rawText = token.tokens
        .map((t: { raw?: string }) => t.raw ?? "")
        .join("");
      const id = rawText
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w가-힣-]/g, "");
      return `<h${token.depth} id="${id}">${innerHtml}</h${token.depth}>\n`;
    },
  },
});

/** 블로그 포스트 상태값. */
export type BlogPostStatus = "draft" | "published";

/** 퍼블릭 응답에 노출되는 포스트 메타. content 는 단건 조회에서만. */
export interface BlogPostListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  tags: string[];
  published_at: string | null;
  author_name: string;
}

export interface BlogPost extends BlogPostListItem {
  content: string;
  status: BlogPostStatus;
  created_at: string;
  updated_at: string;
  meta_title: string | null;
  meta_description: string | null;
}

/**
 * title 에서 URL slug 를 생성한다.
 * - 한글/영문/숫자/하이픈만 남기고 공백은 하이픈으로 치환.
 * - 100자 이내로 자른다.
 * - 소문자만 사용.
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

/**
 * 마크다운 → HTML 변환.
 *
 * - GFM 활성화 (테이블, 자동 링크 등).
 * - breaks: false — 줄바꿈은 빈 줄로 처리 (표준 마크다운).
 * - 서버 컴포넌트에서만 호출하는 것을 전제로 sanitize 하지 않는다.
 *   (블로그 컨텐츠는 어드민만 작성하므로 신뢰 가능한 입력이다.)
 *
 * 만약 향후 외부 입력으로 확장된다면 isomorphic-dompurify 등을 추가해야 한다.
 */
export function renderMarkdown(markdown: string): string {
  if (!markdown) return "";
  // marked v18 은 비동기 모드를 기본으로 두지 않으므로 sync 호출 가능.
  // 그래도 string 결과를 강제 보장하기 위해 명시적으로 옵션을 지정한다.
  return marked.parse(markdown, {
    async: false,
    gfm: true,
    breaks: false,
  }) as string;
}

/** 마크다운 heading 추출 결과. */
export type Heading = { id: string; text: string; level: 2 | 3 };

/**
 * 마크다운 원문에서 H2/H3 헤딩을 추출한다.
 * id 생성 규칙은 renderMarkdown의 heading renderer와 동일.
 */
export function extractHeadings(markdown: string): Heading[] {
  return markdown
    .split("\n")
    .filter((l) => /^#{2,3}\s/.test(l))
    .map((l) => {
      const level = (l.startsWith("### ") ? 3 : 2) as 2 | 3;
      const text = l.replace(/^#{2,3}\s/, "").trim();
      const id = text
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w가-힣-]/g, "");
      return { id, text, level };
    });
}

/**
 * 마크다운 원문의 예상 읽기 시간(분)을 반환한다.
 * 공백 제거 후 한국어 기준 분당 600자.
 */
export function calcReadingTime(content: string): number {
  const charCount = content.replace(/\s/g, "").length;
  return Math.max(1, Math.ceil(charCount / 600));
}

/**
 * Supabase row → 퍼블릭 응답 형태로 변환.
 * tags 가 null 인 경우 빈 배열로 정규화.
 */
export function normalizePostRow<T extends { tags: string[] | null }>(
  row: T,
): Omit<T, "tags"> & { tags: string[] } {
  const { tags, ...rest } = row;
  return { ...rest, tags: Array.isArray(tags) ? tags : [] } as Omit<
    T,
    "tags"
  > & {
    tags: string[];
  };
}
