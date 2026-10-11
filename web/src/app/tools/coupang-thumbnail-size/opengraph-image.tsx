import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "쿠팡 썸네일 사이즈 자동 변환 — 10채널 무료 | Zeriv";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#09090b",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px 96px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* 배지 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "6px 16px",
            borderRadius: 999,
            background: "rgba(255,164,198,0.15)",
            border: "1px solid rgba(255,164,198,0.3)",
            marginBottom: 28,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "rgba(255,164,198,1)",
            }}
          >
            무료 셀러 도구
          </span>
        </div>

        {/* 제목 */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#f4f4f5",
            lineHeight: 1.2,
            marginBottom: 20,
            letterSpacing: "-0.02em",
          }}
        >
          쿠팡 썸네일
          <br />
          사이즈 자동 변환
        </div>

        {/* 서브 카피 */}
        <div
          style={{
            fontSize: 22,
            color: "#a1a1aa",
            marginBottom: 48,
          }}
        >
          800×800 · 스마트스토어 860 · SNS · 광고 — 10채널 무료
        </div>

        {/* 채널 태그들 */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["쿠팡 800×800", "스마트스토어 860", "올리브영 760", "인스타그램", "메타 광고", "유튜브"].map(
            (label) => (
              <div
                key={label}
                style={{
                  padding: "8px 16px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  fontSize: 15,
                  color: "#d4d4d8",
                }}
              >
                {label}
              </div>
            ),
          )}
        </div>

        {/* 워터마크 */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            right: 80,
            fontSize: 20,
            fontWeight: 700,
            color: "rgba(255,255,255,0.2)",
            letterSpacing: "-0.02em",
          }}
        >
          zeriv.io
        </div>
      </div>
    ),
    size,
  );
}
