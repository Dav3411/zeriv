import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { getBrandSubscription } from "@/lib/brandSubscription";
import {
  getOrgIdFromBrand,
  getOrgMemberCount,
} from "@/lib/organizationSubscription";
import { escapeHtml } from "@/lib/htmlUtils";

export const runtime = "nodejs";

const EMAIL_REGEX = /.+@.+\..+/;
const INVITE_TTL_DAYS = 7;

interface OrgMemberRow {
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string | null;
}

interface InvitationRow {
  id: string;
  invitee_email: string;
  expires_at: string;
}

interface MemberResponse {
  userId: string;
  email: string;
  role: "owner" | "admin" | "member";
  joinedAt: string | null;
}

interface PendingInviteResponse {
  id: string;
  email: string;
  expiresAt: string;
  expired: boolean;
}

/**
 * 이메일로 Supabase auth 유저 id를 찾는다.
 */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  // perPage를 1000으로 늘려 대부분의 경우 1회 왕복으로 해결.
  // 최대 5페이지(5,000명) 제한 — 현실적인 운영 상한.
  const perPage = 1000;
  const MAX_PAGES = 5;
  while (page <= MAX_PAGES) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error || !data) return null;
    const found = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === normalized,
    );
    if (found) return found.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}

function buildInviteEmailHtml(opts: {
  brandName: string;
  inviterEmail: string;
  inviteUrl: string;
  expiresAt: Date;
}): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#09090b;color:#f4f4f5;padding:40px 20px;max-width:480px;margin:0 auto">
  <h2 style="font-size:20px;font-weight:700;margin-bottom:8px">워크스페이스 초대</h2>
  <p style="color:#a1a1aa;font-size:14px;margin-bottom:24px">
    <strong style="color:#f4f4f5">${escapeHtml(opts.inviterEmail)}</strong>님이
    <strong style="color:#f4f4f5">${escapeHtml(opts.brandName)}</strong> 워크스페이스에 초대했습니다.
  </p>
  <a href="${opts.inviteUrl}"
     style="display:inline-block;background:linear-gradient(135deg,#ffa4c6,#ffe3be);color:#000;font-weight:700;
            padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px">
    초대 수락하기
  </a>
  <p style="color:#52525b;font-size:12px;margin-top:24px">
    이 링크는 ${opts.expiresAt.toLocaleDateString("ko-KR")}까지 유효합니다.<br/>
    본인이 요청하지 않은 경우 이 이메일을 무시하세요.
  </p>
</body>
</html>`;
}

async function sendInviteEmail(opts: {
  to: string;
  brandName: string;
  inviterEmail: string;
  inviteUrl: string;
  expiresAt: Date;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.INVITE_FROM_EMAIL?.trim() || "Zeriv <support@example.com>";
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Configure it to send invitation emails.",
    );
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: "[Zeriv] 브랜드 워크스페이스에 초대되었습니다",
      html: buildInviteEmailHtml({
        brandName: opts.brandName,
        inviterEmail: opts.inviterEmail,
        inviteUrl: opts.inviteUrl,
        expiresAt: opts.expiresAt,
      }),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to send invite email: ${res.status} ${t}`);
  }
}

