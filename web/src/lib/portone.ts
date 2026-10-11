/**
 * 포트원 서버사이드 유틸리티 (V1 / 아임포트)
 * - V1 API: imp_uid / customer_uid 기반
 * - 자동갱신은 V1 빌링키(customer_uid) 모델 사용
 * API Secret은 절대 클라이언트로 노출하지 않음.
 *
 * V2 SDK는 더 이상 사용하지 않음 — Galaxia PG의 customer_id ≤20자 제한과
 * V2 SDK가 발송하는 UUID(54자) 충돌로 빌링키가 동작하지 않아 V1으로 회귀.
 */

/**
 * PG 일시 장애(네트워크 타임아웃·비-404 HTTP 에러·code!==0 응답 등)를 표현하는 에러 클래스.
 *
 * sweep cron 의 catch 분기에서 instanceof 로 검사하여 retrying / failed 카운터를 분리한다:
 *   - PortonePGTransientError → retrying++ (다음 cron 에 재시도 위임, row 상태 변경 없음)
 *   - 그 외 Error → failed++ (DB 에러·비즈니스 로직 실패 등 실제 사고)
 *
 * Error 를 상속하므로 기존 catch (err) 블록은 모두 그대로 동작한다.
 */
export class PortonePGTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortonePGTransientError';
  }
}

// ─── fetch timeout 헬퍼 ──────────────────────────────────────────────────────
// PortOne API hang 시 connection 고갈 방지. webhook flood 와 결합 시 DoS 위험 차단.

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ─── V1 결제 타입 ────────────────────────────────────────────────────────────

export type PortonePayment = {
  imp_uid: string;
  merchant_uid: string;
  status: 'paid' | 'failed' | 'cancelled' | 'ready';
  amount: number;
  pay_method: string;
  pg_provider: string;
  paid_at: number | null; // unix timestamp. status='paid' 인데 누락될 수 있음 (V1 실제 응답)
};

// ─── V1 액세스 토큰 ───────────────────────────────────────────────────────────

/**
 * 포트원 V1 액세스 토큰 발급 (5분 만료, 매번 새로 발급)
 */
export async function getPortoneToken(): Promise<string> {
  const impKey = process.env.PORTONE_API_KEY;
  const impSecret = process.env.PORTONE_API_SECRET;
  if (!impKey || !impSecret) {
    throw new Error('Missing PORTONE_API_KEY or PORTONE_API_SECRET');
  }

  let res: Response;
  try {
    res = await fetchWithTimeout('https://api.iamport.kr/users/getToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imp_key: impKey, imp_secret: impSecret }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new PortonePGTransientError('포트원 V1 토큰 발급 타임아웃 (10s)');
    }
    throw err;
  }

  if (!res.ok) {
    throw new PortonePGTransientError(`포트원 V1 토큰 발급 실패: ${res.status}`);
  }

  const json = (await res.json()) as {
    code: number;
    message: string;
    response: { access_token: string };
  };

  if (json.code !== 0) {
    throw new PortonePGTransientError(`포트원 V1 토큰 발급 오류: ${json.message}`);
  }

  return json.response.access_token;
}

/**
 * V1 imp_uid로 결제 정보 조회
 */
export async function getPaymentInfo(impUid: string): Promise<PortonePayment> {
  const token = await getPortoneToken();

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.iamport.kr/payments/${encodeURIComponent(impUid)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new PortonePGTransientError('포트원 V1 결제 조회 타임아웃 (10s)');
    }
    throw err;
  }

  if (!res.ok) {
    throw new PortonePGTransientError(`포트원 V1 결제 조회 실패: ${res.status}`);
  }

  const json = (await res.json()) as {
    code: number;
    message: string;
    response: PortonePayment;
  };

  if (json.code !== 0) {
    throw new PortonePGTransientError(`포트원 V1 결제 조회 오류: ${json.message}`);
  }

  return json.response;
}

