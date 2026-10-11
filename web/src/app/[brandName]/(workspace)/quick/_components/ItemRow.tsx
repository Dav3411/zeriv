"use client";

// 목록의 한 행. 좌측부터: 체크박스 / 썸네일 / 파일명 / 형식 드롭다운 /
// 인라인 옵션 / 상태 / 삭제.
//
// 인터랙션 규칙:
//  - succeeded 상태에서 행을 클릭하면 onClickDetail 호출 (디테일 패널 표시).
//  - 그 외 상태(idle/generating/failed)에서 행 클릭은 무시 — 부분 인터랙션 영역
//    (체크박스/드롭다운/옵션/삭제) 만 자체 핸들러를 가진다.
//  - generating 중에는 드롭다운/옵션을 비활성화해 사용자가 입력을 바꿔도 진행
//    중인 작업의 결과 매핑이 흔들리지 않게 한다.
//
// 레이아웃 분기:
//  - 모바일(<md): 2-line 카드형 (1행: 체크박스+썸네일+파일명+상태, 2행: 형식+옵션+삭제)
//  - 데스크톱(md+): 기존 1-line flex-wrap 행 유지

import type { FormatKey, QuickItem } from "./types";
import FormatDropdown from "./FormatDropdown";
import FormatInlineOptions from "./FormatInlineOptions";

interface Props {
  item: QuickItem;
  isSelected: boolean;
  isDetailActive: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<QuickItem>) => void;
  onClickDetail: (id: string) => void;
}

function StatusIcon({ item }: { item: QuickItem }) {
  if (item.status === "generating") {
    return (
      <div
        className="flex items-center gap-1.5 text-xs"
        style={{ color: "var(--quick-spinner, #ffa4c6)" }}
      >
        <svg
          width="14"
          height="14"
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
        <span className="tabular-nums">{item.progress}%</span>
      </div>
    );
  }
  if (item.status === "succeeded" && item.format === item.resultFormat) {
    return (
      <div
        className="w-7 h-7 md:w-6 md:h-6 rounded-full flex items-center justify-center"
        style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}
        aria-label="완료"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (item.status === "failed") {
    return (
      <div
        className="w-7 h-7 md:w-6 md:h-6 rounded-full flex items-center justify-center"
        style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}
        title={item.error ?? "실패"}
        aria-label={item.error ?? "실패"}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    );
  }
  return <div className="w-7 h-7 md:w-6 md:h-6" aria-hidden="true" />;
}

export default function ItemRow({
  item,
  isSelected,
  isDetailActive,
  onToggleSelect,
  onRemove,
  onUpdate,
  onClickDetail,
}: Props) {
  const isBusy = item.status === "generating";

  const handleRowClick = () => {
    onClickDetail(item.id);
  };

  const trashIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClickDetail(item.id);
        }
      }}
      className="relative transition-colors cursor-pointer
        flex flex-col gap-2 px-3 pt-3 pb-2 mx-3 my-1.5 rounded-xl border
        md:flex md:flex-row md:flex-wrap md:items-center md:gap-3
        md:px-4 md:py-2 md:mx-0 md:my-0 md:rounded-none
        md:border-t-0 md:border-l-0 md:border-r-0 md:border-b
        hover:bg-white/[0.02]"
      style={{
        // 다크/라이트 양쪽에서 자연스럽게 보이도록 --accent-subtle/overlay 토큰 사용.
        // 라이트(guest-light)에서는 rgba(224,122,154,0.10)/#FCE6EC 로 자동 전환.
        background: isDetailActive
          ? "var(--accent-overlay, rgba(255,164,198,0.08))"
          : isSelected
            ? "var(--accent-subtle, rgba(255,164,198,0.04))"
            : "var(--surface-1)",
        borderColor: isDetailActive
          ? "var(--accent, rgba(255,164,198,0.5))"
          : isSelected
            ? "var(--border-accent, rgba(255,164,198,0.3))"
            : "var(--border-subtle, rgba(255,255,255,0.08))",
        // 모바일에서 isDetailActive 시 border-left accent — specificity 충돌 없이 inline style 로 직접 제어.
        // 데스크톱(md+)에서는 md:border-l-0 클래스로 left border 자체가 제거되므로 자연 무효화.
        ...(isDetailActive && {
          borderLeftColor: "var(--accent, #ffa4c6)",
          borderLeftWidth: 2,
        }),
      }}
    >
      {/* 데스크톱 전용 좌측 액센트 바 (absolute) */}
      {isDetailActive && (
        <div
          className="hidden md:block absolute left-0 top-0 bottom-0 w-0.5"
          style={{ background: "var(--accent, #ffa4c6)" }}
        />
      )}

      {/* 1행 (모바일) / 단일행 일부 (데스크톱): 체크박스 + 썸네일 + 파일명 + 상태 */}
      <div className="flex items-center gap-2 md:contents">
        {/* 체크박스 — label 래퍼로 클릭 타깃 확장 (시각 영향 최소화 위해 -m-2). */}
        {/* 음수 마진(-m-2)으로 클릭 타깃 44×44 확보하면서도 좌측 gap-2와 상쇄해 시각 영향 0. */}
        <label
          onClick={(e) => e.stopPropagation()}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center -m-2 cursor-pointer shrink-0"
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(item.id)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 shrink-0 cursor-pointer accent-pink-400"
            aria-label={`${item.file.name} 선택`}
          />
        </label>

        {/* 썸네일: 모바일 48×48, 데스크톱 32×32 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.previewUrl}
          alt=""
          className="w-12 h-12 md:w-8 md:h-8 object-cover rounded-lg md:rounded-md shrink-0"
          style={{ background: "var(--surface-2)" }}
        />

        {/* 파일명 — quick-filename: container query (max-width: 480px) 에서 max-width 120px */}
        <div className="quick-filename flex-1 min-w-0">
          <p
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
            title={item.file.name}
          >
            {item.file.name}
          </p>
          {item.status === "failed" && item.error && (
            <p
              className="truncate"
              style={{ color: "#f87171", fontSize: "var(--quick-text-sub)" }}
              title={item.error}
            >
              {item.error}
            </p>
          )}
        </div>

        {/* 상태 아이콘 */}
        <StatusIcon item={item} />
      </div>

      {/* 2행 (모바일) / 단일행 나머지 (데스크톱): 형식 드롭다운 + 인라인 옵션 + 삭제 */}
      <div className="flex items-center gap-2 md:contents">
        <FormatDropdown
          value={item.format}
          onChange={(f: FormatKey) => onUpdate(item.id, { format: f })}
          disabled={isBusy}
        />
        <FormatInlineOptions
          item={item}
          onChange={(patch) => onUpdate(item.id, patch)}
          disabled={isBusy}
        />

        {/* 삭제 버튼: 모바일 44×44 터치 영역, 데스크톱 28×28 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          disabled={isBusy}
          aria-label="삭제"
          className="ml-auto flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0
            min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-7 md:h-7"
        >
          {trashIcon}
        </button>
      </div>
    </div>
  );
}
