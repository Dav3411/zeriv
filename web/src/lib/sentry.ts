/**
 * 결제 정합성 알람 / 일반 에러 캡쳐 helper.
 *
 * 2026-05-17: `@sentry/nextjs` SDK 를 제거하면서 내부를 console.error 전용 fallback
 * 으로 단순화했다. 호출처(7곳) 의 시그니처 / 타입 / export 이름은 100% 유지한다 —
 * 향후 다른 알람 채널(Slack / Email / PagerDuty / 자체 webhook 등) 을 도입할 때
 * 본 wrapper 의 내부 구현만 교체하면 호출처 코드를 손대지 않고 즉시 활성화할 수 있다.
 *
 * 파일명·export·타입 enum 은 미래 호환을 위해 보존한다.
 *
 * 운영 로그 grep 규약:
 *   `[BILLING-INCIDENT][critical][pack_missing] paid but pack missing — ...`
 *   `[ERROR] <message> { ...context }`
 */

export type BillingIncidentType =
  /** 결제는 paid 인데 org_generation_packs 가 없음. */
  | "pack_missing"
  /** PortOne amount 가 server-side amount 와 불일치 — 위변조 의심. */
  | "tamper_suspect"
  /** 결제는 성공했으나 후속 정합성 깨짐 → 환불 또는 수동 grant 필요. */
  | "refund_needed"
  /** 결제 성공·subscriptions update 실패 (다음 cron 에서 이중 청구 위험). */
  | "sub_update_failed"
  /** 결제 성공·portone_orders insert/update 실패 (장부 누락). */
  | "orders_missing"
  /** PG deleteCustomerUid 실패로 expired 마킹된 좀비 빌링키 누적. */
  | "zombie_billing_key"
  /** billing_key_issue_intents 가 'pg_checking' 상태로 24h 이상 stuck (sweep 회복 실패). */
  | "intent_stuck_pg_checking";

export type BillingIncidentSeverity = "critical" | "high" | "medium";

export type BillingIncidentContext = {
  type: BillingIncidentType;
  severity: BillingIncidentSeverity;
  [key: string]: unknown;
};

/**
 * 결제 정합성 critical 이벤트 알람.
 * 운영자가 즉시 인지하고 수동 개입해야 하는 케이스에만 사용한다.
 *
 * 현재는 console.error 전용 — Vercel / 호스팅 플랫폼 로그에서 prefix grep 으로 확인.
 * 알람 채널이 도입되면 본 함수 내부만 교체한다.
 */
export function captureBillingIncident(
  message: string,
  context: BillingIncidentContext,
): void {
  console.error(
    `[BILLING-INCIDENT][${context.severity}][${context.type}] ${message}`,
    context,
  );
}

/**
 * 일반 에러 캡쳐 — 결제 외 영역에도 사용 가능.
 * 현재는 console.error 전용. 시그니처 유지.
 */
export function captureError(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (context) {
    console.error("[ERROR]", err, context);
  } else {
    console.error("[ERROR]", err);
  }
}
