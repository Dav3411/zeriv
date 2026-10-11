"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";

type RenderDetail = {
  id: string;
  kind: string;
  name: string;
  imageUrl: string | null;
  createdAt: string;
};

export default function RenderDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();
  const tc = useTranslations("common");

  const [render, setRender] = useState<RenderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // Fetch render detail
  const loadRender = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/renders/${id}`);
      if (!res.ok) {
        setError("렌더를 찾을 수 없습니다.");
        return;
      }
      const data = await res.json();
      setRender(data.render);
      setEditName(data.render.name);
    } catch {
      setError("로드 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [id, fetchWithAuth]);

  useEffect(() => {
    if (user) void loadRender();
  }, [user, loadRender]);

  // Focus input when editing starts
  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  // Save name
  const handleSave = async () => {
    if (!editName.trim() || editName.trim() === render?.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/renders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        setRender((prev) => (prev ? { ...prev, name: editName.trim() } : prev));
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/renders/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/");
      }
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="h-dvh overflow-x-hidden overflow-y-auto relative">
        <SiteHeader />
        <div className="pt-11 lg:pt-0 lg-pl-sidebar flex items-center justify-center py-20">
          <div className="text-zinc-400">{tc("loading")}</div>
        </div>
      </div>
    );
  }

  if (error || !render) {
    return (
      <div className="h-dvh overflow-x-hidden overflow-y-auto relative">
        <SiteHeader />
        <div className="pt-11 lg:pt-0 lg-pl-sidebar flex flex-col items-center justify-center py-20 gap-4">
          <div className="text-zinc-400">{error ?? "Not found"}</div>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm text-pink-400 hover:text-pink-300 transition-colors"
          >
            {tc("back")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-x-hidden overflow-y-auto relative">
      <SiteHeader />
      <div className="pt-11 lg:pt-0 lg-pl-sidebar pb-24">
        {/* Top bar */}
        <div className="sticky top-0 z-10 backdrop-blur-xl bg-zinc-950/80 border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
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
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Name — click to edit */}
            {editing ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  ref={nameInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSave();
                    if (e.key === "Escape") {
                      setEditing(false);
                      setEditName(render.name);
                    }
                  }}
                  className="input-field flex-1 text-sm"
                  maxLength={100}
                />
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="btn btn-primary btn-sm"
                >
                  {tc("save")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditName(render.name);
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  {tc("cancel")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex-1 text-left group"
              >
                <span className="text-sm font-semibold text-white group-hover:text-pink-300 transition-colors">
                  {render.name || tc("untitled")}
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
                  className="inline ml-1.5 text-zinc-500 group-hover:text-pink-400 transition-colors"
                >
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}

            {/* Delete button */}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="max-w-3xl mx-auto px-4 pt-4">
          {render.imageUrl ? (
            <div className="rounded-2xl overflow-hidden bg-zinc-900">
              <img
                src={render.imageUrl}
                alt={render.name}
                className="w-full select-none"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          ) : (
            <div className="rounded-2xl bg-zinc-900 flex items-center justify-center py-20 text-zinc-500">
              {tc("noImage")}
            </div>
          )}

          {/* Meta info */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-zinc-500">
              {new Date(render.createdAt).toLocaleString()}
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
              {render.kind === "render_prompt" ? "Imagine" : "Photo Remix"}
            </span>
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex gap-2">
            {render.imageUrl && (
              <a
                href={render.imageUrl}
                download={`${render.name || "render"}.png`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-md flex-1 flex items-center justify-center gap-2"
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
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M12 15V3" />
                </svg>
                {tc("download")}
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="btn btn-danger btn-md flex items-center justify-center gap-2"
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
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              {tc("delete")}
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-4">
            <div className="text-base font-semibold text-white">
              렌더를 삭제하시겠습니까?
            </div>
            <p className="text-sm text-zinc-400">
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-secondary btn-md flex-1"
              >
                {tc("cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="btn btn-danger btn-md flex-1"
              >
                {deleting ? "삭제 중..." : tc("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
