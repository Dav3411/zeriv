"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import {
  autoCropToProduct,
  autoCropTransparent,
  removeWhiteBackground,
  renderBundleThumbnail,
  loadImageEntry,
  classifyAspect,
} from "@/lib/thumbnailCanvas";

const MIN_COUNT = 1;
const MAX_COUNT = 30;

type ProcessingStep = false | "ai" | "crop" | "cutout" | "rendering";

const STEP_LABEL: Record<Exclude<ProcessingStep, false>, string> = {
  ai: "AI 변환 중…",
  crop: "크롭 최적화 중…",
  cutout: "누끼 처리 중…",
  rendering: "썸네일 생성 중…",
};

type BatchStatus = "pending" | "processing" | "done" | "error";

type BatchItem = {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
  status: BatchStatus;
  step?: Exclude<ProcessingStep, false>;
  resultUrl?: string;
  resultBlob?: Blob;
  errorMsg?: string;
};

const ZIP_MIME = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-zip",
  "multipart/x-zip",
]);

function isZipFile(file: File): boolean {
  return ZIP_MIME.has(file.type) || /\.zip$/i.test(file.name);
}

function isImageName(name: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(name);
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function extractImagesFromZip(zipFile: File): Promise<File[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const results: File[] = [];

  const entries = Object.entries(zip.files);
  // path 기준 정렬 — 사용자에게 일관된 순서 제공
  entries.sort(([a], [b]) => a.localeCompare(b));

  for (const [path, entry] of entries) {
    if (entry.dir) continue;
    if (path.startsWith("__MACOSX/")) continue;
    const fileName = path.split("/").pop() ?? path;
    // 숨김 파일/메타데이터 무시 (.DS_Store, ._foo 등)
    if (fileName.startsWith(".")) continue;
    if (!isImageName(fileName)) continue;

    const blob = await entry.async("blob");
    results.push(new File([blob], fileName, { type: mimeFromName(fileName) }));
  }

  return results;
}

function fileToBatchItem(file: File): BatchItem {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name,
    file,
    previewUrl: URL.createObjectURL(file),
    status: "pending",
  };
}

