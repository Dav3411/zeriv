"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/Logo";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/AuthProvider";
import { trackEvent } from "@/lib/analytics";
import { features } from "@/lib/featuresClient";
import { PrivacyContent } from "@/components/PrivacyContent";
import { TermsContent } from "@/components/TermsContent";
import { safeNext } from "@/lib/safeNext";
import { useLocaleSettings } from "@/components/LocaleProvider";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function mapAuthError(
  message: string,
  t: ReturnType<typeof useTranslations>,
): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credentials")
  )
    return t("invalidCredentials");
  if (lower.includes("email not confirmed")) return t("emailNotConfirmed");
  if (
    lower.includes("user already registered") ||
    lower.includes("already registered")
  )
    return t("userAlreadyRegistered");
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("over_email_send_rate_limit")
  )
    return t("rateLimitExceeded");
  if (
    lower.includes("token has expired") ||
    lower.includes("token is invalid") ||
    lower.includes("otp expired") ||
    lower.includes("otp has expired") ||
    lower.includes("is invalid or has expired")
  )
    return t("codeExpired");
  return t("loginError");
}

// 제품 중심 이미지만 사용 — signup 페이지와 톤 통일.
const SLIDESHOW_IMAGES = [
  "/explore/product_01.png",
  "/explore/product_02.png",
  "/explore/product_03.png",
  "/explore/product_04.png",
];

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, loading } = useAuth();
  const t = useTranslations("login");
  const tc = useTranslations("common");

  const prevSessionRef = useRef<typeof session>(null);

  const [imgIdx, setImgIdx] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [policyModal, setPolicyModal] = useState<"terms" | "privacy" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const _next = safeNext(searchParams?.get("next") ?? "");
  const signupHref = _next ? `/signup?next=${encodeURIComponent(_next)}` : "/signup";

  useEffect(() => {
    const id = setInterval(() => {
      setImgIdx((i) => (i + 1) % SLIDESHOW_IMAGES.length);
    }, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void trackEvent("page_view", { page: "login" });
  }, []);

  useEffect(() => {
    if (!loading && session) {
      // 새로 로그인된 경우에만 sign_in 이벤트 발화
      if (!prevSessionRef.current) {
        void trackEvent("sign_in");
      }
      prevSessionRef.current = session;

      const adminErr = searchParams?.get("admin_error");
      const validAdminErrs = new Set(["no_allowlist", "not_allowed"]);
      const safeAdminErr =
        adminErr && validAdminErrs.has(adminErr) ? adminErr : null;

      if (safeAdminErr) {
        router.replace(`/?admin_error=${safeAdminErr}`);
        return;
      }

      const next = safeNext(searchParams?.get("next"));

      // AuthRedirect 가 워크스페이스/온보딩으로 이동시키도록 flag 설정
      if (typeof window !== "undefined") {
        sessionStorage.setItem("zeriv-just-logged-in", "1");
      }
      router.replace(next || "/");
    }
  }, [loading, session, router, searchParams]);

  useEffect(() => {
    if (!features.referrals) return;
    const ref = searchParams?.get("ref") ?? "";
    if (ref && isUuid(ref) && typeof window !== "undefined") {
      try {
        window.localStorage.setItem("zeriv_referrer", ref);
      } catch {
        // ignore
      }
    }
  }, [searchParams]);

  async function onGoogleLogin() {
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (err) throw err;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(mapAuthError(message, t));
      setBusy(false);
    }
    // 성공 시 브라우저가 Google로 리디렉트되므로 setBusy(false) 불필요
  }

  async function onKakaoLogin() {
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (err) throw err;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(mapAuthError(message, t));
      setBusy(false);
    }
    // 성공 시 브라우저가 Kakao로 리디렉트되므로 setBusy(false) 불필요
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) throw err;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(mapAuthError(message, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: "var(--surface-0)",
      }}
    >
      {/* 좌측 폼 패널 */}
      <div className="w-full lg:w-[52%] flex flex-col items-center justify-center min-h-screen px-8 sm:px-12 lg:px-16 py-12">
        <div className="w-full max-w-[400px]">
          <div className="flex justify-center mb-10">
            <Link href="/">
              <Logo width={120} height={26} />
            </Link>
          </div>

          <h1
            className="text-3xl font-bold text-center mb-8"
            style={{
              fontFamily: "var(--font-ibm-plex-sans-kr)",
              color: "var(--text-primary)",
            }}
          >
            {t("title")}
          </h1>

          <div>
            {/* Google 소셜 버튼 */}
            <div className="mt-6">
              <button
                type="button"
                onClick={() => void onGoogleLogin()}
                disabled={busy}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  // Google 공식 가이드라인 톤: 흰 배경 + 진한 보더 + 검정 텍스트.
                  background: "#ffffff",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t("continueWithGoogle")}
              </button>

              <button
                type="button"
                onClick={() => void onKakaoLogin()}
                disabled={busy}
                className="hidden mt-3 w-full items-center justify-center gap-3 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="#FEE500"
                  aria-hidden="true"
                >
                  <path d="M22.125 0H1.875C.8394 0 0 .8394 0 1.875v20.25C0 23.1606.8394 24 1.875 24h20.25C23.1606 24 24 23.1606 24 22.125V1.875C24 .8394 23.1606 0 22.125 0zM12 18.75c-.591 0-1.1697-.0413-1.7317-.1209-.5626.3965-3.813 2.6797-4.1198 2.7225 0 0-.1258.0489-.2328-.0141s-.0876-.2282-.0876-.2282c.0322-.2198.8426-3.0183.992-3.5333-2.7452-1.36-4.5701-3.7686-4.5701-6.5135C2.25 6.8168 6.6152 3.375 12 3.375s9.75 3.4418 9.75 7.6875c0 4.2457-4.3652 7.6875-9.75 7.6875zM8.0496 9.8672h-.8777v3.3417c0 .2963-.2523.5372-.5625.5372s-.5625-.2409-.5625-.5372V9.8672h-.8777c-.3044 0-.552-.2471-.552-.5508s.2477-.5508.552-.5508h2.8804c.3044 0 .552.2471.552.5508s-.2477.5508-.552.5508zm10.9879 2.9566a.558.558 0 0 1 .108.4167.5588.5588 0 0 1-.2183.371.5572.5572 0 0 1-.3383.1135.558.558 0 0 1-.4493-.2236l-1.3192-1.7479-.1952.1952v1.2273a.5635.5635 0 0 1-.5627.5628.563.563 0 0 1-.5625-.5625V9.3281c0-.3102.2523-.5625.5625-.5625s.5625.2523.5625.5625v1.209l1.5694-1.5694c.0807-.0807.1916-.1252.312-.1252.1404 0 .2814.0606.3871.1661.0985.0984.1573.2251.1654.3566.0082.1327-.036.2542-.1241.3425l-1.2818 1.2817 1.3845 1.8344zm-8.3502-3.5023c-.095-.2699-.3829-.5475-.7503-.5557-.3663.0083-.6542.2858-.749.5551l-1.3455 3.5415c-.1708.5305-.0217.7272.1333.7988a.8568.8568 0 0 0 .3576.0776c.2346 0 .4139-.0952.4678-.2481l.2787-.7297 1.7152.0001.2785.7292c.0541.1532.2335.2484.4681.2484a.8601.8601 0 0 0 .3576-.0775c.1551-.0713.3041-.2681.1329-.7999l-1.3449-3.5398zm-1.3116 2.4433l.5618-1.5961.5618 1.5961H9.3757zm5.9056 1.3836c0 .2843-.2418.5156-.5391.5156h-1.8047c-.2973 0-.5391-.2314-.5391-.5156V9.3281c0-.3102.2576-.5625.5742-.5625s.5742.2523.5742.5625v3.3047h1.1953c.2974 0 .5392.2314.5392.5156z" />
                </svg>
                {t("continueWithKakao")}
              </button>
            </div>

            {/* or 구분선 */}
            <div className="flex items-center gap-3 mt-4">
              <div
                className="flex-1 h-px"
                style={{ background: "var(--border-subtle)" }}
              />
              <span
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                or
              </span>
              <div
                className="flex-1 h-px"
                style={{ background: "var(--border-subtle)" }}
              />
            </div>

            <form className="mt-4 space-y-4" onSubmit={onSubmit}>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {t("email")}
                </label>
                <input
                  id="login-email"
                  className="mt-1 w-full input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {t("password")}
                </label>
                <input
                  id="login-password"
                  className="mt-1 w-full input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error ? (
                <div
                  className="text-sm rounded-lg p-3"
                  style={{
                    color: "var(--error)",
                    background: "var(--error-subtle)",
                    border: "1px solid rgba(248,113,113,0.2)",
                  }}
                >
                  {error}
                </div>
              ) : null}

              <div className="pt-2" />
              <button
                disabled={busy}
                className="btn btn-primary btn-md w-full !rounded-full"
                type="submit"
              >
                {busy ? t("working") : tc("signIn")}
              </button>

              <p
                className="text-sm text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                {t("newToZeriv")}{" "}
                <Link
                  href={signupHref}
                  className="underline cursor-pointer text-pink-400 hover:text-pink-300"
                >
                  {t("createAccount")}
                </Link>
              </p>
            </form>

            <p
              className="text-xs text-center leading-relaxed mt-6"
              style={{ color: "var(--text-secondary)" }}
            >
              {t("signInTermsPrefix")}{" "}
              <button
                type="button"
                onClick={() => setPolicyModal("terms")}
                className="underline"
                style={{ color: "var(--text-secondary)" }}
              >
                {tc("termsOfService")}
              </button>{" "}
              {t("and")}{" "}
              <button
                type="button"
                onClick={() => setPolicyModal("privacy")}
                className="underline"
                style={{ color: "var(--text-secondary)" }}
              >
                {tc("privacyPolicy")}
              </button>
              .
            </p>
          </div>
        </div>
      </div>

      {/* 우측 이미지 패널 */}
      <div className="hidden lg:flex lg:w-[48%] items-stretch p-4">
        <div className="relative w-full h-full rounded-3xl overflow-hidden">
          {SLIDESHOW_IMAGES.map((src, i) => (
            <div
              key={src}
              className="absolute inset-0 transition-opacity duration-1000"
              style={{ opacity: i === imgIdx ? 1 : 0 }}
            >
              <Image
                src={src}
                alt=""
                fill
                className="object-cover object-center"
                priority={i === 0}
              />
            </div>
          ))}
        </div>
      </div>

      {policyModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPolicyModal(null)}
        >
          <div
            className="card w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex shrink-0 items-center justify-end px-2 py-1"
              style={{ background: "var(--surface-2)" }}
            >
              <button
                type="button"
                onClick={() => setPolicyModal(null)}
                className="btn btn-ghost p-2"
                aria-label="Close"
              >
                <svg
                  className="w-7 h-7"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div
              className="flex-1 min-h-0 overflow-hidden"
              style={{ background: "var(--surface-1)" }}
            >
              <iframe
                src={
                  policyModal === "terms" ? "/terms/embed" : "/privacy/embed"
                }
                title={
                  policyModal === "terms"
                    ? tc("termsOfService")
                    : tc("privacyPolicy")
                }
                className="w-full h-full min-h-[60vh] border-0 block"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function LoginPage() {
  const tc = useTranslations("common");
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{
            background: "var(--surface-0)",
            color: "var(--text-muted)",
          }}
        >
          {tc("loading")}
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
