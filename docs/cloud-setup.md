# 클라우드 준비 체크리스트 (관리자가 직접 진행)

이 문서는 카드 작업실의 클라우드 기능(`docs/superpowers/specs/2026-10-21-cloud-sharing-design.md`)을 쓰기 전에 **관리자 본인이 직접** 해야 하는 설정이다. 계정 만들기, 비밀값 입력, 결제나 권한 동의는 개발 도구(AI 포함)에 맡기지 말고 직접 한다.

준비물: 관리자 Google 계정, GitHub 계정 `lolipop000000`, 이 저장소에 쓸 수 있는 권한.

---

## 1. 계정 보안 먼저

1. **Google 계정 2단계 인증**: https://myaccount.google.com/security → "2단계 인증" 켜기
2. **GitHub 2단계 인증**: GitHub → Settings → Password and authentication → Two-factor authentication
3. Supabase 가입(2단계에서 GitHub 로그인으로 가입하면 편함) 후 **Supabase 2단계 인증**: 대시보드 오른쪽 위 계정 → Account preferences → Multi-factor authentication → TOTP 추가

> 관리자 계정이 털리면 서버 전체가 털린다. 이 단계를 건너뛰지 않는다.

## 2. Supabase 프로젝트 두 개 만들기

https://supabase.com/dashboard → New project. 무료 플랜은 프로젝트 2개까지라 둘 다 여기에 쓴다.

| 항목 | 운영용 | 테스트용 |
|---|---|---|
| Name | `card-studio` | `card-studio-test` |
| Region | Northeast Asia (Seoul) | Northeast Asia (Seoul) |
| Database Password | 긴 무작위 값(비밀번호 관리자에 저장) | 긴 무작위 값 |
| Plan | Free | Free |

만든 뒤 각 프로젝트에서 값을 적어 둔다:
- **Project ref**: 주소 `https://supabase.com/dashboard/project/<ref>`의 `<ref>`
- **Project URL**: Project Settings → API (또는 Data API) → `https://<ref>.supabase.co`
- **공개 키**: Project Settings → API Keys → `anon`(legacy) 또는 `publishable` 키. 작업실에 들어가는 키이고 공개돼도 괜찮다.
- **비밀 키**: 같은 화면의 `service_role`(legacy) 또는 `secret` 키. **절대 작업실 코드, 채팅, 깃허브 커밋에 넣지 않는다.** GitHub Actions secret과 로컬 `.env.cloud-test`(테스트용만)에만 넣는다.
- **DB 접속 주소**: 상단 Connect 버튼 → Connection string → **Session pooler** 주소
  - GitHub Actions에는 IPv6가 없어서 Direct connection이 안 되므로 pooler를 쓴다.
  - 형식: `postgresql://postgres.<ref>:<비밀번호>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`

## 3. Google 로그인 설정 (운영용 프로젝트)

### 3-1. Google Cloud Console
https://console.cloud.google.com

1. 상단에서 새 프로젝트 `card-studio`를 만든다.
2. 메뉴 → **Google Auth Platform**(또는 "API 및 서비스 → OAuth 동의 화면")으로 간다.
   - **Branding**: 앱 이름 `카드 작업실`, 지원 이메일은 관리자 메일
   - **Audience**: User type **External**. 게시 상태가 "Testing"이면 **Test users에 등록한 계정만** 로그인할 수 있다. 친구 3~8명이면 Testing으로 두고, 친구들 Gmail을 Test users에 추가하는 방법이 가장 안전하다(모르는 사람은 Google 단계에서부터 막힘). 나중에 사람이 늘면 "Publish app"을 누른다.
   - **Data Access**: 범위에 `openid`를 추가한다. `email`과 `profile`은 기본으로 들어 있다. 다른 범위는 추가하지 않는다.
3. **Clients → Create client**
   - Application type: **Web application**
   - Name: `card-studio-web`
   - **Authorized JavaScript origins**: `https://lolipop000000.github.io` (경로 없이 도메인만)
   - **Authorized redirect URIs**: Supabase의 콜백 주소 `https://<운영 ref>.supabase.co/auth/v1/callback` (아래 3-2 화면에 표시된 값을 그대로 복사)
   - Create → **Client ID**와 **Client Secret**을 저장한다.

### 3-2. Supabase 대시보드 (운영용)
1. **Authentication → Sign In / Providers → Google**: Enable 켜기 → Client ID, Client Secret 붙여넣기 → Save. 이 화면에 나오는 Callback URL이 3-1의 redirect URI와 똑같은지 확인한다.
2. 같은 화면에서 **Email 공급자는 끈다**(운영용). Google로만 들어오게 한다.
3. "Allow new users to sign up"은 **켠 채로 둔다.** 새 친구가 Google로 처음 들어와야 `pending` 계정이 생긴다. 들어와도 관리자가 승인하기 전에는 보기만 가능하다.
4. **Authentication → URL Configuration**
   - Site URL: `https://lolipop000000.github.io/card-print-studio/`
   - Redirect URLs: `https://lolipop000000.github.io/card-print-studio/**`

