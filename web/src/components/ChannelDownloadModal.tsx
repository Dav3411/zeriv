"use client";

import { useEffect, useState } from "react";
import { useBrand } from "@/components/BrandProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import {
  CHANNEL_GROUPS,
  CHANNEL_PRESETS_MAP,
  type ChannelKey,
} from "@/lib/channelPresets";

/**
 * 채널별 다운로드 모달
 *
 * 렌더 에셋 하나를 선택한 채널들(인스타그램 피드 4:5, 1:1 등)의 프리셋 규격으로
 * 크롭·리사이즈하여 ZIP으로 일괄 다운로드한다.
 *
 * - 브랜드 환경설정(`preferred_channels`)을 초기 선택값으로 사용
 * - 구독 플랜(`/api/brands/{id}/subscription`)의 `channelExport` 한도로 선택 수 제한
 * - 호출 API: `POST /api/renders/{renderId}/download-channels`
 *
 * @param renderId 대상 render asset id
 * @param onClose  모달 닫기 콜백
 */
export function ChannelDownloadModal({
  renderId,
  onClose,
}: {
  renderId: string;
  onClose: () => void;
}) {
  const { fetchWithAuth } = useFetchWithAuth();
  const { brand } = useBrand();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  // 브랜드 환경설정 채널을 초기값으로, 없으면 기본 2개
  const defaultChannels = (
    (brand?.meta as { preferred_channels?: ChannelKey[] } | null)
      ?.preferred_channels ?? ["instagram_feed_4x5", "instagram_feed_1x1"]
  ).filter((k) => k in CHANNEL_PRESETS_MAP);
  const [selected, setSelected] = useState<Set<ChannelKey>>(
    new Set(defaultChannels as ChannelKey[]),
  );
  const [channelLimit, setChannelLimit] = useState<number | null>(null);
  const [planLabel, setPlanLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!brand?.id) return;
    fetchWithAuth(`/api/brands/${brand.id}/subscription`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setChannelLimit(d.channelExport);
        setPlanLabel(d.planLabel);
      })
      .catch(() => {});
  }, [brand?.id, fetchWithAuth]);

  const toggle = (key: ChannelKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (channelLimit !== null && next.size >= channelLimit) return prev;
        next.add(key);
      }
      return next;
    });
  };

  const handleDownload = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    setError("");
    try {
      const res = await fetchWithAuth(
        `/api/renders/${renderId}/download-channels`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channels: Array.from(selected) }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string })?.error ?? `HTTP ${res.status}`,
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zeriv-channels.zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      onClose();
    } catch (e) {
      console.error("[ChannelDownloadModal] download error:", e);
      setError(
        e instanceof Error && e.message
          ? e.message
          : "다운로드에 실패했습니다. 다시 시도해주세요.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 max-h-[90dvh] flex flex-col"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
        }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-1 flex-shrink-0">
          <h3 className="text-sm font-semibold text-white">채널별 다운로드</h3>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
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
        <p className="text-xs text-zinc-500 mb-4 flex-shrink-0">
          원하는 채널을 선택하면 ZIP으로 다운로드됩니다.
        </p>

        {channelLimit !== null && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg mb-3 flex-shrink-0"
            style={{
              background: "rgba(255,164,198,0.08)",
              border: "1px solid rgba(255,164,198,0.15)",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffa4c6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-[11px]" style={{ color: "#ffa4c6" }}>
              {planLabel ?? "현재 플랜"} · 최대 {channelLimit}개 채널
            </span>
            <span
              className="ml-auto text-[11px] font-semibold"
              style={{
                color:
                  selected.size >= channelLimit
                    ? "#ffa4c6"
                    : "var(--text-secondary)",
              }}
            >
              {selected.size}/{channelLimit}
            </span>
          </div>
        )}

        {/* 채널 목록 — 그룹별 */}
        <div className="overflow-y-auto flex-1 space-y-4 mb-4 custom-scrollbar">
          {CHANNEL_GROUPS.map(({ group, keys }) => (
            <div key={group}>
              <p
                className="text-[10px] uppercase tracking-widest font-semibold mb-1.5"
                style={{ color: "rgba(255,164,198,0.5)" }}
              >
                {group}
              </p>
              <div className="space-y-1.5">
                {keys.map((key) => {
                  const ch = CHANNEL_PRESETS_MAP[key];
                  const isSelected = selected.has(key);
                  const isLocked =
                    channelLimit !== null &&
                    !isSelected &&
                    selected.size >= channelLimit;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggle(key)}
                      disabled={isLocked}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                      style={{
                        background: isSelected
                          ? "rgba(255,164,198,0.08)"
                          : "var(--surface-2)",
                        border: isSelected
                          ? "1px solid rgba(255,164,198,0.30)"
                          : "1px solid var(--border-subtle)",
                        opacity: isLocked ? 0.35 : 1,
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                        style={{
                          background: isSelected
                            ? "linear-gradient(135deg, #ffa4c6, #ffe3be)"
                            : "var(--surface-3)",
                          border: isSelected
                            ? "none"
                            : "1px solid var(--border-hover)",
                        }}
                      >
                        {isLocked ? (
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(255,255,255,0.3)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        ) : isSelected ? (
                          <svg width="8" height="8" viewBox="0 0 10 10">
                            <polyline
                              points="1.5 5.5 4 8 8.5 2"
                              fill="none"
                              stroke="#000"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-white">
                          {ch.label}
                        </span>
                        <span className="text-[10px] text-zinc-500 ml-2">
                          {ch.sub}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-xs mb-3 flex-shrink-0">{error}</p>
        )}

        {/* 다운로드 버튼 */}
        <button
          type="button"
          disabled={selected.size === 0 || downloading}
          onClick={handleDownload}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40 flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
            color: "#000",
          }}
        >
          {downloading
            ? "ZIP 생성 중…"
            : `ZIP 다운로드 (${selected.size}개 채널)`}
        </button>
      </div>
    </div>
  );
}

export default ChannelDownloadModal;