/**
 * V1 merchant_uid로 결제 정보 조회
 *
 * 반환/throw 의미론 (sweep 의 status='failed' 영구 마킹 안전성을 위해 엄격히 분리):
 *
 *   null 반환 — "결제가 확실히 존재하지 않음" 신호. 호출 측은 결제 미발생으로 단정 가능.
 *     · HTTP 404 (일부 PortOne 환경에서 미존재 결제에 404 반환)
 *     · HTTP 200 + response=null
 *       (PortOne V1 이 "데이터 없음" 을 표현하는 정상 응답 형태.
 *        과거 운영에서 code=-1 과 동반되어 관찰됨)
 *
 *   throw — "PG 일시 장애 가능성 — 다음 sweep 에 재시도 해야 안전" 신호.
 *     · 네트워크 / 타임아웃 / 비-404 HTTP 에러
 *     · HTTP 200 + response 본체는 있는데 code !== 0
 *       (200 으로 응답이 왔지만 PG 가 결제 데이터를 못 돌려준 경우.
 *        일시 장애와 진짜 미존재를 코드 값만으로 구분할 수 있다는 PortOne V1 공식 보증이
 *        없으므로 보수적으로 throw 처리. response 가 비어 있다면 위 null 분기에서 흡수.)
 *
 * 이 구분이 깨지면 sweep 이 paid 결제를 failed 로 영구 마킹하는 사고가 발생할 수 있다
 * (M-1 사고). 호출 측(특히 cron sweep)은 throw 를 catch 하여 row 상태를 그대로 두고
 * 다음 cron 주기에 재시도해야 한다.
 *
 * 사용처: cron sweep 에서 imp_uid 가 없는 pending 행(빌링키 미완료 케이스 등)의
 * 실제 결제 발생 여부를 PG 측에 다시 묻는다.
 */
export async function findPaymentByMerchantUid(
  merchantUid: string,
): Promise<PortonePayment | null> {
  const token = await getPortoneToken();

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.iamport.kr/payments/find/${encodeURIComponent(merchantUid)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new PortonePGTransientError('포트원 V1 merchant_uid 조회 타임아웃 (10s)');
    }
    throw err;
  }

  // 404 = 결제 미존재 (확실). null 반환 안전.
  if (res.status === 404) return null;
  // 그 외 HTTP 에러는 PG 일시 장애 가능성 — 호출 측이 catch 후 다음 cron 으로 위임해야 함.
  if (!res.ok) {
    throw new PortonePGTransientError(`포트원 V1 merchant_uid 조회 실패: ${res.status}`);
  }

  const json = (await res.json()) as {
    code: number;
    message: string;
    response: PortonePayment | null;
  };

  // 응답 본체가 비어 있으면 "데이터 없음" — 결제 미존재로 정상화.
  // (PortOne V1 정상 "미존재" 응답 패턴: 200 + code=-1 + response=null)
  if (!json.response) return null;
  // 본체는 있는데 code !== 0 이면 PG 측 일시 에러 가능성 — throw 로 sweep 에 재시도 위임.
  // 여기서 null 을 반환하면 sweep 이 paid 결제까지 status='failed' 로 잘못 마킹할 수 있다 (M-1).
  if (json.code !== 0) {
    throw new PortonePGTransientError(
      `포트원 V1 merchant_uid 조회 PG 에러 (재시도 필요): code=${json.code} message=${json.message}`,
    );
  }
  return json.response;
}

// ─── V1 빌링키(customer_uid) 타입 ─────────────────────────────────────────────

export type PortoneV1CustomerInfo = {
  customer_uid: string;
  pg_provider: string;
  pg_id: string;
  card_name?: string;
  card_number?: string;
  customer_name?: string;
  customer_tel?: string;
  customer_email?: string;
  inserted?: number;
};

export type PortoneV1ChargeResult = {
  imp_uid: string;
  merchant_uid: string;
  status: 'paid' | 'failed' | 'cancelled';
  amount: number;
  pay_method: string;
  paid_at: number; // unix timestamp
  customer_uid?: string;
};

