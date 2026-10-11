/**
 * 이미지 장수 팩 (KRW 종량제) — 서버 측 가격 매핑.
 *
 * 보안: 클라이언트에서 amount 를 받지 않는다. checkout 요청에 pack_size 만
 *       전달하고, 서버에서 이 매핑을 단일 source of truth 로 사용한다.
 *       PortOne 결제 검증 시 PortOne 응답 amount 와 이 매핑이 일치하는지
 *       반드시 재확인 (위변조 방지).
 *
 * Plan ref: docs/billing/credit-system-revival-plan.md (v2) 섹션 0.
 */

export type PackSize = 1 | 10;

const PACK_AMOUNT_KRW: Record<PackSize, number> = {
  1: 500,
  10: 4_500,
};

const VALID_PACK_SIZES: ReadonlySet<number> = new Set([1, 10]);

/** packSize 가 허용된 값(1/10/30/100)인지 검증. */
export function isValidPackSize(value: unknown): value is PackSize {
  return typeof value === 'number' && VALID_PACK_SIZES.has(value);
}

/**
 * 서버 측 가격 매핑. 클라이언트 입력 amount 는 절대 신뢰하지 않는다.
 * @throws Error  알 수 없는 packSize.
 */
export function getPackAmountKrw(packSize: PackSize): number {
  const amount = PACK_AMOUNT_KRW[packSize];
  if (!amount) {
    throw new Error(`unknown packSize: ${packSize}`);
  }
  return amount;
}

/** 표시용 상품명 (PortOne 결제창 noti). */
export function getPackOrderName(packSize: PackSize): string {
  return `Zeriv 이미지 ${packSize}장 팩`;
}
