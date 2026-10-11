"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { useBrand } from "@/components/BrandProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import type { ProductCategory } from "@/lib/brandProduct/brandProduct.types";

// ── Constants ─────────────────────────────────────────────

const CATEGORIES: { value: ProductCategory; label: string }[] = [
  { value: "skincare", label: "스킨케어" },
  { value: "makeup", label: "메이크업" },
  { value: "haircare", label: "헤어케어" },
  { value: "bodycare", label: "바디케어" },
  { value: "fragrance", label: "향수" },
  { value: "supplement", label: "건강기능식품" },
  { value: "food_beverage", label: "식품·음료" },
  { value: "fashion", label: "패션" },
  { value: "accessory", label: "액세서리" },
  { value: "electronics", label: "전자기기" },
  { value: "home", label: "홈/리빙" },
  { value: "other", label: "기타" },
];

// ── Crop modal ─────────────────────────────────────────────

function CropModal({
  imageSrc,
  initialCrop,
  onCropped,
  onUseOriginal,
  onCancel,
}: {
  imageSrc: string;
  initialCrop?: Crop;
  onCropped: (file: File, preview: string, crop: Crop) => void;
  onUseOriginal: () => void;
  onCancel: () => void;
}) {
  const defaultCrop = initialCrop ?? {
    unit: "%" as const,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
  const [crop, setCrop] = useState<Crop>(defaultCrop);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [changed, setChanged] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      imgRef.current = img;
      const c = initialCrop ?? {
        unit: "%" as const,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };
      const px: PixelCrop = {
        unit: "px",
        x: (c.x / 100) * img.width,
        y: (c.y / 100) * img.height,
        width: (c.width / 100) * img.width,
        height: (c.height / 100) * img.height,
      };
      setCompletedCrop(px);
    },
    [initialCrop],
  );

  const handleConfirm = useCallback(() => {
    if (!changed) {
      onUseOriginal();
      return;
    }
    const image = imgRef.current;
    if (!image || !completedCrop) return;

    const canvas = document.createElement("canvas");
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "cropped.png", { type: "image/png" });
      const preview = URL.createObjectURL(blob);
      onCropped(file, preview, crop);
    }, "image/png");
  }, [changed, completedCrop, crop, onCropped, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="rounded-2xl overflow-hidden max-w-2xl w-full"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        <div className="px-6 pt-5 pb-2 flex items-center justify-between">
          <h3
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            이미지 크롭
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <svg
              width="18"
              height="18"
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
        <div
          className="px-6 py-4 flex items-center justify-center"
          style={{ maxHeight: "60vh" }}
        >
          <ReactCrop
            crop={crop}
            onChange={(c) => {
              setCrop(c);
              setChanged(true);
            }}
            onComplete={(c) => setCompletedCrop(c)}
          >
            <img
              src={imageSrc}
              alt=""
              onLoad={onImageLoad}
              style={{ maxHeight: "55vh", maxWidth: "100%" }}
            />
          </ReactCrop>
        </div>
        <div
          className="flex items-center justify-end gap-3 px-6 py-4"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={onUseOriginal}
            className="px-4 py-1.5 rounded-xl text-sm font-medium transition-all"
            style={{ color: "var(--text-muted)" }}
          >
            원본 사용
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-full text-sm font-bold active:scale-95"
            style={{
              background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
              color: "#000",
              boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
            }}
          >
            크롭 적용
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────

export default function NewProductPage() {
  const { brandId } = useBrand();
  const { fetchWithAuth } = useFetchWithAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [productCategory, setProductCategory] =
    useState<ProductCategory>("skincare");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [dragging, setDragging] = useState(false);
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const [cropOriginalFiles, setCropOriginalFiles] = useState<File[]>([]);
  const [recropIndex, setRecropIndex] = useState<number | null>(null);
  const [recropSrc, setRecropSrc] = useState<string | null>(null);
  const [originalFiles, setOriginalFiles] = useState<File[]>([]);
  const [savedCrops, setSavedCrops] = useState<(Crop | undefined)[]>([]);

  const addFiles = (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setCropOriginalFiles(imageFiles);
    setCropQueue(imageFiles.map((f) => URL.createObjectURL(f)));
  };

  const handleCropped = (file: File, preview: string, cropData: Crop) => {
    if (recropIndex !== null) {
      setImages((prev) => prev.map((f, i) => (i === recropIndex ? file : f)));
      setImagePreviews((prev) => {
        URL.revokeObjectURL(prev[recropIndex]);
        return prev.map((p, i) => (i === recropIndex ? preview : p));
      });
      setSavedCrops((prev) =>
        prev.map((c, i) => (i === recropIndex ? cropData : c)),
      );
      if (recropSrc) URL.revokeObjectURL(recropSrc);
      setRecropIndex(null);
      setRecropSrc(null);
    } else {
      setImages((prev) => [...prev, file]);
      setImagePreviews((prev) => [...prev, preview]);
      setOriginalFiles((prev) => [...prev, cropOriginalFiles[0]]);
      setSavedCrops((prev) => [...prev, cropData]);
      setCropQueue((prev) => prev.slice(1));
      setCropOriginalFiles((prev) => prev.slice(1));
    }
  };

  const handleCropCancel = () => {
    if (recropIndex !== null) {
      if (recropSrc) URL.revokeObjectURL(recropSrc);
      setRecropIndex(null);
      setRecropSrc(null);
    } else {
      setCropQueue((prev) => {
        URL.revokeObjectURL(prev[0]);
        return prev.slice(1);
      });
      setCropOriginalFiles((prev) => prev.slice(1));
    }
  };

  const handleUseOriginal = () => {
    if (recropIndex !== null) {
      const original = originalFiles[recropIndex];
      const preview = URL.createObjectURL(original);
      setImages((prev) =>
        prev.map((f, i) => (i === recropIndex ? original : f)),
      );
      setImagePreviews((prev) => {
        URL.revokeObjectURL(prev[recropIndex]);
        return prev.map((p, i) => (i === recropIndex ? preview : p));
      });
      setSavedCrops((prev) =>
        prev.map((c, i) => (i === recropIndex ? undefined : c)),
      );
      if (recropSrc) URL.revokeObjectURL(recropSrc);
      setRecropIndex(null);
      setRecropSrc(null);
    } else {
      const original = cropOriginalFiles[0];
      const preview = cropQueue[0];
      if (original) {
        setImages((prev) => [...prev, original]);
        setImagePreviews((prev) => [...prev, preview]);
        setOriginalFiles((prev) => [...prev, original]);
        setSavedCrops((prev) => [...prev, undefined]);
      }
      setCropQueue((prev) => prev.slice(1));
      setCropOriginalFiles((prev) => prev.slice(1));
    }
  };

  const startRecrop = (idx: number) => {
    const src = URL.createObjectURL(originalFiles[idx]);
    setRecropIndex(idx);
    setRecropSrc(src);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
    setOriginalFiles((prev) => prev.filter((_, i) => i !== idx));
    setSavedCrops((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandId || !name.trim()) {
      setError("제품명을 입력해주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("productCategory", productCategory);
      if (description.trim()) fd.append("description", description.trim());
      images.forEach((img) => fd.append("images", img));
      const res = await fetchWithAuth(`/api/brands/${brandId}/products`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      router.push(`/${brandId}/assets`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl 2xl:max-w-7xl mx-auto px-4 md:px-8">
      {/* ── Hero Banner (이미지 위에 텍스트 오버랩) ─────────── */}
      <div
        className="relative overflow-hidden rounded-2xl mb-8"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        {/* 배경 이미지 */}
        <img
          src="/examples/products/banner.png"
          alt=""
          className="w-full h-48 md:h-56 object-cover object-center"
        />
        {/* 하단 그라디언트: 이미지 → 배경색으로 자연스럽게 페이드 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, transparent 20%, rgba(9,9,11,0.4) 45%, rgba(9,9,11,0.85) 65%, var(--surface-0) 90%)",
          }}
        />
        {/* 텍스트 (하단에 겹침) */}
        <div className="absolute inset-x-0 bottom-0 px-8 pb-6 pt-16">
          <h1 className="text-3xl font-bold text-always-white tracking-tight">
            제품 등록
          </h1>
          <p className="text-sm text-white/70 mt-2 max-w-md leading-relaxed">
            제품 이름과 사진을 등록하세요. 등록된 제품은 스튜디오에서 이미지
            생성 시 착용 아이템으로 활용됩니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── 2-Column: Info + Upload ──────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LEFT: 제품 정보 */}
          <div
            className="rounded-2xl p-8 space-y-6"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <h2
                className="text-xl font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                제품 정보
              </h2>
            </div>

            <div className="space-y-5">
              <div>
                <label
                  className="block text-[11px] uppercase tracking-widest font-semibold mb-2"
                  style={{ color: "rgba(255,164,198,0.45)" }}
                >
                  제품명 *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 수분 세럼 200ml"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all placeholder:text-[color:var(--text-muted)]"
                  style={{
                    color: "var(--text-primary)",
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-subtle)",
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label
                  className="block text-[11px] uppercase tracking-widest font-semibold mb-2"
                  style={{ color: "rgba(255,164,198,0.45)" }}
                >
                  카테고리
                </label>
                <select
                  value={productCategory}
                  onChange={(e) =>
                    setProductCategory(e.target.value as ProductCategory)
                  }
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all cursor-pointer"
                  style={{
                    color: "var(--text-primary)",
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {CATEGORIES.map(({ value, label }) => (
                    <option
                      key={value}
                      value={value}
                      style={{
                        background: "var(--surface-1)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="block text-[11px] uppercase tracking-widest font-semibold mb-2"
                  style={{ color: "rgba(255,164,198,0.45)" }}
                >
                  제품 설명{" "}
                  <span
                    className="normal-case tracking-normal font-normal"
                    style={{ color: "var(--text-muted)" }}
                  >
                    (선택)
                  </span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="예: 수분 진정에 특화된 20대 여성 타겟 세럼, 히알루론산 함유"
                  rows={5}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all resize-none placeholder:text-[color:var(--text-muted)]"
                  style={{
                    color: "var(--text-primary)",
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-subtle)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* RIGHT: 제품 사진 */}
          <div
            className="rounded-2xl p-8 flex flex-col gap-5"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div>
              <h2
                className="text-xl font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                제품 사진
              </h2>
              <p
                className="text-sm mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                첫 번째 이미지가 대표 이미지로 사용됩니다
              </p>
            </div>

            <div className="flex-1 flex flex-col">
              {imagePreviews.length === 0 ? (
                <label
                  className={`flex-1 flex flex-col items-center justify-center rounded-2xl border border-dashed cursor-pointer transition-all hover:border-pink-400/40 hover:bg-pink-500/5 min-h-[240px] ${dragging ? "border-pink-400/50 bg-pink-500/5" : ""}`}
                  style={{
                    borderColor: dragging ? undefined : "var(--border-default)",
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      style={{ color: "var(--text-secondary)" }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {dragging
                      ? "여기에 놓으세요"
                      : "클릭 또는 드래그하여 업로드"}
                  </span>
                  <span
                    className="text-xs mt-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    JPG, PNG · 최대 10장
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              ) : (
                <div
                  className={`grid grid-cols-3 gap-2.5 transition-colors rounded-2xl ${dragging ? "ring-2 ring-pink-400/50" : ""}`}
                >
                  {imagePreviews.map((src, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square rounded-xl overflow-hidden group"
                      style={{ border: "1px solid var(--border-subtle)" }}
                    >
                      <img
                        src={src}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <button
                        type="button"
                        onClick={() => startRecrop(idx)}
                        className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                        title="크롭 수정"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M6.13 1L6 16a2 2 0 002 2h15" />
                          <path d="M1 6.13L16 6a2 2 0 012 2v15" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                      {idx === 0 && (
                        <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-pink-500/20 text-pink-700 border border-pink-400/20">
                          대표
                        </span>
                      )}
                    </div>
                  ))}
                  <label
                    className="flex flex-col items-center justify-center aspect-square rounded-xl border border-dashed cursor-pointer transition-colors hover:border-pink-400/40 hover:bg-pink-500/5"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="mb-1"
                      style={{ color: "var(--text-muted)" }}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      추가
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Error ─────────────────────────────────────────── */}
        {error && (
          <div
            className="rounded-2xl px-6 py-4 mt-8 text-sm"
            style={{
              color: "#ef4444",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(248,113,113,0.2)",
            }}
          >
            {error}
          </div>
        )}

        {/* ── CTA Button ───────────────────────────────────── */}
        <div className="pt-14 pb-14">
          <button
            type="submit"
            disabled={saving || !name.trim() || images.length === 0}
            className="flex items-center justify-center gap-2 pl-6 pr-2.5 py-3 text-base rounded-full font-bold active:scale-95 w-full"
            style={{
              background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
              color: "#000",
              boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
            }}
          >
            {saving ? "등록 중…" : "제품 등록하기"}
          </button>
        </div>

        {/* ── Tips with example images ─────────────────────── */}
        <section className="pt-32 pb-24 space-y-10">
          <div className="text-center space-y-3 pb-2">
            <h2
              className="text-2xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              좋은 제품 사진이란?
            </h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              아래 조건을 갖춘 사진일수록 재현 정확도가 높아집니다.
            </p>
          </div>

          <div className="space-y-10">
            {[
              {
                img: "/examples/products/tip-clean-bg.png",
                badge: "TIP 01",
                title: "깔끔한 배경",
                desc: "단색 또는 그라데이션 배경에서 촬영한 사진이 가장 좋은 결과를 만듭니다. 복잡한 배경은 제품 인식이 어렵습니다.",
              },
              {
                img: "/examples/products/tip-front-view.png",
                badge: "TIP 02",
                title: "정면 사진 우선",
                desc: "정면 사진을 대표 이미지로 등록하세요. 측면, 후면 등 다양한 각도를 추가하면 더 정확한 결과를 얻을 수 있습니다.",
              },
              {
                img: "/examples/products/tip-high-res.png",
                badge: "TIP 03",
                title: "고해상도 권장",
                desc: "1000px 이상의 선명한 이미지를 사용하세요. 라벨, 텍스트, 질감이 또렷할수록 재현 정확도가 높아집니다.",
              },
            ].map(({ img, badge, title, desc }, i) => (
              <div
                key={badge}
                className={`flex items-stretch rounded-3xl overflow-hidden group ${i % 2 === 1 ? "flex-row-reverse" : ""}`}
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div className="relative w-1/2 shrink-0 overflow-hidden">
                  <img
                    src={img}
                    alt={title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />
                  <span
                    className="absolute top-5 left-5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider"
                    style={{ background: "rgba(0,0,0,0.6)", color: "#ffa4c6" }}
                  >
                    {badge}
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center p-10 space-y-4">
                  <h3
                    className="text-lg font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </form>

      {/* Crop modal */}
      {(cropQueue.length > 0 || recropSrc) && (
        <CropModal
          imageSrc={recropSrc ?? cropQueue[0]}
          initialCrop={
            recropIndex !== null ? savedCrops[recropIndex] : undefined
          }
          onCropped={handleCropped}
          onUseOriginal={handleUseOriginal}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
