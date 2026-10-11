/**
 * PortOne V1 (아임포트) 브라우저 SDK 타입 선언
 * CDN: https://cdn.iamport.kr/v1/iamport.js
 *
 * 빌링키 발급 + 단건결제 파라미터 모두 포함.
 */

export type IamportBuyerInfo = {
  buyer_email?: string;
  buyer_name?: string;
  buyer_tel?: string;
};

/**
 * 빌링키 발급 모드 파라미터 (customer_uid 필수).
 * 구독 결제 등록 시 사용.
 */
export type IamportBillingKeyParams = {
  /** PortOne V1 채널키 (콘솔 발급) — V2 채널키와 별도 */
  channelKey: string;
  /** 'card' | 'trans' | ... — 빌링키는 'card' 사용 */
  pay_method: 'card' | string;
  /** 가맹점 주문번호 (빌링키 발급 모드에서도 필수) */
  merchant_uid: string;
  /** 주문명 */
  name: string;
  /** 빌링키 발급 시 0 */
  amount: number;
  /** 빌링키 발급 모드 진입 키. 빌링키 식별자로 사용. ≤30자 권장 */
  customer_uid: string;
  /**
   * PG가 식별자로 사용하는 customer 값. Galaxia는 ≤20자 제한.
   * V2 SDK는 자동 생성 UUID를 보내 충돌하지만 V1은 명시 가능 → 본 마이그레이션의 핵심.
   */
  customer_id?: string;
  /** 모바일 결제 완료 후 리다이렉트 URL (모바일 환경에서 필수) */
  m_redirect_url?: string;
  /** PG별 우회 파라미터 (Galaxia ITEM_CODE 등) */
  bypass?: Record<string, Record<string, string>>;
} & IamportBuyerInfo;

/**
 * 단건결제 모드 파라미터 (customer_uid 불필요).
 * KRW 팩 구매 등 일회성 결제 시 사용.
 */
export type IamportOncePayParams = {
  channelKey: string;
  pay_method: 'card' | string;
  merchant_uid: string;
  name: string;
  /** 결제 금액 (원). 서버 checkout 응답값을 그대로 전달해야 함. */
  amount: number;
  /**
   * PG가 식별자로 사용하는 customer 값. Galaxia 는 1~20자 필수.
   * V2 SDK 가 자동 생성하는 UUID(54자)와 충돌해 V1 에서 명시적으로 ≤20자 전달.
   * 단건결제도 빌링키와 동일하게 PG 단에서 요구하므로 반드시 채워서 보낸다.
   */
  customer_id?: string;
  /** 모바일 결제 완료 후 리다이렉트 URL */
  m_redirect_url?: string;
  bypass?: Record<string, Record<string, string>>;
} & IamportBuyerInfo;

/** request_pay 에 전달 가능한 파라미터 유니언 */
export type IamportRequestPayParams = IamportBillingKeyParams | IamportOncePayParams;


export type IamportResponse = {
  success: boolean;
  /** 발급된 imp_uid (서버 검증에 사용) */
  imp_uid?: string;
  merchant_uid?: string;
  /** 빌링키 모드에서 발급된 customer_uid */
  customer_uid?: string;
  /** 실패 시 에러 코드 */
  error_code?: string;
  /** 실패 시 에러 메시지 */
  error_msg?: string;
};

export type IamportSDK = {
  /** imp_key로 SDK 초기화. idempotent. */
  init: (impKey: string) => void;
  /** 결제창 호출. PC는 콜백, 모바일은 m_redirect_url로 리다이렉트. */
  request_pay: (
    params: IamportRequestPayParams,
    callback: (response: IamportResponse) => void,
  ) => void;
};

declare global {
  interface Window {
    IMP?: IamportSDK;
  }
}

export {};
