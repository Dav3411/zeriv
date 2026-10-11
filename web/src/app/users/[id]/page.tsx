"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { trackEvent } from "@/lib/analytics";

type Profile = { userId: string; nickname: string };

type Model = {
  id: string;
  name: string;
  selections: {
    face_type?: string;
    style_vibe?: string;
  };
  face_image_url: string | null;
  status: string;
};

const FACE_EMOJI: Record<string, string> = {
  dog: "🐶",
  cat: "🐱",
  fox: "🦊",
  rabbit: "🐰",
  deer: "🦌",
  snake: "🐍",
  hamster: "🐹",
};

export default function UserHomePage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("userProfile");
  const tc = useTranslations("common");
  const { user, session, loading: authLoading } = useAuth();
  const id = typeof params?.id === "string" ? params.id : "";
  const token = session?.access_token ?? "";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"models">("models");

  const isOwnProfile = !!user && !!id && user.id === id;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/users/${id}`)}`);
      return;
    }
    if (!id) return;
    void trackEvent("page_view", { page: "user_home", userId: id });
  }, [authLoading, user, id, router]);

  useEffect(() => {
    if (!id || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/users/${encodeURIComponent(id)}/profile`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = (await res.json()) as {
          nickname?: string;
          userId?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setProfileError(data.error ?? "Profile not found");
          return;
        }
        setProfile({
          userId: data.userId ?? id,
          nickname: data.nickname ?? "User",
        });
      } catch {
        if (!cancelled) setProfileError("Failed to load profile");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  useEffect(() => {
    if (!token || !isOwnProfile) {
      setModelsLoading(false);
      return;
    }
    let cancelled = false;
    setModelsLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/personas/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as {
          models?: Model[];
          error?: string;
        };
        if (!cancelled && res.ok)
          setModels(Array.isArray(data.models) ? data.models : []);
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isOwnProfile]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center lg-pl-sidebar">
        <div className="text-zinc-500">{tc("loading")}</div>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">{t("invalidUser")}</div>
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-x-hidden overflow-y-auto relative text-zinc-100 lg-pl-sidebar">
      <SiteHeader />

      <main className="pt-11 lg:pt-0 max-w-5xl mx-auto px-6 py-10 relative z-10">
        {profileError ? (
          <div className="text-red-500">{profileError}</div>
        ) : (
          <>
            <div className="mb-6 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 p-6 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-semibold text-gray-100">
                  {isOwnProfile
                    ? t("myPage")
                    : profile
                      ? profile.nickname
                      : tc("loading")}
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {isOwnProfile ? t("ownSubtitle") : t("otherSubtitle")}
                </p>
              </div>
              {isOwnProfile ? (
                <Link
                  href="/account"
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-pink-400/25 border-0"
                  style={{ background: "var(--brand-gradient)", color: "#000" }}
                >
                  {tc("account")}
                </Link>
              ) : null}
            </div>

            <div className="mb-6 flex items-center gap-1 rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 p-1 w-fit">
              {isOwnProfile && (
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "models" ? "shadow-lg" : "text-zinc-400 hover:text-zinc-200"}`}
                  style={
                    activeTab === "models"
                      ? { background: "var(--brand-gradient)", color: "#000" }
                      : {}
                  }
                  onClick={() => setActiveTab("models")}
                >
                  {t("tabModels")}
                </button>
              )}
            </div>

            {activeTab === "models" && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium text-gray-100">
                    {t("tabModels")}
                  </h2>
                  <Link
                    href="/brands"
                    className="px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg"
                    style={{
                      background: "var(--brand-gradient)",
                      color: "#000",
                    }}
                  >
                    + {tc("createModelTab")}
                  </Link>
                </div>
                {modelsLoading ? (
                  <p className="text-sm text-zinc-500">{t("loadingModels")}</p>
                ) : models.length === 0 ? (
                  <p className="text-sm text-zinc-500">{t("noModelsYet")}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {models.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-2xl overflow-hidden border border-white/10"
                        style={{ background: "var(--surface-1)" }}
                      >
                        <div className="aspect-square relative overflow-hidden bg-zinc-900">
                          {m.face_image_url ? (
                            <img
                              src={m.face_image_url}
                              alt={m.name}
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-4xl">
                              {FACE_EMOJI[m.selections?.face_type ?? ""] ??
                                "🧬"}
                            </div>
                          )}
                        </div>
                        <div className="p-2.5 space-y-1">
                          <div className="font-semibold text-white text-sm truncate">
                            {m.name}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-pink-500/20 text-pink-300 border border-pink-400/30">
                              {FACE_EMOJI[m.selections?.face_type ?? ""]}{" "}
                              {m.selections?.face_type ?? ""}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-orange-500/15 text-orange-300 border border-orange-400/20">
                              {(m.selections?.style_vibe ?? "").replace(
                                /_/g,
                                " ",
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
