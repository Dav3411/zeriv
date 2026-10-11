"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let ignore = false;

    supabase.auth
      .getSession()
      .then(
        ({
          data,
          error,
        }: {
          data: { session: Session | null };
          error: Error | null;
        }) => {
          if (ignore) return;
          if (error) {
            setSession(null);
          } else {
            setSession(data.session ?? null);
          }
          setLoading(false);
        },
      )
      .catch(() => {
        if (ignore) return;
        setSession(null);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: string, nextSession: Session | null) => {
        setSession(nextSession);
        setLoading(false);
      },
    );

    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      session,
      user: session?.user ?? null,
      loading,
      signOut: async () => {
        // scope: "local" — 서버 라운드트립 없이 현재 디바이스 세션만 즉시 정리
        // 기본값(global)은 모든 디바이스 무효화를 위해 네트워크 응답을 기다리므로 느림
        await supabase.auth.signOut({ scope: "local" });
        // 워크스페이스 등 비공개 경로에서 로그아웃할 경우 router.replace 만으로는
        // RSC/prefetch 요청이 미들웨어에 의해 /login 으로 redirect 될 수 있다.
        // 완전 재로드로 클라이언트 상태와 RSC 캐시를 모두 비우고 랜딩으로 보낸다.
        if (typeof window !== "undefined") {
          window.location.assign("/");
        } else {
          router.replace("/");
        }
      },
    };
  }, [session, loading, router]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
