# 클라우드 저장과 공용 공유 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 멤버가 작업을 Supabase 클라우드에 저장·공개·복사·삭제하고, 공개 목록이 실시간으로 갱신되며, 게임이 공개 결과물을 증분 다운로드할 수 있게 한다.

**Architecture:** 모든 쓰기는 Edge Function `api` 하나를 통과하고, 클라이언트의 직접 쓰기는 RLS와 버킷 정책으로 전부 막는다. 함수의 판단 로직은 DOM·Deno에 의존하지 않는 순수 JS(`supabase/functions/_shared/`)로 짜서 Node 테스트에서 메모리 저장소로 검증한다. 그 다음 Deno 어댑터와 실제 테스트 프로젝트에서 권한 행렬을 검증한다. 그림은 SHA-256 내용 주소 blob으로 분리해서 프로젝트 JSON에는 참조만 둔다. 작업실 쪽은 `src/cloud/`의 세션 계층과 `src/ui/cloud-*.js` 화면으로 나눈다.

**Tech Stack:** 기존 ES modules·esbuild 0.28.2·Node 24 `node:test`·Playwright 1.62.1(Edge). 새로 쓰는 것: `@supabase/supabase-js` 2.118.0(작업실 번들), Supabase CLI 2.121.0(`npx supabase`, Docker 없이 원격 프로젝트에 `db push`·`functions deploy --use-api`), Supabase Edge Functions(Deno), GitHub Actions(Pages, 백업).

**Spec:** `docs/superpowers/specs/2026-10-21-cloud-sharing-design.md`

**스펙과 다르게 정한 것 (스펙의 "내 판단" 범위 안):**
1. **실시간 구독 대상**: `works`·`shared_assets`를 직접 구독하지 않고, 트리거로 유지하는 가벼운 `public_feed` 표만 구독한다. 이유는 두 가지다. 작업 JSON이 수백 KB라 Realtime 메시지 크기를 넘을 수 있고, 행 전체가 전송되는 경로를 아예 없애야 비공개 내용이 새지 않는다.
2. **WebP 무손실 재인코딩을 하지 않는다**: 중복 제거만으로 3명 × 120장이 한도 안에 들어가고, 브라우저마다 "무손실" 보장이 달라 원본 손상 위험이 있다.

## Global Constraints

- 작업 위치: worktree `../card-print-studio-cloud`, 브랜치 `feat/cloud-sharing`(origin/main fa2349e 기준). 다른 worktree의 v1.5.3 작업은 건드리지 않는다.
- 등급: `pending` | `trial` | `member` | `revoked`. 쓰기는 `trial`·`member`만 가능하다.
- `tier_limits` 기본값: `trial` = 카드 10장 · 이미지 15,728,640 B, `member` = 카드 120장 · 이미지 157,286,400 B. 함수는 이 표에서 읽고, 숫자를 하드코딩하지 않는다.
- 시간당 횟수: 일반 쓰기(확정 저장·공개 전환·복사·삭제·복구·에셋 쓰기·닉네임) 60회, 초안 저장 240회(같은 작업은 30초에 1회), blob 업로드 200개. 일괄 올리기는 계정당 하루 1회, 덱 50개, blob 2,000개까지이고 카드·이미지 한도는 똑같이 적용한다.
- blob: PNG·JPEG·WebP만 허용하고 매직 넘버로 확인한다. 하나 최대 20 MiB(20,971,520 B). 경로는 `blobs/{sha256 소문자 hex 64자}`이고 공개 읽기다. **이번 범위에서는 이미지를 재인코딩(WebP 변환)하지 않는다.** 스펙의 "내 판단" 항목인데, 중복 제거만으로 3명 × 120장이 한도 안에 들어가므로 뺐다.
- 작업 JSON(blob 참조로 바꾼 뒤) 최대 8 MiB, 깊이 64, `__proto__`·`constructor`·`prototype` 키는 금지한다.
- 버전 기록은 작업마다 최근 20개, 휴지통은 30일 보관한다. 닉네임은 NFC 정규화 후 2~20자이고, 제어문자는 금지하며, `lower(nickname)` 기준으로 중복될 수 없다.
- service role key는 Edge Function 환경 변수와 GitHub Actions secret에만 둔다. 작업실에는 anon key와 URL만 들어간다(`cloud.json`, 커밋해도 되는 공개 값).
- 기존 프로젝트 v1과 카드 파일 v1 형식, `validateProject`, file:// 오프라인 흐름, 기존 테스트 전체를 유지한다. 브라우저 테스트는 실제 네트워크를 차단하고 가짜 클라우드로 돌린다.
- UI 문구는 한국어로 쓴다. 공개 목록에는 닉네임만 표시한다.

## Review Focus

1. **세션 토큰 만료**: 몇 시간 동안 편집하다 저장하면 토큰을 자동 갱신하고 한 번 재시도해야 한다. 내용을 잃거나 "권한 없음"이 뜨면 안 된다 → Task 7 `refreshes expired session once before failing`.
2. **열린 탭에서 승인이 해제된 경우**: 서버가 403을 보내면 작업실은 읽기 전용 안내로 바꾸고, 편집 내용은 로컬 자동 복구에 남겨야 한다. 자동 저장을 반복해서 시도하면 안 된다 → Task 7 `stops autosave and keeps recovery after revocation`.
3. **blob 업로드 중 끊김**: 일부 blob만 올라간 상태에서 확정 저장이 성공하면 안 된다(서버가 없는 해시 참조를 거부). 다시 시도하면 빠진 것만 올라가야 한다 → Task 4 `rejects work referencing unknown blob`, Task 7 `resumes missing blob uploads`.
4. **Supabase 프로젝트 일시정지·연결 불가**: 저장 실패를 "실패 · 다시 시도"로 보여 주고, 편집은 계속 가능해야 한다. 로컬 복구에 남아야 한다 → Task 7 `network failure keeps editing and recovery`.
5. **승인 대기 사용자의 Ctrl+S**: 오류를 띄우지 않고 기존 파일·폴더 저장으로 동작하며, 승인 대기 안내를 한 번 보여 줘야 한다 → Task 8 `pending user ctrl+s falls back to local save`.

---

### Task 0: 운영자 준비 (사용자가 직접 진행, 구현자는 안내만)

계정 생성과 비밀값 입력은 사용자가 직접 한다. 구현자는 아래 순서를 `docs/cloud-setup.md`로 써서 사용자에게 주고, 값을 받을 때까지 Task 3 이후의 원격 단계를 진행하지 않는다.

**Files:**
- Create: `docs/cloud-setup.md`

- [x] **Step 1:** `docs/cloud-setup.md`에 순서를 작성한다. (2026-10-21 작성 완료. 상세 절차는 그 문서를 보고, 아래는 요약이다.)
  1. Supabase 프로젝트 두 개를 만든다. 운영용 `card-studio`와 테스트용 `card-studio-test`이며, 무료 플랜 2개를 다 쓴다.
  2. Supabase 계정과 관리자 Google 계정에 2단계 인증을 켠다.
  3. Google Cloud Console에서 OAuth 클라이언트(웹)를 만든다. 승인된 리디렉션 URI는 운영 프로젝트의 `https://<ref>.supabase.co/auth/v1/callback`이다.
  4. Supabase Auth → Providers → Google을 켜고 클라이언트 ID와 비밀값을 넣는다. Site URL과 Redirect URLs에 `https://lolipop000000.github.io/card-print-studio/`를 넣는다.
  5. 테스트 프로젝트에서만 Email 공급자를 켠다. 통합 테스트가 비밀번호 계정을 만들기 때문이다.
  6. GitHub 저장소 Settings → Pages → Source를 "GitHub Actions"로 설정한다.
  7. 비공개 저장소 `card-print-studio-backup`을 만들고, 쓰기 권한이 있는 fine-grained PAT를 발급한다.
  8. GitHub Actions secrets: `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_REPO_TOKEN`
  9. 로컬 테스트용 환경 변수 파일 `.env.cloud-test`(gitignore에 추가): `CLOUD_TEST_URL`, `CLOUD_TEST_ANON_KEY`, `CLOUD_TEST_SERVICE_KEY`, `CLOUD_TEST_DB_URL`
