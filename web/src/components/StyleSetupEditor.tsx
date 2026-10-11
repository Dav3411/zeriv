"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { StyleHintsEditor, type StyleHints } from "@/components/StyleHintsEditor";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SetupMode = "references" | "prompt" | "keywords";

export interface StyleSetupValue {
  setupMode: SetupMode;
  referenceImages: string[];
  stylePrompt: string;
  hints: StyleHints;
}

// ── Reference image uploader ──────────────────────────────────────────────────

function ReferenceImageUploader({
  brandId,
  images,
  onChange,
}: {
  brandId: string;
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const { fetchWithAuth } = useFetchWithAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async (files: FileList) => {
    setError("");
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetchWithAuth(`/api/brands/${brandId}/upload`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError((d as { error?: string }).error ?? "업로드 실패");
          continue;
        }
        const { imageUrl } = (await res.json()) as { imageUrl: string };
        newUrls.push(imageUrl);
      }
      if (newUrls.length > 0) onChange([...images, ...newUrls]);
    } finally {
      setUploading(false);
    }
  };

  const remove = (url: string) => onChange(images.filter((u) => u !== url));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <div key={url} className="relative group w-20 h-20 rounded-xl overflow-hidden border border-[var(--border-subtle,rgba(255,255,255,0.06))] bg-zinc-900 flex-shrink-0">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(url)}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-lg"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          uploading
            ? "border-pink-400/30 bg-pink-500/5"
            : "border-zinc-800 hover:border-zinc-600 hover:bg-white/[0.02]"
        }`}
      >
        {uploading ? (
          <>
            <svg className="animate-spin w-5 h-5 text-pink-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-xs text-zinc-500">업로드 중…</span>
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-zinc-600">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            <p className="text-xs text-zinc-500 text-center">
              이미지를 끌어다 놓거나 <span className="text-pink-400 underline">클릭해서 선택</span>
            </p>
            <p className="text-[10px] text-zinc-700">JPG, PNG, WEBP · 최대 10 MB</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) upload(e.target.files); }}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}
      {images.length > 0 && (
        <p className="text-[11px] text-zinc-600">
          {images.length}장 업로드됨 · 이미지를 클릭하면 제거됩니다
        </p>
      )}
    </div>
  );
}

// ── StyleSetupEditor ──────────────────────────────────────────────────────────

export function StyleSetupEditor({
  brandId,
  value,
  onChange,
}: {
  brandId: string;
  value: StyleSetupValue;
  onChange: (v: StyleSetupValue) => void;
}) {
  const [keywordsOpen, setKeywordsOpen] = useState(
    value.hints.positive.length > 0 || value.hints.negative.length > 0
  );

  const setMode = (mode: SetupMode) => onChange({ ...value, setupMode: mode });

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-zinc-900 w-fit">
        {([
          { value: "references" as SetupMode, label: "레퍼런스 이미지", icon: "🖼" },
          { value: "prompt"     as SetupMode, label: "프롬프트",       icon: "✏️" },
        ] as const).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              value.setupMode === opt.value
                ? "bg-[var(--surface-2,#16161d)] text-white shadow"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span>{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Reference images */}
      {value.setupMode === "references" && (
        <ReferenceImageUploader
          brandId={brandId}
          images={value.referenceImages}
          onChange={(referenceImages) => onChange({ ...value, referenceImages })}
        />
      )}

      {/* Prompt */}
      {value.setupMode === "prompt" && (
        <div>
          <textarea
            value={value.stylePrompt}
            onChange={(e) => onChange({ ...value, stylePrompt: e.target.value })}
            rows={5}
            placeholder="원하는 스타일을 자유롭게 설명하세요.&#10;예: 자연광이 스며드는 미니멀한 뷰티 화보. 밝고 청량한 톤, 흰 배경에 제품이 중심."
            className="w-full px-3 py-2.5 rounded-lg bg-[var(--surface-1,#111118)] border border-[var(--border-default,rgba(255,255,255,0.1))] text-sm text-zinc-200 placeholder-zinc-600 focus:border-pink-400/50 focus:outline-none resize-none leading-relaxed"
          />
          <p className="mt-1.5 text-[11px] text-zinc-600">
            구체적으로 쓸수록 원하는 이미지에 가까워집니다
          </p>
        </div>
      )}

      {/* Supplementary keywords (always available, collapsible) */}
      <div className="border border-[var(--border-subtle,rgba(255,255,255,0.06))] rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setKeywordsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-400">키워드 힌트</span>
            {(value.hints.positive.length > 0 || value.hints.negative.length > 0) && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-pink-500/20 text-pink-300">
                {value.hints.positive.length + value.hints.negative.length}
              </span>
            )}
            <span className="text-[10px] text-zinc-600">보조적으로 적용됩니다</span>
          </div>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round"
            className={`text-zinc-600 transition-transform ${keywordsOpen ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {keywordsOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-[var(--border-subtle,rgba(255,255,255,0.06))]">
            <StyleHintsEditor
              value={value.hints}
              onChange={(hints) => onChange({ ...value, hints })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
