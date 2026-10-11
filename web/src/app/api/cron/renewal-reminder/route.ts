import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { secureCompare } from "@/lib/secureCompare";
import { escapeHtml } from "@/lib/htmlUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SubscriptionRow = {
  id: string;
  brand_id: string | null;
  organization_id: string | null;
  plan: string;
  current_period_end: string;
  last_reminder_sent_at: string | null;
  organizations: {
    owner_id: string;
    name: string;
  } | null;
};

const PLAN_LABELS: Record<string, string> = {
  starter: "Atelier",
  label: "Label",
  pro: "Pro",
  studio: "House",
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !secureCompare(authHeader ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  // 중복 방지: current_period_end - 5일 이후에 이미 발송한 것은 제외
  // 즉 last_reminder_sent_at이 null이거나 (current_period_end - 5d) 이전인 것만 처리

  const { data: subsRaw, error: queryError } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "id, brand_id, organization_id, plan, current_period_end, last_reminder_sent_at, organizations(owner_id, name)",
    )
    .eq("status", "active")
    .gt("current_period_end", now.toISOString())
    .lte("current_period_end", windowEnd.toISOString());

  if (queryError) {
    console.error("[renewal-reminder] query error:", queryError.message);
    return NextResponse.json({ error: "구독 조회 실패" }, { status: 500 });
  }

  const subs = (subsRaw ?? []) as unknown as SubscriptionRow[];

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.INVITE_FROM_EMAIL?.trim() || "Zeriv <support@example.com>";
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");

  if (!apiKey) {
    console.error("[renewal-reminder] RESEND_API_KEY not set");
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 },
    );
  }

  let sentCount = 0;
  let skippedCount = 0;
  let failCount = 0;

  for (const sub of subs) {
    // 중복 발송 방지: current_period_end - 5일 이후에 이미 발송한 경우 skip
    const fiveDaysBeforeEnd = new Date(
      new Date(sub.current_period_end).getTime() - 5 * 24 * 60 * 60 * 1000,
    );
    if (
      sub.last_reminder_sent_at &&
      new Date(sub.last_reminder_sent_at) > fiveDaysBeforeEnd
    ) {
      skippedCount++;
      continue;
    }

    const org = Array.isArray(sub.organizations)
      ? sub.organizations[0]
      : sub.organizations;
    if (!org?.owner_id) {
      console.warn(
        "[renewal-reminder] organization owner missing for sub",
        sub.id,
      );
      failCount++;
      continue;
    }

    // 사용자 이메일 조회 (organization owner)
    let userEmail: string;
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
        org.owner_id,
      );
      userEmail = userData?.user?.email ?? "";
    } catch (err) {
      console.error(
        "[renewal-reminder] getUserById error for sub",
        sub.id,
        err,
      );
      failCount++;
      continue;
    }

    if (!userEmail) {
      console.warn("[renewal-reminder] empty email for user", org.owner_id);
      failCount++;
      continue;
    }

    const orgName = org.name ?? "워크스페이스";
    const planLabel = PLAN_LABELS[sub.plan] ?? sub.plan;
    const expiryDateStr = new Date(sub.current_period_end).toLocaleDateString(
      "ko-KR",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );
    const renewUrl = sub.brand_id
      ? `${appUrl}/checkout/galaxia?plan=${sub.plan}&brand_id=${sub.brand_id}`
      : `${appUrl}/checkout/galaxia?plan=${sub.plan}&organization_id=${sub.organization_id ?? ""}`;

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#09090b;color:#f4f4f5;padding:40px 20px;max-width:480px;margin:0 auto">
  <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;font-weight:700;color:rgba(255,164,198,0.55);margin-bottom:8px">
    구독 만료 안내
  </p>
  <h2 style="font-size:20px;font-weight:700;margin-bottom:8px;color:#f4f4f5">
    구독이 곧 만료됩니다
  </h2>
  <p style="color:#a1a1aa;font-size:14px;margin-bottom:24px">
    <strong style="color:#f4f4f5">${escapeHtml(orgName)}</strong>의
    <strong style="color:#f4f4f5">Zeriv ${escapeHtml(planLabel)}</strong> 구독이
    <strong style="color:#ffa4c6">${expiryDateStr}</strong>에 만료됩니다.<br/>
    아래 버튼을 눌러 구독을 갱신하세요.
  </p>
  <a href="${renewUrl}"
     style="display:inline-block;background:linear-gradient(135deg,#ffa4c6,#ffe3be);color:#000;font-weight:700;
            padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px">
    구독 갱신하기
  </a>
  <p style="color:#52525b;font-size:12px;margin-top:24px">
    갱신하지 않으면 만료일 이후 서비스 이용이 제한됩니다.<br/>
    본인이 요청하지 않은 경우 이 이메일을 무시하세요.
  </p>
</body>
</html>`;

    try {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [userEmail],
          subject: `[Zeriv] 구독이 곧 만료됩니다 — ${orgName}`,
          html,
        }),
      });

      if (!emailRes.ok) {
        const t = await emailRes.text();
        console.error(
          "[renewal-reminder] resend failed for sub",
          sub.id,
          emailRes.status,
          t,
        );
        failCount++;
        continue;
      }

      // last_reminder_sent_at 업데이트
      const { error: updateError } = await supabaseAdmin
        .from("subscriptions")
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq("id", sub.id);

      if (updateError) {
        console.error(
          "[renewal-reminder] update last_reminder_sent_at error:",
          updateError.message,
        );
      }

      sentCount++;
    } catch (err) {
      console.error("[renewal-reminder] unexpected error for sub", sub.id, err);
      failCount++;
    }
  }

  return NextResponse.json({
    processed: subs.length,
    sent: sentCount,
    skipped: skippedCount,
    failed: failCount,
  });
}
