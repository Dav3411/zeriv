"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useBrand } from "@/components/BrandProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import type { Style, StyleType } from "@/lib/style/style.types";

// ── Types ─────────────────────────────────────────────────

type GeneratedImage = {
  id: string;
  url: string;
  kind: string;
  created_at: string;
};

// ── TypeBadge ─────────────────────────────────────────────

function TypeBadge({ type }: { type: StyleType }) {
  if (type === "custom") return null;
  const config: Record<
    StyleType,
    { label: string; bg: string; text: string; border: string }
  > = {
    custom: {
      label: "커스텀",
      bg: "bg-pink-500/20",
      text: "text-pink-400",
      border: "border border-pink-400/20",
    },
    brand_recommended: {
      label: "추천",
      bg: "bg-blue-500/20",
      text: "text-blue-400",
      border: "border border-blue-400/20",
    },
    preset: {
      label: "프리셋",
      bg: "bg-zinc-500/20",
      text: "text-zinc-400",
      border: "border border-zinc-400/20",
    },
    variant: {
      label: "변형",
      bg: "bg-purple-500/20",
      text: "text-purple-400",
      border: "border border-purple-400/20",
    },
    auto: {
      label: "Auto",
      bg: "bg-fuchsia-500/20",
      text: "text-fuchsia-400",
      border: "border border-fuchsia-400/20",
    },
  };
  const c = config[type] ?? config.custom;
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${c.bg} ${c.text} ${c.border}`}
    >
      {c.label}
    </span>
  );
}

// ── SectionLabel ──────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[11px] uppercase tracking-widest font-semibold block"
      style={{ color: "rgba(255,164,198,0.45)" }}
    >
      {children}
    </span>
  );
}

// ── ParamSection ──────────────────────────────────────────

function ParamSection({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <SectionLabel>{label}</SectionLabel>
      <p
        className="text-sm capitalize"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

// ── RenameModal ───────────────────────────────────────────

function RenameModal({
  currentName,
  onSave,
  onClose,
}: {
  currentName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-xl p-5 space-y-4"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
          스타일 이름 변경
        </h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: Summer Vibe"
          autoFocus
          className="w-full px-3 py-2.5 rounded-xl text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(255,164,198,0.4)";
            e.currentTarget.style.boxShadow =
              "0 0 0 3px rgba(255,164,198,0.06)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border-subtle)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSave(name.trim())}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-full text-sm font-bold text-black transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #ffa4c6, #ffe3be)" }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DeleteConfirmModal ────────────────────────────────────

function DeleteConfirmModal({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-xl p-5 space-y-4"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
          스타일 삭제
        </h3>
        <p className="text-xs text-[color:var(--text-secondary)]">
          <span className="text-[color:var(--text-primary)] font-medium">
            {name}
          </span>{" "}
          스타일을 삭제하시겠습니까?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
            style={{
              background: "rgba(239,68,68,0.05)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LightboxModal ─────────────────────────────────────────

function LightboxModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 flex items-center justify-center w-8 h-8 rounded-full text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
        style={{
          background: "var(--surface-3)",
          border: "1px solid var(--border-default)",
        }}
        aria-label="닫기"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M1 1l12 12M13 1L1 13" />
        </svg>
      </button>
      <img
        src={url}
        alt=""
        className="max-h-[90vh] max-w-[90vw] object-contain"
        style={{ border: "1px solid var(--border-subtle)" }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── VariantModal ──────────────────────────────────────────

function VariantModal({
  target,
  name,
  setName,
  instruction,
  setInstruction,
  loading,
  onClose,
  onSubmit,
}: {
  target: Style;
  name: string;
  setName: (v: string) => void;
  instruction: string;
  setInstruction: (v: string) => void;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl p-5 space-y-5"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
              배리언트 만들기
            </h3>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              <span className="text-[color:var(--text-primary)] font-medium">
                {target.name}
              </span>{" "}
              기반
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)] transition-colors"
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
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-1.5">
          <label
            className="text-[11px] uppercase tracking-widest font-semibold block"
            style={{ color: "rgba(255,164,198,0.45)" }}
          >
            이름 <span className="text-pink-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: Editorial Cold"
            autoFocus
            className="w-full px-3 py-2.5 rounded-xl text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,164,198,0.4)";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px rgba(255,164,198,0.06)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-subtle)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>

        <div className="space-y-1.5">
          <label
            className="text-[11px] uppercase tracking-widest font-semibold block"
            style={{ color: "rgba(255,164,198,0.45)" }}
          >
            변형 지시{" "}
            <span className="text-[color:var(--text-muted)] font-normal normal-case tracking-normal">
              — 선택
            </span>
          </label>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="더 차갑고 에디토리얼하게..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl text-sm text-[color:var(--text-primary)] outline-none resize-none placeholder:text-[color:var(--text-muted)]"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,164,198,0.4)";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px rgba(255,164,198,0.06)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-subtle)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <p className="text-[11px] text-[color:var(--text-muted)]">
            비워두면 현재 스타일을 그대로 복사합니다
          </p>
        </div>

        {loading && instruction.trim() && (
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
            style={{
              background: "rgba(255,164,198,0.05)",
              border: "1px solid rgba(255,164,198,0.15)",
            }}
          >
            <svg
              className="w-4 h-4 text-pink-400 animate-spin shrink-0"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-xs text-pink-300">
              AI가 변형 스타일을 생성하는 중...
            </span>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!name.trim() || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold text-black transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #ffa4c6, #ffe3be)" }}
          >
            {loading ? "생성 중..." : "만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────

export default function StyleDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const brandName = params.brandName as string;
  const styleId = params.styleId as string;
  const { brand, brandId, refresh: refreshBrand } = useBrand();
  const router = useRouter();
  const { fetchWithAuth } = useFetchWithAuth();

  const [style, setStyle] = useState<Style | null>(null);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(true);

  // 배리언트 모달 (?variant=true 쿼리로 자동 오픈)
  const [variantModalOpen, setVariantModalOpen] = useState(
    searchParams.get("variant") === "true",
  );
  const [variantName, setVariantName] = useState("");
  const [variantInstruction, setVariantInstruction] = useState("");
  const [variantLoading, setVariantLoading] = useState(false);

  // 케밥 메뉴
  const [kebabOpen, setKebabOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // 라이트박스
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // 데이터 로드
  useEffect(() => {
    if (!brandId || !styleId) return;

    // 스타일 로드
    fetchWithAuth(`/api/brands/${brandId}/styles/${styleId}`)
      .then((r) => r.json())
      .then((data: { style: Style }) => {
        setStyle(data.style);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // 이 스타일로 생성된 이미지
    fetchWithAuth(`/api/brands/${brandId}/styles/${styleId}/images`)
      .then((r) => r.json())
      .then((data: { images?: GeneratedImage[] }) => {
        setGeneratedImages(data.images ?? []);
        setImagesLoading(false);
      })
      .catch(() => setImagesLoading(false));
  }, [brandId, styleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 케밥 외부 클릭 닫기
  useEffect(() => {
    if (!kebabOpen) return;
    const handler = () => setKebabOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [kebabOpen]);

  // ── handleRename ─────────────────────────────────────────

  const handleRename = useCallback(
    async (name: string) => {
      if (!brandId || !style) return;
      const res = await fetchWithAuth(
        `/api/brands/${brandId}/styles/${style.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name || style.name }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { style: Style };
        setStyle(data.style);
      }
      setRenameOpen(false);
    },
    [brandId, fetchWithAuth, style],
  );

  // ── handleDelete ─────────────────────────────────────────

  const handleDelete = useCallback(async () => {
    if (!brandId || !style) return;
    await fetchWithAuth(`/api/brands/${brandId}/styles/${style.id}`, {
      method: "DELETE",
    });
    router.push(`/${brandName}/assets?tab=styles`);
  }, [brandId, brandName, fetchWithAuth, router, style]);

  // ── handleCreateVariant ──────────────────────────────────

  const handleCreateVariant = useCallback(async () => {
    if (!style || !variantName.trim() || !brandId) return;
    setVariantLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/brands/${brandId}/styles/${style.id}/variant`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: variantName.trim(),
            instruction: variantInstruction.trim() || undefined,
          }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { style: Style };
        // 스타일 시트 + 키 비주얼 생성 (실패해도 배리언트 자체는 유지)
        try {
          const sheetRes = await fetchWithAuth(
            `/api/brands/${brandId}/styles/${data.style.id}/style-sheet`,
            { method: "POST" },
          );
          if (!sheetRes.ok) {
            const errData = await sheetRes.json().catch(() => ({}));
            console.error(
              "[variant style-sheet] failed:",
              sheetRes.status,
              errData,
            );
          }
        } catch (e) {
          console.error("[variant style-sheet] network error:", e);
        }
        setVariantModalOpen(false);
        setVariantName("");
        setVariantInstruction("");
        router.push(`/${brandName}/styles/${data.style.id}`);
      }
    } finally {
      setVariantLoading(false);
    }
  }, [
    brandId,
    brandName,
    fetchWithAuth,
    router,
    style,
    variantInstruction,
    variantName,
  ]);

  // ── Loading / Not found ──────────────────────────────────

  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto space-y-8 animate-pulse">
        <div
          className="h-8 rounded-xl w-1/3"
          style={{ background: "var(--surface-2)" }}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div
            className="aspect-[4/3] rounded-2xl"
            style={{ background: "var(--surface-2)" }}
          />
          <div
            className="rounded-2xl h-80"
            style={{ background: "var(--surface-2)" }}
          />
        </div>
      </div>
    );
  }

  if (!style) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-[color:var(--text-secondary)] text-sm">
          스타일을 찾을 수 없습니다
        </p>
        <Link
          href={`/${brandName}/styles`}
          className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
        >
          ← 스타일 목록으로
        </Link>
      </div>
    );
  }

  // 예시 이미지 레이아웃
  const exImages = style.example_images ?? [];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-[color:var(--text-primary)] flex-1 min-w-0 truncate">
          {style.name}
        </h1>
        <TypeBadge type={style.type} />

        {/* 배리언트 만들기 버튼 */}
        <button
          type="button"
          onClick={() => {
            setVariantName(`${style.name} (변형)`);
            setVariantInstruction("");
            setVariantModalOpen(true);
          }}
          className="px-3 py-1.5 rounded-full text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          배리언트 만들기
        </button>

        {/* 케밥 메뉴 */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setKebabOpen((v) => !v);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {kebabOpen && (
            <div
              className="absolute right-0 top-10 z-10 w-40 rounded-xl py-1 shadow-xl"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {!style.is_template && (
                <button
                  type="button"
                  onClick={() => {
                    setKebabOpen(false);
                    setRenameOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[color:var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  이름 변경
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setKebabOpen(false);
                  setDeleteOpen(true);
                }}
                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-[var(--surface-2)] transition-colors"
              >
                {style.is_template ? "내 목록에서 제거" : "삭제"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 본문 2컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌: 예시 이미지 */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            border: "1px solid var(--border-subtle)",
          }}
        >
          {style.key_visual_url ? (
            <div className="aspect-square">
              <img
                src={style.key_visual_url}
                alt={style.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : exImages.length === 0 ? (
            (() => {
              const colors = Object.values(style.color_palette ?? {});
              return (
                <div
                  className="aspect-square w-full"
                  style={{
                    background: `linear-gradient(135deg, ${colors[0] ?? "#333"}, ${colors[1] ?? "#555"})`,
                    opacity: 0.5,
                  }}
                />
              );
            })()
          ) : exImages.length === 1 ? (
            <div className="aspect-square">
              <img
                src={exImages[0]}
                alt={style.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-0.5 p-0.5">
              {exImages.slice(0, 4).map((url, i) => (
                <div
                  key={i}
                  className="aspect-square overflow-hidden rounded-lg"
                >
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {/* 이미지 3장일 때 4번째 칸 폴백 */}
              {exImages.length === 3 &&
                (() => {
                  const colors = Object.values(style.color_palette ?? {});
                  return (
                    <div
                      className="aspect-square rounded-lg"
                      style={{
                        background: `linear-gradient(135deg, ${colors[0] ?? "#333"}, ${colors[1] ?? "#555"})`,
                        opacity: 0.4,
                      }}
                    />
                  );
                })()}
            </div>
          )}
        </div>

        {/* 우: 파라미터 패널 */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-5"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <ParamSection
            label="Lighting"
            value={[
              style.lighting?.contrast,
              style.lighting?.source,
              "lighting",
            ]
              .filter(Boolean)
              .join(" ")}
          />
          <ParamSection
            label="Texture"
            value={[
              style.texture?.finish,
              "finish",
              style.texture?.roughness != null
                ? `roughness ${style.texture.roughness}`
                : null,
            ]
              .filter(Boolean)
              .join(", ")}
          />
          {/* Color Palette */}
          <div className="space-y-1.5">
            <SectionLabel>Color Palette</SectionLabel>
            <div className="flex items-center gap-3 flex-wrap">
              {Object.entries(style.color_palette ?? {})
                .filter(([, hex]) => typeof hex === "string" && hex.length > 0)
                .map(([label, hex]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span
                      className="w-6 h-6 rounded-full border border-white/10 shrink-0"
                      style={{ background: hex }}
                      title={label}
                    />
                    <span
                      className="text-[11px] font-mono"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {hex}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Mood Keywords */}
          <div className="space-y-1.5">
            <SectionLabel>Mood Keywords</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {(style.mood_keywords ?? []).map((kw) => (
                <span
                  key={kw}
                  className="px-2.5 py-1 rounded-full text-xs"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>

          {/* Scene (있을 때만) */}
          {style.scene?.background && (
            <ParamSection
              label="Scene"
              value={[
                style.scene.setting,
                style.scene.background,
                style.scene.depth,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          )}

          {/* 이 스타일로 생성 버튼 */}
          <button
            type="button"
            onClick={() =>
              router.push(`/${brandName}/studio?styleId=${style.id}`)
            }
            className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-full font-bold text-black text-sm"
            style={{ background: "linear-gradient(135deg, #ffa4c6, #ffe3be)" }}
          >
            이 스타일로 생성
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3l1.8 4.8L18.6 9.6 13.8 11.4 12 16.2 10.2 11.4 5.4 9.6 10.2 7.8 12 3z" />
              <path d="M19 14l.9 2.4 2.4.9-2.4.9L19 20.6l-.9-2.4-2.4-.9 2.4-.9L19 14z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 하단: 이 스타일로 만든 이미지 */}
      <div className="space-y-4">
        <SectionLabel>이 스타일로 만든 이미지</SectionLabel>
        {imagesLoading ? (
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
              />
            ))}
          </div>
        ) : generatedImages.length > 0 ? (
          <div className="grid grid-cols-4 gap-1">
            {generatedImages.map((img) => (
              <div
                key={img.id}
                className="aspect-square overflow-hidden transition-all cursor-pointer"
                style={{ border: "1px solid var(--border-subtle)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-subtle)";
                }}
                onClick={() => setLightboxUrl(img.url)}
              >
                <img
                  src={img.url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : (
          <div
            className="rounded-xl py-10 flex items-center justify-center"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              아직 이 스타일로 생성된 이미지가 없습니다
            </span>
          </div>
        )}
      </div>

      {/* 모달들 */}
      {variantModalOpen && (
        <VariantModal
          target={style}
          name={variantName}
          setName={setVariantName}
          instruction={variantInstruction}
          setInstruction={setVariantInstruction}
          loading={variantLoading}
          onClose={() => {
            setVariantModalOpen(false);
            setVariantName("");
            setVariantInstruction("");
          }}
          onSubmit={handleCreateVariant}
        />
      )}
      {renameOpen && (
        <RenameModal
          currentName={style.name}
          onSave={handleRename}
          onClose={() => setRenameOpen(false)}
        />
      )}
      {deleteOpen && (
        <DeleteConfirmModal
          name={style.name}
          onConfirm={handleDelete}
          onClose={() => setDeleteOpen(false)}
        />
      )}
      {lightboxUrl && (
        <LightboxModal url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </div>
  );
}
