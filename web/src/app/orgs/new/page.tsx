"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";

// open redirect 방어: 내부 경로만 허용
function isInternalPath(path: string): boolean {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !/^\/[^/]*:/.test(path)
  );
}

export default function OrgNewPage() {
  const { user, loading } = useRequireAuth();
  const { fetchWithAuth } = useFetchWithAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetchWithAuth("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Organization 생성에 실패했습니다.");
        return;
      }
      const org = (await res.json()) as { id: string };
      const next = searchParams.get("next");
      if (next && isInternalPath(next)) {
        const sep = next.includes("?") ? "&" : "?";
        router.push(`${next}${sep}org_id=${org.id}`);
      } else {
        router.push(`/brands/new?org_id=${org.id}`);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return null;
  if (!user) return null;

  return (
    <div
      className="h-dvh overflow-auto"
      style={{ background: "var(--surface-0)" }}
    >
      <SiteHeader />
      <main className="min-h-screen pt-11 lg:pt-14 lg:pl-[var(--sidebar-active-w,var(--sidebar-w-collapsed))] flex justify-center">
        <div className="w-full max-w-lg px-4 sm:px-6 pt-10 pb-[calc(2.5rem+56px+env(safe-area-inset-bottom))] lg:pb-10 space-y-8">
          {/* 뒤로가기 */}
          <Link
            href="/brands"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
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
              <path d="m15 18-6-6 6-6" />
            </svg>
            내 브랜드
          </Link>

          {/* 페이지 헤더 */}
          <div>
            <p
              className="text-[11px] uppercase tracking-widest font-semibold mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              New Organization
            </p>
            <h1 className="font-headline text-2xl lg:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              새 Organization 만들기
            </h1>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
              Organization은 브랜드와 팀원을 묶는 관리 단위입니다.
            </p>
          </div>

          {/* 폼 카드 */}
          <div
            className="rounded-2xl"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {/* Organization 이름 */}
            <div className="px-6 py-5">
              <label
                className="block text-[11px] uppercase tracking-widest font-semibold mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Organization 이름 *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
                placeholder="Zeriv Team"
                className="w-full px-4 py-3 rounded-xl text-base text-[var(--text-primary)] placeholder:text-zinc-600 outline-none transition-all"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
                autoFocus
                maxLength={50}
              />
              <p className="text-[10px] text-zinc-600 text-right mt-1">
                {name.length}/50
              </p>
            </div>
          </div>

          {/* 에러 + CTA */}
          <div className="flex flex-col gap-4">
            {error && (
              <div
                className="rounded-2xl px-6 py-4 text-sm"
                style={{
                  color: "#ef4444",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(248,113,113,0.2)",
                }}
              >
                {error}
              </div>
            )}

            {/* CTA 버튼 — org는 administrative, pink gradient 사용 금지 */}
            <button
              type="button"
              onClick={handleCreate}
              disabled={!name.trim() || creating}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-full text-base font-bold active:scale-95 transition-all disabled:opacity-40"
              style={{
                background: "var(--surface-3)",
                border: "1px solid var(--border-hover)",
                color: "var(--text-primary)",
              }}
            >
              {creating ? "Organization 생성 중..." : "Organization 만들기 →"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
