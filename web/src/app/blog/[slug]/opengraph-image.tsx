/**
 * blog/[slug]/opengraph-image.tsx — 블로그 포스트 동적 OG 이미지.
 *
 * cover_image_url 이 있는 글은 generateMetadata 에서 images 를 직접 지정하므로
 * 이 파일은 cover 가 없는 글의 fallback 역할을 한다.
 *
 * 폰트: Noto Sans KR woff2 서브셋 두 개를 Edge에서 fetch.
 *   - .119: 라틴 + 가장 빈도 높은 한국어 (가,고,기,다 등)
 *   - .118: 2번째로 빈도 높은 한국어 범위
 *   실제 URL: Google Fonts CSS (Chrome UA) 에서 확인된 gstatic.com 직접 URL.
 *   Cold start 최소화를 위해 2개만 사용. 나머지 글자는 시스템 폰트 fallback.
 */

import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "edge";
export const alt = "Zeriv 블로그";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 가장 빈도 높은 한국어 범위 포함 서브셋 (Google Fonts CSS v39 기준)
const NOTO_KR_119 =
  "https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzmo1eLGC5nwuDo-KBTUm6CryotyJROlrnQ.119.woff2";
const NOTO_KR_118 =
  "https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzmo1eLGC5nwuDo-KBTUm6CryotyJROlrnQ.118.woff2";

export default async function OpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const { data } = await supabaseAdmin
    .from("blog_posts")
    .select("title, tags")
    .eq("slug", params.slug)
    .eq("status", "published")
    .maybeSingle();

  const title = data?.title ?? "Zeriv 블로그";
  const tags: string[] = ((data?.tags as string[] | null) ?? []).slice(0, 2);

  // Noto Sans KR woff2 fetch (두 서브셋 병렬). Edge cold start 시 외부 fetch 실패해도
  // OG 라우트가 500 반환하지 않도록 graceful — 폰트 없으면 system-ui fallback 렌더.
  const [font119, font118] = await Promise.all([
    fetch(NOTO_KR_119)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null),
    fetch(NOTO_KR_118)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #18181b 0%, #09090b 100%)",
          position: "relative",
          fontFamily: "'Noto Sans KR', system-ui, sans-serif",
        }}
      >
        {/* 핑크 글로우 우상단 */}
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 300,
            height: 300,
            background:
              "radial-gradient(circle, rgba(236,72,153,0.15), transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Top row: Zeriv 로고 + 태그 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#ec4899",
            }}
          >
            Zeriv
          </div>
          {tags.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {tags.map((tag) => (
                <div
                  key={tag}
                  style={{
                    fontSize: 14,
                    background: "rgba(236,72,153,0.15)",
                    border: "1px solid rgba(236,72,153,0.3)",
                    color: "#f9a8d4",
                    padding: "4px 12px",
                    borderRadius: 999,
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 구분선 */}
        <div
          style={{
            width: 48,
            height: 3,
            background: "linear-gradient(90deg, #ec4899, #f97316)",
            margin: "24px 0",
          }}
        />

        {/* 제목 */}
        <div
          style={{
            fontSize: title.length > 30 ? 52 : 64,
            fontWeight: 800,
            color: "#f4f4f5",
            lineHeight: 1.2,
            maxWidth: 900,
            flex: 1,
          }}
        >
          {title}
        </div>

        {/* 도메인 */}
        <div style={{ fontSize: 18, color: "#52525b" }}>zeriv.io</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        font119 && {
          name: "Noto Sans KR",
          data: font119,
          weight: 800 as const,
          style: "normal" as const,
        },
        font118 && {
          name: "Noto Sans KR",
          data: font118,
          weight: 800 as const,
          style: "normal" as const,
        },
      ].filter(Boolean) as {
        name: string;
        data: ArrayBuffer;
        weight: 800;
        style: "normal";
      }[],
    },
  );
}
