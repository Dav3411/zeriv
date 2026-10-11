"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useBrand } from "@/components/BrandProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import dynamic from "next/dynamic";
import type { ProductCategory } from "@/lib/brandProduct/brandProduct.types";
import type { Style, StyleType } from "@/lib/style/style.types";

const PhotoPreviewModal = dynamic(
  () =>
    import("@/components/PhotoPreviewModal").then((m) => ({
      default: m.PhotoPreviewModal,
    })),
  { ssr: false },
);
const ChannelDownloadModal = dynamic(
  () =>
    import("@/components/ChannelDownloadModal").then((m) => ({
      default: m.ChannelDownloadModal,
    })),
  { ssr: false },
);

// ── Types ────────────────────────────────────────────────

type RenderItem = {
  id: string;
  kind: string;
  name: string;
  imageUrl: string;
  createdAt: string;
  styleId: string | null;
  styleName: string | null;
  styleImageUrl: string | null;
  modelId: string | null;
  productId: string | null;
  modelName: string | null;
  modelImageUrl: string | null;
  productName: string | null;
  productCategory: string | null;
  productImageUrl: string | null;
  userFeedback?: "positive" | "negative" | null;
};

type ModelItem = {
  id: string;
  name: string;
  face_image_url: string | null;
  selections: {
    gender?: string;
    age_group?: string;
    style_vibe?: string;
  };
  status: string;
  created_at: string;
};

type ProductItem = {
  id: string;
  name: string;
  product_category: string;
  images: { role: string; url: string }[];
  image_url: string | null;
  status: string;
  created_at: string;
};

type TabKey = "all" | "renders" | "models" | "products" | "styles";

// ── 스타일 한→영 검색어 확장 ─────────────────────────────

const KO_EN_MAP: Record<string, string[]> = {
  스튜디오: ["studio"],
  야외: ["outdoor"],
  실외: ["outdoor"],
  라이프스타일: ["lifestyle"],
  추상: ["abstract"],
  추상적: ["abstract"],
  자연광: ["natural"],
  자연: ["natural"],
  혼합: ["mixed"],
  정면: ["front"],
  측면: ["side"],
  옆: ["side"],
  역광: ["back"],
  상단: ["top"],
  부드러운: ["soft"],
  소프트: ["soft"],
  강한: ["hard"],
  하드: ["hard"],
  중간: ["medium"],
  따뜻한: ["warm"],
  웜: ["warm"],
  차가운: ["cool"],
  쿨: ["cool"],
  시원한: ["cool"],
  중성: ["neutral"],
  무광: ["matte"],
  매트: ["matte"],
  유광: ["glossy"],
  광택: ["glossy"],
  새틴: ["satin"],
  메탈릭: ["metallic"],
  금속: ["metallic"],
  낮은: ["low"],
  높은: ["high"],
  미니멀: ["minimal", "minimalist"],
  미니멀리스트: ["minimalist"],
  럭셔리: ["luxury"],
  고급: ["luxury", "premium"],
  빈티지: ["vintage"],
  모던: ["modern"],
  현대적: ["modern"],
  클래식: ["classic"],
  보헤미안: ["bohemian"],
  스트리트: ["street"],
  캐주얼: ["casual"],
  포멀: ["formal"],
  격식: ["formal"],
  우아한: ["elegant", "elegance"],
  엘레강스: ["elegant", "elegance"],
  흰색: ["white"],
  하얀: ["white"],
  화이트: ["white"],
  검은: ["black", "dark"],
  블랙: ["black"],
  어두운: ["dark"],
  베이지: ["beige"],
  갈색: ["brown"],
  브라운: ["brown"],
  핑크: ["pink"],
  파란: ["blue"],
  블루: ["blue"],
  녹색: ["green"],
  그린: ["green"],
  빨간: ["red"],
  레드: ["red"],
  대리석: ["marble"],
  나무: ["wood", "wooden"],
  우드: ["wood"],
  콘크리트: ["concrete"],
  린넨: ["linen"],
  벨벳: ["velvet"],
  실크: ["silk"],
  인물: ["model", "person", "portrait"],
  모델: ["model"],
  꽃: ["flower", "floral"],
  플라워: ["floral", "flower"],
  음식: ["food"],
  푸드: ["food"],
  테크: ["tech", "technology"],
  기술: ["tech", "technology"],
};

function expandQuery(query: string): string[] {
  const terms = new Set<string>([query]);
  for (const [ko, enList] of Object.entries(KO_EN_MAP)) {
    if (ko.includes(query) || query.includes(ko)) {
      enList.forEach((en) => terms.add(en));
    }
  }
  return Array.from(terms);
}

// ── Constants ────────────────────────────────────────────

const PAGE_SIZE = 48;

const CATEGORIES: { value: ProductCategory; label: string }[] = [
  { value: "skincare", label: "스킨케어" },
  { value: "makeup", label: "메이크업" },
  { value: "haircare", label: "헤어케어" },
  { value: "fragrance", label: "프래그런스" },
  { value: "bodycare", label: "바디케어" },
  { value: "supplement", label: "서플리먼트" },
  { value: "food_beverage", label: "식품·음료" },
  { value: "fashion", label: "패션" },
  { value: "accessory", label: "액세서리" },
  { value: "electronics", label: "전자기기" },
  { value: "home", label: "홈·리빙" },
  { value: "other", label: "기타" },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map(({ value, label }) => [value, label]),
);

// ── Helpers ──────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  render_prompt: "모델",
  render_product_model: "모델 + 제품",
  render_product_solo: "제품 단독",
};

function getProductHeroUrl(p: ProductItem): string | null {
  return (
    p.images?.find((i) => i.role === "hero")?.url ??
    p.images?.[0]?.url ??
    p.image_url ??
    null
  );
}