- [x] **Step 2:** `.env.cloud-test`는 기존 `.gitignore`의 `.env.*` 규칙으로 이미 제외된다. `git check-ignore .env.cloud-test`로 확인한다.
- [ ] **Step 3 (사용자):** 사용자가 `docs/cloud-setup.md`의 체크 항목을 모두 끝냈다고 알려 줄 때까지 원격 단계(Task 3·5·12·14·15)를 시작하지 않는다. 원격 없이 가능한 작업은 부록 D를 본다.

---

### Task 1: 클라우드 형식 변환과 해시

**Files:**
- Create: `src/cloud/cloud-format.js`
- Test: `tests/cloud-format.test.mjs`

**Interfaces:**
- Produces:
  - `sha256Hex(bytes: Uint8Array): Promise<string>`: `crypto.subtle`을 쓴다(브라우저, Node 24, Deno 공통).
  - `BLOB_REF_PREFIX = 'blob:sha256:'`
  - `toCloudProject(project): Promise<{data: object, blobs: Map<string, {mime: string, bytes: Uint8Array}>}>`: `project.assets[*].dataUrl`과 `project.paintings[*]` 레이어의 `png`를 `'blob:sha256:<hex>'` 문자열로 바꾼다. 원본 객체는 바꾸지 않는다.
  - `fromCloudProject(data, fetchBlob: (hex) => Promise<Uint8Array>): Promise<project>`: 참조를 다시 `data:<mime>;base64,…`로 되돌린다. mime은 같은 항목의 `mime` 필드를 쓰고, 레이어는 `image/png`이다.
  - `collectBlobRefs(value: any): string[]`: 중복 없이 정렬해서 반환한다.
  - `cloudProjectForValidation(data): object`: 참조를 같은 mime의 최소 base64(`'AAAA'`)로 바꾼 사본이다. 서버 검증에 쓴다.
  - `toCloudLibraryEntry(entry)`, `fromCloudLibraryEntry(data, fetchBlob)`: 이미지 보관함 항목(`src/model/asset-library.js` 형식)에 같은 규칙을 적용한다.

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/cloud-format.test.mjs`)
  - `round trips a project with art, layers and keyword icons byte-for-byte`: `createProject()`에 PNG 에셋 2개(그중 하나는 같은 바이트를 두 ID가 공유)와 그림 레이어 1개를 넣는다. `fromCloudProject(toCloudProject(p).data, fetch)`를 `JSON.stringify`로 비교하면 원본과 같다. `blobs.size === 2`이다.
  - `replaces every data url with a 64-hex reference`: `JSON.stringify(data)`에 `'data:image'`가 없다. 모든 참조가 `/^blob:sha256:[0-9a-f]{64}$/`에 맞는다.
  - `validation copy passes validateProject without pixel bytes`: `validateProject(cloudProjectForValidation(data))`의 결과가 `[]`이다.
  - `fromCloudProject rejects a blob whose hash does not match`: `fetchBlob`이 다른 바이트를 돌려주면 `'그림 데이터가 손상'`을 포함하는 오류를 던진다.
  - `does not mutate the input project`
- [ ] **Step 2:** `node --test tests/cloud-format.test.mjs`를 실행해서 실패를 확인한다(모듈 없음).
- [ ] **Step 3:** `src/cloud/cloud-format.js`를 구현한다. base64 변환에는 기존 `atob`/`btoa`를 쓴다.
- [ ] **Step 4:** 같은 명령으로 PASS를 확인한다.
- [ ] **Step 5:** 커밋한다: `git add src/cloud/cloud-format.js tests/cloud-format.test.mjs && git commit -m "feat(cloud): content-addressed cloud project format"`

---

### Task 2: 서버용 검증 번들

**Files:**
- Create: `src/cloud/server-model.js`: 서버가 쓸 함수만 다시 내보낸다.
- Create: `scripts/build-server-model.mjs`: esbuild로 `format:'esm'`, `platform:'neutral'` 번들을 `supabase/functions/_shared/model.bundle.js`에 쓴다.
- Modify: `package.json`: `"build:server": "node scripts/build-server-model.mjs"`
- Test: `tests/server-model.test.mjs`

**Interfaces:**
- Produces (`model.bundle.js`의 export):
  - `validateCloudWork(data): {cardCount: number, blobRefs: string[]}`: 실패하면 `Error`의 `.code='invalid-work'`이다. 내부에서 `validateProject(cloudProjectForValidation(data))`와 깊이·크기·금지 키를 검사한다.
  - `validateCloudAsset(kind: 'effect_template'|'image'|'card_template'|'keyword', data): {blobRefs: string[]}`
    - `effect_template`는 `validateVisualEffects`를 쓴다.
    - `card_template`는 `validateCardTemplates([data.template])`를 쓴다.
    - `keyword`는 프로젝트 키워드 검증을 쓴다. 한 개짜리 임시 프로젝트를 만들어 검증한다.
    - `image`는 `fromCloudLibraryEntry` 형식 검사를 쓴다. 바이트 없이 구조만 검사한다.
  - 데이터 형식: `{kind, item, blobs}`이다. `item`은 해당 원본 항목이고, `blobs`는 이미지 참조 목록이다(Task 10에서 사용).
  - `sniffImage(bytes: Uint8Array): 'image/png'|'image/jpeg'|'image/webp'|null`: `src/model/asset-library.js`의 `imageSize` 판정 로직을 공용으로 뽑아서 쓴다. 기존 모듈은 이 함수를 import하도록 리팩터링한다.
  - `sha256Hex`, `collectBlobRefs`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `bundle imports without DOM globals`: `globalThis.document`와 `window`가 없는 상태에서 번들을 `import()`하면 성공한다.
  - `validateCloudWork counts cards and refs`: 카드 3장, 참조 2개인 작업에서 `{cardCount:3, blobRefs:[a,b]}`이다.
  - `rejects prototype keys and depth 65`
  - `rejects 8 MiB + 1 byte JSON`
  - `sniffImage` 표 검사: 진짜 PNG, JPEG, WebP는 해당 mime을 돌려준다. SVG 텍스트, GIF, HTML, PNG 헤더 뒤에 HTML을 붙인 바이트는 앞 헤더 기준으로만 판정하므로 `image/png`를 돌려주되 Task 4에서 크기 검사를 함께 한다. 빈 바이트는 `null`이다.
- [ ] **Step 2:** `npm run build:server && node --test tests/server-model.test.mjs` → FAIL을 확인한다.
- [ ] **Step 3:** 구현한다. 번들 결과 파일도 커밋한다(Deno 배포에서 그대로 import).
- [ ] **Step 4:** 위 명령과 기존 `node --test tests/asset-library.test.mjs`가 모두 PASS인지 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): shared server validation bundle`

---

### Task 3: 데이터베이스 스키마, RLS, 공개 피드

> 마이그레이션 원문은 **부록 A**, 테스트 기대값은 **부록 B**에 있다. 아래 Interfaces는 요약이다.

**Files:**
- Create: `supabase/config.toml` (`npx supabase init` 결과)
- Create: `supabase/migrations/20261021000001_cloud_schema.sql`
- Create: `supabase/migrations/20261021000002_cloud_policies.sql`
- Create: `tests/cloud/helpers.mjs`: 테스트 프로젝트 클라이언트, 사용자 생성(`auth.admin.createUser` + 비밀번호 로그인), 상태 지정
- Test: `tests/cloud/rls.integration.mjs`
- Modify: `package.json`: `"test:cloud": "node --env-file=.env.cloud-test --test --test-concurrency=1 tests/cloud/*.integration.mjs"`

