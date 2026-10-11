"use client";

/**
 * /admin/blog — 블로그 관리 (CSR).
 *
 * 두 개의 뷰를 한 페이지에서 토글:
 *   - "list": 글 목록 + 새 글 / 수정 / 삭제 액션
 *   - "edit": 단일 글 작성/수정 폼
 *
 * 인증은 모든 어드민 API (`requireCreditsAdmin`) 에서 처리. 이 페이지는
 * 로그인 세션 토큰만 헤더로 실어 보낸다. 권한 없으면 API 가 401/403 을
 * 돌려주고 우리는 에러 배너로 표시.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  tags: string[];
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
  meta_title: string | null;
  meta_description: string | null;
  author_name: string;
};

type EditDraft = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image_url: string;
  tags: string; // 쉼표 구분 문자열
  status: "draft" | "published";
  meta_title: string;
  meta_description: string;
  author_name: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSlugClient(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

function emptyDraft(): EditDraft {
  return {
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    cover_image_url: "",
    tags: "",
    status: "draft",
    meta_title: "",
    meta_description: "",
    author_name: "Zeriv Team",
  };
}

function postToDraft(p: AdminPost): EditDraft {
  return {
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt ?? "",
    content: p.content ?? "",
    cover_image_url: p.cover_image_url ?? "",
    tags: p.tags.join(", "),
    status: p.status,
    meta_title: p.meta_title ?? "",
    meta_description: p.meta_description ?? "",
    author_name: p.author_name,
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminBlogPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();

  const [view, setView] = useState<"list" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null); // null → 신규
  const [draft, setDraft] = useState<EditDraft>(emptyDraft());
  const [slugTouched, setSlugTouched] = useState(false);

  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const initialized = useRef(false);

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (authLoading) return;
    if (!user && typeof window !== "undefined") {
      router.replace(
        `/login?next=${encodeURIComponent(window.location.pathname)}`,
      );
    }
  }, [authLoading, user, router]);

  const authHeaders = useCallback((): Record<string, string> => {
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
    return {};
  }, [session?.access_token]);

  // -------------------------------------------------------------------------
  // Load list
  // -------------------------------------------------------------------------

  const loadPosts = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/blog", { headers: authHeaders() });
      if (res.status === 401 || res.status === 403) {
        setError("권한이 없습니다. 관리자 계정으로 로그인하세요.");
        return;
      }
      const json = (await res.json()) as {
        posts?: AdminPost[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "글 목록을 불러오지 못했습니다.");
        return;
      }
      setPosts(json.posts ?? []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "글 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, authHeaders]);

  useEffect(() => {
    if (authLoading || !user || !session?.access_token) return;
    if (initialized.current) return;
    initialized.current = true;
    void loadPosts();
  }, [authLoading, user, session?.access_token, loadPosts]);

  // -------------------------------------------------------------------------
  // Edit view actions
  // -------------------------------------------------------------------------

  const openNew = useCallback(() => {
    setEditingId(null);
    setDraft(emptyDraft());
    setSlugTouched(false);
    setEditError(null);
    setView("edit");
  }, []);

  const openEdit = useCallback((post: AdminPost) => {
    setEditingId(post.id);
    setDraft(postToDraft(post));
    setSlugTouched(true); // 기존 글은 자동 동기화 끔
    setEditError(null);
    setView("edit");
  }, []);

  const closeEdit = useCallback(() => {
    setView("list");
    setEditingId(null);
    setDraft(emptyDraft());
    setSlugTouched(false);
    setEditError(null);
  }, []);

  // 신규 글일 때만 title 변경 시 slug 자동 동기화.
  const onTitleChange = useCallback(
    (next: string) => {
      setDraft((prev) => {
        const updated = { ...prev, title: next };
        if (editingId === null && !slugTouched) {
          updated.slug = generateSlugClient(next);
        }
        return updated;
      });
    },
    [editingId, slugTouched],
  );

  const onSlugChange = useCallback((next: string) => {
    setSlugTouched(true);
    setDraft((prev) => ({ ...prev, slug: next }));
  }, []);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const buildPayload = useCallback((d: EditDraft) => {
    const tags = d.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return {
      title: d.title.trim(),
      slug: d.slug.trim(),
      excerpt: d.excerpt,
      content: d.content,
      cover_image_url: d.cover_image_url,
      tags,
      status: d.status,
      meta_title: d.meta_title,
      meta_description: d.meta_description,
      author_name: d.author_name.trim() || "Zeriv Team",
    };
  }, []);

  const handleSave = useCallback(async () => {
    setEditError(null);

    if (!draft.title.trim()) {
      setEditError("제목을 입력하세요.");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload(draft);
      const url = editingId
        ? `/api/admin/blog/${editingId}`
        : "/api/admin/blog";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        post?: AdminPost;
        error?: string;
      };

      if (!res.ok) {
        setEditError(json.error ?? "저장에 실패했습니다.");
        return;
      }

      // 목록 갱신 후 list 뷰로.
      await loadPosts();
      closeEdit();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, [draft, editingId, buildPayload, authHeaders, loadPosts, closeEdit]);

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  const handleDelete = useCallback(
    async (post: AdminPost) => {
      if (typeof window === "undefined") return;
      const ok = window.confirm(
        `"${post.title}" 글을 삭제하시겠습니까? 되돌릴 수 없습니다.`,
      );
      if (!ok) return;

      try {
        const res = await fetch(`/api/admin/blog/${post.id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          window.alert(json.error ?? "삭제에 실패했습니다.");
          return;
        }
        // optimistic 제거.
        setPosts((prev) =>
          prev ? prev.filter((p) => p.id !== post.id) : prev,
        );
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "삭제에 실패했습니다.");
      }
    },
    [authHeaders],
  );

  // -------------------------------------------------------------------------
  // Render guards
  // -------------------------------------------------------------------------

  const headerTitle = useMemo(() => {
    if (view === "edit") {
      return editingId ? "글 수정" : "새 글 쓰기";
    }
    return "Blog";
  }, [view, editingId]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-500 text-sm">
        Loading...
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // JSX
  // -------------------------------------------------------------------------

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">{headerTitle}</h1>
        {view === "list" ? (
          <button
            onClick={openNew}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: "rgba(244,114,182,0.15)",
              border: "1px solid rgba(244,114,182,0.3)",
              color: "#f9a8d4",
            }}
          >
            + 새 글 쓰기
          </button>
        ) : (
          <button
            onClick={closeEdit}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            ← 목록으로
          </button>
        )}
      </div>

      {error && view === "list" && <ErrorBanner message={error} />}

      {/* List view */}
      {view === "list" && (
        <ListView
          loading={loading}
          posts={posts}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Edit view */}
      {view === "edit" && (
        <EditView
          draft={draft}
          editingId={editingId}
          saving={saving}
          error={editError}
          onTitleChange={onTitleChange}
          onSlugChange={onSlugChange}
          onChange={(next) => setDraft(next)}
          onSave={handleSave}
          onCancel={closeEdit}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-4 rounded-lg px-4 py-3 text-sm"
      style={{
        color: "#fca5a5",
        background: "rgba(248,113,113,0.08)",
        border: "1px solid rgba(248,113,113,0.2)",
      }}
    >
      {message}
    </div>
  );
}

function StatusBadge({ status }: { status: AdminPost["status"] }) {
  const isPublished = status === "published";
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold"
      style={{
        background: isPublished
          ? "rgba(52,211,153,0.12)"
          : "rgba(161,161,170,0.12)",
        color: isPublished ? "#34d399" : "#a1a1aa",
        border: isPublished
          ? "1px solid rgba(52,211,153,0.3)"
          : "1px solid rgba(161,161,170,0.25)",
      }}
    >
      {status}
    </span>
  );
}