// ── Style Sub-components ──────────────────────────────────

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
      bg: "",
      text: "",
      border: "",
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
  const isPreset = type === "preset";
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${isPreset ? "" : `${c.bg} ${c.text} ${c.border}`}`}
      style={
        isPreset
          ? {
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              background: "var(--surface-3)",
            }
          : undefined
      }
    >
      {c.label}
    </span>
  );
}

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
          스타일 이름 변경
        </h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: Summer Vibe"
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
          autoFocus
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
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "var(--text-secondary)";
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
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          스타일 삭제
        </h3>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          <span
            className="font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {name}
          </span>{" "}
          스타일을 삭제하시겠습니까?
        </p>
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
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "var(--text-secondary)";
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

function StyleCard({
  style,
  brandName,
  onRename,
  onDelete,
  kebabOpen,
  onKebabToggle,
}: {
  style: Style;
  brandName: string;
  onRename: () => void;
  onDelete: () => void;
  kebabOpen: boolean;
  onKebabToggle: () => void;
}) {
  return (
    <div className="relative group">
      <Link
        href={`/${brandName}/styles/${style.id}`}
        className="block rounded-2xl overflow-hidden border transition-all duration-200"
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--border-subtle)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgba(255,164,198,0.35)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-subtle)";
        }}
      >
        <div
          className="aspect-square relative overflow-hidden"
          style={{ background: "var(--surface-3)" }}
        >
          {(() => {
            const coverUrl =
              style.key_visual_url ?? style.example_images?.[0] ?? null;
            if (coverUrl) {
              return (
                <Image
                  src={coverUrl}
                  alt={style.name}
                  fill
                  className="object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                />
              );
            }
            const colors = Object.values(style.color_palette ?? {});
            return (
              <div
                className="w-full h-full"
                style={{
                  background: `linear-gradient(135deg, ${colors[0] ?? "#333"}, ${colors[1] ?? "#555"})`,
                }}
              />
            );
          })()}

          <div
            className="absolute inset-x-0 bottom-0 px-2.5 py-2"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)",
            }}
          >
            <span className="text-sm font-semibold text-always-white truncate block leading-tight">
              {style.name}
            </span>
          </div>

          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onKebabToggle();
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg"
              style={{
                background: "rgba(0,0,0,0.5)",
                backdropFilter: "blur(4px)",
                border: "1px solid var(--border-default)",
                color: "white",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </div>
        </div>
      </Link>

      {kebabOpen && (
        <div
          className="absolute top-10 right-2 z-10 w-40 rounded-xl py-1 shadow-xl"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            className="w-full text-left px-3 py-2 text-xs transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--surface-2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "";
            }}
          >
            이름 변경
          </button>
          <Link
            href={`/${brandName}/styles/${style.id}?variant=true`}
            onClick={(e) => e.stopPropagation()}
            className="block w-full text-left px-3 py-2 text-xs transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--surface-2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "";
            }}
          >
            배리언트 만들기
          </Link>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-full text-left px-3 py-2 text-xs text-red-400 transition-colors"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "rgba(239,68,68,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "";
            }}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl overflow-hidden animate-pulse"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="aspect-square"
            style={{ background: "var(--surface-2)" }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ brandName }: { brandName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background: "var(--surface-2)",
          border: "1px dashed var(--border-default)",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ color: "var(--text-muted)" }}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        아직 생성된 스타일이 없습니다
      </p>
      <Link
        href={`/${brandName}/styles/new`}
        className="flex items-center gap-2.5 pl-5 pr-2 py-2 rounded-full text-sm font-bold active:scale-95 transition-all"
        style={{
          background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
          color: "#000",
          boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
        }}
      >
        새 스타일
        <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
      </Link>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function SelectDropdown({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors"
        style={{
          color: "var(--text-secondary)",
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <span>{selected?.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: "var(--text-muted)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-50 min-w-full rounded-xl py-1 shadow-xl"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm transition-colors whitespace-nowrap"
              style={{
                color:
                  opt.value === value ? "#ffa4c6" : "var(--text-secondary)",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--surface-2)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "transparent";
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 2D 라인 스타일 별 아이콘 (active 시 채워짐)
function StarIcon({
  filled = false,
  size = 14,
}: {
  filled?: boolean;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function RenderCard({ r }: { r: RenderItem }) {
  const { fetchWithAuth } = useFetchWithAuth();
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(
    r.userFeedback ?? null,
  );
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const sendFeedback = useCallback(
    async (next: "positive" | "negative") => {
      if (feedbackLoading) return;
      // 같은 버튼 재클릭 시 취소(null)
      const value = feedback === next ? null : next;
      const previous = feedback; // 요청 시점의 값을 명시적으로 캡처
      setFeedback(value); // 옵티미스틱 업데이트
      setFeedbackLoading(true);
      try {
        await fetchWithAuth(`/api/assets/${r.id}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: value }),
        });
      } catch {
        setFeedback(previous); // 실패 시 요청 시점 값으로 롤백
      } finally {
        setFeedbackLoading(false);
      }
    },
    [feedback, feedbackLoading, fetchWithAuth, r.id],
  );

  if (imgError) return null;

  return (
    <>
      <div
        className="group relative aspect-[3/4] overflow-hidden cursor-pointer"
        style={{ background: "var(--surface-2)" }}
        onClick={() => setShowPreview(true)}
      >
        {/* 스켈레톤 — 이미지 로드 전 */}
        {!loaded && (
          <div
            className="absolute inset-0 animate-pulse"
            style={{ background: "var(--surface-2)" }}
          />
        )}

        <img
          src={r.imageUrl}
          alt={r.name}
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setImgError(true)}
        />

        {/* 호버 액션 버튼 — 우상단 */}
        <div
          className={`absolute top-2 right-2 z-10 flex gap-1.5 ${
            feedback === "positive"
              ? "pointer-events-auto"
              : "pointer-events-none group-hover:pointer-events-auto"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 다운로드 버튼 — hover에만 표시 */}
          <button
            type="button"
            className="w-8 h-8 rounded-lg bg-black/60 text-always-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              const proxyUrl = `/api/download?url=${encodeURIComponent(r.imageUrl)}&filename=${encodeURIComponent(`render_${r.id}.png`)}`;
              const a = document.createElement("a");
              a.href = proxyUrl;
              a.download = `render_${r.id}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>

          {/* 즐겨찾기 버튼 — 활성 시 항상 표시, 비활성 시 hover에만 표시 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              sendFeedback("positive");
            }}
            disabled={feedbackLoading}
            title="즐겨찾기"
            aria-pressed={feedback === "positive"}
            className={`w-8 h-8 rounded-lg bg-black/60 flex items-center justify-center transition-opacity disabled:opacity-50 active:scale-90 ${
              feedback === "positive"
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
            }`}
            style={{
              color: feedback === "positive" ? "#ffa4c6" : "#fff",
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))",
            }}
          >
            <StarIcon filled={feedback === "positive"} size={15} />
          </button>
        </div>
      </div>

      {showPreview && (
        <PhotoPreviewModal
          imageUrl={r.imageUrl}
          styleName={r.styleName}
          styleId={r.styleId}
          styleImageUrl={r.styleImageUrl}
          modelId={r.modelId}
          modelName={r.modelName}
          modelImageUrl={r.modelImageUrl}
          productId={r.productId}
          productName={r.productName}
          productCategory={r.productCategory}
          productImageUrl={r.productImageUrl}
          onClose={() => setShowPreview(false)}
          footer={
            <div className="mt-5 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const proxyUrl = `/api/download?url=${encodeURIComponent(r.imageUrl)}&filename=${encodeURIComponent(`render_${r.id}.png`)}`;
                    const a = document.createElement("a");
                    a.href = proxyUrl;
                    a.download = `render_${r.id}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="flex-1 flex items-center justify-between pl-6 pr-2 py-3.5 rounded-full text-sm font-bold transition-all duration-150 active:scale-[0.97] hover:brightness-95"
                  style={{
                    background: "var(--surface-3)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  원본 다운로드
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => sendFeedback("positive")}
                  disabled={feedbackLoading}
                  title="즐겨찾기"
                  aria-pressed={feedback === "positive"}
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                  style={{
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface-2)",
                    color:
                      feedback === "positive"
                        ? "#ffa4c6"
                        : "var(--text-primary)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--surface-3)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--surface-2)";
                  }}
                >
                  <StarIcon filled={feedback === "positive"} size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDownload(true);
                }}
                className="w-full flex items-center justify-between pl-6 pr-2 py-3.5 rounded-full text-sm font-bold transition-all duration-150 active:scale-[0.97] hover:brightness-95"
                style={{
                  background: "var(--surface-3)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                }}
              >
                채널 서식 선택
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "var(--surface-2)" }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </span>
              </button>
            </div>
          }
        />
      )}

      {showDownload && (
        <ChannelDownloadModal
          renderId={r.id}
          onClose={() => setShowDownload(false)}
        />
      )}
    </>
  );
}

function SectionHeader({
  title,
  count,
  onMore,
}: {
  title: string;
  count: number;
  onMore: () => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2
        className="text-[11px] uppercase tracking-widest font-semibold"
        style={{ color: "var(--accent)" }}
      >
        {title}
      </h2>
      <button
        onClick={onMore}
        className="flex items-center gap-1.5 text-xs font-medium transition-colors"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        }}
      >
        전체 보기
        <span
          className="px-1.5 py-0.5 rounded-md text-[11px]"
          style={{
            background: "var(--surface-3)",
            color: "var(--text-secondary)",
          }}
        >
          {count}
        </span>
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
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  // 표시할 페이지 번호 계산: 첫/마지막 항상 + 현재 앞뒤 1개
  const pages: (number | "...")[] = [];
  const add = (n: number) => {
    if (!pages.includes(n)) pages.push(n);
  };
  add(1);
  if (page - 1 > 1) {
    if (page - 2 > 1) pages.push("...");
    add(page - 1);
  }
  add(page);
  if (page + 1 < totalPages) {
    add(page + 1);
    if (page + 2 < totalPages) pages.push("...");
  }
  add(totalPages);

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      {/* 이전 버튼 */}
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
        style={{
          color: "var(--text-muted)",
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          opacity: page === 1 ? 0.35 : 1,
          pointerEvents: page === 1 ? "none" : "auto",
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
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* 페이지 번호 */}
      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`ellipsis-${i}`}
            className="w-8 h-8 flex items-center justify-center text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p as number)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium transition-all"
            style={
              p === page
                ? {
                    background: "rgba(255,164,198,0.12)",
                    border: "1px solid rgba(255,164,198,0.35)",
                    color: "#ffa4c6",
                    fontWeight: 700,
                  }
                : {
                    color: "var(--text-muted)",
                    background: "transparent",
                  }
            }
            onMouseEnter={(e) => {
              if (p !== page) {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--surface-2)";
                (e.currentTarget as HTMLElement).style.color =
                  "var(--text-secondary)";
              }
            }}
            onMouseLeave={(e) => {
              if (p !== page) {
                (e.currentTarget as HTMLElement).style.background =
                  "transparent";
                (e.currentTarget as HTMLElement).style.color =
                  "var(--text-muted)";
              }
            }}
          >
            {p}
          </button>
        ),
      )}

      {/* 다음 버튼 */}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
        style={{
          color: "var(--text-muted)",
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          opacity: page === totalPages ? 0.35 : 1,
          pointerEvents: page === totalPages ? "none" : "auto",
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
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────

export default function BrandAssetsPage() {
  const { brandId, loading: brandLoading } = useBrand();
  const { fetchWithAuth } = useFetchWithAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const brandName = params.brandName as string;

  const [tab, setTab] = useState<TabKey>(
    () => (searchParams.get("tab") as TabKey | null) ?? "all",
  );

  const changeTab = useCallback(
    (key: TabKey) => {
      setTab(key);
      const url = new URL(window.location.href);
      if (key === "all") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", key);
      }
      router.replace(url.pathname + (url.search || ""), { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    setTab((searchParams.get("tab") as TabKey | null) ?? "all");
  }, [searchParams]);
  const [renders, setRenders] = useState<RenderItem[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingRenders, setLoadingRenders] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // 스타일 상태
  const [styles, setStyles] = useState<Style[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const [styleSearch, setStyleSearch] = useState("");
  const [styleLimit, setStyleLimit] = useState<number | null>(null);
  const [stylePlanLabel, setStylePlanLabel] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Style | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Style | null>(null);
  const [kebabOpenId, setKebabOpenId] = useState<string | null>(null);

  // 제품 탭 필터
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");

  // 보관된 제품
  const [showArchived, setShowArchived] = useState(false);
  const [archivedProducts, setArchivedProducts] = useState<ProductItem[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);

  // 모델 탭 필터
  const [modelSearch, setModelSearch] = useState("");
  const [modelSortBy, setModelSortBy] = useState<"newest" | "oldest" | "name">(
    "newest",
  );

  // 렌더 탭 필터
  const [renderSearch, setRenderSearch] = useState("");
  const [renderKindFilter, setRenderKindFilter] = useState<string | null>(null);
  const [renderStyleFilter, setRenderStyleFilter] = useState<string | null>(
    null,
  );
  const [renderModelFilter, setRenderModelFilter] = useState<string | null>(
    null,
  );
  const [renderGroupBy, setRenderGroupBy] = useState<
    "newest" | "oldest" | "style"
  >("newest");
  const [renderLikedOnly, setRenderLikedOnly] = useState<boolean>(false);

  // 렌더 페이지네이션
  const [renderTotal, setRenderTotal] = useState(0);
  const [renderTotalPages, setRenderTotalPages] = useState(1);
  const [renderPage, setRenderPage] = useState(1);

  // 추가하기 모달
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    if (!brandId) return;
    setLoadingRenders(true);
    const params = new URLSearchParams({
      brandId,
      page: String(renderPage),
      pageSize: String(PAGE_SIZE),
    });
    if (renderStyleFilter) params.set("styleId", renderStyleFilter);
    if (renderModelFilter) params.set("modelId", renderModelFilter);
    if (renderKindFilter) params.set("kind", renderKindFilter);
    if (renderLikedOnly) params.set("feedback", "positive");
    fetchWithAuth(`/api/renders?${params.toString()}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setRenders(data.renders ?? []);
          setRenderTotal(data.total ?? 0);
          setRenderTotalPages(Math.max(1, data.totalPages ?? 1));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRenders(false));
  }, [
    brandId,
    fetchWithAuth,
    renderPage,
    renderStyleFilter,
    renderModelFilter,
    renderKindFilter,
    renderLikedOnly,
  ]);

  useEffect(() => {
    if (!brandId) return;
    setLoadingProducts(true);
    fetchWithAuth(`/api/brands/${brandId}/products`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setProducts(data.products ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, [brandId, fetchWithAuth]);

  useEffect(() => {
    if (!brandId || !showArchived) return;
    setLoadingArchived(true);
    fetchWithAuth(`/api/brands/${brandId}/products?status=archived`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setArchivedProducts(data.products ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingArchived(false));
  }, [brandId, fetchWithAuth, showArchived]);

  useEffect(() => {
    if (!brandId) return;
    setLoadingModels(true);
    fetchWithAuth(`/api/personas?brandId=${brandId}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setModels(Array.isArray(data) ? data : (data.models ?? []));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingModels(false));
  }, [brandId, fetchWithAuth]);

  // 스타일 fetch
  const loadStyles = useCallback(async () => {
    if (!brandId) return;
    setLoadingStyles(true);
    try {
      const res = await fetchWithAuth(`/api/brands/${brandId}/styles`);
      if (res.ok) {
        const data = await res.json();
        setStyles((data as { styles: Style[] }).styles ?? []);
      }
    } finally {
      setLoadingStyles(false);
    }
  }, [brandId, fetchWithAuth]);

  useEffect(() => {
    loadStyles();
  }, [loadStyles]);

  useEffect(() => {
    if (!brandId) return;
    fetchWithAuth(`/api/brands/${brandId}/subscription`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setStyleLimit(d.styleLimit);
        setStylePlanLabel(d.planLabel);
      })
      .catch(() => {});
  }, [brandId, fetchWithAuth]);

  useEffect(() => {
    if (!kebabOpenId) return;
    const handler = () => setKebabOpenId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [kebabOpenId]);

  const handleRename = useCallback(
    async (name: string) => {
      if (!brandId || !renameTarget) return;
      await fetchWithAuth(`/api/brands/${brandId}/styles/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || renameTarget.name }),
      });
      setRenameTarget(null);
      await loadStyles();
    },
    [brandId, fetchWithAuth, loadStyles, renameTarget],
  );

  const handleDelete = useCallback(async () => {
    if (!brandId || !deleteTarget) return;
    await fetchWithAuth(`/api/brands/${brandId}/styles/${deleteTarget.id}`, {
      method: "DELETE",
    });
    setDeleteTarget(null);
    await loadStyles();
  }, [brandId, deleteTarget, fetchWithAuth, loadStyles]);

  const loading =
    brandLoading ||
    loadingRenders ||
    loadingModels ||
    loadingProducts ||
    loadingStyles;

  // 렌더는 서버 페이지네이션이므로 renders.length는 현재 페이지 크기.
  // 전체 에셋 보유 여부는 renderTotal(서버 count)로 판단해야 정확함.
  const totalCount =
    renderTotal + models.length + products.length + styles.length;

  const filteredProducts = useMemo(() => {
    return products
      .filter(
        (p) =>
          filterCategory === "all" || p.product_category === filterCategory,
      )
      .filter(
        (p) =>
          !search.trim() ||
          p.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "oldest")
          return a.created_at.localeCompare(b.created_at);
        return b.created_at.localeCompare(a.created_at);
      });
  }, [products, filterCategory, search, sortBy]);

  const filteredModels = useMemo(() => {
    return models
      .filter(
        (p) =>
          !modelSearch.trim() ||
          p.name.toLowerCase().includes(modelSearch.trim().toLowerCase()),
      )
      .sort((a, b) => {
        if (modelSortBy === "name") return a.name.localeCompare(b.name);
        if (modelSortBy === "oldest")
          return a.created_at.localeCompare(b.created_at);
        return b.created_at.localeCompare(a.created_at);
      });
  }, [models, modelSearch, modelSortBy]);

  // 필터 변경 시 1페이지로 리셋 (서버에서 재조회됨)
  useEffect(() => {
    setRenderPage(1);
  }, [renderKindFilter, renderStyleFilter, renderModelFilter, renderLikedOnly]);

  // "all" 탭 진입 시 렌더 페이지를 1로 되돌려 'all' 섹션의 18개 미리보기가
  // 항상 최신순 첫 페이지 데이터가 되도록 보장.
  useEffect(() => {
    if (tab === "all") setRenderPage(1);
  }, [tab]);

  // 서버에서 이미 필터·정렬·페이지네이션된 결과. 클라이언트에서는
  // 정렬(oldest/newest)과 name 검색만 현재 페이지 범위에 대해 보조 적용.
  // ※ API 응답의 name은 빈 문자열이므로 renderSearch는 실질적으로 no-op.
  const displayRenders = useMemo(() => {
    const base = renderSearch.trim()
      ? renders.filter((r) =>
          r.name.toLowerCase().includes(renderSearch.trim().toLowerCase()),
        )
      : renders;
    if (renderGroupBy === "oldest") {
      return [...base].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return base;
  }, [renders, renderSearch, renderGroupBy]);

  const rendersByStyle = useMemo(() => {
    if (renderGroupBy !== "style") return [];
    const groups: {
      styleId: string | null;
      styleName: string;
      renders: RenderItem[];
      latestAt: string;
    }[] = [];
    const map = new Map<string, (typeof groups)[0]>();

    for (const r of displayRenders) {
      const key = r.styleId ?? "__none__";
      if (!map.has(key)) {
        const group = {
          styleId: r.styleId,
          styleName: r.styleName ?? "스타일 없음",
          renders: [],
          latestAt: r.createdAt,
        };
        map.set(key, group);
        groups.push(group);
      }
      const g = map.get(key)!;
      g.renders.push(r);
      if (r.createdAt > g.latestAt) g.latestAt = r.createdAt;
    }

    groups.sort((a, b) => b.latestAt.localeCompare(a.latestAt));
    return groups;
  }, [displayRenders, renderGroupBy]);

  const filteredStyles = useMemo(() => {
    const q = styleSearch.trim().toLowerCase();
    if (!q) return styles;
    const terms = expandQuery(q);
    const matchesAny = (text: string) =>
      terms.some((t) => text.toLowerCase().includes(t));
    return styles.filter((style) => {
      return (
        matchesAny(style.name) ||
        (style.mood_keywords ?? []).some(matchesAny) ||
        (style.prop_keywords ?? []).some(matchesAny) ||
        matchesAny(style.scene?.background ?? "") ||
        matchesAny(style.scene?.setting ?? "")
      );
    });
  }, [styles, styleSearch]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: "전체", count: totalCount },
    { key: "styles", label: "스타일", count: styles.length },
    { key: "products", label: "제품", count: products.length },
    { key: "models", label: "모델", count: models.length },
    { key: "renders", label: "렌더", count: renderTotal },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="mb-2">
          <h1
            className="font-headline text-3xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
            suppressHydrationWarning
          >
            에셋 갤러리
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            생성된 이미지, 제품, 모델을 관리합니다.
          </p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold active:scale-95 transition-all"
          style={{
            background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
            color: "#000",
            boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          추가하기
        </button>
      </div>

      {/* 추가하기 모달 */}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          onClick={() => setCreateModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative rounded-2xl p-6 w-[360px] space-y-3"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="text-base font-bold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              무엇을 추가할까요?
            </h3>

            {/* 스타일 만들기 */}
            <Link
              href={`/${brandName}/styles/new`}
              onClick={() => setCreateModalOpen(false)}
              className="flex items-center gap-4 p-4 rounded-xl transition-colors"
              style={{ border: "1px solid var(--border-subtle)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--surface-2)";
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--border-default)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--border-subtle)";
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,164,198,0.15)" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffa4c6"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="13.5" cy="6.5" r="0.5" fill="#ffa4c6" />
                  <circle cx="17.5" cy="10.5" r="0.5" fill="#ffa4c6" />
                  <circle cx="8.5" cy="7.5" r="0.5" fill="#ffa4c6" />
                  <circle cx="6.5" cy="12.5" r="0.5" fill="#ffa4c6" />
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                </svg>
              </div>
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  스타일 만들기
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  촬영 컨셉과 무드를 정의합니다
                </p>
              </div>
            </Link>

            {/* 제품 등록하기 */}
            <Link
              href={`/${brandName}/products/new`}
              onClick={() => setCreateModalOpen(false)}
              className="flex items-center gap-4 p-4 rounded-xl transition-colors"
              style={{ border: "1px solid var(--border-subtle)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--surface-2)";
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--border-default)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--border-subtle)";
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,227,190,0.15)" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffe3be"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                </svg>
              </div>
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  제품 등록하기
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  상품 이미지를 등록합니다
                </p>
              </div>
            </Link>

            {/* 모델 만들기 */}
            <Link
              href={`/${brandId}/models/new`}
              onClick={() => setCreateModalOpen(false)}
              className="flex items-center gap-4 p-4 rounded-xl transition-colors"
              style={{ border: "1px solid var(--border-subtle)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "var(--surface-2)";
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--border-default)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.borderColor =
                  "var(--border-subtle)";
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(167,139,250,0.15)" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  모델 만들기
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  AI 모델 페르소나를 생성합니다
                </p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex w-full items-stretch gap-1 p-1 rounded-full"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {tabs.map(({ key, label, count }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => changeTab(key)}
              className="flex flex-1 basis-0 min-w-0 flex-col items-center justify-center leading-tight sm:flex-row sm:gap-1 px-2 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
              style={
                active
                  ? {
                      background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                      color: "#000",
                    }
                  : { color: "var(--text-muted)" }
              }
              onMouseEnter={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--text-secondary)";
              }}
              onMouseLeave={(e) => {
                if (!active)
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--text-muted)";
              }}
            >
              {label}
              {count > 0 && <span className="opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-8">
          {[80, 96, 56].map((h, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl"
              style={{
                height: h,
                background: "var(--surface-2)",
              }}
            />
          ))}
        </div>
      ) : totalCount === 0 && tab === "all" ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: "var(--surface-2)",
              border: "1px dashed var(--border-default)",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ color: "var(--text-muted)" }}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            아직 에셋이 없습니다
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            이미지를 생성하거나 모델을 만들어보세요
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* ── 스타일 ─────────────────────────────────────────── */}
          {(tab === "all" || tab === "styles") && (
            <section>
              {tab === "styles" && styles.length > 0 && (
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {styleLimit !== null && styles.length >= styleLimit ? (
                      <div
                        className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold opacity-50 cursor-not-allowed"
                        style={{
                          background: "var(--surface-3)",
                          color: "var(--text-secondary)",
                        }}
                        title={`${stylePlanLabel ?? "현재 플랜"} 한도 도달 · 업그레이드 후 더 만들 수 있어요`}
                      >
                        새 스타일
                        <span
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                          style={{ background: "var(--surface-3)" }}
                        >
                          {styles.length}/{styleLimit}
                        </span>
                      </div>
                    ) : (
                      <Link
                        href={`/${brandName}/styles/new`}
                        className="flex items-center gap-2.5 pl-5 pr-2 py-2 rounded-full text-sm font-bold active:scale-95 transition-all"
                        style={{
                          background:
                            "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                          color: "#000",
                          boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
                        }}
                      >
                        새 스타일
                        <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        </span>
                      </Link>
                    )}
                    {!loadingStyles && styles.length > 0 && (
                      <div
                        className="flex items-center gap-2 w-48 px-3 py-2 rounded-xl"
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <svg
                          className="w-4 h-4 shrink-0"
                          style={{ color: "var(--text-muted)" }}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                          type="text"
                          placeholder="스타일 검색..."
                          value={styleSearch}
                          onChange={(e) => setStyleSearch(e.target.value)}
                          className="flex-1 bg-transparent text-sm outline-none min-w-0 placeholder:text-[color:var(--text-muted)]"
                          style={{ color: "var(--text-primary)" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === "all" && styles.length > 0 && (
                <SectionHeader
                  title="스타일"
                  count={styles.length}
                  onMore={() => changeTab("styles")}
                />
              )}

              {loadingStyles ? (
                <SkeletonGrid />
              ) : tab === "all" ? (
                styles.length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                    {styles.slice(0, 8).map((style) => {
                      const coverUrl =
                        style.key_visual_url ??
                        style.example_images?.[0] ??
                        null;
                      const colors = Object.values(style.color_palette ?? {});
                      return (
                        <Link
                          key={style.id}
                          href={`/${brandName}/styles/${style.id}`}
                          className="group shrink-0 w-28 flex flex-col gap-2"
                        >
                          <div
                            className="w-28 h-28 rounded-xl overflow-hidden relative"
                            style={{ background: "var(--surface-3)" }}
                          >
                            {coverUrl ? (
                              <Image
                                src={coverUrl}
                                alt={style.name}
                                fill
                                className="object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                              />
                            ) : (
                              <div
                                className="w-full h-full"
                                style={{
                                  background: `linear-gradient(135deg, ${colors[0] ?? "#333"}, ${colors[1] ?? "#555"})`,
                                }}
                              />
                            )}
                          </div>
                          <p
                            className="text-xs font-medium truncate leading-normal py-0.5"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {style.name}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                )
              ) : styles.length === 0 ? (
                <EmptyState brandName={brandName} />
              ) : filteredStyles.length === 0 ? (
                <p
                  className="text-sm text-center py-16"
                  style={{ color: "var(--text-muted)" }}
                >
                  검색 결과가 없습니다
                </p>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {filteredStyles.map((style) => (
                    <StyleCard
                      key={style.id}
                      style={style}
                      brandName={brandName}
                      onRename={() => {
                        setRenameTarget(style);
                        setKebabOpenId(null);
                      }}
                      onDelete={() => {
                        setDeleteTarget(style);
                        setKebabOpenId(null);
                      }}
                      kebabOpen={kebabOpenId === style.id}
                      onKebabToggle={() =>
                        setKebabOpenId(
                          kebabOpenId === style.id ? null : style.id,
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── 제품 ─────────────────────────────────────────── */}
          {tab === "all" && products.length > 0 && (
            <section>
              <SectionHeader
                title="제품"
                count={products.length}
                onMore={() => changeTab("products")}
              />
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                {products.map((p) => {
                  const heroUrl = getProductHeroUrl(p);
                  return (
                    <Link
                      key={p.id}
                      href={`/${brandId}/products/${p.id}`}
                      className="group shrink-0 w-28 flex flex-col gap-2"
                    >
                      <div
                        className="w-28 relative rounded-xl overflow-hidden"
                        style={{
                          background: "var(--surface-2)",
                          aspectRatio: "1/1",
                        }}
                      >
                        {heroUrl ? (
                          <Image
                            src={heroUrl}
                            alt={p.name}
                            fill
                            className="object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center text-2xl"
                            style={{ color: "var(--text-muted)" }}
                          >
                            📦
                          </div>
                        )}
                      </div>
                      <p
                        className="text-xs font-medium truncate leading-tight"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {p.name}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
          {tab === "products" && (
            <section>
              {products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px dashed var(--border-default)",
                    }}
                  >
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      style={{ color: "var(--text-muted)" }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    아직 등록된 제품이 없습니다
                  </p>
                  <Link
                    href={`/${brandId}/products/new`}
                    className="flex items-center gap-2.5 pl-5 pr-2 py-2 rounded-full text-sm font-bold active:scale-95 transition-all"
                    style={{
                      background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                      color: "#000",
                      boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
                    }}
                  >
                    새 제품
                    <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </span>
                  </Link>
                </div>
              ) : (
                /* products tab: 필터 + 그리드 */
                <div className="space-y-4">
                  {/* 필터 바 */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link
                      href={`/${brandName}/products/new`}
                      className="flex items-center gap-2.5 pl-5 pr-2 py-2 rounded-full text-sm font-bold active:scale-95 transition-all shrink-0"
                      style={{
                        background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                        color: "#000",
                        boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
                      }}
                    >
                      새 제품
                      <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </span>
                    </Link>
                    <div className="relative flex-1 min-w-48 max-w-xs">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--text-muted)" }}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="제품 검색..."
                        className="w-full rounded-lg text-sm focus:outline-none py-2 pl-9 pr-3 placeholder:text-[color:var(--text-muted)]"
                        style={{
                          color: "var(--text-primary)",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      />
                    </div>
                    <SelectDropdown
                      value={filterCategory}
                      onChange={setFilterCategory}
                      options={[
                        { value: "all", label: "전체 카테고리" },
                        ...CATEGORIES.map(({ value, label }) => ({
                          value,
                          label,
                        })),
                      ]}
                    />
                    <SelectDropdown
                      value={sortBy}
                      onChange={(v) =>
                        setSortBy(v as "newest" | "oldest" | "name")
                      }
                      options={[
                        { value: "newest", label: "최신순" },
                        { value: "oldest", label: "오래된순" },
                        { value: "name", label: "이름순" },
                      ]}
                    />
                  </div>

                  {/* 그리드 */}
                  {filteredProducts.length === 0 ? (
                    <p
                      className="text-sm py-12 text-center"
                      style={{ color: "var(--text-muted)" }}
                    >
                      검색 결과가 없습니다
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                      {filteredProducts.map((p) => {
                        const heroUrl = getProductHeroUrl(p);
                        return (
                          <Link
                            key={p.id}
                            href={`/${brandId}/products/${p.id}`}
                            className="group flex flex-col gap-2"
                          >
                            <div
                              className="w-full relative rounded-xl overflow-hidden"
                              style={{
                                aspectRatio: "1/1",
                                background: "var(--surface-2)",
                              }}
                            >
                              {heroUrl ? (
                                <Image
                                  src={heroUrl}
                                  alt={p.name}
                                  fill
                                  className="object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center text-3xl"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  📦
                                </div>
                              )}
                            </div>
                            <p
                              className="text-xs font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {p.name}
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {/* 보관된 제품 */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowArchived((v) => !v)}
                      className="flex items-center gap-2 text-xs transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color =
                          "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color =
                          "var(--text-muted)";
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
                        className={`transition-transform ${showArchived ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      보관된 제품 보기
                    </button>

                    {showArchived && (
                      <div className="mt-3">
                        {loadingArchived ? (
                          <p
                            className="text-xs py-4"
                            style={{ color: "var(--text-muted)" }}
                          >
                            불러오는 중...
                          </p>
                        ) : archivedProducts.length === 0 ? (
                          <p
                            className="text-xs py-4"
                            style={{ color: "var(--text-muted)" }}
                          >
                            보관된 제품이 없습니다
                          </p>
                        ) : (
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 mt-2">
                            {archivedProducts.map((p) => {
                              const heroUrl = getProductHeroUrl(p);
                              return (
                                <Link
                                  key={p.id}
                                  href={`/${brandId}/products/${p.id}`}
                                  className="group flex flex-col gap-2 opacity-60 hover:opacity-100 transition-opacity"
                                >
                                  <div
                                    className="w-full relative rounded-xl overflow-hidden"
                                    style={{
                                      aspectRatio: "1/1",
                                      background: "var(--surface-2)",
                                    }}
                                  >
                                    {heroUrl ? (
                                      <Image
                                        src={heroUrl}
                                        alt={p.name}
                                        fill
                                        className="object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                                      />
                                    ) : (
                                      <div
                                        className="w-full h-full flex items-center justify-center text-3xl"
                                        style={{ color: "var(--text-muted)" }}
                                      >
                                        📦
                                      </div>
                                    )}
                                  </div>
                                  <p
                                    className="text-xs font-medium truncate"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    {p.name}
                                  </p>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ── 모델 ──────────────────────────────────── */}
          {tab === "all" && models.length > 0 && (
            <section>
              <SectionHeader
                title="모델"
                count={models.length}
                onMore={() => changeTab("models")}
              />
              {/* all: 가로 스크롤 1줄, 원형 아바타 */}
              <div className="flex gap-5 overflow-x-auto pb-2 pt-2 -mx-1 px-1 scrollbar-hide">
                {models.map((p) => (
                  <Link
                    key={p.id}
                    href={`/${brandId}/models/${p.id}`}
                    className="group shrink-0 flex flex-col items-center gap-2.5 w-28"
                  >
                    <div
                      className="w-24 h-24 relative rounded-full overflow-hidden"
                      style={{ background: "var(--surface-2)" }}
                    >
                      {p.face_image_url ? (
                        <Image
                          src={p.face_image_url}
                          alt={p.name}
                          fill
                          className="object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-2xl"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {p.selections.gender === "female"
                            ? "♀"
                            : p.selections.gender === "male"
                              ? "♂"
                              : "?"}
                        </div>
                      )}
                    </div>
                    <p
                      className="text-xs text-center truncate w-full leading-tight"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {p.name}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {tab === "models" && (
            <section>
              {models.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px dashed var(--border-default)",
                    }}
                  >
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      style={{ color: "var(--text-muted)" }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    아직 생성된 모델이 없습니다
                  </p>
                  <Link
                    href={`/${brandId}/models/new`}
                    className="flex items-center gap-2.5 pl-5 pr-2 py-2 rounded-full text-sm font-bold active:scale-95 transition-all"
                    style={{
                      background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                      color: "#000",
                      boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
                    }}
                  >
                    새 모델
                    <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </span>
                  </Link>
                </div>
              ) : (
                /* models tab: 필터 + 카드 그리드 */
                <div className="space-y-4">
                  {/* 필터 바 */}
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/${brandId}/models/new`}
                      className="flex items-center gap-2.5 pl-5 pr-2 py-2 rounded-full text-sm font-bold active:scale-95 transition-all shrink-0"
                      style={{
                        background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                        color: "#000",
                        boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
                      }}
                    >
                      새 모델
                      <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      </span>
                    </Link>
                    <div className="relative flex-1 min-w-48 max-w-xs">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--text-muted)" }}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        type="text"
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        placeholder="모델 검색..."
                        className="w-full rounded-lg text-sm focus:outline-none py-2 pl-9 pr-3 placeholder:text-[color:var(--text-muted)]"
                        style={{
                          color: "var(--text-primary)",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      />
                    </div>
                    <SelectDropdown
                      value={modelSortBy}
                      onChange={(v) =>
                        setModelSortBy(v as "newest" | "oldest" | "name")
                      }
                      options={[
                        { value: "newest", label: "최신순" },
                        { value: "oldest", label: "오래된순" },
                        { value: "name", label: "이름순" },
                      ]}
                    />
                  </div>

                  {/* 그리드 */}
                  {filteredModels.length === 0 ? (
                    <p
                      className="text-sm py-12 text-center"
                      style={{ color: "var(--text-muted)" }}
                    >
                      검색 결과가 없습니다
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                      {filteredModels.map((p) => (
                        <Link
                          key={p.id}
                          href={`/${brandId}/models/${p.id}`}
                          className="group flex flex-col items-center gap-2.5"
                        >
                          <div
                            className="w-full aspect-square relative rounded-full overflow-hidden"
                            style={{ background: "var(--surface-2)" }}
                          >
                            {p.face_image_url ? (
                              <Image
                                src={p.face_image_url}
                                alt={p.name}
                                fill
                                className="object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
                              />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center text-4xl"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {p.selections.gender === "female"
                                  ? "♀"
                                  : p.selections.gender === "male"
                                    ? "♂"
                                    : "?"}
                              </div>
                            )}
                          </div>
                          <div className="w-full text-center">
                            <p
                              className="text-xs font-medium truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {p.name}
                            </p>
                            <p
                              className="text-[10px] mt-0.5 truncate"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {[p.selections.style_vibe, p.selections.age_group]
                                .filter(Boolean)
                                .join(" · ") || "모델"}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── 렌더 ─────────────────────────────────────────── */}
          {tab === "all" && renders.length > 0 && (
            <section>
              <SectionHeader
                title="렌더"
                count={renderTotal}
                onMore={() => changeTab("renders")}
              />
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1">
                {renders.slice(0, 18).map((r) => (
                  <RenderCard key={r.id} r={r} />
                ))}
              </div>
            </section>
          )}
          {tab === "renders" && (
            <section>
              {renderTotal === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px dashed var(--border-default)",
                    }}
                  >
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      style={{ color: "var(--text-muted)" }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    아직 생성된 이미지가 없습니다
                  </p>
                  <Link
                    href={`/${brandId}/studio`}
                    className="flex items-center gap-2.5 pl-5 pr-2 py-2 rounded-full text-sm font-bold active:scale-95 transition-all"
                    style={{
                      background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                      color: "#000",
                      boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
                    }}
                  >
                    스튜디오
                    <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </span>
                  </Link>
                </div>
              ) : (
                /* renders tab: 필터 + 그리드 */
                <div className="space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link
                      href={`/${brandId}/studio`}
                      className="flex items-center gap-2.5 pl-5 pr-2 py-2 rounded-full text-sm font-bold active:scale-95 transition-all shrink-0"
                      style={{
                        background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                        color: "#000",
                        boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
                      }}
                    >
                      스튜디오
                      <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </span>
                    </Link>
                    <div className="relative flex-1 min-w-48 max-w-xs">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--text-muted)" }}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        type="text"
                        value={renderSearch}
                        onChange={(e) => setRenderSearch(e.target.value)}
                        placeholder="렌더 검색..."
                        className="w-full rounded-lg text-sm focus:outline-none py-2 pl-9 pr-3 placeholder:text-[color:var(--text-muted)]"
                        style={{
                          color: "var(--text-primary)",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      />
                    </div>
                    <SelectDropdown
                      value={renderKindFilter ?? "all"}
                      onChange={(v) =>
                        setRenderKindFilter(v === "all" ? null : v)
                      }
                      options={[
                        { value: "all", label: "전체 종류" },
                        ...Object.entries(KIND_LABEL).map(([value, label]) => ({
                          value,
                          label,
                        })),
                      ]}
                    />
                    <SelectDropdown
                      value={renderGroupBy}
                      onChange={(v) =>
                        setRenderGroupBy(v as "newest" | "oldest" | "style")
                      }
                      options={[
                        { value: "newest", label: "최신순" },
                        { value: "oldest", label: "오래된순" },
                        { value: "style", label: "스타일별" },
                      ]}
                    />
                    <button
                      type="button"
                      onClick={() => setRenderLikedOnly((v) => !v)}
                      aria-pressed={renderLikedOnly}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all shrink-0"
                      style={{
                        background: renderLikedOnly
                          ? "rgba(255,164,198,0.15)"
                          : "var(--surface-2)",
                        border: renderLikedOnly
                          ? "1px solid rgba(255,164,198,0.4)"
                          : "1px solid var(--border-subtle)",
                        color: renderLikedOnly
                          ? "#ffa4c6"
                          : "var(--text-secondary)",
                      }}
                    >
                      <StarIcon filled={renderLikedOnly} size={14} />
                      좋아요
                    </button>
                  </div>

                  {displayRenders.length === 0 ? (
                    <p
                      className="text-sm py-12 text-center"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {renderLikedOnly
                        ? "⭐ 표시한 이미지가 아직 없습니다. 갤러리에서 마음에 드는 이미지에 별표를 눌러보세요."
                        : "검색 결과가 없습니다"}
                    </p>
                  ) : renderGroupBy === "style" ? (
                    <div className="space-y-8">
                      {rendersByStyle.map((group) => (
                        <div
                          key={group.styleId ?? "__none__"}
                          className="space-y-3"
                        >
                          <div className="flex items-center gap-2">
                            {group.styleId ? (
                              <Link
                                href={`/${brandId}/styles/${group.styleId}`}
                                className="text-[11px] uppercase tracking-widest font-semibold hover:opacity-70 transition-opacity"
                                style={{ color: "var(--accent)" }}
                              >
                                {group.styleName}
                              </Link>
                            ) : (
                              <span
                                className="text-[11px] uppercase tracking-widest font-semibold"
                                style={{ color: "var(--accent)" }}
                              >
                                {group.styleName}
                              </span>
                            )}
                            <span
                              className="text-[11px]"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {group.renders.length}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1">
                            {group.renders.map((r) => (
                              <RenderCard key={r.id} r={r} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {renderTotal > 0 && (
                        <p
                          className="text-xs mt-3"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {renderTotal}개 중 {(renderPage - 1) * PAGE_SIZE + 1}–
                          {Math.min(renderPage * PAGE_SIZE, renderTotal)} 표시
                        </p>
                      )}
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1">
                        {displayRenders.map((r) => (
                          <RenderCard key={r.id} r={r} />
                        ))}
                      </div>
                      <Pagination
                        page={renderPage}
                        totalPages={renderTotalPages}
                        onChange={(p) => setRenderPage(p)}
                      />
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {renameTarget && (
        <RenameModal
          currentName={renameTarget.name}
          onSave={handleRename}
          onClose={() => setRenameTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.name}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
