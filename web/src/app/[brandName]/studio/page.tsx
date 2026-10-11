"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthProvider";
import { useBrand } from "@/components/BrandProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { useJobQueue } from "@/components/JobQueueProvider";
import dynamic from "next/dynamic";
import { CREDIT_PLANS, PLAN_IDS } from "@/lib/plans";
import type { Style } from "@/lib/style/style.types";
import { GuestStudioPage } from "./_components/GuestStudioPage";
import { PackPurchaseModal } from "@/components/packs/PackPurchaseModal";
import { clearPackBalanceCache } from "@/components/packs/PackBalance";
import { InsufficientPackModal } from "@/components/packs/InsufficientPackModal";

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

type Model = {
  id: string;
  name: string;
  selections: { face_type?: string; style_vibe?: string };
  face_image_url: string | null;
  face_sheet_key: string | null;
};

type BrandProduct = {
  id: string;
  name: string;
  product_category: string;
  image_url: string | null;
  images: { role: string; url: string }[];
};

const FACE_EMOJI: Record<string, string> = {
  dog: "🐶",
  cat: "🐱",
  fox: "🦊",
  rabbit: "🐰",
  deer: "🦌",
  snake: "🐍",
  hamster: "🐹",
};

// ── Pack 결제 에러 유틸 ───────────────────────────────────────────────
type PackErrorCode = "INSUFFICIENT_PACK" | "DAILY_LIMIT";

/**
 * /api/render/create-job 응답에서 결제·한도 부족 케이스를 판별.
 * 반환값이 non-null 이면 호출자는 모달을 열고 일반 에러 경로를 건너뛴다.
 */
function isPackOrDailyLimitError(
  status: number,
  data: { code?: string } | null,
): PackErrorCode | null {
  if (status === 402 && data?.code === "INSUFFICIENT_PACK")
    return "INSUFFICIENT_PACK";
  if (status === 429 && data?.code === "DAILY_LIMIT") return "DAILY_LIMIT";
  return null;
}

// ── Active pipeline modes ─────────────────────────────────────────────
// 현재 사용 중인 모드: studio (product_studio에서 리네이밍)
// studio 모드는 PIPELINE_MODES 탭 목록 대신 기본 모드로 직접 사용됨
const PIPELINE_MODES: {
  id: string;
  label: string;
  icon: string;
  desc: string;
}[] = [];

const ASPECT_RATIOS = [
  {
    value: "9:16" as const,
    label: "9:16",
    rect: { x: 6, y: 3, width: 8, height: 14 },
  },
  {
    value: "3:4" as const,
    label: "3:4",
    rect: { x: 5.5, y: 4, width: 9, height: 12 },
  },
  {
    value: "1:1" as const,
    label: "1:1",
    rect: { x: 4, y: 4, width: 12, height: 12 },
  },
  {
    value: "4:3" as const,
    label: "4:3",
    rect: { x: 4, y: 5.5, width: 12, height: 9 },
  },
  {
    value: "16:9" as const,
    label: "16:9",
    rect: { x: 3, y: 6, width: 14, height: 8 },
  },
] as const;

const BATCH_COUNTS = [1, 2, 4, 8, 16, 32] as const;
type BatchCount = (typeof BATCH_COUNTS)[number];

// ── Legacy pipeline modes (현재 미사용, 추후 재활성화 가능) ──────────────
// outfit / prompt / influencer_product / object_render 는 현재 URL ?mode= 로만 접근 가능
// UI에서 탭으로 노출되지 않으며, 기본 진입 시 studio 모드가 사용됨
const LEGACY_PIPELINE_MODES = [
  { id: "outfit" as const, label: "의상", icon: "👗", desc: "의상 합성" },
  { id: "prompt" as const, label: "장면", icon: "✨", desc: "장면 생성" },
  {
    id: "influencer_product" as const,
    label: "모델",
    icon: "📸",
    desc: "모델 스튜디오",
  },
  { id: "object_render" as const, label: "제품", icon: "📦", desc: "스튜디오" },
];

const PRICE_MAP: Record<string, string> = {
  outfit: "$0.20",
  prompt: "$0.02",
  object_render: "$0.10",
  influencer_product: "$0.12",
  studio: "$0.12",
};

const IDLE_STEPS: Record<string, string[]> = {
  outfit: [
    "모델을 선택하세요",
    "참조 이미지를 업로드하세요",
    "의상 이미지를 추가하고 렌더 시작",
  ],
  prompt: [
    "모델을 선택하세요",
    "원하는 장면을 프롬프트로 설명하세요",
    "렌더 시작",
  ],
  object_render: [
    "참조 스타일 이미지를 선택하세요",
    "렌더링할 제품 이미지를 업로드하세요",
    "렌더 시작",
  ],
  influencer_product: [
    "모델을 선택하세요",
    "제품 이미지를 업로드하세요",
    "렌더 시작",
  ],
  studio: [
    "모델을 선택하거나 건너뛰세요",
    "제품 이미지를 업로드하세요",
    "렌더 시작",
  ],
};

type JobResult = {
  job?: {
    id: string;
    status: string;
    progress: number;
    error?: string | null;
    result?: {
      type?: string;
      result_key?: string;
      mannequin_key?: string;
    } | null;
  };
  renderResultUrl?: string | null;
  renderGeminiUrl?: string | null;
  renderGrokUrl?: string | null;
  renderGptUrl?: string | null;
  renderStep1Url?: string | null;
};

// ── Studio showcase bento 이미지 정의 ─────────────────────────────────────
// 배치: 3열 × 4행(row 120px), 4:5 이미지는 모두 rowSpan 2 사용
const STUDIO_BENTO: {
  src: string;
  col: string;
  row: string;
  objectPosition: string;
  fallback: string;
}[] = [
  {
    src: "/studio-showcase/showcase_01.png",
    col: "1",
    row: "1",
    objectPosition: "center",
    fallback: "#1e1a2e",
  },
  {
    src: "/studio-showcase/showcase_02.png",
    col: "2",
    row: "1 / span 2",
    objectPosition: "center",
    fallback: "#1a1e1a",
  },
  {
    src: "/studio-showcase/showcase_03.png",
    col: "3",
    row: "1 / span 2",
    objectPosition: "center top",
    fallback: "#1e1a18",
  },
  {
    src: "/studio-showcase/showcase_04.png",
    col: "1",
    row: "2",
    objectPosition: "center",
    fallback: "#1a1a1e",
  },
  {
    src: "/studio-showcase/showcase_05.png",
    col: "2",
    row: "3 / span 2",
    objectPosition: "center top",
    fallback: "#1e1a18",
  },
  {
    src: "/studio-showcase/showcase_06.png",
    col: "3",
    row: "3",
    objectPosition: "center",
    fallback: "#12141e",
  },
  {
    src: "/studio-showcase/showcase_07.png",
    col: "1",
    row: "3 / span 2",
    objectPosition: "center top",
    fallback: "#1a1e1a",
  },
  {
    src: "/studio-showcase/showcase_08.png",
    col: "3",
    row: "4",
    objectPosition: "center",
    fallback: "#1c1414",
  },
];

// ── ShowcaseImage — 로드 실패 시 fallback 색상 블록 ─────────────────────────
function ShowcaseImage({
  src,
  objectPosition,
  fallback,
}: {
  src: string;
  objectPosition: string;
  fallback: string;
}) {
  const [failed, setFailed] = React.useState(false);
  return failed ? (
    <div className="w-full h-full" style={{ background: fallback }} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className="w-full h-full object-cover transition-transform duration-500 hover:scale-[1.03]"
      style={{ objectPosition }}
      onError={() => setFailed(true)}
    />
  );
}

