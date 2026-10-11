/**
 * 어드민 행위 감사 로그 (best-effort).
 *
 * 호출 측 invariant:
 * - 권한 검증(`requireCreditsAdmin`)을 통과한 후, 원본 액션이 성공했을 때만 호출한다.
 * - 실패해도 원본 액션의 결과를 되돌리지 않는다 — throw하지 않고 console.error로 기록만 한다.
 *
 * 관련 마이그레이션: web/supabase/migrations/20260427_admin_audit_logs.sql
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type AdminAuditAction =
  | "plan_change"
  | "account_delete"
  | "credits_adjust"
  | "credits_delete"
  | "job_cancel";

export type AdminAuditTargetType = "organization" | "user" | "job";

export interface LogAdminActionParams {
  adminUserId: string;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  details?: Record<string, unknown>;
}

export async function logAdminAction(
  params: LogAdminActionParams,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: params.adminUserId,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      details: params.details ?? {},
    });
    if (error) {
      console.error(
        JSON.stringify({
          action: "admin_audit_log_failed",
          reason: "insert_error",
          message: error.message,
          adminAction: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
        }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({
        action: "admin_audit_log_failed",
        reason: "exception",
        message: e instanceof Error ? e.message : String(e),
        adminAction: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
      }),
    );
  }
}
