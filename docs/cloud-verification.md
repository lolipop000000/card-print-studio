# 클라우드 검증 기록

대상 브랜치: `feat/cloud-sharing`. 아래 날짜별 기록은 각 검증 시점의 결과다. PP Monster 1.6.0을 main에 통합하고 Pages·Release와 운영 DB·서버 함수·Google 로그인 설정을 게시했다. 첫 운영 백업의 데이터 저장은 성공했으며, 후속 정리 단계는 실패해 원인을 확인 중이다. 실제 사용자 Google 로그인과 운영 카드 저장은 아직 검증하지 않았다.

## 2026-10-21 로컬 검증

- Supabase CLI 2.121.0, PostgreSQL 17.11, Edge runtime 1.77.4, Node 24.19.0, 실제 Microsoft Edge 사용.
- 부록 A의 SQL 세 파일은 원문과 대조한다. 부록 B의 anon/pending/revoked/trial/member 권한은 실제 REST·Storage·함수 호출로 검사한다.
- 두 개의 독립 Edge 프로필에서 실제 로컬 이메일 세션으로 공개 → 실시간 목록 반영 → 사본을 확인했다. 에셋 탭을 열어 둔 채 공개·수정·비공개·삭제가 반영되고, 저장 충돌의 서버 내용 불러오기·사본 저장도 확인했다. 준멤버는 10장까지 저장되고 11장째는 거부됐다. 승인 해제 후 다음 저장은 즉시 차단됐다. 페이지 스크립트 오류는 0개였다.
- 백업 → 실제 로컬 DB reset → 세 마이그레이션 재적용 → 데이터·그림 복원이 통과했다. 수량·그림 해시·복원 후 계정 로그인 결과는 [cloud-admin.md](cloud-admin.md)에 있다.
- 전체 단위 검사 492개, 브라우저 검사 510개, 실제 로컬 통합 검사 20개가 통과했다. 실패는 0개다. 모델 파일이 필요한 선택적 실제 U2NetP 추론 검사 1개만 건너뛰었다.

## 리뷰 수정

전체 브랜치에 대한 별도 리뷰에서 중요한 문제 8개를 확인했다. 각 문제를 먼저 실패하는 테스트로 재현한 뒤 수정했고 `2dc9ed6`에 커밋했다. 보류한 경미한 지적은 없다.

계획과 달리 판단한 35개 사항과 각각의 영향은 [구현 판단 기록](cloud-implementation-decisions.md)에 순서대로 보관했다. Task 15의 두 프로필 시나리오는 실제 Edge 화면 조작을 자동화하고 스크린샷을 살피는 방식으로 검증했다. 기계 판독 결과는 [result.json](evidence/cloud/result.json)에 있다.

| 문제 | 수정 결과와 검증 |
| --- | --- |
| 업로드 중 계정 변경 | 작업을 시작한 계정으로만 요청하며, 이전 계정의 덱은 로컬 복구 내용을 유지한 채 저장을 중지한다. 그림 보관함·공유·PC 가져오기에도 적용했다. |
| 미연결 이미지로 한도 우회 | 아직 작업에 연결하지 않은 업로드도 한도에 예약한다. 준멤버가 8 MiB 이미지를 두 번 올릴 때 두 번째를 실제 HTTP에서 거부했다. |
| 이미지 정리 도중 일부 삭제 실패 | 삭제 중인 자료를 먼저 사용 불가로 확정하고 재시도 기록을 남긴다. 실제 DB·Storage에서 중간 실패 → 재업로드 → 기록 해제 → 정상 저장을 확인했다. |
| 충돌 선택 버튼 없음 | 서버 내용 불러오기·현재 편집을 사본으로 저장을 화면에서 선택한다. 두 선택 모두 실제 서버에서 확인했다. |
| 에셋 실시간 변경 누락 | 공개·수정·비공개·삭제를 현재 에셋 목록에도 즉시 반영한다. |
| 목록 조회와 실시간 이벤트 순서 충돌 | 조회 중 도착한 이벤트를 순서대로 다시 적용해 삭제한 항목이 재등장하거나 새 항목이 사라지지 않는다. |
| REST 1,000행 제한 | 일정한 순서로 나누어 읽는다. 실제 2,004행 중 내 에셋 1,002개와 공개 에셋 1,002개를 모두 확인했다. |
| 내 에셋 재사용 불가 | 보관한 키워드·서식·이펙트를 현재 덱에 적용한다. 그림 읽기가 실패해도 이미 만든 사본을 다시 적용할 수 있다. |

