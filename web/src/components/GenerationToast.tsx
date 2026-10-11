"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GenerationCompleteDetail = {
  jobId: string;
  imageUrl: string | null;
  conceptId: string;
  conceptName: string;
  brandId: string;
};

type ToastItem = GenerationCompleteDetail & {
  toastId: string;
};

const DURATION_MS = 7000;
export const GENERATION_EVENT = "wonka:image-generated";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function dispatchGenerationComplete(detail: GenerationCompleteDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GENERATION_EVENT, { detail }));
}

// ── Individual toast card ─────────────────────────────────────────────────────

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Entrance animation
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Countdown progress bar + auto-dismiss
  useEffect(() => {
    const startMs = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startMs;
      const remaining = Math.max(0, 1 - elapsed / DURATION_MS);
      setProgress(remaining * 100);
      if (remaining === 0) {
        clearInterval(id);
        handleExit();
      }
    }, 40);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleExit() {
    setExiting(true);
    setTimeout(() => onDismiss(toast.toastId), 280);
  }

  return (
    <div
      className={`w-72 rounded-xl overflow-hidden shadow-2xl shadow-black/60 transition-all duration-300 ${
        !visible
          ? "opacity-0 translate-y-3 scale-95"
          : exiting
            ? "opacity-0 translate-y-2 scale-95"
            : "opacity-100 translate-y-0 scale-100"
      }`}
      style={{
        background: "var(--surface-2, #16161d)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Thumbnail */}
        {toast.imageUrl ? (
          <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
            <img
              src={toast.imageUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-14 h-14 rounded-lg flex-shrink-0 bg-zinc-800 flex items-center justify-center">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-zinc-600"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1 mb-0.5">
            {/* Status badge */}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              생성 완료
            </span>

            {/* Dismiss */}
            <button
              type="button"
              onClick={handleExit}
              className="text-zinc-700 hover:text-zinc-400 transition-colors flex-shrink-0 -mt-0.5"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <p className="text-xs font-semibold text-white truncate mb-1">
            {toast.conceptName}
          </p>

          <Link
            href={`/brands/${toast.brandId}/campaigns/${toast.conceptId}?tab=history`}
            className="text-[11px] text-pink-400 hover:text-pink-300 transition-colors"
          >
            히스토리에서 보기 →
          </Link>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[3px] bg-zinc-800">
        <div
          className="h-full bg-emerald-400/70 transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ── Toast stack ───────────────────────────────────────────────────────────────

export function GenerationToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onEvent(e: Event) {
      const detail = (e as CustomEvent<GenerationCompleteDetail>).detail;
      setToasts((prev) => {
        const item: ToastItem = {
          ...detail,
          toastId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
        // Max 3 toasts; newest at top
        return [item, ...prev].slice(0, 3);
      });
    }
    window.addEventListener(GENERATION_EVENT, onEvent);
    return () => window.removeEventListener(GENERATION_EVENT, onEvent);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== id));
  };

  if (toasts.length === 0) return null;

  return (
    // Above mobile bottom bar (z-55) and mobile drawer (z-57), below nothing
    <div className="fixed bottom-20 right-3 lg:bottom-6 lg:right-5 z-[100] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.toastId} className="pointer-events-auto">
          <ToastCard toast={toast} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
