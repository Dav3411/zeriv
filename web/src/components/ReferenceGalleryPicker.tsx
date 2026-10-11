"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";

type GalleryImage = {
  id: string;
  isAdmin: boolean;
  pipelineType: string;
  imageUrl: string | null;
  label: string;
  createdAt: string;
};

type Props = {
  pipelineType: "photo_remix" | "imagine" | "object" | "product";
  onSelectFile: (file: File) => void;
  currentFile: File | null;
  onClear: () => void;
  label: string;
  hint: string;
  required?: boolean;
};

export default function ReferenceGalleryPicker({
  pipelineType,
  onSelectFile,
  currentFile,
  onClear,
  label,
  hint,
  required,
}: Props) {
  const { fetchWithAuth } = useFetchWithAuth();
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"recommended" | "my" | "upload">("recommended");
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(false);

  // Preview URL for selected file
  useEffect(() => {
    if (!currentFile) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(currentFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [currentFile]);

  // Fetch gallery when modal opens
  const fetchGallery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/reference-gallery?pipeline=${pipelineType}`);
      if (res.ok) {
        const data = await res.json();
        setImages(data.images ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth, pipelineType]);

  useEffect(() => {
    if (showModal) fetchGallery();
  }, [showModal, fetchGallery]);

  const recommendedImages = images.filter((img) => img.isAdmin);
  const myImages = images.filter((img) => !img.isAdmin);

  // Select from gallery — fetch as blob, convert to File
  const handleGallerySelect = async (img: GalleryImage) => {
    if (!img.imageUrl) return;
    try {
      const res = await fetch(img.imageUrl);
      if (!res.ok) return;
      const blob = await res.blob();
      const file = new File([blob], `gallery_${img.id}.png`, { type: blob.type || "image/png" });
      onSelectFile(file);
      setShowModal(false);
    } catch {
      // ignore
    }
  };

  // Upload new — select file + save to user gallery in background
  const handleUploadSelect = (file: File) => {
    onSelectFile(file);
    setShowModal(false);

    // Auto-save to user gallery (fire and forget)
    if (!savedRef.current) {
      savedRef.current = true;
      const fd = new FormData();
      fd.append("pipeline", pipelineType);
      fd.append("image", file);
      fetchWithAuth("/api/reference-gallery", { method: "POST", body: fd }).catch(() => {});
    }
  };

  // Delete user image
  const handleDelete = async (id: string) => {
    await fetchWithAuth(`/api/reference-gallery/${id}`, { method: "DELETE" });
    fetchGallery();
  };

  // Reset savedRef when file changes
  useEffect(() => { savedRef.current = false; }, [pipelineType]);

  // ── Render ──────────────────────────────────────────────────────────
  if (previewUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-300">{label}</div>
          {!required && <span className="text-[10px] text-zinc-600">선택사항</span>}
        </div>
        <p className="text-xs text-zinc-500">{hint}</p>
        <div className="relative rounded-xl overflow-hidden">
          <img src={previewUrl} alt="" className="w-full max-h-48 object-contain bg-zinc-900" />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white text-sm flex items-center justify-center hover:bg-red-500/80"
          >
            X
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-300">{label}</div>
        {!required && <span className="text-[10px] text-zinc-600">선택사항</span>}
      </div>
      <p className="text-xs text-zinc-500">{hint}</p>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="w-full rounded-xl border border-dashed border-[var(--border-default)] hover:border-pink-400/40 cursor-pointer transition-colors py-6 text-center"
      >
        <div className="text-zinc-500 text-xs">갤러리에서 선택하거나 직접 업로드</div>
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowModal(false)}>
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl w-[90vw] max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="text-sm font-semibold text-white">참조 이미지 선택</div>
              <button onClick={() => setShowModal(false)} className="text-zinc-400 hover:text-white text-lg">×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800">
              {([
                { key: "recommended" as const, label: "프리셋" },
                { key: "my" as const, label: "내 이미지" },
                { key: "upload" as const, label: "직접 업로드" },
              ]).map(({ key, label: tl }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                    activeTab === key ? "text-pink-400 border-b-2 border-pink-400" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {tl}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3">
              {activeTab === "upload" ? (
                <label
                  className="block rounded-xl border-2 border-dashed border-zinc-700 hover:border-pink-400/40 cursor-pointer transition-colors py-12 text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f?.type.startsWith("image/")) handleUploadSelect(f);
                  }}
                >
                  <div className="text-zinc-400 text-sm mb-1">드래그하거나 클릭하여 업로드</div>
                  <div className="text-zinc-600 text-[10px]">업로드한 이미지는 내 이미지에 자동 저장됩니다</div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadSelect(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              ) : loading ? (
                <div className="text-zinc-500 text-center py-10 text-sm">로딩 중...</div>
              ) : (
                (() => {
                  const list = activeTab === "recommended" ? recommendedImages : myImages;
                  if (list.length === 0) {
                    return <div className="text-zinc-500 text-center py-10 text-sm">이미지가 없습니다.</div>;
                  }
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {list.map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => handleGallerySelect(img)}
                          className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800 hover:ring-2 hover:ring-pink-400 transition-all group"
                        >
                          {img.imageUrl && (
                            <img src={img.imageUrl} alt={img.label} className="w-full h-full object-cover" loading="lazy" />
                          )}
                          {activeTab === "my" && (
                            <div
                              onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                              className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/80 transition-opacity cursor-pointer"
                            >
                              X
                            </div>
                          )}
                          {img.label && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-zinc-300 truncate">
                              {img.label}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
