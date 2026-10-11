"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";

export default function EditPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  return (
    <div
      className="h-dvh overflow-auto"
      style={{ background: "var(--surface-0)" }}
    >
      <SiteHeader />
      <main
        className="pt-11 lg:pt-14"
        style={{
          paddingLeft: "var(--sidebar-active-w, var(--sidebar-w-collapsed))",
          transition: "padding-left 0.2s ease",
        }}
      >
        <div className="w-full flex flex-col">
          <div className="px-4 sm:px-8 py-10 space-y-8 max-w-3xl mx-auto w-full">
            {/* 헤더 */}
            <div>
              <h1 className="text-2xl font-bold text-zinc-100">
                이미지 편집 도구
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                이미지 편집 도구 모음입니다.
              </p>
            </div>

            {/* 쿠팡 썸네일 카드 */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-200">
                    쿠팡 썸네일 생성
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    쿠팡 마켓플레이스 기준에 맞는 상품 썸네일을 자동으로
                    생성합니다.
                  </p>
                </div>
                <Link
                  href="/thumbnail"
                  className="inline-block rounded-xl px-4 py-2 text-sm font-semibold"
                  style={{ background: "var(--brand-gradient)", color: "#000" }}
                >
                  도구 열기
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
