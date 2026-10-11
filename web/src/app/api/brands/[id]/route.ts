import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dbGetBrand } from "@/lib/campaign/campaign.repository";
import { isReservedBrandSlug } from "@/lib/reservedBrandSlugs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // owner + member 공용 접근 확인
  const access = await dbGetBrand(id, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data, error: dbError } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("id", id)
    .single();

  if (dbError || !data)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  return NextResponse.json({
    ...data,
    primaryColor: data.primary_color,
    logoUrl: data.logo_url ?? null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // owner + member 모두 브랜드 설정 수정 가능
  const access = await dbGetBrand(id, userId);
  if (!access)
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if ("name" in body) {
    // 타입·필수값 검증을 먼저 수행 — 비문자열·빈 문자열이 예약어 가드까지
    // 흘러가 잘못된 에러 메시지로 떨어지지 않도록.
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    // 예약 슬러그 차단 — POST 와 동일 정책. URL 라우팅 충돌 방어.
    if (isReservedBrandSlug(body.name)) {
      return NextResponse.json(
        {
          error:
            "이 이름은 시스템 예약어로 사용할 수 없습니다. 다른 이름을 선택해 주세요.",
        },
        { status: 400 },
      );
    }
    updates.name = body.name;
  }
  if ("description" in body) updates.description = body.description;
  if ("logo_url" in body) updates.logo_url = body.logo_url;
  if ("logoUrl" in body) updates.logo_url = body.logoUrl;
  const color = body.primaryColor ?? body.color ?? body.primary_color;
  if (color !== undefined) updates.primary_color = color;

  if ("preferredChannels" in body) {
    const { data: current } = await supabaseAdmin
      .from("brands")
      .select("meta")
      .eq("id", id)
      .single();
    updates.meta = {
      ...((current?.meta as Record<string, unknown>) ?? {}),
      preferred_channels: body.preferredChannels,
    };
  }

  const { data, error: dbError } = await supabaseAdmin
    .from("brands")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (dbError || !data)
    return NextResponse.json({ error: "Update failed" }, { status: 400 });
  return NextResponse.json({
    ...data,
    primaryColor: data.primary_color,
    logoUrl: data.logo_url ?? null,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { userId, error } = await requireUserId(req);
  if (error || !userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // 브랜드 삭제는 owner만 가능 — user_id 필터 유지
  const { error: dbError } = await supabaseAdmin
    .from("brands")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (dbError)
    return NextResponse.json({ error: "Delete failed" }, { status: 400 });
  return NextResponse.json({ success: true });
}
