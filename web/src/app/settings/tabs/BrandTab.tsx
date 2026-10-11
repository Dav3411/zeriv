"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import { useAuth } from "@/components/AuthProvider";
import type { Brand } from "@/lib/brand.types";
import { getLastBrandId, setLastBrandId, clearLastBrandId } from "@/components/BrandProvider";
import { clearBrandNameCache } from "@/components/SiteHeader";
import {
  CHANNEL_GROUPS,
  CHANNEL_PRESETS_MAP,
  type ChannelKey,
} from "@/lib/channelPresets";

const inputCls =
  "w-full px-4 py-3 rounded-xl text-base md:text-sm placeholder:text-[color:var(--text-muted)] outline-none transition-all focus:border-[rgba(255,164,198,0.4)] focus:shadow-[0_0_0_3px_rgba(255,164,198,0.08)]";
const inputStyle = {
  color: "var(--text-primary)",
  background: "var(--surface-1)",
  border: "1px solid var(--border-default)",
};

export default function BrandTab() {
  const router = useRouter();
  const { fetchWithAuth } = useFetchWithAuth();
  const { user } = useAuth();

  /* ── 브랜드 목록/활성 브랜드 ───────────────────────── */
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ── 브랜드 탭 state ───────────────────────────────────── */
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBrandConfirmText, setDeleteBrandConfirmText] = useState("");
  const [deleteBrandError, setDeleteBrandError] = useState("");
  const [brandName, setBrandName] = useState("");
  const [savingBrandName, setSavingBrandName] = useState(false);
  const [brandNameError, setBrandNameError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profileColor, setProfileColor] = useState("#ffa4c6");
  const [savingColor, setSavingColor] = useState(false);
  const [brandProfile, setBrandProfile] = useState<{
    description: string;
    keywords: string[];
    prohibited_rules: string[];
    mood_summary: string | null;
  } | null>(null);
  const [profileDesc, setProfileDesc] = useState("");
  const [profileKeywords, setProfileKeywords] = useState<string[]>([]);
  const [profileRules, setProfileRules] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [ruleInput, setRuleInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [brandProfileError, setBrandProfileError] = useState("");
  const [brandProfileLoading, setBrandProfileLoading] = useState(false);
  const [preferredChannels, setPreferredChannels] = useState<Set<ChannelKey>>(
    new Set(),
  );
  const [savingChannels, setSavingChannels] = useState(false);
  const [members, setMembers] = useState<
    { userId: string; email: string; role: string; joinedAt: string }[]
  >([]);
  const [pendingInvites, setPendingInvites] = useState<
    {
      id: string;
      email: string;
      createdAt: string;
      expiresAt: string;
      expired: boolean;
    }[]
  >([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [memberLimit, setMemberLimit] = useState<number | null>(null);
  const [brandPlanKey, setBrandPlanKey] = useState<string | null>(null);

  /* ── 활성 브랜드 ID 초기화 ─────────────────────────── */
  useEffect(() => {
    setActiveBrandId(getLastBrandId(user?.id ?? null));
  }, [user?.id]);

  /* ── 브랜드 목록 로딩 ─────────────────────────────── */
  useEffect(() => {
    fetchWithAuth("/api/brands")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setBrands(Array.isArray(data) ? data : (data.brands ?? []));
        }
      })
      .catch(() => {})
      .finally(() => setBrandsLoading(false));
  }, [fetchWithAuth]);

  /* ── 브랜드 기본 정보 (이름/색상/선호 채널) ─────────── */
  useEffect(() => {
    if (!activeBrandId) return;
    const activeBrand = brands.find((b) => b.id === activeBrandId);
    if (activeBrand) {
      setBrandName(activeBrand.name);
      setProfileColor(activeBrand.primaryColor ?? "#ffa4c6");
      const saved = (
        activeBrand.meta as { preferred_channels?: ChannelKey[] } | null
      )?.preferred_channels;
      if (saved) setPreferredChannels(new Set(saved));
    }
  }, [activeBrandId, brands]);

  /* ── 브랜드 프로필 ────────────────────────────────── */
  useEffect(() => {
    if (brandsLoading || !activeBrandId) return;
    let cancelled = false;
    setBrandProfileLoading(true);
    fetchWithAuth(`/api/brands/${activeBrandId}/profile`)
      .then(async (r) => {
        if (cancelled || !r.ok) return;
        const d = (await r.json()) as {
          profile: {
            description: string | null;
            keywords: string[];
            prohibited_rules: string[];
            mood_summary: string | null;
          };
        };
        const p = d.profile;
        setBrandProfile({
          description: p.description ?? "",
          keywords: p.keywords ?? [],
          prohibited_rules: p.prohibited_rules ?? [],
          mood_summary: p.mood_summary ?? null,
        });
        setProfileDesc(p.description ?? "");
        setProfileKeywords(p.keywords ?? []);
        setProfileRules(p.prohibited_rules ?? []);
      })
      .catch(() => setBrandProfileError("네트워크 오류가 발생했습니다."))
      .finally(() => {
        if (!cancelled) setBrandProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandsLoading, activeBrandId, fetchWithAuth]);

  /* ── 팀원/초대 목록 ───────────────────────────────── */
  useEffect(() => {
    if (brandsLoading || !activeBrandId) return;
    let cancelled = false;
    setMembersLoading(true);
    fetchWithAuth(`/api/brands/${activeBrandId}/members`)
      .then(async (r) => {
        if (cancelled || !r.ok) return;
        const d = (await r.json()) as {
          members: {
            userId: string;
            email: string;
            role: string;
            joinedAt: string;
          }[];
          pendingInvites: {
            id: string;
            email: string;
            createdAt: string;
            expiresAt: string;
            expired: boolean;
          }[];
          memberLimit: number | null;
        };
        setMembers(d.members ?? []);
        setPendingInvites(d.pendingInvites ?? []);
        setMemberLimit(d.memberLimit ?? null);
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandsLoading, activeBrandId, fetchWithAuth]);

  /* ── 플랜 키 ──────────────────────────────────────── */
  useEffect(() => {
    if (brandsLoading || !activeBrandId) return;
    let cancelled = false;
    fetchWithAuth(`/api/brands/${activeBrandId}/subscription`)
      .then(async (r) => {
        if (cancelled || !r.ok) return;
        const d = (await r.json()) as { planKey: string | null };
        setBrandPlanKey(d.planKey ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [brandsLoading, activeBrandId, fetchWithAuth]);

  /* ── 핸들러 ───────────────────────────────────────── */
  const handleSaveBrandProfile = useCallback(async () => {
    if (!activeBrandId) return;
    setSavingProfile(true);
    setBrandProfileError("");
    try {
      const res = await fetchWithAuth(`/api/brands/${activeBrandId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: profileDesc.trim() || null,
          keywords: profileKeywords,
          prohibited_rules: profileRules,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBrandProfileError(
          (data as { error?: string }).error ?? "저장에 실패했습니다.",
        );
        return;
      }
      const updated = data as {
        profile?: {
          description: string | null;
          keywords: string[];
          prohibited_rules: string[];
          mood_summary: string | null;
        };
      };
      if (updated?.profile) {
        setBrandProfile({
          description: updated.profile.description ?? "",
          keywords: updated.profile.keywords ?? [],
          prohibited_rules: updated.profile.prohibited_rules ?? [],
          mood_summary: updated.profile.mood_summary ?? null,
        });
      } else {
        setBrandProfile({
          description: profileDesc.trim(),
          keywords: profileKeywords,
          prohibited_rules: profileRules,
          mood_summary: brandProfile?.mood_summary ?? null,
        });
      }
    } catch {
      setBrandProfileError("네트워크 오류가 발생했습니다.");
    } finally {
      setSavingProfile(false);
    }
  }, [
    activeBrandId,
    fetchWithAuth,
    profileDesc,
    profileKeywords,
    profileRules,
    brandProfile?.mood_summary,
  ]);

  const handleSaveBrandChannels = async () => {
    if (!activeBrandId) return;
    setSavingChannels(true);
    try {
      await fetchWithAuth(`/api/brands/${activeBrandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredChannels: Array.from(preferredChannels),
        }),
      });
    } finally {
      setSavingChannels(false);
    }
  };

  const handleSaveBrandName = async () => {
    if (!activeBrandId || !brandName.trim()) return;
    setSavingBrandName(true);
    setBrandNameError("");
    try {
      const res = await fetchWithAuth(`/api/brands/${activeBrandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: brandName.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setBrandNameError(
          (d as { error?: string }).error ?? "저장에 실패했습니다.",
        );
        return;
      }
      clearBrandNameCache(activeBrandId ?? "");
      window.location.reload();
    } catch {
      setBrandNameError("네트워크 오류가 발생했습니다.");
    } finally {
      setSavingBrandName(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!activeBrandId) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetchWithAuth(
        `/api/brands/${activeBrandId}/upload`,
        { method: "POST", body: fd },
      );
      if (!uploadRes.ok) return;
      const { imageUrl } = (await uploadRes.json()) as { imageUrl: string };
      const patchRes = await fetchWithAuth(`/api/brands/${activeBrandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_url: imageUrl }),
      });
      if (patchRes.ok) {
        clearBrandNameCache(activeBrandId ?? "");
        window.location.reload();
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!activeBrandId) return;
    setUploadingAvatar(true);
    try {
      const res = await fetchWithAuth(`/api/brands/${activeBrandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_url: null }),
      });
      if (res.ok) {
        clearBrandNameCache(activeBrandId ?? "");
        window.location.reload();
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleInviteMember = useCallback(async () => {
    if (!activeBrandId || !inviteEmail.trim()) return;
    setSendingInvite(true);
    setInviteError("");
    setInviteSuccess(false);
    try {
      const res = await fetchWithAuth(`/api/brands/${activeBrandId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setInviteError(data.error ?? "초대 발송에 실패했습니다.");
        return;
      }
      setInviteSuccess(true);
      setInviteEmail("");
      const r2 = await fetchWithAuth(`/api/brands/${activeBrandId}/members`);
      if (r2.ok) {
        const d2 = (await r2.json()) as {
          members: {
            userId: string;
            email: string;
            role: string;
            joinedAt: string;
          }[];
          pendingInvites: {
            id: string;
            email: string;
            createdAt: string;
            expiresAt: string;
            expired: boolean;
          }[];
          memberLimit: number | null;
        };
        setMembers(d2.members ?? []);
        setPendingInvites(d2.pendingInvites ?? []);
      }
    } catch {
      setInviteError("네트워크 오류가 발생했습니다.");
    } finally {
      setSendingInvite(false);
    }
  }, [activeBrandId, fetchWithAuth, inviteEmail]);

  const handleBrandSwitch = (brandId: string) => {
    if (brandId === activeBrandId) {
      setDropdownOpen(false);
      return;
    }
    setActiveBrandId(brandId);
    if (user?.id) setLastBrandId(user.id, brandId);
    setDropdownOpen(false);
  };

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const handleDeleteBrand = async () => {
    if (!activeBrandId) return;
    setDeleting(true);
    setDeleteBrandError("");
    try {
      const res = await fetchWithAuth(`/api/brands/${activeBrandId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteBrandError(
          (d as { error?: string }).error ?? "삭제에 실패했습니다.",
        );
        setDeleting(false);
        return;
      }
      clearBrandNameCache(activeBrandId);
      if (user?.id) clearLastBrandId(user.id);
      setDeleting(false);
      router.replace("/");
    } catch {
      setDeleteBrandError("네트워크 오류가 발생했습니다.");
      setDeleting(false);
    }
  };

  const activeBrand = brands.find((b) => b.id === activeBrandId);

  return (
    <>
      {/* 브랜드 전환 드롭다운 */}
      {activeBrand && (
      <div className="mb-6">
        {brands.length <= 1 ? (
          <div className="inline-flex items-center gap-2">
            {activeBrand?.logoUrl ? (
              <img src={activeBrand.logoUrl} className="w-5 h-5 rounded-md object-cover shrink-0" alt="" />
            ) : (
              <div
                className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                style={{ background: activeBrand?.primaryColor ?? "#ffa4c6" }}
              >
                {(activeBrand?.name ?? "?")[0]?.toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {activeBrand?.name ?? "브랜드"}
            </span>
          </div>
        ) : (
          <div ref={dropdownRef} className="relative inline-block max-w-full">
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-1)")}
            >
              {activeBrand?.logoUrl ? (
                <img src={activeBrand.logoUrl} className="w-5 h-5 rounded-md object-cover shrink-0" alt="" />
              ) : (
                <div
                  className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: activeBrand?.primaryColor ?? "#ffa4c6" }}
                >
                  {(activeBrand?.name ?? "?")[0]?.toUpperCase()}
                </div>
              )}
              <span className="max-w-[140px] truncate">{activeBrand?.name ?? "브랜드 선택"}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className={`shrink-0 transition-transform duration-150 ${dropdownOpen ? "rotate-180" : ""}`}
                style={{ color: "var(--text-muted)" }}
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {dropdownOpen && (
              <div
                className="absolute left-0 top-full mt-1.5 w-56 max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden z-50 py-1"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                }}
              >
                {brands.map((b) => {
                  const isActive = b.id === activeBrandId;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleBrandSwitch(b.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
                      style={{
                        background: isActive ? "var(--surface-2)" : "transparent",
                        color: "var(--text-primary)",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = "var(--surface-2)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {b.logoUrl ? (
                        <img src={b.logoUrl} className="w-7 h-7 rounded-md object-cover shrink-0" alt="" />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ background: b.primaryColor ?? "#ffa4c6" }}
                        >
                          {(b.name ?? "?")[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm truncate flex-1">{b.name}</span>
                      {isActive && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          className="shrink-0"
                          style={{ color: "var(--accent)" }}
                        >
                          <path
                            d="M2.5 7l3.5 3.5 5.5-6"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* 헤더 */}
      <div
        className="flex items-center justify-between gap-4 pb-8 mb-8 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="min-w-0">
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            브랜드
          </h1>
          <p
            className="text-sm mt-1 break-keep"
            style={{ color: "var(--text-secondary)" }}
          >
            브랜드의 비주얼 DNA와 핵심 정보를 설정합니다.
          </p>
        </div>
        {brandPlanKey &&
          (() => {
            const cfg = (
              {
                free: {
                  label: "Free",
                  bg: "rgba(161,161,170,0.12)",
                  color: "#a1a1aa",
                },
                starter: {
                  label: "Atelier",
                  bg: "rgba(244,114,182,0.15)",
                  color: "#f472b6",
                },
                label: {
                  label: "Label",
                  bg: "rgba(167,139,250,0.15)",
                  color: "#a78bfa",
                },
                pro: {
                  label: "Pro",
                  bg: "rgba(56,189,248,0.15)",
                  color: "#38bdf8",
                },
                studio: {
                  label: "House",
                  bg: "rgba(251,191,36,0.15)",
                  color: "#fbbf24",
                },
              } as Record<string, { label: string; bg: string; color: string }>
            )[brandPlanKey];
            if (!cfg) return null;
            return (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold"
                style={{ background: cfg.bg, color: cfg.color }}
              >
                {cfg.label}
              </span>
            );
          })()}
      </div>

      {!activeBrandId ? (
        <div
          className="rounded-2xl px-6 py-10 text-center"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            브랜드를 먼저 선택해주세요.
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            프로필 탭에서 기본 브랜드를 선택하거나 새 브랜드를 만드세요.
          </p>
          <Link
            href="/brands/new"
            className="inline-flex items-center gap-1 mt-4 px-4 py-2 rounded-full text-xs font-bold active:scale-95 transition-transform"
            style={{
              background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
              color: "#000",
            }}
          >
            + 새 브랜드 만들기
          </Link>
        </div>
      ) : (
        <>
          {/* ═══════════════════════════════════════════════════
              섹션 1: 일반
              ═══════════════════════════════════════════════════ */}
          <section>
            <div
              className="flex items-center gap-3 mb-6 pb-6"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "var(--accent-subtle)" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
                </svg>
              </div>
              <h2
                className="font-headline text-lg font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                일반
              </h2>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
              <div className="w-full md:w-[200px] md:shrink-0">
                <p
                  className="text-xs leading-relaxed break-keep"
                  style={{ color: "var(--text-secondary)" }}
                >
                  브랜드 이름, 컬러, 아바타를 설정합니다.
                </p>
              </div>
              <div className="flex-1 min-w-0 space-y-5">
                {/* 아바타 행 */}
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center overflow-hidden"
                    style={{
                      background: activeBrand?.primaryColor ?? "#EC4899",
                      boxShadow: `0 4px 12px ${activeBrand?.primaryColor ?? "#EC4899"}33`,
                    }}
                  >
                    {activeBrand?.logoUrl ? (
                      <img
                        src={activeBrand.logoUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xl font-bold text-white">
                        {(activeBrand?.name ?? "?")[0].toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={uploadingAvatar}
                        onClick={() => avatarInputRef.current?.click()}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40 transition-all active:scale-95"
                        style={{
                          background:
                            "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                          color: "#000",
                        }}
                      >
                        {uploadingAvatar
                          ? "업로드 중..."
                          : activeBrand?.logoUrl
                            ? "변경"
                            : "업로드"}
                      </button>
                      {activeBrand?.logoUrl && (
                        <button
                          type="button"
                          disabled={uploadingAvatar}
                          onClick={handleRemoveAvatar}
                          className="px-4 py-1.5 rounded-xl text-xs font-medium transition-all"
                          style={{
                            color: "var(--text-secondary)",
                            background: "var(--surface-2)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          제거
                        </button>
                      )}
                    </div>
                    <p
                      className="text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      JPG, PNG, WebP · 최대 10MB
                    </p>
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatarUpload(file);
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* 브랜드 이름 + 브랜드 컬러 2열 그리드 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 브랜드 이름 */}
                  <div>
                    <label
                      className="block text-xs mb-1.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      브랜드 이름
                    </label>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={brandName}
                        onChange={(e) => setBrandName(e.target.value)}
                        placeholder="브랜드 이름을 입력해주세요"
                        className={inputCls}
                        style={inputStyle}
                      />
                      {brandNameError && (
                        <p className="text-red-400 text-xs">{brandNameError}</p>
                      )}
                      {brandName.trim() &&
                        brandName.trim() !== activeBrand?.name && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleSaveBrandName}
                              disabled={savingBrandName}
                              className="px-4 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40 transition-all active:scale-95"
                              style={{
                                background:
                                  "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                                color: "#000",
                              }}
                            >
                              {savingBrandName ? "저장 중..." : "저장"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setBrandName(activeBrand?.name ?? "");
                                setBrandNameError("");
                              }}
                              className="px-4 py-1.5 rounded-xl text-xs font-medium transition-all"
                              style={{
                                color: "var(--text-secondary)",
                                background: "var(--surface-2)",
                                border: "1px solid var(--border-default)",
                              }}
                            >
                              되돌리기
                            </button>
                          </div>
                        )}
                    </div>
                  </div>

                  {/* 브랜드 컬러 */}
                  <div>
                    <label
                      className="block text-xs mb-1.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      브랜드 컬러
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={profileColor}
                        onChange={(e) => setProfileColor(e.target.value)}
                        className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent shrink-0"
                      />
                      <span
                        className="text-sm font-mono"
                        style={{ color: "var(--text-primary)" }}
                        suppressHydrationWarning
                      >
                        {profileColor}
                      </span>
                      <button
                        type="button"
                        disabled={savingColor}
                        onClick={async () => {
                          if (!activeBrandId) return;
                          setSavingColor(true);
                          try {
                            const res = await fetchWithAuth(
                              `/api/brands/${activeBrandId}`,
                              {
                                method: "PATCH",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  primaryColor: profileColor,
                                }),
                              },
                            );
                            if (res.ok) {
                              clearBrandNameCache(activeBrandId ?? "");
                              window.location.reload();
                            }
                          } finally {
                            setSavingColor(false);
                          }
                        }}
                        className="ml-auto px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-40 transition-all active:scale-95"
                        style={{
                          background:
                            "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                          color: "#000",
                        }}
                      >
                        {savingColor ? "저장 중..." : "저장"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 무드 요약 행 */}
                <div>
                  <label
                    className="block text-xs mb-1.5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    무드 요약
                  </label>
                  <p
                    className="text-sm italic"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {brandProfile?.mood_summary ||
                      "스타일 분석 후 자동 생성됩니다"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════
              섹션 2: 브랜드 프로필
              ═══════════════════════════════════════════════════ */}
          <section
            className="border-t pt-8 mt-8"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div
              className="flex items-center gap-3 mb-6 pb-6"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "var(--accent-subtle)" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h2
                className="font-headline text-lg font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                브랜드 프로필
              </h2>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
              <div className="w-full md:w-[200px] md:shrink-0">
                <p
                  className="text-xs leading-relaxed break-keep"
                  style={{ color: "var(--text-secondary)" }}
                >
                  브랜드의 성격과 콘텐츠 방향을 정의합니다.
                </p>
              </div>
              <div className="flex-1 min-w-0 space-y-4">
                {brandProfileLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div
                        key={i}
                        className="animate-pulse h-24 rounded-xl"
                        style={{ background: "var(--surface-2)" }}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    {/* 브랜드 설명 */}
                    <div>
                      <p
                        className="text-xs mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        브랜드 설명
                      </p>
                      <textarea
                        value={profileDesc}
                        onChange={(e) => setProfileDesc(e.target.value)}
                        placeholder="예: 자연에서 영감을 받은 비건 스킨케어 브랜드로, 깨끗한 성분과 지속 가능한 패키지를 지향합니다."
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl text-base md:text-sm placeholder:text-[color:var(--text-muted)] outline-none resize-none"
                        style={{
                          color: "var(--text-primary)",
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-default)",
                        }}
                      />
                    </div>

                    {/* 키워드 */}
                    <div>
                      <p
                        className="text-xs mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        키워드
                      </p>
                      <div
                        className="flex flex-wrap gap-1.5 px-4 py-3 rounded-lg min-h-[40px]"
                        style={{
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-default)",
                        }}
                      >
                        {profileKeywords.map((tag, i) => (
                          <span
                            key={i}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                            style={{
                              background: "var(--surface-3)",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border-default)",
                            }}
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() =>
                                setProfileKeywords(
                                  profileKeywords.filter((_, idx) => idx !== i),
                                )
                              }
                              style={{ color: "var(--text-muted)" }}
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                        <input
                          value={keywordInput}
                          onChange={(e) => setKeywordInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              const v = keywordInput.trim().replace(/,$/, "");
                              if (v && !profileKeywords.includes(v))
                                setProfileKeywords([...profileKeywords, v]);
                              setKeywordInput("");
                            }
                          }}
                          placeholder="예: 자연주의, 럭셔리, 미니멀"
                          className="text-xs bg-transparent outline-none placeholder:text-[color:var(--text-muted)] min-w-24 flex-1"
                          style={{ color: "var(--text-primary)" }}
                        />
                      </div>
                      <p
                        className="text-[10px] mt-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        쉼표 또는 Enter로 구분
                      </p>
                    </div>

                    {/* 금지 규칙 */}
                    <div>
                      <p
                        className="text-xs mb-1"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        금지 규칙
                      </p>
                      <div
                        className="flex flex-wrap gap-1.5 px-4 py-3 rounded-lg min-h-[40px]"
                        style={{
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-default)",
                        }}
                      >
                        {profileRules.map((tag, i) => (
                          <span
                            key={i}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                            style={{
                              background: "var(--surface-3)",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border-default)",
                            }}
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() =>
                                setProfileRules(
                                  profileRules.filter((_, idx) => idx !== i),
                                )
                              }
                              style={{ color: "var(--text-muted)" }}
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                        <input
                          value={ruleInput}
                          onChange={(e) => setRuleInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              const v = ruleInput.trim().replace(/,$/, "");
                              if (v && !profileRules.includes(v))
                                setProfileRules([...profileRules, v]);
                              setRuleInput("");
                            }
                          }}
                          placeholder="예: 인공색소, 동물실험, 플라스틱 포장"
                          className="text-xs bg-transparent outline-none placeholder:text-[color:var(--text-muted)] min-w-24 flex-1"
                          style={{ color: "var(--text-primary)" }}
                        />
                      </div>
                      <p
                        className="text-[10px] mt-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        쉼표 또는 Enter로 구분
                      </p>
                    </div>

                    {/* 저장 버튼 */}
                    <div className="ml-auto flex items-center gap-3">
                      {brandProfileError && (
                        <p className="text-xs text-red-400">
                          {brandProfileError}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={savingProfile}
                        onClick={handleSaveBrandProfile}
                        className="flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-full text-xs font-bold disabled:opacity-40 transition-all active:scale-95"
                        style={{
                          background:
                            "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                          color: "#000",
                        }}
                      >
                        {savingProfile ? "저장 중..." : "저장"}
                        {!savingProfile && (
                          <span className="w-5 h-5 rounded-full bg-black/10 flex items-center justify-center">
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════
              섹션 3: 채널 환경설정
              ═══════════════════════════════════════════════════ */}
          <section
            className="border-t pt-8 mt-8"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div
              className="flex items-center gap-3 mb-6 pb-6"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "var(--accent-subtle)" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.09 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3 1.13h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16v.92z" />
                </svg>
              </div>
              <h2
                className="font-headline text-lg font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                채널 환경설정
              </h2>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
              <div className="w-full md:w-[200px] md:shrink-0">
                <p
                  className="text-xs leading-relaxed break-keep"
                  style={{ color: "var(--text-secondary)" }}
                >
                  자주 쓰는 채널을 선택해두면 다운로드 시 자동으로 체크됩니다.
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="space-y-5">
                  {CHANNEL_GROUPS.map(({ group, keys }) => (
                    <div key={group}>
                      <p
                        className="text-[10px] uppercase tracking-widest font-semibold mb-2"
                        style={{ color: "var(--accent)" }}
                      >
                        {group}
                      </p>
                      <div className="space-y-1.5">
                        {keys.map((key) => {
                          const ch = CHANNEL_PRESETS_MAP[key];
                          const isOn = preferredChannels.has(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() =>
                                setPreferredChannels((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                })
                              }
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                              style={{
                                background: isOn
                                  ? "var(--accent-subtle)"
                                  : "var(--surface-1)",
                                border: isOn
                                  ? "1px solid rgba(255,164,198,0.25)"
                                  : "1px solid var(--border-subtle)",
                              }}
                            >
                              <div
                                className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                                style={{
                                  background: isOn
                                    ? "linear-gradient(135deg, #ffa4c6, #ffe3be)"
                                    : "var(--surface-3)",
                                  border: isOn
                                    ? "none"
                                    : "1px solid var(--border-default)",
                                }}
                              >
                                {isOn && (
                                  <svg width="8" height="8" viewBox="0 0 10 10">
                                    <polyline
                                      points="1.5 5.5 4 8 8.5 2"
                                      fill="none"
                                      stroke="#000"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span
                                  className="text-xs font-medium"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {ch.label}
                                </span>
                                <span
                                  className="text-[10px] ml-2"
                                  style={{ color: "var(--text-secondary)" }}
                                >
                                  {ch.sub}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 ml-auto flex">
                  <button
                    type="button"
                    disabled={savingChannels}
                    onClick={handleSaveBrandChannels}
                    className="flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-full text-xs font-bold disabled:opacity-40 transition-all active:scale-95"
                    style={{
                      background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                      color: "#000",
                    }}
                  >
                    {savingChannels ? "저장 중..." : "환경설정 저장"}
                    {!savingChannels && (
                      <span className="w-5 h-5 rounded-full bg-black/10 flex items-center justify-center">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════
              섹션 4: 팀원 관리
              ═══════════════════════════════════════════════════ */}
          <section
            className="border-t pt-8 mt-8"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div
              className="flex items-center gap-3 mb-6 pb-6"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "var(--accent-subtle)" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h2
                className="font-headline text-lg font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                팀원 관리
              </h2>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
              <div className="w-full md:w-[200px] md:shrink-0">
                <p
                  className="text-xs leading-relaxed break-keep"
                  style={{ color: "var(--text-secondary)" }}
                >
                  팀원을 초대하고 접근 권한을 관리합니다.
                </p>
                {memberLimit !== null && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {members.length + pendingInvites.length} / {memberLimit}명
                  </p>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-5">
                {membersLoading ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    불러오는 중...
                  </p>
                ) : (
                  <div className="space-y-2">
                    {members.map((m) => (
                      <div
                        key={m.userId}
                        className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl"
                        style={{ background: "var(--surface-1)" }}
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-xs truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {m.email}
                          </p>
                          <p
                            className="text-[10px] mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {m.role === "owner" ? "오너" : "멤버"} ·{" "}
                            {new Date(m.joinedAt).toLocaleDateString("ko-KR")}{" "}
                            가입
                          </p>
                        </div>
                        {m.role !== "owner" && (
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await fetchWithAuth(
                                `/api/brands/${activeBrandId}/members/${m.userId}`,
                                { method: "DELETE" },
                              );
                              if (res.ok) {
                                setMembers((prev) =>
                                  prev.filter((x) => x.userId !== m.userId),
                                );
                              } else {
                                const d = (await res
                                  .json()
                                  .catch(() => ({}))) as { error?: string };
                                setInviteError(
                                  d.error ?? "멤버 제거에 실패했습니다.",
                                );
                              }
                            }}
                            className="shrink-0 text-[11px] text-red-400/60 hover:text-red-400 transition-colors"
                          >
                            제거
                          </button>
                        )}
                      </div>
                    ))}

                    {pendingInvites.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl"
                        style={{
                          background: "var(--surface-1)",
                          border: `1px dashed ${inv.expired ? "var(--border-subtle)" : "var(--border-default)"}`,
                          opacity: inv.expired ? 0.6 : 1,
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className="text-xs truncate"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {inv.email}
                          </p>
                          <p
                            className="text-[10px] mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {inv.expired
                              ? `만료됨 · ${new Date(inv.expiresAt).toLocaleDateString("ko-KR")}`
                              : `초대 대기 중 · ${new Date(inv.expiresAt).toLocaleDateString("ko-KR")} 만료`}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await fetchWithAuth(
                                `/api/brands/${activeBrandId}/invitations/${inv.id}/resend`,
                                { method: "POST" },
                              );
                              if (res.ok) {
                                const d = (await res.json()) as {
                                  expiresAt: string;
                                };
                                setPendingInvites((prev) =>
                                  prev.map((x) =>
                                    x.id === inv.id
                                      ? {
                                          ...x,
                                          expired: false,
                                          expiresAt: d.expiresAt,
                                        }
                                      : x,
                                  ),
                                );
                                setInviteSuccess(true);
                                setTimeout(() => setInviteSuccess(false), 3000);
                              } else {
                                const d = (await res
                                  .json()
                                  .catch(() => ({}))) as { error?: string };
                                setInviteError(
                                  d.error ?? "재발송에 실패했습니다.",
                                );
                              }
                            }}
                            className="text-[11px] transition-colors"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            재발송
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await fetchWithAuth(
                                `/api/brands/${activeBrandId}/invitations/${inv.id}`,
                                { method: "DELETE" },
                              );
                              if (res.ok) {
                                setPendingInvites((prev) =>
                                  prev.filter((x) => x.id !== inv.id),
                                );
                              } else {
                                const d = (await res
                                  .json()
                                  .catch(() => ({}))) as { error?: string };
                                setInviteError(
                                  d.error ?? "초대 취소에 실패했습니다.",
                                );
                              }
                            }}
                            className="text-[11px] transition-colors"
                            style={{ color: "var(--text-muted)" }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ))}

                    {members.length === 0 && pendingInvites.length === 0 && (
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        팀원이 없습니다.
                      </p>
                    )}
                  </div>
                )}

                {/* 초대 폼 */}
                <div className="space-y-2">
                  <label
                    className="block text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    이메일로 초대
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => {
                        setInviteEmail(e.target.value);
                        setInviteError("");
                        setInviteSuccess(false);
                      }}
                      placeholder="team@example.com"
                      disabled={
                        memberLimit !== null &&
                        members.length + pendingInvites.length >= memberLimit
                      }
                      className="flex-1 min-w-0 px-4 py-3 rounded-xl text-base md:text-sm placeholder:text-[color:var(--text-muted)] outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        color: "var(--text-primary)",
                        background: "var(--surface-1)",
                        border: "1px solid var(--border-default)",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleInviteMember();
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleInviteMember}
                      disabled={
                        (memberLimit !== null &&
                          members.length + pendingInvites.length >=
                            memberLimit) ||
                        sendingInvite ||
                        !inviteEmail.trim()
                      }
                      className="shrink-0 px-4 py-3 rounded-full text-xs font-bold disabled:opacity-40 transition-all active:scale-95"
                      style={{
                        background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                        color: "#000",
                      }}
                    >
                      {sendingInvite ? "전송 중..." : "초대"}
                    </button>
                  </div>
                  {memberLimit !== null &&
                    members.length + pendingInvites.length >= memberLimit && (
                      <p
                        className="text-xs mt-2"
                        style={{ color: "var(--accent)" }}
                      >
                        팀원 한도({memberLimit}명)에 도달했습니다. 업그레이드 후
                        더 초대할 수 있어요.
                      </p>
                    )}
                  {inviteError && (
                    <p className="text-[11px] text-red-400">{inviteError}</p>
                  )}
                  {inviteSuccess && (
                    <p className="text-[11px] text-emerald-400">
                      초대 이메일을 발송했습니다.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════
              섹션 5: 위험 구역
              ═══════════════════════════════════════════════════ */}
          <section
            className="border-t pt-8 mt-8"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div
              className="flex items-center gap-3 mb-6 pb-6"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "rgba(248,113,113,0.12)" }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f87171"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h2
                className="font-headline text-lg font-semibold"
                style={{ color: "#f87171" }}
              >
                위험 구역
              </h2>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
              <div className="w-full md:w-[200px] md:shrink-0">
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "rgba(248,113,113,0.6)" }}
                >
                  되돌릴 수 없는 작업입니다. 신중하게 선택하세요.
                </p>
              </div>
              <div className="flex-1 min-w-0">
                {!confirmDelete ? (
                  <div className="flex items-center justify-between gap-3">
                    <p
                      className="text-xs min-w-0 break-keep"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      브랜드와 모든 관련 데이터를 영구적으로 삭제합니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="shrink-0 px-4 py-1.5 rounded-xl text-xs font-medium"
                      style={{
                        border: "1px solid rgba(239,68,68,0.2)",
                        background: "rgba(239,68,68,0.05)",
                        color: "#f87171",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(239,68,68,0.1)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(239,68,68,0.05)")
                      }
                    >
                      브랜드 삭제
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-red-300">
                      브랜드를 삭제하면 모든 캠페인, 스타일, 제품 데이터가
                      영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                    </p>
                    <div>
                      <label className="block text-xs text-red-300/60 mb-1.5">
                        확인을 위해{" "}
                        <span className="font-bold text-red-300">
                          {activeBrand?.name}
                        </span>
                        을 입력하세요
                      </label>
                      <input
                        type="text"
                        className="w-full max-w-sm px-4 py-3 rounded-xl text-base md:text-sm placeholder:text-[color:var(--text-muted)] outline-none transition-all"
                        style={{
                          color: "var(--text-primary)",
                          background: "var(--surface-1)",
                          border: "1px solid rgba(239,68,68,0.2)",
                        }}
                        value={deleteBrandConfirmText}
                        onChange={(e) =>
                          setDeleteBrandConfirmText(e.target.value)
                        }
                        placeholder={activeBrand?.name ?? ""}
                      />
                    </div>
                    {deleteBrandError && (
                      <p className="text-xs text-red-400">{deleteBrandError}</p>
                    )}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleDeleteBrand}
                        disabled={
                          deleting ||
                          deleteBrandConfirmText !== activeBrand?.name
                        }
                        className="px-4 py-1.5 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {deleting ? "삭제 중..." : "삭제 확인"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelete(false);
                          setDeleteBrandConfirmText("");
                        }}
                        className="px-4 py-1.5 rounded-xl text-sm font-medium transition-all"
                        style={{
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-default)",
                        }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