미연결 이미지 예약량은 부록 A의 원문을 유지한 `my_usage()` 표시량에는 포함되지 않는다. 따라서 이미지를 올린 직후에는 실제 저장 한도가 표시 사용량보다 먼저 차단될 수 있으며, 작업에 연결하거나 정리하면 해소된다. 정리는 기존 서버 전용 감사 기록에 삭제 재시도를 남기며, DB 연결 하나를 유지하는 동안 쓰기 요청을 잠시 대기시킨다.

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

최종 로그는 `artifacts/qa/cloud-unit-final.log`, `cloud-build.log`, `cloud-browser-final.log`, `cloud-integration.log`, `cloud-ui.log`와 `cloud-browser-result.json`에 보관한다. SQL·브라우저 프로필·인증 데이터는 이 디렉터리에서만 관리하고 커밋하지 않는다.

## 화면 증거

![B의 공개 목록 실시간 반영](evidence/cloud/live-public.png)
![준멤버 11장째 저장 거부](evidence/cloud/trial-limit.png)
![승인 해제 후 저장 차단](evidence/cloud/revoked-write.png)
![에셋 탭에서 실시간 수정 반영](evidence/cloud/live-asset.png)
![저장 충돌의 두 선택지](evidence/cloud/conflict-load.png)

## 최종 검사와 리뷰

검증한 소스 커밋은 `2dc9ed65dfa8aaffcbe543987b86fb97c3b403a4`다. 그 이후 변경은 이 검증 문서와 증거 파일뿐이다. 집계는 [verification.json](evidence/cloud/verification.json)에 보관한다.

| 검사 | 통과 | 실패 | 건너뜀 |
| --- | ---: | ---: | ---: |
| 전체 단위 검사 | 492 | 0 | 0 |
| 전체 브라우저 검사 | 510 | 0 | 1 |
| 실제 로컬 Supabase 통합 검사 | 20 | 0 | 0 |
| 합계 | 1,022 | 0 | 1 |

두 프로필 실제 UI 시나리오도 통과했고 페이지 오류는 0개였다. HTML 빌드는 5.29 MiB로 성공했으며 번들 라이선스 24개를 포함한다. `dist/card-print-studio.html`의 SHA-256은 `1947E239C572B98D64F877DC85083974E3825297F26E2505A8EDCB42E8838E4E`다.

선택적 검사 1개는 `CARD_BG_MODEL_DIR`에 고정된 `ort.min.js`, `ort-wasm-simd.wasm`, `u2netp.onnx` 파일이 없어 실행하지 않았다. 다른 배경 제거 검사와 오프라인 브라우저 검사는 통과했다. 실제 모델 추론까지 검증했다고 주장하지 않는다.

Task 1–14와 Task 15 Steps 1–2의 로컬 구현·검증을 마쳤다. 중요한 리뷰 지적 8개는 실패 재현 → 수정 → 통과 후 전체 검사로 확인했다. 보류한 경미한 지적은 없다. 부록 A 마이그레이션은 `b02c766` 이후 변경하지 않았다.

Task 15 Step 3은 2026-10-22 사용자의 “깃헙에 올리고 서버까지 연동하자” 요청으로 운영 반영 승인을 받았다. `feat/cloud-sharing` 브랜치를 GitHub에 게시하고 Pages를 GitHub Actions 방식으로 설정했다. 요청 당시 운영 Supabase 로그인·프로젝트 연결과 공개 URL/키, Google OAuth, 백업용 비밀 설정이 준비되지 않아 게시를 보류했다. 이후 받은 공개 설정과 운영 상태는 아래에 기록한다.

