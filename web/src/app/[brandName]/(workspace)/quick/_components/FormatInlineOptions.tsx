"use client";

// 형식별 보조 옵션 (행 인라인).
//   - model: 여성/남성 토글
//   - cutout: 수량 입력 (1~30)
//   - mood / null: 렌더 없음
//
// 이벤트 stopPropagation: 행 클릭 시 onClickDetail 이 트리거되므로, 옵션 조작이
// 디테일 패널 열기로 이어지지 않도록 모든 입력에서 stopPropagation 한다.

import { useEffect, useState } from "react";
import type { QuickItem } from "./types";

interface Props {
  item: QuickItem;
  onChange: (patch: Partial<QuickItem>) => void;
  disabled?: boolean;
}

const MIN_COUNT = 1;
const MAX_COUNT = 30;

// cutout 형식의 수량 입력 UI를 별도 컴포넌트로 분리하여 hooks 규칙을 준수한다.
function CutoutCountInput({
  item,
  onChange,
  disabled,
}: {
  item: QuickItem;
  onChange: (patch: Partial<QuickItem>) => void;
  disabled?: boolean;
}) {
  // item.count가 null(혼합 상태)이면 빈 문자열로 초기화한다.
  const [raw, setRaw] = useState(item.count != null ? String(item.count) : "");

  useEffect(() => {
    setRaw(item.count != null ? String(item.count) : "");
  }, [item.count]);

  const commit = (val: string) => {
    const n = Math.min(
      MAX_COUNT,
      Math.max(MIN_COUNT, parseInt(val, 10) || MIN_COUNT),
    );
    setRaw(String(n));
    onChange({ count: n });
  };

  const btnBase =
    "min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-base transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled || item.count == null || item.count <= MIN_COUNT}
        onClick={(e) => {
          e.stopPropagation();
          if (item.count != null)
            onChange({ count: Math.max(MIN_COUNT, item.count - 1) });
        }}
        className={btnBase}
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-secondary)",
        }}
        aria-label="수량 줄이기"
      >
        ‹
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={raw}
        disabled={disabled}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(raw);
          }
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          (e.target as HTMLInputElement).select();
        }}
        className="text-sm tabular-nums text-center bg-transparent outline-none border-b disabled:opacity-50"
        style={{
          width: "clamp(24px, 2vw, 32px)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-primary)",
        }}
        aria-label="수량"
      />
      <button
        type="button"
        disabled={disabled || item.count == null || item.count >= MAX_COUNT}
        onClick={(e) => {
          e.stopPropagation();
          if (item.count != null)
            onChange({ count: Math.min(MAX_COUNT, item.count + 1) });
        }}
        className={btnBase}
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-secondary)",
        }}
        aria-label="수량 늘리기"
      >
        ›
      </button>
    </div>
  );
}

export default function FormatInlineOptions({
  item,
  onChange,
  disabled,
}: Props) {
  if (item.format === "model") {
    return (
      <div
        className="flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {(["female", "male"] as const).map((g) => {
          const isActive = item.gender === g;
          return (
            <button
              key={g}
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onChange({ gender: g });
              }}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isActive
                  ? "rgba(255,164,198,0.12)"
                  : "var(--surface-2)",
                borderColor: isActive
                  ? "rgba(255,164,198,0.5)"
                  : "var(--border-subtle)",
                color: isActive ? "#ffa4c6" : "var(--text-secondary)",
              }}
              aria-pressed={isActive}
            >
              {g === "female" ? "여성" : "남성"}
            </button>
          );
        })}
      </div>
    );
  }

  if (item.format === "cutout") {
    return (
      <CutoutCountInput item={item} onChange={onChange} disabled={disabled} />
    );
  }

  // mood 또는 null — 인라인 옵션 없음.
  return null;
}
