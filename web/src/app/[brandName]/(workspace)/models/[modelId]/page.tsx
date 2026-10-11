"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useBrand } from "@/components/BrandProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";

// ── Types ──────────────────────────────────────────────────

type ModelDetail = {
  id: string;
  name: string;
  brand_id: string;
  face_image_url: string | null;
  face_sheet_url: string | null;
  selections: {
    gender?: string;
    age_group?: string;
    face_type?: string;
    hair_style?: string;
    style_vibe?: string;
    height_cm?: number;
    body_type?: string;
  };
  status: string;
  created_at: string;
};

type Render = {
  id: string;
  imageUrl: string;
  kind: string;
  createdAt: string;
  styleId: string | null;
  styleName: string | null;
  influencerId?: string | null;
};

// ── Constants ─────────────────────────────────────────────

const FACE_EMOJI: Record<string, string> = {
  dog: "🐶",
  cat: "🐱",
  fox: "🦊",
  rabbit: "🐰",
  deer: "🦌",
  snake: "🐍",
  hamster: "🐹",
};

const GENDER_LABEL: Record<string, string> = { female: "여성", male: "남성" };
const BODY_TYPE_LABEL: Record<string, string> = {
  slim: "슬림",
  average: "보통",
  athletic: "운동형",
  curvy: "볼륨",
};
const AGE_GROUP_LABEL: Record<string, string> = {
  early_20s: "20대 초반",
  late_20s: "20대 후반",
  early_30s: "30대 초반",
  late_30s: "30대 후반",
  early_40s: "40대 초반",
  late_40s: "40대 후반",
};

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
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          모델 이름 변경
        </h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 봄봄이"
          autoFocus
          className="w-full px-3 py-2.5 rounded-xl text-sm outline-none placeholder:text-[color:var(--text-muted)]"
          style={{
            color: "var(--text-primary)",
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
            className="px-4 py-2 rounded-xl text-sm transition-colors"
            style={{
              color: "var(--text-secondary)",
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
  deleting,
  onConfirm,
  onClose,
}: {
  name: string;
  deleting: boolean;
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
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          모델 삭제
        </h3>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          <span
            className="font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {name}
          </span>
          을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm transition-colors"
            style={{
              color: "var(--text-secondary)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
            style={{
              background: "rgba(239,68,68,0.05)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            {deleting ? "삭제 중…" : "삭제"}
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
        className="absolute top-4 right-4 flex items-center justify-center w-8 h-8 rounded-full transition-colors"
        style={{
          color: "var(--text-secondary)",
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

// ── Page ───────────────────────────────────────────────────

export default function ModelDetailPage() {
  const params = useParams();
  const brandName = params.brandName as string;
  const modelId = typeof params.modelId === "string" ? params.modelId : "";
  const { brandId } = useBrand();
  const { fetchWithAuth } = useFetchWithAuth();
  const router = useRouter();

  const [model, setModel] = useState<ModelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [renders, setRenders] = useState<Render[]>([]);
  const [rendersLoading, setRendersLoading] = useState(true);

  // 케밥 메뉴
  const [kebabOpen, setKebabOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 라이트박스
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // 데이터 로드
  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetchWithAuth(`/api/personas/${modelId}`);
        if (!res.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) setModel(data.model ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [modelId, fetchWithAuth]);

  // 렌더 목록 로드
  useEffect(() => {
    if (!brandId) return;
    fetchWithAuth(`/api/renders?brandId=${brandId}&personaId=${modelId}`)
      .then((r) => r.json())
      .then((data: { renders?: Render[] }) => {
        setRenders(data.renders ?? []);
        setRendersLoading(false);
      })
      .catch(() => setRendersLoading(false));
  }, [brandId, modelId, fetchWithAuth]);

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
      if (!model) return;
      const res = await fetchWithAuth(`/api/personas/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setModel((prev) => (prev ? { ...prev, name } : prev));
      }
      setRenameOpen(false);
    },
    [fetchWithAuth, model],
  );

  // ── handleRemove ─────────────────────────────────────────

  const handleRemove = useCallback(async () => {
    if (!model) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/personas/${model.id}`, {
        method: "DELETE",
      });
      if (res.ok) router.push(`/${brandName}/assets?tab=models`);
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }, [brandName, model, fetchWithAuth, router]);

  // ── Loading ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto space-y-8 animate-pulse">
        <div
          className="h-8 rounded-xl w-1/3"
          style={{ background: "var(--surface-2)" }}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div
            className="aspect-[3/4] rounded-2xl"
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

  // ── Not found ─────────────────────────────────────────────

  if (notFound || !model) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          모델을 찾을 수 없습니다
        </p>
        <Link
          href={`/${brandName}/models`}
          className="text-sm transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          ← 모델 목록으로
        </Link>
      </div>
    );
  }

  const sel = model.selections ?? {};
  const imgUrl = model.face_image_url ?? model.face_sheet_url;
  const modelName = model.name ?? model.id.slice(0, 8);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      {/* 헤더 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href={`/${brandName}/assets?tab=models`}
          className="flex items-center gap-1 text-sm transition-colors shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          모델
        </Link>
        <span style={{ color: "var(--text-muted)" }}>/</span>
        <h1
          className="text-2xl font-bold flex-1 min-w-0"
          style={{ color: "var(--text-primary)" }}
        >
          {modelName}
        </h1>

        {/* 케밥 메뉴 */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setKebabOpen((v) => !v);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{
              color: "var(--text-muted)",
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
              <button
                type="button"
                onClick={() => {
                  setKebabOpen(false);
                  setRenameOpen(true);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface-2)] transition-colors"
                style={{ color: "var(--text-primary)" }}
              >
                이름 변경
              </button>
              <button
                type="button"
                onClick={() => {
                  setKebabOpen(false);
                  setDeleteOpen(true);
                }}
                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-[var(--surface-2)] transition-colors"
              >
                모델 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 본문 2컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌: 모델 이미지 */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid var(--border-subtle)" }}
        >
          {imgUrl ? (
            <div className="aspect-[3/4]">
              <img
                src={imgUrl}
                alt={modelName}
                className="w-full h-full object-cover object-top"
              />
            </div>
          ) : (
            <div
              className="aspect-[3/4] flex items-center justify-center text-8xl"
              style={{ background: "var(--surface-2)" }}
            >
              {FACE_EMOJI[sel.face_type ?? ""] ?? "🧬"}
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
            label="성별"
            value={GENDER_LABEL[sel.gender ?? ""] ?? "-"}
          />
          <ParamSection
            label="나이대"
            value={AGE_GROUP_LABEL[sel.age_group ?? ""] ?? "-"}
          />
          <ParamSection
            label="얼굴형"
            value={
              sel.face_type
                ? `${FACE_EMOJI[sel.face_type] ?? ""} ${sel.face_type}`
                : "-"
            }
          />
          <ParamSection
            label="헤어스타일"
            value={sel.hair_style?.replace(/_/g, " ") ?? "-"}
          />
          {sel.height_cm && (
            <ParamSection label="키" value={`${sel.height_cm}cm`} />
          )}
          <ParamSection
            label="체형"
            value={BODY_TYPE_LABEL[sel.body_type ?? ""] ?? "-"}
          />
          {sel.style_vibe && (
            <ParamSection
              label="스타일 바이브"
              value={sel.style_vibe.replace(/_/g, " ")}
            />
          )}

          {/* CTA 버튼 */}
          <button
            type="button"
            onClick={() =>
              router.push(`/${brandName}/studio?modelId=${model.id}`)
            }
            className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-full font-bold text-black text-sm"
            style={{ background: "linear-gradient(135deg, #ffa4c6, #ffe3be)" }}
          >
            이 모델로 생성
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

      {/* 하단: 이 모델로 만든 이미지 */}
      <div className="space-y-4">
        <SectionLabel>모델 갤러리</SectionLabel>
        {rendersLoading ? (
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
        ) : renders.length > 0 ? (
          <div className="grid grid-cols-4 gap-1">
            {renders.map((render) => (
              <div
                key={render.id}
                className="aspect-square overflow-hidden transition-all cursor-pointer"
                style={{ border: "1px solid var(--border-subtle)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-subtle)";
                }}
                onClick={() => setLightboxUrl(render.imageUrl)}
              >
                <img
                  src={render.imageUrl}
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
              아직 생성된 이미지가 없습니다
            </span>
          </div>
        )}
      </div>

      {/* 모달들 */}
      {renameOpen && model && (
        <RenameModal
          currentName={model.name}
          onSave={handleRename}
          onClose={() => setRenameOpen(false)}
        />
      )}
      {deleteOpen && (
        <DeleteConfirmModal
          name={modelName}
          deleting={deleting}
          onConfirm={handleRemove}
          onClose={() => setDeleteOpen(false)}
        />
      )}
      {lightboxUrl && (
        <LightboxModal url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </div>
  );
}