운영 준비 중 `origin/main`의 v1.5.3 제목 키워드 수정을 이 작업 브랜치에 통합했다. 별도 작업 폴더는 수정하지 않았다. 충돌은 카드 한 장 파일의 제목·본문 자동 키워드와 전용 이펙트 의존 이미지 보존을 유지하고, HTML과 서버 검증 번들을 다시 생성하는 방식으로 해결했다. 통합 후 관련 검사 113개와 실제 브라우저 검사 7개(다크모드, 키워드 이펙트, 오프라인 저장·인쇄)가 통과했다. 비밀 키 누출 검사와 부록 A SQL 원문 검사도 통과했다. 로그는 `artifacts/qa/publish-merged-unit.log`, `publish-merged-browser.log`에 보관한다.

## 운영 연결 준비 — 2026-10-22

사용자가 GitHub 업로드와 운영 서버 연동을 요청하여 Task 15 Step 3의 운영 반영을 승인했다. 이후 제공한 프로젝트 ref `ytushlpqhdqyimwyempg`와 publishable 공개 키만 `cloud.json`에 반영했다. 비밀 키·DB 비밀번호는 받거나 커밋하지 않았다.

공개 키로 처음 조회했을 때 Auth 설정은 HTTP 200, Google 공급자는 꺼짐, Email 공급자는 켜짐이었다. `profiles`와 `export-manifest`는 아직 없었다. 이후 사용자가 공식 CLI의 일회용 인증을 완료했고, 프로젝트 이름 `PP Monster`·지역 `ap-northeast-2`·상태 `ACTIVE_HEALTHY`를 확인한 뒤 연결했다.

공개 설정 반영 후 빌드 성공, CSP·비밀 키 유출 방지·SQL 원문·클라이언트·클라우드 형식 검사 24/24 통과. 이 결과는 운영 저장·Google 로그인·백업 성공을 의미하지 않는다. 서버 배포 및 인증 설정 확인 전에는 버전을 1.6.0으로 올리거나 Pages에 게시하지 않는다.

## 운영 서버 반영 — 2026-10-22

`db push --dry-run`에서 계획의 마이그레이션 세 개만 확인한 뒤 그대로 적용했다. 운영 이력의 `20261021000001`·`20261021000002`·`20261021000003`이 로컬과 일치한다. 부록 A SQL은 수정하지 않았다. 운영의 앱 표 10개 모두 RLS가 켜져 있고, 클라이언트의 작업 INSERT 및 감사·그림 메타데이터 읽기 권한 회수가 적용됐다. `blobs` 버킷은 공개 다운로드, 최대 20 MiB, PNG/JPEG/WebP 제한이며 Realtime 공개 대상은 `public_feed`뿐이다.

`ALLOWED_ORIGINS=https://lolipop000000.github.io`를 설정하고 `api`·`export-manifest`·`maintenance`를 배포했다. 세 함수 모두 ACTIVE/버전 1이며, 계획대로 게이트웨이 JWT 검사 대신 각 핸들러의 권한 검사를 사용한다. 정리 함수는 관리 키 없이 거부되는지만 확인했고 정리 작업 자체는 실행하지 않았다.

| 실제 운영 HTTP 검사 | 결과 |
|---|---|
| 로그인 없는 공개 manifest GET | 200, `card-print-studio-manifest` |
| 로그인 없는 저장 API POST | 401, `unauthenticated` |
| Pages 출처의 API OPTIONS | 204, 지정한 출처 허용 |
| 허용하지 않은 출처의 API OPTIONS | 403, 출처 허용 헤더 없음 |
| 로그인 없는 정리 함수 POST | 401, `unauthorized` |

상세 공개 응답 기록은 커밋에서 제외한 `artifacts/qa/production-cloud-probe.json`에 있다. 별도 임시 설정으로 Auth Site URL을 `https://lolipop000000.github.io/card-print-studio/`, 추가 redirect를 `https://lolipop000000.github.io/card-print-studio/**`로 설정했다. 적용 전 두 update만 검토했고, 선언하지 않은 기존 Auth·MFA·Storage 등 8개 설정은 보존했다. 로컬 개발용 `supabase/config.toml`은 바꾸지 않았다.

