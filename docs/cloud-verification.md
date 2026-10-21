# 클라우드 검증 기록

대상 브랜치: `feat/cloud-sharing`. 운영 반영·GitHub 푸시·Pages 배포는 수행하지 않았다. 운영용 `cloud.json`은 빈 설정이고 앱 버전은 1.5.2로 유지한다.

## 2026-10-21 로컬 검증

- Supabase CLI 2.121.0, PostgreSQL 17.11, Edge runtime 1.77.4, Node 24.19.0, 실제 Microsoft Edge 사용.
- 부록 A의 SQL 세 파일은 원문과 대조한다. 부록 B의 anon/pending/revoked/trial/member 권한은 실제 REST·Storage·함수 호출로 검사한다.
- 두 개의 독립 Edge 프로필에서 실제 로컬 이메일 세션으로 공개 → 실시간 목록 반영 → 사본을 확인했다. 준멤버는 10장까지 저장되고 11장째는 거부됐다. 승인 해제 후 다음 저장은 즉시 차단됐다. 페이지 스크립트 오류는 0개였다.
- 백업 → 실제 로컬 DB reset → 세 마이그레이션 재적용 → 데이터·그림 복원이 통과했다. 수량·그림 해시·복원 후 계정 로그인 결과는 [cloud-admin.md](cloud-admin.md)에 있다.
- 전체 단위 검사 482개 통과. 전체 브라우저 및 통합 검사, 최종 리뷰 결과는 검증 완료 후 아래에 확정한다.

## 다시 실행하기

`.env.cloud-test`에 로컬 테스트 값 네 개를 준비한다. 이 파일은 커밋하지 않는다. 검사는 명시적인 localhost/127.0.0.1 주소만 허용하고 테스트 전용 계정과 자료를 만들고 지운다.

```text
npm run test:unit
npm run build
npm run test:browser
npm run test:cloud
npm run test:cloud:ui
```

로컬 함수 서버의 비공개 `.env.local`에는 `ALLOWED_ORIGINS=http://localhost:4173`, `PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`을 설정한다. UI 검증은 4173 포트를 쓰며 별도 출력 경로에 빌드하므로 정식 `dist/`를 바꾸지 않는다.

백업 복원은 일반 테스트에 포함하지 않는다. `node --env-file=.env.cloud-test scripts/verify-local-backup.mjs --reset-local`을 명시적으로 실행할 때만 로컬 DB를 초기화한다. Docker/Supabase 실행 파일이 PATH에 없으면 `DOCKER_BIN`, `SUPABASE_CLI`를 지정한다.

전체 로그와 실행 결과 JSON은 `artifacts/qa/cloud-*.log`, `artifacts/qa/cloud-browser-result.json`에 보관한다. SQL·브라우저 프로필·인증 데이터는 이 디렉터리에서만 관리하고 커밋하지 않는다.

## 화면 증거

![B의 공개 목록 실시간 반영](evidence/cloud/live-public.png)
![준멤버 11장째 저장 거부](evidence/cloud/trial-limit.png)
![승인 해제 후 저장 차단](evidence/cloud/revoked-write.png)

## 최종 검사와 리뷰

검증 진행 중. Task 15 Step 3은 사용자 확인 전까지 대기한다.
