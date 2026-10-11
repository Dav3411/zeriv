"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";

type InviteInfo = {
  brandId: string;
  brandName: string;
  inviteeEmail: string;
};

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [tokenError, setTokenError] = useState("");
  const [tokenLoading, setTokenLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");

  // 토큰 유효성 확인 (비인증 fetch)
  useEffect(() => {
    if (!token) return;
    setTokenLoading(true);
    fetch(`/api/invite/${token}`)
      .then(async (r) => {
        const d = (await r.json()) as {
          ok?: boolean;
          brandId?: string;
          brandName?: string;
          inviteeEmail?: string;
          error?: string;
        };
        if (!r.ok || !d.ok) {
          if (r.status === 410)
            setTokenError("초대 링크가 만료되었거나 이미 사용되었습니다.");
          else if (r.status === 404)
            setTokenError("유효하지 않은 초대 링크입니다.");
          else setTokenError(d.error ?? "초대 링크를 확인할 수 없습니다.");
          return;
        }
        setInviteInfo({
          brandId: d.brandId!,
          brandName: d.brandName!,
          inviteeEmail: d.inviteeEmail!,
        });
      })
      .catch(() => setTokenError("네트워크 오류가 발생했습니다."))
      .finally(() => setTokenLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!inviteInfo) return;
    setAccepting(true);
    setAcceptError("");
    try {
      const res = await fetchWithAuth(`/api/invite/${token}`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        brandId?: string;
      };
      if (!res.ok) {
        setAcceptError(data.error ?? "초대 수락에 실패했습니다.");
        return;
      }
      // 성공 → 해당 브랜드 워크스페이스로 이동 (brandId 직접 사용)
      router.push(`/${data.brandId ?? inviteInfo.brandId}`);
    } catch {
      setAcceptError("네트워크 오류가 발생했습니다.");
    } finally {
      setAccepting(false);
    }
  };

  // 로딩 중
  if (tokenLoading || authLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--surface-1)" }}
      >
        <p className="text-sm text-zinc-500">확인 중...</p>
      </div>
    );
  }

  // 토큰 오류
  if (tokenError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--surface-1)" }}
      >
        <div className="text-center space-y-4 max-w-sm px-6">
          <p className="text-white font-semibold">{tokenError}</p>
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            홈으로 →
          </Link>
        </div>
      </div>
    );
  }

  if (!inviteInfo) return null;

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--surface-1)" }}
    >
      <div className="w-full max-w-sm px-6 space-y-6">
        {/* 카드 */}
        <div className="card rounded-2xl p-8 text-center space-y-4">
          {/* 로고/아이콘 */}
          <div
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
            style={{
              background: "rgba(255,164,198,0.10)",
              border: "1px solid rgba(255,164,198,0.20)",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffa4c6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-1">팀 초대</p>
            <h1 className="text-lg font-bold text-white">
              {inviteInfo.brandName}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {inviteInfo.inviteeEmail}
            </p>
          </div>

          {!user ? (
            /* 비로그인: 로그인 유도 */
            <div className="space-y-3 pt-2">
              <p className="text-xs text-zinc-500">
                초대를 수락하려면 먼저 로그인해주세요.
              </p>
              <Link
                href={`/login?redirect=/invite/${token}`}
                className="block w-full py-3 rounded-xl text-sm font-bold text-black text-center transition-opacity hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                }}
              >
                로그인하기
              </Link>
              <Link
                href={`/signup?redirect=/invite/${token}`}
                className="block w-full py-3 rounded-xl text-sm font-medium text-zinc-400 text-center border transition-colors hover:border-zinc-600"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                회원가입
              </Link>
            </div>
          ) : (
            /* 로그인 상태: 수락 버튼 */
            <div className="space-y-3 pt-2">
              <p className="text-xs text-zinc-500">
                {user.email} 계정으로 수락합니다.
              </p>
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="w-full py-3 rounded-xl text-sm font-bold text-black disabled:opacity-40 transition-opacity hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                }}
              >
                {accepting ? "수락 중..." : "초대 수락"}
              </button>
              {acceptError && (
                <p className="text-[11px] text-red-400">{acceptError}</p>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-zinc-600">
          이 초대는 7일 후 만료됩니다.
        </p>
      </div>
    </div>
  );
}
