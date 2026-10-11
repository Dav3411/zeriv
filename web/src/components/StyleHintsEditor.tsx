"use client";

import { useRef, useState } from "react";

// ── Presets ───────────────────────────────────────────────────────────────────

const POSITIVE_PRESETS = [
  "미니멀", "클린한", "고급스러운", "자연광", "에디토리얼",
  "밝은", "부드러운", "선명한", "모던한", "내추럴",
  "파스텔", "심플한", "무드있는", "트렌디한", "비비드",
];

const NEGATIVE_PRESETS = [
  "어두운", "흐릿한", "복잡한", "낮은 화질", "과포화",
  "노이즈", "인위적인", "올드한", "클리셰", "워터마크",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StyleHints {
  positive: string[];
  negative: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert existing generation_hints fields → StyleHints */
export function hintsToStyle(hints: {
  promptPrefix?: string;
  promptSuffix?: string;
  negativePromptAddons?: string[];
} | null | undefined): StyleHints {
  const positive = [
    ...(hints?.promptPrefix ? hints.promptPrefix.split(",").map((s) => s.trim()).filter(Boolean) : []),
    ...(hints?.promptSuffix ? hints.promptSuffix.split(",").map((s) => s.trim()).filter(Boolean) : []),
  ];
  const negative = hints?.negativePromptAddons ?? [];
  return { positive, negative };
}

/** Convert StyleHints → generation_hints payload */
export function styleToHints(style: StyleHints) {
  return {
    promptPrefix: style.positive.join(", ") || undefined,
    promptSuffix: undefined,
    negativePromptAddons: style.negative.length > 0 ? style.negative : undefined,
  };
}

/** Convert existing brand.meta.defaultHints → StyleHints */
export function metaHintsToStyle(raw: Record<string, unknown> | null | undefined): StyleHints {
  if (!raw) return { positive: [], negative: [] };
  const positiveStr = (raw.prefix as string | undefined) ?? "";
  const negativeStr = (raw.negative as string | undefined) ?? "";
  // Support old string format and new array format
  const positive = Array.isArray(raw.positive)
    ? (raw.positive as string[])
    : positiveStr.split(",").map((s) => s.trim()).filter(Boolean);
  const negative = Array.isArray(raw.negative)
    ? (raw.negative as string[])
    : negativeStr.split(",").map((s) => s.trim()).filter(Boolean);
  return { positive, negative };
}

// ── Tag chip input ────────────────────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
  placeholder,
  variant,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  variant: "positive" | "negative";
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const chipCls =
    variant === "positive"
      ? "bg-pink-500/20 text-pink-200 border border-pink-500/30 hover:border-pink-400/60"
      : "bg-red-900/30 text-red-300 border border-red-900/50 hover:border-red-700/60";

  return (
    <div
      className="flex flex-wrap gap-1.5 min-h-[44px] px-3 py-2 rounded-lg bg-[var(--surface-1,#111118)] border border-[var(--border-default,rgba(255,255,255,0.1))] cursor-text focus-within:border-pink-400/40 transition-colors"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${chipCls}`}
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(tag);
            }}
            className="opacity-50 hover:opacity-100 transition-opacity text-sm leading-none ml-0.5"
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => {
          if (input.trim()) {
            add(input);
            setInput("");
          }
        }}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[100px] bg-transparent text-sm text-zinc-300 placeholder:text-zinc-600 outline-none"
      />
    </div>
  );
}

// ── StyleHintsEditor ──────────────────────────────────────────────────────────

export function StyleHintsEditor({
  value,
  onChange,
}: {
  value: StyleHints;
  onChange: (v: StyleHints) => void;
}) {
  const togglePreset = (tag: string, kind: "positive" | "negative") => {
    const list = value[kind];
    const next = list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag];
    onChange({ ...value, [kind]: next });
  };

  return (
    <div className="space-y-5">
      {/* ── Positive ── */}
      <div className="space-y-2.5">
        <div>
          <p className="text-xs font-semibold text-white">이런 스타일로</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">원하는 느낌을 선택하거나 직접 입력하세요</p>
        </div>

        {/* Preset chips */}
        <div className="flex flex-wrap gap-1.5">
          {POSITIVE_PRESETS.map((p) => {
            const active = value.positive.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePreset(p, "positive")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  active
                    ? "bg-pink-500/25 text-pink-200 border border-pink-400/50"
                    : "bg-transparent text-zinc-500 border border-zinc-800 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {active ? "✓ " : "+ "}{p}
              </button>
            );
          })}
        </div>

        {/* Tag input */}
        <TagInput
          tags={value.positive}
          onChange={(positive) => onChange({ ...value, positive })}
          placeholder="직접 입력 후 Enter — e.g. 필름 grain, 청량한"
          variant="positive"
        />
      </div>

      {/* ── Negative ── */}
      <div className="space-y-2.5">
        <div>
          <p className="text-xs font-semibold text-white">이런 건 빼줘</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">생성에서 제외할 요소를 선택하세요</p>
        </div>

        {/* Preset chips */}
        <div className="flex flex-wrap gap-1.5">
          {NEGATIVE_PRESETS.map((p) => {
            const active = value.negative.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePreset(p, "negative")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  active
                    ? "bg-red-900/40 text-red-300 border border-red-800/50"
                    : "bg-transparent text-zinc-500 border border-zinc-800 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {active ? "✓ " : "− "}{p}
              </button>
            );
          })}
        </div>

        {/* Tag input */}
        <TagInput
          tags={value.negative}
          onChange={(negative) => onChange({ ...value, negative })}
          placeholder="직접 입력 후 Enter — e.g. 그림자 강함, 비비드"
          variant="negative"
        />
      </div>
    </div>
  );
}
