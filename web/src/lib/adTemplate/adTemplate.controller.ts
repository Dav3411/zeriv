/**
 * adTemplate.controller.ts — HTTP 요청 파싱 + 응답 조립.
 *
 * Route handler가 이 파일의 함수를 직접 호출한다.
 * 각 함수는:
 *   1. Zod로 입력 파싱 + 오류 응답 생성
 *   2. Service 호출
 *   3. NextResponse 반환
 *
 * Service의 domain error를 HTTP 상태 코드로 매핑하는 것이 이 레이어의 역할.
 */

import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  RegisterAdTemplateSchema,
  AdminUpdateAdTemplateSchema,
  UpdateAdTemplateStatusSchema,
  ListAdTemplatesQuerySchema,
  AdminListAdTemplatesQuerySchema,
} from "./adTemplate.schema";
import * as svc from "./adTemplate.service";
import {
  AdTemplateNotFoundError,
  AdTemplateDuplicateCodeError,
} from "./adTemplate.service";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function searchParamsToObject(sp: URLSearchParams): Record<string, string> {
  const obj: Record<string, string> = {};
  sp.forEach((v, k) => { obj[k] = v; });
  return obj;
}

function zodErrorResponse(err: ZodError): NextResponse {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return NextResponse.json(
    { error: "Validation failed", fieldErrors },
    { status: 422 }
  );
}

function domainErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof AdTemplateNotFoundError) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (err instanceof AdTemplateDuplicateCodeError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  return null;
}

function log(action: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ action, ...extra }));
}

function logError(action: string, err: unknown): void {
  console.error(JSON.stringify({ action, error: String(err) }));
}

// ─── Public: GET /api/ad-templates ───────────────────────────────────────────

export async function handleListAdTemplates(req: NextRequest): Promise<NextResponse> {
  const parsed = ListAdTemplatesQuerySchema.safeParse(
    searchParamsToObject(req.nextUrl.searchParams)
  );
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const result = await svc.listAdTemplates(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    logError("list_ad_templates", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Public: GET /api/ad-templates/:id ───────────────────────────────────────

export async function handleGetAdTemplateById(id: string): Promise<NextResponse> {
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const tpl = await svc.getAdTemplateById(id);
    return NextResponse.json(tpl);
  } catch (err) {
    return domainErrorResponse(err)
      ?? (logError("get_ad_template_by_id", err), NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}

// ─── Public: GET /api/ad-templates/code/:code ────────────────────────────────

export async function handleGetAdTemplateByCode(
  code: string,
  snapshotMode: boolean
): Promise<NextResponse> {
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  try {
    if (snapshotMode) {
      const snap = await svc.getAdTemplateSnapshot(code);
      return NextResponse.json(snap);
    }
    const tpl = await svc.getAdTemplateByCode(code);
    return NextResponse.json(tpl);
  } catch (err) {
    return domainErrorResponse(err)
      ?? (logError("get_ad_template_by_code", err), NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}

// ─── Admin: POST /api/admin/ad-templates ─────────────────────────────────────

export async function handleCreateAdTemplate(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RegisterAdTemplateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const tpl = await svc.createAdTemplate(parsed.data);
    log("ad_template_created", { templateCode: tpl.templateCode, id: tpl.id });
    return NextResponse.json(tpl, { status: 201 });
  } catch (err) {
    return domainErrorResponse(err)
      ?? (logError("create_ad_template", err), NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}

// ─── Admin: PATCH /api/admin/ad-templates/:id ────────────────────────────────

export async function handleUpdateAdTemplate(
  req: NextRequest,
  id: string
): Promise<NextResponse> {
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AdminUpdateAdTemplateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const tpl = await svc.updateAdTemplate(id, parsed.data);
    log("ad_template_updated", { id, version: tpl.templateVersion });
    return NextResponse.json(tpl);
  } catch (err) {
    return domainErrorResponse(err)
      ?? (logError("update_ad_template", err), NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}

// ─── Admin: PATCH /api/admin/ad-templates/:id/status ─────────────────────────

export async function handleUpdateAdTemplateStatus(
  req: NextRequest,
  id: string
): Promise<NextResponse> {
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateAdTemplateStatusSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const tpl = await svc.updateAdTemplateStatus(id, parsed.data);
    log("ad_template_status_updated", { id, status: tpl.status });
    return NextResponse.json(tpl);
  } catch (err) {
    return domainErrorResponse(err)
      ?? (logError("update_ad_template_status", err), NextResponse.json({ error: "Internal server error" }, { status: 500 }));
  }
}

// ─── Admin: GET /api/admin/ad-templates ──────────────────────────────────────

export async function handleAdminListAdTemplates(req: NextRequest): Promise<NextResponse> {
  const parsed = AdminListAdTemplatesQuerySchema.safeParse(
    searchParamsToObject(req.nextUrl.searchParams)
  );
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const result = await svc.adminListAdTemplates(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    logError("admin_list_ad_templates", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