비공개 백업 저장소 `lolipop000000/card-print-studio-backup`을 만들고 비공개 여부를 확인했다. Actions에는 공개 값인 `SUPABASE_URL`만 등록했다. 관리 키·DB 접속 비밀번호·백업 전용 최소 권한 토큰은 아직 등록되지 않아 자동 백업과 첫 워크플로 검증은 미완료다. Google 로그인 연결은 사용자가 Google Cloud 프로젝트를 만든 뒤 기본 앱 설정을 진행 중이며, 실제 로그인·저장과 최종 Pages/Release 게시는 아직 완료되지 않았다.

## Google 로그인 연결 확인 — 2026-10-22

사용자가 Google 로그인 앱 이름을 `PP Login`으로 정하고 OAuth 클라이언트 비밀을 Supabase에 직접 입력했다. 운영 공개 설정 조회에서 Google `true`, Email `false`, 신규 가입 허용을 확인했다. 인증 시작 요청은 Google의 `accounts.google.com`으로 HTTP 302 이동했고, 클라이언트 ID 형식과 Supabase callback 주소가 일치했다. 사용자는 Google 테스트 사용자 등록도 완료했다. 이 확인에는 실제 계정 로그인과 카드 저장은 포함되지 않는다.

배포 파일을 1.6.0으로 올리고 package·lock·release·update의 버전 일치 및 두 HTML의 바이트 일치를 확인했다. 새로운 빌드에서 전체 단위 검사 510/510과 로컬 Supabase 통합 검사 21/21이 통과했다. 전체 브라우저 검사는 524개 통과·실패 0개이며, 고정 모델 파일이 필요한 선택적 U2NetP 실제 추론 1개를 생략했다. 로그는 `artifacts/qa/cloud-release-unit.log`, `cloud-release-browser.log`, `cloud-release-integration.log`, 공개 인증 확인은 `production-auth-probe.json`에 보관한다. 백업 관리 키·DB 접속 주소·백업 저장소 전용 토큰은 사용자가 GitHub Actions에 직접 등록했으며 값은 읽지 않고 네 설정 이름만 확인했다.

## PP Monster 표시 이름 — 2026-10-22

사용자 요청으로 화면·브라우저 탭·업데이트 창·로딩과 오류 안내·PDF 제작자 이름을 PP Monster로 바꿨다. 기존 JSON 형식·브라우저 저장 설정·다운로드 파일명과 저장소 주소를 유지한다. 제목이 예전 이름이라 실패하는 브라우저 검사를 확인한 뒤 변경했고, 최종 빌드의 이름·기존 JSON 저장과 재열기·PDF 표시 검사 1/1, 영향 범위 브라우저 검사 29/29, 전체 단위 검사 510/510이 통과했다. 원래 전체 브라우저 회귀는 이름 변경 전에 끝냈으며, 이름 변경 후 전체 회귀를 다시 수행한 것으로 표현하지 않는다. 최종 HTML과 해시는 [verification.md](verification.md)에 있다.

## 실제 게시 확인 — 2026-10-22

