"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/components/AuthProvider";
import { useLocaleSettings } from "@/components/LocaleProvider";
import { PlanBadge } from "@/components/PlanBadge";
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";

const inputCls =
  "w-full px-4 py-3 rounded-xl text-base md:text-sm placeholder:text-[color:var(--text-muted)] outline-none transition-all focus:border-[rgba(255,164,198,0.4)] focus:shadow-[0_0_0_3px_rgba(255,164,198,0.08)]";
const inputStyle = {
  color: "var(--text-primary)",
  background: "var(--surface-1)",
  border: "1px solid var(--border-default)",
};

function IconChevronDown() {
  return (
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
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

type Profile = { userId: string; nickname: string };

type ProfileTabProps = {
  user: User;
  token: string;
};

export default function ProfileTab({ user, token }: ProfileTabProps) {
  const t = useTranslations();
  const { signOut } = useAuth();
  const { uiLanguage, updateLanguageSettings } = useLocaleSettings();
  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);

  const [langSaving, setLangSaving] = useState(false);

  /* ── 프로필 ───────────────────────────────────────── */
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nickname, setNickname] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  /* ── 소속 Organization ────────────────────────────── */
  const [myOrgs, setMyOrgs] = useState<
    {
      id: string;
      name: string;
      planKey?: string | null;
      brandCount?: number;
      role?: string | null;
    }[]
  >([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  /* ── Organization 이름 편집 ──────────────────────── */
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [orgSaving, setOrgSaving] = useState<Record<string, boolean>>({});
  const [orgMessages, setOrgMessages] = useState<
    Record<string, { type: "ok" | "err"; text: string }>
  >({});
  const orgMessageTimers = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  useEffect(() => {
    setThemeMounted(true);
  }, []);

  // unmount 시 잔여 메시지 타이머 정리 (메모리 누수 + setState on unmounted 경고 방지)
  useEffect(() => {
    const timers = orgMessageTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const [myBrands, setMyBrands] = useState<
    {
      id: string;
      name: string;
      logoUrl: string | null;
      primaryColor: string | null;
      role: string;
      planKey: string | null;
      currentPeriodEnd: string | null;
      organizationId?: string | null;
    }[]
  >([]);
  const [brandsLoading, setBrandsLoading] = useState(false);

  /* ── 프로필 로딩 ──────────────────────────────────── */
  useEffect(() => {
    if (!user?.id || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/users/${encodeURIComponent(user.id)}/profile`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = (await res.json()) as {
          nickname?: string;
          userId?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setNicknameError(data.error ?? "프로필을 불러올 수 없습니다.");
          return;
        }
        const nick = data.nickname ?? "";
        setProfile({ userId: data.userId ?? user.id, nickname: nick });
        setNickname(nick);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, token]);

  /* ── Organizations 로딩 ───────────────────────────── */
  useEffect(() => {
    if (!user?.id || !token) return;
    let cancelled = false;
    setOrgsLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/organizations", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          organizations?: {
            id: string;
            name: string;
            role?: string | null;
            planKey?: string | null;
            usage?: { brandCount?: number };
          }[];
        };
        if (!cancelled) {
          const list = (data.organizations ?? []).map((o) => ({
            id: o.id,
            name: o.name,
            planKey: o.planKey ?? null,
            brandCount: o.usage?.brandCount,
            role: o.role ?? null,
          }));
          setMyOrgs(list);
          setOrgNames(Object.fromEntries(list.map((o) => [o.id, o.name])));
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setOrgsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, token]);

  /* ── 브랜드 목록 로딩 ─────────────────────────────── */
  useEffect(() => {
    if (!user?.id || !token) return;
    let cancelled = false;
    setBrandsLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/brands", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          id: string;
          name: string;
          logoUrl: string | null;
          primaryColor: string | null;
          role: string;
          planKey: string | null;
          currentPeriodEnd: string | null;
          organizationId?: string | null;
        }[];
        if (!cancelled) setMyBrands(Array.isArray(data) ? data : []);
      } catch {
        /* ignore */
      }
      if (!cancelled) setBrandsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, token]);

  const orgBrandsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        logoUrl: string | null;
        primaryColor: string | null;
        role: string;
        planKey: string | null;
        currentPeriodEnd: string | null;
      }[]
    >();
    for (const b of myBrands) {
      const orgId = b.organizationId ?? "no-org";
      if (!map.has(orgId)) map.set(orgId, []);
      map.get(orgId)!.push(b);
    }
    return map;
  }, [myBrands]);

  /* ── Organization 이름 저장 ──────────────────────── */
  const handleOrgNameSave = async (orgId: string) => {
    const newName = (orgNames[orgId] ?? "").trim();
    if (!newName || newName.length > 50) return;
    setOrgSaving((prev) => ({ ...prev, [orgId]: true }));
    setOrgMessages((prev) => {
      const next = { ...prev };
      delete next[orgId];
      return next;
    });
    try {
      const res = await fetch(
        `/api/organizations/${encodeURIComponent(orgId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: newName }),
        },
      );
      const data = (await res.json()) as { name?: string; error?: string };
      if (res.ok && data.name) {
        setMyOrgs((prev) =>
          prev.map((o) => (o.id === orgId ? { ...o, name: data.name! } : o)),
        );
        setOrgNames((prev) => ({ ...prev, [orgId]: data.name! }));
        setOrgMessages((prev) => ({
          ...prev,
          [orgId]: {
            type: "ok",
            text: "저장됐습니다. 다음 페이지 로드 시 반영됩니다.",
          },
        }));
      } else {
        setOrgMessages((prev) => ({
          ...prev,
          [orgId]: { type: "err", text: data.error ?? "저장에 실패했습니다." },
        }));
      }
    } catch {
      setOrgMessages((prev) => ({
        ...prev,
        [orgId]: { type: "err", text: "저장에 실패했습니다." },
      }));
    } finally {
      setOrgSaving((prev) => ({ ...prev, [orgId]: false }));
      // 3초 후 메시지 자동 소거
      if (orgMessageTimers.current[orgId]) {
        clearTimeout(orgMessageTimers.current[orgId]);
      }
      orgMessageTimers.current[orgId] = setTimeout(() => {
        setOrgMessages((prev) => {
          const next = { ...prev };
          delete next[orgId];
          return next;
        });
      }, 3000);
    }
  };

  /* ── isDirty ──────────────────────────────────────── */
  const isDirty = profile !== null && nickname !== profile.nickname;

  const handleSave = async () => {
    if (!user?.id || !token || !nickname.trim()) return;
    setNicknameSaving(true);
    setNicknameError(null);
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(user.id)}/profile`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ nickname: nickname.trim() }),
        },
      );
      if (res.ok) {
        setProfile((prev) =>
          prev ? { ...prev, nickname: nickname.trim() } : prev,
        );
      } else {
        const data = (await res.json()) as { error?: string };
        setNicknameError(data.error ?? "저장에 실패했습니다.");
      }
    } catch {
      setNicknameError("저장에 실패했습니다.");
    } finally {
      setNicknameSaving(false);
    }
  };

  return (
    <>
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
            프로필
          </h1>
          <p
            className="text-sm mt-1 break-keep"
            style={{ color: "var(--text-secondary)" }}
          >
            계정 정보와 기본 선호도를 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || nicknameSaving}
          className="shrink-0 self-start px-4 py-2 rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
            color: "#000",
          }}
        >
          {nicknameSaving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* ── 섹션 1: 계정 정보 ─────────────────────────── */}
      <section>
        <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
          <div className="w-full md:w-[200px] md:shrink-0">
            <h3
              className="text-sm font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              계정 정보
            </h3>
            <p
              className="text-xs leading-relaxed break-keep"
              style={{ color: "var(--text-secondary)" }}
            >
              공개 프로필 정보와 연락처를 관리합니다.
            </p>
          </div>
          <div className="flex-1 min-w-0 space-y-4">
            {/* 아바타 행 */}
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-black shrink-0"
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                }}
              >
                {(user.email ?? "U")[0].toUpperCase()}
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  disabled
                  className="px-4 py-1.5 rounded-xl text-xs font-medium cursor-not-allowed opacity-60"
                  style={{
                    color: "var(--text-secondary)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  사진 변경
                </button>
                <p
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  JPG · PNG · 최대 2MB
                </p>
              </div>
            </div>

            {/* 닉네임 */}
            <div>
              <label
                className="block text-xs mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                닉네임
              </label>
              <input
                type="text"
                className={inputCls}
                style={inputStyle}
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setNicknameError(null);
                }}
                placeholder="닉네임 입력"
                maxLength={32}
              />
              {nicknameError && (
                <p className="text-red-400 text-xs mt-1">{nicknameError}</p>
              )}
            </div>

            {/* 이메일 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  이메일
                </label>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{
                    background: "rgba(52,211,153,0.1)",
                    border: "1px solid rgba(52,211,153,0.2)",
                    color: "#34d399",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  인증됨
                </span>
              </div>
              <input
                type="email"
                className={inputCls}
                style={{
                  ...inputStyle,
                  opacity: 0.6,
                  cursor: "not-allowed",
                }}
                value={user.email ?? ""}
                readOnly
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 섹션 2: Organization 이름 ─────────────────── */}
      <section
        className="border-t pt-8 mt-8"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
          <div className="w-full md:w-[200px] md:shrink-0">
            <h3
              className="text-sm font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Organization 이름
            </h3>
            <p
              className="text-xs leading-relaxed break-keep"
              style={{ color: "var(--text-secondary)" }}
            >
              워크스페이스 이름은 결제·설정 등 administrative 영역에서
              사용됩니다.
            </p>
          </div>
          <div className="flex-1 min-w-0">
            {orgsLoading ? (
              <div
                className="h-12 rounded-lg animate-pulse"
                style={{ background: "var(--surface-2)" }}
              />
            ) : myOrgs.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Organization이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {myOrgs.map((org) => {
                  const canEdit = org.role === "owner" || org.role === "admin";
                  const currentInput = orgNames[org.id] ?? org.name;
                  const trimmed = currentInput.trim();
                  const isChanged = trimmed !== org.name && trimmed.length > 0;
                  const isSaving = orgSaving[org.id] ?? false;
                  const message = orgMessages[org.id] ?? null;

                  return (
                    <div key={org.id} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        {/* 빌딩 아이콘 */}
                        <span
                          className="shrink-0"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18" />
                            <path d="M9 21V9" />
                          </svg>
                        </span>
                        {/* 이름 인풋 */}
                        <input
                          type="text"
                          className={`${inputCls} flex-1 min-w-0`}
                          style={{
                            ...inputStyle,
                            ...(!canEdit
                              ? { opacity: 0.5, cursor: "not-allowed" }
                              : {}),
                          }}
                          value={currentInput}
                          disabled={!canEdit || isSaving}
                          maxLength={50}
                          onChange={(e) => {
                            if (!canEdit) return;
                            setOrgNames((prev) => ({
                              ...prev,
                              [org.id]: e.target.value,
                            }));
                          }}
                        />
                        {/* 저장 버튼 */}
                        {canEdit ? (
                          <button
                            type="button"
                            disabled={!isChanged || isSaving}
                            onClick={() => void handleOrgNameSave(org.id)}
                            className="shrink-0 rounded-xl px-3 py-2.5 text-xs font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                              background:
                                "linear-gradient(135deg, #6ee7ff, #a78bfa)",
                              color: "#000",
                            }}
                          >
                            <span className="hidden sm:inline">{isSaving ? "저장 중..." : "저장"}</span>
                            <span className="sm:hidden">✓</span>
                          </button>
                        ) : (
                          <span
                            className="shrink-0 text-[11px] whitespace-nowrap"
                            style={{ color: "var(--text-muted)" }}
                          >
                            권한 없음
                          </span>
                        )}
                      </div>
                      {/* 인라인 메시지 */}
                      {message && (
                        <p
                          className={`text-xs pl-5 ${
                            message.type === "ok"
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {message.text}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 섹션 3: 환경 설정 ─────────────────────────── */}
      <section
        className="border-t pt-8 mt-8"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
          <div className="w-full md:w-[200px] md:shrink-0">
            <h3
              className="text-sm font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              환경 설정
            </h3>
            <p
              className="text-xs leading-relaxed break-keep"
              style={{ color: "var(--text-secondary)" }}
            >
              언어와 외관을 설정합니다.
            </p>
          </div>
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <label
                className="block text-xs mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                언어
              </label>
              <div className="relative">
                <select
                  className={`${inputCls} cursor-pointer appearance-none`}
                  style={inputStyle}
                  value={uiLanguage}
                  disabled={langSaving}
                  onChange={async (e) => {
                    const newLocale = e.target.value as Locale;
                    setLangSaving(true);
                    try {
                      await updateLanguageSettings({ uiLanguage: newLocale });
                    } finally {
                      setLangSaving(false);
                    }
                  }}
                >
                  {SUPPORTED_LOCALES.map((loc) => (
                    <option
                      key={loc}
                      value={loc}
                      className="bg-zinc-900 text-zinc-100"
                    >
                      {LOCALE_LABELS[loc]}
                    </option>
                  ))}
                </select>
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <IconChevronDown />
                </span>
              </div>
            </div>
            {/* 테마 */}
            <div>
              <label
                className="block text-xs mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                테마
              </label>
              <div
                className="inline-flex items-center gap-0.5 p-[3px] rounded-[14px]"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {(
                  [
                    {
                      value: "light",
                      label: "라이트",
                      icon: (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="4" />
                          <line x1="12" y1="2" x2="12" y2="4" />
                          <line x1="12" y1="20" x2="12" y2="22" />
                          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                          <line x1="2" y1="12" x2="4" y2="12" />
                          <line x1="20" y1="12" x2="22" y2="12" />
                          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                      ),
                    },
                    {
                      value: "dark",
                      label: "다크",
                      icon: (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
                        </svg>
                      ),
                    },
                    {
                      value: "system",
                      label: "시스템",
                      icon: (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="4" width="18" height="12" rx="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                      ),
                    },
                  ] as const
                ).map(({ value, label, icon }) => {
                  const isActive = themeMounted && theme === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTheme(value)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-[13px] font-medium transition-all duration-150 min-w-[64px] justify-center flex-shrink-0"
                      style={
                        isActive
                          ? {
                              background: "var(--surface-1)",
                              color: "var(--text-primary)",
                              border: "1px solid var(--border-default)",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                            }
                          : {
                              color: "var(--text-muted)",
                              border: "1px solid transparent",
                            }
                      }
                    >
                      {icon}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 섹션 4: 소속 Organization ───────────────────── */}
      <section
        className="border-t pt-8 mt-8"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
          <div className="w-full md:w-[200px] md:shrink-0">
            <h3
              className="text-sm font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              소속 Organization
            </h3>
            <p
              className="text-xs leading-relaxed break-keep"
              style={{ color: "var(--text-secondary)" }}
            >
              내가 속한 조직과 브랜드를 확인합니다.
            </p>
          </div>
          <div className="flex-1 min-w-0">
            {orgsLoading || brandsLoading ? (
              <div
                className="h-12 rounded-lg animate-pulse"
                style={{ background: "var(--surface-2)" }}
              />
            ) : myOrgs.length === 0 ? (
              <div className="flex items-center justify-between">
                <p
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  소속된 Organization이 없습니다.
                </p>
                <Link
                  href="/orgs/new"
                  className="text-xs transition-colors shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                >
                  + 새 Organization
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {myOrgs.map((org) => {
                  const orgBrands = orgBrandsMap.get(org.id) ?? [];

                  return (
                    <div
                      key={org.id}
                      className="rounded-xl p-4 space-y-3"
                      style={{
                        background: "var(--surface-1)",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      {/* Org 헤더 */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: "var(--surface-3)" }}
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <path d="M3 9h18" />
                              <path d="M9 21V9" />
                            </svg>
                          </div>
                          <span
                            className="text-sm font-semibold truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {org.name}
                          </span>
                          {org.planKey && <PlanBadge planKey={org.planKey} />}
                        </div>
                        <Link
                          href={`/pricing?org_id=${org.id}`}
                          className="text-[11px] transition-colors shrink-0"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          플랜 변경 →
                        </Link>
                      </div>

                      {/* Nested brands */}
                      {orgBrands.length === 0 ? (
                        <p
                          className="text-xs pl-9"
                          style={{ color: "var(--text-muted)" }}
                        >
                          브랜드가 없습니다.
                        </p>
                      ) : (
                        <div className="pl-9 space-y-1">
                          {orgBrands.map((b) => {
                            const bc = b.primaryColor ?? "#ffa4c6";
                            const isOwner = b.role === "owner";
                            return (
                              <Link
                                key={b.id}
                                href={`/${b.id}`}
                                className="flex items-center gap-2.5 py-1.5 rounded-lg px-2 transition-colors"
                                style={{
                                  ["--hover-bg" as string]: "var(--surface-2)",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background =
                                    "var(--surface-2)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "";
                                }}
                              >
                                {b.logoUrl ? (
                                  <img
                                    src={b.logoUrl}
                                    alt=""
                                    className="w-7 h-7 rounded-md object-cover shrink-0"
                                  />
                                ) : (
                                  <div
                                    className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                                    style={{ background: bc }}
                                  >
                                    {b.name[0]?.toUpperCase() ?? "?"}
                                  </div>
                                )}
                                <span
                                  className="text-sm truncate flex-1"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {b.name}
                                </span>
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0"
                                  style={{
                                    background: isOwner
                                      ? "rgba(244,114,182,0.15)"
                                      : "rgba(161,161,170,0.10)",
                                    color: isOwner ? "#f472b6" : "#a1a1aa",
                                  }}
                                >
                                  {isOwner ? "오너" : "멤버"}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 섹션 5: 계정 (로그아웃) ───────────────────── */}
      <section
        className="border-t pt-8 mt-8"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
          <div className="w-full md:w-[200px] md:shrink-0">
            <h3
              className="text-sm font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              계정
            </h3>
            <p
              className="text-xs leading-relaxed break-keep"
              style={{ color: "var(--text-secondary)" }}
            >
              로그인 세션을 관리합니다.
            </p>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {user.email}
              </p>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-medium transition-all"
                style={{
                  color: "var(--text-secondary)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-default)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                {t("account.signOut")}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
