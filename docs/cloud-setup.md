# 클라우드 준비 체크리스트 (관리자가 직접 진행)

이 문서는 카드 작업실의 클라우드 기능(`docs/superpowers/specs/2026-10-21-cloud-sharing-design.md`)을 쓰기 전에 **관리자 본인이 직접** 해야 하는 설정이다. 계정 만들기, 비밀값 입력, 결제나 권한 동의는 개발 도구(AI 포함)에 맡기지 말고 직접 한다.

준비물: 관리자 Google 계정, GitHub 계정 `lolipop000000`, 이 저장소에 쓸 수 있는 권한.

---

## 1. 계정 보안 먼저

1. **Google 계정 2단계 인증**: https://myaccount.google.com/security → "2단계 인증" 켜기
2. **GitHub 2단계 인증**: GitHub → Settings → Password and authentication → Two-factor authentication
3. Supabase 가입(2단계에서 GitHub 로그인으로 가입하면 편함) 후 **Supabase 2단계 인증**: 대시보드 오른쪽 위 계정 → Account preferences → Multi-factor authentication → TOTP 추가

> 관리자 계정이 털리면 서버 전체가 털린다. 이 단계를 건너뛰지 않는다.

## 2. Supabase 운영 프로젝트 만들기

https://supabase.com/dashboard → New project. **운영용 하나만** 만든다. 개발과 테스트는 PC 안의 로컬 Supabase(아래 5번)에서 한다.

| 항목 | 값 |
|---|---|
| Name | `PP Monster` |
| Region | Northeast Asia (Seoul) |
| Database Password | 긴 무작위 값(비밀번호 관리자에 저장) |
| Plan | Free |
| Enable automatic RLS | 켬 |

만든 뒤 값을 적어 둔다:
- **Project ref**: 주소 `https://supabase.com/dashboard/project/<ref>`의 `<ref>`
- **Project URL**: Project Settings → API (또는 Data API) → `https://<ref>.supabase.co`
- **공개 키**: Project Settings → API Keys → `anon`(legacy) 또는 `publishable` 키. 작업실에 들어가는 키이고 공개돼도 괜찮다.
- **백업 비밀 키**: 같은 화면의 Legacy API Keys에서 `service_role` 키를 쓴다. 현재 정리 함수도 이 키로 요청을 확인하므로 `sb_secret_…` 키로 대체하지 않는다. **절대 작업실 코드, 채팅, 깃허브 커밋에 넣지 않는다.** GitHub Actions secret에만 넣는다.
- **DB 접속 주소**: 상단 Connect 버튼 → Connection string → **Session pooler** 주소
  - GitHub Actions에는 IPv6가 없어서 Direct connection이 안 되므로 pooler를 쓴다.
  - 형식: `postgresql://postgres.<ref>:<비밀번호>@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`

## 3. Google 로그인 설정 (운영용 프로젝트)

### 3-1. Google Cloud Console
https://console.cloud.google.com

1. 상단에서 새 프로젝트 `PP Monster`를 만든다.
2. 메뉴 → **Google Auth Platform**(또는 "API 및 서비스 → OAuth 동의 화면")으로 간다.
   - **Branding**: 앱 이름 `PP Login`, 지원 이메일은 관리자 메일
   - **Audience**: User type **External**. 게시 상태가 "Testing"이면 **Test users에 등록한 계정만** 로그인할 수 있다. 친구 3~8명이면 Testing으로 두고, 친구들 Gmail을 Test users에 추가하는 방법이 가장 안전하다(모르는 사람은 Google 단계에서부터 막힘). 나중에 사람이 늘면 "Publish app"을 누른다.
   - **Data Access**: 범위에 `openid`를 추가한다. `email`과 `profile`은 기본으로 들어 있다. 다른 범위는 추가하지 않는다.
3. **Clients → Create client**
   - Application type: **Web application**
   - Name: `PP Login`
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

## 4. GitHub 설정

