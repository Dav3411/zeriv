"use client";

/**
 * /tools/coupang-thumbnail-size — SEO lead magnet 도구 페이지.
 *
 * 클라이언트 사이드 100%:
 *   - 이미지 업로드 (JPG/PNG/WEBP, 최대 5장, 10MB/장)
 *   - Canvas API로 10채널 사이즈 변환 (흰 배경 + contain 중앙 정렬 + JPEG 0.9)
 *   - JSZip으로 ZIP 생성 (단일 원본: 평탄, 다중 원본: 폴더 구조)
 *   - 가입 유도 AI CTA 카드 → /guest/quick
 *
 * 서버 호출 없음. metadata는 layout.tsx에 분리.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GuestSiteHeader } from "@/components/GuestSiteHeader";
import { GuestFooter } from "@/components/GuestFooter";
import {
  CHANNEL_PRESETS,
  CHANNEL_GROUPS,
  CHANNEL_PRESETS_MAP,
  type ChannelKey,
} from "@/lib/channelPresets";

// ─── 상수 ──────────────────────────────────────────────────────────────────

const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const JPEG_QUALITY = 0.9;
const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"];

const SEO_GUIDE_ROWS: { channel: string; spec: string }[] = [
  { channel: "쿠팡", spec: "800×800px (1:1), JPEG, 흰 배경 권장" },
  { channel: "스마트스토어", spec: "860×860px (1:1), JPEG/PNG" },
  { channel: "올리브영", spec: "760×760px (1:1), JPEG" },
  { channel: "인스타그램 피드 4:5", spec: "1080×1350px (4:5), JPG/PNG" },
  { channel: "인스타그램 피드 1:1", spec: "1080×1080px (1:1), JPG/PNG" },
  { channel: "인스타그램 스토리", spec: "1080×1920px (9:16), JPG/PNG" },
  { channel: "메타 광고 (가로)", spec: "1200×628px (16:9), JPG/PNG, 20MB 이하" },
  { channel: "네이버 DA 광고", spec: "600×500px (6:5), JPG/PNG" },
  { channel: "카카오 비즈보드", spec: "1029×258px (4:1), JPG/PNG" },
  { channel: "유튜브 썸네일", spec: "1280×720px (16:9), JPG/PNG, 2MB 이하" },
];

// ─── 타입 ──────────────────────────────────────────────────────────────────

type SourceFile = {
  id: string;
  file: File;
  objectUrl: string;
};

type ChannelResult = {
  key: ChannelKey;
  blobUrl: string;
  filename: string;
};

type FileResult = {
  sourceId: string;
  sourceName: string;
  channels: ChannelResult[];
};

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * 이미지를 주어진 w×h로 흰 배경 + contain 중앙 정렬하여 JPEG Blob 반환.
 */
async function resizeToChannel(
  img: HTMLImageElement,
  w: number,
  h: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // 흰 배경
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // contain 중앙 정렬
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const sw = img.naturalWidth * scale;
  const sh = img.naturalHeight * scale;
  const ox = (w - sw) / 2;
  const oy = (h - sh) / 2;
  ctx.drawImage(img, ox, oy, sw, sh);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas toBlob 실패"));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = objectUrl;
  });
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────────

