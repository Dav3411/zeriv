export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { r2KeyToPublicUrl } from "@/lib/r2";
import { isHttpUrl } from "@/lib/style/styleUrlResolver";

// 이 라우트는 styles의 일부 컬럼만 조회하므로 resolveStyleUrls(Style 전체 필요)
// 대신 경량 변환을 인라인으로 수행한다.
type AdminTemplateRow = {
  id: string;
  name: string;
  category: string | null;
  status: string | null;
  is_template: boolean;
  key_visual_url: string | null;
  example_images: string[] | null;
  mood_keywords: string[] | null;
  created_at: string;
};

function resolveMaybeKey(value: string | null): string | null {
  if (!value) return null;
  if (isHttpUrl(value)) return value;
  try {
    return r2KeyToPublicUrl(value);
  } catch {
    // 개발 환경 fallback: R2_PUBLIC_URL 미설정 시 key 원문 반환.
    return value;
  }
}

export async function GET(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  // 어드민 Explore 관리 페이지용 — 전체 스타일 반환 (is_template 필터 없음).
  // user_id 필터는 어드민 API에 부적절하며, 과거 버그로 본인 소유 행만 반환되는 문제 있었음.
  const { data: styles, error } = await supabaseAdmin
    .from("styles")
    .select(
      "id, name, category, status, is_template, key_visual_url, example_images, mood_keywords, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (styles ?? []) as AdminTemplateRow[];
  const resolved = rows.map((row) => ({
    ...row,
    key_visual_url: resolveMaybeKey(row.key_visual_url),
    example_images: (row.example_images ?? [])
      .map((img) => resolveMaybeKey(img))
      .filter((img): img is string => img !== null),
  }));

  return NextResponse.json({ styles: resolved });
}
