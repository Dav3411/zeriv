"use client";

// 우측 상세 패널. 선택된 항목의 원본 이미지, 형식·옵션, 생성 상태/결과를
// 카드 섹션별로 표시한다. 항목이 선택되지 않은 경우 empty state를 표시한다.
//
// 형식/옵션은 ItemRow 와 동일한 컨트롤(FormatDropdown + FormatInlineOptions)을
// 사용해 데스크톱 우측 패널과 모바일 슬라이드업 시트 양쪽에서 변경 가능하다.
// 생성 중에는 disabled 로 잠가 진행 중 작업의 결과 매핑이 흔들리지 않게 한다.

import type { FormatKey, QuickItem } from "./types";
import FormatDropdown from "./FormatDropdown";
import FormatInlineOptions from "./FormatInlineOptions";

interface Props {
  item: QuickItem | null;
  onDownload: (item: QuickItem) => void;
  onUpdate: (id: string, patch: Partial<QuickItem>) => void;
  mode?: "workspace" | "guest";
}

const CARD: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  padding: "clamp(12px, 1.2vw, 18px)",
};

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-widest mb-3"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </p>
  );
}

export default function ItemDetailPanel({
  item,
  onDownload,
  onUpdate,
  mode = "workspace",
}: Props) {
  if (!item) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center flex-1 py-[clamp(32px,5dvh,64px)] px-4 min-h-full"
        style={{ color: "var(--text-muted)" }}
      >
        <div
          className="w-12 h-12 rounded-xl mb-3 flex items-center justify-center"
          style={{ background: "var(--surface-2)" }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          항목을 클릭하면
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          여기에 상세 정보가 표시됩니다
        </p>
      </div>
    );
  }

  // workspace only — 게스트 모드는 항상 idle이므로 아래 값을 참조하지 않는다.
  const resultUrl =
    item.format === item.resultFormat
      ? item.format === "cutout"
        ? item.cutoutResultUrl
        : item.resultUrl
      : null;

  return (
    <div className="space-y-3 px-4 pt-3 pb-4">
      {/* ── 원본 섹션 ── */}
      <div style={CARD}>
        <CardLabel>원본</CardLabel>
        <p
          className="text-xs font-medium truncate mb-3"
          style={{ color: "var(--text-secondary)" }}
          title={item.file.name}
        >
          {item.file.name}
        </p>
        <div
          className="rounded-lg overflow-hidden aspect-square w-full flex items-center justify-center"
          style={{ background: "var(--surface-1)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.previewUrl}
            alt="원본 이미지"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* ── 형식 / 옵션 섹션 ── */}
      <div style={CARD}>
        <CardLabel>형식 / 옵션</CardLabel>
        <div className="flex items-center gap-2 flex-wrap">
          <FormatDropdown
            value={item.format}
            onChange={(f: FormatKey) => onUpdate(item.id, { format: f })}
            disabled={item.status === "generating"}
          />
          <FormatInlineOptions
            item={item}
            onChange={(patch) => onUpdate(item.id, patch)}
            disabled={item.status === "generating"}
          />
        </div>
      </div>

      {/* ── 생성 상태 / 결과 섹션 ──
          게스트(mode === "guest")는 실제 생성이 불가능하므로 결과 카드 자체를 숨긴다.
          워크스페이스에서만 status 에 따라 generating/failed/succeeded 결과 표시. */}
      {mode !== "guest" &&
        (item.status === "generating" ||
          item.status === "failed" ||
          (item.status === "succeeded" && !!resultUrl)) && (
          <div style={CARD}>
            {item.status === "generating" && (
              <>
                <CardLabel>생성 중</CardLabel>
                <div
                  className="flex items-center gap-2"
                  style={{ color: "#ffa4c6" }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="animate-spin"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                  <span className="text-sm tabular-nums">{item.progress}%</span>
                </div>
                <div
                  className="mt-3 h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--surface-3)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(item.progress, 5)}%`,
                      background: "linear-gradient(90deg, #ffa4c6, #ffe3be)",
                    }}
                  />
                </div>
              </>
            )}

            {item.status === "failed" && (
              <>
                <CardLabel>생성 실패</CardLabel>
                <p className="text-sm" style={{ color: "#f87171" }}>
                  {item.error ?? "알 수 없는 오류가 발생했습니다."}
                </p>
              </>
            )}

            {item.status === "succeeded" && resultUrl && (
              <>
                <CardLabel>결과</CardLabel>
                <div
                  className="rounded-lg overflow-hidden aspect-square w-full"
                  style={{
                    background: "var(--surface-1)",
                    backgroundImage: `url(${resultUrl})`,
                    backgroundSize: "contain",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                  }}
                />
                <button
                  type="button"
                  onClick={() => onDownload(item)}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  개별 다운로드
                </button>
              </>
            )}
          </div>
        )}
    </div>
  );
}
