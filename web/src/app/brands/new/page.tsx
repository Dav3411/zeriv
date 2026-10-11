"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { OrgDropdown } from "@/components/OrgDropdown";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";

const COLOR_PRESETS = [
  "#FF6B6B",
  "#FF9F43",
  "#FFC0CB",
  "#7EC8C8",
  "#4A90D9",
  "#9B59B6",
  "#2ECC71",
  "#1A1A2E",
  "#A0A0A0",
];

export default function BrandNewPage() {
  const { user, loading } = useRequireAuth();
  const { fetchWithAuth } = useFetchWithAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#ffa4c6");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Org 상태
  const [orgs, setOrgs] = useState<
    { id: string; name: string; brandCount?: number }[]
  >([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // org 목록 fetch
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchWithAuth("/api/organizations")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          organizations?: {
            id: string;
            name: string;
            usage?: { brandCount?: number };
          }[];
        };
        const list = (data.organizations ?? []).map((o) => ({
          id: o.id,
          name: o.name,
          brandCount: o.usage?.brandCount,
        }));
        if (cancelled) return;
        setOrgs(list);
        // org_id 쿼리 파라미터 또는 첫 번째 org 자동 선택
        const orgIdParam = searchParams.get("org_id");
        const initial =
          orgIdParam && list.find((o) => o.id === orgIdParam)
            ? orgIdParam
            : (list[0]?.id ?? null);
        setSelectedOrgId(initial);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleCreate() {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetchWithAuth("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          primaryColor: color,
          organizationId: selectedOrgId ?? undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "브랜드 생성에 실패했습니다.");
        return;
      }
      const brand = (await res.json()) as { id: string };
      const next = searchParams.get("next");
      const plan = searchParams.get("plan");
      // open redirect 방지: 내부 경로만 허용 (/ 시작, // 또는 프로토콜 포함 차단)
      if (
        next &&
        next.startsWith("/") &&
        !next.startsWith("//") &&
        !/^\/[^/]*:/.test(next)
      ) {
        const destination = plan
          ? `${next}?plan=${encodeURIComponent(plan)}`
          : next;
        router.push(destination);
      } else {
        router.push(`/${brand.id}`);
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
      <main
        className="min-h-screen pt-11 lg:pt-14 flex justify-center"
        style={{
          paddingLeft: "var(--sidebar-active-w, var(--sidebar-w-collapsed))",
          transition: "padding-left 0.2s ease",
        }}
      >
        <div className="w-full max-w-lg px-4 sm:px-6 py-10 space-y-8">
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
              style={{ color: "rgba(255,164,198,0.45)" }}
            >
              New Brand
            </p>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-white">
              새 브랜드 만들기
            </h1>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
              브랜드 정보를 입력하면 바로 워크스페이스가 열립니다
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
            {/* Organization 선택 (다중 org 사용자만) */}
            {orgs.length > 1 && (
              <div
                className="px-6 py-5"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <label
                    className="text-[11px] uppercase tracking-widest font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Organization *
                  </label>
                  <Link
                    href="/orgs/new?next=/brands/new"
                    className="text-[11px] text-zinc-500 hover:text-pink-400 transition-colors"
                  >
                    + 새 Organization 만들기
                  </Link>
                </div>
                <OrgDropdown
                  orgs={orgs}
                  selectedOrgId={selectedOrgId}
                  onChange={setSelectedOrgId}
                />
              </div>
            )}

            {/* 브랜드 이름 */}
            <div
              className="px-6 py-5"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <label
                className="block text-[11px] uppercase tracking-widest font-semibold mb-2"
                style={{ color: "rgba(255,164,198,0.45)" }}
              >
                브랜드 이름 *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: Aesop, Laneige, 오설록..."
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
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

            {/* 브랜드 설명 */}
            <div
              className="px-6 py-5"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <label
                className="block text-[11px] uppercase tracking-widest font-semibold mb-2"
                style={{ color: "rgba(255,164,198,0.45)" }}
              >
                브랜드 설명
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="브랜드를 간단히 설명해주세요..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-zinc-600 outline-none transition-all resize-none"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
                maxLength={200}
              />
              <p className="text-[10px] text-zinc-600 text-right mt-1">
                {description.length}/200
              </p>
            </div>

            {/* 브랜드 컬러 */}
            <div className="px-6 py-5">
              <label
                className="block text-[11px] uppercase tracking-widest font-semibold mb-3"
                style={{ color: "rgba(255,164,198,0.45)" }}
              >
                브랜드 컬러
              </label>

              {/* 컬러 프리셋 스와치 */}
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    className="w-7 h-7 rounded-lg transition-all shrink-0"
                    style={{
                      background: preset,
                      outline:
                        color === preset
                          ? "2px solid var(--text-primary)"
                          : "2px solid transparent",
                      outlineOffset: "2px",
                    }}
                    aria-label={preset}
                  />
                ))}

                {/* 구분선 */}
                <div
                  className="w-px h-6 shrink-0"
                  style={{ background: "var(--border-default)" }}
                />

                {/* Native color picker */}
                <label className="relative w-7 h-7 rounded-lg cursor-pointer overflow-hidden shrink-0">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div
                    className="w-full h-full rounded-lg flex items-center justify-center"
                    style={{ background: color }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgba(0,0,0,0.5)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </div>
                </label>

                {/* hex 값 텍스트 */}
                <span className="text-xs text-zinc-500 font-mono">
                  {color.toUpperCase()}
                </span>
              </div>

              {/* 아바타 미리보기 */}
              <div className="flex items-center gap-3 mt-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold text-white"
                  style={{
                    background: color,
                    boxShadow: `0 4px 12px ${color}55`,
                  }}
                >
                  {name.charAt(0).toUpperCase() || "B"}
                </div>
                <p className="text-xs text-zinc-500">브랜드 아바타 미리보기</p>
              </div>
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

            {/* CTA 버튼 */}
            <button
              type="button"
              onClick={handleCreate}
              disabled={!name.trim() || creating}
              className="w-full flex items-center justify-center gap-2.5 pl-6 pr-2.5 py-4 rounded-full text-base font-bold active:scale-95 transition-all disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                color: "#000",
                boxShadow: "0 4px 16px rgba(255,164,198,0.2)",
              }}
            >
              {creating ? (
                "브랜드 생성 중..."
              ) : (
                <>
                  브랜드 만들기
                  <span className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* 생성 중 오버레이 */}
      {creating && (
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
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="rgba(255,164,198,0.3)"
                strokeWidth="3"
              />
              <path
                d="M12 2a10 10 0 0110 10"
                stroke="#ffa4c6"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-white">브랜드 생성 중</p>
            <p className="text-xs text-zinc-500">잠시만 기다려주세요</p>
          </div>
        </div>
      )}
    </div>
  );
}