**Interfaces (스키마, 이후 Task가 쓰는 이름):**
- `profiles(id uuid pk → auth.users, nickname text unique-ci null, status text check in (pending,trial,member,revoked) default 'pending', created_at)`
  - 트리거 `on_auth_user_created`가 `pending` 행을 만든다.
- `tier_limits(tier text pk, max_cards int, max_blob_bytes bigint)`: 기본 행은 Global Constraints 값이다.
- `works(id uuid pk, owner uuid, title text, visibility text check in (private,public) default 'private', data jsonb not null, card_count int, blob_refs text[], version int, source_work_id uuid null, source_owner uuid null, updated_at, deleted_at null)`
- `work_drafts(work_id uuid pk → works on delete cascade, owner uuid, data jsonb, card_count int, blob_refs text[], saved_at timestamptz)`
- `work_versions(id bigserial, work_id, version int, data jsonb, blob_refs text[], created_at)`
- `shared_assets(id uuid pk, owner, kind text check in (effect_template,image,card_template,keyword), title, visibility, data jsonb, blob_refs text[], version int, source_asset_id, source_owner, updated_at, deleted_at)`
- `blobs(sha256 text pk check (sha256 ~ '^[0-9a-f]{64}$'), mime text, bytes bigint, uploader uuid, created_at)`
- `audit_log(id bigserial, actor uuid, action text, target uuid null, ok boolean, detail jsonb, created_at)`
- `import_runs(owner uuid, started_at timestamptz)`
- `public_feed(kind text check in (work,asset), item_id uuid pk, owner uuid, nickname text, title text, asset_kind text null, version int, updated_at)`
  - `works`와 `shared_assets`에 대한 AFTER 트리거로 유지한다. 공개이면서 삭제되지 않았으면 upsert하고, 아니면 delete한다.
  - Realtime publication에는 **`public_feed`만** 넣는다.
- 뷰 `public_profiles(id, nickname)`
- SQL 함수 `owner_usage(uid uuid) returns (cards int, blob_bytes bigint)`:
  - cards: 삭제되지 않은 works에서 `greatest(works.card_count, coalesce(draft.card_count,0))`의 합
  - blob_bytes: 삭제되지 않은 works, 초안, shared_assets의 `blob_refs`를 합친 고유 해시들의 `blobs.bytes` 합
- **RLS**: 모든 표에서 RLS를 켜고, `anon`·`authenticated`에 **INSERT·UPDATE·DELETE 정책을 두지 않는다.** SELECT 정책은 다음과 같다.
  - `works`, `shared_assets`: `(visibility='public' and deleted_at is null) or owner = auth.uid()`
  - `work_drafts`, `work_versions`: owner 본인만 읽는다(`work_versions`는 works의 owner와 조인).
  - `public_feed`, `tier_limits`, `public_profiles`: 누구나 읽는다.
  - `profiles`: 본인 행만 읽는다.
  - `audit_log`, `blobs`, `import_runs`: 정책 없음(service role만 접근).
- Storage: 버킷 `blobs`(public=true, `allowed_mime_types` png/jpeg/webp, `file_size_limit` 20971520)를 만든다. `storage.objects`에 anon·authenticated의 insert·update·delete 정책을 두지 않는다.

- [ ] **Step 1: 실패하는 통합 테스트 작성** (`tests/cloud/rls.integration.mjs`, 서비스 키로 직접 시드)
  - `anon reads public works and feed but never private rows or drafts`
  - `member reads own private work and own draft, not another member's`
  - `every client role is denied insert, update and delete on every table`: anon, pending, trial, member 각각으로 각 표에 대해 시도하고, 오류가 나거나 영향 행이 0인지 확인한다.
  - `client cannot upload to blobs bucket`
  - `feed row appears on publish and disappears on unpublish and soft delete`
  - `owner_usage counts max of saved and draft cards and unique blob bytes`
  - `realtime delivers feed changes only`: anon 구독을 연다. 비공개 작업 저장에는 메시지가 0개이고, 공개 전환에는 INSERT 1개, 비공개 전환에는 DELETE 1개가 온다.
- [ ] **Step 2:** `npx supabase link --project-ref <test-ref> && npx supabase db push` 전에 `npm run test:cloud`를 실행해서 FAIL(표 없음)을 확인한다.
- [ ] **Step 3:** 두 마이그레이션을 작성하고 테스트 프로젝트에 `db push`한다.
- [ ] **Step 4:** `npm run test:cloud`가 PASS인지 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): schema, row level security and public feed`

---

### Task 4: API 핸들러 (순수 로직)

> 요청·응답 형식, 동시성 규칙, 한국어 오류 문구는 **부록 C**, 금지 사항은 **부록 E**에 있다.

**Files:**
- Create: `supabase/functions/_shared/handlers.js`
- Create: `supabase/functions/_shared/limits.js`
- Create: `tests/helpers/memory-repo.mjs`: Task 3 스키마를 흉내 내는 메모리 저장소
- Test: `tests/cloud-handlers.test.mjs`

**Interfaces:**
- Consumes: Task 2 번들 export
- Produces:
  - `createApi({repo, storage, now}): {handle(user: {id}|null, action: string, payload: object): Promise<object>, uploadBlob(user, sha: string, bytes: Uint8Array): Promise<{sha256}>}`
  - 실패하면 `ApiError(status: number, code: string, message: string)`를 던진다. 코드 목록: `unauthenticated`(401), `not-member`(403), `forbidden`(403), `not-found`(404), `conflict`(409), `limit-cards`/`limit-bytes`/`limit-rate`/`limit-import`(429), `invalid`(400), `unknown-blob`(400)
  - **repo 인터페이스** (Task 5에서 Supabase로 구현):
    - `getProfile(id)`, `setNickname(id, nickname)`, `getTierLimits(tier)`, `usage(id)`
    - `countAudit(id, actions: string[], sinceMs)`, `audit(entry)`
    - `getWork(id)`, `insertWork(row)`, `updateWork(id, patch, {expectVersion})`
    - `getDraft(workId)`, `putDraft(row, {expectSavedAt})`, `deleteDraft(workId)`
    - `pushVersion(workId, version, data, refs)`, `pruneVersions(workId, keep)`
    - `getAsset`, `insertAsset`, `updateAsset`
    - `hasBlobs(hashes): string[]`(있는 것들), `insertBlob(row)`
    - `importRunsSince(id, ms)`, `startImport(id)`
  - `storage`: `put(sha, bytes, mime)`
  - **action 목록과 payload:**
    - `profile.setNickname {nickname}` → `{nickname}`
    - `work.create {title, data}` → `{id, version:1}`
    - `work.saveDraft {id, data, baseSavedAt}` → `{savedAt}`
    - `work.save {id, data, baseVersion}` → `{version}`: 버전을 기록하고, 20개만 남기고, 초안을 지운다.
    - `work.setVisibility {id, visibility}`
    - `work.copy {sourceId}` → `{id}`: 원본은 public이어야 한다. 출처를 기록하고 카드 한도를 검사한다.
    - `work.delete {id}`, `work.restore {id}` (30일 이내만)
    - `blob.missing {hashes}` → `{missing}`
    - `asset.create {kind, title, data}`, `asset.save {id, data, baseVersion}`, `asset.setVisibility`, `asset.copy {sourceId}`, `asset.delete`, `asset.restore`
    - `import.begin {}` → `{token, expiresAt}`: 하루 1회, 2시간 동안 유효하다. 토큰이 있는 요청은 시간당 횟수 대신 덱 50개와 blob 2,000개 상한을 쓴다.
  - 공통 순서: 사용자 확인 → `status ∈ {trial, member}` 확인(아니면 `not-member`) → 소유자 확인 → 서버에서 계산한 `cardCount`·`blobRefs`로 한도 확인(참조한 blob이 모두 존재하는지도 확인) → 시간당 횟수 → 쓰기 → `audit`. 실패도 `ok:false`로 기록한다.

- [ ] **Step 1: 실패하는 테스트 작성** (메모리 repo 사용, 대표 assertion)
  - `pending and revoked users get not-member for every write action`: 모든 action에 대해 반복한다.
  - `member cannot save, delete or change visibility of another member's work`: 대상이 비공개면 `not-found`(404), 공개면 `forbidden`(403). 부록 B와 같다.
  - `trial 11th card is rejected via create, save, draft, copy and import`: `limit-cards`. 10장째까지는 성공한다.
  - `member 121st card is rejected`
  - `demoted member over limit keeps existing work but cannot add cards`: 120장에서 trial로 강등된 사용자가 그대로 저장하면 성공하고, 카드를 늘리면 `limit-cards`이다.
  - `rejects work referencing unknown blob`: `unknown-blob`
  - `uploadBlob rejects svg, gif, html, mismatched sha and 20 MiB + 1`
  - `uploadBlob is idempotent for an existing hash`
  - `blob bytes over tier limit rejected`: `limit-bytes`
  - `save with stale baseVersion returns conflict and leaves data unchanged`
  - `draft every 10s for the same work is rejected until 30s passed`
  - `61st write in an hour is limit-rate; drafts count separately up to 240`
  - `save keeps only 20 versions`
  - `copy requires public source and records source fields`
  - `restore works within 30 days and not after`
  - `nickname normalises NFC, enforces 2–20 chars and case-insensitive uniqueness`
  - `import token allows 50 decks and 2000 blobs once per day`
  - `every call writes one audit row with ok flag`
