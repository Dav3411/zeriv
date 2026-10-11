"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useBrand } from "@/components/BrandProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { useAuth } from "@/components/AuthProvider";

export default function NewStylePage() {
  const { brandId } = useBrand();
  const router = useRouter();
  const params = useParams();
  const brandName = params.brandName as string;
  const { fetchWithAuth } = useFetchWithAuth();
  const { user, loading: authLoading } = useAuth();

  const [styleName, setStyleName] = useState("");
  const [textPrompt, setTextPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState<"style" | "sheet">("style");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  // Style limit check state
  const [limitCheckDone, setLimitCheckDone] = useState(false);
  const [isStyleLimitExceeded, setIsStyleLimitExceeded] = useState(false);
  const [styleLimitInfo, setStyleLimitInfo] = useState<{
    current: number;
    limit: number;
  } | null>(null);
  const limitCheckedRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 페이지 진입 시 스타일 한도 체크
  useEffect(() => {
    if (limitCheckedRef.current) return;
    if (authLoading || !user || !brandId) {
      if (!authLoading && !user) setLimitCheckDone(true); // 비로그인은 체크 불필요
      return;
    }
    limitCheckedRef.current = true;

    fetchWithAuth(`/api/brands/${brandId}/styles`)
      .then(async (res) => {
        if (!res.ok) {
          setLimitCheckDone(true);
          return;
        }
        const data = (await res.json()) as {
          styleCount?: number;
          styleLimit?: number | null;
        };
        const { styleCount, styleLimit } = data;
        if (
          styleLimit != null &&
          styleCount != null &&
          styleCount >= styleLimit
        ) {
          setIsStyleLimitExceeded(true);
          setStyleLimitInfo({ current: styleCount, limit: styleLimit });
        }
        setLimitCheckDone(true);
      })
      .catch(() => setLimitCheckDone(true)); // 오류 시 통과 허용
  }, [authLoading, user, brandId, fetchWithAuth]);

  const canSubmit =
    styleName.trim().length > 0 &&
    (files.length > 0 || textPrompt.trim().length > 0);

  const addFiles = useCallback(
    (incoming: File[]) => {
      const imageFiles = incoming
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, 5 - files.length);
      if (imageFiles.length === 0) return;
      const newPreviews = imageFiles.map((f) => URL.createObjectURL(f));
      setFiles((prev) => [...prev, ...imageFiles].slice(0, 5));
      setPreviews((prev) => [...prev, ...newPreviews].slice(0, 5));
    },
    [files.length],
  );

  const removeImage = useCallback((idx: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(e.target.files ?? []));
      e.target.value = "";
    },
    [addFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!brandId || !canSubmit || analyzing) return;
    setAnalyzing(true);
    setAnalyzeStep("style");
    setError("");

    try {
      const formData = new FormData();
      formData.append("name", styleName.trim());
      for (const file of files) {
        formData.append("images[]", file);
      }
      if (textPrompt.trim()) {
        formData.append("user_prompt", textPrompt.trim());
      }

      const res = await fetchWithAuth(`/api/brands/${brandId}/styles`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ?? "스타일 생성에 실패했습니다.",
        );
        return;
      }

      const { style } = (await res.json()) as { style: { id: string } };

      // 스타일 시트 + 키 비주얼 생성 (실패해도 스타일 자체는 유지)
      setAnalyzeStep("sheet");
      try {
        const sheetRes = await fetchWithAuth(
          `/api/brands/${brandId}/styles/${style.id}/style-sheet`,
          { method: "POST" },
        );
        if (!sheetRes.ok) {
          const errData = await sheetRes.json().catch(() => ({}));
          console.error("[style-sheet] failed:", sheetRes.status, errData);
        }
      } catch (e) {
        console.error("[style-sheet] network error:", e);
      }

      router.push(`/${brandId}/assets?tab=styles`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }, [
    brandId,
    canSubmit,
    analyzing,
    files,
    textPrompt,
    styleName,
    fetchWithAuth,
    router,
  ]);

  // 인증 로딩 중
  if (authLoading) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <div style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
      </div>
    );
  }

  // 로딩 중 (인증 완료 후 한도 체크 대기)
  if (user && !limitCheckDone) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <div style={{ color: "var(--text-secondary)" }}>로딩 중...</div>
      </div>
    );
  }

  // 스타일 한도 초과 블로킹 화면
  if (isStyleLimitExceeded && styleLimitInfo) {
    const isNotIncluded = styleLimitInfo.limit === 0;
    return (
      <div
        className="fixed inset-0 flex items-center justify-center p-6"
        style={{
          background:
            "radial-gradient(ellipse at 60% 40%, #1a0a2e 0%, var(--surface-0) 70%)",
        }}
      >
        <div
          className="w-full max-w-sm rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
          style={{ background: "var(--surface-0)" }}
        >
          <div className="px-7 pt-8 pb-6 flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <div
                className="text-xs uppercase tracking-widest font-semibold"
                style={{ color: "rgba(255,164,198,0.45)" }}
              >
                {isNotIncluded ? "플랜 제한" : "스타일 한도"}
              </div>
              {!isNotIncluded && (
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-4xl font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {styleLimitInfo.current}
                  </span>
                  <span
                    className="text-xl font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    /
                  </span>
                  <span
                    className="text-xl font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {styleLimitInfo.limit}
                  </span>
                </div>
              )}
            </div>
            <div
              className="h-px w-full"
              style={{ background: "var(--surface-3)" }}
            />
            <div className="flex flex-col gap-1.5">
              <div
                className="text-base font-bold leading-snug"
                style={{ color: "var(--text-primary)" }}
              >
                {isNotIncluded
                  ? "현재 플랜에서는 사용할 수 없습니다"
                  : "스타일 한도에 도달했습니다"}
              </div>
              <div
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                {isNotIncluded
                  ? "스타일 생성은 Quick Plus 플랜부터 이용 가능합니다. 플랜을 업그레이드해주세요."
                  : "현재 플랜에서 생성할 수 있는 스타일 수를 초과했습니다. 기존 스타일을 삭제하거나 플랜을 업그레이드하세요."}
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              {!isNotIncluded && (
                <Link
                  href={`/${brandId}/assets?tab=styles`}
                  className="w-full py-3.5 rounded-full text-sm font-semibold text-center transition-all"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  기존 스타일 관리하기
                </Link>
              )}
              <Link
                href="/pricing"
                className="w-full flex items-center justify-center gap-2.5 py-3.5 pl-5 pr-2 rounded-full text-sm font-bold transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                  color: "#000",
                  boxShadow: "0 4px 16px rgba(255,164,198,0.3)",
                }}
              >
                플랜 업그레이드
                <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-sm">
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl 2xl:max-w-7xl mx-auto px-4 md:px-8">
      {/* ── 뒤로가기 ─────────────────────────────────────────── */}
      <div className="mb-4">
        <Link
          href={`/${brandName}/assets?tab=styles`}
          className="inline-flex items-center gap-1.5 text-sm transition-colors"
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
          스타일
        </Link>
      </div>

      {/* ── Hero Banner ────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl mb-8"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        <img
          src="/examples/styles/banner.jpg"
          alt=""
          className="w-full h-48 md:h-56 object-cover"
          style={{ objectPosition: "center 90%" }}
          onError={(e) => {
            // gradient fallback when banner image is missing
            const el = e.currentTarget;
            el.style.display = "none";
            if (el.parentElement) {
              el.parentElement.style.background =
                "linear-gradient(135deg, rgba(255,164,198,0.15) 0%, rgba(255,227,190,0.08) 50%, rgba(9,9,11,1) 100%)";
              el.parentElement.style.minHeight = "14rem";
            }
          }}
        />

        <div className="absolute inset-x-0 bottom-0 px-8 pb-6 pt-16">
          <p
            className="text-[11px] uppercase tracking-widest font-semibold mb-2"
            style={{ color: "rgba(255,164,198,0.6)" }}
          >
            New Style
          </p>
          <h1 className="text-3xl font-bold text-always-white tracking-tight">
            스타일 만들기
          </h1>
          <p className="text-sm text-white/70 mt-2 max-w-md leading-relaxed">
            이미지나 텍스트를 업로드하면 브랜드 무드를 분석해 스타일을
            완성합니다
          </p>
        </div>
      </div>

      {/* ── 2-Column: Info + Upload ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* LEFT: 스타일 정보 */}
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
              스타일 정보
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              스타일을 구분할 이름과 설명을 작성해 주세요
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label
                className="block text-[11px] uppercase tracking-widest font-semibold mb-2"
                style={{ color: "rgba(255,164,198,0.45)" }}
              >
                스타일 이름 *
              </label>
              <input
                type="text"
                value={styleName}
                onChange={(e) => setStyleName(e.target.value)}
                placeholder="예: 클린 화이트, 2024 봄 룩북, 다크 무드 에디토리얼..."
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
                스타일 설명{" "}
                <span
                  className="normal-case tracking-normal font-normal"
                  style={{ color: "var(--text-muted)" }}
                >
                  (선택)
                </span>
              </label>
              <textarea
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
                placeholder="예: 소프트한 베이지와 화이트 톤, 자연광 느낌의 부드러운 라이팅, 여백이 많고 깔끔한 구성..."
                rows={6}
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

        {/* RIGHT: 레퍼런스 이미지 */}
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
              레퍼런스 이미지
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              브랜드 무드와 톤을 가장 잘 표현한 이미지를 올려주세요
            </p>
          </div>

          <div className="flex-1 flex flex-col">
            {previews.length === 0 ? (
              /* ── Empty dropzone ── */
              <label
                className={`flex-1 flex flex-col items-center justify-center rounded-2xl border border-dashed cursor-pointer transition-all hover:border-pink-400/40 hover:bg-pink-500/5 min-h-[240px] ${
                  dragging ? "border-pink-400/50 bg-pink-500/5" : ""
                }`}
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
                    : "클릭하거나 드래그해서 업로드"}
                </span>
                <span
                  className="text-xs mt-1.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  최대 5장 · JPG / PNG / WebP
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            ) : (
              /* ── Thumbnail grid ── */
              <div
                className={`grid grid-cols-3 gap-2.5 transition-colors rounded-2xl ${
                  dragging ? "ring-2 ring-pink-400/50" : ""
                }`}
              >
                {previews.map((src, idx) => (
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
                  </div>
                ))}
                {files.length < 5 && (
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
                      이미지 추가
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                )}
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
          type="button"
          onClick={handleCreate}
          disabled={!canSubmit || analyzing}
          className="flex items-center justify-center gap-2 pl-6 pr-2.5 py-3 text-base rounded-full font-bold active:scale-95 w-full disabled:opacity-40 transition-all"
          style={{
            background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
            color: "#000",
            boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
          }}
        >
          {analyzing ? "스타일 생성 중…" : "스타일 생성하기"}
        </button>
      </div>

      {/* ── Analyzing overlay ─────────────────────────────── */}
      {analyzing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,164,198,0.2), rgba(255,227,190,0.2))",
              border: "1px solid rgba(255,164,198,0.3)",
            }}
          >
            <svg
              className="animate-spin"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="url(#grad)"
              strokeWidth="2"
            >
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ffa4c6" />
                  <stop offset="100%" stopColor="#ffe3be" />
                </linearGradient>
              </defs>
              <path
                d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-white">
              {analyzeStep === "style"
                ? "브랜드 스타일 분석 중"
                : "스타일 시트 생성 중"}
            </p>
            <p className="text-xs text-zinc-300">
              {analyzeStep === "style"
                ? "이미지와 텍스트를 분석하고 있습니다."
                : "색상 팔레트, 무드 키워드, 비주얼 레퍼런스를 정리하고 있습니다."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
