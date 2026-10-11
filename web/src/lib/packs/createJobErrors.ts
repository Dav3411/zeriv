/**
 * /api/render/create-job 응답에서 결제·한도 부족 케이스를 식별하는 공용 helper.
 *
 * 서버는 차감 실패 시 다음 형태로 응답한다:
 *   402  + { code: 'INSUFFICIENT_PACK', error: '...' }  — 월구독 한도 + 팩 모두 소진
 *   429  + { code: 'DAILY_LIMIT',       error: '...' }  — 일일 한도 도달 (studio/pro)
 *
 * 클라이언트는 이 코드를 보고 InsufficientPackModal 을 띄워 결제·업그레이드로 유도한다.
 *
 * 양쪽 모달 결합 페이지(studio / quick / 등)에서 동일하게 사용하므로 헬퍼를
 * @/lib/packs/createJobErrors 로 추출했다. 인라인 정의 시 PackErrorCode 타입
 * 정의가 페이지마다 흩어져 drift 위험이 있다.
 */

export type PackErrorCode = "INSUFFICIENT_PACK" | "DAILY_LIMIT";

/**
 * 응답이 pack/daily-limit 에러면 해당 code 를, 아니면 null 반환.
 *
 * @param status  HTTP status code
 * @param data    응답 body — code 필드만 본다. error/jobId 등 다른 필드 무시.
 */
export function isPackOrDailyLimitError(
  status: number,
  data: { code?: string } | null | undefined,
): PackErrorCode | null {
  if (status === 402 && data?.code === "INSUFFICIENT_PACK")
    return "INSUFFICIENT_PACK";
  if (status === 429 && data?.code === "DAILY_LIMIT") return "DAILY_LIMIT";
  return null;
}
