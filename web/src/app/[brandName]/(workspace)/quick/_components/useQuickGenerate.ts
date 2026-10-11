"use client";

// 퀵 페이지의 "생성/폴링/다운로드" 오케스트레이션 훅.
//
// 핵심 설계 결정:
//
// 1) mood/model 은 동시 제출, IPM 리미터(20/분)로 속도 조절, cutout 은 동시 2개 풀.
//    - mood/model 은 서버 job 큐가 처리하므로 클라가 동시에 POST 해도 안전.
//      SlidingWindowIPMLimiter 가 GPT Image 2 20 IPM 한도를 클라이언트에서 사전 제어.
//    - cutout 은 클라이언트에서 캔버스/AI 호출을 직접 수행 — 동시 2개로 처리량
//      2배, 무제한 병렬 대비 CPU/메모리 안전.
//
// 2) 폴링은 itemsRef + generatingJobIds 안정 키로 stale closure 회피.
//    - useEffect 의존성을 items 자체로 두면 매 폴링마다 setItems 가 호출되어
//      interval 이 매번 재생성되는 무한 thrash 가 발생한다.
//    - 대신 "현재 generating 중인 jobId 들의 정렬·콤마 조인 문자열" 을 의존성으로
//      삼아, 실제로 polling 대상 집합이 바뀔 때만 interval 을 재설정한다.
//    - interval 콜백은 itemsRef.current 를 통해 *최신* items 를 읽어 polling 한다.
//
// 3) cutout 은 "epoch capture" 대신 "id 존재 확인" 패턴으로 stale write 차단.
//    - 한 항목의 처리 시작 시점에 그 id 가 itemsRef 에 있는지 확인 후 updateItem.
//    - 처리 중 사용자가 그 항목을 삭제하면 updateItem 은 setItems 매핑에서 자연스럽게
//      no-op 이 되지만, 이전 ObjectURL 등 사이드이펙트는 명시적으로 정리해야 한다.
//
// 4) terminal state (succeeded/failed) 인 항목은 다시 polling 하지 않는다.
//    - generatingJobIds 계산 시 status === "generating" 만 포함하므로 자동으로 제외.
//
// 5) bulk download 는 JSZip 동적 import — 초기 번들 크기를 늘리지 않는다.

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  autoCropToProduct,
  autoCropTransparent,
  loadImageEntry,
  removeWhiteBackground,
  renderBundleThumbnail,
} from "@/lib/thumbnailCanvas";
import {
  isPackOrDailyLimitError,
  type PackErrorCode,
} from "@/lib/packs/createJobErrors";
import type { QuickItem } from "./types";

// OpenAI GPT Image 2 티어별 분당 이미지 생성 한도 (IPM).
// 티어 변경 시 CURRENT_OPENAI_TIER 값만 수정한다.
const OPENAI_TIER_IPM: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 5,
  2: 20,
  3: 50,
  4: 100,
  5: 250,
};
const CURRENT_OPENAI_TIER: 1 | 2 | 3 | 4 | 5 = 1;
const MOOD_MODEL_IPM = OPENAI_TIER_IPM[CURRENT_OPENAI_TIER];

const CUTOUT_CONCURRENCY = 2;
const MAX_SUBMIT_RETRIES = 3;

class SlidingWindowIPMLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
      if (this.timestamps.length < this.limit) {
        this.timestamps.push(now);
        return;
      }
      const waitMs = this.windowMs - (now - this.timestamps[0]) + 50;
      await new Promise<void>((r) => setTimeout(r, waitMs));
    }
  }
}

const ipmLimiter = new SlidingWindowIPMLimiter(MOOD_MODEL_IPM, 60_000);

// 누끼컷 수량 한도 — 타입/UI 와 동기화된 상수. types.ts 에 두지 않은 이유는
// 실행 시점 기본값 검증에만 쓰이고, UI 레이어가 이미 input min/max 로 제한하기 때문.
const MIN_CUTOUT_COUNT = 1;
const MAX_CUTOUT_COUNT = 30;

// Vercel body limit 안전 마진. 이 값을 넘으면 client-side 압축으로 4MB 이하 JPEG 으로
// 다운샘플 후 업로드.
const API_MAX_BYTES = 4 * 1024 * 1024;

