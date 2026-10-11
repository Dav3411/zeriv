"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminStyle = {
  id: string;
  name: string;
  category: string | null;
  status: string | null;
  is_template: boolean;
  key_visual_url: string | null;
  example_images: string[];
  mood_keywords: string[];
  created_at: string;
};

type RenderItem = {
  jobId: string;
  assetId: string | null;
  resultKey: string;
  url: string;
  kind: string;
  name: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  "클린/미니멀",
  "아쿠아/크리스탈",
  "내추럴/오가닉",
  "로맨틱/플로럴",
  "비비드/팝",
  "럭셔리/다크",
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-4 rounded-lg px-4 py-3 text-sm"
      style={{
        color: "var(--error)",
        background: "var(--error-subtle)",
        border: "1px solid rgba(248,113,113,0.2)",
      }}
    >
      {message}
    </div>
  );
}

function StyleThumbnail({ style }: { style: AdminStyle }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="aspect-[4/5] w-full relative bg-zinc-900">
      {/* 스켈레톤 — 이미지 로드 전 */}
      {!loaded && style.key_visual_url && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ background: "var(--surface-2)" }}
        />
      )}

      {style.key_visual_url ? (
        <img
          src={style.key_visual_url}
          alt={style.name}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">
          No image
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminTemplatesPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styles, setStyles] = useState<AdminStyle[] | null>(null);

  // Modal state
  const [modalStyleId, setModalStyleId] = useState<string | null>(null);
  const [renders, setRenders] = useState<RenderItem[]>([]);
  const [rendersLoading, setRendersLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [keyVisualKey, setKeyVisualKey] = useState<string | null>(null);

  const initialized = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (authLoading) return;
    if (!user && typeof window !== "undefined") {
      router.replace(
        `/login?next=${encodeURIComponent(window.location.pathname)}`,
      );
    }
  }, [authLoading, user, router]);

  // ---------------------------------------------------------------------------
  // Auth headers
  // ---------------------------------------------------------------------------

  const authHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (session?.access_token)
      h.Authorization = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  // ---------------------------------------------------------------------------
  // PATCH helper
  // ---------------------------------------------------------------------------

  const patchStyle = useCallback(
    async (
      styleId: string,
      updates: Partial<
        Pick<
          AdminStyle,
          "is_template" | "category" | "example_images" | "key_visual_url"
        >
      >,
    ) => {
      const res = await fetch(`/api/admin/templates/${styleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
    },
    [authHeaders],
  );

  // ---------------------------------------------------------------------------
  // Load styles
  // ---------------------------------------------------------------------------

  const loadStyles = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    setStyles(null);
    try {
      const res = await fetch("/api/admin/templates", {
        headers: authHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        setError("권한이 없습니다. 로그인 및 관리자 권한을 확인하세요.");
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load");
        return;
      }
      setStyles(json.styles ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, authHeaders]);

  // ---------------------------------------------------------------------------
  // Auto-load on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (authLoading || !user || !session?.access_token) return;
    if (initialized.current) return;
    initialized.current = true;
    loadStyles();
  }, [authLoading, user, session?.access_token, loadStyles]);

  // ---------------------------------------------------------------------------
  // Optimistic: template toggle
  // ---------------------------------------------------------------------------

  const handleTemplateToggle = useCallback(
    async (styleId: string, next: boolean) => {
      setStyles((prev) =>
        prev
          ? prev.map((s) =>
              s.id === styleId ? { ...s, is_template: next } : s,
            )
          : prev,
      );
      try {
        await patchStyle(styleId, { is_template: next });
      } catch (e) {
        // Revert
        setStyles((prev) =>
          prev
            ? prev.map((s) =>
                s.id === styleId ? { ...s, is_template: !next } : s,
              )
            : prev,
        );
        console.error("Template toggle failed", e);
      }
    },
    [patchStyle],
  );

  // ---------------------------------------------------------------------------
  // Optimistic: category change
  // ---------------------------------------------------------------------------

  const handleCategoryChange = useCallback(
    async (styleId: string, category: string | null) => {
      let prevCategory: string | null = null;
      setStyles((prev) => {
        if (!prev) return prev;
        prevCategory = prev.find((s) => s.id === styleId)?.category ?? null;
        return prev.map((s) => (s.id === styleId ? { ...s, category } : s));
      });
      try {
        await patchStyle(styleId, { category });
      } catch (e) {
        setStyles((prev) =>
          prev
            ? prev.map((s) =>
                s.id === styleId ? { ...s, category: prevCategory } : s,
              )
            : prev,
        );
        console.error("Category update failed", e);
      }
    },
    [patchStyle],
  );

  // ---------------------------------------------------------------------------
  // Modal: open / close
  // ---------------------------------------------------------------------------

  const openModal = useCallback(
    async (styleId: string) => {
      setModalStyleId(styleId);
      setSaveError(null);
      setSelectedKeys([]);
      setKeyVisualKey(null);
      setRenders([]);
      setRendersLoading(true);
      try {
        const res = await fetch(`/api/admin/templates/${styleId}/renders`, {
          headers: authHeaders(),
        });
        const json = await res.json();
        if (res.ok) {
          const loaded: RenderItem[] = json.renders ?? [];
          const kvItem: RenderItem | null = json.styleKeyVisual
            ? {
                jobId: "__key_visual__",
                assetId: null,
                resultKey: json.styleKeyVisual.key as string,
                url: json.styleKeyVisual.url as string,
                kind: "",
                name: "기본 이미지",
              }
            : null;
          const allRenders = kvItem ? [kvItem, ...loaded] : loaded;
          setRenders(allRenders);
          const styleData = styles?.find((s) => s.id === styleId);
          // example_images 초기 선택
          const stored = styleData?.example_images ?? [];
          const initKeys = allRenders
            .filter((r) => stored.some((u) => u.includes(r.resultKey)))
            .map((r) => r.resultKey);
          setSelectedKeys(initKeys);
          // key_visual_url 초기 선택
          const kvUrl = styleData?.key_visual_url ?? null;
          const initKvKey = kvUrl
            ? (allRenders.find((r) => kvUrl.includes(r.resultKey))?.resultKey ??
              null)
            : null;
          setKeyVisualKey(initKvKey);
        }
      } catch (e) {
        console.error("Failed to load renders", e);
      } finally {
        setRendersLoading(false);
      }
    },
    [authHeaders, styles],
  );

  const closeModal = useCallback(() => {
    setModalStyleId(null);
    setRenders([]);
    setSelectedKeys([]);
    setKeyVisualKey(null);
    setSaveError(null);
    setCopiedKey(null);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  // ---------------------------------------------------------------------------
  // Modal: image select toggle
  // ---------------------------------------------------------------------------

  const toggleKey = useCallback((resultKey: string) => {
    setSelectedKeys((prev) =>
      prev.includes(resultKey)
        ? prev.filter((k) => k !== resultKey)
        : [...prev, resultKey],
    );
  }, []);

  const toggleKeyVisual = useCallback((resultKey: string) => {
    setKeyVisualKey((prev) => (prev === resultKey ? null : resultKey));
  }, []);

  // ---------------------------------------------------------------------------
  // Modal: save images
  // ---------------------------------------------------------------------------

  const handleSaveImages = useCallback(async () => {
    if (!modalStyleId) return;
    setSaving(true);
    try {
      const keys = renders
        .filter((r) => selectedKeys.includes(r.resultKey))
        .map((r) => r.resultKey);
      const kvRender =
        renders.find((r) => r.resultKey === keyVisualKey) ?? null;
      await patchStyle(modalStyleId, {
        example_images: keys,
        key_visual_url: kvRender ? kvRender.resultKey : null,
      });
      setStyles((prev) =>
        prev
          ? prev.map((s) =>
              s.id === modalStyleId
                ? {
                    ...s,
                    example_images: keys,
                    key_visual_url: kvRender ? kvRender.url : null,
                  }
                : s,
            )
          : prev,
      );
      closeModal();
    } catch (e) {
      setSaveError("저장에 실패했습니다. 다시 시도해주세요.");
      console.error("Save images failed", e);
    } finally {
      setSaving(false);
    }
  }, [
    modalStyleId,
    patchStyle,
    selectedKeys,
    keyVisualKey,
    renders,
    closeModal,
  ]);

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-500 text-sm">
        Loading...
      </div>
    );
  }

  const modalStyle = styles?.find((s) => s.id === modalStyleId) ?? null;

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Explore</h1>
        <span className="text-xs text-zinc-500">
          {styles != null ? `${styles.length} styles` : ""}
        </span>
      </div>

      {/* Error banner */}
      {error && <ErrorBanner message={error} />}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-2xl animate-pulse"
              style={{ background: "var(--surface-2)" }}
            />
          ))}
        </div>
      )}

      {/* Style cards */}
      {!loading && styles != null && (
        <>
          {styles.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 text-sm">
              스타일이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
              {styles.map((style) => (
                <div
                  key={style.id}
                  className="rounded-2xl overflow-hidden transition-all"
                  style={{
                    background: "var(--surface-2)",
                    border: style.is_template
                      ? "1px solid rgba(251,191,36,0.4)"
                      : "1px solid var(--border-subtle)",
                  }}
                >
                  {/* Thumbnail */}
                  <StyleThumbnail style={style} />

                  {/* Meta + controls */}
                  <div className="p-3 space-y-3">
                    {/* Name */}
                    <p className="text-sm font-semibold text-white truncate">
                      {style.name}
                    </p>

                    {/* Category select */}
                    <select
                      value={style.category ?? ""}
                      onChange={(e) =>
                        handleCategoryChange(style.id, e.target.value || null)
                      }
                      aria-label="카테고리 선택"
                      className="w-full rounded-lg px-2 py-1.5 text-xs text-zinc-300 outline-none"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <option value="">카테고리 없음</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>

                    {/* is_template toggle */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">템플릿 등록</span>
                      <button
                        role="switch"
                        aria-checked={style.is_template}
                        onClick={() =>
                          handleTemplateToggle(style.id, !style.is_template)
                        }
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                          style.is_template
                            ? "bg-gradient-to-r from-pink-400 to-orange-300"
                            : "bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                            style.is_template
                              ? "translate-x-4"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Example images row */}
                    <div
                      className="flex items-center justify-between pt-2"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <span className="text-xs text-zinc-500">
                        예시 이미지 {style.example_images.length}장
                      </span>
                      <button
                        onClick={() => openModal(style.id)}
                        className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        관리
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Image picker modal */}
      {modalStyleId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="relative w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-subtle)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div>
                <h2
                  id="modal-title"
                  className="text-sm font-semibold text-white"
                >
                  이미지 선택
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {modalStyle?.name} — 예시 {selectedKeys.length}장
                  {keyVisualKey
                    ? " · 기본 이미지 ★ 선택됨"
                    : " · 기본 이미지 없음"}
                </p>
              </div>
              <button
                onClick={closeModal}
                aria-label="닫기"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-4">
              {rendersLoading ? (
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg animate-pulse"
                      style={{ background: "var(--surface-2)" }}
                    />
                  ))}
                </div>
              ) : renders.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-sm">
                  렌더 이미지가 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {renders.map((r) => {
                    const selected = selectedKeys.includes(r.resultKey);
                    const isKeyVisual = keyVisualKey === r.resultKey;
                    const isCopied = copiedKey === r.assetId;
                    return (
                      <div
                        key={r.jobId}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleKey(r.resultKey)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleKey(r.resultKey);
                          }
                        }}
                        className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all"
                        style={{
                          border: isKeyVisual
                            ? "2px solid rgba(56,189,248,0.8)"
                            : selected
                              ? "2px solid rgba(251,191,36,0.8)"
                              : "2px solid transparent",
                        }}
                      >
                        <img
                          src={r.url}
                          alt={r.name || r.jobId}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {/* 기본 이미지 (star) 버튼 — 항상 표시, 왼쪽 상단 */}
                        <button
                          type="button"
                          aria-label="기본 이미지로 설정"
                          title="기본 이미지"
                          className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                          style={{
                            background: isKeyVisual
                              ? "rgba(56,189,248,0.9)"
                              : "rgba(0,0,0,0.55)",
                            color: isKeyVisual
                              ? "#000"
                              : "rgba(255,255,255,0.6)",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleKeyVisual(r.resultKey);
                          }}
                        >
                          ★
                        </button>
                        {selected && (
                          <span
                            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                            style={{
                              background: "rgba(251,191,36,0.9)",
                              color: "#000",
                            }}
                          >
                            ✓
                          </span>
                        )}
                        {r.jobId === "__key_visual__" && (
                          <div
                            className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-center text-[9px] text-white/80"
                            style={{ background: "rgba(0,0,0,0.55)" }}
                          >
                            기본 이미지
                          </div>
                        )}
                        {/* 복사 버튼 오버레이 */}
                        {r.jobId !== "__key_visual__" && (
                          <button
                            type="button"
                            aria-label="에셋 ID 복사"
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center w-6 h-6 rounded"
                            style={{ background: "rgba(0,0,0,0.6)" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const doCopy = () => {
                                if (copyTimerRef.current)
                                  clearTimeout(copyTimerRef.current);
                                setCopiedKey(r.assetId);
                                copyTimerRef.current = setTimeout(
                                  () => setCopiedKey(null),
                                  1500,
                                );
                              };
                              if (!r.assetId) return;
                              if (navigator.clipboard) {
                                navigator.clipboard
                                  .writeText(r.assetId)
                                  .then(doCopy)
                                  .catch(() =>
                                    console.warn("Clipboard write failed"),
                                  );
                              } else {
                                try {
                                  const el = document.createElement("textarea");
                                  el.value = r.assetId;
                                  document.body.appendChild(el);
                                  el.select();
                                  document.execCommand("copy");
                                  document.body.removeChild(el);
                                  doCopy();
                                } catch {
                                  console.warn("Copy fallback failed");
                                }
                              }
                            }}
                            title={r.assetId ?? "에셋 없음"}
                          >
                            {isCopied ? (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="white"
                                strokeWidth="2.5"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="white"
                                strokeWidth="2"
                              >
                                <rect
                                  x="9"
                                  y="9"
                                  width="13"
                                  height="13"
                                  rx="2"
                                  ry="2"
                                />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <span className="text-xs text-zinc-500">
                {selectedKeys.length}장 선택
              </span>
              {saveError && (
                <p className="text-xs text-red-400 mr-auto">{saveError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  취소
                </button>
                <button
                  onClick={handleSaveImages}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  style={{
                    background: "rgba(251,191,36,0.15)",
                    border: "1px solid rgba(251,191,36,0.3)",
                    color: "#fbbf24",
                  }}
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
