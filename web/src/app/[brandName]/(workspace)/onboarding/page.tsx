"use client";

/* eslint-disable @next/next/no-img-element */

import { use, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import type {
  ProductCategory,
  PackagingType,
} from "@/lib/brandProduct/brandProduct.types";

// ── Constants ─────────────────────────────────────────────────────────────────

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

const PACKAGING_TYPES: { value: PackagingType; label: string }[] = [
  { value: "bottle", label: "보틀" },
  { value: "tube", label: "튜브" },
  { value: "jar", label: "자" },
  { value: "box", label: "박스" },
  { value: "pump_bottle", label: "펌프보틀" },
  { value: "dropper", label: "드로퍼" },
  { value: "stick", label: "스틱" },
  { value: "cushion", label: "쿠션" },
  { value: "palette", label: "팔레트" },
  { value: "sachet", label: "새쳇" },
  { value: "can", label: "캔" },
  { value: "pouch", label: "파우치" },
  { value: "ampoule", label: "앰플" },
  { value: "other", label: "기타" },
];

const JOB_TYPES = [
  { value: "product_shot", label: "제품 사진" },
  { value: "lifestyle_shot", label: "라이프스타일" },
] as const;

type JobTypeValue = (typeof JOB_TYPES)[number]["value"];

// ── Step indicator ────────────────────────────────────────────────────────────

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "브랜드 분석" },
    { n: 2, label: "제품 등록" },
    { n: 3, label: "이미지 생성" },
  ] as const;

  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                s.n < step
                  ? "bg-pink-500 text-white"
                  : s.n === step
                    ? "bg-pink-500/20 border-2 border-pink-400 text-pink-300"
                    : "bg-zinc-800 text-zinc-600"
              }`}
            >
              {s.n < step ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                s.n
              )}
            </div>
            <span
              className={`text-[10px] font-medium ${s.n === step ? "text-pink-300" : "text-zinc-600"}`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-16 h-px mx-2 mb-5 ${s.n < step ? "bg-pink-500" : "bg-zinc-800"}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Image preview pill ────────────────────────────────────────────────────────

function ImagePill({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 group">
      <img src={src} alt="" className="w-full h-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OnboardingPage({
  params,
}: {
  params: Promise<{ brandName: string }>;
}) {
  const { brandName: brandId } = use(params);
  const router = useRouter();
  const { fetchWithAuth } = useFetchWithAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Step 1 state ───────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<
    { base64: string; mediaType: string; preview: string }[]
  >([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const remaining = 5 - images.length;
      const toProcess = Array.from(files).slice(0, remaining);
      toProcess.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const [header, base64] = dataUrl.split(",");
          const mediaType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
          setImages((prev) =>
            prev.length < 5
              ? [...prev, { base64, mediaType, preview: dataUrl }]
              : prev,
          );
        };
        reader.readAsDataURL(file);
      });
    },
    [images.length],
  );

  const handleAnalyze = async () => {
    if (!prompt.trim()) {
      setAnalyzeError("브랜드 설명을 입력해주세요.");
      return;
    }
    setAnalyzeError("");
    setAnalyzing(true);
    try {
      const body: Record<string, unknown> = { user_prompt: prompt.trim() };
      if (images.length > 0) {
        body.images = images.map(({ base64, mediaType }) => ({
          base64,
          mediaType,
        }));
      }
      const res = await fetchWithAuth(`/api/brands/${brandId}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAnalyzeError(
          (d as { error?: string }).error ?? "분석에 실패했습니다.",
        );
        return;
      }
      const d = await res.json();
      const vid: string =
        (d as { profile?: { version_id?: string }; version_id?: string })
          ?.profile?.version_id ??
        (d as { version_id?: string }).version_id ??
        "";

      // Auto-activate
      if (vid) {
        await fetchWithAuth(`/api/brands/${brandId}/profiles/${vid}/activate`, {
          method: "PATCH",
        });
        setProfileId(vid);
      }
      setStep(2);
    } catch {
      setAnalyzeError("네트워크 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Step 2 state ───────────────────────────────────────────────────────────
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("skincare");
  const [packagingType, setPackagingType] = useState<PackagingType>("bottle");
  const [productDescription, setProductDescription] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const [productError, setProductError] = useState("");
  const [productId, setProductId] = useState<string | null>(null);

  const handleSaveProduct = async () => {
    if (!productName.trim()) {
      setProductError("제품명을 입력해주세요.");
      return;
    }
    setProductError("");
    setSavingProduct(true);
    try {
      const res = await fetchWithAuth(`/api/brands/${brandId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productName.trim(),
          category,
          packaging_type: packagingType,
          description: productDescription.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setProductError(
          (d as { error?: string }).error ?? "제품 등록에 실패했습니다.",
        );
        return;
      }
      const d = await res.json();
      setProductId(
        (d as { product?: { id?: string }; id?: string })?.product?.id ??
          (d as { id?: string }).id ??
          null,
      );
      setStep(3);
    } catch {
      setProductError("네트워크 오류가 발생했습니다.");
    } finally {
      setSavingProduct(false);
    }
  };

  // ── Step 3 state ───────────────────────────────────────────────────────────
  const [jobType, setJobType] = useState<JobTypeValue>("product_shot");
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [conceptId, setConceptId] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenError("");
    setGenerating(true);
    try {
      // 1. Create concept if not yet created
      let cid = conceptId;
      if (!cid) {
        const cRes = await fetchWithAuth(`/api/brands/${brandId}/concepts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "첫 번째 캠페인",
            scope: productId ? "product" : "brand",
            base_profile_id: profileId,
            ...(productId ? { product_id: productId } : {}),
          }),
        });
        if (!cRes.ok) {
          const d = await cRes.json().catch(() => ({}));
          setGenError(
            (d as { error?: string }).error ?? "캠페인 생성에 실패했습니다.",
          );
          return;
        }
        const cData = await cRes.json();
        cid =
          (cData as { concept?: { id?: string }; id?: string })?.concept?.id ??
          (cData as { id?: string }).id ??
          null;
        if (cid) setConceptId(cid);
      }

      if (!cid) {
        setGenError("캠페인 생성에 실패했습니다.");
        return;
      }

      // 2. Generate
      const gRes = await fetchWithAuth(
        `/api/brands/${brandId}/concepts/${cid}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobType,
            prompt: genPrompt.trim() || undefined,
            ...(productId ? { productId } : {}),
          }),
        },
      );
      if (!gRes.ok) {
        const d = await gRes.json().catch(() => ({}));
        setGenError(
          (d as { error?: string }).error ?? "이미지 생성에 실패했습니다.",
        );
        return;
      }
      const gData = await gRes.json();
      const url =
        (
          gData as {
            job?: { output_image_url?: string };
            output_image_url?: string;
          }
        )?.job?.output_image_url ??
        (gData as { output_image_url?: string }).output_image_url ??
        null;
      setResultImageUrl(url);
    } catch {
      setGenError("네트워크 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  const handleFinish = () => {
    router.push(`/${brandId}`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-dvh" style={{ background: "var(--surface-0)" }}>
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">브랜드 시작하기</h1>
          <p className="text-sm text-zinc-500 mt-1">
            몇 가지 설정만 하면 바로 콘텐츠를 만들 수 있어요
          </p>
        </div>

        <StepBar step={step} />

        {/* ── Step 1: Profile Analysis ───────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white mb-1">
                브랜드 스타일 분석
              </h2>
              <p className="text-xs text-zinc-500">
                브랜드의 분위기, 타깃, 스타일을 자유롭게 설명해주세요. AI가
                브랜드 DNA를 분석합니다.
              </p>
            </div>

            {/* Prompt textarea */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                브랜드 설명 <span className="text-pink-400">*</span>
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder={`예시:\n"20~30대 여성을 위한 비건 스킨케어 브랜드입니다. 미니멀하고 클린한 디자인, 자연에서 영감받은 색감, 따뜻하면서도 세련된 브랜드 보이스를 가지고 있습니다."`}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-pink-400/50 focus:outline-none resize-none leading-relaxed"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
              />
            </div>

            {/* Reference images */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                레퍼런스 이미지{" "}
                <span className="text-zinc-600">(선택, 최대 5장)</span>
              </label>

              <div className="flex items-center gap-2 flex-wrap">
                {images.map((img, i) => (
                  <ImagePill
                    key={i}
                    src={img.preview}
                    onRemove={() =>
                      setImages((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  />
                ))}
                {images.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-zinc-700 hover:border-pink-400/50 flex flex-col items-center justify-center gap-0.5 text-zinc-600 hover:text-pink-400 transition-colors flex-shrink-0"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span className="text-[9px]">추가</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleImageFiles(e.target.files)}
              />
            </div>

            {analyzeError && (
              <p className="text-red-400 text-sm">{analyzeError}</p>
            )}

            {analyzing && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-pink-500/10 border border-pink-500/20">
                <svg
                  className="animate-spin w-4 h-4 text-pink-400 flex-shrink-0"
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
                    d="M4 12a8 8 0 018-8v8z"
                  />
                </svg>
                <p className="text-sm text-pink-300">
                  AI가 브랜드를 분석하고 있습니다… (약 30초)
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={analyzing || !prompt.trim()}
              onClick={handleAnalyze}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              style={{
                background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                color: "#000",
              }}
            >
              {analyzing ? "분석 중…" : "브랜드 분석 시작"}
            </button>
          </div>
        )}

        {/* ── Step 2: Product Registration ───────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white mb-1">
                첫 번째 제품 등록
              </h2>
              <p className="text-xs text-zinc-500">
                제품을 등록하면 제품 사진 생성 시 자동으로 연결됩니다. 나중에
                추가할 수도 있어요.
              </p>
            </div>

            {/* Product name */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                제품명 <span className="text-pink-400">*</span>
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="예: 모이스처 앰플 세럼"
                className="w-full px-3 py-2.5 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-pink-400/50 focus:outline-none"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                카테고리
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      category === c.value
                        ? "border-pink-400 bg-pink-400/10 text-pink-300"
                        : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                    }`}
                    style={
                      category !== c.value
                        ? { background: "var(--surface-2)" }
                        : undefined
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Packaging type */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                패키징 타입
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PACKAGING_TYPES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPackagingType(p.value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      packagingType === p.value
                        ? "border-pink-400 bg-pink-400/10 text-pink-300"
                        : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                    }`}
                    style={
                      packagingType !== p.value
                        ? { background: "var(--surface-2)" }
                        : undefined
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                제품 설명 <span className="text-zinc-600">(선택)</span>
              </label>
              <textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                rows={3}
                placeholder="제품의 특징, 성분, 사용감 등을 간략히 설명해주세요."
                className="w-full px-3 py-2.5 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-pink-400/50 focus:outline-none resize-none"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
              />
            </div>

            {productError && (
              <p className="text-red-400 text-sm">{productError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex-1 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
              >
                건너뛰기
              </button>
              <button
                type="button"
                disabled={savingProduct || !productName.trim()}
                onClick={handleSaveProduct}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                  color: "#000",
                }}
              >
                {savingProduct ? "저장 중…" : "제품 등록"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: First Image Generation ─────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white mb-1">
                첫 번째 이미지 생성
              </h2>
              <p className="text-xs text-zinc-500">
                브랜드 스타일을 기반으로 첫 번째 이미지를 만들어보세요.
              </p>
            </div>

            {/* Job type toggle */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                이미지 타입
              </label>
              <div className="flex gap-2">
                {JOB_TYPES.map((jt) => (
                  <button
                    key={jt.value}
                    type="button"
                    onClick={() => setJobType(jt.value)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      jobType === jt.value
                        ? "border-pink-400 bg-pink-400/10 text-pink-300"
                        : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                    }`}
                    style={
                      jobType !== jt.value
                        ? { background: "var(--surface-2)" }
                        : undefined
                    }
                  >
                    {jt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Generation prompt */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                추가 지시사항 <span className="text-zinc-600">(선택)</span>
              </label>
              <textarea
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                rows={3}
                placeholder="예: 새벽 빛이 스며드는 창가, 부드러운 흰색 대리석 위에 제품 배치"
                className="w-full px-3 py-2.5 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-pink-400/50 focus:outline-none resize-none"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
              />
            </div>

            {/* Result image */}
            {resultImageUrl && (
              <div
                className="rounded-xl overflow-hidden aspect-square"
                style={{ border: "1px solid var(--border-subtle)" }}
              >
                <img
                  src={resultImageUrl}
                  alt="생성된 이미지"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {genError && <p className="text-red-400 text-sm">{genError}</p>}

            {generating && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-pink-500/10 border border-pink-500/20">
                <svg
                  className="animate-spin w-4 h-4 text-pink-400 flex-shrink-0"
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
                    d="M4 12a8 8 0 018-8v8z"
                  />
                </svg>
                <p className="text-sm text-pink-300">
                  이미지를 생성하고 있습니다…
                </p>
              </div>
            )}

            {!resultImageUrl ? (
              <button
                type="button"
                disabled={generating}
                onClick={handleGenerate}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                  color: "#000",
                }}
              >
                {generating ? "생성 중…" : "이미지 생성"}
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => {
                    setResultImageUrl(null);
                    handleGenerate();
                  }}
                  className="flex-1 py-3 rounded-xl text-sm font-medium text-zinc-400 border border-zinc-700 hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
                >
                  재생성
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-opacity"
                  style={{
                    background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                    color: "#000",
                  }}
                >
                  완료 — 대시보드로
                </button>
              </div>
            )}

            {/* Skip without generating */}
            {!resultImageUrl && !generating && (
              <button
                type="button"
                onClick={handleFinish}
                className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
              >
                나중에 할게요 →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
