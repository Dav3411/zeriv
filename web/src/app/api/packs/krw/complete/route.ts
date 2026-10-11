/**
 * POST /api/packs/krw/complete
 *
 * PortOne 결제 완료 후 클라이언트가 호출. 서버측 검증 + 팩 적립.
 *
 * 흐름:
 *   1) 인증
 *   2) 입력 파싱 (merchant_uid + imp_uid)
 *   3) 소유권 검증 — order.user_id === auth user
 *   4) settlePackOrder 위임 (PortOne 검증 + paid 전이 + pack insert + 멱등)
 *
 * 책임 경계:
 *   - 본 route: 인증 + 소유권 검증 + Body 파싱
 *   - settlePackOrder: PortOne API 호출 + DB 정산 (webhook 과 공유)
 *
 * Plan ref: docs/billing/credit-system-revival-plan.md (v2) 섹션 2.1.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/authServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { settlePackOrder } from '@/lib/packSettlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CompleteBody = {
  merchant_uid?: unknown;
  imp_uid?: unknown;
};

export async function POST(req: Request): Promise<NextResponse> {
  // ── 1) 인증 ────────────────────────────────────────────────────────────
  const { error: authErr, userId } = await requireUserId(req);
  if (authErr || !userId) {
    return NextResponse.json({ error: authErr ?? 'Unauthorized' }, { status: 401 });
  }

  // ── 2) Body 파싱 ────────────────────────────────────────────────────────
  let body: CompleteBody;
  try {
    body = (await req.json()) as CompleteBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const merchantUid = typeof body.merchant_uid === 'string' ? body.merchant_uid.trim() : '';
  const impUid = typeof body.imp_uid === 'string' ? body.imp_uid.trim() : '';
  if (!merchantUid || !impUid) {
    return NextResponse.json(
      { error: 'merchant_uid and imp_uid are required' },
      { status: 400 },
    );
  }

  // ── 3) 소유권 검증 ──────────────────────────────────────────────────────
  // 다른 사용자의 imp_uid 를 자기 세션으로 호출하는 takeover 차단.
  // order 정보를 settlePackOrder 가 다시 조회하지만 (단일 SoT), 소유권
  // 검증은 라우트의 책임이라 여기서 먼저 수행한다.
  const { data: orderOwner, error: ownerErr } = await supabaseAdmin
    .from('krw_pack_orders')
    .select('user_id')
    .eq('merchant_uid', merchantUid)
    .maybeSingle();

  if (ownerErr) {
    console.error('[packs/complete] order owner lookup error:', ownerErr.message);
    return NextResponse.json({ error: 'Order lookup failed' }, { status: 500 });
  }
  if (!orderOwner) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (orderOwner.user_id !== userId) {
    console.warn(
      '[packs/complete] user mismatch — possible takeover attempt',
      { merchantUid, orderUserId: orderOwner.user_id, requestUserId: userId },
    );
    return NextResponse.json({ error: 'Order does not belong to user' }, { status: 403 });
  }

  // ── 4) 정산 ────────────────────────────────────────────────────────────
  const result = await settlePackOrder({ merchantUid, impUid, caller: 'complete' });

  if (!result.ok) {
    // PACK_INSERT_FAILED 의 경우 운영 추적을 위해 order_id 도 함께 노출.
    const responseBody: Record<string, unknown> = { error: result.error };
    if (result.code === 'PACK_INSERT_FAILED' && result.orderId) {
      responseBody.order_id = result.orderId;
    }
    return NextResponse.json(responseBody, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    idempotent: result.idempotent,
    pack: result.pack,
  });
}
