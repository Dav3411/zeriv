import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { safeNext } from "@/lib/safeNext";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  // open-redirect (CWE-601) 방어 — 백슬래시·protocol-relative·외부 origin 모두 차단
  const safeNextPath = safeNext(searchParams.get("next"));
  const next = safeNextPath || "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth_error`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/login?error=oauth_error`);
  }

  // 신규 사용자 감지: 첫 로그인이면 created_at과 last_sign_in_at이 동일
  const user = data.session.user;
  const isNewUser =
    user.created_at != null &&
    user.last_sign_in_at != null &&
    user.created_at === user.last_sign_in_at;

  if (isNewUser) {
    // next 파라미터 보존 — guest /quick 흐름에서 OAuth 가입 시 onboarding 후 복귀 경로 유지.
    // safeNext 통과한 값만 전달 (CWE-601 회귀 방지).
    const onboardingUrl = safeNextPath
      ? `${origin}/onboarding?next=${encodeURIComponent(safeNextPath)}`
      : `${origin}/onboarding`;
    return NextResponse.redirect(onboardingUrl);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
