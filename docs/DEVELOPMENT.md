# Zeriv 개발 가이드

[README로 돌아가기](../README.md)

## 저장소 구성

이 저장소는 Zeriv의 웹 앱과 이미지 생성 워커를 독립적으로 정리한 소스 스냅샷입니다. 운영 DB, 계정, 고객 데이터, 실제 자격증명과 배포 설정은 포함하지 않습니다. 프런트엔드 사업자 정보와 연락처는 예제값입니다.

웹 앱과 워커는 모두 `web` 디렉터리에서 실행합니다. Node.js 20.9 이상과 npm이 필요하며, 프로덕션 빌드 중 `next/font/google`의 폰트 다운로드에는 네트워크 연결이 필요합니다.

## 환경 변수

`web/.env.example`을 `web/.env.local`로 복사한 뒤 사용할 기능의 값을 입력합니다.

```bash
cd web
npm ci
cp .env.example .env.local
```

PowerShell에서는 마지막 명령을 다음과 같이 실행할 수 있습니다.

```powershell
Copy-Item .env.example .env.local
```

| 구분 | 주요 변수 | 용도 |
| --- | --- | --- |
| 클라이언트 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 인증과 브라우저용 Supabase 연결 |
| 서버 | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | 서버·워커의 DB 연결 |
| 파일 저장 | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | S3 호환 R2 연결 |
| 파일 URL | `R2_PUBLIC_URL`, `NEXT_PUBLIC_R2_PUBLIC_URL`, `MEDIA_TOKEN_SECRET` | 자산 URL과 미디어 접근 처리 |
| AI | `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `FAL_KEY`, `ANTHROPIC_API_KEY` | 기능별 AI 제공자 연결 |
| 작업 큐 | `JOB_SOURCE`, `WORKER_CONCURRENCY` | 작업 구분과 워커 동시 실행 수 |
| 실행 모드 | `WORKER_POLLING_MODE`, `WORKER_HTTP_PORT` | 폴링·HTTP 워커 실행 방식 |
| 선택 기능 | 결제·이메일·관리자 관련 변수 | 해당 기능을 사용할 때 별도 설정 |

AI 키를 모두 입력할 필요는 없으며 사용하려는 경로의 제공자만 설정합니다. 서버 비밀 키는 `NEXT_PUBLIC_` 변수에 넣지 않습니다. 결제와 이메일은 별도로 준비한 테스트 계정으로 설정합니다.

## 데이터베이스

인증·브랜드·자산·작업 큐 기능을 사용하려면 Supabase 프로젝트와 관련 스키마가 필요합니다.

| 경로 | 내용 |
| --- | --- |
| [`web/sql/`](../web/sql/) | 기존 스키마와 변경 SQL |
| [`web/sql/brand-migrations/`](../web/sql/brand-migrations/) | 브랜드 파이프라인 SQL |
| [`web/supabase/migrations/`](../web/supabase/migrations/) | 후속 마이그레이션 |

이 SQL 모음은 빈 DB에서 파일 이름순으로 실행하는 통합 설치 절차로 검증되지 않았습니다. 선행 테이블·함수·정책 의존성과 중복 변경을 검토한 후 별도 테스트 DB에 적용해야 합니다. `claim_next_job` RPC를 포함해 현재 웹 앱과 워커가 사용하는 스키마·권한 구성을 함께 확인해야 합니다.

## 웹 앱과 워커

웹 앱을 실행합니다.

```bash
cd web
npm run dev
```

Studio의 실제 화면은 `src/app/[brandName]/studio/`에 있습니다. `/studio`는 로그인 사용자와 브랜드 상태에 따라 브랜드 Studio, 온보딩 또는 게스트 Studio로 이동합니다.

별도 터미널에서 워커를 실행합니다.

```bash
cd web
npm run worker:run
```

워커는 `web/.env.local`을 읽습니다. 웹 앱과 같은 DB 및 `JOB_SOURCE`를 사용하며, 시작 후 대기 작업을 처리할 수 있습니다. 이미지 생성 API 호출에는 해당 제공자의 사용 요금이 발생할 수 있습니다.

`.env.example`은 `WORKER_POLLING_MODE=true`, `WORKER_HTTP_PORT=8787`, `WORKER_CONCURRENCY=1`을 기본 예제로 제공합니다. 이 설정에서는 HTTP 서버와 백그라운드 폴링 루프가 함께 실행됩니다. 오래된 처리 작업의 재등록 기준은 `WORKER_STALE_PROCESSING_MINUTES`로 설정합니다.

## 코드 탐색

| 관심 영역 | 경로 |
| --- | --- |
| Studio 화면 | `web/src/app/[brandName]/studio/` |
| 스타일 데이터·프롬프트·시트 | `web/src/lib/style/` |
| 브랜드 스타일 API | `web/src/app/api/brands/[id]/styles/` |
| 이미지 생성 요청 | `web/src/app/api/render/create-job/route.ts` |
| 이미지 생성 워커 | `web/scripts/worker.mjs` |
| 작업 선점 SQL | `web/supabase/migrations/20260424_claim_next_job_rpc.sql` |
| R2 파일 처리 | `web/src/lib/r2.ts` |
| 생성 이용권 소비·보상 | `web/src/lib/packConsumption.ts` |

## 현재 소스의 범위

- 주 설명 대상은 이미지 생성 경로입니다. `/api/render-jobs`와 `/api/internal/pipeline` 등 레거시 경로는 `410`을 반환합니다. 남아 있는 영상 파이프라인 전체가 실행 가능한 상태를 의미하지 않습니다.
- 외부 GPU 서브 워커와 모델 가중치는 포함하지 않습니다.
- `public/studio-showcase` 등의 이미지는 UI 설명용 데모 자산입니다. 실사용 지표나 고객 생성 결과의 증거는 아닙니다.
- 대형 랜딩 영상과 별도 실험 이미지 일부는 제외되어 해당 미디어가 표시되지 않을 수 있습니다.
- 포함된 데모 이미지를 별도 재배포할 때는 출처와 사용 권한을 확인해야 합니다.

실행 확인 범위와 타입 검사 제한은 [검증 기록](VALIDATION.md)을 참고해 주세요.