/**
 * GET /api/brands/[id]/members
 *
 * 멤버 목록은 brand가 속한 organization의 organization_members에서 조회한다.
 * 즉 이제 멤버는 brand 단위가 아니라 organization 단위.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: brandId } = await params;

  const brand = await dbGetBrand(brandId, userId);
  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const orgId = await getOrgIdFromBrand(brandId);
  if (!orgId) {
    // 마이그레이션 누락 등 비정상 상태 — 빈 결과 반환 (오류 노출 방지)
    return NextResponse.json({
      members: [],
      pendingInvites: [],
      memberLimit: null,
    });
  }

  const { data: memberRows, error: membersErr } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, role, created_at")
    .eq("organization_id", orgId);

  if (membersErr) {
    return NextResponse.json(
      { error: "Failed to load members" },
      { status: 500 },
    );
  }

  const rows = (memberRows ?? []) as OrgMemberRow[];
  const members: MemberResponse[] = await Promise.all(
    rows.map(async (row) => {
      let email = "";
      try {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
          row.user_id,
        );
        email = userData?.user?.email ?? "";
      } catch {
        email = "";
      }
      return {
        userId: row.user_id,
        email,
        role: row.role,
        joinedAt: row.created_at,
      };
    }),
  );

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: inviteRows } = await supabaseAdmin
    .from("brand_invitations")
    .select("id, invitee_email, expires_at")
    .eq("brand_id", brandId)
    .is("used_at", null)
    .gt("expires_at", thirtyDaysAgo)
    .order("created_at", { ascending: false });

  const pendingInvites: PendingInviteResponse[] = (
    (inviteRows ?? []) as InvitationRow[]
  ).map((r) => ({
    id: r.id,
    email: r.invitee_email,
    expiresAt: r.expires_at,
    expired: new Date(r.expires_at) < new Date(),
  }));

  const subscription = await getBrandSubscription(brandId);
  const memberLimit = subscription?.plan.memberLimit ?? null;

  return NextResponse.json({ members, pendingInvites, memberLimit });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: brandId } = await params;

  const brand = await dbGetBrand(brandId, userId);
  if (!brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 초대는 owner 전용
  const { data: ownerCheck } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("id", brandId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ownerCheck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "올바른 이메일 주소를 입력해 주세요." },
      { status: 400 },
    );
  }

  const orgId = await getOrgIdFromBrand(brandId);
  if (!orgId) {
    return NextResponse.json(
      { error: "Organization not found for this brand" },
      { status: 500 },
    );
  }

  // 플랜 한도 확인 (organization 풀)
  const brandSub = await getBrandSubscription(brandId);
  const memberLimit = brandSub?.plan.memberLimit ?? null;

  const memberCount = await getOrgMemberCount(orgId);

  // 대기 중 초대도 한도에 포함
  const nowIso = new Date().toISOString();
  // 같은 organization에 속한 모든 brand의 미사용 초대 합산
  const { data: orgBrands } = await supabaseAdmin
    .from("brands")
    .select("id")
    .eq("organization_id", orgId);
  const orgBrandIds = (orgBrands ?? []).map((b: { id: string }) => b.id);
  let pendingCount = 0;
  if (orgBrandIds.length > 0) {
    const { count } = await supabaseAdmin
      .from("brand_invitations")
      .select("id", { count: "exact", head: true })
      .in("brand_id", orgBrandIds)
      .is("used_at", null)
      .gt("expires_at", nowIso);
    pendingCount = count ?? 0;
  }

  const effectiveTotal = memberCount + pendingCount;
  if (memberLimit !== null && effectiveTotal >= memberLimit) {
    return NextResponse.json(
      { error: "현재 플랜의 팀원 한도에 도달했습니다." },
      { status: 403 },
    );
  }

  // 이미 organization 멤버인지 확인
  const existingUserId = await findUserIdByEmail(email);
  if (existingUserId) {
    const { data: existingMember } = await supabaseAdmin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("user_id", existingUserId)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json(
        { error: "이미 워크스페이스의 멤버입니다." },
        { status: 409 },
      );
    }
  }

  // 이미 유효한 초대가 있는지 확인 (org 내 모든 brand 기준)
  if (orgBrandIds.length > 0) {
    const { data: existingInvite } = await supabaseAdmin
      .from("brand_invitations")
      .select("id")
      .in("brand_id", orgBrandIds)
      .eq("invitee_email", email)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .maybeSingle();
    if (existingInvite) {
      return NextResponse.json(
        { error: "이미 초대가 발송된 이메일입니다." },
        { status: 409 },
      );
    }
  }

  // 토큰 생성 (64자 hex)
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const { data: insertedInvite, error: insertErr } = await supabaseAdmin
    .from("brand_invitations")
    .insert({
      brand_id: brandId,
      invitee_email: email,
      token,
      invited_by: userId,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !insertedInvite) {
    return NextResponse.json(
      { error: "초대 생성에 실패했습니다." },
      { status: 500 },
    );
  }

  const { data: brandRow } = await supabaseAdmin
    .from("brands")
    .select("name")
    .eq("id", brandId)
    .maybeSingle();
  const brandName = (brandRow?.name as string | undefined) ?? "워크스페이스";

  let inviterEmail = "";
  try {
    const { data: inviterData } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    inviterEmail = inviterData?.user?.email ?? "";
  } catch {
    inviterEmail = "";
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const inviteUrl = `${appUrl}/invite/${token}`;

  try {
    await sendInviteEmail({
      to: email,
      brandName,
      inviterEmail,
      inviteUrl,
      expiresAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "이메일 발송에 실패했습니다.";
    console.error("sendInviteEmail failed:", msg);
    return NextResponse.json(
      { error: "이메일 발송에 실패했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, inviteId: insertedInvite.id });
}
