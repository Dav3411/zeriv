"use client";

/**
 * Quick 모드(게스트/워크스페이스 공용) 이미지 인테이크 헬퍼.
 *
 * 책임:
 *   1. 입력 File 들을 순차로 WebP 1600/0.85 변환 (병렬 X — 모바일 메모리 보호)
 *   2. 변환 실패한 파일을 별도 배열로 모아 호출자가 토스트할 수 있게 반환
 *   3. 게스트 + localStorage fallback 환경(시크릿 모드 등) 한정으로
 *      "기존 변환본 합산 + 새 변환본"이 5MB 초과하면 그 시점부터 거절
 *   4. 통과한 파일만 호출자(state setter)에게 전달
 *
 * 워크스페이스(또는 게스트라도 IndexedDB driver)에서는 3) 가드 자동 생략.
 *
 * 디자인 결정:
 *   - 비-React 모듈: 양쪽 진입점(page.tsx, ItemListPanel)에서 일관되게 호출하기 위함.
 *   - 순차 처리: createImageBitmap + OffscreenCanvas 가 모바일에서 동시 1장만으로도
 *     꽤 메모리를 쓴다. 병렬화하면 iOS Safari 가 throw 하는 케이스가 늘어난다.
 *   - 합산 byte 가드는 "현재 큐에 이미 있는 이미지들" 의 size 합산 + 새 변환본의 size 로
 *     누적 검사. 큐 size 의 출처는 호출자가 넘긴 `existingTotalBytes` 또는 `existingFiles` 둘 중 하나.
 *   - 5MB 가드는 `quickGuestState.saveQuickGuestState` 의 최종 저장 시점 가드와 동일한 임계값을
 *     사전 점검할 뿐. 최종 저장 시 다시 검증되므로 이 헬퍼는 single source of truth 가 아니다.
 *     (저장 시점은 변환본 + structured clone overhead 까지 포함하므로 더 보수적일 수 있음.)
 */

import { compressImage } from "./imageCompress";
import { getGuestFallbackLimit, MAX_IMAGES_QUICK } from "./quickGuestState";

export type IntakeRejectReason =
  /** compressImage 가 throw — 디코딩 실패, mime 미지원, 인코더 부재 등. */
  | "compress_failed"
  /** 게스트 fallback 환경의 합산 5MB 한도 초과로 거절. */
  | "fallback_quota"
  /** 30장 상한 초과로 거절 — 게스트/워크스페이스 공용. */
  | "too_many";

export interface IntakeRejected {
  file: File;
  reason: IntakeRejectReason;
}

export interface IntakeResult {
  /** 큐에 추가해도 좋은 변환된 File 들 (mime: image/webp). */
  added: File[];
  /** 거절된 파일과 사유. 호출자가 사유별로 토스트 메시지를 분기한다. */
  rejected: IntakeRejected[];
}

export interface IntakeOptions {
  /**
   * 게스트 모드 여부.
   * - true: getGuestFallbackLimit() 으로 driver 확인 후 fallback 환경에 한해 5MB 가드 적용.
   * - false: 가드 생략 (워크스페이스).
   */
  isGuest: boolean;
  /**
   * 이미 큐에 있는 파일들의 합산 바이트.
   * - existingFiles 와 둘 중 하나만 전달하면 된다 (둘 다 주면 existingFiles 가 우선).
   * - 게스트가 아닐 때는 무시된다.
   */
  existingTotalBytes?: number;
  /**
   * 이미 큐에 있는 파일들. 헬퍼가 size 합산을 직접 계산.
   * - existingTotalBytes 보다 우선.
   * - 게스트가 아닐 때는 무시된다.
   */
  existingFiles?: readonly File[];
}

/**
 * 입력 파일들을 차례로 압축하고, 게스트 + fallback 환경에서는 누적 합산 가드를 적용한다.
 *
 * 반환:
 *   - added: 큐에 추가해도 좋은 변환본들.
 *   - rejected: 변환 실패(compress_failed) 또는 fallback 합산 초과(fallback_quota) 파일들.
 *     호출자가 reason 별로 사용자 메시지를 분기한다.
 *
 * 호출 예 (게스트):
 *   const { added, rejected } = await addImagesWithCompressionAndGuard(files, {
 *     isGuest: true,
 *     existingFiles: items.map(i => i.file),
 *   });
 *   if (added.length) onAddFiles(added);
 *   for (const r of rejected) toast(...);
 */
export async function addImagesWithCompressionAndGuard(
  files: readonly File[],
  opts: IntakeOptions,
): Promise<IntakeResult> {
  const added: File[] = [];
  const rejected: IntakeRejected[] = [];

  if (!files || files.length === 0) {
    return { added, rejected };
  }

  // 장 수 한도 — 게스트/워크스페이스 공용.
  // 압축 전에 먼저 검사해 압축 시간 절약.
  // 장 수 가드 정확성을 위해 호출자는 opts.existingFiles 를 반드시 넘겨야 함.
  // existingTotalBytes 만 넘기는 호출은 장 수 제한을 약하게 만들 수 있음 (현재 호출 사이트는 모두 existingFiles 동봉).
  const existingCount = opts.existingFiles ? opts.existingFiles.length : 0;

  // 게스트 + fallback 환경일 때만 합산 가드 활성화.
  // driver 확인은 한 번만 — 이후 누적 검사에 재사용.
  let fallbackLimitBytes: number | null = null;
  let runningTotal = 0;
  if (opts.isGuest) {
    fallbackLimitBytes = await getGuestFallbackLimit();
    if (fallbackLimitBytes !== null) {
      if (opts.existingFiles && opts.existingFiles.length > 0) {
        runningTotal = opts.existingFiles.reduce((sum, f) => sum + f.size, 0);
      } else if (typeof opts.existingTotalBytes === "number") {
        runningTotal = Math.max(0, opts.existingTotalBytes);
      }
    }
  }

  for (let index = 0; index < files.length; index++) {
    const original = files[index];

    // 30장 한도 가드 — 압축 루프 진입 직전에 검사.
    // existingCount + 지금까지 추가된 수(added.length) 가 한도에 달했으면 이후 전부 거절.
    if (existingCount + added.length >= MAX_IMAGES_QUICK) {
      rejected.push({ file: original, reason: "too_many" });
      continue;
    }

    let converted: File;
    try {
      converted = await compressImage(original);
    } catch {
      rejected.push({
        file: original,
        reason: "compress_failed",
      });
      continue;
    }

    if (fallbackLimitBytes !== null) {
      // 한도 초과 파일은 runningTotal 에 반영하지 않고 skip — 뒤이은 작은 파일이 한도 안에서
      // 여전히 통과될 수 있도록 의도. 사용자가 한 번에 다양한 크기의 파일을 드롭해도
      // 가능한 만큼 최대로 받아주는 정책. 최종 저장 시점에 saveQuickGuestState 가 이중 검증.
      if (runningTotal + converted.size > fallbackLimitBytes) {
        rejected.push({ file: original, reason: "fallback_quota" });
        continue;
      }
      runningTotal += converted.size;
    }

    added.push(converted);
  }

  return { added, rejected };
}
