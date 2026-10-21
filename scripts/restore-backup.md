# 클라우드 백업 복원

이 절차는 **빈 복원용 Supabase 프로젝트**에서 먼저 실행한다. 사용 중인 운영 프로젝트를 덮어쓰지 않는다. SQL에는 사용자 계정·비공개 작업이 들어 있으므로 백업 저장소와 복원 파일은 비공개로 유지한다.

1. 비공개 `card-print-studio-backup` 저장소를 받는다. 복원할 `YYYY-MM-DD/snapshot.json`, `database.sql`과 루트 `blobs/`를 준비한다. 그림은 날짜별로 중복 저장하지 않고 공용 해시 폴더에 보관한다.
2. `database.sql`의 SHA-256이 `snapshot.json.databaseSha256`과 같은지 확인한다. 목록의 모든 그림은 파일명과 SHA-256, 바이트 크기가 일치해야 한다. 하나라도 다르면 복원을 중단한다.
3. 원래 프로젝트와 같은 PostgreSQL 주 버전 및 Supabase Auth 기본 스키마를 준비한다. `snapshot.json.restoreKind`는 `app-data-with-migrations`다. 스냅샷의 `migrations/` 파일 해시를 검증하고 순서대로 적용한다. SQL 파일은 `pg_dump --no-owner --data-only --schema=public --schema=auth --exclude-table=auth.schema_migrations` 형식이다. 플랫폼 내부 DDL·Auth 마이그레이션 기록·Storage 메타데이터를 교체하지 않는다. 앱의 세 마이그레이션 밖에서 수동으로 추가한 DDL은 별도 보존해야 한다.
4. 대상 연결과 예약 백업·정리를 멈춘다. 빈 복원 대상에서만 `public`과 `auth`의 데이터를 비운다(Auth의 `schema_migrations`는 유지). 한 트랜잭션에서 `SET session_replication_role = replica`, 데이터 복원, `SET session_replication_role = origin` 순서로 실행한다. `psql --set ON_ERROR_STOP=on --single-transaction`을 사용하고 오류를 무시하지 않는다. `scripts/verify-local-backup.mjs`의 prefix가 정확한 로컬 예시다. 비밀번호는 비공개 환경으로만 준다. 관리형 프로젝트에서 필요한 권한이 없으면 중단하고 [Supabase 공식 복원 절차](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)를 따른다. 로컬 Docker 검증과 운영 관리형 프로젝트의 복원은 별도 검증이다.
5. 대상 서버의 관리 키를 서버 환경에만 넣고 마이그레이션이 만든 Storage `blobs` 버킷에 목록의 파일을 원래 SHA-256 이름과 MIME으로 업로드한다. 업로드 API에서 `upsert:true`로 실제 객체와 Storage 메타데이터를 함께 복구한다. 그림별 다운로드 결과를 다시 해시 검증한다.
6. 작품·공유 에셋·사용자 수, 공개 목록, 그림 해시를 대조하고 로컬 작업실에서 열기·사본·저장을 확인한다. 공개 설정과 사용자 승인 상태도 보존되어야 한다.
7. Supabase URL이 바뀌면 인증 리디렉션, CORS, 작업실의 공개 설정을 갱신한다. 함수·비밀 환경 값은 DB 덤프에 포함되지 않으므로 별도로 배포한다.

복원 증거는 `docs/cloud-admin.md`에 기록한다. 운영 전환은 사용자 확인 후에만 한다.