1. **Pages**: 저장소 `card-print-studio` → Settings → Pages → Build and deployment → Source: **GitHub Actions**
2. **백업 저장소**: New repository → `card-print-studio-backup`, **Private**
3. **백업용 토큰**: [토큰 만들기](https://github.com/settings/personal-access-tokens/new?name=card-print-studio-backup&target_name=lolipop000000&expires_in=365&contents=write)를 연다. 이름·1년 만료·Contents 쓰기 권한이 미리 채워진다.
   - **Resource owner**가 `lolipop000000`인지 확인한다.
   - 그 아래 **Repository access → Only select repositories → Select repositories**에서 `card-print-studio-backup`만 고른다.
   - **Permissions → Add permissions**에서 **Contents**를 검색해 추가하고, Contents 옆 선택을 **Read and write**로 바꾼다. 위 링크로 미리 채운 경우 값만 확인한다. **Generate token**을 누른다.
   - 생성된 값은 아래 Actions secret `BACKUP_REPO_TOKEN`에 직접 붙여넣는다. 채팅이나 파일에 적지 않는다. 만료 전에 새 토큰으로 교체한다.
   - `Note / Select scopes`만 보이면 classic 토큰 화면이다. 위 링크 또는 개인 Settings → Developer settings → Personal access tokens → **Fine-grained tokens → Generate new token**으로 이동한다. [GitHub 공식 안내](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)를 참고한다.
4. **Actions secrets**: `card-print-studio` → Settings → Secrets and variables → Actions → New repository secret

| 이름 | 값 |
|---|---|
| `SUPABASE_URL` | 운영 Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 운영 Legacy API Keys의 `service_role` |
| `SUPABASE_DB_URL` | 운영 Session pooler 주소 |
| `BACKUP_REPO_TOKEN` | 3번 토큰 |

## 5. 로컬 Supabase (개발·테스트용, 내 PC 안)

테스트용 클라우드 프로젝트 대신 **PC 안에 똑같은 Supabase를 띄워서** 개발하고 테스트한다. 운영 데이터와 완전히 분리되고 무료다.

### 5-1. Docker Desktop 설치 (WSL2 사용)
1. https://www.docker.com/products/docker-desktop/ → Windows용 설치 파일을 받아 실행한다.
2. 설치 중 **"Use WSL 2 instead of Hyper-V"**를 체크한다(Windows 11 Home은 WSL2만 가능).
3. 설치 후 재부팅하고 Docker Desktop을 실행한다. Settings → General에서 **"Use the WSL 2 based engine"**이 켜져 있는지 확인한다.
4. 새 터미널에서 확인한다. 버전이 출력되면 된다.

```bash
docker --version
```

> 개인 용도와 소규모 사용에는 Docker Desktop을 무료로 쓸 수 있다. 메모리를 많이 쓰면 Settings → Resources에서 줄일 수 있다.

### 5-2. 로컬 Supabase 실행
저장소 폴더(`card-print-studio-cloud`)에서 실행한다. 처음에는 이미지를 받느라 몇 분 걸린다.

```bash
npx supabase@2.121.0 start
```

끝나면 로컬 주소와 키가 출력된다. 다시 보려면 아래 명령을 쓴다.

```bash
npx supabase@2.121.0 status
```

- API URL `http://127.0.0.1:54321`, Studio(로컬 대시보드) `http://127.0.0.1:54323`
- 로컬 anon 키와 service_role 키는 **모든 PC에서 같은 공개 개발용 값**이라 비밀이 아니다. 그래도 운영 키와 섞지 않는다.
- 로컬은 이메일·비밀번호 로그인이 기본으로 켜져 있어서 자동 테스트가 계정을 만들 수 있다(확인 메일 없음, `supabase/config.toml` 기본값).
- 끄기: `npx supabase stop`. 데이터를 처음 상태로 되돌리고 마이그레이션 다시 적용: `npx supabase db reset`

### 5-3. 로컬 테스트 환경 변수
저장소 루트에 `.env.cloud-test`를 만들고(`.gitignore`의 `.env.*` 규칙으로 커밋 제외), `supabase status` 값을 넣는다.

```text
CLOUD_TEST_URL=http://127.0.0.1:54321
CLOUD_TEST_ANON_KEY=<status의 anon key>
CLOUD_TEST_SERVICE_KEY=<status의 service_role key>
CLOUD_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

## 6. 운영 프로젝트 연결 (출시할 때만)

개발과 테스트가 모두 통과한 뒤, 관리자 확인을 받고 실행한다.

```bash
npx supabase@2.121.0 login
```

```bash
npx supabase@2.121.0 link --project-ref <운영 ref>
```

```bash
npx supabase@2.121.0 db push
```

```bash
npx supabase@2.121.0 functions deploy api --use-api
```

(DB 비밀번호를 물으면 운영 프로젝트 비밀번호를 직접 입력한다. 채팅이나 파일에 적지 않는다.)

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
- [ ] Supabase 운영 프로젝트 `PP Monster`(automatic RLS 켬), 값 기록
- [ ] Google OAuth 클라이언트(Testing + Test users), Supabase Google 공급자, URL 설정, 운영 Email 공급자 끔
- [ ] GitHub Pages(Actions), 백업 저장소, 토큰, Actions secrets 4개
- [ ] Docker Desktop(WSL2), `npx supabase start` 성공, `.env.cloud-test`(로컬 값)