- [ ] **Step 2:** `node --test tests/cloud-handlers.test.mjs` → FAIL을 확인한다.
- [ ] **Step 3:** `handlers.js`와 `limits.js`를 구현한다. 한도 숫자는 `repo.getTierLimits`와 `limits.js`의 상수(`RATE`, `IMPORT`, `VERSIONS_KEPT=20`, `TRASH_DAYS=30`, `DRAFT_MIN_INTERVAL_MS=30000`, `MAX_BLOB_BYTES=20971520`)에서만 읽는다.
- [ ] **Step 4:** PASS를 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): validated, rate limited api handlers`

---

### Task 5: Edge Function 배포와 원격 권한 검증

**Files:**
- Create: `supabase/functions/api/index.ts`: JWT를 `supabase.auth.getUser(token)`으로 확인한다. `?action=blob.upload&sha=`이면 본문을 원시 바이트로, 아니면 JSON `{action, payload}`으로 받는다. CORS 허용 출처는 Pages 주소와 `http://localhost:*`(테스트)다.
- Create: `supabase/functions/_shared/supabase-repo.js`: Task 4 repo 인터페이스를 service client로 구현한다(낙관적 버전은 `update … where version = $expect`).
- Test: `tests/cloud/api.integration.mjs`

**Interfaces:**
- Consumes: Task 4 `createApi`, Task 3 스키마
- Produces: `POST {SUPABASE_URL}/functions/v1/api` (Authorization: Bearer 사용자 JWT). 응답은 `{ok:true, result}` 또는 `{ok:false, code, message}`이고 HTTP 상태는 `ApiError.status`를 따른다.

- [ ] **Step 1: 실패하는 통합 테스트 작성**
  - `full permission matrix over HTTP`: anon, pending, trial, memberA, memberB, revoked × Task 4 action 목록. 기대값 표를 테스트 안에 상수로 둔다.
  - `malicious inputs over HTTP`: 확장자를 위장한 SVG, PNG 헤더 + HTML, 9 MiB JSON, `__proto__` 키, 범위 밖 HP, 다른 사람 작업 id
  - `revoking a member blocks the very next write`
  - `end to end: create → upload blobs → save → publish → anon reads feed and work → copy by memberB`
- [ ] **Step 2:** 배포하기 전에 `npm run test:cloud`를 실행해서 FAIL을 확인한다.
- [ ] **Step 3:** 구현하고 `npm run build:server && npx supabase functions deploy api --use-api --project-ref <test-ref>`로 배포한다.
- [ ] **Step 4:** `npm run test:cloud`가 PASS인지 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): deploy api edge function`

---

### Task 6: 작업실 클라우드 기반 (설정, 로그인, API 호출, blob)

**Files:**
- Create: `cloud.json`: `{"url": "", "anonKey": "", "pagesOrigin": "https://lolipop000000.github.io"}`. 운영 값은 Task 0 이후 채운다.
- Modify: `scripts/build.mjs`: `cloud.json`을 `define: {__CLOUD_CONFIG__: …}`로 주입한다. `dist/index.html`도 같은 HTML로 쓴다. `@supabase/supabase-js`의 라이선스가 기존 루틴으로 포함되는지 확인한다.
- Modify: `package.json`: dependency `@supabase/supabase-js@2.118.0`
- Create: `src/cloud/config.js`, `src/cloud/client.js`, `src/cloud/blobs.js`
- Test: `tests/cloud-client.test.mjs`

**Interfaces:**
- Produces:
  - `cloudAvailability(location): {available: boolean, reason: 'file'|'unconfigured'|null}`
  - `createCloudClient({config, createSupabase = createClient, fetchImpl = fetch})` → 아래 메서드를 가진 객체
    - `signIn(): Promise<void>`: Google OAuth, PKCE, `redirectTo: location.origin + location.pathname`
    - `signOut()`
    - `session(): Promise<{user, accessToken}|null>`, `onAuthChange(fn): () => void`
    - `myProfile(): Promise<{id, nickname, status}|null>`
    - `call(action, payload): Promise<result>`: 401이면 `refreshSession` 후 한 번만 재시도한다. 실패하면 `CloudError{code, status, message}`
    - `select(table, query)`: 읽기 전용 래퍼
    - `subscribeFeed(onChange: ({type:'upsert'|'delete', row}) => void): () => void`
  - `createBlobStore({client, publicBaseUrl, cache = new Map()})` → 아래 메서드를 가진 객체
    - `ensureUploaded(blobs: Map<hex, {mime, bytes}>, {onProgress}): Promise<void>`: `blob.missing`으로 빠진 것만 알아낸 뒤 순서대로 올린다.
    - `fetch(hex): Promise<Uint8Array>`: 받은 바이트의 해시가 다르면 오류를 던진다.

- [ ] **Step 1: 실패하는 테스트 작성** (가짜 supabase와 가짜 fetch)
  - `file protocol and empty config are unavailable with reasons`
  - `call retries once after refreshing an expired session` (Review Focus 1)
  - `call surfaces not-member without retry`
  - `ensureUploaded uploads only missing hashes and reports progress`
  - `fetch rejects bytes whose hash differs`
- [ ] **Step 2:** FAIL을 확인한다.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** PASS를 확인하고, `npm run build && node --test tests/offline.spec.mjs`로 file:// 흐름이 그대로인지 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): client, auth and blob store`

---

### Task 7: 클라우드 저장 세션 (초안 자동 저장, 확정 저장, 충돌, 오프라인)

**Files:**
- Create: `src/cloud/session.js`
- Test: `tests/cloud-session.test.mjs`

