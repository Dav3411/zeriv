export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireCreditsAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isHttpUrl } from "@/lib/style/styleUrlResolver";

/**
 * POST /api/admin/styles/migrate-urls
 *
 * 레거시 데이터 마이그레이션: styles 테이블의 key_visual_url, style_sheet_url,
 * example_images에 저장된 완전한 URL(signed 또는 CDN)을 R2 key로 역변환하여 저장.
 *
 * 변환 규칙:
 * - signed URL (`*.r2.cloudflarestorage.com/...?X-Amz-...`):
 *   URL의 pathname에서 첫 번째 경로 세그먼트(bucket name)를 제거한 나머지를 key로 사용.
 *   예) https://xxx.r2.cloudflarestorage.com/sugarpool/brands/abc/styles/def/key_visual.png?...
 *        → brands/abc/styles/def/key_visual.png
 * - CDN URL (`R2_PUBLIC_URL/{key}` 또는 `*.r2.dev/{key}`):
 *   R2_PUBLIC_URL prefix를 제거한 나머지를 key로 사용.
 * - 이미 key 형태(`brands/...`, `styles/...`, etc.)면 건너뜀.
 *
 * example_images 처리:
 * - 배열 내 요소 단위로 URL → key 변환.
 * - 배열에 URL과 key가 혼재 가능 (일부만 변환 필요).
 * - 하나라도 변환되면 전체 배열을 patch에 포함.
 *
 * 필터 전략:
 * - Supabase는 배열 요소 단위 ilike 필터가 까다로우므로 전체 행을 가져와 앱 레이어에서 순회.
 * - limit/offset 페이지네이션으로 대량 스캔을 제어.
 *
 * 안전 장치:
 * - dry-run 모드 지원: `?dryRun=true` — 변환 결과만 반환, DB 업데이트 없음
 * - 처리 행 수 제한: `?limit=N` (기본 500)
 * - 오프셋: `?offset=N`
 * - 변환 실패 시 해당 row는 건너뛰고 errors 배열에 기록 (전체 롤백 없음)
 */

type StyleRow = {
  id: string;
  key_visual_url: string | null;
  style_sheet_url: string | null;
  example_images: string[] | null;
};

/**
 * URL을 R2 key로 역변환.
 * 변환 불가능(호스트 형식이 예상과 다름 등) 시 null 반환.
 */
function urlToR2Key(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const publicUrl =
    process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

  // 1) R2_PUBLIC_URL prefix로 시작하면 그 뒤를 key로 사용
  if (publicUrl) {
    const normalizedPublic = publicUrl.replace(/\/$/, "");
    if (url.startsWith(normalizedPublic + "/")) {
      const key = url.slice(normalizedPublic.length + 1);
      // query string 제거 (방어적)
      const qIdx = key.indexOf("?");
      return qIdx >= 0 ? key.slice(0, qIdx) : key;
    }
  }

  // 2) signed URL: {bucket}.xxx.r2.cloudflarestorage.com/{key}
  // bucket이 subdomain에 있으므로 pathname = /{key} 그대로 사용
  if (parsed.hostname.endsWith(".r2.cloudflarestorage.com")) {
    const path = parsed.pathname.startsWith("/")
      ? parsed.pathname.slice(1)
      : parsed.pathname;
    return path || null;
  }

  // 3) *.r2.dev 같은 public dev URL (R2_PUBLIC_URL이 비어있는 경우 대비)
  if (parsed.hostname.endsWith(".r2.dev")) {
    const path = parsed.pathname.startsWith("/")
      ? parsed.pathname.slice(1)
      : parsed.pathname;
    return path || null;
  }

  // 그 외 호스트는 변환 불가
  return null;
}

type ConversionResult =
  | {
      field: "key_visual_url" | "style_sheet_url";
      from: string;
      to: string | null;
    }
  | {
      field: "example_images";
      fromArray: (string | null)[];
      toArray: (string | null)[];
    };

export async function POST(req: Request) {
  const auth = await requireCreditsAdmin(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "500", 10) || 500, 1),
    5000,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  // example_images 배열 요소 필터는 Supabase에서 간단한 ilike로 표현하기 어려워
  // 전체 행을 가져와 앱 레이어에서 순회 판별한다. limit/offset로 스캔 범위를 제한.
  const { data, error } = await supabaseAdmin
    .from("styles")
    .select("id, key_visual_url, style_sheet_url, example_images")
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as StyleRow[];

  const scanned = rows.length;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ id: string; reason: string }> = [];
  const conversions: Array<{ id: string; changes: ConversionResult[] }> = [];

  for (const row of rows) {
    // patch 값 타입: 스칼라 필드는 string | null, example_images는 string[].
    const patch: Record<string, string | null | string[]> = {};
    const changes: ConversionResult[] = [];

    if (row.key_visual_url && isHttpUrl(row.key_visual_url)) {
      const key = urlToR2Key(row.key_visual_url);
      if (key) {
        patch.key_visual_url = key;
        changes.push({
          field: "key_visual_url",
          from: row.key_visual_url,
          to: key,
        });
      } else {
        errors.push({
          id: row.id,
          reason: `key_visual_url: unable to parse "${row.key_visual_url}"`,
        });
      }
    }

    if (row.style_sheet_url && isHttpUrl(row.style_sheet_url)) {
      const key = urlToR2Key(row.style_sheet_url);
      if (key) {
        patch.style_sheet_url = key;
        changes.push({
          field: "style_sheet_url",
          from: row.style_sheet_url,
          to: key,
        });
      } else {
        errors.push({
          id: row.id,
          reason: `style_sheet_url: unable to parse "${row.style_sheet_url}"`,
        });
      }
    }

    // example_images: 배열 내에 URL/key 혼재 가능. 각 요소를 개별 판별.
    // - http로 시작하면 변환 시도
    // - 이미 key면 그대로 유지
    // - 변환 실패 시 원문 유지 + errors에 기록 (부분 변환 허용)
    // 배열 중 하나라도 변환되어야 patch에 포함.
    if (Array.isArray(row.example_images) && row.example_images.length > 0) {
      const original = row.example_images;
      const converted: string[] = [];
      let anyChanged = false;

      for (const element of original) {
        if (typeof element !== "string" || element.length === 0) {
          // 방어: null/빈 문자열 같은 이상 요소는 건너뜀 (원본 복원 불가하므로 제외)
          continue;
        }
        if (isHttpUrl(element)) {
          const key = urlToR2Key(element);
          if (key) {
            converted.push(key);
            anyChanged = true;
          } else {
            // 변환 실패 요소는 원문을 유지하고 error만 기록
            converted.push(element);
            errors.push({
              id: row.id,
              reason: `example_images: unable to parse "${element}"`,
            });
          }
        } else {
          // 이미 key 형태 — 그대로 유지
          converted.push(element);
        }
      }

      if (anyChanged) {
        patch.example_images = converted;
        changes.push({
          field: "example_images",
          fromArray: original,
          toArray: converted,
        });
      }
    }

    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }

    conversions.push({ id: row.id, changes });

    if (!dryRun) {
      const { error: updErr } = await supabaseAdmin
        .from("styles")
        .update(patch)
        .eq("id", row.id);
      if (updErr) {
        errors.push({
          id: row.id,
          reason: `update failed: ${updErr.message}`,
        });
        continue;
      }
      updated += 1;
    } else {
      // dry-run에서도 updated 카운트에 "변환 대상" 수를 반영
      updated += 1;
    }
  }

  return NextResponse.json({
    dryRun,
    limit,
    offset,
    scanned,
    updated,
    skipped,
    errorsCount: errors.length,
    errors,
    conversions,
  });
}