// ── Image upload slot component ──────────────────────────────────────────
function ImageSlot({
  file,
  onAdd,
  onRemove,
  label,
}: {
  file: File | null;
  onAdd: (f: File) => void;
  onRemove: () => void;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) onAdd(f);
  }

  return (
    <div
      className={`relative aspect-square rounded-xl border border-dashed overflow-hidden transition-colors ${
        dragOver
          ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
          : "border-[var(--border-default)] bg-[var(--surface-2)] hover:border-[var(--border-accent)]"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {preview ? (
        <>
          <img
            src={preview}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-[var(--error)] transition-colors"
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
              <path d="M1.41 0L0 1.41 3.59 5 0 8.59 1.41 10 5 6.41 8.59 10 10 8.59 6.41 5 10 1.41 8.59 0 5 3.59 1.41 0z" />
            </svg>
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-muted)] gap-1"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="text-[10px]">{label}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAdd(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Unified outfit drop zone ─────────────────────────────────────────────
function OutfitDropZone({
  files,
  onChange,
  label,
  hint,
  maxFiles,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  label: string;
  hint: string;
  maxFiles: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(newFiles: FileList | File[]) {
    const accepted = Array.from(newFiles).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (accepted.length === 0) return;
    onChange([...files, ...accepted].slice(0, maxFiles));
  }

  function removeFile(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  function handleReorder(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const next = [...files];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onChange(next);
  }

  const canAdd = files.length < maxFiles;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          {label}
        </div>
        {files.length > 0 && (
          <span className="text-[10px] text-[var(--text-muted)]">
            {files.length}/{maxFiles}
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)]">{hint}</p>
      <div
        className={`rounded-xl border border-dashed overflow-hidden transition-colors ${
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
            : "border-[var(--border-default)] hover:border-[var(--border-accent)]"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          // 외부 파일 드롭 (썸네일 재정렬이 아닌 경우)만 dragOver 표시
          if (dragIdx === null && canAdd) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          // 외부 파일 드롭 (썸네일 재정렬이 아닌 경우)
          if (dragIdx === null && canAdd && e.dataTransfer.files.length > 0) {
            addFiles(e.dataTransfer.files);
          }
        }}
      >
        {/* Thumbnails grid — draggable for reorder */}
        {files.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5 p-2">
            {previews.map((url, i) => (
              <div
                key={`outfit-${i}`}
                draggable
                onDragStart={(e) => {
                  setDragIdx(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragIdx !== null) setDropIdx(i);
                }}
                onDragLeave={() => {
                  if (dropIdx === i) setDropIdx(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragIdx !== null) {
                    handleReorder(dragIdx, i);
                  }
                  setDragIdx(null);
                  setDropIdx(null);
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setDropIdx(null);
                }}
                className={`relative aspect-square rounded-lg overflow-hidden bg-[var(--surface-2)] cursor-grab active:cursor-grabbing transition-all ${
                  dragIdx === i ? "opacity-40 scale-95" : ""
                } ${dropIdx === i && dragIdx !== i ? "ring-2 ring-pink-400" : ""}`}
              >
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover select-none pointer-events-none"
                />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-[var(--error)] transition-colors"
                >
                  <svg
                    width="7"
                    height="7"
                    viewBox="0 0 10 10"
                    fill="currentColor"
                  >
                    <path d="M1.41 0L0 1.41 3.59 5 0 8.59 1.41 10 5 6.41 8.59 10 10 8.59 6.41 5 10 1.41 8.59 0 5 3.59 1.41 0z" />
                  </svg>
                </button>
                <div className="absolute bottom-1 left-1 w-4 h-4 rounded bg-black/60 text-[9px] text-white flex items-center justify-center font-medium">
                  {i + 1}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add button area */}
        {canAdd && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`w-full flex flex-col items-center justify-center text-[var(--text-muted)] gap-1.5 transition-colors hover:text-[var(--text-secondary)] ${
              files.length > 0
                ? "py-3 border-t border-[color:var(--border-subtle)]"
                : "py-8"
            }`}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            <span className="text-[11px]">
              {files.length === 0
                ? "Drop images here or click to add"
                : "Add more"}
            </span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Pending jobs localStorage persistence ────────────────────────────────
type PendingJob =
  | { jobId: string; type: "single" }
  | { jobId: string; type: "batch" }
  | {
      jobId: string;
      type: "auto";
      autoStyleId: string;
      autoStyleName: string;
      brandUuid: string;
    };

function pendingJobsKey(bId: string) {
  return `studio_pending_jobs_${bId}`;
}

function clearedAtKey(brand: string) {
  return `studio_cleared_at_${brand}`;
}

function savePendingJob(bId: string, job: PendingJob) {
  try {
    const raw = localStorage.getItem(pendingJobsKey(bId));
    const jobs: PendingJob[] = raw ? (JSON.parse(raw) as PendingJob[]) : [];
    if (!jobs.some((j) => j.jobId === job.jobId)) {
      localStorage.setItem(pendingJobsKey(bId), JSON.stringify([...jobs, job]));
    }
  } catch {}
}

function removePendingJob(bId: string, jobId: string) {
  try {
    const raw = localStorage.getItem(pendingJobsKey(bId));
    if (!raw) return;
    const jobs = (JSON.parse(raw) as PendingJob[]).filter(
      (j) => j.jobId !== jobId,
    );
    if (jobs.length === 0) localStorage.removeItem(pendingJobsKey(bId));
    else localStorage.setItem(pendingJobsKey(bId), JSON.stringify(jobs));
  } catch {}
}

// Default export 는 게스트 분기 wrapper. 인증 사용자만 거대한 ModelsRenderPage 의
// 훅 트리를 호출해 게스트 페이지에서 불필요한 ref/fetch/jobQueue 가 마운트되지 않게 한다.
export default function StudioPageEntry() {
  const { isGuest } = useBrand();
  if (isGuest) return <GuestStudioPage />;
  return <ModelsRenderPage />;
}

function ModelsRenderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobIdFromUrl = searchParams.get("job");
  const styleIdFromUrl = searchParams.get("styleId");
  const modelIdFromUrl = searchParams.get("modelId");
  const productIdFromUrl = searchParams.get("productId");
  const { user, loading: authLoading } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();
  const { addJob } = useJobQueue();
  const t = useTranslations("personasRender");
  const tc = useTranslations("common");

  // ── Form state ────────────────────────────────────────────────────────
  const modeFromUrl = searchParams.get("mode") as
    | "studio"
    | "outfit"
    | "prompt"
    | "object_render"
    | "influencer_product"
    | null;
  const [pipelineMode, setPipelineMode] = useState<
    "studio" | "outfit" | "prompt" | "object_render" | "influencer_product"
  >(modeFromUrl ?? "studio");
  const [models, setModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exampleImage, setExampleImage] = useState<File | null>(null);
  const [outfitImages, setOutfitImages] = useState<File[]>([]);
  const [promptText, setPromptText] = useState("");
  const [realism, setRealism] = useState(false);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [styleImage, setStyleImage] = useState<File | null>(null);
  const [objectImage, setObjectImage] = useState<File | null>(null);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [productExampleImage, setProductExampleImage] = useState<File | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<
    "1:1" | "3:4" | "4:3" | "9:16" | "16:9"
  >(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("studio_aspect_ratio");
      if (
        saved === "1:1" ||
        saved === "3:4" ||
        saved === "4:3" ||
        saved === "9:16" ||
        saved === "16:9"
      )
        return saved;
    }
    return "1:1";
  });

  // ── Brand profile state ──────────────────────────────────────────────
  const { brandName: brandId } = useParams<{ brandName: string }>();
  const [profileId, setProfileId] = useState<string | null>(
    styleIdFromUrl ?? null,
  );
  const [useProfile, setUseProfile] = useState(!!styleIdFromUrl);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [brandUuid, setBrandUuid] = useState<string | null>(null);

  // ── Pack 결제 모달 state ──────────────────────────────────────────────
  type PackModalState = "none" | "insufficient" | "purchase";
  const [packModal, setPackModal] = useState<PackModalState>("none");
  const [insufficientReason, setInsufficientReason] =
    useState<PackErrorCode>("INSUFFICIENT_PACK");
  // 결제 성공 후 자동 재시도 callback. 모달 닫으면 null.
  const pendingRetryRef = useRef<(() => void) | null>(null);
  // 결제→재시도→또 402 피드백 루프 방지용 카운터. 모달 close 또는 성공 시 0 리셋.
  const retryAttemptsRef = useRef<number>(0);
  const MAX_RETRY_ATTEMPTS = 2;

  // ── Job result state ──────────────────────────────────────────────────
  const [activeJobId, setActiveJobId] = useState<string | null>(jobIdFromUrl);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [geminiImageUrl, setGeminiImageUrl] = useState<string | null>(null);
  const [grokImageUrl, setGrokImageUrl] = useState<string | null>(null);
  const [gptImageUrl, setGptImageUrl] = useState<string | null>(null);
  const [step1ImageUrl, setStep1ImageUrl] = useState<string | null>(null);
  const [lightboxItem, setLightboxItem] = useState<{
    url: string;
    filename?: string | null;
    assetId?: string | null;
    styleId?: string | null;
    styleName?: string | null;
    styleType?: string | null;
    styleImageUrl?: string | null;
    autoStyleName?: string | null;
    modelId?: string | null;
    modelName?: string | null;
    modelImageUrl?: string | null;
    productId?: string | null;
    productName?: string | null;
    productImageUrl?: string | null;
  } | null>(null);
  // 채널 서식 다운로드 모달 — open 시 대상 render assetId를 보관
  const [channelModalAssetId, setChannelModalAssetId] = useState<string | null>(
    null,
  );
  const [generatedHistory, setGeneratedHistory] = useState<
    (
      | {
          url: string;
          filename: string;
          jobId?: string;
          assetId?: string | null;
          styleId?: string | null;
          styleType?: string | null;
          styleImageUrl?: string | null;
          autoStyleId?: string;
          autoStyleName?: string;
          styleName?: string | null;
          modelId?: string | null;
          modelName?: string | null;
          modelImageUrl?: string | null;
          productId?: string | null;
          productName?: string | null;
          productImageUrl?: string | null;
        }
      | {
          loading: true;
          jobId: string;
          autoStyleId?: string;
          autoStyleName?: string;
          modelName?: string | null;
          modelImageUrl?: string | null;
          productName?: string | null;
          productImageUrl?: string | null;
        }
    )[]
  >([]);
  const [autoStyleMode, setAutoStyleMode] = useState(!styleIdFromUrl);
  const [savingStyleId, setSavingStyleId] = useState<string | null>(null);
  const [savedStyleIds, setSavedStyleIds] = useState<Set<string>>(new Set());
  const [saveStyleError, setSaveStyleError] = useState<string | null>(null);
  const [saveStyleErrorId, setSaveStyleErrorId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoIntervalRefs = useRef<ReturnType<typeof setInterval>[]>([]);
  const historyRestoredRef = useRef(false);
  const [historyRestored, setHistoryRestored] = useState(false);
  const pendingJobsRestoredRef = useRef(false);
  const selectionRestoredRef = useRef(false);
  const generatedHistoryRef = useRef<typeof generatedHistory>([]);
  const brandIdRef = useRef(brandId);
  const productFileRef = useRef<HTMLInputElement>(null);
  const styleFileRef = useRef<HTMLInputElement>(null);

  // ── Brand products ────────────────────────────────────────────────────
  const [brandProducts, setBrandProducts] = useState<BrandProduct[]>([]);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);

  // ── Dropdown search ───────────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [styleSearch, setStyleSearch] = useState("");

  // ── Brand styles ──────────────────────────────────────────────────────
  // brandStyles  : 사용자가 직접 만든 brand 자체 스타일 ("내 스타일" 탭).
  // globalStyles : /api/templates 응답 (is_template=true). "발견" 탭에서 노출.
  //                별도의 저장 절차 없이 모든 brand 가 직접 사용 가능.
  const [brandStyles, setBrandStyles] = useState<Style[]>([]);
  const [globalStyles, setGlobalStyles] = useState<Style[]>([]);
  const [styleTab, setStyleTab] = useState<"discover" | "my-studios">(
    "discover",
  );
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false);
  const [aspectRatioDropdownOpen, setAspectRatioDropdownOpen] = useState(false);
  const [batchCount, setBatchCount] = useState<BatchCount>(() => {
    if (typeof window !== "undefined") {
      const saved = Number(localStorage.getItem("studio_batch_count"));
      if (BATCH_COUNTS.includes(saved as BatchCount))
        return saved as BatchCount;
    }
    return 4;
  });
  const [batchCountDropdownOpen, setBatchCountDropdownOpen] = useState(false);

  // ── 랜딩 프롬프트 주입 (마운트 시 1회) ────────────────────────────────
  // 랜딩 페이지의 플로팅 바에서 입력한 프롬프트를 회원가입 후 스튜디오로 이어받음.
  // 1회성이므로 읽은 뒤 즉시 제거한다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem("landing_prompt");
      if (saved && saved.trim()) {
        setPromptText(saved);
        window.localStorage.removeItem("landing_prompt");
      }
    } catch {
      // storage 접근 실패는 무시.
    }
  }, []);

  // ── 스타일·모델·제품 선택 상태 복원 (마운트 시 1회) ──────────────────
  // URL params가 있으면 URL params 우선. brandId 확정 후 한 번만 실행.
  useEffect(() => {
    if (!brandId || selectionRestoredRef.current) return;
    selectionRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(`studio_selection_${brandId}`);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        profileId?: string | null;
        useProfile?: boolean;
        autoStyleMode?: boolean;
        modelId?: string | null;
        productId?: string | null;
        promptText?: string | null;
      };
      if (!styleIdFromUrl && saved.profileId != null) {
        setProfileId(saved.profileId);
        setUseProfile(saved.useProfile ?? true);
        setAutoStyleMode(saved.autoStyleMode ?? false);
      }
      if (!modelIdFromUrl && saved.modelId) {
        setSelectedId(saved.modelId);
      }
      if (!productIdFromUrl && saved.productId) {
        setSelectedProductId(saved.productId);
      }
      if (saved.promptText) {
        setPromptText(saved.promptText);
      }
    } catch {
      // storage 접근 실패는 무시.
    }
  }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── brandIdRef 동기화 ─────────────────────────────────────────────────
  useEffect(() => {
    brandIdRef.current = brandId;
  }, [brandId]);

  // ── generatedHistoryRef 동기화 ───────────────────────────────────────
  // pendingJob 복원 등 렌더 외부 콜백에서 최신 generatedHistory를 참조하기 위해 사용.
  useEffect(() => {
    generatedHistoryRef.current = generatedHistory;
  }, [generatedHistory]);

  // ── 스타일·모델·제품 선택 상태 저장 ──────────────────────────────────
  // 선택 상태가 바뀔 때마다 localStorage에 저장하여 재방문 시 복원에 사용.
  useEffect(() => {
    if (!brandId) return;
    try {
      localStorage.setItem(
        `studio_selection_${brandId}`,
        JSON.stringify({
          profileId,
          useProfile,
          autoStyleMode,
          modelId: selectedId,
          productId: selectedProductId,
          promptText,
        }),
      );
    } catch {
      // storage 접근 실패는 무시.
    }
  }, [
    brandId,
    profileId,
    useProfile,
    autoStyleMode,
    selectedId,
    selectedProductId,
    promptText,
  ]);

  // ── Load generatedHistory from DB (/api/renders) ─────────────────────
  // brandUuid 세팅 후 1회만 실행. completed 아이템은 DB가 single source of truth.
  // loading 아이템(진행 중 job)은 클라이언트 상태로만 존재하므로 중복 방지 위해 제외.
  useEffect(() => {
    if (!brandUuid) return;
    let cancelled = false;
    (async () => {
      // async 함수 내부 진입 직후에 플래그를 세팅해야
      // deps 재실행(예: fetchWithAuth identity 변경)으로 인한 중복 실행을 방지한다.
      if (historyRestoredRef.current) return;
      historyRestoredRef.current = true;
      try {
        const r = await fetchWithAuth(`/api/renders?brandId=${brandUuid}`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const d = await r.json();
        const renders = Array.isArray(d?.renders) ? d.renders : [];
        if (cancelled) return;
        const clearedAt = localStorage.getItem(
          clearedAtKey(brandIdRef.current),
        );
        const rawRenders = clearedAt
          ? renders.filter(
              (a: { createdAt: string }) => a.createdAt > clearedAt,
            )
          : renders;
        setGeneratedHistory((prev) => {
          // 이미 loading 중인 jobId는 제외 (중복 방지)
          const loadingJobIds = new Set(
            prev
              .filter((i) => "loading" in i)
              .map((i) => (i as { jobId: string }).jobId),
          );
          // 동일 jobId의 여러 assets(kind별) 중복 방지: 첫 번째만 채택.
          // API는 created_at DESC 정렬이므로 가장 최신 asset이 우선된다.
          const seenJobIds = new Set<string>();
          const completedFromDb = rawRenders
            .filter(
              (asset: { jobId?: string }) =>
                asset.jobId && !loadingJobIds.has(asset.jobId),
            )
            .filter((asset: { jobId: string }) => {
              if (seenJobIds.has(asset.jobId)) return false;
              seenJobIds.add(asset.jobId);
              return true;
            })
            .map(
              (asset: {
                id?: string | null;
                jobId: string;
                imageUrl: string;
                styleId?: string | null;
                styleType?: string | null;
                styleName: string | null;
                styleImageUrl?: string | null;
                modelId?: string | null;
                modelName: string | null;
                modelImageUrl: string | null;
                productId?: string | null;
                productName: string | null;
                productImageUrl: string | null;
              }) => ({
                url: asset.imageUrl,
                filename: `render_${asset.jobId}.png`,
                jobId: asset.jobId,
                // render asset id — 채널 서식 다운로드 API에서 필수로 사용
                assetId: asset.id ?? null,
                styleId: asset.styleId ?? null,
                styleType: asset.styleType ?? null,
                styleImageUrl: asset.styleImageUrl ?? null,
                styleName: asset.styleName,
                modelId: asset.modelId ?? null,
                modelName: asset.modelName,
                modelImageUrl: asset.modelImageUrl,
                productId: asset.productId ?? null,
                productName: asset.productName,
                productImageUrl: asset.productImageUrl,
              }),
            );
          const loadingItems = prev.filter((i) => "loading" in i);
          // 클라이언트에 이미 completed로 있는 아이템은 DB 응답보다 우선.
          // (폴러 완료 콜백이 DB 로드보다 먼저 도착한 아이템이 유실되지 않도록)
          const clientCompletedByJobId = new Map(
            prev
              .filter(
                (i) => !("loading" in i) && (i as { jobId?: string }).jobId,
              )
              .map((i) => [(i as { jobId: string }).jobId, i] as const),
          );
          const merged = completedFromDb.map(
            (dbItem: { jobId: string }) =>
              clientCompletedByJobId.get(dbItem.jobId) ?? dbItem,
          );
          const dbJobIds = new Set(
            completedFromDb.map((i: { jobId: string }) => i.jobId),
          );
          const clientOnly = [...clientCompletedByJobId.values()].filter(
            (i) => !dbJobIds.has((i as { jobId: string }).jobId),
          );
          // completed 아이템: 오래된 순(오름차순) — DB가 DESC로 주므로 reverse
          // loading 아이템은 항상 맨 아래(최신 위치)
          const sortedCompleted = [...merged, ...clientOnly].reverse();
          return [...sortedCompleted, ...loadingItems];
        });
      } catch {
        // 실패 시 조용히 무시
      } finally {
        if (!cancelled) setHistoryRestored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandUuid, fetchWithAuth]);

  // ── Auth redirect ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [authLoading, user, router]);

  // ── Load brand profile ────────────────────────────────────────────────
  useEffect(() => {
    if (!brandId || !user) return;
    fetchWithAuth(`/api/brands/${brandId}`)
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        const b = d.brand ?? d;
        setBrandName(b.name ?? null);
        setBrandUuid(b.id ?? null);
        setProfileId((prev) => prev ?? b.activeProfileId ?? null);
      })
      .catch(() => {});
  }, [brandId, user, fetchWithAuth]);

  // ── Load brand products ───────────────────────────────────────────────
  useEffect(() => {
    if (!user || !brandId) return;
    fetchWithAuth(`/api/brands/${brandId}/products`)
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        const loaded: BrandProduct[] = d.products ?? [];
        setBrandProducts(loaded);
        if (productIdFromUrl) {
          const match = loaded.find((p) => p.id === productIdFromUrl);
          if (match) {
            setSelectedProductId(match.id);
            const heroUrl =
              match.images.find((i) => i.role === "hero")?.url ??
              match.image_url;
            if (heroUrl) {
              fetch(`/api/image-proxy?url=${encodeURIComponent(heroUrl)}`)
                .then((res) => res.blob())
                .then((blob) => {
                  setProductImage(
                    new File([blob], `${match.name}.png`, {
                      type: blob.type || "image/png",
                    }),
                  );
                })
                .catch(() => {});
            }
          }
        }
      })
      .catch(() => {});
  }, [brandId, user, fetchWithAuth, productIdFromUrl]);

  // ── 제품 이미지 복원 (selectedProductId만 복원된 경우 이미지 보완) ────────
  // localStorage 복원 시 productImage가 없는 상태에서 selectedProductId만 세팅된 경우.
  // brandProducts 로드 완료 후 일치하는 제품의 이미지를 자동으로 fetch한다.
  useEffect(() => {
    if (!selectedProductId || !brandProducts.length || productImage) return;
    const match = brandProducts.find((p) => p.id === selectedProductId);
    if (!match) return;
    const heroUrl =
      match.images?.find(
        (i: { role: string; url: string }) => i.role === "hero",
      )?.url ?? match.image_url;
    if (!heroUrl) return;
    fetch(`/api/image-proxy?url=${encodeURIComponent(heroUrl)}`)
      .then((res) => res.blob())
      .then((blob) =>
        setProductImage(
          new File([blob], `${match.name}.png`, {
            type: blob.type || "image/png",
          }),
        ),
      )
      .catch(() => {});
  }, [selectedProductId, brandProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load brand styles ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !brandId) return;
    fetchWithAuth(`/api/brands/${brandId}/styles`)
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        const styles = d.styles ?? [];
        setBrandStyles(styles);
      })
      .catch(() => {});
  }, [brandId, user, fetchWithAuth]);

  // ── Load global templates (for "발견" tab) ─────────────────────────────
  // /api/templates 는 인증 불필요. 모든 brand 에서 동일한 글로벌 풀을 받는다.
  // brand 와 무관하게 마운트 시 1회만 로드.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => {
        if (cancelled) return;
        setGlobalStyles((d.templates ?? []) as Style[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load models ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !brandId) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchWithAuth(`/api/personas?brandId=${brandId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          const loaded: Model[] = (data.models ?? []).filter(
            (p: Model) => p.face_image_url,
          );
          setModels(loaded);
          if (modelIdFromUrl && loaded.some((m) => m.id === modelIdFromUrl)) {
            setSelectedId(modelIdFromUrl);
          }
        }
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, brandId, fetchWithAuth, modelIdFromUrl]);

  // ── Poll job status ───────────────────────────────────────────────────
  const jobDoneRef = useRef(false);
  useEffect(() => {
    if (!activeJobId) return;
    jobDoneRef.current = false;
    let iid: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (jobDoneRef.current) return;
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? "";

        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`/api/jobs/${activeJobId}?_t=${Date.now()}`, {
          headers,
          cache: "no-store",
        });

        if (!res.ok) {
          console.warn(
            `[RenderPoll] /api/jobs/${activeJobId} returned ${res.status}`,
          );
          return;
        }

        const data = (await res.json()) as JobResult;
        const job = data.job;
        if (!job) return;

        setJobStatus(job.status);
        setJobProgress(job.progress ?? 0);

        if (job.status === "succeeded") {
          jobDoneRef.current = true;
          if (iid) {
            clearInterval(iid);
            iid = null;
          }
          setJobError(null);
          setResultImageUrl(data.renderResultUrl ?? null);
          setGeminiImageUrl(data.renderGeminiUrl ?? null);
          setGrokImageUrl(data.renderGrokUrl ?? null);
          setGptImageUrl(data.renderGptUrl ?? null);
          setStep1ImageUrl(data.renderStep1Url ?? null);
          removePendingJob(brandIdRef.current, activeJobId!);
          if (data.renderResultUrl) {
            setGeneratedHistory((prev) => {
              // activeJobId 에 정확히 대응되는 loading 아이템만 교체 (auto 모드의 동시 다중 폴링 보호)
              const idx = prev.findIndex(
                (item) => "loading" in item && item.jobId === activeJobId,
              );
              if (idx === -1) {
                // 이미 완료 항목으로 존재하면 중복 추가 방지 (새로고침 시 URL jobId 재폴링)
                const alreadyExists = prev.some(
                  (item) => !("loading" in item) && item.jobId === activeJobId,
                );
                if (alreadyExists) return prev;
                return [
                  ...prev,
                  {
                    url: data.renderResultUrl!,
                    filename: `render_result_${Date.now()}.png`,
                    jobId: activeJobId ?? undefined,
                  },
                ];
              }
              const loadingItem = prev[idx];
              const next = [...prev];
              next[idx] = {
                url: data.renderResultUrl!,
                filename: `render_result_${Date.now()}.png`,
                jobId: activeJobId ?? undefined,
                modelName:
                  "modelName" in loadingItem
                    ? loadingItem.modelName
                    : undefined,
                modelImageUrl:
                  "modelImageUrl" in loadingItem
                    ? loadingItem.modelImageUrl
                    : null,
                productName:
                  "productName" in loadingItem
                    ? loadingItem.productName
                    : undefined,
                productImageUrl:
                  "productImageUrl" in loadingItem
                    ? loadingItem.productImageUrl
                    : null,
              };
              return next;
            });
          }

          // GPT Image 2 결과가 별도로 존재하면 history에 추가
          if (data.renderGptUrl && data.renderGptUrl !== data.renderResultUrl) {
            setGeneratedHistory((prev) => {
              const alreadyExists = prev.some(
                (item) =>
                  !("loading" in item) && item.url === data.renderGptUrl,
              );
              if (alreadyExists) return prev;
              return [
                ...prev,
                {
                  url: data.renderGptUrl!,
                  filename: `render_gpt_${Date.now()}.png`,
                  jobId: activeJobId ?? undefined,
                },
              ];
            });
          }

          if (data.renderResultUrl) {
            // asset 정보 비동기 fetch (assets 테이블 → API) — 실패 시 조용히 무시
            const fetchJobId = activeJobId;
            const fetchBrandId = brandIdRef.current;
            if (fetchBrandId && fetchJobId) {
              (async () => {
                try {
                  const { supabase } = await import("@/lib/supabaseClient");
                  const { data: sessionData } =
                    await supabase.auth.getSession();
                  const token = sessionData.session?.access_token ?? "";
                  const headers: Record<string, string> = {};
                  if (token) headers["Authorization"] = `Bearer ${token}`;
                  const r = await fetch(
                    `/api/renders?brandId=${fetchBrandId}&jobId=${fetchJobId}`,
                    { headers, cache: "no-store" },
                  );
                  if (!r.ok) return;
                  const d = await r.json();
                  const asset = d?.renders?.[0];
                  if (!asset) return;
                  setGeneratedHistory((prev) => {
                    const idx = prev.findIndex(
                      (item) =>
                        !("loading" in item) && item.jobId === fetchJobId,
                    );
                    if (idx === -1) return prev;
                    const next = [...prev];
                    next[idx] = {
                      ...(next[idx] as any),
                      styleId: asset.styleId ?? null,
                      styleName: asset.styleName ?? null,
                      styleImageUrl: asset.styleImageUrl ?? null,
                      modelId: asset.modelId ?? null,
                      modelName: asset.modelName ?? null,
                      modelImageUrl: asset.modelImageUrl ?? null,
                      productId: asset.productId ?? null,
                      productName: asset.productName ?? null,
                      productImageUrl: asset.productImageUrl ?? null,
                    };
                    return next;
                  });
                } catch {}
              })();
            }
          }
        } else if (job.status === "failed") {
          jobDoneRef.current = true;
          if (iid) {
            clearInterval(iid);
            iid = null;
          }
          setJobError(job.error ?? "Render failed");
          setGeneratedHistory((prev) =>
            prev.filter(
              (item) => !("loading" in item) || item.jobId !== activeJobId,
            ),
          );
          removePendingJob(brandIdRef.current, activeJobId!);
        }
      } catch (e) {
        console.error("[RenderPoll] error:", e);
      }
    };

    poll();
    iid = setInterval(poll, 3000);
    pollRef.current = iid;
    return () => {
      if (iid) clearInterval(iid);
    };
  }, [activeJobId]);

  // Auto 모드 폴러 언마운트 cleanup
  useEffect(() => {
    return () => {
      autoIntervalRefs.current.forEach(clearInterval);
    };
  }, []);

  // ── Example image preview + drag ────────────────────────────────────────
  const [examplePreview, setExamplePreview] = useState<string | null>(null);
  const [exampleDragOver, setExampleDragOver] = useState(false);
  const exampleInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!exampleImage) {
      setExamplePreview(null);
      return;
    }
    const url = URL.createObjectURL(exampleImage);
    setExamplePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [exampleImage]);

  // ── Auto mode: 단일 create-job 호출 헬퍼 ────────────────────────────
  // 기존 handleSubmit 의 pipelineMode === "studio" 분기와 동일한 규칙으로
  // create-job 요청을 수행한다. auto 모드에서는 각 style별로 이 헬퍼를 호출한다.
  const createStudioJobForStyle = useCallback(
    async (styleIdForJob: string): Promise<string | null> => {
      let res: Response;
      if (selectedId && productImage) {
        const fd = new FormData();
        fd.append("pipeline", "render_product_model");
        fd.append("influencer_id", selectedId);
        fd.append("product_image", productImage);
        if (promptText.trim()) fd.append("prompt", promptText.trim());
        fd.append("style_id", styleIdForJob);
        if (brandUuid) fd.append("brand_id", brandUuid);
        fd.append("aspect_ratio", aspectRatio);
        if (selectedProductId) fd.append("product_id", selectedProductId);
        res = await fetchWithAuth("/api/render/create-job", {
          method: "POST",
          body: fd,
        });
      } else if (selectedId && !productImage) {
        res = await fetchWithAuth("/api/render/create-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            influencer_id: selectedId,
            prompt: promptText.trim(),
            pipeline: "render_prompt",
            realism,
            aspect_ratio: aspectRatio,
            style_id: styleIdForJob,
            ...(brandUuid ? { brand_id: brandUuid } : {}),
          }),
        });
      } else if (productImage) {
        const fd = new FormData();
        fd.append("pipeline", "render_product_solo");
        fd.append("object_image", productImage);
        if (promptText.trim()) fd.append("prompt", promptText.trim());
        fd.append("style_id", styleIdForJob);
        if (brandUuid) fd.append("brand_id", brandUuid);
        fd.append("aspect_ratio", aspectRatio);
        if (selectedProductId) fd.append("product_id", selectedProductId);
        res = await fetchWithAuth("/api/render/create-job", {
          method: "POST",
          body: fd,
        });
      } else {
        return null;
      }
      if (!res.ok) {
        const errBody = await res
          .json()
          .catch(() => ({} as { error?: string; code?: string }));
        const packErr = isPackOrDailyLimitError(res.status, errBody);
        if (packErr) {
          setInsufficientReason(packErr);
          // 자동 모드는 호출 컨텍스트가 복잡하므로 재시도 없이 모달만 오픈
          pendingRetryRef.current = null;
          setPackModal("insufficient");
        }
        return null;
      }
      const data = await res.json();
      return (data.jobId as string) ?? null;
    },
    [
      selectedId,
      productImage,
      promptText,
      realism,
      aspectRatio,
      brandUuid,
      fetchWithAuth,
      selectedProductId,
    ],
  );

  // Auto 모드 전용 독립 폴러. generatedHistory 의 loading 아이템을 jobId 로 찾아 교체.
  const pollAutoJob = useCallback(
    (
      jobId: string,
      autoStyleId: string,
      autoStyleName: string,
      brandId: string,
    ) => {
      let stopped = false;
      const iid: ReturnType<typeof setInterval> = setInterval(async () => {
        if (stopped) return;
        try {
          const { supabase } = await import("@/lib/supabaseClient");
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token ?? "";
          const headers: Record<string, string> = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;
          const res = await fetch(`/api/jobs/${jobId}?_t=${Date.now()}`, {
            headers,
            cache: "no-store",
          });
          if (!res.ok) return;
          const data = (await res.json()) as JobResult;
          const job = data.job;
          if (!job) return;
          if (job.status === "succeeded") {
            stopped = true;
            clearInterval(iid);
            removePendingJob(brandIdRef.current, jobId);
            if (data.renderResultUrl) {
              // 첫 번째 생성 이미지를 auto 스타일의 대표 이미지로 저장 (서버에서 장기 서명 URL 생성)
              if (brandId) {
                fetch(`/api/brands/${brandId}/styles/auto/backfill`, {
                  method: "POST",
                  headers: { ...headers, "Content-Type": "application/json" },
                  body: JSON.stringify({ styleIds: [autoStyleId] }),
                }).catch(() => {});
              }
              setGeneratedHistory((prev) => {
                const idx = prev.findIndex(
                  (item) => "loading" in item && item.jobId === jobId,
                );
                const source = idx !== -1 ? prev[idx] : undefined;
                const replacement = {
                  url: data.renderResultUrl!,
                  filename: `render_result_${Date.now()}.png`,
                  jobId,
                  autoStyleId,
                  autoStyleName,
                  modelName:
                    source && "modelName" in source
                      ? source.modelName
                      : undefined,
                  modelImageUrl:
                    source && "modelImageUrl" in source
                      ? source.modelImageUrl
                      : null,
                  productName:
                    source && "productName" in source
                      ? source.productName
                      : undefined,
                  productImageUrl:
                    source && "productImageUrl" in source
                      ? source.productImageUrl
                      : null,
                };
                if (idx === -1) {
                  const alreadyExists = prev.some(
                    (item) => !("loading" in item) && item.jobId === jobId,
                  );
                  if (alreadyExists) return prev;
                  return [...prev, replacement];
                }
                const next = [...prev];
                next[idx] = replacement;
                return next;
              });
              if (
                data.renderGptUrl &&
                data.renderGptUrl !== data.renderResultUrl
              ) {
                setGeneratedHistory((prev) => {
                  const alreadyExists = prev.some(
                    (item) =>
                      !("loading" in item) && item.url === data.renderGptUrl,
                  );
                  if (alreadyExists) return prev;
                  return [
                    ...prev,
                    {
                      url: data.renderGptUrl!,
                      filename: `render_gpt_${Date.now()}.png`,
                      jobId,
                    },
                  ];
                });
              }
            }
          } else if (job.status === "failed") {
            stopped = true;
            clearInterval(iid);
            setGeneratedHistory((prev) =>
              prev.filter(
                (item) => !("loading" in item) || item.jobId !== jobId,
              ),
            );
            removePendingJob(brandIdRef.current, jobId);
          }
        } catch (e) {
          console.error("[pollAutoJob] error:", e);
        }
      }, 3000);
      autoIntervalRefs.current.push(iid);
    },
    [],
  );

  const pollBatchJob = useCallback((jobId: string) => {
    let stopped = false;
    const iid: ReturnType<typeof setInterval> = setInterval(async () => {
      if (stopped) return;
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token ?? "";
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`/api/jobs/${jobId}?_t=${Date.now()}`, {
          headers,
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as JobResult;
        const job = data.job;
        if (!job) return;
        if (job.status === "succeeded") {
          stopped = true;
          clearInterval(iid);
          removePendingJob(brandIdRef.current, jobId);
          if (data.renderResultUrl) {
            setGeneratedHistory((prev) => {
              const idx = prev.findIndex(
                (item) => "loading" in item && item.jobId === jobId,
              );
              const source = idx !== -1 ? prev[idx] : undefined;
              const replacement = {
                url: data.renderResultUrl!,
                filename: `render_result_${Date.now()}.png`,
                jobId,
                modelName:
                  source && "modelName" in source
                    ? source.modelName
                    : undefined,
                modelImageUrl:
                  source && "modelImageUrl" in source
                    ? source.modelImageUrl
                    : null,
                productName:
                  source && "productName" in source
                    ? source.productName
                    : undefined,
                productImageUrl:
                  source && "productImageUrl" in source
                    ? source.productImageUrl
                    : null,
              };
              if (idx === -1) {
                const alreadyExists = prev.some(
                  (item) => !("loading" in item) && item.jobId === jobId,
                );
                if (alreadyExists) return prev;
                return [...prev, replacement];
              }
              const next = [...prev];
              next[idx] = replacement;
              return next;
            });

            // asset 정보 비동기 fetch (assets 테이블 → API) — 실패 시 조용히 무시
            const fetchBrandId = brandIdRef.current;
            if (fetchBrandId && jobId) {
              (async () => {
                try {
                  const { supabase } = await import("@/lib/supabaseClient");
                  const { data: sessionData } =
                    await supabase.auth.getSession();
                  const token = sessionData.session?.access_token ?? "";
                  const assetHeaders: Record<string, string> = {};
                  if (token) assetHeaders["Authorization"] = `Bearer ${token}`;
                  const r = await fetch(
                    `/api/renders?brandId=${fetchBrandId}&jobId=${jobId}`,
                    { headers: assetHeaders, cache: "no-store" },
                  );
                  if (!r.ok) return;
                  const d = await r.json();
                  const asset = d?.renders?.[0];
                  if (!asset) return;
                  setGeneratedHistory((prev) => {
                    const idx = prev.findIndex(
                      (item) => !("loading" in item) && item.jobId === jobId,
                    );
                    if (idx === -1) return prev;
                    const next = [...prev];
                    next[idx] = {
                      ...(next[idx] as any),
                      styleId: asset.styleId ?? null,
                      styleName: asset.styleName ?? null,
                      styleImageUrl: asset.styleImageUrl ?? null,
                      modelId: asset.modelId ?? null,
                      modelName: asset.modelName ?? null,
                      modelImageUrl: asset.modelImageUrl ?? null,
                      productId: asset.productId ?? null,
                      productName: asset.productName ?? null,
                      productImageUrl: asset.productImageUrl ?? null,
                    };
                    return next;
                  });
                } catch {}
              })();
            }
            if (
              data.renderGptUrl &&
              data.renderGptUrl !== data.renderResultUrl
            ) {
              setGeneratedHistory((prev) => {
                const alreadyExists = prev.some(
                  (item) =>
                    !("loading" in item) && item.url === data.renderGptUrl,
                );
                if (alreadyExists) return prev;
                return [
                  ...prev,
                  {
                    url: data.renderGptUrl!,
                    filename: `render_gpt_${Date.now()}.png`,
                    jobId,
                  },
                ];
              });
            }
          }
        } else if (job.status === "failed") {
          stopped = true;
          clearInterval(iid);
          setGeneratedHistory((prev) =>
            prev.filter((item) => !("loading" in item) || item.jobId !== jobId),
          );
          removePendingJob(brandIdRef.current, jobId);
        }
      } catch (e) {
        console.error("[pollBatchJob] error:", e);
      }
    }, 3000);
    autoIntervalRefs.current.push(iid);
  }, []);

  // ── Restore pending jobs from localStorage (마운트 시 1회) ───────────
  // pollBatchJob / pollAutoJob 선언 이후에 배치해야 TypeScript가 정방향 참조 오류를 내지 않음
  useEffect(() => {
    if (!brandId || !historyRestored || pendingJobsRestoredRef.current) return;
    pendingJobsRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(pendingJobsKey(brandId));
      if (!raw) return;
      const jobs = JSON.parse(raw) as PendingJob[];
      if (jobs.length === 0) return;

      // loading 아이템 추가 (이미 completed history에 있는 jobId는 제외)
      // generatedHistoryRef로 현재 completed 아이템의 jobId를 파악해 폴링 재개 조건으로도 재사용.
      // (localStorage 저장 로직이 제거되었으므로 DB 로드가 완료되어 ref에 반영된 상태를 기준으로 판단)
      const existingCompletedJobIds = new Set(
        generatedHistoryRef.current
          .filter((i) => !("loading" in i) && (i as { jobId?: string }).jobId)
          .map((i) => (i as { jobId: string }).jobId),
      );

      setGeneratedHistory((prev) => {
        const existingJobIds = new Set(
          prev
            .map((i) => ("jobId" in i ? i.jobId : undefined))
            .filter((id): id is string => !!id),
        );
        const newLoading = jobs
          .filter((j) => !existingJobIds.has(j.jobId))
          .map((j) =>
            j.type === "auto"
              ? {
                  loading: true as const,
                  jobId: j.jobId,
                  autoStyleId: j.autoStyleId,
                  autoStyleName: j.autoStyleName,
                }
              : { loading: true as const, jobId: j.jobId },
          );
        if (newLoading.length === 0) return prev;
        return [...prev, ...newLoading];
      });

      // 폴링 재개 (이미 completed에 있는 jobId는 건너뜀)
      jobs.forEach((j) => {
        if (existingCompletedJobIds.has(j.jobId)) {
          removePendingJob(brandId, j.jobId);
          return;
        }
        if (j.type === "single") {
          setActiveJobId(j.jobId);
        } else if (j.type === "batch") {
          pollBatchJob(j.jobId);
        } else if (j.type === "auto") {
          pollAutoJob(j.jobId, j.autoStyleId, j.autoStyleName, j.brandUuid);
        }
      });
    } catch {}
  }, [brandId, historyRestored, pollBatchJob, pollAutoJob]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto → custom 승격 저장. explore 템플릿 저장(brand_style_saves)과 무관하며,
  // AI가 자동 생성한 스타일을 브랜드 자체 스타일로 영구 보존하는 기능입니다.
  const handleSaveStyle = useCallback(
    async (autoStyleId: string, autoStyleName: string) => {
      if (!brandUuid) return;
      setSavingStyleId(autoStyleId);
      // 새로운 저장 시도마다 직전 에러 초기화
      setSaveStyleError(null);
      setSaveStyleErrorId(null);
      try {
        const res = await fetchWithAuth(
          `/api/brands/${brandUuid}/styles/${autoStyleId}/save`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: autoStyleName }),
          },
        );
        if (res.ok) {
          setSaveStyleError(null);
          setSavedStyleIds((prev) => {
            const next = new Set(prev);
            next.add(autoStyleId);
            return next;
          });
          // 새로 저장된 스타일을 스타일 목록에 반영 (선택 가능하도록)
          try {
            const listRes = await fetchWithAuth(
              `/api/brands/${brandUuid}/styles`,
            );
            if (listRes.ok) {
              const d = await listRes.json();
              setBrandStyles(d.styles ?? []);
            }
          } catch {}
        } else {
          const errData = await res.json().catch(() => ({}));
          const msg =
            (errData as { error?: string }).error ??
            "스타일 저장에 실패했습니다.";
          setSaveStyleError(msg);
          setSaveStyleErrorId(autoStyleId);
        }
      } finally {
        setSavingStyleId(null);
      }
    },
    [brandUuid, fetchWithAuth],
  );

  const handleDownload = useCallback((url: string, filename: string) => {
    const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    const a = document.createElement("a");
    a.href = proxyUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    // ── Auto Style Mode ─────────────────────────────────────────────────
    // AI가 2종 스타일을 즉석 생성 → 각 스타일로 병렬 렌더 job 2개 생성.
    if (autoStyleMode && pipelineMode === "studio") {
      if (!brandUuid) {
        setFormError("브랜드 정보가 없습니다.");
        return;
      }
      // 최소 입력 검증 (studio 모드 규칙 재사용)
      if (!selectedId && !productImage) {
        setFormError("제품 이미지 또는 모델을 선택하세요.");
        return;
      }
      if (selectedId && !productImage && !promptText.trim()) {
        setFormError("제품 이미지 또는 프롬프트를 입력하세요.");
        return;
      }

      setSubmitting(true);
      setFormError(null);
      try {
        const selectedProduct = selectedProductId
          ? brandProducts.find((p) => p.id === selectedProductId)
          : null;
        const selectedModel = selectedId
          ? models.find((m) => m.id === selectedId)
          : null;

        const autoRes = await fetchWithAuth(
          `/api/brands/${brandUuid}/styles/auto`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: promptText.trim(),
              productName: selectedProduct?.name,
              productCategory: selectedProduct?.product_category,
              modelSelections: selectedModel?.selections,
            }),
          },
        );
        if (!autoRes.ok) {
          setFormError("자동 스타일 생성에 실패했습니다.");
          return;
        }
        const { styleA, styleB } = (await autoRes.json()) as {
          styleA: Style;
          styleB: Style;
        };

        // 각 스타일로 병렬 job 생성
        const [jobAId, jobBId] = await Promise.all([
          createStudioJobForStyle(styleA.id),
          createStudioJobForStyle(styleB.id),
        ]);

        if (!jobAId && !jobBId) {
          setFormError("렌더 job 생성에 실패했습니다.");
          return;
        }

        // 부분 실패: job 생성 실패한 쪽의 auto 스타일은 archive (고아 레코드 방지)
        if (!jobAId && brandUuid) {
          fetchWithAuth(`/api/brands/${brandUuid}/styles/${styleA.id}`, {
            method: "DELETE",
          }).catch(() => {});
        }
        if (!jobBId && brandUuid) {
          fetchWithAuth(`/api/brands/${brandUuid}/styles/${styleB.id}`, {
            method: "DELETE",
          }).catch(() => {});
        }

        // 로딩 플레이스홀더 추가
        const autoProductImg =
          selectedProduct?.images?.find((i) => i.role === "hero")?.url ??
          selectedProduct?.images?.[0]?.url ??
          selectedProduct?.image_url ??
          null;
        setGeneratedHistory((prev) => {
          const next = [...prev];
          if (jobAId)
            next.push({
              loading: true,
              jobId: jobAId,
              autoStyleId: styleA.id,
              autoStyleName: styleA.name,
              modelName: selectedModel?.name,
              modelImageUrl: selectedModel?.face_image_url ?? null,
              productName: selectedProduct?.name,
              productImageUrl: autoProductImg,
            });
          if (jobBId)
            next.push({
              loading: true,
              jobId: jobBId,
              autoStyleId: styleB.id,
              autoStyleName: styleB.name,
              modelName: selectedModel?.name,
              modelImageUrl: selectedModel?.face_image_url ?? null,
              productName: selectedProduct?.name,
              productImageUrl: autoProductImg,
            });
          return next;
        });

        if (jobAId && brandUuid) {
          savePendingJob(brandId, {
            jobId: jobAId,
            type: "auto",
            autoStyleId: styleA.id,
            autoStyleName: styleA.name,
            brandUuid,
          });
        }
        if (jobBId && brandUuid) {
          savePendingJob(brandId, {
            jobId: jobBId,
            type: "auto",
            autoStyleId: styleB.id,
            autoStyleName: styleB.name,
            brandUuid,
          });
        }

        if (jobAId) {
          addJob({ id: jobAId, kind: "render_outfit", name: `Auto A` });
          pollAutoJob(jobAId, styleA.id, styleA.name, brandUuid ?? "");
        }
        if (jobBId) {
          addJob({ id: jobBId, kind: "render_outfit", name: `Auto B` });
          pollAutoJob(jobBId, styleB.id, styleB.name, brandUuid ?? "");
        }
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Failed");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ── [ACTIVE] studio 모드 ────────────────────────────────────────────
    // 모델 O + 제품 O → render_product_model (모델 + 제품 합성)
    // 모델 O + 제품 X → render_prompt (모델 장면 생성)
    // 모델 X + 제품 O → render_product_solo (제품 단독 렌더링)
    // Validation per pipeline
    if (pipelineMode === "studio") {
      const useInfluencer = !!selectedId;
      if (useInfluencer) {
        const sel = models.find((p) => p.id === selectedId);
        if (!sel?.face_sheet_key) {
          setFormError("선택된 인플루언서에 face sheet이 없습니다.");
          return;
        }
        if (!productImage) {
          // render_prompt: 프롬프트 필수
          if (!promptText.trim()) {
            setFormError("제품 이미지 또는 프롬프트를 입력하세요.");
            return;
          }
        }
      } else {
        if (!productImage) {
          setFormError("제품 이미지를 업로드하세요.");
          return;
        }
      }
      // ── [LEGACY] 현재 미사용 파이프라인 ──────────────────────────────────
    } else if (pipelineMode === "object_render") {
      if (!objectImage) {
        setFormError("타겟 사물 이미지를 업로드하세요.");
        return;
      }
    } else if (pipelineMode === "influencer_product") {
      if (!selectedId) return;
      const sel = models.find((p) => p.id === selectedId);
      if (!sel?.face_sheet_key) {
        setFormError("This model has no face sheet.");
        return;
      }
      if (!productImage) {
        setFormError("제품 이미지를 업로드하세요.");
        return;
      }
      if (!promptText.trim() && !productExampleImage) {
        setFormError("프롬프트 또는 예시 이미지 중 하나 이상 필요합니다.");
        return;
      }
    } else {
      if (!selectedId) return;
      const selected = models.find((p) => p.id === selectedId);
      if (!selected?.face_sheet_key) {
        setFormError("This model has no face sheet.");
        return;
      }

      if (pipelineMode === "outfit") {
        if (!exampleImage) {
          setFormError("Please upload an example image.");
          return;
        }
        if (outfitImages.length === 0) {
          setFormError("Please upload at least 1 outfit image.");
          return;
        }
      } else {
        if (!promptText.trim() && !referenceImage) {
          setFormError("Please enter a prompt or upload a reference image.");
          return;
        }
      }
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (pipelineMode === "studio") {
        const buildRequest = (imageApi: "grok" | "gpt"): Promise<Response> => {
          if (selectedId && productImage) {
            // render_product_model: 모델 + 제품
            const fd = new FormData();
            fd.append("pipeline", "render_product_model");
            fd.append("influencer_id", selectedId);
            fd.append("product_image", productImage);
            fd.append("image_api", imageApi);
            if (promptText.trim()) fd.append("prompt", promptText.trim());
            if (useProfile && profileId) fd.append("style_id", profileId);
            if (brandUuid) fd.append("brand_id", brandUuid);
            fd.append("aspect_ratio", aspectRatio);
            if (selectedProductId) fd.append("product_id", selectedProductId);
            return fetchWithAuth("/api/render/create-job", {
              method: "POST",
              body: fd,
            });
          } else if (selectedId && !productImage) {
            // render_prompt: 모델만 선택
            return fetchWithAuth("/api/render/create-job", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                influencer_id: selectedId,
                prompt: promptText.trim(),
                pipeline: "render_prompt",
                realism,
                aspect_ratio: aspectRatio,
                image_api: imageApi,
                ...(useProfile && profileId ? { style_id: profileId } : {}),
                ...(brandUuid ? { brand_id: brandUuid } : {}),
              }),
            });
          } else {
            // render_product_solo: 제품만 (항상 gpt, imageApi 미사용)
            const fd = new FormData();
            fd.append("pipeline", "render_product_solo");
            fd.append("object_image", productImage!);
            if (promptText.trim()) fd.append("prompt", promptText.trim());
            if (useProfile && profileId) fd.append("style_id", profileId);
            if (brandUuid) fd.append("brand_id", brandUuid);
            fd.append("aspect_ratio", aspectRatio);
            if (selectedProductId) fd.append("product_id", selectedProductId);
            return fetchWithAuth("/api/render/create-job", {
              method: "POST",
              body: fd,
            });
          }
        };

        const isSoloPipeline = !selectedId && !!productImage;
        const batchJobs: Array<"grok" | "gpt"> = isSoloPipeline
          ? (Array(batchCount).fill("gpt") as Array<"grok" | "gpt">)
          : batchCount === 1
            ? ["gpt"]
            : ([
                ...Array(Math.floor(batchCount / 2)).fill("grok"),
                ...Array(Math.ceil(batchCount / 2)).fill("gpt"),
              ] as Array<"grok" | "gpt">);

        const rawResponses = await Promise.all(
          batchJobs.map((api) => buildRequest(api)),
        );
        const results = await Promise.all(
          rawResponses.map((r) =>
            r
              .json()
              .then((data: { jobId?: string; error?: string; code?: string }) => ({
                ok: r.ok,
                status: r.status,
                data,
              })),
          ),
        );
        const successResults = results.filter((r) => r.ok && r.data.jobId);
        const failedCount = results.length - successResults.length;
        if (failedCount > 0 && successResults.length === 0) {
          // 전체 실패 — 첫 번째 실패 응답에서 pack 에러 여부 확인
          const firstFailed = results.find((r) => !r.ok);
          const packErr = firstFailed
            ? isPackOrDailyLimitError(firstFailed.status, firstFailed.data)
            : null;
          if (packErr) {
            // retry 횟수가 상한 초과 시 모달 재오픈 대신 generic 에러로 종료
            if (retryAttemptsRef.current >= MAX_RETRY_ATTEMPTS) {
              retryAttemptsRef.current = 0;
              setFormError(
                "결제 후에도 잔량이 부족합니다. 잠시 후 다시 시도하거나 고객지원에 문의해주세요.",
              );
              return;
            }
            setInsufficientReason(packErr);
            pendingRetryRef.current = () => void handleSubmit();
            setPackModal("insufficient");
            return;
          }
          setFormError(
            firstFailed?.data?.error ?? "Failed to create render job",
          );
          return;
        }
        if (failedCount > 0) {
          setFormError(
            `${failedCount}개 요청 실패 — 나머지 ${successResults.length}개는 계속 진행됩니다.`,
          );
        }

        const jobIds = successResults.map((r) => r.data.jobId as string);

        const kind =
          selectedId && productImage
            ? "render_product_model"
            : selectedId
              ? "render_prompt"
              : "render_product_solo";
        const selected = models.find((p) => p.id === selectedId);
        const jobName = selectedId
          ? `${selected?.name ?? ""} 제품`
          : "Object 제품";

        if (batchCount === 1) {
          const jId = jobIds[0];
          setActiveJobId(jId);
          const activeModel = models.find((m) => m.id === selectedId);
          const activeProduct = brandProducts.find(
            (p) => p.id === selectedProductId,
          );
          const activeProductImg =
            activeProduct?.images?.find((i) => i.role === "hero")?.url ??
            activeProduct?.images?.[0]?.url ??
            activeProduct?.image_url ??
            null;
          setGeneratedHistory((prev) => [
            ...prev,
            {
              loading: true,
              jobId: jId,
              modelName: activeModel?.name,
              modelImageUrl: activeModel?.face_image_url ?? null,
              productName: activeProduct?.name,
              productImageUrl: activeProductImg,
            },
          ]);
          savePendingJob(brandId, { jobId: jId, type: "single" });
          setJobStatus("queued");
          setJobProgress(0);
          setResultImageUrl(null);
          setGeminiImageUrl(null);
          setGrokImageUrl(null);
          setStep1ImageUrl(null);
          setJobError(null);
          addJob({ id: jId, kind: kind as "render_outfit", name: jobName });
          window.history.replaceState(
            null,
            "",
            `/${brandId}/studio?job=${jId}`,
          );
        } else {
          const activeModel2 = models.find((m) => m.id === selectedId);
          const activeProduct2 = brandProducts.find(
            (p) => p.id === selectedProductId,
          );
          const activeProductImg2 =
            activeProduct2?.images?.find((i) => i.role === "hero")?.url ??
            activeProduct2?.images?.[0]?.url ??
            activeProduct2?.image_url ??
            null;
          setGeneratedHistory((prev) => [
            ...prev,
            ...jobIds.map((jId) => ({
              loading: true as const,
              jobId: jId,
              modelName: activeModel2?.name,
              modelImageUrl: activeModel2?.face_image_url ?? null,
              productName: activeProduct2?.name,
              productImageUrl: activeProductImg2,
            })),
          ]);
          jobIds.forEach((jId) => {
            savePendingJob(brandId, { jobId: jId, type: "batch" });
          });
          jobIds.forEach((jId, i) => {
            addJob({
              id: jId,
              kind: kind as "render_outfit",
              name: `${jobName} ${i + 1}`,
            });
            pollBatchJob(jId);
          });
          window.history.replaceState(
            null,
            "",
            `/${brandId}/studio?job=${jobIds[0]}`,
          );
        }
        return;
      }

      // ── 레거시 파이프라인 ────────────────────────────────────────────────
      let res: Response;

      if (pipelineMode === "object_render") {
        const fd = new FormData();
        fd.append("pipeline", "render_product_solo");
        fd.append("object_image", objectImage!);
        if (promptText.trim()) fd.append("prompt", promptText.trim());
        if (useProfile && profileId) fd.append("style_id", profileId);
        if (brandUuid) fd.append("brand_id", brandUuid);
        fd.append("aspect_ratio", aspectRatio);
        res = await fetchWithAuth("/api/render/create-job", {
          method: "POST",
          body: fd,
        });
      } else if (pipelineMode === "influencer_product") {
        const fd = new FormData();
        fd.append("pipeline", "render_product_model");
        fd.append("influencer_id", selectedId!);
        fd.append("product_image", productImage!);
        if (promptText.trim()) fd.append("prompt", promptText.trim());
        if (useProfile && profileId) fd.append("style_id", profileId);
        if (brandUuid) fd.append("brand_id", brandUuid);
        fd.append("aspect_ratio", aspectRatio);
        res = await fetchWithAuth("/api/render/create-job", {
          method: "POST",
          body: fd,
        });
      } else if (pipelineMode === "outfit") {
        const fd = new FormData();
        fd.append("influencer_id", selectedId!);
        fd.append("reference_image", exampleImage!);
        outfitImages.forEach((f) => fd.append("outfit_images", f));
        if (useProfile && profileId) fd.append("style_id", profileId);
        if (brandUuid) fd.append("brand_id", brandUuid);
        res = await fetchWithAuth("/api/render/create-job", {
          method: "POST",
          body: fd,
        });
      } else if (referenceImage) {
        const fd = new FormData();
        fd.append("influencer_id", selectedId!);
        fd.append("prompt", promptText.trim());
        fd.append("pipeline", "render_prompt");
        fd.append("realism", String(realism));
        fd.append("reference_image", referenceImage);
        if (useProfile && profileId) fd.append("style_id", profileId);
        if (brandUuid) fd.append("brand_id", brandUuid);
        fd.append("aspect_ratio", aspectRatio);
        res = await fetchWithAuth("/api/render/create-job", {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetchWithAuth("/api/render/create-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            influencer_id: selectedId,
            prompt: promptText.trim(),
            pipeline: "render_prompt",
            realism,
            aspect_ratio: aspectRatio,
            ...(useProfile && profileId ? { style_id: profileId } : {}),
            ...(brandUuid ? { brand_id: brandUuid } : {}),
          }),
        });
      }

      const data = await res
        .json()
        .catch(() => ({} as { jobId?: string; error?: string; code?: string }));
      if (!res.ok) {
        const packErr = isPackOrDailyLimitError(res.status, data);
        if (packErr) {
          if (retryAttemptsRef.current >= MAX_RETRY_ATTEMPTS) {
            retryAttemptsRef.current = 0;
            setFormError(
              "결제 후에도 잔량이 부족합니다. 잠시 후 다시 시도하거나 고객지원에 문의해주세요.",
            );
            return;
          }
          setInsufficientReason(packErr);
          pendingRetryRef.current = () => void handleSubmit();
          setPackModal("insufficient");
          return;
        }
        setFormError(
          (data as { error?: string }).error ?? "Failed to create render job",
        );
        return;
      }

      const jId = data.jobId as string;
      const kind =
        pipelineMode === "outfit"
          ? "render_outfit"
          : pipelineMode === "object_render"
            ? "render_product_solo"
            : pipelineMode === "influencer_product"
              ? "render_product_model"
              : "render_prompt";
      const label =
        pipelineMode === "outfit"
          ? "의상"
          : pipelineMode === "object_render"
            ? "제품"
            : pipelineMode === "influencer_product"
              ? "광고"
              : "장면";
      setActiveJobId(jId);
      const activeModel3 = models.find((m) => m.id === selectedId);
      const activeProduct3 = brandProducts.find(
        (p) => p.id === selectedProductId,
      );
      const activeProductImg3 =
        activeProduct3?.images?.find((i) => i.role === "hero")?.url ??
        activeProduct3?.images?.[0]?.url ??
        activeProduct3?.image_url ??
        null;
      setGeneratedHistory((prev) => [
        ...prev,
        {
          loading: true,
          jobId: jId,
          modelName: activeModel3?.name,
          modelImageUrl: activeModel3?.face_image_url ?? null,
          productName: activeProduct3?.name,
          productImageUrl: activeProductImg3,
        },
      ]);
      savePendingJob(brandId, { jobId: jId, type: "single" });
      setJobStatus("queued");
      setJobProgress(0);
      setResultImageUrl(null);
      setGeminiImageUrl(null);
      setGrokImageUrl(null);
      setStep1ImageUrl(null);
      setJobError(null);
      const selected = models.find((p) => p.id === selectedId);
      const jobName =
        pipelineMode === "object_render"
          ? `Object ${label}`
          : `${selected?.name ?? ""} ${label}`;
      addJob({ id: jId, kind: kind as "render_outfit", name: jobName });

      window.history.replaceState(null, "", `/${brandId}/studio?job=${jId}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedId,
    models,
    pipelineMode,
    exampleImage,
    outfitImages,
    promptText,
    realism,
    referenceImage,
    styleImage,
    objectImage,
    productImage,
    productExampleImage,
    useProfile,
    profileId,
    aspectRatio,
    brandUuid,
    fetchWithAuth,
    addJob,
    brandId,
    autoStyleMode,
    selectedProductId,
    brandProducts,
    createStudioJobForStyle,
    pollAutoJob,
    batchCount,
    pollBatchJob,
  ]);

  // ── Reset handler ─────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setActiveJobId(null);
    setJobStatus(null);
    setJobProgress(0);
    setResultImageUrl(null);
    setGeminiImageUrl(null);
    setGrokImageUrl(null);
    setStep1ImageUrl(null);
    setJobError(null);
    window.history.replaceState(null, "", `/${brandId}/studio`);
  }, [brandId]);

  // ── Loading ───────────────────────────────────────────────────────────
  if (authLoading || loadingModels) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[color:var(--text-secondary)]">
          {tc("loading")}
        </div>
      </div>
    );
  }

  const isProcessing =
    !!activeJobId &&
    (jobStatus === null ||
      jobStatus === "queued" ||
      jobStatus === "processing");
  const isSucceeded = jobStatus === "succeeded";
  const isFailed = jobStatus === "failed";
  const hasResult = isProcessing || isSucceeded || isFailed;

  // 일반 모드 폴링 중이거나, auto 모드 폴링 중(loading 아이템 존재)이거나, 제출 중
  const isAnyGenerating =
    submitting ||
    isProcessing ||
    generatedHistory.some((item) => "loading" in item);

  /* ── Collect all result images into a gallery array ──────────────── */
  const galleryImages: { url: string; label: string; filename: string }[] = [];
  if (isSucceeded) {
    if (grokImageUrl)
      galleryImages.push({
        url: grokImageUrl,
        label: "Grok",
        filename: "render_grok.png",
      });
    if (gptImageUrl && !galleryImages.some((g) => g.url === gptImageUrl))
      galleryImages.push({
        url: gptImageUrl,
        label: "GPT Image 2",
        filename: "render_gpt.png",
      });
    if (geminiImageUrl)
      galleryImages.push({
        url: geminiImageUrl,
        label: "Gemini",
        filename: "render_gemini.png",
      });
    if (step1ImageUrl)
      galleryImages.push({
        url: step1ImageUrl,
        label: "Step 1",
        filename: "render_step1.png",
      });
    if (
      resultImageUrl &&
      !galleryImages.some((g) => g.url === resultImageUrl)
    ) {
      galleryImages.push({
        url: resultImageUrl,
        label: "Final",
        filename: "render_result.png",
      });
    }
  }

  return (
    <div
      className="relative -mt-10 -mb-10 flex flex-col flex-1 min-h-0"
      style={{
        background: "var(--surface-0)",
      }}
    >
      {/* ════════════════════════════════════════════════════════════════
          GALLERY AREA — scrollable
          ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 pb-52">
        {/* ════════════════════════════════════════════════════════════════
            GENERATED HISTORY GRID — 생성 이력 누적 그리드 (전체 너비)
            ════════════════════════════════════════════════════════════ */}
        {generatedHistory.length > 0 && (
          <div className="-mx-4 md:-mx-8 -mt-2 mb-4">
            <div className="flex items-center justify-end px-4 md:px-8 mb-1">
              <button
                type="button"
                onClick={() => {
                  const now = new Date().toISOString();
                  localStorage.setItem(clearedAtKey(brandId), now);
                  setGeneratedHistory((prev) =>
                    prev.filter((item) => "loading" in item),
                  );
                }}
                className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)] transition-colors"
              >
                Clear all
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1">
              {generatedHistory.map((item, idx) => (
                <div
                  key={
                    "loading" in item ? `loading-${idx}` : `${item.url}-${idx}`
                  }
                  className="group relative aspect-square overflow-hidden bg-[var(--surface-2)] cursor-pointer"
                  onClick={() => {
                    if (!("loading" in item)) {
                      setLightboxItem({
                        url: item.url,
                        filename: item.filename ?? null,
                        // 클라이언트 신규 생성 아이템은 assetId가 null → 채널 서식 버튼 숨김
                        assetId:
                          ("assetId" in item ? item.assetId : null) ?? null,
                        styleId:
                          ("autoStyleId" in item ? item.autoStyleId : null) ??
                          item.styleId ??
                          null,
                        styleType:
                          ("styleType" in item ? item.styleType : null) ??
                          ("autoStyleId" in item && item.autoStyleId
                            ? "auto"
                            : null),
                        styleImageUrl:
                          ("styleImageUrl" in item
                            ? item.styleImageUrl
                            : null) ?? null,
                        styleName: item.styleName ?? item.autoStyleName ?? null,
                        autoStyleName:
                          ("autoStyleName" in item
                            ? item.autoStyleName
                            : null) ?? null,
                        modelId:
                          ("modelId" in item ? item.modelId : null) ?? null,
                        modelName: item.modelName ?? null,
                        modelImageUrl: item.modelImageUrl ?? null,
                        productId:
                          ("productId" in item ? item.productId : null) ?? null,
                        productName: item.productName ?? null,
                        productImageUrl: item.productImageUrl ?? null,
                      });
                    }
                  }}
                >
                  {"loading" in item ? (
                    <div className="w-full h-full bg-[var(--surface-3)] flex items-center justify-center relative">
                      {item.autoStyleId && (
                        <span className="absolute top-1 left-1 px-2 py-0.5 rounded-full bg-pink-500/80 text-white text-[10px] font-semibold leading-none backdrop-blur-sm">
                          Auto
                        </span>
                      )}
                      <div className="w-8 h-8 border-2 border-[color:var(--border-default)] border-t-[color:var(--text-secondary)] rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      <img
                        src={item.url}
                        alt={`Generated ${generatedHistory.length - idx}`}
                        className="w-full h-full object-cover select-none"
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                      />
                      {(item.autoStyleId || item.styleType === "auto") && (
                        <span className="absolute top-1 left-1 px-2 py-0.5 rounded-full bg-pink-500/80 text-white text-[10px] font-semibold leading-none backdrop-blur-sm">
                          Auto
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/0 lg:group-hover:bg-black/40 transition-colors flex items-end justify-center gap-1.5 pb-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(
                              item.url,
                              item.filename ?? "image.png",
                            );
                          }}
                          className="hidden lg:inline-flex lg:opacity-0 lg:group-hover:opacity-100 transition-opacity items-center justify-center w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        {(item.autoStyleId || item.styleType === "auto") &&
                          (() => {
                            const sid = item.autoStyleId ?? item.styleId ?? "";
                            const sname =
                              item.autoStyleName ??
                              item.styleName ??
                              "Auto Style";
                            return savedStyleIds.has(sid) ? (
                              <span className="lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[rgba(255,164,198,0.15)] border border-[rgba(255,164,198,0.4)] text-pink-300 text-xs backdrop-blur-sm">
                                ✓ 저장됨
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSaveStyle(sid, sname);
                                  }}
                                  disabled={savingStyleId === sid}
                                  className="lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[rgba(255,164,198,0.15)] hover:bg-[rgba(255,164,198,0.25)] border border-[rgba(255,164,198,0.4)] text-pink-300 text-xs backdrop-blur-sm disabled:opacity-50"
                                >
                                  {savingStyleId === sid
                                    ? "저장 중..."
                                    : "스타일 저장"}
                                </button>
                                {saveStyleErrorId === sid && saveStyleError && (
                                  <p className="text-xs text-red-400 mt-1 text-center w-full">
                                    {saveStyleError}
                                  </p>
                                )}
                              </>
                            );
                          })()}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty State ──────────────────────────────────────────────── */}
        {generatedHistory.length === 0 && !isFailed && (
          <div className="flex flex-col items-center justify-start min-h-[calc(100dvh-44px-208px)] py-8 gap-8">
            {/* 좌우 분할: 모바일 수직 / lg+ 수평 */}
            <div className="w-full flex flex-col lg:flex-row items-start gap-8 lg:gap-12 max-w-[1200px] mx-auto px-4 md:px-8">
              {/* ── 좌 텍스트 패널 ─────────────────────────────────── */}
              <div className="flex flex-col gap-8 w-full lg:w-[38%] lg:flex-shrink-0 lg:pt-2 items-center lg:items-start text-center lg:text-left">
                {/* 히어로 */}
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold text-[color:var(--text-primary)] tracking-tight">
                    이미지 <span className="brand-gradient-text">스튜디오</span>
                  </h2>
                  <p className="text-sm text-[color:var(--text-secondary)] max-w-sm leading-relaxed">
                    스타일, 모델, 제품을 선택하고 렌더 버튼을 누르면 브랜드에
                    맞는 이미지가 생성됩니다.
                  </p>
                </div>

                {/* 시작하는 방법 */}
                <div className="flex flex-col gap-5 w-full">
                  <p className="text-[11px] uppercase tracking-widest font-semibold text-[color:var(--text-muted)]">
                    시작하는 방법
                  </p>
                  <div className="flex flex-col gap-5">
                    {(
                      [
                        {
                          n: 1,
                          title: "스타일 선택",
                          desc: "원하는 스타일을 고르거나, Auto Style을 켜면 브랜드에 맞는 스타일을 자동으로 생성합니다.",
                        },
                        {
                          n: 2,
                          title: "제품 & 모델 선택",
                          desc: "합성할 제품 이미지와 브랜드 모델을 선택하세요.",
                        },
                        {
                          n: 3,
                          title: "렌더",
                          desc: "비율과 수량을 설정한 뒤 렌더 버튼을 누르세요. 여러 장을 한 번에 생성해 결과를 비교할 수 있습니다.",
                        },
                      ] as { n: number; title: string; desc: string }[]
                    ).map(({ n, title, desc }) => (
                      <div key={n} className="flex items-start gap-4 text-left">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold mt-0.5"
                          style={{
                            background: "var(--surface-3)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {n}
                        </div>
                        <div>
                          <p className="text-base font-semibold text-[color:var(--text-primary)] mb-1">
                            {title}
                          </p>
                          <p className="text-sm text-[color:var(--text-secondary)] leading-relaxed">
                            {desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── 우 이미지 벤토 그리드 — lg+ 에서만 표시 ────────── */}
              <div className="hidden lg:block flex-1 min-w-0">
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gridTemplateRows: "repeat(4, 120px)",
                  }}
                >
                  {STUDIO_BENTO.map((item) => (
                    <div
                      key={item.src}
                      className="relative overflow-hidden"
                      style={{
                        gridColumn: item.col,
                        gridRow: item.row,
                        background: item.fallback,
                      }}
                    >
                      <ShowcaseImage
                        src={item.src}
                        objectPosition={item.objectPosition}
                        fallback={item.fallback}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 기능 카드 3개 — 전체 너비 하단 가로 배열 */}
            <div className="w-full max-w-[1200px] mx-auto px-4 md:px-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(
                  [
                    {
                      icon: (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"
                            stroke="var(--text-secondary)"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ),
                      title: "Auto Style",
                      desc: "브랜드에 맞는 스타일을 자동으로 생성합니다.",
                    },
                    {
                      icon: (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <rect
                            x="2"
                            y="7"
                            width="8"
                            height="10"
                            rx="1.5"
                            stroke="var(--text-secondary)"
                            strokeWidth="1.5"
                          />
                          <rect
                            x="14"
                            y="4"
                            width="8"
                            height="7"
                            rx="1.5"
                            stroke="var(--text-muted)"
                            strokeWidth="1.5"
                          />
                          <rect
                            x="14"
                            y="14"
                            width="8"
                            height="6"
                            rx="1.5"
                            stroke="var(--text-muted)"
                            strokeWidth="1.5"
                          />
                        </svg>
                      ),
                      title: "배치 생성",
                      desc: "최대 32장을 한 번에 생성해 비교합니다.",
                    },
                    {
                      icon: (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <rect
                            x="3"
                            y="3"
                            width="8"
                            height="8"
                            rx="1.5"
                            stroke="var(--text-secondary)"
                            strokeWidth="1.5"
                          />
                          <rect
                            x="3"
                            y="13"
                            width="8"
                            height="8"
                            rx="1.5"
                            stroke="var(--text-muted)"
                            strokeWidth="1.5"
                          />
                          <rect
                            x="13"
                            y="6"
                            width="8"
                            height="12"
                            rx="1.5"
                            stroke="var(--text-muted)"
                            strokeWidth="1.5"
                          />
                        </svg>
                      ),
                      title: "비율 선택",
                      desc: "1:1, 9:16, 16:9 등 채널에 맞는 비율로 출력합니다.",
                    },
                  ] as { icon: React.ReactNode; title: string; desc: string }[]
                ).map(({ icon, title, desc }) => (
                  <div
                    key={title}
                    className="rounded-xl p-4 flex items-center gap-3"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: "var(--surface-3)",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      {icon}
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-[color:var(--text-primary)]">
                        {title}
                      </p>
                      <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                        {desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto">
          {/* Failed */}
          {isFailed && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="rounded-xl px-5 py-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20">
                {jobError ?? "Render failed"}
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
              >
                {t("newRender")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          FLOATING INPUT BAR — fixed to bottom
          ════════════════════════════════════════════════════════════ */}
      <div
        className="fixed left-0 right-0 z-40 flex flex-col items-center bottom-[56px] lg:bottom-0 pb-0 lg:pb-4 px-0 lg:px-4 pointer-events-none lg:pl-[var(--sidebar-active-w,var(--sidebar-w-collapsed))]"
      >
        <div className="w-full max-w-none lg:max-w-5xl lg:mx-auto pointer-events-none relative">
          {/* Error */}
          {formError && (
            <div className="mb-2 mx-4 lg:mx-0 rounded-xl px-4 py-2.5 text-sm text-red-400 bg-red-500/10 border border-red-500/20 lg:backdrop-blur-lg pointer-events-auto">
              {formError}
            </div>
          )}

          {/* 선택된 모델 / 제품 미리보기 */}
          {(selectedId || selectedProductId) && (
            <div className="flex gap-2 mb-2 pl-16 sm:pl-36 pointer-events-none">
              {selectedProductId &&
                (() => {
                  const p = brandProducts.find(
                    (p) => p.id === selectedProductId,
                  );
                  const heroUrl =
                    p?.images?.find((i) => i.role === "hero")?.url ??
                    p?.image_url;
                  return p ? (
                    <div className="relative w-16 h-16 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-[color:var(--border-default)] flex-shrink-0 pointer-events-auto">
                      {heroUrl ? (
                        <img
                          src={`/api/image-proxy?url=${encodeURIComponent(heroUrl)}`}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-[var(--surface-3)] flex items-center justify-center text-[color:var(--text-secondary)] text-xl">
                          📦
                        </div>
                      )}
                      <div
                        className="absolute inset-x-0 bottom-0 px-1.5 py-1.5"
                        style={{
                          background:
                            "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
                        }}
                      >
                        <span className="block text-white text-[9px] font-medium truncate">
                          {p.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProductId(null);
                          setProductImage(null);
                        }}
                        className="absolute top-1 right-1 w-7 h-7 sm:w-5 sm:h-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                      >
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path
                            d="M18 6L6 18M6 6l12 12"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : null;
                })()}
              {selectedId &&
                (() => {
                  const m = models.find((p) => p.id === selectedId);
                  return m ? (
                    <div className="relative w-16 h-16 sm:w-24 sm:h-24 rounded-xl overflow-hidden border border-[color:var(--border-default)] flex-shrink-0 pointer-events-auto">
                      {m.face_image_url ? (
                        <img
                          src={m.face_image_url}
                          alt={m.name}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full bg-[var(--surface-3)] flex items-center justify-center text-[color:var(--text-secondary)] text-xl">
                          🧬
                        </div>
                      )}
                      <div
                        className="absolute inset-x-0 bottom-0 px-1.5 py-1.5"
                        style={{
                          background:
                            "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
                        }}
                      >
                        <span className="block text-white text-[9px] font-medium truncate">
                          {m.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        className="absolute top-1 right-1 w-7 h-7 sm:w-5 sm:h-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                      >
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path
                            d="M18 6L6 18M6 6l12 12"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : null;
                })()}
            </div>
          )}

          {/* Main input card */}
          <div
            className="relative w-full lg:backdrop-blur-lg rounded-none lg:rounded-2xl shadow-none lg:shadow-2xl lg:shadow-black/40 grid pointer-events-auto lg:border lg:border-[color:var(--border-default)]"
            style={{
              gridTemplateColumns: "auto 1fr",
              background: "var(--surface-1)",
            }}
          >
            {/* 스타일 버튼 — 왼쪽, 1:1 비율 (grid row height 기준) */}
            <button
              type="button"
              onClick={() => setStyleDropdownOpen((v) => !v)}
              className={`relative w-14 sm:w-auto sm:aspect-square flex flex-col items-center justify-center overflow-hidden transition-colors rounded-none lg:rounded-l-2xl ${autoStyleMode ? "bg-gradient-to-br from-pink-400 to-orange-300" : "hover:bg-[var(--surface-2)]"}`}
              style={
                autoStyleMode
                  ? undefined
                  : { borderRight: "1px solid var(--border-default)" }
              }
            >
              {autoStyleMode ? (
                <div className="flex flex-col items-center gap-1 text-white">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path
                      d="M12 3l1.8 4.8L18.6 9.6 13.8 11.4 12 16.2 10.2 11.4 5.4 9.6 10.2 7.8 12 3z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M19 14l.9 2.4 2.4.9-2.4.9L19 20.6l-.9-2.4-2.4-.9 2.4-.9L19 14z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-[10px] font-semibold">Auto Style</span>
                </div>
              ) : profileId &&
                (() => {
                  // 선택된 스타일은 brandStyles(내 스타일) 또는 globalStyles(발견)
                  // 어느 쪽에든 있을 수 있으므로 양쪽을 모두 조회한다.
                  const selected =
                    brandStyles.find((s) => s.id === profileId) ??
                    globalStyles.find((s) => s.id === profileId);
                  return (
                    selected &&
                    (selected.key_visual_url ?? selected.example_images?.[0])
                  );
                })() ? (
                <>
                  {(() => {
                    const selected =
                      brandStyles.find((s) => s.id === profileId) ??
                      globalStyles.find((s) => s.id === profileId)!;
                    return (
                      <>
                        <img
                          src={
                            selected.key_visual_url ??
                            selected.example_images[0]
                          }
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        {/* 이름 오버레이 */}
                        <div
                          className="absolute inset-x-0 bottom-0 px-1.5 py-1.5"
                          style={{
                            background:
                              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
                          }}
                        >
                          <span className="block text-white text-[9px] font-semibold truncate text-center">
                            {selected.name}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-[color:var(--text-muted)]">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-[9px] font-medium">스타일</span>
                </div>
              )}
            </button>

            {/* textarea + 하단 바 */}
            <div className="flex flex-col min-w-0">
              {/* Text input */}
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder='예: "깔끔한 흰 스튜디오 배경, 자연광, 모델이 제품을 자연스럽게 들고 있는 모습"'
                className="w-full bg-transparent text-[color:var(--text-primary)] text-sm px-5 pt-5 pb-3 resize-none outline-none min-h-[80px] max-h-48 placeholder:text-[color:var(--text-muted)]"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />

              {/* Bottom options bar */}
              <div className="flex items-center justify-between px-3 pb-3 gap-2">
                {/* Left: image upload buttons */}
                <div className="flex items-center gap-1 overflow-x-auto lg:overflow-x-visible flex-1 min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {/* 제품 드롭다운 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setProductDropdownOpen((v) => !v)}
                      className={`flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                        productImage
                          ? ""
                          : "bg-[var(--surface-3)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                      }`}
                      style={
                        productImage
                          ? {
                              background: "rgba(255,164,198,0.10)",
                              color: "#ffa4c6",
                              border: "1px solid rgba(255,164,198,0.20)",
                            }
                          : undefined
                      }
                    >
                      {productImage ? (
                        <span className="w-4 h-4 rounded overflow-hidden shrink-0">
                          <img
                            src={URL.createObjectURL(productImage)}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </span>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      )}
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          d="M6 9l6 6 6-6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    {/* 드롭다운 패널 */}
                    {productDropdownOpen && (() => {
                      const panelBody = (
                        <>
                          <div className="lg:hidden flex justify-center pt-2 pb-1">
                            <div className="w-10 h-1 rounded-full bg-[var(--border-default)]" />
                          </div>
                          <div
                            className="flex items-center justify-between px-6 py-4"
                            style={{
                              borderBottom: "1px solid var(--border-subtle)",
                            }}
                          >
                            <span className="text-xl font-bold text-[color:var(--text-primary)]">
                              제품 선택
                            </span>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/${brandId}/products/new`}
                                onClick={() => setProductDropdownOpen(false)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] text-xs transition-colors"
                              >
                                + 추가
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setProductDropdownOpen(false);
                                  setProductSearch("");
                                }}
                                className="w-8 h-8 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-colors"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path
                                    d="M18 6L6 18M6 6l12 12"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                          {/* 검색창 */}
                          <div className="px-4 pt-3 pb-2">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[color:var(--border-subtle)]">
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-[color:var(--text-muted)] shrink-0"
                              >
                                <circle cx="11" cy="11" r="8" />
                                <path
                                  d="M21 21l-4.35-4.35"
                                  strokeLinecap="round"
                                />
                              </svg>
                              <input
                                type="text"
                                value={productSearch}
                                onChange={(e) =>
                                  setProductSearch(e.target.value)
                                }
                                placeholder="제품 검색"
                                className="w-full bg-transparent text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] outline-none"
                              />
                              {productSearch && (
                                <button
                                  type="button"
                                  onClick={() => setProductSearch("")}
                                  className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path
                                      d="M18 6L6 18M6 6l12 12"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                          <div
                            className="overflow-y-auto p-4 max-h-[calc(50dvh-120px)] lg:max-h-[calc(72vh-120px)]"
                          >
                            {brandProducts.length === 0 ? (
                              <div className="py-8 text-center text-xs text-[color:var(--text-secondary)]">
                                등록된 제품이 없습니다
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProductImage(null);
                                    setSelectedProductId(null);
                                    setProductDropdownOpen(false);
                                  }}
                                  className={`w-28 flex flex-col items-center gap-1 rounded-xl p-1.5 transition-colors text-center ${!selectedProductId ? "bg-[var(--surface-3)]" : "hover:bg-[var(--surface-2)]"}`}
                                >
                                  <div className="w-full aspect-square rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-[color:var(--text-muted)]">
                                    <svg
                                      width="18"
                                      height="18"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                    >
                                      <path
                                        d="M18 6L6 18M6 6l12 12"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                  </div>
                                  <div className="text-[color:var(--text-secondary)] text-[9px] truncate w-full px-0.5">
                                    없음
                                  </div>
                                </button>
                                {brandProducts
                                  .filter((p) =>
                                    p.name
                                      .toLowerCase()
                                      .includes(productSearch.toLowerCase()),
                                  )
                                  .map((product) => {
                                    const heroUrl =
                                      product.images?.find(
                                        (i) => i.role === "hero",
                                      )?.url ?? product.image_url;
                                    return (
                                      <button
                                        key={product.id}
                                        type="button"
                                        onClick={async () => {
                                          setProductDropdownOpen(false);
                                          setProductSearch("");
                                          setSelectedProductId(product.id);
                                          if (!heroUrl) return;
                                          try {
                                            const res = await fetch(
                                              `/api/image-proxy?url=${encodeURIComponent(heroUrl)}`,
                                            );
                                            const blob = await res.blob();
                                            setProductImage(
                                              new File(
                                                [blob],
                                                `${product.name}.png`,
                                                {
                                                  type:
                                                    blob.type || "image/png",
                                                },
                                              ),
                                            );
                                          } catch {}
                                        }}
                                        className={`w-28 flex flex-col items-center gap-1 rounded-xl p-1.5 transition-colors text-center group ${selectedProductId === product.id ? "bg-[var(--surface-3)]" : "hover:bg-[var(--surface-2)]"}`}
                                      >
                                        <div className="w-full aspect-square rounded-lg overflow-hidden bg-[var(--surface-2)]">
                                          {heroUrl ? (
                                            <img
                                              src={`/api/image-proxy?url=${encodeURIComponent(heroUrl)}`}
                                              alt={product.name}
                                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150"
                                            />
                                          ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[color:var(--text-muted)] text-xl">
                                              📦
                                            </div>
                                          )}
                                        </div>
                                        <div className="text-[color:var(--text-primary)] text-[9px] truncate w-full px-0.5">
                                          {product.name}
                                        </div>
                                      </button>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        </>
                      );
                      return (
                        <>
                          {/* 데스크톱: 트리거 부모 기준 absolute */}
                          <div className="hidden lg:contents">
                            <div
                              className="fixed inset-0 z-[55] lg:bg-transparent"
                              onClick={() => {
                                setProductDropdownOpen(false);
                                setProductSearch("");
                              }}
                            />
                            <div
                              className="absolute bottom-full mb-2 left-0 z-[60] rounded-2xl shadow-2xl overflow-hidden flex flex-col lg:max-h-[72vh] w-64"
                              style={{
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-default)",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {panelBody}
                            </div>
                          </div>
                          {/* 모바일: body portal */}
                          {portalReady && createPortal(
                            <div className="lg:hidden">
                              <div
                                className="fixed inset-0 z-[55] bg-black/60"
                                onClick={() => {
                                  setProductDropdownOpen(false);
                                  setProductSearch("");
                                }}
                              />
                              <div
                                className="fixed bottom-[56px] left-0 right-0 z-[60] rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[50dvh]"
                                style={{
                                  background: "var(--surface-1)",
                                  border: "1px solid var(--border-default)",
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {panelBody}
                              </div>
                            </div>,
                            document.body
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <input
                    ref={productFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setProductImage(f);
                      e.target.value = "";
                    }}
                  />

                  {/* 모델 드롭다운 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setModelDropdownOpen((v) => !v)}
                      className={`flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                        selectedId
                          ? ""
                          : "bg-[var(--surface-3)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                      }`}
                      style={
                        selectedId
                          ? {
                              background: "rgba(255,164,198,0.10)",
                              color: "#ffa4c6",
                              border: "1px solid rgba(255,164,198,0.20)",
                            }
                          : undefined
                      }
                    >
                      {selectedId ? (
                        <span className="w-4 h-4 rounded-full overflow-hidden shrink-0">
                          <img
                            src={
                              models.find((p) => p.id === selectedId)
                                ?.face_image_url ?? ""
                            }
                            alt=""
                            className="w-full h-full object-cover object-top"
                          />
                        </span>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <circle cx="12" cy="8" r="4" />
                          <path
                            d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          d="M6 9l6 6 6-6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>

                    {modelDropdownOpen && (() => {
                      const panelBody = (
                        <>
                          <div className="lg:hidden flex justify-center pt-2 pb-1">
                            <div className="w-10 h-1 rounded-full bg-[var(--border-default)]" />
                          </div>
                          <div
                            className="flex items-center justify-between px-6 py-4"
                            style={{
                              borderBottom: "1px solid var(--border-subtle)",
                            }}
                          >
                            <span className="text-xl font-bold text-[color:var(--text-primary)]">
                              모델 선택
                            </span>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/${brandId}/models/new`}
                                onClick={() => setModelDropdownOpen(false)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] text-xs transition-colors"
                              >
                                + 추가
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setModelDropdownOpen(false);
                                  setModelSearch("");
                                }}
                                className="w-8 h-8 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-colors"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path
                                    d="M18 6L6 18M6 6l12 12"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                          {/* 검색창 */}
                          <div className="px-4 pt-3 pb-2">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[color:var(--border-subtle)]">
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-[color:var(--text-muted)] shrink-0"
                              >
                                <circle cx="11" cy="11" r="8" />
                                <path
                                  d="M21 21l-4.35-4.35"
                                  strokeLinecap="round"
                                />
                              </svg>
                              <input
                                type="text"
                                value={modelSearch}
                                onChange={(e) => setModelSearch(e.target.value)}
                                placeholder="모델 검색"
                                className="w-full bg-transparent text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] outline-none"
                              />
                              {modelSearch && (
                                <button
                                  type="button"
                                  onClick={() => setModelSearch("")}
                                  className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  >
                                    <path
                                      d="M18 6L6 18M6 6l12 12"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                          <div
                            className="overflow-y-auto p-4 max-h-[calc(50dvh-120px)] lg:max-h-[calc(72vh-120px)]"
                          >
                            {models.length === 0 ? (
                              <div className="py-8 text-center space-y-3">
                                <p className="text-xs text-[color:var(--text-secondary)]">
                                  등록된 모델이 없습니다
                                </p>
                                <a
                                  href={`/${brandId}/models/new`}
                                  className="inline-block text-xs text-[color:var(--text-secondary)] underline hover:text-[color:var(--text-primary)]"
                                  onClick={() => setModelDropdownOpen(false)}
                                >
                                  모델 만들기
                                </a>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedId(null);
                                    setModelDropdownOpen(false);
                                  }}
                                  className={`w-28 flex flex-col items-center gap-1 rounded-xl p-1.5 transition-colors text-center ${!selectedId ? "bg-[var(--surface-3)]" : "hover:bg-[var(--surface-2)]"}`}
                                >
                                  <div className="w-full aspect-square rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-[color:var(--text-muted)]">
                                    <svg
                                      width="18"
                                      height="18"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                    >
                                      <path
                                        d="M18 6L6 18M6 6l12 12"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                  </div>
                                  <div className="text-[color:var(--text-secondary)] text-[9px] truncate w-full px-0.5">
                                    없음
                                  </div>
                                </button>
                                {models
                                  .filter((m) =>
                                    m.name
                                      .toLowerCase()
                                      .includes(modelSearch.toLowerCase()),
                                  )
                                  .map((m) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedId(m.id);
                                        setModelDropdownOpen(false);
                                        setModelSearch("");
                                      }}
                                      className={`w-28 flex flex-col items-center gap-1 rounded-xl p-1.5 transition-colors text-center group ${selectedId === m.id ? "bg-[var(--surface-3)]" : "hover:bg-[var(--surface-2)]"}`}
                                    >
                                      <div className="w-full aspect-square rounded-lg overflow-hidden bg-[var(--surface-2)]">
                                        {m.face_image_url ? (
                                          <img
                                            src={m.face_image_url}
                                            alt={m.name}
                                            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-150"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-[color:var(--text-muted)] text-xl">
                                            {FACE_EMOJI[
                                              m.selections?.face_type ?? ""
                                            ] ?? "🧬"}
                                          </div>
                                        )}
                                      </div>
                                      <div className="text-[color:var(--text-primary)] text-[9px] truncate w-full px-0.5">
                                        {m.name}
                                      </div>
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </>
                      );
                      return (
                        <>
                          {/* 데스크톱: 트리거 부모 기준 absolute */}
                          <div className="hidden lg:contents">
                            <div
                              className="fixed inset-0 z-[55] lg:bg-transparent"
                              onClick={() => {
                                setModelDropdownOpen(false);
                                setModelSearch("");
                              }}
                            />
                            <div
                              className="absolute bottom-full mb-2 left-0 z-[60] rounded-2xl shadow-2xl overflow-hidden flex flex-col lg:max-h-[72vh] w-64"
                              style={{
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-default)",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {panelBody}
                            </div>
                          </div>
                          {/* 모바일: body portal */}
                          {portalReady && createPortal(
                            <div className="lg:hidden">
                              <div
                                className="fixed inset-0 z-[55] bg-black/60"
                                onClick={() => {
                                  setModelDropdownOpen(false);
                                  setModelSearch("");
                                }}
                              />
                              <div
                                className="fixed bottom-[56px] left-0 right-0 z-[60] rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[50dvh]"
                                style={{
                                  background: "var(--surface-1)",
                                  border: "1px solid var(--border-default)",
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {panelBody}
                              </div>
                            </div>,
                            document.body
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Right: aspect ratio button + send */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Batch count 드롭다운 (Auto Style 모드에서는 2장으로 고정) */}
                  <div className="relative">
                    <button
                      type="button"
                      disabled={autoStyleMode}
                      onClick={() => setBatchCountDropdownOpen((v) => !v)}
                      className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg text-[color:var(--text-secondary)] transition-colors ${
                        autoStyleMode
                          ? "cursor-not-allowed opacity-50"
                          : "hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="6"
                          height="6"
                          rx="1"
                          fill="currentColor"
                        />
                        <rect
                          x="11"
                          y="3"
                          width="6"
                          height="6"
                          rx="1"
                          fill="currentColor"
                        />
                        <rect
                          x="3"
                          y="11"
                          width="6"
                          height="6"
                          rx="1"
                          fill="currentColor"
                        />
                        <rect
                          x="11"
                          y="11"
                          width="6"
                          height="6"
                          rx="1"
                          fill="currentColor"
                        />
                      </svg>
                      <span className="text-[9px] font-medium leading-none">
                        ×{autoStyleMode ? 2 : batchCount}
                      </span>
                    </button>

                    {/* 드롭다운 */}
                    {!autoStyleMode && batchCountDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setBatchCountDropdownOpen(false)}
                        />
                        <div
                          className="absolute bottom-full mb-2 right-0 z-50 rounded-xl shadow-xl p-1.5 flex gap-1"
                          style={{
                            background: "var(--surface-2)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          {BATCH_COUNTS.map((count) => (
                            <button
                              key={count}
                              type="button"
                              onClick={() => {
                                setBatchCount(count);
                                localStorage.setItem(
                                  "studio_batch_count",
                                  String(count),
                                );
                                setBatchCountDropdownOpen(false);
                              }}
                              className={`flex flex-col items-center gap-1.5 px-2.5 py-2 rounded-lg transition-colors ${
                                batchCount === count
                                  ? "bg-[var(--surface-3)] text-[color:var(--text-primary)]"
                                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-3)]"
                              }`}
                            >
                              <span className="text-[11px] font-medium leading-none">
                                ×{count}
                              </span>
                              <span className="text-[9px] leading-none opacity-60">
                                컷
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="w-px h-5 bg-[var(--border-default)]" />

                  {/* Aspect ratio 단일 버튼 (드롭다운 트리거) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setAspectRatioDropdownOpen((v) => !v)}
                      className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
                    >
                      {(() => {
                        const cur = ASPECT_RATIOS.find(
                          (r) => r.value === aspectRatio,
                        )!;
                        return (
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 20 20"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <rect
                              x={cur.rect.x}
                              y={cur.rect.y}
                              width={cur.rect.width}
                              height={cur.rect.height}
                              rx="1.5"
                              fill="currentColor"
                              stroke="currentColor"
                              strokeWidth="1.25"
                            />
                          </svg>
                        );
                      })()}
                      <span className="text-[9px] font-medium leading-none">
                        {aspectRatio}
                      </span>
                    </button>

                    {/* 드롭다운 */}
                    {aspectRatioDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setAspectRatioDropdownOpen(false)}
                        />
                        <div
                          className="absolute bottom-full mb-2 right-0 z-50 rounded-xl shadow-xl p-1.5 flex gap-1"
                          style={{
                            background: "var(--surface-2)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          {ASPECT_RATIOS.map(({ value, label, rect }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                setAspectRatio(value);
                                localStorage.setItem(
                                  "studio_aspect_ratio",
                                  value,
                                );
                                setAspectRatioDropdownOpen(false);
                              }}
                              className={`flex flex-col items-center gap-1.5 px-2.5 py-2 rounded-lg transition-colors ${
                                aspectRatio === value
                                  ? ""
                                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[var(--surface-3)]"
                              }`}
                              style={
                                aspectRatio === value
                                  ? {
                                      background: "rgba(255,164,198,0.10)",
                                      color: "#ffa4c6",
                                      borderColor: "rgba(255,164,198,0.30)",
                                    }
                                  : undefined
                              }
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 20 20"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <rect
                                  x={rect.x}
                                  y={rect.y}
                                  width={rect.width}
                                  height={rect.height}
                                  rx="1.5"
                                  fill={
                                    aspectRatio === value
                                      ? "currentColor"
                                      : "none"
                                  }
                                  stroke="currentColor"
                                  strokeWidth="1.25"
                                />
                              </svg>
                              <span className="text-[9px] font-medium leading-none">
                                {label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="w-px h-5 bg-[var(--border-default)]" />
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isAnyGenerating || (!selectedId && !productImage)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all text-black disabled:opacity-30 disabled:cursor-not-allowed`}
                    style={{
                      background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="text-black"
                    >
                      <path
                        d="M12 19V5M5 12l7-7 7 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* 스타일 패널 (플로팅 바 위로 슬라이드업) */}
            {styleDropdownOpen && (() => {
              const panelBody = (
                <>
                  <div className="lg:hidden flex justify-center pt-2 pb-1">
                    <div className="w-10 h-1 rounded-full bg-[var(--border-default)]" />
                  </div>
                  {/* 헤더 */}
                  <div className="flex items-center justify-between px-6 py-4">
                    <span className="text-xl font-bold text-[color:var(--text-primary)]">
                      스타일 선택
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/${brandId}/styles/new`}
                        onClick={() => setStyleDropdownOpen(false)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] text-xs transition-colors"
                      >
                        + 추가
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setStyleDropdownOpen(false);
                          setStyleSearch("");
                        }}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            d="M18 6L6 18M6 6l12 12"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* 탭 + 검색창 한 행 */}
                  <div className="flex items-center gap-3 px-4 pt-3 pb-3">
                    {/* 탭 pill */}
                    <div
                      className="flex gap-1 p-1 rounded-lg shrink-0"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setStyleTab("discover")}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          styleTab === "discover"
                            ? "bg-[var(--surface-3)] text-[color:var(--text-primary)] shadow"
                            : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                        }`}
                      >
                        발견
                      </button>
                      <button
                        type="button"
                        onClick={() => setStyleTab("my-studios")}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          styleTab === "my-studios"
                            ? "bg-[var(--surface-3)] text-[color:var(--text-primary)] shadow"
                            : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                        }`}
                      >
                        내 스타일
                      </button>
                    </div>
                    {/* 검색창 */}
                    <div className="flex flex-1 items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[color:var(--border-subtle)]">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-[color:var(--text-muted)] shrink-0"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                      </svg>
                      <input
                        type="text"
                        value={styleSearch}
                        onChange={(e) => setStyleSearch(e.target.value)}
                        placeholder="스타일 검색..."
                        className="w-full bg-transparent text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)] outline-none"
                      />
                      {styleSearch && (
                        <button
                          type="button"
                          onClick={() => {
                            setStyleSearch("");
                            setAutoStyleMode(false);
                            setProfileId(null);
                            setUseProfile(false);
                            setStyleDropdownOpen(false);
                          }}
                          className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              d="M18 6L6 18M6 6l12 12"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 카드 그리드 (스크롤 영역) */}
                  <div
                    className="overflow-y-auto px-6 pb-6 max-h-[calc(50dvh-120px)] lg:max-h-[calc(72vh-120px)]"
                  >
                    {styleTab === "my-studios" &&
                    brandStyles.filter((s) => s.type === "custom").length ===
                      0 &&
                    !styleSearch ? (
                      <div className="py-12 flex flex-col items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center"
                          style={{
                            background: "rgba(255,164,198,0.06)",
                            border: "1px solid rgba(255,164,198,0.12)",
                          }}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(255,164,198,0.5)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 3l1.8 4.8L18.6 9.6 13.8 11.4 12 16.2 10.2 11.4 5.4 9.6 10.2 7.8 12 3z" />
                            <path d="M19 14l.9 2.4 2.4.9-2.4.9L19 20.6l-.9-2.4-2.4-.9 2.4-.9L19 14z" />
                          </svg>
                        </div>
                        <div className="text-center space-y-1">
                          <p className="text-xs font-medium text-[color:var(--text-primary)]">
                            아직 만든 스타일이 없어요
                          </p>
                          <p className="text-[10px] text-[color:var(--text-muted)] leading-relaxed px-4">
                            + 추가 버튼으로 나만의 스타일을 만들어보세요
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {/* Auto 카드 — discover 탭에서만 렌더링 */}
                        {styleTab === "discover" && (
                          <button
                            type="button"
                            onClick={() => {
                              setAutoStyleMode(true);
                              setProfileId(null);
                              setUseProfile(false);
                              setStyleDropdownOpen(false);
                            }}
                            className="relative w-40 aspect-square rounded-xl overflow-hidden flex flex-col items-center justify-center gap-2 border-2 transition-colors bg-gradient-to-br from-pink-400 to-orange-300"
                            style={{
                              borderColor: autoStyleMode
                                ? "#ffa4c6"
                                : "var(--border-default)",
                            }}
                          >
                            <svg
                              width="22"
                              height="22"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              className="text-white"
                            >
                              <path
                                d="M12 3l1.8 4.8L18.6 9.6 13.8 11.4 12 16.2 10.2 11.4 5.4 9.6 10.2 7.8 12 3z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M19 14l.9 2.4 2.4.9-2.4.9L19 20.6l-.9-2.4-2.4-.9 2.4-.9L19 14z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span className="text-white text-xs font-bold">
                              Auto Style
                            </span>
                            {/* 선택 도트 */}
                            {autoStyleMode && (
                              <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-pink-300" />
                            )}
                          </button>
                        )}

                        {/* 스타일 카드들 — 탭별 풀 + 검색어 필터링.
                            "발견" 탭: globalStyles(/api/templates) 그대로.
                            "내 스타일" 탭: brandStyles 중 type==="custom" 만. */}
                        {(styleTab === "discover"
                          ? globalStyles
                          : brandStyles.filter((s) => s.type === "custom")
                        )
                          .filter((s) =>
                            s.name
                              .toLowerCase()
                              .includes(styleSearch.toLowerCase()),
                          )
                          .map((style) => (
                            <button
                              key={style.id}
                              type="button"
                              onClick={() => {
                                setAutoStyleMode(false);
                                setProfileId(style.id);
                                setUseProfile(true);
                                setStyleDropdownOpen(false);
                                setStyleSearch("");
                              }}
                              className="relative w-40 aspect-square rounded-xl overflow-hidden focus:outline-none transition-all"
                              style={{
                                border:
                                  profileId === style.id
                                    ? "2px solid #ffa4c6"
                                    : "2px solid var(--border-default)",
                              }}
                            >
                              {(style.key_visual_url ??
                              style.example_images?.[0]) ? (
                                <img
                                  src={
                                    style.key_visual_url ??
                                    style.example_images[0]
                                  }
                                  alt={style.name}
                                  className="absolute inset-0 w-full h-full object-cover"
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-2)] text-2xl">
                                  ✨
                                </div>
                              )}
                              {/* 하단 이름 오버레이 */}
                              <div
                                className="absolute inset-x-0 bottom-0 px-2 py-2"
                                style={{
                                  background:
                                    "linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)",
                                }}
                              >
                                <span className="block text-white text-xs font-semibold truncate leading-tight">
                                  {style.name}
                                </span>
                              </div>
                              {/* 선택 도트 */}
                              {profileId === style.id && (
                                <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-pink-300" />
                              )}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </>
              );
              return (
                <>
                  {/* 데스크톱: Main input card의 relative 기준 absolute */}
                  <div className="hidden lg:contents">
                    <div
                      className="fixed inset-0 z-[55] lg:bg-transparent"
                      onClick={() => {
                        setStyleDropdownOpen(false);
                        setStyleSearch("");
                      }}
                    />
                    <div
                      className="absolute bottom-full mb-2 left-0 right-auto w-full z-[60] rounded-2xl shadow-2xl overflow-hidden flex flex-col lg:max-h-[72vh]"
                      style={{
                        background: "var(--surface-1)",
                        border: "1px solid var(--border-default)",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {panelBody}
                    </div>
                  </div>
                  {/* 모바일: body portal */}
                  {portalReady && createPortal(
                    <div className="lg:hidden">
                      <div
                        className="fixed inset-0 z-[55] bg-black/60"
                        onClick={() => {
                          setStyleDropdownOpen(false);
                          setStyleSearch("");
                        }}
                      />
                      <div
                        className="fixed bottom-[56px] left-0 right-0 z-[60] rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[50dvh]"
                        style={{
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-default)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {panelBody}
                      </div>
                    </div>,
                    document.body
                  )}
                </>
              );
            })()}
          </div>

          {/* Credits info */}
          <div className="hidden lg:block mt-2 text-[11px] text-[color:var(--text-muted)] text-center pointer-events-auto">
            <Link
              href="/pricing"
              className="text-[color:var(--text-secondary)] underline hover:text-[color:var(--text-primary)] transition-colors"
            >
              플랜 보기
            </Link>
          </div>
        </div>
      </div>
      {lightboxItem && (
        <PhotoPreviewModal
          imageUrl={lightboxItem.url}
          styleName={lightboxItem.styleName}
          styleImageUrl={lightboxItem.styleImageUrl}
          styleAction={
            lightboxItem.styleId &&
            !(
              lightboxItem.styleType === "auto" &&
              !savedStyleIds.has(lightboxItem.styleId)
            ) ? (
              <button
                type="button"
                onClick={() => {
                  setAutoStyleMode(false);
                  setProfileId(lightboxItem.styleId!);
                  setUseProfile(true);
                  setLightboxItem(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 active:scale-[0.97] hover:brightness-105"
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                  color: "#000",
                }}
              >
                이 스타일로 만들기
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#000"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            ) : undefined
          }
          styleId={lightboxItem.styleId}
          modelId={lightboxItem.modelId}
          modelName={lightboxItem.modelName}
          modelImageUrl={lightboxItem.modelImageUrl}
          productId={lightboxItem.productId}
          productName={lightboxItem.productName}
          productImageUrl={lightboxItem.productImageUrl}
          onClose={() => {
            setLightboxItem(null);
            setSaveStyleError(null);
            setSaveStyleErrorId(null);
          }}
          footer={
            <div className="mt-5 flex flex-col gap-2">
              {lightboxItem.styleId &&
                lightboxItem.styleType === "auto" &&
                !savedStyleIds.has(lightboxItem.styleId) && (
                  // auto 미저장 → 스타일 저장 CTA
                  <button
                    type="button"
                    onClick={() =>
                      handleSaveStyle(
                        lightboxItem.styleId!,
                        lightboxItem.autoStyleName ??
                          lightboxItem.styleName ??
                          "Auto Style",
                      )
                    }
                    disabled={savingStyleId === lightboxItem.styleId}
                    className="w-full flex items-center justify-between pl-6 pr-2 py-3.5 rounded-full text-sm font-bold transition-all duration-150 active:scale-[0.97] hover:brightness-105 disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                      color: "#000",
                      boxShadow: "0 4px 20px rgba(255,164,198,0.25)",
                    }}
                  >
                    {savingStyleId === lightboxItem.styleId
                      ? "저장 중..."
                      : "스타일 저장"}
                    <span className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center shrink-0">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#000"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </span>
                  </button>
                )}
              {lightboxItem.styleId &&
                lightboxItem.styleType === "auto" &&
                !savedStyleIds.has(lightboxItem.styleId) &&
                saveStyleError && (
                  <p className="text-xs text-red-400 mt-1 text-center">
                    {saveStyleError}
                  </p>
                )}
              {/* 원본 다운로드 — 항상 표시, 현재 이미지를 그대로 받는다 */}
              <button
                type="button"
                onClick={() =>
                  handleDownload(
                    lightboxItem.url,
                    lightboxItem.filename ?? "image.png",
                  )
                }
                className="w-full flex items-center justify-between pl-6 pr-2 py-3.5 rounded-full text-sm font-bold transition-all duration-150 active:scale-[0.97] hover:brightness-95"
                style={{
                  background: "#fff",
                  color: "#000",
                  border: "1.5px solid #e4e4e7",
                }}
              >
                원본 다운로드
                <span className="w-8 h-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center shrink-0">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#000"
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

              {/* 채널 서식 선택 — DB에 저장된 render에만 노출.
                  클라이언트 신규 생성 아이템(assetId 없음)은 server 측 presign/crop이
                  불가능하므로 노출하지 않는다. */}
              {lightboxItem.assetId && (
                <button
                  type="button"
                  onClick={() => {
                    setChannelModalAssetId(lightboxItem.assetId ?? null);
                  }}
                  className="w-full flex items-center justify-between pl-6 pr-2 py-3.5 rounded-full text-sm font-bold transition-all duration-150 active:scale-[0.97] hover:brightness-95"
                  style={{
                    background: "#fff",
                    color: "#000",
                    border: "1.5px solid #e4e4e7",
                  }}
                >
                  채널 서식 선택
                  <span className="w-8 h-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center shrink-0">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#000"
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
              )}
            </div>
          }
        />
      )}
      {channelModalAssetId && (
        <ChannelDownloadModal
          renderId={channelModalAssetId}
          onClose={() => setChannelModalAssetId(null)}
        />
      )}

      {/* ── Pack 결제·한도 모달 ──────────────────────────────────────── */}
      <InsufficientPackModal
        open={packModal === "insufficient"}
        onClose={() => {
          setPackModal("none");
          pendingRetryRef.current = null;
          retryAttemptsRef.current = 0;
        }}
        reason={insufficientReason}
        onPurchase={() => setPackModal("purchase")}
        onUpgrade={() => {
          setPackModal("none");
          pendingRetryRef.current = null;
          retryAttemptsRef.current = 0;
          router.push("/pricing");
        }}
      />

      <PackPurchaseModal
        open={packModal === "purchase"}
        onClose={() => {
          setPackModal("none");
          pendingRetryRef.current = null;
          retryAttemptsRef.current = 0;
        }}
        onSuccess={() => {
          setPackModal("none");
          // 결제 성공 → 헤더 배지 즉시 갱신
          clearPackBalanceCache();
          // retry callback 먼저 추출 후 clear — 무한 체인 방지
          const retry = pendingRetryRef.current;
          pendingRetryRef.current = null;
          if (retry) {
            // retry 시도 횟수 증가 (피드백 루프 가드)
            retryAttemptsRef.current += 1;
            // state 업데이트 안정화를 위해 microtask 지연
            setTimeout(() => retry(), 100);
          }
        }}
        buyer={{
          name: user?.user_metadata?.full_name as string | undefined,
          email: user?.email,
        }}
        // organizationId 미전달 — PackPurchaseModal 이 /api/organizations fallback 으로 자동 조회
      />
    </div>
  );
}