**Interfaces:**
- Consumes: Task 1 `toCloudProject`·`fromCloudProject`, Task 6 `client.call`·`blobs`
- Produces: `createCloudSession({store, client, blobs, now = Date.now, setTimer, draftIntervalMs = 30000})` → 아래 메서드를 가진 객체
  - `open(workId): Promise<void>`: 초안이 있으면 초안을, 없으면 저장본을 `store.load`한다.
  - `createFromCurrent(title): Promise<workId>`
  - `save(): Promise<{version}>`: 확정 저장
  - `state(): {workId, status: 'idle'|'draft-saving'|'draft-saved'|'saving'|'saved'|'error'|'conflict'|'read-only', version, draftSavedAt, hasUnsavedDraft, error}`
  - `onChange(fn)`
  - `resolveConflict('load-server'|'save-as-copy'): Promise<void>`
  - `dispose()`
  - 자동 저장: `store.subscribe`로 변경을 감지하고, 마지막 초안 저장 뒤 `draftIntervalMs`가 지나면 `work.saveDraft`를 호출한다. 실패하면 `error`이고 다음 변경이나 30초 뒤에 다시 시도한다.

- [ ] **Step 1: 실패하는 테스트 작성** (가짜 client, 가짜 타이머)
  - `edits produce at most one draft call per 30 seconds`
  - `save uploads blobs then calls work.save with baseVersion and clears unsaved flag`
  - `resumes missing blob uploads after a failed save` (Review Focus 3)
  - `conflict on save sets conflict state; load-server replaces project; save-as-copy creates new work`
  - `stops autosave and keeps recovery after revocation` (Review Focus 2): `not-member`면 `read-only`가 되고, 이후 변경에도 호출하지 않는다. store 내용은 그대로이고 `isDirty()===true`이다.
  - `network failure keeps editing and recovery` (Review Focus 4): `fetch`가 거부되면 `error`가 되고, `store.edit`는 계속 가능하며, 다음 변경 때 재시도한다.
  - `refreshes expired session once before failing`: Task 6 동작을 세션 수준에서 다시 확인한다.
- [ ] **Step 2:** FAIL을 확인한다.
- [ ] **Step 3:** 구현한다. 기존 `createRecoverySession`은 그대로 둔다(로컬 복구는 계속 동작).
- [ ] **Step 4:** PASS를 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): draft autosave and explicit save session`

---

### Task 8: 로그인 UI, 닉네임, 상태 표시, Ctrl+S 연결

**Files:**
- Create: `src/ui/cloud-account.js`
- Modify: `src/app.js`: 상단 도구 막대에 계정 컨트롤을 넣고, Ctrl+S와 저장 버튼을 라우팅한다.
- Modify: `src/styles.css`
- Modify: `tests/harness-entry.js`: `window.__cloudTest = {install(fakeClient)}`로 가짜 클라이언트를 주입한다. 배포 빌드에는 포함하지 않는다(기존 하네스 방식).
- Test: `tests/cloud-account.spec.mjs`

**Interfaces:**
- Consumes: Task 6 `createCloudClient`·`cloudAvailability`, Task 7 `createCloudSession`
- Produces: `createCloudAccountControls(ctx, {client, session}): {node, refresh, destroy, isCloudSaveActive(): boolean}`
  - 상태 문구: "로그인", "승인 대기 중", "준멤버", "멤버". 파일로 열었으면 "웹 주소에서 열면 클라우드를 쓸 수 있어요"
  - 저장 상태 문구: "초안 저장됨 / 확정 저장됨 / 저장 중 / 실패 · 다시 시도 / 다른 곳에서 먼저 저장됨"
  - 첫 로그인이고 `nickname`이 null이면 닉네임 창을 띄운다.

- [ ] **Step 1: 실패하는 브라우저 테스트 작성**
  - `file url shows web-address hint and no login button`
  - `login then nickname dialog then member badge`
  - `pending user ctrl+s falls back to local save` (Review Focus 5): 기존 폴더·파일 저장 경로가 호출되고 승인 대기 안내가 한 번 뜬다.
  - `member ctrl+s triggers cloud save and shows 확정 저장됨`
  - `revoked during session switches to read-only notice`
- [ ] **Step 2:** `npm run test:browser -- tests/cloud-account.spec.mjs`로 FAIL을 확인한다.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** PASS를 확인하고 기존 `tests/workspace-ui.spec.mjs`, `tests/recovery*.spec.mjs`, `tests/offline.spec.mjs`도 PASS인지 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): sign-in, nickname and cloud save routing`

---

### Task 9: 클라우드 창 (내 작업, 공개 목록, 휴지통, 실시간)

**Files:**
- Create: `src/ui/cloud-panel.js`
- Modify: `src/app.js` (버튼 연결), `src/styles.css`
- Test: `tests/cloud-panel.spec.mjs`

**Interfaces:**
- Consumes: Task 6 `client.select`·`subscribeFeed`, Task 7 `session.open`·`createFromCurrent`
- Produces: `openCloudPanel(ctx, {client, session, account}): Promise<void>`
  - 탭: 내 작업 / 공개 목록 / 에셋(Task 10이 채움) / 휴지통
  - 내 작업: 제목, 카드 수, 공개 여부, "공개본과 다름" 표시. 동작은 열기, 공개/비공개, 삭제
  - 공개 목록: 닉네임, 제목, 갱신 시각. 동작은 보기(읽기 전용으로 열기). **멤버와 준멤버에게만** "사본 만들기"를 보여 준다.
  - 휴지통: 삭제한 날짜와 남은 일수, 복구
  - 사용량 표시: "카드 n / 한도, 이미지 n MB / 한도". `tier_limits`와 `owner_usage` RPC로 읽는다(Task 3에 `owner_usage`를 `security definer` + `auth.uid()` 고정 버전 `my_usage()`로 추가).
  - 읽기 전용으로 연 공개 작업은 store에 `dirty:false`로 불러온다. 편집하려고 하면 "사본을 만들어 편집하세요"라고 안내한다(멤버) 또는 "보기만 가능해요"라고 안내한다.

- [ ] **Step 1: 실패하는 브라우저 테스트 작성**
  - `feed upsert from another member appears without reload`
  - `feed delete removes the row`
  - `viewer sees no copy or download buttons`
  - `copy opens the new private copy as my work`
  - `publish toggles and shows in public tab`
  - `trash restore brings work back to my works`
  - `usage line shows tier limits`
- [ ] **Step 2:** FAIL을 확인한다.
- [ ] **Step 3:** 구현한다. Task 3 마이그레이션에 `my_usage()` 함수를 추가하는 새 마이그레이션 `20261021000003_my_usage.sql`을 만들고 테스트 프로젝트에 push한다.
- [ ] **Step 4:** PASS를 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): cloud panel with realtime public list and trash`

---

### Task 10: 에셋 공유 (스냅샷, 의존 이미지, 가져가기, 이미지 보관함 클라우드)

**Files:**
- Create: `src/cloud/shared-assets.js`
- Modify: `src/ui/cloud-panel.js` (에셋 탭), `src/ui/asset-library.js` (로그인 시 클라우드 보관함 사용), `src/ui/keywords.js`, `src/ui/card-templates.js`, `src/ui/visual-effects.js` (각각 "에셋으로 공유" 버튼)
- Test: `tests/shared-assets.test.mjs`, `tests/shared-assets.spec.mjs`

**Interfaces:**
- Consumes: Task 1 변환, Task 2 `validateCloudAsset` 데이터 형식 `{kind, item, blobs}`
- Produces:
  - `snapshotAsset(project, kind, itemId): Promise<{data: {kind, item, blobs: string[]}, blobBytes: Map}>`: 이 항목이 참조하는 이미지(키워드 아이콘, 템플릿 요소의 이미지, 이펙트 스프라이트 `params.assetId`)를 `project.assets`에서 함께 담는다.
  - `applySharedAsset(project, data, fetchBlob): Promise<{newId}>`: `effect_template`, `card_template`, `keyword`를 열린 덱에 추가한다. 모든 ID를 새로 매기고, 기존 카드 서식 적용 경로의 재매핑 함수를 재사용한다.
  - `snapshotLibraryEntry(entry)`, `applyLibraryEntry(library, data, fetchBlob)`
  - 이미지 보관함: 로그인한 멤버의 보관함은 `shared_assets(kind='image')`의 내 행 목록이다. 기존 IndexedDB 캐시는 오프라인 대비로 유지한다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `keyword with icon snapshot carries its image and applies with fresh ids`
  - `card template referencing art carries images`
  - `effect template with sprite asset carries the sprite image`
  - `applying twice yields two independent items`
  - (spec) `share keyword from manager then another member takes it into open deck`
  - (spec) `image library lists cloud images and adds a copied public image`
- [ ] **Step 2:** FAIL을 확인한다.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** PASS를 확인하고, 기존 `tests/asset-library*.mjs`, `tests/card-templates*.mjs`, `tests/keywords-model.test.mjs`도 PASS인지 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): share effect templates, card templates, keywords and images`