function ListView({
  loading,
  posts,
  onEdit,
  onDelete,
}: {
  loading: boolean;
  posts: AdminPost[] | null;
  onEdit: (p: AdminPost) => void;
  onDelete: (p: AdminPost) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-14 rounded-lg animate-pulse"
            style={{ background: "rgba(255,255,255,0.03)" }}
          />
        ))}
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500 text-sm">
        등록된 글이 없습니다. "새 글 쓰기" 버튼으로 첫 글을 작성하세요.
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr
            className="text-left text-xs text-zinc-500 uppercase tracking-wider"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <th className="px-4 py-3 font-medium">제목</th>
            <th className="px-4 py-3 font-medium">slug</th>
            <th className="px-4 py-3 font-medium">상태</th>
            <th className="px-4 py-3 font-medium">발행일</th>
            <th className="px-4 py-3 font-medium text-right">액션</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p, i) => (
            <tr
              key={p.id}
              style={{
                borderTop:
                  i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <td className="px-4 py-3">
                <div className="font-medium text-zinc-100 truncate max-w-md">
                  {p.title}
                </div>
                {p.excerpt && (
                  <div className="text-xs text-zinc-500 truncate max-w-md mt-0.5">
                    {p.excerpt}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <code className="text-xs text-zinc-400 font-mono">
                  {p.slug}
                </code>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-4 py-3 text-xs text-zinc-400">
                {fmtDate(p.published_at)}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="inline-flex gap-2">
                  {p.status === "published" && (
                    <a
                      href={`/blog/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      보기
                    </a>
                  )}
                  <button
                    onClick={() => onEdit(p)}
                    className="text-xs text-pink-300 hover:text-pink-200"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => onDelete(p)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    삭제
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditView({
  draft,
  editingId,
  saving,
  error,
  onTitleChange,
  onSlugChange,
  onChange,
  onSave,
  onCancel,
}: {
  draft: EditDraft;
  editingId: string | null;
  saving: boolean;
  error: string | null;
  onTitleChange: (v: string) => void;
  onSlugChange: (v: string) => void;
  onChange: (next: EditDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const upd = <K extends keyof EditDraft>(key: K, val: EditDraft[K]) =>
    onChange({ ...draft, [key]: val });

  const fieldStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgb(228 228 231)",
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {error && <ErrorBanner message={error} />}

      {/* Title */}
      <div>
        <Label>제목 *</Label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="블로그 글 제목"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-400/50"
          style={fieldStyle}
        />
      </div>

      {/* Slug */}
      <div>
        <Label>slug</Label>
        <input
          type="text"
          value={draft.slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="my-post-slug"
          className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-pink-400/50"
          style={fieldStyle}
        />
        <Hint>신규 글은 제목 기준으로 자동 생성됩니다. 수동 수정 가능.</Hint>
      </div>

      {/* Excerpt */}
      <div>
        <Label>요약</Label>
        <textarea
          value={draft.excerpt}
          onChange={(e) => upd("excerpt", e.target.value)}
          rows={2}
          placeholder="목록 카드와 OG description fallback 으로 사용됩니다."
          className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y focus:border-pink-400/50"
          style={fieldStyle}
        />
      </div>

      {/* Content */}
      <div>
        <Label>본문 (마크다운)</Label>
        <textarea
          value={draft.content}
          onChange={(e) => upd("content", e.target.value)}
          placeholder="# 제목&#10;&#10;본문..."
          className="w-full rounded-lg px-3 py-3 text-sm font-mono outline-none resize-y focus:border-pink-400/50"
          style={{
            ...fieldStyle,
            minHeight: 400,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        />
        <Hint>
          렌더 시 marked 로 HTML 변환. 신뢰 가능한 어드민 입력 전제로 sanitize
          하지 않습니다.
        </Hint>
      </div>

      {/* Tags */}
      <div>
        <Label>태그 (쉼표 구분)</Label>
        <input
          type="text"
          value={draft.tags}
          onChange={(e) => upd("tags", e.target.value)}
          placeholder="쿠팡, 썸네일, AI"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-400/50"
          style={fieldStyle}
        />
      </div>

      {/* Cover image */}
      <div>
        <Label>커버 이미지 URL</Label>
        <input
          type="text"
          value={draft.cover_image_url}
          onChange={(e) => upd("cover_image_url", e.target.value)}
          placeholder="https://..."
          className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-pink-400/50"
          style={fieldStyle}
        />
      </div>

      {/* Status + author */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <Label>상태</Label>
          <select
            value={draft.status}
            onChange={(e) =>
              upd("status", e.target.value as "draft" | "published")
            }
            className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-400/50"
            style={fieldStyle}
          >
            <option value="draft">draft (비공개)</option>
            <option value="published">published (공개)</option>
          </select>
        </div>
        <div>
          <Label>저자</Label>
          <input
            type="text"
            value={draft.author_name}
            onChange={(e) => upd("author_name", e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-400/50"
            style={fieldStyle}
          />
        </div>
      </div>

      {/* SEO */}
      <div
        className="rounded-xl p-4 space-y-4"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
          SEO
        </div>

        <div>
          <Label>meta_title</Label>
          <input
            type="text"
            value={draft.meta_title}
            onChange={(e) => upd("meta_title", e.target.value)}
            placeholder="비워두면 제목을 사용합니다."
            className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-400/50"
            style={fieldStyle}
          />
        </div>

        <div>
          <Label>meta_description</Label>
          <textarea
            value={draft.meta_description}
            onChange={(e) => upd("meta_description", e.target.value)}
            rows={2}
            placeholder="검색 엔진 결과에 노출되는 설명. 비워두면 요약을 사용."
            className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y focus:border-pink-400/50"
            style={fieldStyle}
          />
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          취소
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          style={{
            background: "rgba(244,114,182,0.15)",
            border: "1px solid rgba(244,114,182,0.3)",
            color: "#f9a8d4",
          }}
        >
          {saving
            ? "저장 중..."
            : editingId
              ? draft.status === "published"
                ? "수정 후 발행"
                : "수정 저장"
              : draft.status === "published"
                ? "발행"
                : "초안 저장"}
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-zinc-600 mt-1">{children}</p>;
}
