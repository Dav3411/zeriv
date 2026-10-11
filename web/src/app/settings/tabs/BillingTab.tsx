"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { UsageMeter } from "@/components/UsageMeter";
import { CancelSubscriptionDialog } from "@/components/subscription/CancelSubscriptionDialog";
import {
  PackPurchaseModal,
  PACK_OPTIONS,
  type PackSize,
} from "@/components/packs/PackPurchaseModal";
import { clearPackBalanceCache } from "@/components/packs/PackBalance";
import {
  getPlanPrice,
  getPlanDisplayName,
  PLAN_DISPLAY_LABELS,
} from "@/lib/plans-brand";

type SubscriptionPlan = {
  id?: string;
  name: string;
  periodEndsAt: string;
  subscriptionId?: string | null;
  canCancelRenewal?: boolean;
  renewalCancelled?: boolean;
  canExportVideo?: boolean;
  noWatermark?: boolean;
};

type BrandUsage = {
  planKey: string | null;
  planLabel: string | null;
  usage: {
    monthlyGenerations: number;
    styleCount: number;
    modelCount: number;
    memberCount: number;
  };
  limits: {
    generationLimit: number | null;
    styleLimit: number | null;
    modelLimit: number | null;
    memberLimit: number | null;
    dailyLimit: number | null;
    priorityQueue: boolean;
  };
  periodEnd: string | null;
};

type OrgSubscriptionMeta = {
  planKey: string | null;
  planTier: number;
  status: string | null;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  cancelRequestedAt: string | null;
  pendingPlan: string | null;
  pendingPlanTier: number | null;
  pendingChangeAt: string | null;
  billingKey: {
    lastFour: string | null;
    brand: string | null;
    status: string | null;
  } | null;
};

type Order = {
  id: string;
  merchantUid: string;
  planKey: string;
  planLabel: string;
  amountKrw: number;
  paidAt: string;
  orderType: string;
};

type PackOrder = {
  id: string;
  created_at: string;
  paid_at: string | null;
  pack_size: number;
  amount_krw: number;
  status: "pending" | "paid" | "failed" | "refunded" | string;
  merchant_uid: string;
  refunded_at: string | null;
  refund_reason: string | null;
  expires_at: string | null;
  organization_id: string | null;
};

type BillingTabProps = {
  userId: string;
  token: string;
};