export default function CoupangThumbnailPage() {
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [results, setResults] = useState<FileResult[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [showAiCta, setShowAiCta] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // sources, results ref: unmount 시 objectUrl 정리에 사용
  const sourcesRef = useRef(sources);
  const resultsRef = useRef(results);
  sourcesRef.current = sources;
  resultsRef.current = results;

  // objectUrl 정리 (unmount 시)
  useEffect(() => {
    return () => {
      for (const src of sourcesRef.current) URL.revokeObjectURL(src.objectUrl);
      for (const r of resultsRef.current)
        for (const ch of r.channels) URL.revokeObjectURL(ch.blobUrl);
    };
  }, []);

  const validateFiles = useCallback((files: File[]): File[] | null => {
    const filtered = files.filter((f) => ACCEPTED_MIME.includes(f.type));
    if (filtered.length === 0) {
      setErrorMsg("JPG, PNG, WEBP 파일만 업로드할 수 있습니다.");
      return null;
    }
    const oversized = filtered.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) {
      setErrorMsg(`파일 크기가 10MB를 초과합니다: ${oversized.name}`);
      return null;
    }
    const totalAfter = sources.length + filtered.length;
    if (totalAfter > MAX_FILES) {
      setErrorMsg(`최대 ${MAX_FILES}장까지 업로드할 수 있습니다.`);
      return null;
    }
    return filtered;
  }, [sources.length]);

  const processFiles = useCallback(async (files: File[]) => {
    const valid = validateFiles(files);
    if (!valid) return;

    setErrorMsg(null);
    setIsConverting(true);

    // 이전 결과 objectUrl 해제
    for (const r of results)
      for (const ch of r.channels) URL.revokeObjectURL(ch.blobUrl);

    const newSources: SourceFile[] = valid.map((f) => ({
      id: uid(),
      file: f,
      objectUrl: URL.createObjectURL(f),
    }));

    // 기존 + 신규 소스 합산
    const allSources = [...sources, ...newSources];
    setSources(allSources);

    try {
      const allResults: FileResult[] = await Promise.all(
        allSources.map(async (src) => {
          const img = await loadImage(src.objectUrl);
          const channels: ChannelResult[] = await Promise.all(
            CHANNEL_PRESETS.map(async (preset) => {
              const blob = await resizeToChannel(img, preset.w, preset.h);
              return {
                key: preset.key as ChannelKey,
                blobUrl: URL.createObjectURL(blob),
                filename: preset.filename,
              };
            }),
          );
          return {
            sourceId: src.id,
            sourceName: src.file.name,
            channels,
          };
        }),
      );
      setResults(allResults);
    } catch {
      setErrorMsg("이미지 변환 중 오류가 발생했습니다. 다른 파일로 시도해 주세요.");
    } finally {
      setIsConverting(false);
    }
  }, [sources, results, validateFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void processFiles(files);
    // 같은 파일 재선택 허용
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    void processFiles(files);
  };

  const handleReset = () => {
    for (const src of sources) URL.revokeObjectURL(src.objectUrl);
    for (const r of results) for (const ch of r.channels) URL.revokeObjectURL(ch.blobUrl);
    setSources([]);
    setResults([]);
    setErrorMsg(null);
    setShowAiCta(true);
  };

  const handleDownloadSingle = (blobUrl: string, filename: string) => {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
  };

  const handleDownloadZip = async () => {
    if (results.length === 0) return;
    setIsZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const isMultiple = results.length > 1;

      for (const fileResult of results) {
        const baseName = fileResult.sourceName.replace(/\.[^.]+$/, "");
        for (const ch of fileResult.channels) {
          const response = await fetch(ch.blobUrl);
          const arrayBuffer = await response.arrayBuffer();
          const path = isMultiple
            ? `${baseName}/${ch.filename}`
            : ch.filename;
          zip.file(path, arrayBuffer);
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zeriv-coupang-thumbnails.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setErrorMsg("ZIP 생성 중 오류가 발생했습니다.");
    } finally {
      setIsZipping(false);
    }
  };

  const hasResults = results.length > 0;

  return (
    <>
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "쿠팡 썸네일 사이즈 변환기",
            url: "http://localhost:3000/tools/coupang-thumbnail-size",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "KRW",
            },
            description:
              "쿠팡·스마트스토어·올리브영·인스타·메타·카카오 등 10채널 썸네일 사이즈 자동 변환 무료 도구",
            inLanguage: "ko",
            isAccessibleForFree: true,
            creator: {
              "@type": "Organization",
              name: "Zeriv",
              url: "http://localhost:3000",
            },
          }).replace(/</g, "\\u003c"),
        }}
      />

      {/* 레이아웃 */}
      <div
        className="min-h-screen flex flex-col"
        style={{ background: "#09090b" }}
      >
        <GuestSiteHeader />

        {/* pt-[60px]: GuestSiteHeader fixed 높이 보정 */}
        <main className="flex-1 pt-[60px]">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">

            {/* ── 헤딩 ───────────────────────────────────────────────── */}
            {!hasResults && (
              <div className="mb-12">
                <h1
                  className="text-2xl sm:text-3xl font-bold text-zinc-100"
                  style={{ wordBreak: "keep-all" }}
                >
                  쿠팡 썸네일 사이즈 자동 맞추기
                </h1>
                <p className="text-sm text-zinc-400 mt-3">
                  800×800 · 스마트스토어 860 · SNS · 광고 — 10채널 무료 변환
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  감성컷·모델컷·컬러 배경 — 어떤 원본이든 그대로 사이즈만 정확히
                </p>
              </div>
            )}

            {/* ── 결과 상태: 소스 칩 ─────────────────────────────────── */}
            {hasResults && (
              <div className="flex flex-wrap gap-2 mb-6">
                {sources.map((src) => (
                  <span
                    key={src.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-zinc-400"
                    style={{
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className="w-3 h-3 shrink-0"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M3 2a1 1 0 0 1 1-1h5.586a1 1 0 0 1 .707.293l3.414 3.414A1 1 0 0 1 14 5.414V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2z" />
                    </svg>
                    {src.file.name}
                  </span>
                ))}
                {sources.length < MAX_FILES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                    style={{
                      border: "1px dashed rgba(255,255,255,0.12)",
                    }}
                  >
                    + 추가
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs text-zinc-600 transition-colors hover:text-zinc-400"
                >
                  초기화
                </button>
              </div>
            )}

            {/* ── 다중 원본 안내 (미리보기는 첫 장만, ZIP은 전체) ─────── */}
            {hasResults && sources.length > 1 && (
              <p className="text-xs text-zinc-600 mb-4">
                미리보기는 첫 번째 파일 기준 · ZIP에 전체 {sources.length}장 포함
              </p>
            )}

            {/* ── DropZone (초기 상태) ────────────────────────────────── */}
            {!hasResults && (
              <div
                role="button"
                tabIndex={0}
                aria-label="이미지 파일을 드롭하거나 클릭해서 선택"
                className="relative rounded-2xl cursor-pointer transition-all min-h-[160px] sm:min-h-[240px] flex flex-col items-center justify-center gap-4 py-12 px-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,164,198,0.5)]"
                style={{
                  border: `2px dashed ${isDragOver ? "rgba(255,164,198,0.4)" : "rgba(255,255,255,0.12)"}`,
                  background: isDragOver
                    ? "rgba(255,164,198,0.06)"
                    : "rgba(255,255,255,0.02)",
                  transition: "border-color 0.15s ease, background 0.15s ease",
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
              >
                {/* 업로드 아이콘 */}
                <svg
                  viewBox="0 0 40 40"
                  fill="none"
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-10 h-10 shrink-0"
                  aria-hidden
                >
                  <path d="M20 26V14M14 20l6-6 6 6" />
                  <rect x="6" y="6" width="28" height="28" rx="6" />
                </svg>

                <div className="text-center">
                  <p className="text-sm text-zinc-400 mb-1">
                    이미지를 끌어다 놓거나
                  </p>
                  <button
                    type="button"
                    className="sm:hidden w-full mt-2 px-5 py-2.5 rounded-full text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-100"
                    style={{
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(255,255,255,0.04)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    파일 선택
                  </button>
                  <button
                    type="button"
                    className="hidden sm:inline-flex px-5 py-2 rounded-full text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-100"
                    style={{
                      border: "1px solid rgba(255,255,255,0.15)",
                      background: "rgba(255,255,255,0.04)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    파일 선택
                  </button>
                </div>

                <p className="text-xs text-zinc-600 text-center">
                  JPG · PNG · WEBP · 최대 {MAX_FILES}장 · 장당 10MB 이하
                </p>
              </div>
            )}

            {/* ── 변환 중 스피너 ──────────────────────────────────────── */}
            {isConverting && (
              <div className="mt-8 flex flex-col items-center gap-3 py-12">
                <svg
                  className="w-8 h-8 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,164,198,0.6)"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                <p className="text-sm text-zinc-500">변환 중...</p>
              </div>
            )}

            {/* ── 오류 메시지 ─────────────────────────────────────────── */}
            {errorMsg && (
              <div
                role="alert"
                className="mt-4 rounded-xl px-4 py-3 text-sm flex items-center justify-between"
                style={{
                  background: "rgba(220,38,38,0.08)",
                  border: "1px solid rgba(220,38,38,0.25)",
                  color: "#f87171",
                }}
              >
                <span>{errorMsg}</span>
                <button
                  type="button"
                  className="ml-3 text-xs opacity-70 hover:opacity-100 transition-opacity"
                  onClick={() => setErrorMsg(null)}
                  aria-label="오류 닫기"
                >
                  닫기
                </button>
              </div>
            )}

            {/* ── 결과 그리드 ─────────────────────────────────────────── */}
            {hasResults && !isConverting && (
              <div className="space-y-8">
                {CHANNEL_GROUPS.map((group) => {
                  // 첫 번째 소스 결과만 대표 미리보기로 사용
                  const firstResult = results[0];
                  if (!firstResult) return null;

                  return (
                    <section key={group.group}>
                      <h2
                        className="text-[11px] uppercase tracking-widest font-semibold mb-3"
                        style={{ color: "rgba(255,164,198,0.65)" }}
                      >
                        {group.group}
                      </h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                        {group.keys.map((key) => {
                          const preset = CHANNEL_PRESETS_MAP[key];
                          const isCoupang = key === "coupang";
                          const chResult = firstResult.channels.find(
                            (c) => c.key === key,
                          );
                          if (!chResult) return null;

                          return (
                            <div
                              key={key}
                              className="rounded-2xl overflow-hidden"
                              style={{
                                border: isCoupang
                                  ? "1px solid rgba(255,164,198,0.25)"
                                  : "1px solid rgba(255,255,255,0.08)",
                                background: "rgba(255,255,255,0.03)",
                                position: "relative",
                              }}
                            >
                              {/* 쿠팡 기준 충족 배지 */}
                              {isCoupang && (
                                <span
                                  className="absolute top-2 left-2 z-10 text-[10px] font-bold uppercase tracking-[0.04em] px-2 py-0.5 rounded-full"
                                  style={{
                                    background: "rgba(255,164,198,0.15)",
                                    border: "1px solid rgba(255,164,198,0.30)",
                                    color: "rgba(255,164,198,1)",
                                  }}
                                >
                                  쿠팡 800×800
                                </span>
                              )}

                              {/* 미리보기 */}
                              <div
                                className="aspect-square flex items-center justify-center overflow-hidden"
                                style={{ background: "#141414" }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={chResult.blobUrl}
                                  alt={`${preset.label} ${preset.sub}`}
                                  className="w-full h-full object-contain"
                                  loading="lazy"
                                />
                              </div>

                              {/* 채널 정보 + 개별 저장 버튼 */}
                              <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-zinc-200 truncate">
                                    {preset.label}
                                  </p>
                                  <p className="text-xs text-zinc-500 truncate">
                                    {preset.sub}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="shrink-0 rounded-xl text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                                  style={{
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    padding: "4px 10px",
                                    whiteSpace: "nowrap",
                                  }}
                                  onClick={() =>
                                    handleDownloadSingle(
                                      chResult.blobUrl,
                                      chResult.filename,
                                    )
                                  }
                                >
                                  저장
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                {/* ── ZIP CTA ───────────────────────────────────────────── */}
                <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <button
                    type="button"
                    disabled={isZipping}
                    className="w-full sm:w-auto px-8 py-4 rounded-full font-bold text-sm transition-all hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      background:
                        "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                      color: "#000",
                    }}
                    onClick={() => void handleDownloadZip()}
                  >
                    {isZipping ? "ZIP 생성 중..." : "↓ 전체 ZIP 다운로드"}
                  </button>
                </div>

                {/* ── AI CTA 인라인 카드 ────────────────────────────────── */}
                {showAiCta && (
                  <div
                    className="rounded-2xl p-6 mt-6"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255,164,198,0.15), rgba(255,227,190,0.15))",
                      border: "1px solid rgba(255,164,198,0.2)",
                    }}
                  >
                    <h3 className="text-white font-bold text-base sm:text-lg">
                      AI 누끼·감성컷·모델컷도 만들어볼까요?
                    </h3>
                    <p className="text-white/70 text-sm mt-2">
                      상품 이미지를 AI가 자동으로 보정합니다.
                    </p>
                    <div className="mt-4 flex items-center gap-4 flex-wrap">
                      <Link
                        href="/guest/quick"
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-all hover:-translate-y-px"
                        style={{
                          background:
                            "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                          color: "#000",
                        }}
                      >
                        무료로 시작하기 →
                      </Link>
                      <button
                        type="button"
                        className="text-sm text-white/40 hover:text-white/70 transition-colors"
                        onClick={() => setShowAiCta(false)}
                      >
                        나중에
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SEO 보조 섹션 ───────────────────────────────────────── */}
            <section className="mt-16 pt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <h2 className="text-sm font-semibold text-zinc-400 mb-4">
                채널 규격 가이드
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {SEO_GUIDE_ROWS.map((row) => (
                  <div key={row.channel} className="text-xs text-zinc-600">
                    <span className="font-medium text-zinc-500">
                      {row.channel}
                    </span>
                    : {row.spec}
                  </div>
                ))}
                <p className="col-span-2 mt-4 pt-3 text-xs text-zinc-600" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  ※ 카테고리에 따라 규격은 가이드입니다. 신선식품·의류·뷰티 등은 컬러 배경·모델컷·연출컷이 더 효과적일 수 있어요.
                  {" "}자세한 카테고리별 가이드는{" "}
                  <Link href="/blog/coupang-thumbnail-size-guide-2026" className="text-zinc-400 hover:text-zinc-300 underline">블로그 가이드</Link>를 참고하세요.
                </p>
              </div>
            </section>
          </div>
        </main>

        {/* 다크 배경이므로 GuestFooter 인라인 오버라이드 */}
        <div
          style={{
            "--border-subtle": "rgba(255,255,255,0.07)",
            "--text-muted": "#52525b",
            "--text-primary": "#d4d4d8",
          } as React.CSSProperties}
        >
          <GuestFooter />
        </div>
      </div>

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={handleFileInput}
        aria-label="이미지 파일 선택"
      />
    </>
  );
}
