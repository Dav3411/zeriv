import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  listOrganizationsForUser,
  getOrganizationSubscription,
} from '@/lib/organizationSubscription';

export const runtime = 'nodejs';

/**
 * GET /api/organizations
 * 로그인 유저가 owner 또는 member로 속한 모든 organization 목록 반환.
 * 각 org의 활성 plan 요약 포함.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgs = await listOrganizationsForUser(userId);

  const enriched = await Promise.all(
    orgs.map(async (o) => {
      const sub = await getOrganizationSubscription(o.id);
      return {
        id: o.id,
        name: o.name,
        ownerId: o.ownerId,
        role: o.role,
        planKey: sub.planKey,
        planLabel: sub.plan.label,
        planTier: sub.planTier,
        currentPeriodEnd: sub.currentPeriodEnd,
        status: sub.status,
      };
    }),
  );

  return NextResponse.json({ organizations: enriched });
}

/**
 * POST /api/organizations
 * Body: { name?: string }
 * 신규 organization 생성. 호출자가 자동으로 owner가 된다.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    body = {};
  }

  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  const name = rawName.length > 0 ? rawName : 'My Organization';

  const { data: org, error: insertErr } = await supabaseAdmin
    .from('organizations')
    .insert({ name, owner_id: userId })
    .select('id, name, owner_id, created_at')
    .single();

  if (insertErr || !org) {
    console.error('[organizations POST] insert error:', insertErr?.message);
    return NextResponse.json(
      { error: 'Failed to create organization' },
      { status: 500 },
    );
  }

  // owner를 organization_members에 추가
  const { error: memberErr } = await supabaseAdmin
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: 'owner',
    });

  if (memberErr) {
    // org는 만들어졌으나 owner row 추가 실패 — 일관성 문제 — best-effort 롤백
    await supabaseAdmin.from('organizations').delete().eq('id', org.id);
    console.error('[organizations POST] member insert error:', memberErr.message);
    return NextResponse.json(
      { error: 'Failed to register owner' },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      id: org.id,
      name: org.name,
      ownerId: org.owner_id,
      role: 'owner',
      createdAt: org.created_at,
    },
    { status: 201 },
  );
}