export default function BillingTab({ userId, token }: BillingTabProps) {
  const t = useTranslations();

  /* ── 구독 (PayPal SoT — getEffectiveSubscriptionState) ───────────── */
  const [subscriptionPlan, setSubscriptionPlan] =
    useState<SubscriptionPlan | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState(false);
  const [cancelPlanLoading, setCancelPlanLoading] = useState(false);
  const [cancelPlanError, setCancelPlanError] = useState<string | null>(null);

  /* ── Org/Brand ───────────────────────────────────────────────────── */
  const [firstOrgId, setFirstOrgId] = useState<string | null>(null);
  const [firstOrgName, setFirstOrgName] = useState<string | null>(null);
  const [firstBrandId, setFirstBrandId] = useState<string | undefined>(
    undefined,
  );
  const [hasBrands, setHasBrands] = useState(false);

  /* ── 사용량 ───────────────────────────────────────────────────────── */
  const [brandUsage, setBrandUsage] = useState<BrandUsage | null>(null);
  const [brandUsageLoading, setBrandUsageLoading] = useState(false);

  /* ── KRW 구독 메타 (organizations/[id] 응답 기반) ─────────────────── */
  const [orgSub, setOrgSub] = useState<OrgSubscriptionMeta | null>(null);

  /* ── 결제 내역 ────────────────────────────────────────────────────── */
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersExpanded, setOrdersExpanded] = useState(false);

  /* ── 팩 충전 내역 (KRW 일회성) ────────────────────────────────────── */
  const [packOrders, setPackOrders] = useState<PackOrder[]>([]);
  const [packOrdersLoading, setPackOrdersLoading] = useState(false);
  const [packOrdersExpanded, setPackOrdersExpanded] = useState(false);

  /* ── 다이얼로그 / KRW 액션 상태 ───────────────────────────────────── */
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revertPendingLoading, setRevertPendingLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** 어떤 액션을 했는지 토글에 따라 사용량/메타 다시 로드 */
  const [reloadTick, setReloadTick] = useState(0);

  /* ── 팩 구매 모달 ─────────────────────────────────────────────────── */
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packModalSize, setPackModalSize] = useState<PackSize>(10);
  // 추천 팩 정보 — PACK_OPTIONS 단일 소스
  const defaultPack = PACK_OPTIONS.find((p) => p.isDefault) ?? PACK_OPTIONS[0];
  const defaultBadgeFirst = defaultPack.badge?.split(" · ")[0] ?? "";

  /* ── 구독 로드 ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!userId || !token) return;
    let cancelled = false;
    setSubscriptionLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/subscription/plan", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = (await res.json()) as {
          plan?: {
            id?: string;
            name?: string;
            canExportVideo?: boolean;
            noWatermark?: boolean;
          };
          periodEndsAt?: string | null;
          subscriptionId?: string | null;
          canCancelRenewal?: boolean;
          renewalCancelled?: boolean;
        };
        if (cancelled) return;
        if (data.plan) {
          setSubscriptionPlan({
            id: data.plan.id,
            name: data.plan.name ?? "Unknown",
            periodEndsAt: data.periodEndsAt ?? "",
            subscriptionId: data.subscriptionId,
            canCancelRenewal: data.canCancelRenewal ?? false,
            renewalCancelled: data.renewalCancelled ?? false,
            canExportVideo: data.plan.canExportVideo,
            noWatermark: data.plan.noWatermark,
          });
        }
      } catch {
        if (!cancelled) setSubscriptionError(true);
      }
      if (!cancelled) setSubscriptionLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, token]);

  /* ── Organizations ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!userId || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/organizations", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          organizations?: { id: string; name: string }[];
        };
        if (cancelled) return;
        const first = data.organizations?.[0];
        if (first) {
          setFirstOrgId(first.id);
          setFirstOrgName(first.name);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, token]);

  /* ── 브랜드 ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!userId || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/brands", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { id: string }[];
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        setHasBrands(arr.length > 0);
        setFirstBrandId(arr[0]?.id ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, token]);

  /* ── 사용량 + KRW 구독 메타 (org 우선) ───────────────────────────── */
  useEffect(() => {
    if (!userId || !token) return;
    if (!firstOrgId && !firstBrandId) return;
    let cancelled = false;
    setBrandUsageLoading(true);
    (async () => {
      try {
        if (firstOrgId) {
          const res = await fetch(`/api/organizations/${firstOrgId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            if (!cancelled) setBrandUsageLoading(false);
            return;
          }
          const data = (await res.json()) as {
            plan?: {
              planKey?: string | null;
              planLabel?: string | null;
              planTier?: number | null;
              status?: string | null;
              currentPeriodEnd?: string | null;
            };
            subscription?: {
              autoRenew?: boolean;
              cancelRequestedAt?: string | null;
              pendingPlan?: string | null;
              pendingPlanTier?: number | null;
              pendingChangeAt?: string | null;
              billingKey?: {
                lastFour?: string | null;
                brand?: string | null;
                status?: string | null;
              } | null;
            };
            usage?: {
              monthlyGenerations?: number;
              styleCount?: number;
              modelCount?: number;
              memberCount?: number;
            };
            limits?: {
              generationLimit?: number | null;
              styleLimit?: number | null;
              modelLimit?: number | null;
              memberLimit?: number | null;
              dailyLimit?: number | null;
              priorityQueue?: boolean;
            };
          };
          if (!cancelled) {
            setBrandUsage({
              planKey: data.plan?.planKey ?? null,
              planLabel: data.plan?.planLabel ?? null,
              usage: {
                monthlyGenerations: data.usage?.monthlyGenerations ?? 0,
                styleCount: data.usage?.styleCount ?? 0,
                modelCount: data.usage?.modelCount ?? 0,
                memberCount: data.usage?.memberCount ?? 0,
              },
              limits: {
                generationLimit: data.limits?.generationLimit ?? null,
                styleLimit: data.limits?.styleLimit ?? null,
                modelLimit: data.limits?.modelLimit ?? null,
                memberLimit: data.limits?.memberLimit ?? null,
                dailyLimit: data.limits?.dailyLimit ?? null,
                priorityQueue: data.limits?.priorityQueue ?? false,
              },
              periodEnd: data.plan?.currentPeriodEnd ?? null,
            });
            setOrgSub({
              planKey: data.plan?.planKey ?? null,
              planTier: data.plan?.planTier ?? 1,
              status: data.plan?.status ?? null,
              currentPeriodEnd: data.plan?.currentPeriodEnd ?? null,
              autoRenew: data.subscription?.autoRenew ?? false,
              cancelRequestedAt: data.subscription?.cancelRequestedAt ?? null,
              pendingPlan: data.subscription?.pendingPlan ?? null,
              pendingPlanTier: data.subscription?.pendingPlanTier ?? null,
              pendingChangeAt: data.subscription?.pendingChangeAt ?? null,
              billingKey: data.subscription?.billingKey
                ? {
                    lastFour: data.subscription.billingKey.lastFour ?? null,
                    brand: data.subscription.billingKey.brand ?? null,
                    status: data.subscription.billingKey.status ?? null,
                  }
                : null,
            });
          }
        } else if (firstBrandId) {
          const res = await fetch(`/api/brands/${firstBrandId}/usage`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            if (!cancelled) setBrandUsageLoading(false);
            return;
          }
          const data = (await res.json()) as BrandUsage;
          if (!cancelled) setBrandUsage(data);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setBrandUsageLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, token, firstOrgId, firstBrandId, reloadTick]);

  /* ── 결제 내역 ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!userId || !token) return;
    if (firstBrandId === undefined) return;
    let cancelled = false;
    setOrdersLoading(true);
    (async () => {
      try {
        const brandParam = firstBrandId ? `?brand_id=${firstBrandId}` : "";
        const res = await fetch(`/api/portone/orders${brandParam}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { orders: Order[] };
        if (!cancelled) setOrders(data.orders ?? []);
      } catch {
        /* ignore */
      }
      if (!cancelled) setOrdersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, token, firstBrandId, reloadTick]);

  /* ── 팩 충전 내역 ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!userId || !token) return;
    let cancelled = false;
    setPackOrdersLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/packs/orders", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setPackOrdersLoading(false);
          return;
        }
        const data = (await res.json()) as { orders: PackOrder[] };
        if (!cancelled) setPackOrders(data.orders ?? []);
      } catch {
        /* ignore */
      }
      if (!cancelled) setPackOrdersLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, token, reloadTick]);

  /* ── KRW 활성 구독 여부 ──────────────────────────────────────────── */
  const hasKrwSubscription =
    !!orgSub &&
    !!orgSub.planKey &&
    orgSub.planKey !== "free" &&
    (orgSub.status === "active" || orgSub.status === "trialing") &&
    !!orgSub.currentPeriodEnd &&
    new Date(orgSub.currentPeriodEnd) > new Date();

  /* ── PayPal 분기: organization 데이터 없거나 KRW 구독 없을 때만 PayPal UI ── */
  const showLegacyPayPalCancel =
    !hasKrwSubscription && !!subscriptionPlan?.canCancelRenewal;

  /* ── 표시값 ──────────────────────────────────────────────────────── */
  const krwCurrentPlanName = useMemo(() => {
    if (!orgSub?.planKey) return "";
    return getPlanDisplayName(orgSub.planKey, orgSub.planTier);
  }, [orgSub]);

  const krwCurrentPlanPrice = useMemo(() => {
    if (!orgSub?.planKey) return 0;
    return getPlanPrice(orgSub.planKey, orgSub.planTier);
  }, [orgSub]);

  const pendingPlanDisplayName = useMemo(() => {
    if (!orgSub?.pendingPlan) return "";
    return getPlanDisplayName(orgSub.pendingPlan, orgSub.pendingPlanTier ?? 1);
  }, [orgSub]);

  /* ── KRW 액션: 해지 예약 ─────────────────────────────────────────── */
  async function handleCancelKrw() {
    if (!firstOrgId) throw new Error("Organization 정보를 찾을 수 없습니다.");
    setActionError(null);
    const res = await fetch("/api/portone/subscription/cancel", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ organizationId: firstOrgId, revoke: false }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "해지 처리에 실패했습니다.");
    }
    setCancelDialogOpen(false);
    setReloadTick((v) => v + 1);
  }

  /* ── KRW 액션: 해지 철회 ─────────────────────────────────────────── */
  async function handleRevokeCancel() {
    if (!firstOrgId) return;
    setActionError(null);
    setRevokeLoading(true);
    try {
      const res = await fetch("/api/portone/subscription/cancel", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ organizationId: firstOrgId, revoke: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "철회 처리에 실패했습니다.");
        return;
      }
      setReloadTick((v) => v + 1);
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setRevokeLoading(false);
    }
  }

  /* ── KRW 액션: 다운그레이드 예약 취소 ─────────────────────────────── */
  async function handleRevertPending() {
    if (!firstOrgId) return;
    setActionError(null);
    setRevertPendingLoading(true);
    try {
      const res = await fetch("/api/portone/subscription/change-plan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId: firstOrgId,
          revertPending: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "예약 취소에 실패했습니다.");
        return;
      }
      setReloadTick((v) => v + 1);
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setRevertPendingLoading(false);
    }
  }

  /* ── PayPal 갱신 취소 ────────────────────────────────────────────── */
  async function handleCancelPayPal() {
    if (!subscriptionPlan?.subscriptionId || !token) return;
    setCancelPlanLoading(true);
    setCancelPlanError(null);
    try {
      const res = await fetch("/api/credits/subscription/cancel", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscriptionId: subscriptionPlan.subscriptionId,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setCancelPlanError(data.error ?? "구독 갱신 취소에 실패했습니다.");
      } else {
        setSubscriptionPlan((prev) =>
          prev
            ? { ...prev, renewalCancelled: true, canCancelRenewal: false }
            : prev,
        );
      }
    } catch {
      setCancelPlanError("네트워크 오류가 발생했습니다.");
    } finally {
      setCancelPlanLoading(false);
    }
  }

  return (
    <>
      {/* 헤더 */}
      <div
        className="flex items-center justify-between pb-8 mb-8 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            결제
          </h1>
          <p
            className="text-sm mt-1 break-keep"
            style={{ color: "var(--text-secondary)" }}
          >
            구독 플랜과 사용량, 결제 내역을 관리합니다.
          </p>
        </div>
      </div>

      {/* ── 섹션 1: 구독 플랜 ─────────────────────────── */}
      <section>
        <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
          <div className="w-full md:w-[200px] md:shrink-0">
            <h3
              className="text-sm font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              {t("account.currentPlan")}
            </h3>
            <p
              className="text-xs leading-relaxed break-keep"
              style={{ color: "var(--text-secondary)" }}
            >
              현재 구독 중인 플랜과 갱신 정보를 확인합니다.
            </p>
          </div>
          <div className="flex-1 min-w-0">
            {subscriptionLoading ? (
              <div
                className="h-20 rounded-lg animate-pulse"
                style={{ background: "var(--surface-2)" }}
              />
            ) : subscriptionError ? (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                구독 정보를 불러올 수 없습니다.
              </p>
            ) : hasKrwSubscription && orgSub ? (
              /* ── KRW 활성 구독 UI ─────────────────────────── */
              <div className="space-y-4">
                {/* 플랜 뱃지 + 갱신일 */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-pink-500/15 text-pink-400">
                    {krwCurrentPlanName}
                  </span>
                  <span
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    다음 결제{" "}
                    {orgSub.currentPeriodEnd
                      ? new Date(orgSub.currentPeriodEnd).toLocaleDateString(
                          "ko-KR",
                          { dateStyle: "long" },
                        )
                      : "—"}
                  </span>
                </div>

                {/* 플랜 상세 정보 카드 */}
                <div
                  className="rounded-xl p-4 max-w-md"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        플랜
                      </span>
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {krwCurrentPlanName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        다음 결제일
                      </span>
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {orgSub.currentPeriodEnd
                          ? new Date(
                              orgSub.currentPeriodEnd,
                            ).toLocaleDateString("ko-KR", {
                              dateStyle: "long",
                            })
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span
                        className="text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        금액
                      </span>
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        ₩{krwCurrentPlanPrice.toLocaleString("ko-KR")}
                      </span>
                    </div>
                    {orgSub.billingKey?.lastFour && (
                      <div className="flex items-center justify-between gap-4">
                        <span
                          className="text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          등록 카드
                        </span>
                        <span
                          className="text-sm"
                          style={{ color: "var(--text-primary)" }}
                        >
                          •••• {orgSub.billingKey.lastFour}
                        </span>
                      </div>
                    )}
                    {/* ── 플랜 변경 진입점 ──────────────────────────── */}
                    <div
                      className="flex items-center justify-end pt-3"
                      style={{
                        borderTop: "1px solid rgba(255,255,255,0.10)",
                      }}
                    >
                      <Link
                        href="/pricing?from=settings"
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                        style={{
                          background: "var(--accent-subtle)",
                          border: "1px solid rgba(255,164,198,0.20)",
                          color: "var(--accent)",
                        }}
                      >
                        플랜 변경 →
                      </Link>
                    </div>
                  </div>
                </div>

                {/* ── 이미지만 충전 — 플랜 카드 외부 별도 섹션 ──────────── */}
                <div
                  className="rounded-xl p-4 max-w-md flex items-center justify-between gap-4"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      이미지만 충전
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {defaultPack.size}장 ₩{defaultPack.priceKrw.toLocaleString()} · {defaultBadgeFirst} · {defaultPack.expiryDays}일 유효
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPackModalSize(defaultPack.size);
                      setPackModalOpen(true);
                    }}
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      background: "rgba(255,164,198,0.15)",
                      color: "#ffa4c6",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255,164,198,0.25)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background =
                        "rgba(255,164,198,0.15)";
                    }}
                  >
                    지금 충전하기 →
                  </button>
                </div>

                {/* 액션 버튼 — 플랜 변경은 카드 안으로 이동, 여기는 구독 해지만 남김 */}
                <div className="flex gap-3 flex-wrap">
                  {!orgSub.cancelRequestedAt && (
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        color: "var(--text-muted)",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-default)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--surface-3)";
                        e.currentTarget.style.color = "rgba(239,68,68,0.7)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "var(--surface-2)";
                        e.currentTarget.style.color = "var(--text-muted)";
                      }}
                      onClick={() => {
                        setActionError(null);
                        setCancelDialogOpen(true);
                      }}
                    >
                      구독 해지
                    </button>
                  )}
                </div>

                {/* 해지 예약 배너 */}
                {orgSub.cancelRequestedAt && (
                  <div
                    className="rounded-xl p-3.5"
                    style={{
                      background: "rgba(251,191,36,0.05)",
                      border: "1px solid rgba(251,191,36,0.15)",
                    }}
                  >
                    <p className="text-xs font-semibold text-amber-300/90 mb-1">
                      해지 예약됨
                    </p>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "rgba(251,191,36,0.7)" }}
                    >
                      {orgSub.currentPeriodEnd
                        ? new Date(orgSub.currentPeriodEnd).toLocaleDateString(
                            "ko-KR",
                            {
                              dateStyle: "long",
                            },
                          )
                        : "기간 만료"}
                      에 서비스가 종료됩니다. 그 전에 해지를 철회할 수 있습니다.
                    </p>
                    <button
                      type="button"
                      className="text-xs mt-2 transition-colors hover:text-amber-200 disabled:opacity-60"
                      style={{
                        color: "rgba(251,191,36,0.9)",
                        cursor: revokeLoading ? "not-allowed" : "pointer",
                      }}
                      onClick={handleRevokeCancel}
                      disabled={revokeLoading}
                    >
                      {revokeLoading ? "처리 중..." : "해지 철회하기 →"}
                    </button>
                  </div>
                )}

                {/* 다운그레이드 예약 배너 */}
                {orgSub.pendingPlan && (
                  <div
                    className="rounded-xl p-3.5"
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    <p
                      className="text-xs font-semibold mb-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      플랜 변경 예약됨
                    </p>
                    <p
                      className="text-xs leading-relaxed break-keep"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {orgSub.pendingChangeAt
                        ? new Date(orgSub.pendingChangeAt).toLocaleDateString(
                            "ko-KR",
                            {
                              dateStyle: "long",
                            },
                          )
                        : "다음 결제일"}
                      부터 {pendingPlanDisplayName} 플랜이 적용됩니다.
                    </p>
                    <button
                      type="button"
                      className="text-xs mt-2 transition-colors disabled:opacity-60"
                      style={{
                        color: "var(--text-secondary)",
                        cursor: revertPendingLoading
                          ? "not-allowed"
                          : "pointer",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "var(--text-primary)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "var(--text-secondary)")
                      }
                      onClick={handleRevertPending}
                      disabled={revertPendingLoading}
                    >
                      {revertPendingLoading ? "처리 중..." : "변경 취소하기 →"}
                    </button>
                  </div>
                )}

                {actionError && (
                  <p className="text-xs text-red-400">{actionError}</p>
                )}
              </div>
            ) : subscriptionPlan ? (
              /* ── PayPal 또는 fallback UI (KRW 미구독 + 기존 PayPal 구독) ── */
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-pink-500/15 text-pink-400">
                    {subscriptionPlan.name}
                  </span>
                  {subscriptionPlan.renewalCancelled && (
                    <span className="text-xs text-amber-400 font-medium">
                      갱신 취소됨
                    </span>
                  )}
                </div>

                <div>
                  <p
                    className="text-xs mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    갱신일
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {subscriptionPlan.periodEndsAt
                      ? new Date(
                          subscriptionPlan.periodEndsAt,
                        ).toLocaleDateString(undefined, {
                          dateStyle: "medium",
                        })
                      : "—"}
                  </p>
                </div>

                {subscriptionPlan.canExportVideo != null && (
                  <div className="flex flex-wrap gap-2">
                    {subscriptionPlan.canExportVideo && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
                        비디오 내보내기
                      </span>
                    )}
                    {subscriptionPlan.noWatermark && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
                        워터마크 없음
                      </span>
                    )}
                    {!subscriptionPlan.canExportVideo && (
                      <Link
                        href="/pricing"
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-pink-500/10 text-pink-400 hover:bg-pink-500/20 transition-colors"
                      >
                        업그레이드하면 비디오 내보내기 가능 →
                      </Link>
                    )}
                  </div>
                )}

                {showLegacyPayPalCancel && (
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                    onClick={handleCancelPayPal}
                    disabled={cancelPlanLoading}
                  >
                    {cancelPlanLoading ? "처리 중..." : t("account.cancelPlan")}
                  </button>
                )}
                {cancelPlanError && (
                  <p className="text-red-400 text-xs">{cancelPlanError}</p>
                )}
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                활성 구독이 없습니다.{" "}
                <Link
                  href="/pricing"
                  className="text-pink-400 hover:text-pink-300 transition-colors"
                >
                  플랜 보기 →
                </Link>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── 섹션 2: 이번 달 사용량 ─────────────────────── */}
      {hasBrands && (
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
                이번 달 사용량
              </h3>
              <p
                className="text-xs leading-relaxed break-keep"
                style={{ color: "var(--text-secondary)" }}
              >
                {firstOrgName ? `${firstOrgName} · ` : ""}
                {brandUsage?.planLabel
                  ? `${brandUsage.planLabel} 플랜`
                  : "현재 사용량"}
              </p>
            </div>
            <div className="flex-1 min-w-0">
              {brandUsageLoading ? (
                <div
                  className="h-24 rounded-lg animate-pulse"
                  style={{ background: "var(--surface-2)" }}
                />
              ) : brandUsage ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(
                      [
                        {
                          label: "이미지 생성",
                          current: brandUsage.usage.monthlyGenerations,
                          limit: brandUsage.limits.generationLimit,
                        },
                        {
                          label: "스타일",
                          current: brandUsage.usage.styleCount,
                          limit: brandUsage.limits.styleLimit,
                        },
                        {
                          label: "모델",
                          current: brandUsage.usage.modelCount,
                          limit: brandUsage.limits.modelLimit,
                        },
                        {
                          label: "팀원",
                          current: brandUsage.usage.memberCount,
                          limit: brandUsage.limits.memberLimit,
                        },
                      ] as {
                        label: string;
                        current: number;
                        limit: number | null;
                      }[]
                    ).map((metric) => (
                      <UsageMeter
                        key={metric.label}
                        label={metric.label}
                        current={metric.current}
                        limit={metric.limit}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    {brandUsage.periodEnd && brandUsage.planKey !== "free" && (
                      <p
                        className="text-[10px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        다음 갱신일:{" "}
                        {new Date(brandUsage.periodEnd).toLocaleDateString(
                          "ko-KR",
                          { dateStyle: "medium" },
                        )}
                      </p>
                    )}
                    <Link
                      href="/pricing"
                      className="text-[10px] text-pink-400 hover:text-pink-300 transition-colors"
                    >
                      플랜 업그레이드 →
                    </Link>
                  </div>
                </div>
              ) : (
                <p
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  사용량 정보를 불러올 수 없습니다.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── 섹션 3: 결제 내역 ─────────────────────────── */}
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
              결제 내역
            </h3>
            <p
              className="text-xs leading-relaxed break-keep"
              style={{ color: "var(--text-secondary)" }}
            >
              지금까지의 결제 내역을 확인합니다.
            </p>
          </div>
          <div className="flex-1 min-w-0">
            {ordersLoading ? (
              <div
                className="h-20 rounded-lg animate-pulse"
                style={{ background: "var(--surface-2)" }}
              />
            ) : orders.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                결제 내역이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        <th
                          className="text-left py-2 pr-4 font-medium whitespace-nowrap"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          날짜
                        </th>
                        <th
                          className="text-left py-2 pr-4 font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          플랜
                        </th>
                        <th
                          className="text-right py-2 pr-4 font-medium whitespace-nowrap"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          금액
                        </th>
                        <th
                          className="text-left py-2 font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          종류
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ordersExpanded ? orders : orders.slice(0, 10)).map(
                        (order, idx) => {
                          const orderTypeStyle =
                            order.orderType === "upgrade_proration"
                              ? {
                                  background: "rgba(255,164,198,0.10)",
                                  color: "rgba(255,164,198,0.8)",
                                }
                              : {
                                  background: "rgba(161,161,170,0.10)",
                                  color: "var(--text-muted)",
                                };
                          const orderTypeLabel =
                            order.orderType === "subscription"
                              ? "구독"
                              : order.orderType === "billing_first"
                                ? "첫 결제"
                                : order.orderType === "billing_renewal"
                                  ? "정기결제 갱신"
                                  : order.orderType === "upgrade_proration"
                                    ? "업그레이드 차액"
                                    : order.orderType;
                          const planLabel =
                            order.planLabel ||
                            PLAN_DISPLAY_LABELS[order.planKey] ||
                            order.planKey;
                          return (
                            <tr
                              key={order.id}
                              style={
                                idx > 0
                                  ? {
                                      borderTop:
                                        "1px solid var(--border-subtle)",
                                    }
                                  : undefined
                              }
                            >
                              <td
                                className="py-2.5 pr-4 whitespace-nowrap"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {order.paidAt
                                  ? new Date(order.paidAt).toLocaleDateString(
                                      "ko-KR",
                                      {
                                        dateStyle: "medium",
                                      },
                                    )
                                  : "—"}
                              </td>
                              <td
                                className="py-2.5 pr-4"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {planLabel}
                              </td>
                              <td
                                className="py-2.5 pr-4 text-right font-medium whitespace-nowrap"
                                style={{ color: "var(--text-primary)" }}
                              >
                                ₩{order.amountKrw.toLocaleString("ko-KR")}
                              </td>
                              <td className="py-2.5">
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold"
                                  style={orderTypeStyle}
                                >
                                  {orderTypeLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
                {orders.length > 10 && (
                  <button
                    type="button"
                    className="text-xs transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "var(--text-primary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--text-secondary)")
                    }
                    onClick={() => setOrdersExpanded((v) => !v)}
                  >
                    {ordersExpanded
                      ? "접기"
                      : `${orders.length - 10}건 더 보기`}
                  </button>
                )}
                <div className="flex justify-end pt-1">
                  <Link
                    href="/pricing"
                    className="text-[10px] text-pink-400 hover:text-pink-300 transition-colors"
                  >
                    플랜 업그레이드 →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 섹션 4: 이미지만 충전 내역 ───────────────────────────── */}
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
              이미지만 충전 내역
            </h3>
            <p
              className="text-xs leading-relaxed break-keep"
              style={{ color: "var(--text-secondary)" }}
            >
              일회성 결제로 충전한 이미지 기록입니다.
            </p>
          </div>
          <div className="flex-1 min-w-0">
            {packOrdersLoading ? (
              <div
                className="h-20 rounded-lg animate-pulse"
                style={{ background: "var(--surface-2)" }}
              />
            ) : packOrders.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                충전 내역이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr
                        style={{
                          borderBottom: "1px solid var(--border-subtle)",
                        }}
                      >
                        <th
                          className="text-left py-2 pr-4 font-medium whitespace-nowrap"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          날짜
                        </th>
                        <th
                          className="text-left py-2 pr-4 font-medium whitespace-nowrap"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          이미지
                        </th>
                        <th
                          className="text-right py-2 pr-4 font-medium whitespace-nowrap"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          금액
                        </th>
                        <th
                          className="text-left py-2 font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          상태
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(packOrdersExpanded
                        ? packOrders
                        : packOrders.slice(0, 10)
                      ).map((order, idx) => {
                        const displayDate = order.paid_at ?? order.created_at;
                        const dateLabel = displayDate
                          ? new Date(displayDate).toLocaleDateString("ko-KR", {
                              dateStyle: "medium",
                            })
                          : "—";

                        let statusStyle: React.CSSProperties;
                        let statusLabel: string;
                        if (order.status === "paid") {
                          statusStyle = {
                            background: "rgba(74,222,128,0.10)",
                            color: "rgb(134 239 172)",
                          };
                          statusLabel = "결제 완료";
                        } else if (order.status === "refunded") {
                          statusStyle = {
                            background: "rgba(255,164,198,0.10)",
                            color: "rgba(255,164,198,0.85)",
                          };
                          statusLabel = "환불";
                        } else if (order.status === "pending") {
                          statusStyle = {
                            background: "rgba(161,161,170,0.10)",
                            color: "var(--text-muted)",
                          };
                          statusLabel = "처리 중";
                        } else if (order.status === "failed") {
                          statusStyle = {
                            background: "rgba(161,161,170,0.08)",
                            color: "var(--text-muted)",
                          };
                          // 사용자 결제 취소 vs 일반 실패 구분 (refund_reason 기준)
                          statusLabel = order.refund_reason?.includes("취소")
                            ? "취소됨"
                            : "실패";
                        } else {
                          statusStyle = {
                            background: "rgba(161,161,170,0.08)",
                            color: "var(--text-muted)",
                          };
                          statusLabel = order.status;
                        }

                        return (
                          <tr
                            key={order.id}
                            style={
                              idx > 0
                                ? {
                                    borderTop:
                                      "1px solid var(--border-subtle)",
                                  }
                                : undefined
                            }
                          >
                            <td
                              className="py-2.5 pr-4 whitespace-nowrap"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {dateLabel}
                            </td>
                            <td
                              className="py-2.5 pr-4 whitespace-nowrap"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {order.pack_size.toLocaleString("ko-KR")}장
                            </td>
                            <td
                              className="py-2.5 pr-4 text-right font-medium whitespace-nowrap"
                              style={{ color: "var(--text-primary)" }}
                            >
                              ₩{order.amount_krw.toLocaleString("ko-KR")}
                            </td>
                            <td className="py-2.5">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold"
                                    style={statusStyle}
                                  >
                                    {statusLabel}
                                  </span>
                                  <span
                                    className="text-[10px] font-mono select-all"
                                    style={{ color: "var(--text-muted)" }}
                                    title={`고객지원 코드: ${order.merchant_uid}`}
                                  >
                                    {order.merchant_uid}
                                  </span>
                                </div>
                                {order.status === "refunded" &&
                                  order.refund_reason && (
                                    <p
                                      className="text-[10px] leading-relaxed"
                                      style={{ color: "var(--text-muted)" }}
                                    >
                                      환불 사유: {order.refund_reason}
                                    </p>
                                  )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {packOrders.length > 10 && (
                  <button
                    type="button"
                    className="text-xs transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "var(--text-primary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--text-secondary)")
                    }
                    onClick={() => setPackOrdersExpanded((v) => !v)}
                  >
                    {packOrdersExpanded
                      ? "접기"
                      : `${packOrders.length - 10}건 더 보기`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── KRW 해지 다이얼로그 ───────────────────────────────────── */}
      {hasKrwSubscription && orgSub && (
        <CancelSubscriptionDialog
          open={cancelDialogOpen}
          onClose={() => setCancelDialogOpen(false)}
          currentPlanName={krwCurrentPlanName}
          periodEnd={orgSub.currentPeriodEnd ?? ""}
          onConfirm={handleCancelKrw}
        />
      )}

      {/* ── 팩 구매 모달 ─────────────────────────────────────────── */}
      <PackPurchaseModal
        open={packModalOpen}
        onClose={() => setPackModalOpen(false)}
        defaultSize={packModalSize}
        onSuccess={() => {
          setPackModalOpen(false);
          setReloadTick((t) => t + 1);
          clearPackBalanceCache();
        }}
      />
    </>
  );
}
