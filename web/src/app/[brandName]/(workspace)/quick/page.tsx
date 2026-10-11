"use client";

// 퀵 썸네일 페이지 — 게스트/워크스페이스 단일 컴포넌트.
//
// 라우팅 진입점은 동일하며 useBrand().isGuest 로 동작이 분기된다:
//   - 인증 사용자(`/{brandId}/quick`)        → 서버 잡 생성 + 폴링 + 다운로드
//   - 비로그인 게스트(`/guest/quick`)        → 가입 게이트 (saveQuickGuestState → /signup)
//
// 셸/레이아웃은 분리 유지된다. `[brandName]/layout.tsx` 의 GuestWorkspaceLayoutWrapper
// 가 게스트 모드에서 GuestSiteHeader + 베이지 glow 배경을 렌더하고, 워크스페이스 모드는
// 일반 SiteHeader + 사이드바를 렌더한다. 본 컴포넌트는 페이지 *본문* 만 책임진다.
//
// 통합 가능했던 이유: 두 모드가 헤더/드래그/2컬럼 레이아웃/모바일 시트를 거의 동일하게
// 가졌고, "다른 컴포넌트로 일찍 return" 패턴 대신 "모든 훅을 동일 순서로 호출하되
// isGuest 분기는 핸들러/렌더 내부에 두는" 패턴이 더 단순해서다.
//
// React Hook rules 준수: 모든 훅(useBrand, useFetchWithAuth, useRouter, ...,
// useQuickItems, useQuickGenerate, useState, useEffect, ...)은 isGuest 와 무관하게
// 항상 같은 순서·같은 횟수로 호출된다. 게스트가 useQuickGenerate 의 결과(generateSelected
// 등)를 호출하지 않도록 핸들러에서 isGuest 분기를 최우선으로 처리한다.
//
// 보존된 워크스페이스 비즈니스 로직:
//  - useBrand / useFetchWithAuth: 인증 + 브랜드 컨텍스트
//  - readAndConsumeQuickGuestState: 비로그인 → 가입 후 자동 복원
//    (v3 스키마: 최대 3장 이미지 + 행별 format/count/gender 가 복원됨)
//    게스트 모드에서는 이 effect 가 동작하지 않는다 (최상단 isGuest 가드).

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useBrand } from "@/components/BrandProvider";
import { useAuth } from "@/components/AuthProvider";
import { useFetchWithAuth } from "@/hooks/useFetchWithAuth";
import {
  quickGuestStateToFile,
  readAndConsumeQuickGuestState,
  saveQuickGuestState,
  type QuickGuestFormat,
  type SaveQuickGuestStateResult,
} from "@/lib/quickGuestState";
import { addImagesWithCompressionAndGuard } from "@/lib/quickImageIntake";
import type { QuickItem } from "./_components/types";
import { InsufficientPackModal } from "@/components/packs/InsufficientPackModal";
import { PackPurchaseModal } from "@/components/packs/PackPurchaseModal";
import { clearPackBalanceCache } from "@/components/packs/PackBalance";
import type { PackErrorCode } from "@/lib/packs/createJobErrors";
import { useQuickItems } from "./_components/useQuickItems";
import { useQuickGenerate } from "./_components/useQuickGenerate";
import ItemListPanel from "./_components/ItemListPanel";
import ItemDetailPanel from "./_components/ItemDetailPanel";
import BulkActionBar from "./_components/BulkActionBar";
import MobileDetailSheet from "./_components/MobileDetailSheet";
import { GuestFooter } from "@/components/GuestFooter";

/** 게스트 saveQuickGuestState 실패 코드 → 사용자 메시지 매핑. */
function formatGuestSaveError(
  reason: Extract<SaveQuickGuestStateResult, { ok: false }>["reason"],
): string {
  switch (reason) {
    case "unsupported_mime":
      return "JPG, PNG, WEBP 만 지원합니다.";
    case "encode_failed":
      return "이미지를 처리하지 못했습니다. 다른 파일로 시도해 주세요.";
    case "quota_exceeded":
      return "브라우저 저장 공간이 부족합니다. 더 작은 이미지로 시도해 주세요.";
    case "no_images":
      return "이미지를 업로드해주세요.";
    case "too_many":
      return "이미지는 최대 30장까지 추가할 수 있어요.";
    case "too_large_fallback":
      return "시크릿/프라이빗 브라우징에서는 합산 5MB까지만 업로드할 수 있어요. 일반 브라우징 창에서 시도하시거나 더 작은 이미지를 사용해 주세요.";
    default:
      return "알 수 없는 오류가 발생했습니다.";
  }
}