### 3-3. 테스트용 프로젝트
- Google 공급자는 켜지 않아도 된다(자동 테스트는 이메일·비밀번호 계정을 씀).
- **Email 공급자를 켜고 "Confirm email"을 끈다.** 테스트가 확인 메일 없이 계정을 만들기 위해서다.
- URL Configuration의 Redirect URLs에 `http://localhost:4173/**`를 추가한다(로컬 수동 확인용).

## 4. GitHub 설정

1. **Pages**: 저장소 `card-print-studio` → Settings → Pages → Build and deployment → Source: **GitHub Actions**
2. **백업 저장소**: New repository → `card-print-studio-backup`, **Private**
3. **백업용 토큰**: Settings(개인) → Developer settings → Fine-grained tokens → Generate
   - Repository access: `card-print-studio-backup`만
   - Permissions: Contents **Read and write**
   - 만료: 1년(만료 전에 갱신 일정 잡기)
4. **Actions secrets**: `card-print-studio` → Settings → Secrets and variables → Actions → New repository secret

| 이름 | 값 |
|---|---|
| `SUPABASE_URL` | 운영 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 운영 비밀 키 |
| `SUPABASE_DB_URL` | 운영 Session pooler 주소 |
| `BACKUP_REPO_TOKEN` | 3번 토큰 |

## 5. Supabase CLI 연결 (개발 PC)

Docker 없이 원격 프로젝트에 바로 반영한다.

```bash
npx supabase@2.121.0 login
```

(브라우저가 열리면 로그인. 토큰은 PC에만 저장된다.)

```bash
npx supabase@2.121.0 link --project-ref <테스트 ref>
```

(DB 비밀번호를 물으면 테스트 프로젝트 비밀번호 입력.) 이후 개발 중 반영 명령:

```bash
npx supabase@2.121.0 db push
```

```bash
npx supabase@2.121.0 functions deploy api --use-api
```

운영 반영은 개발이 끝나고 검증이 통과한 뒤에만 `link --project-ref <운영 ref>`로 바꿔서 같은 명령을 실행한다.

## 6. 로컬 테스트 환경 변수

저장소 루트에 `.env.cloud-test`를 만든다(이미 `.gitignore`에 들어 있음, 커밋 금지). **테스트 프로젝트 값만** 넣는다.

```text
CLOUD_TEST_URL=https://<테스트 ref>.supabase.co
CLOUD_TEST_ANON_KEY=<테스트 공개 키>
CLOUD_TEST_SERVICE_KEY=<테스트 비밀 키>
CLOUD_TEST_DB_URL=<테스트 Session pooler 주소>
```

## 7. 작업실에 들어가는 공개 값

`cloud.json`(커밋됨)에는 **운영용 공개 값만** 넣는다. 개발 중에는 빈 값으로 둔다.

```json
{"url":"https://<운영 ref>.supabase.co","anonKey":"<운영 공개 키>","pagesOrigin":"https://lolipop000000.github.io"}
```

## 8. 운영하면서 하는 일

- **새 친구 승인**: 친구가 Google로 한 번 로그인하면 → Table Editor → `profiles`에 `status = pending` 행이 생긴다. 누구인지는 Authentication → Users의 이메일로 확인하고, 행의 `status`를 `member`(카드 120장) 또는 `trial`(준멤버, 10장)로 바꾼다.
- **승인 해제**: `status`를 `revoked`로 바꾼다. 다음 요청부터 즉시 쓰기가 막힌다.
- **한도 변경**: Table Editor → `tier_limits`의 숫자를 바꾼다.
- **일시정지**: 1주일 동안 아무도 안 쓰면 프로젝트가 멈춘다. 매일 백업 작업이 접속하니 보통은 멈추지 않지만, 멈췄다면 대시보드에서 "Restore project"를 누른다(데이터는 보존됨).
- 게시물 숨기기, 복구, 버전 되돌리기, 백업 복원은 `docs/cloud-admin.md`(Task 14에서 작성)를 따른다.

## 체크
- [ ] Google, GitHub, Supabase 2단계 인증
- [ ] Supabase 운영·테스트 프로젝트, 값 기록
- [ ] Google OAuth 클라이언트(Testing + Test users), Supabase Google 공급자, URL 설정
- [ ] 테스트 프로젝트 Email 공급자(확인 메일 끔)
- [ ] GitHub Pages(Actions), 백업 저장소, 토큰, Actions secrets 4개
- [ ] CLI login/link, `.env.cloud-test`
