"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

export function LandingNav() {
  const t = useTranslations("landing");
  const { user, loading } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        window.location.assign("/");
      }
    } finally {
      setSigningOut(false);
    }
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: scrolled ? "rgba(9,9,11,0.80)" : "rgba(9,9,11,0)",
        backdropFilter: scrolled ? "blur(24px) saturate(180%)" : "blur(0px)",
        WebkitBackdropFilter: scrolled
          ? "blur(24px) saturate(180%)"
          : "blur(0px)",
        borderBottom: scrolled
          ? "1px solid rgba(255,255,255,0.07)"
          : "1px solid rgba(255,255,255,0)",
        transition:
          "background 0.4s ease, backdrop-filter 0.4s ease, border-color 0.4s ease",
      }}
    >
      <div className="flex w-full items-center justify-between px-8 sm:px-10 py-5">
        <Link href="/" className="flex items-center">
          <Logo width={120} height={28} />
        </Link>

        {/* 데스크톱 메뉴 — md 미만에서는 숨김 */}
        <div className="hidden md:flex items-center gap-6">
          {/* 둘러보기 — 로그인 상태에 따라 분기.
              로그인: /quick (워크스페이스 진입), 비로그인: /explore (공개 갤러리) */}
          <Link
            href={user ? "/quick" : "/explore"}
            className="text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-200"
          >
            {t("browse")}
          </Link>

          {!loading &&
            (user ? (
              <>
                <Link
                  href="/brands"
                  className="text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-200"
                >
                  대시보드
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors duration-200 disabled:opacity-50"
                >
                  {signingOut ? "로그아웃 중..." : "로그아웃"}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-200"
                >
                  {t("navSignIn")}
                </Link>
                {/* 비로그인 CTA — pink gradient pill */}
                <Link
                  href="/signup"
                  className="text-sm font-bold transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    padding: "8px 18px",
                    borderRadius: "9999px",
                    background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                    color: "#000",
                    boxShadow: "0 2px 16px rgba(255,164,198,0.28)",
                  }}
                >
                  무료로 시작
                </Link>
              </>
            ))}
        </div>

        {/* 모바일 전용 CTA — md 이상에서는 숨김 */}
        {!loading && (
          <div className="flex md:hidden">
            {user ? (
              <Link
                href="/brands"
                className="text-base font-semibold text-white hover:text-white/80 transition-colors tracking-wide"
              >
                대시보드
              </Link>
            ) : (
              <Link
                href="/signup"
                className="text-base font-semibold text-white hover:text-white/80 transition-colors tracking-wide"
              >
                {t("navSignUp")}
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
