# 작업실 편의 기능 구현 계획

> For agentic workers: execute each task with regression tests; independent library and template modules have separate owners, parent integrates storage and recovery.

**Goal:** 사용자가 선택한 자동 복구, 카드 검색·일괄 수량 수정, 내 카드 서식과 저장 위치 기억을 완성한다.

**Architecture:** 기존 단일 오프라인 HTML과 버전 1 덱 JSON을 유지한다. 폴더 연결은 재사용 가능한 핸들로 기억하고, 복구용 사본은 브라우저 IndexedDB에 별도로 보관한다. 검색·선택은 화면 상태이며 서식은 덱 데이터이다.

**Spec:** 2026-10-18 대화의 승인 범위: 제안 1·2·3 및 폴더 위치 기억, 작업실 데이터 내부에 같은 데이터 폴더 추가 생성 금지. 게임 테스트 테이블은 범위에 없다.

## Constraints and review focus

- 기존 카드·그림·이펙트·Variant·인쇄 크기를 보존한다. 자동 복구가 원본 파일을 자동으로 덮어쓰지 않는다.
- 새 탭·늦은 비동기 읽기·권한 취소·용량 부족이 다른 작업을 바꾸지 않아야 한다.
- 폴더 권한이 이미 허용되어 있으면 자동 복원하고, 다시 허용이 필요하면 기억한 핸들에 요청한다. 네이티브 권한을 우회하지 않는다.
- 작업실 데이터 자체와 프로젝트/카드 하위 폴더 선택을 인식한다. 내부 경로로 판명된 폴더에는 새 데이터 폴더를 만들지 않는다.
- 필터·카드 선택만으로 저장 내용이 바뀌지 않고, 수량 일괄 수정과 서식 적용은 각각 실행 취소 한 번으로 복원한다.
- 서식 적용은 내용·능력치·현재 그림을 보존하고 기술 수·치수가 달라도 안전하게 적용한다.

## Tasks

- [x] Folder persistence: add resume() and folder layout resolution in storage/workspace.js, remembered-path UI in ui/workspace.js. Regression tests cover direct data/project/card roots, permission prompt after reload, canceled resume and no duplicate folder creation.
- [x] Recovery: storage/recovery.js serializes validated per-session snapshots to IndexedDB; ui/recovery.js subscribes to edits, flushes on page hide, lists recoverable work, restores after asset validation with dirty state. Test reload, corrupt/quota failures, multi-tab isolation, cancel/discard and full artwork retention.
- [x] Card library: model/card-library.js and ui/card-library.js expose createCardLibraryControls(ctx) -> node/refresh/destroy; ui/cards.js renders filtered cards and selection. Test IME/filter/attribute semantics and one-undo bulk quantity changes.
- [x] Card templates: model/card-templates.js and ui/card-templates.js expose createCardTemplateControls(ctx) -> button/destroy. Validate optional cardTemplates in model/project.js; test visual-only application, skill/asset remapping, snapshot independence and JSON roundtrip.
- [x] Integrate app lifecycle and CSS, document behavior, run relevant model/storage and browser suites, capture UI, request independent review and fix material findings.
- [ ] Build version 1.2.0, publish existing GitHub distribution and verify downloaded bytes, update local delivery after backups and passing checks.

## Verification and review

301 model/storage tests, 35 relevant Edge UI tests, and 4 offline/PDF/native-print regression tests passed. A fresh independent review reproduced fast-switch recovery loss and hidden prior slots; both were fixed with an observed failing regression, then all 7 recovery tests passed. A final post-await identity guard also prevents a stale recovery from replacing a newer import. The reviewer rechecked and reported no remaining concrete issue.