interface JobPollResult {
  job: {
    id: string;
    status: "queued" | "processing" | "succeeded" | "failed";
    progress: number;
    error: string | null;
    result: {
      type?: string;
      result_key?: string;
      asset_id?: string;
      [key: string]: unknown;
    } | null;
  };
  renderResultUrl: string | null;
}

// useFetchWithAuth 의 정확한 시그니처에 맞춘다 — input 은 string, init 은 RequestInit.
// strictFunctionTypes 하에서 매개변수 contravariance 때문에 더 넓은 타입을
// 받으면 호출 측에서 호환성 오류가 날 수 있다.
type FetchWithAuth = (input: string, init?: RequestInit) => Promise<Response>;

// PackErrorCode 는 @/lib/packs/createJobErrors 의 공용 정의를 사용한다.
// 외부에서 useQuickGenerate 모듈을 통해 import 하던 경우를 위해 re-export 유지.
export type { PackErrorCode };

interface UseQuickGenerateArgs {
  items: QuickItem[];
  updateItem: (id: string, patch: Partial<QuickItem>) => void;
  brandId: string | null;
  fetchWithAuth: FetchWithAuth;
  /**
   * 한도 부족·결제 필요 응답을 받았을 때 호출되는 콜백. 호출자가 모달을 띄우고
   * 결제·업그레이드 흐름으로 사용자를 유도하도록 한다.
   *
   * 동일 일괄 생성 안에서 여러 항목이 같은 에러를 받을 수 있으므로 첫 호출에서만
   * 모달을 띄우고 이후 호출은 무시하는 책임은 호출자에게 있다 (state 가드).
   */
  onPackLimit?: (code: PackErrorCode) => void;
}

