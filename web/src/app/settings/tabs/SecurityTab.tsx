"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

const inputCls =
  "w-full px-4 py-3 rounded-xl text-base md:text-sm placeholder:text-[color:var(--text-muted)] outline-none transition-all focus:border-[rgba(255,164,198,0.4)] focus:shadow-[0_0_0_3px_rgba(255,164,198,0.08)]";
const inputStyle = {
  color: "var(--text-primary)",
  background: "var(--surface-1)",
  border: "1px solid var(--border-default)",
};

type SecurityTabProps = {
  user: User;
};

export default function SecurityTab({ user }: SecurityTabProps) {
  const t = useTranslations();

  /* ── 비밀번호 변경 ────────────────────────────────── */
  const [passwordStep, setPasswordStep] = useState<
    "idle" | "otp_sent" | "verified"
  >("idle");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  /* ── 계정 삭제 ────────────────────────────────────── */
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

  const isEmailAccount =
    !user.app_metadata?.provider || user.app_metadata.provider === "email";

  const handleSendOtp = async () => {
    setPasswordChanging(true);
    setPasswordError(null);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) {
        setPasswordError(error.message);
      } else {
        setPasswordStep("otp_sent");
      }
    } catch {
      setPasswordError("인증 코드 발송에 실패했습니다.");
    } finally {
      setPasswordChanging(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!user?.email || !otp.trim()) return;
    setPasswordChanging(true);
    setPasswordError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: user.email,
        token: otp.trim(),
        type: "reauthentication",
      });
      if (error) {
        setPasswordError(error.message);
      } else {
        setPasswordStep("verified");
        setOtp("");
      }
    } catch {
      setPasswordError("인증에 실패했습니다. 코드를 다시 확인해주세요.");
    } finally {
      setPasswordChanging(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordStep !== "verified") return;
    if (newPassword !== newPasswordConfirm) {
      setPasswordError(t("account.passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(t("account.passwordTooShort"));
      return;
    }
    setPasswordChanging(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        setPasswordError(error.message);
      } else {
        setPasswordSuccess(t("account.passwordChanged"));
        setNewPassword("");
        setNewPasswordConfirm("");
        setPasswordStep("idle");
      }
    } catch {
      setPasswordError("Failed to change password");
    } finally {
      setPasswordChanging(false);
    }
  };

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
            보안
          </h1>
          <p
            className="text-sm mt-1 break-keep"
            style={{ color: "var(--text-secondary)" }}
          >
            계정 보안과 민감한 작업을 관리합니다.
          </p>
        </div>
      </div>

      {/* ── 섹션 1: 비밀번호 변경 ─────────────────────── */}
      {isEmailAccount && (
        <section>
          <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
            <div className="w-full md:w-[200px] md:shrink-0">
              <h3
                className="text-sm font-semibold mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                {t("account.changePassword")}
              </h3>
              <p
                className="text-xs leading-relaxed break-keep"
                style={{ color: "var(--text-secondary)" }}
              >
                보안을 위해 이메일 인증 후 변경할 수 있습니다.
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <div className="space-y-3 max-w-sm">
                {passwordStep === "idle" && (
                  <>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      보안을 위해 등록된 이메일({user.email})로 인증 코드를
                      발송합니다.
                    </p>
                    <button
                      type="button"
                      className="px-4 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40 transition-all active:scale-95"
                      style={{
                        background: "linear-gradient(135deg,#ffa4c6,#ffe3be)",
                        color: "#000",
                      }}
                      onClick={handleSendOtp}
                      disabled={passwordChanging}
                    >
                      {passwordChanging ? "발송 중..." : "인증 코드 받기"}
                    </button>
                  </>
                )}

                {passwordStep === "otp_sent" && (
                  <>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <span style={{ color: "var(--text-primary)" }}>
                        {user.email}
                      </span>
                      로 발송된 6자리 코드를 입력하세요.
                    </p>
                    <div>
                      <label
                        className="block text-xs mb-1.5"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        인증 코드
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={inputCls}
                        style={inputStyle}
                        value={otp}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="000000"
                        disabled={passwordChanging}
                        autoComplete="one-time-code"
                        maxLength={6}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-4 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40 transition-all active:scale-95"
                        style={{
                          background: "linear-gradient(135deg,#ffa4c6,#ffe3be)",
                          color: "#000",
                        }}
                        onClick={handleVerifyOtp}
                        disabled={passwordChanging || otp.length < 6}
                      >
                        {passwordChanging ? "확인 중..." : "인증하기"}
                      </button>
                      <button
                        type="button"
                        className="px-4 py-1.5 rounded-xl text-xs font-medium transition-all"
                        style={{
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-default)",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "var(--text-primary)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color =
                            "var(--text-secondary)")
                        }
                        onClick={() => {
                          setPasswordStep("idle");
                          setOtp("");
                          setPasswordError(null);
                          setPasswordSuccess(null);
                        }}
                        disabled={passwordChanging}
                      >
                        취소
                      </button>
                    </div>
                  </>
                )}

                {passwordStep === "verified" && (
                  <>
                    <p className="text-xs text-emerald-400">
                      인증 완료. 새 비밀번호를 설정해주세요.
                    </p>
                    <div>
                      <label
                        className="block text-xs mb-1.5"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t("account.newPassword")}
                      </label>
                      <input
                        type="password"
                        className={inputCls}
                        style={inputStyle}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t("account.newPasswordPlaceholder")}
                        disabled={passwordChanging}
                        autoComplete="new-password"
                        minLength={8}
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs mb-1.5"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {t("account.confirmNewPassword")}
                      </label>
                      <input
                        type="password"
                        className={inputCls}
                        style={inputStyle}
                        value={newPasswordConfirm}
                        onChange={(e) => setNewPasswordConfirm(e.target.value)}
                        placeholder={t("account.reenterPassword")}
                        disabled={passwordChanging}
                        autoComplete="new-password"
                        minLength={8}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-4 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40 transition-all active:scale-95"
                        style={{
                          background: "linear-gradient(135deg,#ffa4c6,#ffe3be)",
                          color: "#000",
                        }}
                        onClick={handleChangePassword}
                        disabled={
                          passwordChanging ||
                          !newPassword.trim() ||
                          !newPasswordConfirm.trim() ||
                          newPassword !== newPasswordConfirm ||
                          newPassword.length < 8
                        }
                      >
                        {passwordChanging
                          ? t("account.updating")
                          : t("account.changePasswordBtn")}
                      </button>
                      <button
                        type="button"
                        className="px-4 py-1.5 rounded-xl text-xs font-medium transition-all"
                        style={{
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-default)",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.color = "var(--text-primary)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.color =
                            "var(--text-secondary)")
                        }
                        onClick={() => {
                          setPasswordStep("idle");
                          setNewPassword("");
                          setNewPasswordConfirm("");
                          setPasswordError(null);
                        }}
                        disabled={passwordChanging}
                      >
                        취소
                      </button>
                    </div>
                  </>
                )}

                {passwordSuccess && (
                  <p className="text-emerald-400 text-xs mt-1">
                    {passwordSuccess}
                  </p>
                )}
                {passwordError && (
                  <p className="text-red-400 text-xs mt-1">{passwordError}</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 섹션 2: 위험 구역 (계정 삭제) ─────────────── */}
      <section
        className="border-t pt-8 mt-8"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:gap-8 lg:gap-12">
          <div className="w-full md:w-[200px] md:shrink-0">
            <h3
              className="text-sm font-semibold mb-1.5"
              style={{ color: "#f87171" }}
            >
              위험 구역
            </h3>
            <p
              className="text-xs leading-relaxed"
              style={{ color: "rgba(248,113,113,0.6)" }}
            >
              되돌릴 수 없는 작업입니다. 신중하게 선택하세요.
            </p>
          </div>
          <div className="flex-1 min-w-0 space-y-4">
            {!confirmDeleteAccount ? (
              <div className="flex items-center justify-between">
                <p
                  className="text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  계정과 모든 관련 데이터를 영구적으로 삭제합니다.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAccount(true)}
                  className="shrink-0 px-4 py-1.5 rounded-xl text-xs font-medium"
                  style={{
                    border: "1px solid rgba(239,68,68,0.2)",
                    background: "rgba(239,68,68,0.05)",
                    color: "#f87171",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(239,68,68,0.1)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "rgba(239,68,68,0.05)")
                  }
                >
                  계정 삭제
                </button>
              </div>
            ) : (
              <div
                className="rounded-xl p-5 space-y-4"
                style={{
                  border: "1px solid rgba(239,68,68,0.2)",
                  background: "rgba(239,68,68,0.05)",
                }}
              >
                <p className="text-sm text-red-300">
                  계정을 삭제하면 모든 데이터가 영구적으로 삭제됩니다. 이 작업은
                  되돌릴 수 없습니다.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-red-300/60 mb-1.5">
                      계정 비밀번호
                    </label>
                    <input
                      type="password"
                      className={inputCls}
                      style={{
                        ...inputStyle,
                        borderColor: "rgba(239,68,68,0.2)",
                      }}
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="비밀번호 입력"
                      autoComplete="current-password"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-red-300/60 mb-1.5">
                      확인을 위해{" "}
                      <span className="font-bold text-red-300">삭제</span>를
                      입력하세요
                    </label>
                    <input
                      type="text"
                      className={inputCls}
                      style={{
                        ...inputStyle,
                        borderColor: "rgba(239,68,68,0.2)",
                      }}
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="삭제"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={
                      deleteConfirmText !== "삭제" || !deletePassword.trim()
                    }
                    onClick={() => {
                      alert("계정 삭제 기능은 준비 중입니다.");
                    }}
                  >
                    삭제 확인
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteAccount(false);
                      setDeleteConfirmText("");
                      setDeletePassword("");
                    }}
                    className="px-4 py-1.5 rounded-xl text-xs font-medium transition-all"
                    style={{
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-default)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "var(--text-primary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "var(--text-secondary)")
                    }
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
  );
}
