# Zeriv 검증 기록

[README로 돌아가기](../README.md) · [개발 가이드](DEVELOPMENT.md)

## 소스 정리 당시 확인 결과

검증일: 2026-10-11.

아래는 소스 스냅샷 정리 과정에서 수행한 검사의 기록입니다. 외부 계정과 운영 환경을 연결한 서비스 통합 테스트 결과와는 구분합니다.

| 항목 | 결과와 범위 |
| --- | --- |
| 의존성 설치 | `npm ci --ignore-scripts --no-audit --no-fund` 완료 |
| 앱 타입 검사 | `npm run typecheck:app` 통과 |
| 워커 구문 검사 | `worker.mjs`, `watermark.mjs`, `quickPatterns.mjs` 통과 |
| 프로덕션 빌드 | 자격증명 없이 Next.js 빌드 완료. Supabase 설정이 없어 블로그 sitemap 조회는 생략 |
| 전체 타입 검사 | 기존 Jest 테스트 2개에서 오류 발생 |

빌드와 정적 검사 통과는 실제 이미지 생성·인증·결제가 실행됨을 의미하지 않습니다.

## 검사 명령어

`web` 디렉터리에서 실행합니다.

```bash
npm run typecheck:app
npm run build
node --check scripts/worker.mjs
node --check scripts/watermark.mjs
node --check scripts/quickPatterns.mjs
```

원본 검사 범위는 다음과 같습니다.

```bash
npm run typecheck
```

원본 `tsconfig.json`과 테스트 소스는 보존했습니다. 다음 두 Jest 테스트는 러너·타입 의존성이 구성되지 않았으며 일부 fixture 타입도 현재 계약과 달라 전체 타입 검사가 실패합니다.

- `src/lib/adSequence/__tests__/adSequence.orchestrator.integration.test.ts`
- `src/lib/reusableAsset/__tests__/reusableAsset.bridge.test.ts`

`tsconfig.app.json`은 위 두 파일만 추가로 제외해 앱 소스를 검사합니다. `typecheck:app` 통과를 전체 테스트 통과로 해석하면 안 됩니다.

## 별도 통합 확인이 필요한 범위

소스 정리 과정에서는 새 테스트 DB를 구성한 인증 → 생성 요청 → 워커 처리 → 결과 저장·조회 흐름을 통합 실행하지 않았습니다. 결제와 이메일 발송도 실제 외부 서비스를 호출해 검증하지 않았습니다.

로컬에서 기능을 확인하려면 [개발 가이드](DEVELOPMENT.md)의 환경 변수와 DB 준비 범위를 먼저 확인해야 합니다. 실제 API 호출 결과, 생성 품질, 처리 시간과 동시 사용자 성능에 대한 측정치는 이 기록에 포함하지 않습니다.