export function BundleThumbnail({
  isLoggedIn = true,
}: {
  isLoggedIn?: boolean;
}) {
  const router = useRouter();
  const { fetchWithAuth } = useFetchWithAuth();

  // 단일 모드 상태
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [countInput, setCountInput] = useState("1");
  const [rawAiBase64, setRawAiBase64] = useState<string | null>(null);
  const [aiBase64, setAiBase64] = useState<string | null>(null);
  const [productBase64, setProductBase64] = useState<string | null>(null);
  const [aspectClass, setAspectClass] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState<ProcessingStep>(false);

  // 공통
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 배치 모드 상태
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [zipDownloading, setZipDownloading] = useState(false);

  const isBatchMode = batchItems.length > 0;

  // 단일 파일 미리보기 URL 관리
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 최신 batchItems를 ref로 추적 — 언마운트 시점에 사용
  const batchItemsRef = useRef<BatchItem[]>([]);
  useEffect(() => {
    batchItemsRef.current = batchItems;
  }, [batchItems]);
  useEffect(() => {
    return () => {
      for (const it of batchItemsRef.current) {
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
        if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
      }
    };
  }, []);

  function updateItem(id: string, patch: Partial<BatchItem>) {
    setBatchItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }

  function clearSingleState() {
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFile(null);
    setRawAiBase64(null);
    setAiBase64(null);
    setProductBase64(null);
    setAspectClass(null);
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function clearBatchState() {
    for (const it of batchItems) {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
    }
    setBatchItems([]);
    setBatchRunning(false);
  }

  function selectSingleFile(f: File) {
    clearBatchState();
    setFile(f);
    setRawAiBase64(null);
    setAiBase64(null);
    setProductBase64(null);
    setAspectClass(null);
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError(null);
  }

  function setBatch(files: File[]) {
    clearSingleState();
    setBatchItems(files.map(fileToBatchItem));
    setError(null);
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);

    // ZIP 감지: 단일 파일이고 ZIP 인 경우
    if (files.length === 1 && isZipFile(files[0])) {
      try {
        const images = await extractImagesFromZip(files[0]);
        if (images.length === 0) {
          setError("ZIP에서 이미지를 찾을 수 없습니다.");
          return;
        }
        if (images.length === 1) {
          selectSingleFile(images[0]);
          return;
        }
        setBatch(images);
        return;
      } catch (e) {
        setError(
          e instanceof Error ? `ZIP 읽기 실패: ${e.message}` : "ZIP 읽기 실패",
        );
        return;
      }
    }

    // 다중 이미지(또는 단일 이미지)
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setError("이미지 파일을 선택해주세요.");
      return;
    }
    if (imageFiles.length === 1) {
      selectSingleFile(imageFiles[0]);
      return;
    }
    setBatch(imageFiles);
  }

  async function handleProcess() {
    if (!file || processing !== false) return;
    setError(null);
    setRawAiBase64(null);
    setAiBase64(null);
    setProductBase64(null);
    setResultUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      // 1. Gemini AI 변환
      setProcessing("ai");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetchWithAuth("/api/thumbnail/single", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }
      const { imageBase64 } = (await res.json()) as { imageBase64: string };
      setRawAiBase64(imageBase64);

      // 2. 제품 영역 크롭 (항상 실행)
      setProcessing("crop");
      const cropped = await autoCropToProduct(imageBase64);
      setAiBase64(cropped);

      // 3. 배경 투명화 + 타이트 크롭
      setProcessing("cutout");
      const transparent = await removeWhiteBackground(cropped);
      const tight = await autoCropTransparent(transparent);
      setProductBase64(tight);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessing(false);
    }
  }

  // productBase64 또는 수량 변경 시 결과 생성 (단일 모드 전용)
  useEffect(() => {
    if (!productBase64) {
      setResultUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let cancelled = false;

    (async () => {
      setProcessing("rendering");
      setError(null);
      try {
        const entry = await loadImageEntry(
          `data:image/png;base64,${productBase64}`,
        );
        if (cancelled) return;
        setAspectClass(classifyAspect(entry.naturalWidth, entry.naturalHeight));
        const entries = Array.from({ length: count }, () => entry);
        const blob = await renderBundleThumbnail(entries);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setResultUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setProcessing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productBase64, count]);

  // 배치 처리 — 순차 실행 (rate limit 방지)
  async function runBatch() {
    if (batchRunning) return;
    setBatchRunning(true);
    setError(null);

    // setBatchItems 후 다음 tick에 화면 반영을 보장하기 위해 latest snapshot 활용
    const snapshot = batchItemsRef.current;

    for (const item of snapshot) {
      if (item.status === "done") continue;

      updateItem(item.id, {
        status: "processing",
        step: "ai",
        errorMsg: undefined,
      });
      // 상태 업데이트가 화면에 반영될 시간을 부여
      await new Promise((r) => setTimeout(r, 0));

      try {
        // AI
        const formData = new FormData();
        formData.append("file", item.file);
        const res = await fetchWithAuth("/api/thumbnail/single", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(
            (json as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        }
        const { imageBase64 } = (await res.json()) as { imageBase64: string };

        // crop
        updateItem(item.id, { step: "crop" });
        await new Promise((r) => setTimeout(r, 0));
        const cropped = await autoCropToProduct(imageBase64);

        // cutout
        updateItem(item.id, { step: "cutout" });
        await new Promise((r) => setTimeout(r, 0));
        const transparent = await removeWhiteBackground(cropped);
        const tight = await autoCropTransparent(transparent);

        // rendering — 배치는 항상 count=1
        updateItem(item.id, { step: "rendering" });
        await new Promise((r) => setTimeout(r, 0));
        const entry = await loadImageEntry(`data:image/png;base64,${tight}`);
        const resultBlob = await renderBundleThumbnail([entry]);
        const resultUrl = URL.createObjectURL(resultBlob);

        updateItem(item.id, {
          status: "done",
          step: undefined,
          resultUrl,
          resultBlob,
        });
      } catch (e) {
        updateItem(item.id, {
          status: "error",
          step: undefined,
          errorMsg: e instanceof Error ? e.message : String(e),
        });
      }
    }

    setBatchRunning(false);
  }

  function handleSingleDownload() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download =
      count === 1
        ? `coupang-thumbnail-${Date.now()}.png`
        : `coupang-bundle-${count}ea-${Date.now()}.png`;
    a.click();
  }

  function handleItemDownload(item: BatchItem) {
    if (!item.resultUrl) return;
    const a = document.createElement("a");
    a.href = item.resultUrl;
    const baseName = item.name.replace(/\.[^.]+$/, "");
    a.download = `${baseName}-thumbnail.png`;
    a.click();
  }

  async function handleDownloadAllZip() {
    if (zipDownloading) return;
    const doneItems = batchItems.filter(
      (it) => it.status === "done" && it.resultBlob,
    );
    if (doneItems.length === 0) return;

    setZipDownloading(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      // 동일 baseName 충돌 시 suffix 부여
      const usedNames = new Set<string>();
      for (const item of doneItems) {
        const blob = item.resultBlob;
        if (!blob) continue;
        const baseName = item.name.replace(/\.[^.]+$/, "");
        let candidate = `${baseName}-thumbnail.png`;
        let n = 2;
        while (usedNames.has(candidate)) {
          candidate = `${baseName}-thumbnail-${n}.png`;
          n += 1;
        }
        usedNames.add(candidate);
        zip.file(candidate, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `coupang-thumbnails-${Date.now()}.zip`;
      a.click();
      // 다운로드 큐잉 시간 확보 후 revoke
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError(
        e instanceof Error ? `ZIP 생성 실패: ${e.message}` : "ZIP 생성 실패",
      );
    } finally {
      setZipDownloading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (isProcessingAny) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFiles(files);
  }

  const isProcessing = processing !== false;
  const isProcessingAny = isProcessing || batchRunning || zipDownloading;

  const batchTotal = batchItems.length;
  const batchDone = batchItems.filter((it) => it.status === "done").length;
  const batchError = batchItems.filter((it) => it.status === "error").length;
  const allFinished =
    batchTotal > 0 &&
    batchItems.every((it) => it.status === "done" || it.status === "error");
  const hasAnyDone = batchDone > 0;

  return (
    <div className="space-y-6">
      {/* 업로드 영역 */}
      {!isBatchMode && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isProcessingAny && inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors py-12 ${
            isProcessingAny
              ? "border-zinc-700 cursor-default opacity-60"
              : isDragging
                ? "border-pink-400/60 bg-pink-500/5 cursor-pointer"
                : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/40 cursor-pointer"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/zip,.zip"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) handleFiles(files);
              e.target.value = "";
            }}
          />
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-400"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <p className="text-sm text-zinc-400">
            제품 이미지를 끌어다 놓거나{" "}
            <span className="text-pink-400">클릭</span>해서 선택
          </p>
          <p className="text-xs text-zinc-600">
            JPG, PNG, WebP — 다중 선택 또는 ZIP 업로드 지원
          </p>
        </div>
      )}

      {/* ===== 단일 모드 ===== */}
      {!isBatchMode && (
        <>
          {/* 수량 입력 */}
          <div className="flex items-center gap-4">
            <label className="text-sm text-zinc-400 whitespace-nowrap">
              수량
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const v = Math.max(MIN_COUNT, count - 1);
                  setCount(v);
                  setCountInput(String(v));
                }}
                disabled={count <= MIN_COUNT || isProcessing}
                className="w-8 h-8 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-base"
              >
                −
              </button>
              <input
                type="number"
                min={MIN_COUNT}
                max={MAX_COUNT}
                value={countInput}
                disabled={isProcessing}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setCountInput(e.target.value)}
                onBlur={(e) => {
                  const v = parseInt(e.target.value, 10);
                  const clamped = isNaN(v)
                    ? count
                    : Math.min(MAX_COUNT, Math.max(MIN_COUNT, v));
                  setCount(clamped);
                  setCountInput(String(clamped));
                }}
                className="w-12 text-center text-sm font-medium text-zinc-200 bg-transparent border border-zinc-700 rounded-lg px-1 py-1 focus:outline-none focus:border-zinc-500 disabled:opacity-30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={() => {
                  const v = Math.min(MAX_COUNT, count + 1);
                  setCount(v);
                  setCountInput(String(v));
                }}
                disabled={count >= MAX_COUNT || isProcessing}
                className="w-8 h-8 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-base"
              >
                +
              </button>
            </div>
            <span className="text-xs text-zinc-600">
              개 ({MIN_COUNT}~{MAX_COUNT})
            </span>
          </div>

          {/* 처리 단계 표시 */}
          {processing !== false && (
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <svg
                className="animate-spin w-4 h-4 text-pink-400 shrink-0"
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
              {STEP_LABEL[processing]}
            </div>
          )}

          {/* 미리보기 */}
          {(objectUrl || rawAiBase64 || aiBase64 || productBase64) && (
            <div className="flex gap-4 items-start flex-wrap">
              {objectUrl && (
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
                    원본
                  </p>
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={objectUrl}
                      alt="원본"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
              {rawAiBase64 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
                    AI 생성
                  </p>
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-zinc-800 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/png;base64,${rawAiBase64}`}
                      alt="AI 생성"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}
              {aiBase64 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
                    AI 변환
                  </p>
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-zinc-800 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/png;base64,${aiBase64}`}
                      alt="AI 변환"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}
              {productBase64 && count >= 2 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
                    누끼
                  </p>
                  <div
                    className="w-20 h-20 rounded-xl overflow-hidden border border-zinc-800"
                    style={{
                      backgroundImage:
                        "linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)",
                      backgroundSize: "8px 8px",
                      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/png;base64,${productBase64}`}
                      alt="누끼"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}
              {aspectClass && (
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
                    비율
                  </p>
                  <span className="inline-block px-2 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300">
                    {aspectClass}
                  </span>
                </div>
              )}
              {objectUrl && (
                <div className="pt-6">
                  <button
                    onClick={() => clearSingleState()}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    제거
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 확인 버튼 */}
          {file && !productBase64 && !isProcessing && (
            <button
              onClick={() =>
                isLoggedIn ? handleProcess() : router.push("/signup")
              }
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                color: "#000",
              }}
            >
              확인
            </button>
          )}

          {/* 결과 미리보기 */}
          {(processing === "rendering" || resultUrl) && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
                {count === 1
                  ? "단일 제품 썸네일"
                  : `묶음 썸네일 미리보기 (${count}개)`}
              </p>
              <div className="rounded-xl overflow-hidden border border-zinc-800 max-w-[400px] aspect-square flex items-center justify-center bg-white">
                {processing === "rendering" ? (
                  <svg
                    className="animate-spin w-8 h-8 text-pink-400"
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
                ) : resultUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resultUrl}
                    alt="썸네일"
                    className="w-full h-full object-contain"
                  />
                ) : null}
              </div>
            </div>
          )}

          {resultUrl && !isProcessing && (
            <button
              onClick={handleSingleDownload}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                color: "#000",
              }}
            >
              PNG 다운로드
            </button>
          )}
        </>
      )}

      {/* ===== 배치 모드 ===== */}
      {isBatchMode && (
        <div className="space-y-4">
          {/* 헤더 */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-zinc-300">
              <span className="font-medium">{batchTotal}개</span>의 이미지 —{" "}
              <span className="text-zinc-400">
                완료 {batchDone}
                {batchError > 0 ? ` · 실패 ${batchError}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!batchRunning && !allFinished && (
                <button
                  onClick={() =>
                    isLoggedIn ? runBatch() : router.push("/signup")
                  }
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                    color: "#000",
                  }}
                >
                  처리 시작
                </button>
              )}
              {batchRunning && (
                <span className="flex items-center gap-2 text-sm text-zinc-400">
                  <svg
                    className="animate-spin w-4 h-4 text-pink-400 shrink-0"
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
                  처리 중… ({batchDone + batchError}/{batchTotal})
                </span>
              )}
              {allFinished && hasAnyDone && (
                <button
                  onClick={handleDownloadAllZip}
                  disabled={zipDownloading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                  style={{
                    background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                    color: "#000",
                  }}
                >
                  {zipDownloading ? "ZIP 생성 중…" : "전체 ZIP 다운로드"}
                </button>
              )}
              <button
                onClick={() => clearBatchState()}
                disabled={batchRunning || zipDownloading}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2"
              >
                초기화
              </button>
            </div>
          </div>

          {/* 항목 리스트 */}
          <div className="space-y-2">
            {batchItems.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3"
              >
                {/* 원본 썸네일 */}
                <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.previewUrl}
                    alt={it.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* 결과 썸네일 (완료 시) */}
                {it.status === "done" && it.resultUrl && (
                  <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden border border-zinc-800 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.resultUrl}
                      alt={`${it.name} 결과`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}

                {/* 본문 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate" title={it.name}>
                    {it.name}
                  </p>
                  <div className="mt-1">
                    {it.status === "pending" && (
                      <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-400">
                        대기
                      </span>
                    )}
                    {it.status === "processing" && (
                      <span className="flex items-center gap-2 text-xs text-zinc-400">
                        <svg
                          className="animate-spin w-3.5 h-3.5 text-pink-400 shrink-0"
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
                        {it.step ? STEP_LABEL[it.step] : "처리 중…"}
                      </span>
                    )}
                    {it.status === "done" && (
                      <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        완료
                      </span>
                    )}
                    {it.status === "error" && (
                      <span
                        className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-red-500/10 text-red-300 border border-red-500/20"
                        title={it.errorMsg}
                      >
                        실패
                        {it.errorMsg ? ` · ${it.errorMsg}` : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* 액션 */}
                <div className="shrink-0">
                  {it.status === "done" && it.resultUrl && (
                    <button
                      onClick={() => handleItemDownload(it)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
                    >
                      다운로드
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