---

### Task 11: PC 작업 일괄 올리기

**Files:**
- Create: `src/ui/cloud-import.js`
- Modify: `src/ui/cloud-account.js` (첫 로그인 제안), `src/ui/cloud-panel.js` (메뉴)
- Test: `tests/cloud-import.spec.mjs`

**Interfaces:**
- Consumes: 기존 `createWorkspaceStorage`의 폴더 목록과 읽기, `parseCardFile`, `parseProject`, 이미지 보관함. Task 6과 Task 7
- Produces: `openCloudImport(ctx, {client, blobs, workspace, assetLibrary}): Promise<void>`
  - 목록을 체크박스로 보여 준다(기본 전부 체크). 미리 계산한 "카드 n장 / 이미지 n MB / 한도"를 표시하고, 넘으면 올리기 버튼을 끄고 넘는 양을 표시한다.
  - `import.begin` → 각 덱 `work.create`(비공개) → blob `ensureUploaded` → 진행률. 실패한 항목은 목록에 남기고 나머지는 계속한다.

- [ ] **Step 1: 실패하는 브라우저 테스트 작성**
  - `lists folder decks, card files and library images all checked`
  - `over limit disables upload and names the excess`
  - `uploads checked items as private works with progress`
  - `second run on same day shows once-per-day message`
  - `one failing deck does not stop the rest`
- [ ] **Step 2:** FAIL을 확인한다.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** PASS를 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): one-time local work import`

---

### Task 12: 게임 다운로드용 공개 목록 함수

**Files:**
- Create: `supabase/functions/export-manifest/index.ts`, `supabase/functions/_shared/manifest.js`
- Test: `tests/manifest.test.mjs`, `tests/cloud/manifest.integration.mjs`

**Interfaces:**
- Produces:
  - `GET /functions/v1/export-manifest` (인증 없음, 읽기 전용)
  - `buildManifest(rows, assets, nicknames, blobBaseUrl)` 결과는 아래 형식이다.
    ```json
    {"format":"card-print-studio-manifest","version":1,"generatedAt":"ISO",
     "blobBaseUrl":"https://<ref>.supabase.co/storage/v1/object/public/blobs/",
     "works":[{"id","owner","nickname","title","version","updatedAt","hash","blobs":["hex"]}],
     "assets":[{"id","kind","owner","nickname","title","version","updatedAt","hash","blobs":[]}]}
    ```
    `hash`는 `data`를 키 정렬한 JSON의 sha256이다. 본문 데이터는 `works`·`shared_assets` 공개 SELECT로 받는다.
  - `diffManifest(previous, next): {changedWorks: id[], removedWorks: id[], changedAssets, removedAssets, newBlobs: hex[]}`: 게임 쪽이 쓸 순수 함수이고, `src/cloud/manifest-diff.js`로 함께 제공한다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `manifest lists only public non-deleted items with nickname`
  - `hash stable under key order`
  - `diff reports only changed items and unseen blobs`
  - (integration) `private and trashed works never appear`
- [ ] **Step 2:** FAIL을 확인한다.
- [ ] **Step 3:** 구현하고 테스트 프로젝트에 배포한다(`--no-verify-jwt`).
- [ ] **Step 4:** PASS를 확인한다.
- [ ] **Step 5:** 커밋한다: `feat(cloud): incremental public manifest for the game`

---

### Task 13: GitHub Pages 호스팅과 CSP

**Files:**
- Create: `.github/workflows/pages.yml`: main push 시 `npm ci && npm run build`를 실행하고 `dist/`를 Pages artifact로 배포한다.
- Modify: `src/index.html`: CSP `<meta>` 자리표시자
- Modify: `scripts/build.mjs`: 인라인 실행 스크립트의 sha256 해시로 `script-src 'sha256-…'`를 만든다. `connect-src`는 `cloud.json` URL(https와 wss), 기존 업데이트 주소, **오늘 앱이 실제로 fetch하는 모든 호스트**로 만든다(구현자가 `grep -rn "fetch(\|https://" src`로 목록을 확정하고 이 단계의 테스트 상수로 둔다). `object-src 'none'`, `base-uri 'none'`도 넣는다.
- Test: `tests/csp.test.mjs`, 기존 `tests/offline.spec.mjs`, `tests/updates.spec.mjs`, `tests/background-removal-browser.spec.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**
  - `built html has csp meta with script hash matching inline script`
  - `connect-src contains supabase https and wss and every host the app fetches` (상수 목록과 비교)
  - `dist/index.html equals dist/card-print-studio.html`
  - `no secret key strings in src or dist` (부록 E)
- [ ] **Step 2:** FAIL을 확인한다.
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 위 테스트와 기존 세 spec이 PASS인지 확인한다(CSP 때문에 기존 기능이 깨지지 않는지 확인).
- [ ] **Step 5:** 커밋한다: `feat(cloud): pages hosting with content security policy`

---

### Task 14: 정리 작업, 백업, 관리자 문서

**Files:**
- Create: `supabase/functions/maintenance/index.ts`, `supabase/functions/_shared/maintenance.js`: service key로만 호출한다. 하는 일은 다음과 같다.
  - 30일이 지난 휴지통 행을 영구 삭제한다.
  - 어떤 `works`·`work_drafts`·`work_versions`·`shared_assets`의 `blob_refs`에도 없고 만든 지 24시간이 지난 `blobs` 행과 Storage 객체를 삭제한다.
  - 90일이 지난 `audit_log`를 정리한다.
- Create: `.github/workflows/backup.yml`: 매일 03:00 KST(cron `0 18 * * *`)에 실행한다.
  - `pg_dump --no-owner $SUPABASE_DB_URL`
  - 새 blob을 다운로드한다(이전 백업에 있는 해시는 건너뜀).
  - `card-print-studio-backup` 저장소의 `YYYY-MM-DD/`에 푸시하고, 30일보다 오래된 폴더를 지운다.
  - 이어서 `maintenance`를 호출한다.
- Create: `scripts/restore-backup.md`: 빈 프로젝트로 복원하는 절차
- Create: `docs/cloud-admin.md`: 멤버 승인(`profiles.status` → `member`/`trial`), 해제, 게시물 비공개·삭제, 휴지통 복구, 버전 되돌리기 SQL 예시, `tier_limits` 변경, 일시정지 해제
- Modify: `README.md`, 배포용 사용법에 "클라우드 저장과 공유" 절을 추가한다.
- Test: `tests/maintenance.test.mjs` (메모리 repo)
  - `purges trash older than 30 days only`
  - `deletes orphan blobs older than 24h but keeps any referenced by versions`

