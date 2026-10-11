"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useBrand } from "@/components/BrandProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import type {
  BrandProductRow,
  ProductImage,
} from "@/lib/brandProduct/brandProduct.types";

// ── Types ─────────────────────────────────────────────────────────────────────

type Render = {
  id: string;
  imageUrl: string;
  kind: string;
  createdAt: string;
  styleId: string | null;
  styleName: string | null;
  productId?: string | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  skincare: "스킨케어",
  makeup: "메이크업",
  haircare: "헤어케어",
  fragrance: "프래그런스",
  bodycare: "바디케어",
  supplement: "서플리먼트",
  food_beverage: "식품·음료",
  fashion: "패션",
  accessory: "액세서리",
  electronics: "전자기기",
  home: "홈·리빙",
  other: "기타",
};

const CATEGORY_ICON: Record<string, string> = {
  skincare: "🧴",
  makeup: "💄",
  haircare: "🧖",
  fragrance: "✨",
  bodycare: "🫧",
  supplement: "💊",
  food_beverage: "🍵",
  fashion: "👗",
  accessory: "💍",
  electronics: "📱",
  home: "🏠",
  other: "📦",
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([v, l]) => ({
  value: v,
  label: l,
}));

// ── SectionLabel ──────────────────────────────────────────────────────────────

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

// ── ProductEditModal ──────────────────────────────────────────────────────────

function ProductEditModal({
  initialCategory,
  initialDesc,
  saving,
  onSave,
  onClose,
}: {
  initialCategory: string;
  initialDesc: string;
  saving: boolean;
  onSave: (category: string, desc: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [desc, setDesc] = useState(initialDesc);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 space-y-5"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
            제품 정보 편집
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] transition-colors"
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

        {/* 카테고리 */}
        <div>
          <span
            className="text-[11px] uppercase tracking-widest font-semibold block mb-2"
            style={{ color: "rgba(255,164,198,0.45)" }}
          >
            카테고리
          </span>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                style={
                  category === value
                    ? {
                        background: "rgba(255,164,198,0.15)",
                        borderColor: "#ffa4c6",
                        color: "#ffa4c6",
                      }
                    : {
                        background: "var(--surface-2)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }
                }
              >
                {CATEGORY_ICON[value] ?? ""} {label}
              </button>
            ))}
          </div>
        </div>

        {/* 설명 */}
        <div>
          <span
            className="text-[11px] uppercase tracking-widest font-semibold block mb-2"
            style={{ color: "rgba(255,164,198,0.45)" }}
          >
            설명
          </span>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            placeholder="제품에 대한 간단한 설명..."
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
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
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
            onClick={() => onSave(category, desc)}
            disabled={saving}
            className="px-4 py-2 rounded-full text-sm font-bold text-black transition-all active:scale-95 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #ffa4c6, #ffe3be)" }}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RenameModal ───────────────────────────────────────────────────────────────

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
          제품 이름 변경
        </h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="제품 이름을 입력하세요"
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

// ── ArchiveConfirmModal ───────────────────────────────────────────────────────

