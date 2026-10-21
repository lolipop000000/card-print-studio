# 클라우드 운영

관리 키와 DB 접속 정보는 Edge 환경 변수와 GitHub Actions Secrets에서만 관리한다. 작업실에는 공개 URL과 공개 클라이언트 키만 들어간다. 아래 SQL의 UUID는 관리 대상의 실제 UUID로 바꾼다.

## 승인과 해제

```sql
update public.profiles set status = 'member' where id = '<사용자 UUID>';
update public.profiles set status = 'trial' where id = '<사용자 UUID>';
update public.profiles set status = 'revoked' where id = '<사용자 UUID>';
```

해제는 다음 쓰기부터 적용된다. 본인의 데이터 읽기와 파일 백업은 가능하다. 준멤버로 내리면 기존 카드는 유지하고 한도를 넘는 추가 저장을 막는다.

## 숨기기, 휴지통, 복구

```sql
update public.works set visibility='private', updated_at=now() where id='<작업 UUID>';
update public.works set deleted_at=now(), updated_at=now() where id='<작업 UUID>';
update public.works set deleted_at=null, updated_at=now() where id='<작업 UUID>';
-- 공유 에셋은 같은 조건으로 public.shared_assets를 사용한다.
```

복구 전 소유자의 한도를 확인한다. 휴지통은 30일 이후 정리 대상이다. 관리 복구로 한도를 넘긴 경우 기존 자료를 임의로 지우지 않고 소유자에게 정리를 요청한다.

## 저장 버전 되돌리기

```sql
begin;
select pg_advisory_xact_lock(hashtextextended(owner::text,0)) from public.works where id='<작업 UUID>';
insert into public.work_versions(work_id,version,data,blob_refs)
select id,version,data,blob_refs from public.works where id='<작업 UUID>' on conflict do nothing;
update public.works w set data=v.data,blob_refs=v.blob_refs,
  card_count=jsonb_array_length(v.data->'cards'),version=w.version+1,updated_at=now()
from public.work_versions v where w.id='<작업 UUID>' and v.work_id=w.id and v.version=<복원할 버전>;
delete from public.work_drafts where work_id='<작업 UUID>';
delete from public.work_versions where work_id='<작업 UUID>' and id not in
  (select id from public.work_versions where work_id='<작업 UUID>' order by version desc limit 20);
commit;
```

복원할 JSON이 현재 형식과 맞고 그림이 남아 있는지 먼저 확인한다. 카드·이미지 한도를 점검하고 동시 편집자에게 다시 열도록 안내한다.

## 한도와 연결

```sql
update public.tier_limits set max_cards=120,max_blob_bytes=157286400 where tier='member';
```

프로젝트가 일시정지되면 Supabase Dashboard에서 Restore/Resume을 실행하고 함수·DB·Storage가 돌아왔는지 확인한다. 자동 백업은 활성 상태 유지 보장이 아니다. 연결 실패 중 편집 내용은 로컬 복구에 남고 저장을 다시 시도할 수 있다.

## 백업과 정리

비공개 `card-print-studio-backup` 저장소와 쓰기 권한이 있는 최소 범위 PAT를 준비한다. 이 저장소의 Actions Secrets에 `BACKUP_REPO_TOKEN`, `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 등록한다. 워크플로는 대상의 비공개 여부부터 검사한다. PostgreSQL 17 덤프 클라이언트를 사용하며 서버 주 버전이 바뀌면 `BACKUP_DOCKER_IMAGE`도 갱신한다.

매일 03:00 KST에 앱 마이그레이션·앱 및 Auth 데이터 덤프·검증된 새 그림을 비공개 저장소에 푸시한 뒤 정리 함수를 실행한다. Supabase 내부 DDL은 교체하지 않는다. 실패한 백업 뒤에는 정리하지 않는다. 날짜 폴더는 30일을 보존하고, 남은 모든 날짜가 참조하는 공용 그림은 유지한다. Git 기록에는 삭제 전 자료가 남으므로 법적 삭제·저장소 크기 정리는 별도 관리가 필요하다.

정리 함수는 관리 키만 허용한다. 버전·초안·휴지통을 포함한 모든 참조를 확인하고 24시간이 지난 미참조 그림, 30일이 지난 휴지통, 90일이 지난 감사 기록을 정리한다. DB 참조 변경을 잠시 잠그므로 이용이 적은 시간에 실행한다.

새 서버 키는 `apikey` 헤더로 보내고 Edge의 `SUPABASE_SECRET_KEYS` 사전에 있는 값과 정확히 대조한다. 기존 `service_role` 키는 Bearer 방식으로 계속 지원한다. 키 접두사만으로 승인하거나 일반 사용자 JWT·공개 키를 허용하지 않는다. [Supabase의 새 API 키 전환 안내](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)에 맞춘 방식이며, 실제 키 값은 서버와 Actions 안에서만 사용한다.

정리 호출 결과는 Actions의 `maintenance-result` 첨부 파일에 7일 보관한다. HTTP 상태, 허용된 오류 코드, 성공 시 정리 수량만 포함하며 응답 원문·접속 주소·비밀 값·예외 메시지는 기록하지 않는다. 실패한 호출을 성공으로 처리하지 않으며, 백업 푸시가 실패하면 정리를 호출하지 않는다. 전체 실패 로그를 내려받을 필요 없이 이 결과부터 확인한다.

인증 거부는 관리 헤더 누락(`unauthorized-admin-header-missing`), 서버 키 사전 미설정(`unauthorized-modern-config-unavailable`), 새 서버 키 불일치(`unauthorized-modern-key-mismatch`), 기존 관리 키 불일치(`unauthorized-legacy-key-mismatch`)로 구별한다. 모두 HTTP 401이며 실제 키·이름·해시·길이를 응답하지 않는다. 이 분류는 인증을 완화하지 않는다. 실행 없이 관리자 인식만 확인하려면 같은 인증으로 GET을 보내며, 일치한 관리자에게만 405가 반환된다.

복원 절차: [restore-backup.md](../scripts/restore-backup.md). 운영 배포와 첫 수동 워크플로 실행은 사용자 승인 뒤에 진행한다.

## 로컬 복원 검증 기록

2026-10-21 로컬 Supabase(PostgreSQL 17.11)에서 `scripts/verify-local-backup.mjs --reset-local`을 실행했다. 실제 `db reset --local --no-seed`로 세 마이그레이션을 재적용한 뒤 데이터와 Storage를 복원했다.

| 항목 | 백업 전 | 복원 후 |
|---|---:|---:|
| 계정 | 2 | 2 |
| 작업 | 2 | 2 |
| 공유 에셋 | 0 | 0 |
| 그림 메타데이터 | 1 | 1 |

그림 1개의 실제 다운로드 SHA-256과 크기가 일치했고, 복원 후 계정 생성·로그인도 통과했다. DB 덤프 SHA-256: `a0beaf27b9598df16dd3172409b80d63f8c07b0eb7f0b1d56528e7a8b3923914`. 비공개 SQL·그림·상세 로그는 커밋에서 제외한 `artifacts/qa/local-backup/`에 보관한다. 테스트 데이터는 검증 뒤 제거한다. 운영 프로젝트 복원과 GitHub 예약 실행은 아직 수행하지 않았다.