- [ ] **Step 1:** 테스트를 작성하고 FAIL을 확인한다.
- [ ] **Step 2:** 구현하고 PASS를 확인한다.
- [ ] **Step 3:** 테스트 프로젝트로 백업 워크플로를 `workflow_dispatch`로 한 번 실행한다. 덤프와 blob이 백업 저장소에 생겼는지 확인한다. 그 백업을 빈 로컬 Postgres가 없으므로 **테스트 프로젝트를 리셋한 뒤 복원**해서 작업 수와 blob 해시가 같은지 확인하고, 결과를 `docs/cloud-admin.md`에 기록한다.
- [ ] **Step 4:** 커밋한다: `feat(cloud): maintenance, daily backups and admin runbook`

---

### Task 15: 최종 검증과 운영 반영 준비

- [ ] **Step 1:** `npm run test:unit`, `npm run build`, `npm run test:browser`, `npm run test:cloud`를 모두 실행해서 PASS를 확인하고, 로그를 `artifacts/qa/cloud-*.log`에 보존한다.
- [ ] **Step 2:** 테스트 프로젝트에서 실제 Edge 두 개(다른 프로필)로 시나리오를 수동 확인한다: 멤버 A 공개 → 멤버 B 목록에 실시간으로 뜸 → 사본 → 준멤버 11장째 거부 → 해제된 계정 즉시 차단. 스크린샷을 남긴다.
- [ ] **Step 3:** 운영 프로젝트 반영은 **사용자 확인 후** 진행한다. `db push`, `functions deploy`(api, export-manifest, maintenance), `cloud.json`에 운영 값을 넣고 버전을 1.6.0으로 올린 뒤 Pages를 배포한다. 기존 `release.json`과 `update.json` 절차를 따른다.
- [ ] **Step 4:** 커밋한다: `chore: cloud sharing verification records`

---

## 부록 A. 마이그레이션 SQL (Task 3, 9) — 그대로 사용

보안의 핵심이므로 아래 원문을 그대로 쓴다. 바꿔야 하면 이유를 커밋 메시지에 적는다.

### A-1. `supabase/migrations/20261021000001_cloud_schema.sql`

```sql
create extension if not exists pgcrypto;

create table public.tier_limits(
  tier text primary key check (tier in ('trial','member')),
  max_cards int not null check (max_cards >= 0),
  max_blob_bytes bigint not null check (max_blob_bytes >= 0));
insert into public.tier_limits values ('trial',10,15728640),('member',120,157286400);

create table public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text check (nickname is null or char_length(nickname) between 2 and 20),
  status text not null default 'pending' check (status in ('pending','trial','member','revoked')),
  created_at timestamptz not null default now());
create unique index profiles_nickname_ci on public.profiles (lower(nickname)) where nickname is not null;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.blobs(
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  mime text not null check (mime in ('image/png','image/jpeg','image/webp')),
  bytes bigint not null check (bytes > 0 and bytes <= 20971520),
  uploader uuid not null references public.profiles(id),
  created_at timestamptz not null default now());

create table public.works(
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  visibility text not null default 'private' check (visibility in ('private','public')),
  data jsonb not null,
  card_count int not null check (card_count >= 0),
  blob_refs text[] not null default '{}',
  version int not null default 1 check (version >= 1),
  source_work_id uuid,
  source_owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz);
create index works_owner on public.works(owner);
create index works_public on public.works(updated_at desc) where visibility = 'public' and deleted_at is null;

create table public.work_drafts(
  work_id uuid primary key references public.works(id) on delete cascade,
  owner uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null,
  card_count int not null check (card_count >= 0),
  blob_refs text[] not null default '{}',
  saved_at timestamptz not null default now());

create table public.work_versions(
  id bigserial primary key,
  work_id uuid not null references public.works(id) on delete cascade,
  version int not null,
  data jsonb not null,
  blob_refs text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (work_id, version));

create table public.shared_assets(
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('effect_template','image','card_template','keyword')),
  title text not null check (char_length(title) between 1 and 120),
  visibility text not null default 'private' check (visibility in ('private','public')),
  data jsonb not null,
  blob_refs text[] not null default '{}',
  version int not null default 1 check (version >= 1),
  source_asset_id uuid,
  source_owner uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz);
create index assets_owner on public.shared_assets(owner);

create table public.audit_log(
  id bigserial primary key,
  actor uuid,
  action text not null,
  target uuid,
  ok boolean not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now());
create index audit_actor_time on public.audit_log(actor, action, created_at desc);

create table public.import_runs(
  id bigserial primary key,
  owner uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  decks int not null default 0,
  blobs int not null default 0,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null);

create table public.public_feed(
  item_id uuid primary key,
  kind text not null check (kind in ('work','asset')),
  asset_kind text,
  owner uuid not null,
  nickname text,
  title text not null,
  version int not null,
  updated_at timestamptz not null);

-- 테이블마다 별도 함수 (plpgsql은 없는 컬럼 참조를 실행 시점에 오류로 냄)
create function public.feed_from_work() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then delete from public.public_feed where item_id = old.id; return old; end if;
  if new.visibility = 'public' and new.deleted_at is null then
    insert into public.public_feed(item_id,kind,asset_kind,owner,nickname,title,version,updated_at)
    values (new.id,'work',null,new.owner,(select nickname from public.profiles where id = new.owner),new.title,new.version,new.updated_at)
    on conflict (item_id) do update set title = excluded.title, nickname = excluded.nickname,
      version = excluded.version, updated_at = excluded.updated_at;
  else
    delete from public.public_feed where item_id = new.id;
  end if;
  return new;
end $$;
create trigger works_feed after insert or update or delete on public.works
  for each row execute function public.feed_from_work();

create function public.feed_from_asset() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then delete from public.public_feed where item_id = old.id; return old; end if;
  if new.visibility = 'public' and new.deleted_at is null then
    insert into public.public_feed(item_id,kind,asset_kind,owner,nickname,title,version,updated_at)
    values (new.id,'asset',new.kind,new.owner,(select nickname from public.profiles where id = new.owner),new.title,new.version,new.updated_at)
    on conflict (item_id) do update set title = excluded.title, nickname = excluded.nickname,
      version = excluded.version, updated_at = excluded.updated_at;
  else
    delete from public.public_feed where item_id = new.id;
  end if;
  return new;
end $$;
create trigger assets_feed after insert or update or delete on public.shared_assets
  for each row execute function public.feed_from_asset();

create function public.feed_nickname() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.public_feed set nickname = new.nickname where owner = new.id;
  return new;
end $$;
create trigger profiles_feed_nickname after update of nickname on public.profiles
  for each row execute function public.feed_nickname();

create function public.owner_usage(uid uuid) returns table(cards int, blob_bytes bigint)
language sql stable security definer set search_path = '' as $$
  with w as (
    select greatest(w.card_count, coalesce(d.card_count, 0)) as c,
           w.blob_refs || coalesce(d.blob_refs, '{}') as refs
    from public.works w left join public.work_drafts d on d.work_id = w.id
    where w.owner = uid and w.deleted_at is null),
  a as (select blob_refs as refs from public.shared_assets where owner = uid and deleted_at is null),
  h as (select distinct unnest(refs) as sha from (select refs from w union all select refs from a) x)
  select coalesce((select sum(c) from w), 0)::int,
         coalesce((select sum(b.bytes) from h join public.blobs b on b.sha256 = h.sha), 0)::bigint
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('blobs', 'blobs', true, 20971520, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
```

### A-2. `supabase/migrations/20261021000002_cloud_policies.sql`

