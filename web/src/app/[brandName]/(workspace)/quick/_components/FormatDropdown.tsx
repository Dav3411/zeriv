"use client";

// 한 행에서 형식(감성컷/모델컷/누끼컷)을 고르는 드롭다운.
// 디자인 토큰: var(--surface-2) 배경, var(--border-subtle) 테두리.
// 핑크 강조는 부모(ItemRow)에서 행 단위로 처리하므로 여기서는 중립 톤만 유지.
//
// 네이티브 <select> 사용 — 커스텀 드롭다운보다 접근성/모바일 입력 처리가 우수하고,
// 행이 많아져도 가상화 부담이 없다.
//
// 폰트 크기:
//   - 모바일(<768px)에서 select 의 font-size 가 16px 미만이면 iOS Safari 가 포커스 시
//     자동 zoom 한다. 모바일은 16px, 데스크톱은 14px 유지를 위해 text-base md:text-sm.
//
// disabledKeys:
//   - 부모가 특정 형식을 비활성화하고 싶을 때 사용.
//   - native disabled 상태로 처리 — 시각적으로 흐리게 표시됨. 별도 텍스트 안내 없음.

import type { FormatKey } from "./types";

interface Props {
  value: FormatKey | null;
  onChange: (f: FormatKey) => void;
  disabled?: boolean;
  /** 비활성 처리할 옵션 키. native disabled 상태로 처리되어 시각적으로 흐리게 표시됨. */
  disabledKeys?: FormatKey[];
}

const OPTIONS: { value: FormatKey; label: string }[] = [
  { value: "mood", label: "감성컷" },
  { value: "model", label: "모델컷" },
  { value: "cutout", label: "누끼컷" },
];

export default function FormatDropdown({
  value,
  onChange,
  disabled,
  disabledKeys = [],
}: Props) {
  const disabledSet = new Set(disabledKeys);

  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        if (disabledSet.has(v as FormatKey)) return;
        onChange(v as FormatKey);
      }}
      onClick={(e) => e.stopPropagation()}
      className="quick-format-select text-base md:text-sm rounded-lg px-2.5 py-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:border-pink-400/60 transition-colors"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
        color: "var(--text-primary)",
      }}
      aria-label="형식 선택"
    >
      {value === null && (
        <option value="" disabled>
          —
        </option>
      )}
      {OPTIONS.map((o) => {
        const isDisabled = disabledSet.has(o.value);
        return (
          <option key={o.value} value={o.value} disabled={isDisabled}>
            {o.label}
          </option>
        );
      })}
    </select>
  );
}
