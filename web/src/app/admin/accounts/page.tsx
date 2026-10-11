"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AdminNavTabs, type AdminTabId } from "@/components/AdminNavTabs";
import { useAuth } from "@/components/AuthProvider";

function AdminAccountsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab");
  const currentTab: AdminTabId =
    tabParam === "plan"
      ? "accounts-plan"
      : tabParam === "credits"
        ? "accounts-credits"
        : "accounts-delete";

  const { user, session, loading: authLoading } = useAuth();
  const [adminSecret, setAdminSecret] = useState("");

  // 계정 삭제 state
  const [userId, setUserId] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 플랜 변경 state
  const [inputMode, setInputMode] = useState<"org" | "brand">("org");
  const [planTargetId, setPlanTargetId] = useState("");
  const [planKey, setPlanKey] = useState("starter");
  const [planTier, setPlanTier] = useState("1");
  const [planPeriodDays, setPlanPeriodDays] = useState(30);
  const [planSubmitting, setPlanSubmitting] = useState(false);
  const [planResult, setPlanResult] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  // 크레딧 조정 state
  const [creditUserId, setCreditUserId] = useState("");
  const [creditDelta, setCreditDelta] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [creditResult, setCreditResult] = useState<string | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);

  const CONFIRM_PHRASE = "DELETE";

  useEffect(() => {
    if (authLoading) return;
    if (!user && typeof window !== "undefined") {
      const next = window.location.pathname || "/admin/accounts";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [authLoading, user, router]);

  const authHeaders = () => {
    const h: Record<string, string> = { "x-admin-secret": adminSecret };
    if (session?.access_token)
      h.Authorization = `Bearer ${session.access_token}`;
    return h;
  };

  async function deleteAccount() {
    if (!session?.access_token) {
      setError("로그인이 필요합니다.");
      return;
    }
    if (confirmText.trim() !== CONFIRM_PHRASE) {
      setError(`확인하려면 "${CONFIRM_PHRASE}"를 정확히 입력하세요.`);
      return;
    }
    const uid = userId.trim();
    if (!uid) {
      setError("삭제할 유저 UUID를 입력하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/accounts/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ userId: uid }),
      });
      if (res.status === 401 || res.status === 403) {
        setError("권한이 없습니다. Admin secret 또는 로그인을 확인하세요.");
        setSubmitting(false);
        return;
      }
      const payload = (await res.json()) as {
        error?: string;
        ok?: boolean;
        userId?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? "계정 삭제 실패");
      }
      setResult(`계정이 삭제되었습니다: ${payload.userId ?? uid}`);
      setUserId("");
      setConfirmText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "계정 삭제 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function changePlan() {
    if (!session?.access_token) {
      setPlanError("로그인이 필요합니다.");
      return;
    }
    const targetId = planTargetId.trim();
    if (!targetId) {
      setPlanError(
        inputMode === "org"
          ? "Org UUID를 입력하세요."
          : "Brand UUID를 입력하세요.",
      );
      return;
    }
    setPlanSubmitting(true);
    setPlanError(null);
    setPlanResult(null);
    try {
      if (inputMode === "org") {
        const res = await fetch("/api/admin/organizations/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            organizationId: targetId,
            planKey,
            periodDays: planPeriodDays,
            planTier: planKey === "pro" ? parseInt(planTier, 10) : undefined,
          }),
        });
        if (res.status === 401 || res.status === 403) {
          setPlanError(
            "권한이 없습니다. Admin secret 또는 로그인을 확인하세요.",
          );
          setPlanSubmitting(false);
          return;
        }
        const payload = (await res.json()) as {
          error?: string;
          ok?: boolean;
          organizationId?: string;
          organizationName?: string | null;
          planLabel?: string;
          periodDays?: number | null;
        };
        if (!res.ok) {
          throw new Error(payload.error ?? "플랜 변경 실패");
        }
        const periodStr =
          payload.periodDays == null ? "무기한" : `${payload.periodDays}일`;
        const orgDisplay = payload.organizationName
          ? `"${payload.organizationName}"`
          : (payload.organizationId ?? targetId);
        setPlanResult(
          `✓ ${orgDisplay} → ${payload.planLabel ?? planKey} (${periodStr})`,
        );
      } else {
        const res = await fetch("/api/admin/brands/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify({
            brandId: targetId,
            planKey,
            periodDays: planPeriodDays,
            planTier: planKey === "pro" ? parseInt(planTier, 10) : undefined,
          }),
        });
        if (res.status === 401 || res.status === 403) {
          setPlanError(
            "권한이 없습니다. Admin secret 또는 로그인을 확인하세요.",
          );
          setPlanSubmitting(false);
          return;
        }
        const payload = (await res.json()) as {
          error?: string;
          ok?: boolean;
          brandId?: string;
          organizationId?: string;
          planLabel?: string;
          periodDays?: number | null;
        };
        if (!res.ok) {
          throw new Error(payload.error ?? "플랜 변경 실패");
        }
        const periodStr =
          payload.periodDays == null ? "무기한" : `${payload.periodDays}일`;
        setPlanResult(
          `✓ Brand ${payload.brandId ?? targetId} → Org ${payload.organizationId ?? "-"} → ${payload.planLabel ?? planKey} (${periodStr})`,
        );
      }
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "플랜 변경 실패");
    } finally {
      setPlanSubmitting(false);
    }
  }

  async function adjustCredits() {
    if (!session?.access_token) {
      setCreditError("로그인이 필요합니다.");
      return;
    }
    const uid = creditUserId.trim();
    const reason = creditReason.trim();
    const delta = Number(creditDelta);
    if (!uid) {
      setCreditError("User UUID를 입력하세요.");
      return;
    }
    if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
      setCreditError("delta는 0이 아닌 정수여야 합니다.");
      return;
    }
    if (!reason) {
      setCreditError("사유(reason)를 입력하세요.");
      return;
    }
    setCreditSubmitting(true);
    setCreditError(null);
    setCreditResult(null);
    try {
      const res = await fetch("/api/admin/users/credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ userId: uid, delta, reason }),
      });
      if (res.status === 401 || res.status === 403) {
        setCreditError(
          "권한이 없습니다. Admin secret 또는 로그인을 확인하세요.",
        );
        setCreditSubmitting(false);
        return;
      }
      const payload = (await res.json()) as {
        ok?: boolean;
        userId?: string;
        delta?: number;
        newBalance?: number | null;
        reason?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? "크레딧 조정 실패");
      }
      const sign = (payload.delta ?? 0) > 0 ? "+" : "";
      const balanceStr =
        payload.newBalance != null
          ? ` (잔액: ${payload.newBalance.toLocaleString("ko-KR")})`
          : "";
      setCreditResult(
        `✓ ${payload.userId ?? uid}에 ${sign}${payload.delta ?? delta}크레딧 적용${balanceStr}`,
      );
      setCreditDelta("");
      setCreditReason("");
    } catch (e) {
      setCreditError(e instanceof Error ? e.message : "크레딧 조정 실패");
    } finally {
      setCreditSubmitting(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <AdminNavTabs current={currentTab} />

      <div className="space-y-4 rounded-3xl border-2 border-zinc-700 bg-zinc-900 p-6 text-zinc-100 shadow-md">
        <div>
          <label className="block text-sm font-medium text-zinc-300">
            Admin secret
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="ADMIN_CREDITS_SECRET"
          />
        </div>

        {currentTab === "accounts-delete" && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                삭제할 유저 UUID
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 font-mono text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="예: 9d61ca58-dcd0-4d7f-968c-63c22c04d6c5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                확인:{" "}
                <span className="font-mono text-amber-400">
                  {CONFIRM_PHRASE}
                </span>{" "}
                입력
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-400"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
              />
            </div>
            <button
              type="button"
              className="w-full rounded-xl bg-red-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              disabled={
                submitting ||
                confirmText.trim() !== CONFIRM_PHRASE ||
                !userId.trim()
              }
              onClick={deleteAccount}
            >
              {submitting ? "삭제 중…" : "계정 삭제"}
            </button>
            {result ? (
              <div className="text-sm text-emerald-400 font-medium">
                {result}
              </div>
            ) : null}
            {error ? <div className="text-sm text-red-400">{error}</div> : null}
          </>
        )}

        {currentTab === "accounts-plan" && (
          <>
            {/* 입력 방식 토글 */}
            <div className="flex gap-2">
              <button
                type="button"
                className={
                  "rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
                  (inputMode === "org"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-zinc-200")
                }
                onClick={() => {
                  setInputMode("org");
                  setPlanTargetId("");
                  setPlanResult(null);
                  setPlanError(null);
                }}
              >
                Org UUID
              </button>
              <button
                type="button"
                className={
                  "rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
                  (inputMode === "brand"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-zinc-200")
                }
                onClick={() => {
                  setInputMode("brand");
                  setPlanTargetId("");
                  setPlanResult(null);
                  setPlanError(null);
                }}
              >
                Brand UUID
              </button>
            </div>

            {/* ID 입력 */}
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                {inputMode === "org" ? "Org UUID" : "Brand UUID"}
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 font-mono text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                value={planTargetId}
                onChange={(e) => setPlanTargetId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </div>

            {/* 플랜 선택 */}
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                플랜
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                value={planKey}
                onChange={(e) => {
                  setPlanKey(e.target.value);
                  setPlanTier("1");
                }}
              >
                {/* 활성 플랜 (시장 진입 단계 — public pricing 노출) */}
                <optgroup label="활성 플랜">
                  <option value="free">Free</option>
                  <option value="quick_plus">Quick Plus</option>
                  <option value="starter">Atelier</option>
                </optgroup>
                {/* Legacy 플랜 (UI hidden — 기존 사용자 grandfathering 용) */}
                <optgroup label="Legacy (UI hidden)">
                  <option value="label">Label</option>
                  <option value="pro">Pro</option>
                  <option value="studio">House</option>
                </optgroup>
              </select>
            </div>

            {/* Pro 전용 티어 선택 */}
            {planKey === "pro" && (
              <div>
                <label className="block text-sm font-medium text-zinc-300">
                  Pro 티어
                </label>
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  value={planTier}
                  onChange={(e) => setPlanTier(e.target.value)}
                >
                  <option value="1">Tier 1 — 500장/월 · 249,000원</option>
                  <option value="2">Tier 2 — 700장/월 · 339,000원</option>
                  <option value="3">Tier 3 — 900장/월 · 429,000원</option>
                  <option value="4">Tier 4 — 1,100장/월 · 519,000원</option>
                </select>
              </div>
            )}

            {/* 구독 종료일 (free/studio 제외) */}
            {planKey !== "free" && planKey !== "studio" && (
              <div>
                <label className="block text-sm font-medium text-zinc-300">
                  구독 종료일 (오늘 기준 일수, 1~365)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  value={planPeriodDays}
                  onChange={(e) => setPlanPeriodDays(Number(e.target.value))}
                  placeholder="30"
                />
              </div>
            )}

            <button
              type="button"
              className="w-full rounded-xl bg-zinc-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-zinc-500 disabled:opacity-50"
              disabled={planSubmitting || !planTargetId.trim()}
              onClick={changePlan}
            >
              {planSubmitting ? "변경 중…" : "플랜 변경"}
            </button>
            {planResult ? (
              <div className="text-sm text-emerald-400 font-medium">
                {planResult}
              </div>
            ) : null}
            {planError ? (
              <div className="text-sm text-red-400">{planError}</div>
            ) : null}
          </>
        )}

        {currentTab === "accounts-credits" && (
          <>
            <div>
              <label className="block text-sm font-medium text-zinc-300">
                User UUID
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 font-mono text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                value={creditUserId}
                onChange={(e) => setCreditUserId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Search 페이지에서 Org 카드를 통해 owner UUID를 확인할 수
                있습니다.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">
                Delta (양수=지급 / 음수=차감, 0 불가)
              </label>
              <input
                type="number"
                step={1}
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                value={creditDelta}
                onChange={(e) => setCreditDelta(e.target.value)}
                placeholder="예: 100 또는 -50"
              />
              <p className="mt-1 text-xs text-zinc-500">
                음수 적용 시 잔액이 음수가 될 수도 있으니 주의.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">
                사유 (감사 로그에 기록됨)
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                placeholder="예: 환불 보상, 프로모션 지급 등"
              />
            </div>

            <button
              type="button"
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              disabled={
                creditSubmitting ||
                !creditUserId.trim() ||
                !creditDelta.trim() ||
                !creditReason.trim()
              }
              onClick={adjustCredits}
            >
              {creditSubmitting ? "조정 중…" : "크레딧 조정"}
            </button>
            {creditResult ? (
              <div className="text-sm text-emerald-400 font-medium">
                {creditResult}
              </div>
            ) : null}
            {creditError ? (
              <div className="text-sm text-red-400">{creditError}</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminAccountsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="text-zinc-500">Loading...</div>
        </div>
      }
    >
      <AdminAccountsPageContent />
    </Suspense>
  );
}