```sql
alter table public.tier_limits   enable row level security;
alter table public.profiles      enable row level security;
alter table public.blobs         enable row level security;
alter table public.works         enable row level security;
alter table public.work_drafts   enable row level security;
alter table public.work_versions enable row level security;
alter table public.shared_assets enable row level security;
alter table public.audit_log     enable row level security;
alter table public.import_runs   enable row level security;
alter table public.public_feed   enable row level security;

-- 쓰기 권한 자체를 회수 (RLS에 더한 이중 방어). 쓰기는 service role만.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on public.audit_log, public.blobs, public.import_runs from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon, authenticated;

create policy works_read on public.works for select to anon, authenticated
  using ((visibility = 'public' and deleted_at is null) or owner = (select auth.uid()));
create policy assets_read on public.shared_assets for select to anon, authenticated
  using ((visibility = 'public' and deleted_at is null) or owner = (select auth.uid()));
create policy drafts_read on public.work_drafts for select to authenticated
  using (owner = (select auth.uid()));
create policy versions_read on public.work_versions for select to authenticated
  using (exists (select 1 from public.works w where w.id = work_id and w.owner = (select auth.uid())));
create policy feed_read on public.public_feed for select to anon, authenticated using (true);
create policy tiers_read on public.tier_limits for select to anon, authenticated using (true);
create policy profiles_self on public.profiles for select to authenticated using (id = (select auth.uid()));

-- 닉네임만 공개하는 뷰 (뷰 소유자 권한으로 읽으므로 id, nickname 두 열만 노출)
create view public.public_profiles as select id, nickname from public.profiles;
grant select on public.public_profiles to anon, authenticated;

revoke execute on function public.owner_usage(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Realtime: 가벼운 피드만
alter publication supabase_realtime add table public.public_feed;
```

`storage.objects`에는 `blobs` 버킷에 대한 insert·update·delete 정책을 **만들지 않는다**. 공개 버킷이라 읽기는 공개 URL로 하고, 쓰기는 service role만 한다.

### A-3. `supabase/migrations/20261021000003_my_usage.sql` (Task 9)

```sql
create function public.my_usage() returns table(cards int, blob_bytes bigint)
language sql stable security definer set search_path = '' as $$
  select * from public.owner_usage((select auth.uid()))
$$;
revoke execute on function public.my_usage() from public, anon;
grant execute on function public.my_usage() to authenticated;
```

## 부록 B. 권한 행렬 (Task 3·4·5 테스트의 기대값)

✓ = 성공, ✗ = 거부(HTTP 오류 또는 RLS로 0행·오류), ○ = 본인 것만 성공

| 동작 | anon | pending | revoked | trial | member |
|---|---|---|---|---|---|
| 공개 work·asset·feed 읽기 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 다른 사람의 비공개 work·초안·버전 읽기 | ✗ | ✗ | ✗ | ✗ | ✗ |
| 내 비공개 work·초안·버전 읽기 | — | ○ | ○ | ○ | ○ |
| 표에 직접 insert·update·delete (REST) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Storage 직접 업로드 | ✗ | ✗ | ✗ | ✗ | ✗ |
| `api`의 모든 쓰기 action | 401 | 403 `not-member` | 403 `not-member` | ○ (카드 10장·15 MiB) | ○ (120장·150 MiB) |
| 다른 사람 work의 수정·삭제·공개 전환 | 401 | 403 | 403 | 404 `not-found` | 404 `not-found` |
| 공개 work 복사 | 401 | 403 | 403 | ✓ (한도 내) | ✓ (한도 내) |
| 다른 사람의 비공개 work 복사 | 401 | 403 | 403 | 404 `not-found` | 404 `not-found` |
| `export-manifest` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `maintenance` (service key가 아니면) | 401 | 401 | 401 | 401 | 401 |

다른 사람의 비공개 대상과 남의 작업 수정 요청에는 **404**로 응답한다. 존재 여부를 알려 주지 않기 위해서다. 남의 **공개** 작업을 수정·삭제하려 할 때는 `403 forbidden`이다.

## 부록 C. `api` 함수 계약 (Task 4·5·6)

- 요청: `POST /functions/v1/api`, 헤더는 `Authorization: Bearer <사용자 access token>`, `apikey: <anon>`이다.
  - JSON 본문 `{"action": "...", "payload": {...}}`, 최대 8.5 MiB(작업 8 MiB + 여유)
  - blob 업로드: `POST /functions/v1/api?action=blob.upload&sha=<hex>`, `Content-Type`은 실제 mime, 본문은 원시 바이트
- 응답: 성공은 `200 {"ok":true,"result":{...}}`, 실패는 `{"ok":false,"code":"...","message":"한국어 안내"}`와 해당 상태 코드다.
- CORS: `ALLOWED_ORIGINS` 환경 변수(쉼표 구분, `npx supabase secrets set`)에 있는 출처만 허용한다. 운영은 `https://lolipop000000.github.io`이고, 테스트 프로젝트는 여기에 `http://localhost:4173`을 더한다. `OPTIONS` 요청에 응답한다.
- 시간 기준: 서버 `now()`만 쓴다. 클라이언트 시각은 믿지 않는다.
- 낙관적 동시성:
  - `work.save`: `update works set …, version = version + 1, updated_at = now() where id = $1 and owner = $uid and version = $base and deleted_at is null returning version`. 0행이면 존재와 소유를 다시 확인해서 `404` 또는 `409 conflict`로 응답한다.
  - `work.saveDraft`: `baseSavedAt`이 null이면 초안 행이 없어야 하고, 값이 있으면 `saved_at`이 같아야 한다. 다르면 `409`
- 작업실이 그대로 보여 줄 한국어 오류 문구:
  - `not-member`: "관리자 승인 후 저장과 공유를 쓸 수 있어요."
  - `limit-cards`: "카드는 최대 {n}장까지 저장할 수 있어요. (지금 {m}장)"
  - `limit-bytes`: "이미지는 최대 {n} MB까지 저장할 수 있어요."
  - `limit-rate`: "잠시 후 다시 시도하세요. 한 시간에 저장할 수 있는 횟수를 넘었어요."
  - `limit-import`: "PC 작업 올리기는 하루에 한 번만 할 수 있어요."
  - `conflict`: "다른 곳에서 먼저 저장했어요."
  - `unknown-blob`: "그림 업로드가 끝나지 않았어요. 다시 저장하세요."
  - `not-found`: "찾을 수 없거나 볼 수 없는 항목이에요."

## 부록 D. 구현 순서와 원격 의존

- 원격 없이 먼저 할 수 있는 것: Task 1, 2, 4, 6, 7, 그리고 Task 8~11의 가짜 클라이언트 기반 UI
- 테스트 프로젝트가 필요한 것: Task 3, 5, 12의 통합 테스트, Task 14 백업 확인
- 운영 프로젝트: Task 15 Step 3에서만, 관리자 확인 후

## 부록 E. 하지 말 것 (리뷰어가 확인)

- 작업실 코드(`src/`, `dist/`)에 `service_role`·`secret` 키 문자열이나 `SUPABASE_SERVICE_ROLE_KEY` 참조를 넣지 않는다. Task 13에 `no secret key strings in src or dist` 테스트를 추가해서 `sb_secret_`, `service_role`, JWT 형태로 `"role":"service_role"`이 들어간 문자열을 검사한다.
- Edge Function은 사용자가 보낸 `owner`, `card_count`, `blob_refs`, `version`(기준 버전 외), `status`를 믿지 않는다. 모두 서버가 계산하거나 JWT에서 얻는다.
- 받은 데이터를 `eval`, `new Function`, `innerHTML`에 넣지 않는다. 작업실은 기존처럼 `textContent`와 캔버스 텍스트만 쓴다.
- 클라이언트에서 버튼을 숨기는 걸 권한 검사로 여기지 않는다. 모든 거부는 부록 B의 서버 테스트로 증명한다.
- `.env.cloud-test`, DB 비밀번호, 토큰을 커밋하거나 로그에 찍지 않는다(`.gitignore`의 `.env.*`가 이미 막고 있음).