[PR #1](https://github.com/lolipop000000/card-print-studio/pull/1)을 `11a8b817d9eb9a668bf6b76cbb8116afd5a3914f`로 main에 병합했다. [Pages 실행](https://github.com/lolipop000000/card-print-studio/actions/runs/39631830163)의 빌드와 배포가 모두 성공했다. [PP Monster 웹](https://lolipop000000.github.io/card-print-studio/)과 [1.6.0 Release](https://github.com/lolipop000000/card-print-studio/releases/tag/v1.6.0)를 공개했다. Release에는 HTML·라이선스·업데이트 정보·사용 안내·이펙트 품질 규칙·검증 기록 여섯 파일이 있다.

2026-10-21 16:13:07 UTC(한국 시각 2026-10-22)에 공개 Pages HTML, main의 update.json, 최신 Release, Release의 실제 HTML 다운로드를 자동 검사했다. 네 요청 모두 HTTP 200이며 버전 1.6.0과 HTML SHA-256 `f2c3ab5a3e022db7e1f8a78e87573f4fa60611a626f5c060b2623ab093e74999`가 일치했다. [게시 검사 결과](evidence/cloud/production-release.json)에 보관했다.

새 Edge 환경에서 실제 HTTPS 페이지의 PP Monster 제목·상단 이름, Google 로그인 버튼, 다크모드의 재실행 유지와 카드 픽셀 보존, 390×844 모바일 작업 메뉴를 확인했다. 페이지 스크립트 오류는 0개였다. 첫 모바일 검사에서는 접힌 메뉴 안의 버튼을 곧바로 찾는 검사 가정이 잘못돼 실패했고, 실제 메뉴를 여는 절차로 고친 뒤 통과했다. 앱 코드는 바꾸지 않았다. [공개 화면 검사 결과](evidence/cloud/production-page.json)에 보관했다. 이는 실제 모바일 기기 검사나 Google 계정 로그인 성공을 의미하지 않는다.

## 첫 운영 백업 — 2026-10-22

사용자가 네 Actions 설정을 직접 저장한 뒤 이름만 확인하고 [첫 백업 실행](https://github.com/lolipop000000/card-print-studio/actions/runs/39631861824)을 시작했다. 비공개 목적지 확인, DB 덤프·새 그림 검증과 저장, 백업 커밋·푸시가 성공했다. 비공개 저장소의 커밋 `216a9bef07cd0044c5eef0196582b19b11c2607c`(2026-10-21 16:07:51 UTC)를 메타데이터로 확인했다. DB 덤프 내용과 비밀 값은 읽지 않았다.

뒤따르는 `Maintenance after successful backup push` 단계는 실패했다. 따라서 전체 워크플로 성공이나 정리 함수의 운영 동작을 검증했다고 주장하지 않는다. 자동 승인 검토가 전체 실패 로그의 로컬 저장을 거부해, 사용자에게 HTTP 상태와 오류 코드만 요청했다. 정리 오류의 원인은 아직 확정하지 않았다. 매일 03:00 KST 예약은 등록돼 있지만 첫 예약 실행과 운영 복원은 아직 확인하지 않았다.

## 백업 인증 진단 — 2026-10-22

전체 실패 로그 대신 상태·허용된 오류 코드·성공 시 정리 수량만 기록하는 `maintenance-result` 첨부 파일을 추가했다. 새 서버 키의 `apikey` 인증과 기존 관리 키 인증을 모두 정확히 비교하며, 인증 실패 원인은 고정된 네 코드로만 구별한다. 키·해시·접속 주소·응답 원문·예외 메시지는 기록하지 않는다. 단위 검사에서 먼저 실패를 확인한 뒤 전체 523/523, 실제 로컬 Supabase 통합 검사 2/2가 통과했다. 독립 리뷰에서도 기존 인증 판단의 변경이나 진단 출력의 비밀 값 노출을 발견하지 않았다. 로그는 `artifacts/qa/maintenance-auth-reason-unit.log`, `maintenance-auth-reason-integration.log`에 있다. 이번 서버 진단 변경으로 전체 브라우저 회귀를 다시 수행한 것은 아니다.

[진단 실행 39690277171](https://github.com/lolipop000000/card-print-studio/actions/runs/39690277171)은 DB·그림 백업과 비공개 푸시를 성공했으나 후속 정리에서 HTTP 401, `unauthorized-legacy-key-mismatch`를 반환했다. 공식 관리 도구에서 받은 운영 프로젝트의 기존 관리 키로 GET 인증만 확인해도 같은 결과였다. 따라서 GitHub에 잘못 입력한 문제만으로 단정하지 않는다. 같은 도구의 새 서버 키로 GET은 405 `method-not-allowed`를 반환해 관리자 인식을 확인했고, 그림 버킷 메타데이터 읽기도 200이었다. 이 검사는 실제 정리를 실행하지 않으며 키는 프로세스 메모리에서만 사용했다.

검증한 새 서버 키로 기존 GitHub Actions 비밀 설정을 교체하려는 작업은 자동 승인 검토에서 명시적 교체 승인 부족과 기존 백업에 미칠 영향을 이유로 거부됐다. 교체하지 않았으며 사용자 승인을 요청했다. 승인 후 키를 화면·코드·파일에 남기지 않고 기존 비밀 설정에 직접 전달하고, 전체 백업을 다시 실행해 정리 성공까지 확인해야 한다. 전체 백업 워크플로 성공·예약 실행·운영 복원은 여전히 미검증이다.

## 백업 인증 복구 완료 — 2026-10-22

사용자가 “교체하고 백업 다시 검증”으로 명시 승인했다. 공식 관리 도구에서 검증한 새 서버 키를 프로세스 메모리에서 GitHub 비밀 설정의 표준 입력으로 직접 전달했다. 키는 화면·인수·코드·파일에 기록하지 않았다. 교체 전 관리자 GET 405와 그림 버킷 메타데이터 GET 200을 다시 확인했다.

[백업 실행 39690857652](https://github.com/lolipop000000/card-print-studio/actions/runs/39690857652)이 전체 성공했다. DB·그림 저장, 비공개 백업 푸시, 후속 정리와 안전한 결과 첨부 단계가 모두 성공했다. 허용된 결과 첨부 파일만 받아 확인했으며 정리 함수 결과는 HTTP 200, `ok`, 정리 수량은 휴지통 0·그림 0·감사 기록 0이었다. 전체 실패 로그와 DB 덤프 원문은 읽지 않았다. 결과는 Git에서 제외한 `artifacts/qa/maintenance-result-39690857652/maintenance-result.json`에 있다. 실제 예약 실행과 운영 복원은 여전히 별도 확인 대상이다.

## 에셋 보관함과 내 계정 설정 — 2026-10-22

사용자가 승인한 후속 구성대로 이미지·내 자료·공개 자료·휴지통을 에셋 보관함에 통합했다. 내 계정 설정에서 Google 로그인, 닉네임 변경, 승인 상태, 사용량과 로그아웃을 다룬다. 닉네임은 승인 후 정상 표시된다는 사용자 확인에 따라 서버의 닉네임 정책은 바꾸지 않았다. SQL 원문과 부록 B 권한, 비밀 키 경계를 유지한다.

새 보관함 검사 11개와 기존 계정·공개 목록·공유 에셋 검사를 합친 **32/32**가 최종 수정본에서 통과했다. 초기 기능 부재와 리뷰에서 발견한 마지막 이미지 삭제 후 복귀, 상세 뒤로 가기의 스크롤·초점, 데스크톱 키보드 초점은 각각 실패를 재현한 뒤 고쳤다. 계정 정보가 늦게 오는 경우와 오래된 조회가 멈춰도 새로고침으로 회복하는 경우도 각각 실패를 확인한 뒤 수정했다. 독립 재검토에서 남은 지적은 없다.

모바일 보관함·작업 화면·두 손가락 조작의 관련 검사 **18/18**도 통과했다. 두 손가락 이동 이벤트는 한 화면 갱신에 함께 적용해, 중간 축소 때문에 스크롤 이동량이 사라지는 회귀를 고쳤다. 위 검사 수에는 서로 겹치는 항목이 있어 합산하지 않는다. 최종 계정·보관함 로그는 Git에서 제외한 `artifacts/qa/library-hub-account-ready.log`에 보관한다. 실제 모바일 하드웨어와 물리 인쇄는 이번 검사 범위에 포함하지 않는다.

최종 수정본에서 별도 Edge 프로필 두 개로 실제 로컬 Auth/API/Realtime을 사용해 공개·사본·공유 에셋 갱신과 공개 해제·삭제, 저장 충돌 선택, 준멤버 11장째 거부와 승인 해제 후 다음 저장 차단을 다시 확인했다. 페이지 스크립트 오류는 0개였다. [실제 서버 UI 결과](evidence/cloud/library-hub-local-ui.json)에 기록했으며, 이는 실제 Google 계정 인증이나 운영 카드 저장을 자동으로 검증했다는 뜻은 아니다.

전체 자동 검사 1,060개는 1,058개 통과·1개 실패·1개 선택적 U2NetP 추론 생략이었다. 유일한 실패에서 실행 취소의 예약된 화면 갱신이 입력 중인 그림 배율을 덮어쓰는 문제를 결정적으로 재현해 고쳤다. 수정 후 새 회귀와 기존 확대 픽셀·저장 검사를 포함한 그림·모바일 18/18과 독립 재검토를 통과했다. 전체 명령을 수정 후 다시 실행한 것은 아니다. 자세한 결과와 배포 HTML 해시는 [검증 기록](verification.md)에 있다.
