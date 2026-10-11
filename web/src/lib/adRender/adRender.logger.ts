/**
 * adRender.logger.ts — Structured logging for ad sequence render pipeline.
 *
 * 설계 원칙:
 *   - 모든 로그는 JSON 구조체로 console.log 출력 (클라우드 로그 수집 가능)
 *   - logSink를 통해 외부 DB / 모니터링으로 drain 가능
 *   - 로거 자체는 절대 throw 하지 않음 (fire-and-forget)
 *
 * 이벤트 타입:
 *   ad.seq.started          — sequence job 생성 직후
 *   ad.seq.asset_applied    — reusable asset 적용 완료 (asset당 1회)
 *   ad.seq.validation_warn  — sequence validation warning 발생
 *   ad.seq.scene_complete   — 개별 scene 렌더 완료
 *   ad.seq.overflow_warn    — 텍스트/product 오버플로우 감지
 *   ad.seq.ending_fail      — ending composition 실패
 *   ad.seq.complete         — 전체 sequence 완료
 *   ad.seq.failed           — sequence 실패
 */

// ─── Event types ──────────────────────────────────────────────────────────────

export type AdLogEventType =
  | "ad.seq.started"
  | "ad.seq.asset_applied"
  | "ad.seq.validation_warn"
  | "ad.seq.scene_complete"
  | "ad.seq.overflow_warn"
  | "ad.seq.ending_fail"
  | "ad.seq.complete"
  | "ad.seq.failed";

export interface AdLogEvent {
  event: AdLogEventType;
  adJobId: string;
  ts: string;
  payload: Record<string, unknown>;
}

// ─── Sink interface ────────────────────────────────────────────────────────────

/** 외부 drain 함수. supabase insert나 외부 수집기로 연결 가능. */
export type AdLogSink = (event: AdLogEvent) => void | Promise<void>;

let _sink: AdLogSink | null = null;

/** 전역 sink 등록. 앱 init 시 한 번 호출. */
export function setAdLogSink(sink: AdLogSink): void {
  _sink = sink;
}

// ─── Core emit ────────────────────────────────────────────────────────────────

function emit(event: AdLogEventType, adJobId: string, payload: Record<string, unknown>): void {
  const entry: AdLogEvent = { event, adJobId, ts: new Date().toISOString(), payload };

  // 1) 구조화된 console 출력
  console.log(JSON.stringify(entry));

  // 2) 비동기 sink (실패해도 무시)
  if (_sink) {
    try {
      const result = _sink(entry);
      if (result instanceof Promise) {
        result.catch((e) => {
          console.warn(JSON.stringify({ action: "adLogSink_error", adJobId, error: String(e) }));
        });
      }
    } catch (e) {
      console.warn(JSON.stringify({ action: "adLogSink_error", adJobId, error: String(e) }));
    }
  }
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/** sequence job 생성 완료 */
export function logSeqStarted(adJobId: string, opts: {
  brandId?: string;
  sceneCount: number;
  appliedAssetCount: number;
  policyName?: string;
  campaignSequenceId?: string | null;
}): void {
  emit("ad.seq.started", adJobId, opts);
}

/** reusable asset 적용 완료 (asset당 1회) */
export function logAssetApplied(adJobId: string, opts: {
  assetId: string;
  assetType: string;
  applyScope: "sequence" | "scene";
  sceneId?: string | null;
  reusedCount: number;
}): void {
  emit("ad.seq.asset_applied", adJobId, opts);
}

/** sequence validation warning (SEQ_NO_ENDING 등) */
export function logValidationWarn(adJobId: string, warnings: string[]): void {
  emit("ad.seq.validation_warn", adJobId, { warnings });
}

/** 개별 scene 렌더 완료 */
export function logSceneComplete(adJobId: string, opts: {
  sceneId: string;
  order: number;
  templateCode: string;
  category: string;
  durationSec: number;
  renderDurationMs: number;
  overallPassed: boolean;
}): void {
  emit("ad.seq.scene_complete", adJobId, opts);
}

/** 텍스트/product 오버플로우 감지 */
export function logOverflowWarn(adJobId: string, opts: {
  sceneId: string;
  templateCode: string;
  overflowSlots?: string[];
  overflowZones?: string[];
}): void {
  emit("ad.seq.overflow_warn", adJobId, opts);
}

/** ending composition 실패 */
export function logEndingFail(adJobId: string, opts: {
  sceneId: string;
  reason: string;
  isOptional: boolean;
}): void {
  emit("ad.seq.ending_fail", adJobId, opts);
}

/** 전체 sequence 완료 */
export function logSeqComplete(adJobId: string, opts: {
  totalDurationSec: number;
  sceneCount: number;
  renderDurationMs: number;
  appliedAssetCount: number;
  warningCount: number;
  finalAdVideoUrl?: string;
}): void {
  emit("ad.seq.complete", adJobId, opts);
}

/** sequence 실패 */
export function logSeqFailed(adJobId: string, opts: {
  reason: string;
  stage?: string;
  failedSceneId?: string;
}): void {
  emit("ad.seq.failed", adJobId, opts);
}