export default function QuickPage() {
  // ── 컨텍스트 ─────────────────────────────────────────────────────────
  // isGuest 는 BrandProvider 가 brandName === "guest" 일 때 true. 게스트 모드에서는
  // 더미 brand 객체와 GUEST_BRAND_SLUG 문자열 brandId 가 즉시 주입된다.
  const { brand, brandId, loading: brandLoading, isGuest } = useBrand();
  // user 는 Pack 결제 모달(PackPurchaseModal)의 buyer 정보로만 사용된다.
  // 게스트 모드에서는 user 가 null 이지만 게스트 경로는 결제 모달을 열지 않으므로 안전.
  const { user } = useAuth();
  const { fetchWithAuth } = useFetchWithAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── items 훅 ─────────────────────────────────────────────────────────
  // Quick 모드(게스트/워크스페이스 공통) 장 수 한도: MAX_IMAGES_QUICK = 30.
  // 시크릿 모드(localStorage fallback)에서는 합산 5MB 가드도 추가 적용.
  const {
    items,
    selectedIds,
    addFiles,
    removeItem,
    updateItem,
    toggleSelect,
    selectAll,
    deselectAll,
    detailItemId,
    setDetailItemId,
  } = useQuickItems();

  // ── 생성 훅 ─────────────────────────────────────────────────────────
  // 게스트도 호출하지만 결과 함수(generateSelected 등)는 게스트 경로에서 절대 호출하지
  // 않는다. brandId 가 "guest" 더미 문자열이라 submitServerJob 의 !brandId 가드를
  // 통과해버리므로, 호출 자체를 막아야 한다 (handleBulkGenerate 의 isGuest 분기).

  // ── Pack 결제·한도 모달 state ─────────────────────────────────────────
  // 스튜디오 페이지(/[brandName]/studio) 와 동일 패턴. 일괄 생성 중 한 항목이
  // 한도 부족 응답을 받으면 useQuickGenerate 의 onPackLimit 콜백이 호출되어
  // 여기서 모달을 띄운다. 같은 일괄 생성에서 여러 항목이 동시에 부족 응답을
  // 받을 수 있으므로 packModal !== 'none' 일 때는 중복 트리거 무시.
  type PackModalState = "none" | "insufficient" | "purchase";
  const [packModal, setPackModal] = useState<PackModalState>("none");
  const [insufficientReason, setInsufficientReason] =
    useState<PackErrorCode>("INSUFFICIENT_PACK");
  // 결제 성공 후 자동 재시도할 콜백. 결제 흐름 종료 시 항상 null 로 정리.
  const pendingRetryRef = useRef<(() => void) | null>(null);
  // 결제→재시도→또 402 피드백 루프 방지 카운터. 결제 흐름 종료 시 0 리셋.
  const retryAttemptsRef = useRef<number>(0);
  const MAX_RETRY_ATTEMPTS = 2;

  // selectedIds 를 ref 로 — pendingRetry 시점에 최신 선택을 사용해야 한다.
  // ref 동기화 패턴은 useQuickGenerate 와 동일.
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  // items 도 ref 로 — pendingRetry 가 실제로 실패한 항목만 재제출하도록 status 참조.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // generateSelected 를 ref 로 — handlePackLimit 이 useQuickGenerate 호출보다
  // 위에서 정의되어 TDZ 회피용. 실제 호출은 결제 성공 후 onSuccess 콜백 안에서만
  // 발생하므로 ref 가 그 시점에 안정적으로 채워져 있다.
  const generateSelectedRef = useRef<
    ((ids: Set<string>) => Promise<void>) | null
  >(null);

  // packModal 도 ref 동기화 — handlePackLimit 이 매 render 마다 새로 만들어지지
  // 않도록 useCallback 의존성에서 빼고 ref 로 latest 값을 본다.
  const packModalRef = useRef(packModal);
  packModalRef.current = packModal;

  const handlePackLimit = useCallback((code: PackErrorCode) => {
    // 이미 모달이 열려있으면 무시 — 동일 일괄 안에서 여러 항목이 같은 에러를
    // 받을 수 있으므로 첫 번째만 처리한다.
    if (packModalRef.current !== "none") return;
    // retry 횟수 상한 초과 시 모달 재오픈 대신 가만히 있는다 — 피드백 루프 차단.
    // 사용자는 항목들의 failed 상태로 결과를 확인하고 직접 재시도 또는 고객지원.
    if (retryAttemptsRef.current >= MAX_RETRY_ATTEMPTS) {
      retryAttemptsRef.current = 0;
      return;
    }
    setInsufficientReason(code);
    // INSUFFICIENT_PACK 의 경우 결제 후 자동 재시도. DAILY_LIMIT 은 재시도해도
    // 같은 결과이므로 retry 등록하지 않는다 (사용자는 업그레이드만 선택 가능).
    if (code === "INSUFFICIENT_PACK") {
      pendingRetryRef.current = () => {
        // 결제 직후 selectedIds 중 실제로 "failed" 상태인 항목만 재제출.
        // 이미 succeeded 한 항목은 재제출하지 않음 (중복 차감 방지).
        const failedIds = new Set<string>();
        for (const id of selectedIdsRef.current) {
          const item = itemsRef.current.find((i) => i.id === id);
          if (item?.status === "failed") failedIds.add(id);
        }
        if (failedIds.size === 0) return;
        void generateSelectedRef.current?.(failedIds);
      };
    } else {
      pendingRetryRef.current = null;
    }
    setPackModal("insufficient");
  }, []);

  const { generateSelected, bulkDownload, downloadSingle, isGenerating } =
    useQuickGenerate({
      items,
      updateItem,
      brandId,
      fetchWithAuth,
      onPackLimit: handlePackLimit,
    });

  // generateSelected ref 동기화 — useCallback 정체성 변경마다 갱신.
  // handlePackLimit 의 pendingRetry 가 결제 성공 후 최신 generateSelected 를 호출하도록.
  generateSelectedRef.current = generateSelected;

  // ── 전역 드래그 앤 드롭 ─────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    if (dragCounterRef.current <= 0) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); // 드롭 허용
  }, []);

  // ── 토스트 상태 ─────────────────────────────────────────────────────
  // resumeToast: 워크스페이스에서 가입 후 게스트 state 복원 성공 시 노출.
  // errorToast:  게스트의 saveQuickGuestState 실패 또는 사전 검증 실패 시 노출.
  const [resumeToast, setResumeToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // ── 이미지 압축 진행 상태 ────────────────────────────────────────────
  // compressImage 는 모바일에서 1장당 수십~수백ms. 사용자가 같은 파일들을 또 드롭하지
  // 않게 시각 피드백용 카운터. ItemListPanel/BulkActionBar 의 disabled 와는 직접 연결하지
  // 않고 본 페이지의 상단 토스트로 알린다.
  //
  // 카운터(boolean 아님) 이유: 사용자가 압축 중에 추가 파일을 드롭하면 handleIncomingFiles 가
  // 동시 실행된다. boolean 으로 두면 먼저 끝난 호출의 finally 가 setFalse 를 발행해
  // 아직 진행 중인 두 번째 호출의 인디케이터까지 꺼버리는 race 가 생긴다. 카운터로
  // 진입/종료 횟수를 균형 유지해 가장 늦은 호출이 끝날 때까지 인디케이터를 유지한다.
  // 드롭존 자체는 차단하지 않아 사용자가 연속 큐잉할 수 있고, 인디케이터 정확성만 카운터로 보장.
  const [processingCount, setProcessingCount] = useState(0);

  // items 를 ref 로 — handleIncomingFiles 가 stale closure 없이 항상 최신 큐의
  // 합산 byte 를 계산하도록.
  const itemsForIntakeRef = useRef(items);
  itemsForIntakeRef.current = items;

  // isGuest 도 ref — handleIncomingFiles 정체성을 안정화.
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;

  /**
   * Quick 모드 신규 이미지 인테이크 — 게스트/워크스페이스 공용.
   * 입력 파일들을 WebP 1600/0.85 로 변환하고, 게스트+localStorage fallback 환경에서는
   * 합산 5MB 가드를 사전 적용한 뒤 useQuickItems.addFiles 로 넘긴다.
   *
   * 실패/거절 분류:
   *   - 변환 실패: "X개 이미지를 처리하지 못했습니다"
   *   - fallback 한도 초과: "브라우저 저장 한도로 N개 이미지가 추가되지 못했습니다"
   *   - 두 종류가 같이 발생하면 한 줄로 합쳐 노출.
   *
   * resume 경로(복원된 Blob → File)는 이 함수를 거치지 않고 addFiles 를 직접 호출한다.
   * 이미 1회 변환된 데이터에 2차 압축을 가하는 품질 저하를 피하기 위함.
   */
  const handleIncomingFiles = useCallback(
    async (input: FileList | File[]): Promise<void> => {
      const raw = Array.from(input).filter((f) => f.type.startsWith("image/"));
      if (raw.length === 0) return;

      setErrorToast(null);
      setProcessingCount((n) => n + 1);
      try {
        const { added, rejected } = await addImagesWithCompressionAndGuard(
          raw,
          {
            isGuest: isGuestRef.current,
            existingFiles: itemsForIntakeRef.current.map((it) => it.file),
          },
        );

        if (added.length > 0) addFiles(added);

        if (rejected.length > 0) {
          const compressFailed = rejected.filter(
            (r) => r.reason === "compress_failed",
          ).length;
          const quotaRejected = rejected.filter(
            (r) => r.reason === "fallback_quota",
          ).length;
          const tooManyRejected = rejected.filter(
            (r) => r.reason === "too_many",
          ).length;
          const parts: string[] = [];
          if (compressFailed > 0) {
            parts.push(
              compressFailed === 1
                ? "이미지를 처리하지 못했습니다. 다른 파일로 시도해 주세요."
                : `${compressFailed}개 이미지를 처리하지 못했습니다`,
            );
          }
          if (quotaRejected > 0) {
            // 원인 → 결과 순. formatGuestSaveError 의 too_large_fallback 어휘
            // ("시크릿/프라이빗 브라우징") 과 톤 일치.
            parts.push(
              `시크릿/프라이빗 창에서는 5MB까지만 저장할 수 있어요. ${quotaRejected}개 이미지가 추가되지 않았어요`,
            );
          }
          if (tooManyRejected > 0) {
            parts.push(
              `30장 한도를 초과해 ${tooManyRejected}개 이미지가 추가되지 않았어요`,
            );
          }
          if (parts.length > 0) setErrorToast(parts.join(" · "));
        }
      } finally {
        setProcessingCount((n) => n - 1);
      }
    },
    [addFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length > 0) void handleIncomingFiles(files);
    },
    [handleIncomingFiles],
  );

  // ── 게스트 제출 중복 방지 가드 ───────────────────────────────────────
  // saveQuickGuestState 가 비동기이므로, 완료 전 버튼을 다시 탭하면 병렬 호출이
  // 발생한다. 이 state 로 handleBulkGenerate 의 게스트 분기를 직렬화한다.
  // 성공 후 router.push 로 페이지를 벗어나는 경우엔 false 복원이 불필요하지만,
  // 실패 토스트 경로에서는 반드시 false 로 되돌려 재시도를 허용한다.
  const [isGuestSubmitting, setIsGuestSubmitting] = useState(false);

  // ── Guest state resume (비로그인 → 가입 후 1회 자동 복원) ──────────
  // 게스트 모드에서는 이 effect 가 동작하면 안 됨. /guest/quick?resume=1 으로 들어와도
  // sessionStorage 의 state 는 워크스페이스 진입 시점에 복원되어야 한다.
  const resumeConsumedRef = useRef(false);

  useEffect(() => {
    if (isGuest) return; // 게스트 경로에서는 복원하지 않음
    if (!searchParams) return;
    if (searchParams.get("resume") !== "1") return;
    if (resumeConsumedRef.current) return;
    resumeConsumedRef.current = true;

    // IndexedDB 는 비동기 — async IIFE 로 감싸 unmount cleanup 패턴(setTimeout id 반환)을 유지.
    // cancelled 플래그로 await 중 unmount 시 setState/setTimeout 발행을 차단.
    // (cleanup 이 먼저 실행되어 toastTimer===null 인 상태에서 IIFE 가 재개될 때 발생하는
    //  unmounted-setState + dangling timer 문제 방지.)
    let cancelled = false;
    let toastTimer: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      let state: Awaited<ReturnType<typeof readAndConsumeQuickGuestState>> = null;
      try {
        state = await readAndConsumeQuickGuestState();
      } catch {
        state = null;
      }
      if (cancelled) return;

      const params = new URLSearchParams(searchParams.toString());
      params.delete("resume");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);

      if (!state) return;
      try {
        const files = state.images.map(quickGuestStateToFile);
        const ids = addFiles(files);
        state.images.forEach((img, i) => {
          const id = ids[i];
          if (!id) return;
          updateItem(id, {
            format: img.format,
            count: img.count,
            ...(img.format === "model" && img.gender ? { gender: img.gender } : {}),
          });
        });
        setResumeToast(`이전에 입력한 ${files.length}개 이미지를 불러왔습니다.`);
        toastTimer = setTimeout(() => setResumeToast(null), 5000);
      } catch {
        // Blob → File 변환 실패. 조용히 무시.
      }
    })();

    return () => {
      cancelled = true;
      if (toastTimer) clearTimeout(toastTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── errorToast 자동 닫힘 (5초) ───────────────────────────────────────
  useEffect(() => {
    if (!errorToast) return;
    const timer = setTimeout(() => setErrorToast(null), 5000);
    return () => clearTimeout(timer);
  }, [errorToast]);

  // ── 파생 상태 ──────────────────────────────────────────────────────
  const detailItem = items.find((i) => i.id === detailItemId) ?? null;
  const doneCount = items.filter(
    (i) =>
      selectedIds.has(i.id) &&
      i.status === "succeeded" &&
      i.format === i.resultFormat,
  ).length;

  // ── 모바일 자동 시트 열기 (워크스페이스 only — 게스트는 생성이 안 일어남) ─
  const prevStatusRef = useRef<Map<string, QuickItem["status"]>>(new Map());
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isGuest) return; // 게스트는 status 가 generating→succeeded 로 바뀌지 않음
    const isMobile = window.matchMedia("(max-width: 767px)").matches;

    const currentIds = new Set(items.map((it) => it.id));
    for (const id of prevStatusRef.current.keys()) {
      if (!currentIds.has(id)) prevStatusRef.current.delete(id);
    }

    if (!isMobile) {
      for (const it of items) prevStatusRef.current.set(it.id, it.status);
      return;
    }

    for (const it of items) {
      const prev = prevStatusRef.current.get(it.id);
      if (
        prev === "generating" &&
        (it.status === "succeeded" || it.status === "failed")
      ) {
        setDetailItemId(it.id);
        break;
      }
    }
    for (const it of items) prevStatusRef.current.set(it.id, it.status);
  }, [items, setDetailItemId, isGuest]);

  // ── 일괄 생성 핸들러 ──────────────────────────────────────────────
  // 게스트: saveQuickGuestState → /signup. 실제 생성 API 호출 절대 금지.
  // 워크스페이스: generateSelected.
  //
  // 게스트 분기는 함수 진입 최상위에 둔다. brandId 가 "guest" 더미 문자열이라
  // useQuickGenerate.submitServerJob 의 !brandId 가드를 통과해버리므로, 분기를
  // 누락하면 게스트가 /api/render/create-job 을 호출해 401 폭주가 발생한다.
  const handleBulkGenerate = useCallback(async () => {
    if (isGuest) {
      // ── 중복 제출 방지 가드 ──────────────────────────────────────────
      if (isGuestSubmitting) return;
      setIsGuestSubmitting(true);

      setErrorToast(null);
      const selectedItems = items.filter((it) => selectedIds.has(it.id));
      if (selectedItems.length === 0) {
        setIsGuestSubmitting(false);
        return;
      }

      // 합산 byte 검증은 saveQuickGuestState 내부에서 driver 에 따라 처리됨.
      // IndexedDB driver 환경에서는 byte 가드 없이 quota 에 위임.
      // localStorage fallback 환경(iOS Safari Private 등)에서는 5MB 초과 시
      // too_large_fallback 을 반환한다. quota 초과 시 quota_exceeded 로 폴백.

      // QuickItem.format 타입이 FormatKey | null 이라 방어. 정상 흐름에선 useQuickItems
      // 의 기본값 "mood" 라 null 이 발생하지 않지만, null 항목을 silent fallback 으로
      // mood 변환하는 대신 명시적으로 안내해 사용자 의도를 보존한다.
      if (selectedItems.some((it) => it.format == null)) {
        setErrorToast("각 이미지의 형식을 선택해주세요.");
        setIsGuestSubmitting(false);
        return;
      }

      const images = selectedItems.map((it) => ({
        file: it.file,
        format: it.format as QuickGuestFormat,
        count: it.count,
        ...(it.format === "model" ? { gender: it.gender ?? "female" } : {}),
      }));

      const result = await saveQuickGuestState({ images });
      if (!result.ok) {
        setErrorToast(formatGuestSaveError(result.reason));
        setIsGuestSubmitting(false); // 실패 시 재시도 가능하도록 복원
        return;
      }

      // signup next: `/guest/quick?resume=1`. 가입 후 onboarding 이 next 를 따라가고,
      // 게스트 라우트 진입 시 GuestWorkspaceLayoutWrapper 의 redirect 가 본인 brand
      // 경로로 보내준다 (`?resume=1` 도 함께 운반되어 위 resume effect 가 발화).
      // 성공 후 페이지를 벗어나므로 setIsGuestSubmitting(false) 불필요.
      router.push("/signup?next=%2Fguest%2Fquick%3Fresume%3D1");
      return;
    }

    // 워크스페이스 경로 — 기존 로직 그대로.
    generateSelected(selectedIds);
  }, [isGuest, isGuestSubmitting, items, selectedIds, generateSelected, router]);

  // ── 일괄 다운로드 핸들러 ────────────────────────────────────────────
  // 게스트는 doneCount 가 영원히 0 이므로 BulkActionBar 의 {doneCount > 0 && ...}
  // 가드에 의해 버튼 자체가 표시되지 않는다. 그래도 방어적으로 isGuest 분기를 둔다.
  const handleBulkDownload = useCallback(() => {
    if (isGuest) return;
    bulkDownload(items.filter((i) => selectedIds.has(i.id)));
  }, [isGuest, items, selectedIds, bulkDownload]);

  // ── 단일 다운로드 핸들러 ────────────────────────────────────────────
  // 게스트는 succeeded 상태로 갈 수 없지만 동일하게 방어.
  const handleDownloadSingle = useCallback(
    (item: QuickItem) => {
      if (isGuest) return;
      downloadSingle(item);
    },
    [isGuest, downloadSingle],
  );

  // ── 렌더링 가드 ────────────────────────────────────────────────────
  // brandLoading 은 워크스페이스에서만 의미가 있다. 게스트는 BrandProvider 가
  // 동기적으로 loading=false 로 주입한다.
  if (brandLoading) {
    return (
      <div className="animate-pulse space-y-4 max-w-4xl mx-auto">
        <div
          className="h-8 w-64 rounded-lg"
          style={{ background: "var(--surface-2)" }}
        />
        <div
          className="h-96 rounded-2xl"
          style={{ background: "var(--surface-2)" }}
        />
      </div>
    );
  }

  // 게스트는 항상 더미 brand 가 있으므로 이 가드는 워크스페이스 only.
  if (!isGuest && !brand) {
    return (
      <div className="text-center py-20">
        <p className="text-zinc-400 text-sm">브랜드를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const hasItems = items.length > 0;

  return (
    <div
      // 부모 (workspace) 레이아웃의 px-6 sm:px-10 py-10 패딩을 상쇄해 quick 페이지가
      // 전체 폭/높이로 흐르도록 한다. 게스트도 동일하게 적용 — 푸터/CTA 가 main 바로
      // 아래 자연스럽게 붙는다 (mt-auto + flex column).
      //
      // 게스트 + 업로드 전(!hasItems): min-h-0 만 제거하고 flex-1 은 유지.
      // - flex-1 유지: 데스크탑에서 루트 div 가 main 높이를 채워 mt-auto 푸터가 바닥에 붙음.
      // - min-h-0 제거: 모바일에서 flex 자식이 min-content 이하로 압축되지 않아
      //   드롭존이 minHeight(clamp) 를 유지 → GuestFooter 침범 해소.
      // hasItems / 워크스페이스: 기존 flex-1 min-h-0 유지 → 내부 컬럼 스크롤 구조 유지.
      className={`flex flex-col -mx-6 sm:-mx-10 -mt-10 -mb-10 ${
        isGuest && !hasItems ? "flex-1" : "flex-1 min-h-0"
      }`}
      // 게스트 모드에서 이미지가 업로드되면 콘텐츠가 화면을 채우므로 부모 셸의
      // glow 그라디언트를 베이지 단색으로 덮어 시각적 산만함을 줄인다 (GuestWorkspaceLayout
      // 의 "plain" variant 와 동일한 #F7F4ED). 초기 화면(!hasItems)에서는 부모 배경 유지.
      // 워크스페이스 모드에서는 항상 부모 배경 사용.
      style={isGuest && hasItems ? { background: "#F7F4ED" } : undefined}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 전역 드래그 오버레이 */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(255,164,198,0.08)",
          border: "2px dashed rgba(255,164,198,0.4)",
          borderRadius: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: isDragging ? "auto" : "none",
          opacity: isDragging ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        <p
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)", pointerEvents: "none" }}
        >
          이미지를 놓으세요
        </p>
      </div>

      {/* 헤더: 이미지 없을 때만 표시. 워크스페이스 톤(#ffa4c6 → #ffe3be) 단일화.
          suppressHydrationWarning: 일부 브라우저 확장/OS 가 SSR HTML 의 <h1> 에 인라인
          font-family 를 추가해 hydration mismatch 를 일으킨다. 콘텐츠 자체에는 영향 없음. */}
      {!hasItems && (
        <header
          className="shrink-0"
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            padding: "var(--dz-header-pt) var(--dz-px) 0",
            marginBottom: "var(--dz-header-mb)",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "var(--quick-header-gap)",
              flexWrap: "wrap",
            }}
          >
            <h1 suppressHydrationWarning style={{ margin: 0 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "var(--quick-pill-py) var(--quick-pill-px)",
                  borderRadius: 999,
                  border: "1.5px dashed #E07A9A",
                  background: "var(--surface-1)",
                  boxShadow:
                    "0 1px 3px rgba(20,16,24,0.06), 0 8px 20px -6px rgba(194,90,126,0.12)",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="url(#quick-zap-gradient)"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: "var(--quick-icon-h1)",
                      height: "var(--quick-icon-h1)",
                    }}
                  >
                    <defs>
                      <linearGradient
                        id="quick-zap-gradient"
                        x1="0"
                        y1="0"
                        x2="24"
                        y2="24"
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop offset="0%" stopColor="#ffa4c6" />
                        <stop offset="100%" stopColor="#ffe3be" />
                      </linearGradient>
                    </defs>
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span
                    style={{
                      background: "linear-gradient(135deg, #ffa4c6, #ffe3be)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      display: "inline-block",
                      fontSize: "var(--quick-text-h1)",
                      letterSpacing: "-0.03em",
                      fontWeight: 700,
                      lineHeight: 1.15,
                    }}
                  >
                    퀵 썸네일
                  </span>
                </span>
              </span>
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "var(--quick-text-desc)",
                lineHeight: 1.5,
                margin: 0,
                maxWidth: "clamp(200px, 25vw, 340px)",
              }}
            >
              여러 제품 이미지를 한 번에 올리고,
              <br />
              형식을 골라 일괄 생성하세요.
            </p>
          </div>
        </header>
      )}

      {/* resume 성공 토스트 (워크스페이스 only) */}
      {resumeToast && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm flex items-center justify-between shrink-0 mb-4 ${
            hasItems ? "mx-4 mt-3" : ""
          }`}
          style={{
            background: "rgba(74,222,128,0.08)",
            border: "1px solid rgba(74,222,128,0.25)",
            color: "#86efac",
          }}
        >
          <span>{resumeToast}</span>
          <button
            type="button"
            onClick={() => setResumeToast(null)}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors ml-3"
            aria-label="닫기"
          >
            닫기
          </button>
        </div>
      )}

      {/* 이미지 압축 진행 알림 — handleIncomingFiles 동안만 표시.
          processingCount > 0 인 동안 유지 — 동시 호출이 있을 때 가장 늦은
          호출이 끝날 때까지 인디케이터가 살아있도록. */}
      {processingCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl px-4 py-3 text-sm flex items-center shrink-0 mb-4 ${
            hasItems ? "mx-4 mt-3" : ""
          }`}
          style={{
            background: "rgba(255,164,198,0.10)",
            border: "1px solid rgba(255,164,198,0.30)",
            color: "var(--text-secondary)",
          }}
        >
          <span
            className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-pink-300 border-t-transparent mr-2.5"
            aria-hidden="true"
          />
          <span>이미지 처리 중...</span>
        </div>
      )}

      {/* 에러 토스트 (게스트 saveQuickGuestState 실패 등) */}
      {errorToast && (
        <div
          role="alert"
          className={`rounded-xl px-4 py-3 text-sm flex items-center justify-between shrink-0 mb-4 ${
            hasItems ? "mx-4 mt-3" : ""
          }`}
          style={{
            background: "rgba(220,38,38,0.08)",
            border: "1px solid rgba(220,38,38,0.25)",
            color: "#f87171",
          }}
        >
          <span>{errorToast}</span>
          <button
            type="button"
            onClick={() => setErrorToast(null)}
            className="text-xs hover:opacity-80 transition-opacity ml-3"
            style={{ color: "#f87171" }}
            aria-label="닫기"
          >
            닫기
          </button>
        </div>
      )}

      {/* 이미지 없을 때: ItemListPanel 전체 공간 */}
      {!hasItems && (
        <div
          // 게스트 모드: flex-1 min-h-0 대신 minHeight 보장으로 교체.
          // 부모 루트 div 가 이미 자연 높이(isGuest && !hasItems 분기)이므로
          // flex-1 을 유지해도 무해하지만, min-h-0 을 제거해 드롭존이 축소되지 않게 한다.
          // minHeight: clamp 로 짧은 viewport 에서도 드롭존 최소 높이 확보.
          className={`flex flex-col ${isGuest ? "flex-1" : "flex-1 min-h-0"}`}
          style={{
            maxWidth: 1400,
            margin: "0 auto",
            padding: "0 var(--dz-px) var(--dz-container-pb)",
            width: "100%",
            ...(isGuest ? { minHeight: "clamp(280px, 50dvh, 600px)" } : {}),
          }}
        >
          <ItemListPanel
            mode={isGuest ? "guest" : "workspace"}
            items={items}
            selectedIds={selectedIds}
            detailItemId={detailItemId}
            onAddFiles={(files) => {
              void handleIncomingFiles(files);
            }}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onRemove={removeItem}
            onUpdateItem={updateItem}
            onClickDetail={setDetailItemId}
          />
        </div>
      )}

      {/* 이미지 있을 때: 2컬럼 레이아웃. paddingBottom 으로 하단 바 가림 방지.
          - BulkActionBar 자체 높이: var(--quick-bar-h)
          - 모바일(워크스페이스)에서는 BulkActionBar 가 Mobile Bottom Nav(52px + safe-area) 위로
            올라가므로 그만큼 추가 패딩 필요. 데스크톱(≥1024px)에서는 nav 없음. */}
      {hasItems && (
        <div
          className="flex flex-col md:flex-row flex-1 min-h-0 quick-content-pb"
          style={isGuest ? { paddingBottom: 25 } : undefined}
        >
          <div className="quick-list-col flex flex-col min-h-0 overflow-hidden w-full md:w-3/5">
            <ItemListPanel
              mode={isGuest ? "guest" : "workspace"}
              items={items}
              selectedIds={selectedIds}
              detailItemId={detailItemId}
              onAddFiles={(files) => {
              void handleIncomingFiles(files);
            }}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              onDeselectAll={deselectAll}
              onRemove={removeItem}
              onUpdateItem={updateItem}
              onClickDetail={setDetailItemId}
            />
          </div>

          <div
            className="quick-detail-col hidden md:flex md:flex-col w-full md:w-2/5 min-h-0 overflow-y-auto border-l"
            style={{ borderColor: "var(--border-default)" }}
          >
            <ItemDetailPanel
              item={detailItem}
              onDownload={handleDownloadSingle}
              onUpdate={updateItem}
              mode={isGuest ? "guest" : "workspace"}
            />
          </div>
        </div>
      )}

      {hasItems && (
        <MobileDetailSheet
          item={detailItem}
          onClose={() => setDetailItemId(null)}
          onDownload={handleDownloadSingle}
          onUpdate={updateItem}
          mode={isGuest ? "guest" : "workspace"}
        />
      )}

      {hasItems && (
        <BulkActionBar
          mode={isGuest ? "guest" : "workspace"}
          selectedCount={selectedIds.size}
          doneCount={doneCount}
          isGenerating={isGuest ? isGuestSubmitting : isGenerating}
          onBulkGenerate={() => void handleBulkGenerate()}
          onBulkDownload={handleBulkDownload}
        />
      )}

      {/* ── Pack 결제·한도 모달 ──────────────────────────────────────── */}
      {/* 패턴은 스튜디오 페이지(/[brandName]/studio) 와 동일. 일괄 생성 중
          한 항목이 402/429 응답을 받으면 useQuickGenerate.onPackLimit 콜백이
          이 영역의 packModal state 를 'insufficient' 로 전환한다. */}
      <InsufficientPackModal
        open={packModal === "insufficient"}
        onClose={() => {
          setPackModal("none");
          pendingRetryRef.current = null;
          retryAttemptsRef.current = 0;
        }}
        reason={insufficientReason}
        onPurchase={() => setPackModal("purchase")}
        onUpgrade={() => {
          setPackModal("none");
          pendingRetryRef.current = null;
          retryAttemptsRef.current = 0;
          router.push("/pricing");
        }}
      />

      <PackPurchaseModal
        open={packModal === "purchase"}
        onClose={() => {
          setPackModal("none");
          pendingRetryRef.current = null;
          retryAttemptsRef.current = 0;
        }}
        onSuccess={() => {
          setPackModal("none");
          // 헤더의 잔량 표시 즉시 갱신 — 결제로 충전됐으므로 캐시 무효화.
          clearPackBalanceCache();
          // retry callback 먼저 추출 후 clear — 무한 체인 방지
          const retry = pendingRetryRef.current;
          pendingRetryRef.current = null;
          if (retry) {
            // retry 시도 횟수 증가 (피드백 루프 가드)
            retryAttemptsRef.current += 1;
            // state 업데이트 안정화를 위해 microtask 지연 (스튜디오 패턴과 동일)
            setTimeout(() => retry(), 100);
          }
        }}
        buyer={{
          name: user?.user_metadata?.full_name as string | undefined,
          email: user?.email,
        }}
        // organizationId 미전달 — PackPurchaseModal 이 /api/organizations fallback 으로 자동 조회
      />

      {/* 푸터: 게스트 + 이미지 업로드 전에만. 워크스페이스는 항상 미노출.
          이미지 업로드 후에는 BulkActionBar 가 하단을 차지하므로 푸터 숨김. */}
      {isGuest && !hasItems && <GuestFooter />}
    </div>
  );
}