function ArchiveConfirmModal({
  name,
  archiving,
  onConfirm,
  onClose,
}: {
  name: string;
  archiving: boolean;
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
          제품 보관
        </h3>
        <p className="text-xs text-[color:var(--text-secondary)]">
          <span className="text-[color:var(--text-primary)] font-medium">
            {name}
          </span>
          을(를) 보관하시겠습니까? 목록에서 숨겨지지만 데이터는 유지됩니다.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={archiving}
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
            disabled={archiving}
            className="px-4 py-2 rounded-xl text-sm font-bold text-orange-400 transition-all active:scale-95 disabled:opacity-40"
            style={{
              background: "rgba(234,88,12,0.05)",
              border: "1px solid rgba(234,88,12,0.2)",
            }}
          >
            {archiving ? "처리 중..." : "보관"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LightboxModal ─────────────────────────────────────────────────────────────

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

// ── ImageGalleryModal ────────────────────────────────────────────────────────

function ImageGalleryModal({
  images,
  uploading,
  deleting,
  onClose,
  onUploadClick,
  onDelete,
  onSetRepresentative,
}: {
  images: ProductImage[];
  uploading: boolean;
  deleting: string | null;
  onClose: () => void;
  onUploadClick: () => void;
  onDelete: (img: ProductImage) => void;
  onSetRepresentative: (img: ProductImage) => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full mx-4 rounded-2xl flex flex-col"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
            제품 이미지
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-full text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
            style={{
              background: "var(--surface-3)",
              border: "1px solid var(--border-default)",
            }}
            aria-label="닫기"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        {/* 이미지 그리드 */}
        <div className="overflow-y-auto flex-1 p-5">
          <div className="grid grid-cols-3 gap-3">
            {images.map((img, i) => (
              <div
                key={img.r2_key}
                className="relative aspect-square rounded-xl overflow-hidden group"
                style={{ border: "1px solid var(--border-subtle)" }}
              >
                <img
                  src={img.url}
                  alt={`제품 이미지 ${i + 1}`}
                  className="w-full h-full object-cover"
                />

                {/* 삭제 중 오버레이 */}
                {deleting === img.r2_key && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <span className="text-[11px] text-white">삭제 중...</span>
                  </div>
                )}

                {/* hover 오버레이 */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* 우상단: 삭제 버튼 */}
                <button
                  type="button"
                  onClick={() => onDelete(img)}
                  disabled={deleting === img.r2_key}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  style={{
                    background: "rgba(239,68,68,0.85)",
                  }}
                  aria-label="삭제"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M1 1l12 12M13 1L1 13" />
                  </svg>
                </button>

                {/* 좌하단: 대표 뱃지 또는 대표로 설정 버튼 */}
                {i === 0 ? (
                  <span
                    className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background: "rgba(255,164,198,0.2)",
                      border: "1px solid rgba(255,164,198,0.3)",
                      color: "#ffa4c6",
                    }}
                  >
                    대표
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetRepresentative(img)}
                    className="absolute bottom-1.5 left-1.5 px-2 py-1 rounded-lg text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      background: "rgba(0,0,0,0.6)",
                      backdropFilter: "blur(4px)",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    대표로 설정
                  </button>
                )}
              </div>
            ))}

            {/* 이미지 추가 셀 */}
            <button
              type="button"
              onClick={onUploadClick}
              disabled={uploading}
              className="aspect-square rounded-xl flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50"
              style={{
                border: "2px dashed var(--border-default)",
                background: "var(--surface-2)",
              }}
            >
              {uploading ? (
                <span className="text-[11px] text-[color:var(--text-secondary)]">
                  업로드 중...
                </span>
              ) : (
                <>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-muted)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="text-[11px] text-[color:var(--text-secondary)]">
                    추가
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 하단 닫기 */}
        <div
          className="px-5 py-4 shrink-0 flex justify-end"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const routeParams = useParams();
  const brandName = routeParams.brandName as string;
  const productId = routeParams.productId as string;
  const { brandId } = useBrand();
  const { fetchWithAuth } = useFetchWithAuth();
  const router = useRouter();

  // 제품 데이터
  const [product, setProduct] = useState<BrandProductRow | null>(null);
  const [loading, setLoading] = useState(true);

  // 이미지 관련
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // 파라미터 패널 상태
  const [saving, setSaving] = useState(false);

  // 편집 모달 상태
  const [editOpen, setEditOpen] = useState(false);

  // 생성된 이미지
  const [generatedImages, setGeneratedImages] = useState<Render[]>([]);
  const [generatedLoading, setGeneratedLoading] = useState(true);

  // 모달
  const [kebabOpen, setKebabOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // ── 데이터 로드 ────────────────────────────────────────────────────────────

  const loadProduct = useCallback(async () => {
    if (!brandId || !productId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/brands/${brandId}/products/${productId}`,
      );
      if (res.ok) {
        const d = await res.json();
        const p: BrandProductRow =
          (d as { product: BrandProductRow }).product ?? d;
        setProduct(p);
        setSelectedImageIdx(0);
      }
    } finally {
      setLoading(false);
    }
  }, [brandId, productId, fetchWithAuth]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  // 제품 갤러리 로드
  useEffect(() => {
    if (!brandId || !productId) return;
    setGeneratedLoading(true);
    fetchWithAuth(`/api/renders?brandId=${brandId}&productId=${productId}`)
      .then((r) => r.json())
      .then((data: { renders?: Render[] }) => {
        setGeneratedImages(data.renders ?? []);
        setGeneratedLoading(false);
      })
      .catch(() => setGeneratedLoading(false));
  }, [brandId, productId, fetchWithAuth]);

  // 케밥 외부 클릭 닫기
  useEffect(() => {
    if (!kebabOpen) return;
    const handler = () => setKebabOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [kebabOpen]);

  // ── 이미지 업로드 ──────────────────────────────────────────────────────────

  const handleUpload = useCallback(
    async (files: FileList) => {
      if (!files.length || !brandId || !productId) return;
      setUploading(true);
      try {
        const fd = new FormData();
        for (const f of Array.from(files)) fd.append("images", f);
        await fetchWithAuth(
          `/api/brands/${brandId}/products/${productId}/images`,
          { method: "POST", body: fd },
        );
        await loadProduct();
      } finally {
        setUploading(false);
      }
    },
    [brandId, productId, fetchWithAuth, loadProduct],
  );

  // ── 이미지 삭제 ────────────────────────────────────────────────────────────

  const handleDeleteImage = useCallback(
    async (img: ProductImage) => {
      if (!confirm("이 이미지를 삭제하시겠습니까?")) return;
      if (!brandId || !productId) return;
      setDeleting(img.r2_key);
      try {
        await fetchWithAuth(
          `/api/brands/${brandId}/products/${productId}/images?r2Key=${encodeURIComponent(img.r2_key)}`,
          { method: "DELETE" },
        );
        await loadProduct();
        setSelectedImageIdx(0);
      } finally {
        setDeleting(null);
      }
    },
    [brandId, productId, fetchWithAuth, loadProduct],
  );

  // ── 대표 이미지 설정 ────────────────────────────────────────────────────────

  const handleSetRepresentative = useCallback(
    async (img: ProductImage) => {
      if (!brandId || !productId || !product) return;
      const currentImages = product.images ?? [];
      const newOrder = [
        img,
        ...currentImages.filter((i) => i.r2_key !== img.r2_key),
      ];
      // 낙관적 업데이트
      setProduct((prev) => (prev ? { ...prev, images: newOrder } : prev));
      setSelectedImageIdx(0);
      try {
        const res = await fetchWithAuth(
          `/api/brands/${brandId}/products/${productId}/images`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: newOrder.map((i) => i.r2_key) }),
          },
        );
        if (!res.ok) {
          // HTTP 에러(4xx/5xx) 시 서버 상태로 복원
          await loadProduct();
        }
      } catch {
        // 네트워크 오류 시 서버 상태로 복원
        await loadProduct();
      }
    },
    [brandId, productId, product, fetchWithAuth, loadProduct],
  );

  // ── 편집 모달 열기 ─────────────────────────────────────────────────────────

  const openEditModal = useCallback(() => {
    if (!product) return;
    setEditOpen(true);
  }, [product]);

  // ── 파라미터 저장 ──────────────────────────────────────────────────────────

  const handleEditSave = useCallback(
    async (cat: string, d: string) => {
      if (!brandId || !productId || !product) return;
      setSaving(true);
      try {
        const res = await fetchWithAuth(
          `/api/brands/${brandId}/products/${productId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: d.trim() || null,
              productCategory: cat,
            }),
          },
        );
        if (res.ok) {
          await loadProduct();
          setEditOpen(false);
        }
      } finally {
        setSaving(false);
      }
    },
    [brandId, productId, product, fetchWithAuth, loadProduct],
  );

  // ── 복원 ──────────────────────────────────────────────────────────────────

  const handleRestoreProduct = useCallback(async () => {
    if (!brandId || !productId) return;
    try {
      const res = await fetchWithAuth(
        `/api/brands/${brandId}/products/${productId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        },
      );
      if (res.ok) await loadProduct();
      else console.error("[handleRestoreProduct] failed:", res.status);
    } catch (e) {
      console.error("[handleRestoreProduct] error:", e);
    }
  }, [brandId, productId, fetchWithAuth, loadProduct]);

  // ── 이름 변경 ──────────────────────────────────────────────────────────────

  const handleRename = useCallback(
    async (name: string) => {
      if (!brandId || !productId || !name.trim()) return;
      const res = await fetchWithAuth(
        `/api/brands/${brandId}/products/${productId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        },
      );
      if (res.ok) {
        await loadProduct();
      }
      setRenameOpen(false);
    },
    [brandId, productId, fetchWithAuth, loadProduct],
  );

  // ── 보관 ───────────────────────────────────────────────────────────────────

  const handleArchive = useCallback(async () => {
    if (!brandId || !productId) return;
    setArchiving(true);
    try {
      const res = await fetchWithAuth(
        `/api/brands/${brandId}/products/${productId}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        router.push(`/${brandName}/assets?tab=products`);
      }
    } finally {
      setArchiving(false);
      setArchiveOpen(false);
    }
  }, [brandId, productId, brandName, fetchWithAuth, router]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto space-y-8 animate-pulse">
        <div
          className="h-8 rounded-xl w-1/3"
          style={{ background: "var(--surface-2)" }}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div
            className="aspect-square rounded-2xl"
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

  // ── Not found ──────────────────────────────────────────────────────────────

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-[color:var(--text-secondary)] text-sm">
          제품을 찾을 수 없습니다
        </p>
        <Link
          href={`/${brandName}/assets?tab=products`}
          className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
        >
          ← 제품 목록으로
        </Link>
      </div>
    );
  }

  const images = product.images ?? [];
  const selectedImage = images[selectedImageIdx] ?? null;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      {/* ── 헤더 ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href={`/${brandName}/assets?tab=products`}
          className="flex items-center gap-1 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors shrink-0"
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
          제품
        </Link>
        <span className="text-[color:var(--border-default)]">/</span>
        <h1 className="text-2xl font-bold text-[color:var(--text-primary)] flex-1 min-w-0 truncate">
          {product.name}
        </h1>

        {/* 보관됨 뱃지 */}
        {product.status === "archived" && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-900/40 text-orange-300">
            보관됨
          </span>
        )}

        {/* 편집 버튼 */}
        <button
          type="button"
          onClick={openEditModal}
          className="px-3 py-1.5 rounded-lg text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors flex items-center gap-1.5"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          편집
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
              {product?.status === "archived" && (
                <button
                  type="button"
                  onClick={() => {
                    setKebabOpen(false);
                    void handleRestoreProduct();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-emerald-400 hover:bg-[var(--surface-2)] transition-colors"
                >
                  복원
                </button>
              )}
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
              {product?.status === "active" && (
                <button
                  type="button"
                  onClick={() => {
                    setKebabOpen(false);
                    setArchiveOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-orange-400 hover:bg-[var(--surface-2)] transition-colors"
                >
                  보관
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 본문 2컬럼 ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌: 이미지 패널 */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid var(--border-subtle)" }}
        >
          {images.length > 0 ? (
            <>
              {/* 메인 이미지 */}
              <div
                className="relative aspect-square cursor-pointer group"
                onClick={() => setGalleryOpen(true)}
              >
                <img
                  src={selectedImage!.url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />

                {/* 대표 뱃지 (첫 번째 이미지) */}
                {selectedImageIdx === 0 && (
                  <span
                    className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{
                      background: "rgba(255,164,198,0.2)",
                      border: "1px solid rgba(255,164,198,0.3)",
                      color: "#ffa4c6",
                    }}
                  >
                    대표
                  </span>
                )}

                {/* 업로드 중 오버레이 */}
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <span className="text-xs text-white">업로드 중...</span>
                  </div>
                )}

                {/* hover 오버레이 */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span
                    className="text-xs text-white/80 font-medium px-3 py-1.5 rounded-lg"
                    style={{
                      background: "rgba(0,0,0,0.5)",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    이미지 관리
                  </span>
                </div>
              </div>

              {/* 썸네일 스트립 (2장 이상) */}
              {images.length >= 2 && (
                <div
                  className="flex gap-1 p-1.5 border-t"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  {images.map((img, i) => (
                    <button
                      key={img.r2_key}
                      type="button"
                      onClick={() => setSelectedImageIdx(i)}
                      className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 transition-all"
                      style={{
                        border:
                          i === selectedImageIdx
                            ? "1px solid rgba(255,164,198,0.6)"
                            : "1px solid transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (i !== selectedImageIdx)
                          e.currentTarget.style.borderColor =
                            "var(--border-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (i !== selectedImageIdx)
                          e.currentTarget.style.borderColor = "transparent";
                      }}
                    >
                      <img
                        src={img.url}
                        alt={`제품 이미지 ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* 이미지 없음 */
            <div
              className="aspect-square flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-[var(--surface-3)] transition-colors"
              style={{ background: "var(--surface-2)" }}
              onClick={() => setGalleryOpen(true)}
            >
              <span className="text-4xl">
                {CATEGORY_ICON[product.product_category] ?? "📦"}
              </span>
              <span className="text-xs text-[color:var(--text-muted)]">
                이미지 없음
              </span>
              <span className="text-[11px] text-[color:var(--text-secondary)]">
                클릭하여 이미지 추가
              </span>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* 우: 파라미터 패널 */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-5"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {/* 카테고리 */}
          <div>
            <SectionLabel>카테고리</SectionLabel>
            <p className="text-sm text-[color:var(--text-primary)] mt-1.5">
              {CATEGORY_ICON[product.product_category] ?? ""}{" "}
              {CATEGORY_LABEL[product.product_category] ??
                product.product_category}
            </p>
          </div>

          {/* 설명 */}
          <div>
            <SectionLabel>설명</SectionLabel>
            <p
              className="text-sm mt-1.5"
              style={{
                color: product.description
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
              }}
            >
              {product.description || "—"}
            </p>
          </div>

          {/* CTA 버튼 */}
          <button
            type="button"
            onClick={() =>
              router.push(`/${brandName}/studio?productId=${productId}`)
            }
            className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-full font-bold text-black text-sm transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #ffa4c6, #ffe3be)" }}
          >
            이 제품으로 생성
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

      {/* ── 하단 갤러리 ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <SectionLabel>제품 갤러리</SectionLabel>

        {generatedLoading ? (
          <div className="grid grid-cols-4 gap-1 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square"
                style={{ background: "var(--surface-2)" }}
              />
            ))}
          </div>
        ) : generatedImages.length > 0 ? (
          <div className="grid grid-cols-4 gap-1">
            {generatedImages.map((img) => (
              <div
                key={img.id}
                className="aspect-square overflow-hidden cursor-pointer transition-all"
                style={{ border: "1px solid var(--border-subtle)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-subtle)";
                }}
                onClick={() => setLightboxUrl(img.imageUrl)}
              >
                <img
                  src={img.imageUrl}
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
            <span className="text-xs text-[color:var(--text-muted)]">
              아직 생성된 이미지가 없습니다
            </span>
          </div>
        )}
      </div>

      {/* ── 모달들 ───────────────────────────────────────────────────────── */}
      {editOpen && product && (
        <ProductEditModal
          initialCategory={product.product_category}
          initialDesc={product.description ?? ""}
          saving={saving}
          onSave={handleEditSave}
          onClose={() => setEditOpen(false)}
        />
      )}
      {renameOpen && (
        <RenameModal
          currentName={product.name}
          onSave={handleRename}
          onClose={() => setRenameOpen(false)}
        />
      )}
      {archiveOpen && (
        <ArchiveConfirmModal
          name={product.name}
          archiving={archiving}
          onConfirm={handleArchive}
          onClose={() => setArchiveOpen(false)}
        />
      )}
      {lightboxUrl && (
        <LightboxModal url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
      {galleryOpen && (
        <ImageGalleryModal
          images={images}
          uploading={uploading}
          deleting={deleting}
          onClose={() => setGalleryOpen(false)}
          onUploadClick={() => fileRef.current?.click()}
          onDelete={handleDeleteImage}
          onSetRepresentative={handleSetRepresentative}
        />
      )}
    </div>
  );
}
