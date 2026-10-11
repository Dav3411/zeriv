"use client";

/**
 * SearchInput — 블로그 검색창.
 * 검색 아이콘 + 텍스트 입력 + clear 버튼.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "글 제목·내용 검색",
}: Props) {
  return (
    <div
      className="relative flex items-center flex-1 min-w-0"
      style={{ maxWidth: "360px" }}
    >
      {/* 검색 아이콘 */}
      <svg
        className="absolute left-3 w-4 h-4 text-zinc-400 pointer-events-none shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>

      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 text-sm rounded-xl outline-none transition-all"
        style={{
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.1)",
          color: "#18181b",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "rgba(236,72,153,0.4)";
          e.currentTarget.style.boxShadow =
            "0 0 0 3px rgba(236,72,153,0.08)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "rgba(0,0,0,0.1)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />

      {/* Clear 버튼 */}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2.5 text-zinc-400 hover:text-zinc-600 transition-colors"
          aria-label="검색어 지우기"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