/**
 * V1 customer_uid 정보 조회
 *
 * 반환/throw 의미론 (sweep 의 status='failed' 영구 마킹 안전성을 위해 엄격히 분리):
 *
 *   null 반환 — "빌링키가 확실히 PG 에 존재하지 않음" 신호. 호출 측은 미발급으로 단정 가능.
 *     · HTTP 404 (미존재 customer_uid 에 대해 PortOne 이 명시적으로 404 반환)
 *     · HTTP 200 + response=null
 *       (PortOne V1 이 "데이터 없음" 을 표현하는 정상 응답 형태)
 *
 *   throw — "PG 일시 장애 가능성 — 다음 sweep 에 재시도 해야 안전" 신호.
 *     · 네트워크 / 타임아웃 / 비-404 HTTP 에러
 *     · HTTP 200 + response 본체는 있는데 code !== 0
 *       (200 으로 응답이 왔지만 PG 가 고객 데이터를 못 돌려준 경우.
 *        일시 장애와 진짜 미존재를 코드 값만으로 구분할 수 있다는 PortOne V1 공식 보증이
 *        없으므로 보수적으로 throw 처리. response 가 비어 있다면 위 null 분기에서 흡수.)
 *
 * 이 구분이 깨지면 sweep 이 PG 일시 장애를 빌링키 미존재로 오판하여 intent 를 영구 failed 로
 * 마킹하는 사고가 발생할 수 있다 (H-1, M-1 과 동일 패턴).
 * 호출 측(특히 cron sweep)은 throw 를 catch 하여 row 상태를 그대로 두고
 * 다음 cron 주기에 재시도해야 한다.
 */
export async function getCustomerInfo(
  customerUid: string,
): Promise<PortoneV1CustomerInfo | null> {
  const token = await getPortoneToken();
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.iamport.kr/subscribe/customers/${encodeURIComponent(customerUid)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new PortonePGTransientError('포트원 V1 고객 정보 조회 타임아웃 (10s)');
    }
    throw err;
  }

  // 404 = 빌링키 미존재 (확실). null 반환 안전.
  if (res.status === 404) return null;
  // 그 외 HTTP 에러는 PG 일시 장애 가능성 — 호출 측이 catch 후 다음 cron 으로 위임해야 함.
  if (!res.ok) {
    throw new PortonePGTransientError(`포트원 V1 고객 정보 조회 실패: ${res.status}`);
  }

  const json = (await res.json()) as {
    code: number;
    message: string;
    response: PortoneV1CustomerInfo | null;
  };

  // 응답 본체가 비어 있으면 "데이터 없음" — 빌링키 미존재로 정상화.
  if (!json.response) return null;
  // 본체는 있는데 code !== 0 이면 PG 측 일시 에러 가능성 — throw 로 sweep 에 재시도 위임.
  if (json.code !== 0) {
    throw new PortonePGTransientError(
      `포트원 V1 고객 정보 조회 PG 에러 (재시도 필요): code=${json.code} message=${json.message}`,
    );
  }
  return json.response;
}

/**
 * V1 반복결제 (customer_uid 기반)
 * POST https://api.iamport.kr/subscribe/payments/again
 */
export async function chargeWithCustomerUid(params: {
  customerUid: string;
  merchantUid: string;
  amountKrw: number;
  orderName: string;
  buyerEmail?: string;
  buyerName?: string;
}): Promise<PortoneV1ChargeResult> {
  const token = await getPortoneToken();
  let res: Response;
  try {
    res = await fetchWithTimeout('https://api.iamport.kr/subscribe/payments/again', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_uid: params.customerUid,
        merchant_uid: params.merchantUid,
        amount: params.amountKrw,
        name: params.orderName,
        buyer_email: params.buyerEmail,
        buyer_name: params.buyerName,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('포트원 V1 반복결제 타임아웃 (10s)');
    }
    throw err;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`V1 반복결제 실패: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    code: number;
    message: string;
    response: PortoneV1ChargeResult;
  };
  if (json.code !== 0) throw new Error(`V1 반복결제 오류: ${json.message}`);
  return json.response;
}

/**
 * V1 customer_uid 삭제 (구독 취소·재발급 시 호출)
 * - 이미 삭제된 키(404)는 에러로 간주하지 않고 정상 반환
 */
export async function deleteCustomerUid(customerUid: string): Promise<void> {
  const token = await getPortoneToken();
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.iamport.kr/subscribe/customers/${encodeURIComponent(customerUid)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('포트원 V1 빌링키 삭제 타임아웃 (10s)');
    }
    throw err;
  }
  if (!res.ok && res.status !== 404) {
    throw new Error(`V1 빌링키 삭제 실패: ${res.status}`);
  }
}