// ── 공용 헬퍼: 4MB 초과 이미지 다운샘플 압축 ────────────────────────────────
//
// 기존 page.tsx 에 인라인 정의돼 있던 함수와 동일 로직. mood/model 은 FormData 로
// 원본을 보내므로 4MB 초과 시 413 이 발생하기 쉬워 사전 압축이 필요하다.
async function compressImageForUpload(file: File): Promise<File> {
  if (file.size <= API_MAX_BYTES) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 2048;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const tryQuality = (q: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            if (blob.size <= API_MAX_BYTES) {
              resolve(
                new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
                  type: "image/jpeg",
                }),
              );
            } else if (q <= 0.4) {
              resolve(file);
            } else {
              tryQuality(Math.round((q - 0.1) * 10) / 10);
            }
          },
          "image/jpeg",
          q,
        );
      };
      tryQuality(0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

// ── 공용 헬퍼: cutout 파이프라인 ─────────────────────────────────────────
//
// 기존 page.tsx 에 인라인 정의돼 있던 단계를 그대로 옮김.
// 1) Gemini AI 변환 (서버) → base64
// 2) 제품 영역 크롭
// 3) 흰 배경 투명화 + 타이트 크롭
// 4) 묶음 썸네일 렌더 (PNG Blob)
async function runCutoutPipeline(
  file: File,
  qty: number,
  fetchWithAuth: FetchWithAuth,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  // 단계별 가짜 진행률 — server progress 가 없는 클라 파이프라인이라 사용자 인지용.
  onProgress?.(10);
  const compressed = await compressImageForUpload(file);
  const formData = new FormData();
  formData.append("file", compressed);
  const res = await fetchWithAuth("/api/thumbnail/single", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  const { imageBase64 } = (await res.json()) as { imageBase64: string };
  onProgress?.(40);

  const cropped = await autoCropToProduct(imageBase64);
  onProgress?.(60);

  const transparent = await removeWhiteBackground(cropped);
  const productBase64 = await autoCropTransparent(transparent);
  onProgress?.(80);

  const entry = await loadImageEntry(`data:image/png;base64,${productBase64}`);
  const safeQty = Math.min(MAX_CUTOUT_COUNT, Math.max(MIN_CUTOUT_COUNT, qty));
  const entries = Array.from({ length: safeQty }, () => entry);
  const blob = await renderBundleThumbnail(entries);
  onProgress?.(95);
  return blob;
}

// ── 파일명 helpers ────────────────────────────────────────────────────────

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function safeFileName(name: string): string {
  return stripExt(name).replace(/[\\/:*?"<>|]/g, "_");
}

// ── 메인 훅 ───────────────────────────────────────────────────────────────

export function useQuickGenerate({
  items,
  updateItem,
  brandId,
  fetchWithAuth,
  onPackLimit,
}: UseQuickGenerateArgs) {
  // 폴링 콜백이 *최신* items 를 참조할 수 있도록 ref 동기화.
  const itemsRef = useRef<QuickItem[]>(items);
  itemsRef.current = items;

  // updateItem/fetchWithAuth 도 ref 로 안정화 — interval 콜백 안에서 쓰는데, 함수
  // 정체성이 바뀌어도 interval 을 재설정하지 않도록 한다.
  const updateItemRef = useRef(updateItem);
  updateItemRef.current = updateItem;
  const fetchWithAuthRef = useRef(fetchWithAuth);
  fetchWithAuthRef.current = fetchWithAuth;
  // onPackLimit 도 ref 안정화 — submit 콜백 안에서 호출.
  const onPackLimitRef = useRef(onPackLimit);
  onPackLimitRef.current = onPackLimit;

  // ── server job 제출 (mood/model 공용) ────────────────────────────────
  const submitServerJob = useCallback(
    async (item: QuickItem) => {
      if (!brandId) {
        updateItemRef.current(item.id, {
          status: "failed",
          error: "브랜드를 찾을 수 없습니다.",
        });
        return;
      }
      if (item.format !== "mood" && item.format !== "model") return;

      updateItemRef.current(item.id, {
        status: "generating",
        progress: 0,
        error: null,
        jobId: null,
        resultUrl: null,
        resultAssetId: null,
        resultFormat: null,
      });

      try {
        // 큰 이미지를 그대로 보내면 Vercel body limit 에 걸리므로 사전 압축.
        const compressed = await compressImageForUpload(item.file);

        // IPM 슬롯 확보 — 60초 윈도우 안에 20개 초과 시 대기.
        await ipmLimiter.acquire();

        // 429 에서 지수 백오프 재시도 (최대 MAX_SUBMIT_RETRIES 회).
        // 단, DAILY_LIMIT 코드는 재시도 무의미 — 즉시 break 한다.
        //
        // body 읽기 일관성: 매 응답마다 res.clone().json() 으로 본문을 추출해
        // lastBody 에 저장한다. 원본 res.body 는 절대 consume 하지 않으므로
        // 후속 코드에서 body 가 이미 읽혔는지 걱정할 필요 없음.
        let res!: Response;
        let lastBody: { error?: string; code?: string } = {};
        for (let attempt = 0; attempt <= MAX_SUBMIT_RETRIES; attempt++) {
          if (attempt > 0) {
            await new Promise<void>((r) =>
              setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)),
            );
          }
          const fd = new FormData();
          fd.append(
            "pipeline",
            item.format === "model"
              ? "render_quick_model"
              : "render_quick_mood",
          );
          fd.append("object_image", compressed);
          fd.append("brand_id", brandId);
          if (item.format === "model") fd.append("gender", item.gender);
          res = await fetchWithAuthRef.current("/api/render/create-job", {
            method: "POST",
            body: fd,
          });
          // 본문 미리 추출 (clone 사용 — 원본 res.body 미소비)
          lastBody = (await res
            .clone()
            .json()
            .catch(() => ({}))) as { error?: string; code?: string };
          if (res.status !== 429) break;
          if (lastBody.code === "DAILY_LIMIT") break;
        }
        if (!res.ok) {
          const errBody = lastBody;
          const packCode = isPackOrDailyLimitError(res.status, errBody);
          if (packCode) {
            // 호출자에게 모달 트리거를 위임. 항목 자체는 failed 로 표시하되
            // 사용자가 결제·업그레이드 후 자동 재시도할 수 있도록 한다.
            onPackLimitRef.current?.(packCode);
            updateItemRef.current(item.id, {
              status: "failed",
              error:
                packCode === "INSUFFICIENT_PACK"
                  ? "이미지가 부족합니다."
                  : "오늘의 한도에 도달했습니다.",
            });
            return;
          }
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }
        const { jobId } = (await res.json()) as { jobId: string };
        updateItemRef.current(item.id, { jobId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "잡 생성 실패";
        updateItemRef.current(item.id, {
          status: "failed",
          error: msg,
        });
      }
    },
    [brandId],
  );

  // ── cutout 클라이언트 파이프라인 ────────────────────────────────────
  const runCutoutForItem = useCallback(async (item: QuickItem) => {
    updateItemRef.current(item.id, {
      status: "generating",
      progress: 0,
      error: null,
      cutoutResultBlob: null,
      cutoutResultUrl: null,
    });

    // 시작 시점의 id 캡처 — 처리 중 항목이 삭제되면 itemsRef 에 더 이상 존재하지
    // 않으므로 결과 적용을 건너뛴다 (stale write 차단).
    const id = item.id;
    try {
      const blob = await runCutoutPipeline(
        item.file,
        item.count,
        fetchWithAuthRef.current,
        (p) => {
          if (itemsRef.current.some((it) => it.id === id)) {
            updateItemRef.current(id, { progress: p });
          }
        },
      );
      const jpgBlob = await new Promise<Blob>((resolve) => {
        const img = new Image();
        const pngUrl = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(pngUrl);
          const cv = document.createElement("canvas");
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          cv.getContext("2d")!.drawImage(img, 0, 0);
          cv.toBlob((b) => resolve(b ?? blob), "image/jpeg", 0.92);
        };
        img.onerror = () => {
          URL.revokeObjectURL(pngUrl);
          resolve(blob);
        };
        img.src = pngUrl;
      });
      if (!itemsRef.current.some((it) => it.id === id)) {
        return;
      }
      const url = URL.createObjectURL(jpgBlob);
      updateItemRef.current(id, {
        status: "succeeded",
        progress: 100,
        cutoutResultBlob: jpgBlob,
        cutoutResultUrl: url,
        resultFormat: "cutout",
      });
    } catch (err) {
      if (!itemsRef.current.some((it) => it.id === id)) return;
      const msg = err instanceof Error ? err.message : "누끼 처리 실패";
      updateItemRef.current(id, { status: "failed", error: msg });
    }
  }, []);

  // ── 일괄 생성 진입점 ──────────────────────────────────────────────
  const generateSelected = useCallback(
    async (selectedIds: Set<string>) => {
      if (selectedIds.size === 0) return;
      const targets = itemsRef.current.filter((i) => selectedIds.has(i.id));

      // 그룹별로 분리 — mood/model 은 동시, cutout 은 최대 2개 동시 풀.
      const serverTargets = targets.filter(
        (i) => i.format === "mood" || i.format === "model",
      );
      const cutoutTargets = targets.filter((i) => i.format === "cutout");

      // 1) server job 동시 제출. allSettled 로 일부 실패가 다른 항목을 막지 않게 한다.
      const serverPromises = serverTargets.map((it) => submitServerJob(it));

      // 2) cutout 동시 2개 풀 — 순차 대비 2배 처리량, CPU/메모리 안전 범위.
      const cutoutPromise = (async () => {
        const running = new Set<Promise<void>>();
        for (const it of cutoutTargets) {
          if (!itemsRef.current.some((cur) => cur.id === it.id)) continue;
          if (running.size >= CUTOUT_CONCURRENCY) {
            await Promise.race(running);
          }
          // eslint-disable-next-line no-loop-func
          const p: Promise<void> = runCutoutForItem(it).finally(() =>
            running.delete(p),
          );
          running.add(p);
        }
        await Promise.allSettled(Array.from(running));
      })();

      await Promise.allSettled([...serverPromises, cutoutPromise]);
    },
    [submitServerJob, runCutoutForItem],
  );

  // ── 폴링 (mood/model server job) ──────────────────────────────────
  // generatingJobIds: 실제로 polling 해야 하는 job 의 안정 키. 정렬·콤마 조인으로
  // 같은 집합이면 같은 문자열이 되어 useEffect 가 재실행되지 않는다.
  const generatingJobIds = useMemo(
    () =>
      items
        .filter((i) => i.status === "generating" && i.jobId)
        .map((i) => i.jobId as string)
        .sort()
        .join(","),
    [items],
  );

  useEffect(() => {
    if (!generatingJobIds) return;

    const pollOne = async (itemId: string, jobId: string) => {
      try {
        const res = await fetchWithAuthRef.current(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = (await res.json()) as JobPollResult;
        const { job, renderResultUrl } = data;

        // 항목이 사용자에 의해 삭제됐을 수도 있으므로 항상 "id 존재 확인" 후 update.
        if (!itemsRef.current.some((it) => it.id === itemId)) return;

        if (job.status === "succeeded") {
          const assetId =
            typeof job.result?.asset_id === "string"
              ? job.result.asset_id
              : null;
          const curItem = itemsRef.current.find((it) => it.id === itemId);
          updateItemRef.current(itemId, {
            status: "succeeded",
            progress: 100,
            resultUrl: renderResultUrl,
            resultAssetId: assetId,
            resultFormat: curItem?.format ?? null,
          });
        } else if (job.status === "failed") {
          updateItemRef.current(itemId, {
            status: "failed",
            error: job.error ?? "생성에 실패했습니다.",
          });
        } else {
          // queued/processing — 진행률만 갱신.
          updateItemRef.current(itemId, { progress: job.progress ?? 0 });
        }
      } catch {
        // 일시적 네트워크 오류는 다음 tick 에서 재시도. silent fail.
      }
    };

    const id = setInterval(() => {
      const inflight = itemsRef.current.filter(
        (i) => i.status === "generating" && i.jobId,
      );
      // 브라우저 연결 한도(호스트당 6개) 초과 방지
      const batch = inflight.slice(0, 6);
      for (const it of batch) pollOne(it.id, it.jobId as string);
    }, 2000);

    return () => clearInterval(id);
  }, [generatingJobIds]);

  // ── 단일 다운로드 ────────────────────────────────────────────────
  const downloadSingle = useCallback(async (item: QuickItem) => {
    if (item.status !== "succeeded") return;
    const baseName = safeFileName(item.file.name);

    if (item.format === "cutout") {
      const url =
        item.cutoutResultUrl ??
        (item.cutoutResultBlob
          ? URL.createObjectURL(item.cutoutResultBlob)
          : null);
      if (!url) return;
      const shouldRevoke = !item.cutoutResultUrl && !!item.cutoutResultBlob;
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}_cutout.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (shouldRevoke) setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }

    // mood/model: 서버 프록시 경유 다운로드 — R2 CDN URL 은 브라우저 CORS 차단 대상이므로
    // 서버에서 R2 를 직접 읽어 클라이언트에 스트리밍하는 /api/render/download 를 사용한다.
    if (!item.jobId) return;
    try {
      const res = await fetchWithAuthRef.current(
        `/api/render/download?jobId=${item.jobId}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}_${item.format ?? "result"}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch {
      // 다운로드 실패는 silent — 사용자는 화면에서 우클릭/링크로 대체 가능.
    }
  }, []);

  // ── 일괄 ZIP 다운로드 ────────────────────────────────────────────
  const bulkDownload = useCallback(async (allItems: QuickItem[]) => {
    const done = allItems.filter(
      (i) => i.status === "succeeded" && i.format === i.resultFormat,
    );
    if (done.length === 0) return;

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    // 같은 파일명이 충돌하지 않도록 카운터 부여.
    const used = new Set<string>();
    const claimName = (base: string) => {
      let name = base;
      let n = 1;
      while (used.has(name)) {
        n += 1;
        // 확장자 분리 후 카운터 삽입.
        const dot = base.lastIndexOf(".");
        if (dot < 0) name = `${base}_${n}`;
        else name = `${base.slice(0, dot)}_${n}${base.slice(dot)}`;
      }
      used.add(name);
      return name;
    };

    for (const it of done) {
      const baseName = safeFileName(it.file.name);
      if (it.format === "cutout" && it.cutoutResultBlob) {
        zip.file(claimName(`${baseName}_cutout.jpg`), it.cutoutResultBlob);
      } else if ((it.format === "mood" || it.format === "model") && it.jobId) {
        try {
          const res = await fetchWithAuthRef.current(
            `/api/render/download?jobId=${it.jobId}`,
          );
          if (!res.ok) continue;
          const blob = await res.blob();
          zip.file(claimName(`${baseName}_${it.format}.jpg`), blob);
        } catch {
          // 한 항목 실패는 전체 ZIP 을 막지 않는다.
        }
      }
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `quick_export_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }, []);

  const isGenerating = items.some((i) => i.status === "generating");

  return {
    generateSelected,
    bulkDownload,
    downloadSingle,
    isGenerating,
  };
}
