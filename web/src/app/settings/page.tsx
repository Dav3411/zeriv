"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { SiteHeader } from "@/components/SiteHeader";
import ProfileTab from "@/app/settings/tabs/ProfileTab";
import BrandTab from "@/app/settings/tabs/BrandTab";
import BillingTab from "@/app/settings/tabs/BillingTab";
import SecurityTab from "@/app/settings/tabs/SecurityTab";

/* ── 인라인 아이콘 SVG ─────────────────────────────────────── */
function IconUser() {
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IconBriefcase() {
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
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}
function IconCreditCard() {
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
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function IconShield() {
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

/* ── 탭 항목 ─────────────────────────────── */
const TAB_ITEMS = [
  { label: "프로필", Icon: IconUser, slug: null as string | null },
  { label: "브랜드", Icon: IconBriefcase, slug: "brand" },
  { label: "결제", Icon: IconCreditCard, slug: "billing" },
  { label: "보안", Icon: IconShield, slug: "security" },
] as const;

type TabLabel = (typeof TAB_ITEMS)[number]["label"];

const SLUG_TO_LABEL: Record<string, TabLabel> = {
  brand: "브랜드",
  billing: "결제",
  security: "보안",
};

export default function SettingsPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuth();
  const token = session?.access_token ?? "";

  // URL 파라미터로 초기 탭 결정 (lazy initializer)
  // - useEffect 내 setState 회피 (cascading render 방지)
  // - "use client" 컴포넌트의 초기 클라이언트 렌더 시 한 번만 평가됨
  const [activeTab, setActiveTab] = useState<TabLabel>(() => {
    if (typeof window === "undefined") return "프로필";
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("tab");
    if (slug && SLUG_TO_LABEL[slug]) return SLUG_TO_LABEL[slug];
    return "프로필";
  });

  // 미인증 리다이렉트
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  if (authLoading || !user) return null;

  return (
    <div
      className="h-dvh overflow-auto"
      style={{ background: "var(--surface-0)" }}
    >
      <SiteHeader />
      <main
        className="pt-11 lg:pt-14 lg:pl-[var(--sidebar-active-w,var(--sidebar-w-collapsed))]"
        style={{
          transition: "padding-left 0.2s ease",
        }}
      >
        <div className="w-full flex flex-col">
          {/* ── 상단 탭 ─────────────────────────────────── */}
          <div
            className="flex items-center w-full"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            {TAB_ITEMS.map(({ label, Icon, slug }) => {
              const isActive = label === activeTab;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setActiveTab(label);
                    if (slug) {
                      router.push(`/settings?tab=${slug}`, { scroll: false });
                    } else {
                      router.push("/settings", { scroll: false });
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-3 text-sm font-medium whitespace-nowrap transition-colors"
                  style={{
                    color: isActive
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    borderBottom: isActive
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    marginBottom: "-1px",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <span
                    style={{ color: isActive ? "var(--accent)" : undefined }}
                  >
                    <Icon />
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>

          {/* ── 메인 콘텐츠 ──────────────────────────────── */}
          <div className="flex-1 min-w-0 px-4 sm:px-8 pt-10 pb-[calc(2.5rem+56px+env(safe-area-inset-bottom))] lg:pb-10">
            {activeTab === "프로필" && <ProfileTab user={user} token={token} />}
            {activeTab === "브랜드" && <BrandTab />}
            {activeTab === "결제" && (
              <BillingTab userId={user.id} token={token} />
            )}
            {activeTab === "보안" && <SecurityTab user={user} />}
          </div>
        </div>
      </main>
    </div>
  );
}
