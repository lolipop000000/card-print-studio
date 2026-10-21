# 키워드 전용 이펙트와 이글거림 검증 · 2026-10-21

대상은 `feat/cloud-sharing`의 로컬 작업실이다. 공개 업데이트, 운영 Supabase 반영, GitHub 푸시는 수행하지 않았다. 앱 버전은 1.5.2로 유지한다.

## 확인한 동작

- 키워드 관리에서 전용 이펙트 제작기를 열고, 사용 전 키워드도 이름 샘플로 확인한다. 미리보기·원본 비교·취소는 저장된 키워드를 바꾸지 않는다. 적용·실행 취소·다시 실행을 실제 브라우저에서 검사했다.
- 제목·본문에 직접 입력한 키워드와 연결한 배지의 글자가 같은 효과를 사용한다. 긴 이름을 먼저 인식하고, 명시적인 글자 설정을 우선한다. 겹치는 스킬 이름의 글꼴 크기·기울임과 효과를 지운 뒤의 키워드 색을 보존한다.
- 자동 배치는 실제 키워드 아이콘과 글꼴로 높이를 계산한다. 선택 대상 재생은 효과 없는 키워드에 가로채이지 않으며, 같은 이미지 캐시를 재사용해도 움직임과 선택 영역이 유지된다.
- 프로젝트 JSON, 카드 한 장 파일, 공유 에셋의 조합과 입자 그림 참조를 확인했다. 이름이 같은 키워드의 효과 충돌은 원본을 바꾸기 전에 거부하며, 효과 없음과 빈 효과는 호환된다.
- 이글거림은 세기·무늬 크기·잔물결·방향·속도를 조절한다. 불타는 글자와 이글거리는 열기 프리셋에 포함한다. 시드와 시간으로 정해지는 무늬를 사용하고, 재생 중 정지·고정 장면·300 DPI JSON 재출력을 검사했다.

## GPU와 대체 렌더링

실제 브라우저에서 여섯 방향의 GPU 실행 횟수가 각각 1회 이상이고 CPU 경로는 0회임을 확인했다. 같은 입력의 CPU 대체 출력과 비교한 최대 알파·색 차이는 모두 0이었다. 원본 픽셀 보존, 같은 시간의 반복 출력, 인접 시간의 변화, 패딩을 바꿔도 같은 세계 좌표를 샘플링하는 동작을 검사했다. WebGL을 사용할 수 없는 경우의 대체 출력도 확인했다.

이 수치는 해당 자동 검사 장면의 픽셀 비교이며 모든 장치의 FPS나 물리 프린터 출력을 보장하는 수치는 아니다. 결과와 화면은 `artifacts/qa/keyword-heat-gpu.json`, `keyword-heat-editor.png`에 보관한다.

## 작업실 전체 회귀와 리뷰

`npm test`는 1,026개 중 1,024개 통과, 1개 실패, 1개 생략으로 끝났다(약 26분 46초). 실패 항목은 선택한 글자에 `burningText`를 저장한 뒤 이전의 `displacement` 또는 `textWarp`를 기대하던 검사였다. 새 프리셋은 `heatHaze`를 사용한다. 독립 실행에서도 같은 실패를 재현한 후 저장된 `heatHaze`를 명시적으로 요구하도록 기대값만 수정했다. 불꽃·색상·저장·실행 취소·다시 실행 검사는 유지했고 해당 파일 3개 검사는 모두 통과했다. 전체 실행을 한 번에 통과했다고 기록하지 않는다.

생략한 1개는 `CARD_BG_MODEL_DIR`의 고정된 U2NetP 모델 파일이 필요한 실제 추론 검사다. 다른 배경 제거 검사는 통과했지만 실제 모델 추론을 검증한 것으로 보지 않는다. 두 번의 실제 300 DPI 양면 PDF 픽셀 비교, 경고를 유지하는 인쇄, 확대·선택·레이어·폴더 저장 회귀는 통과했다. 새 키워드·열기 브라우저 검사 9개도 이 전체 실행에 포함된다.

별도 리뷰의 중요 지적은 실패하는 검사로 재현한 뒤 수정했다. 최종 리뷰에 남은 Critical/Important 지적은 없었고, 이후의 프리셋 기대값 수정도 별도 검토를 받았다. 로그는 `artifacts/qa/keyword-heat-full-tests.log`, `keyword-heat-text-range-recheck.log`에 보관한다.

생성 HTML은 5,554,865 bytes, SHA-256 `DBD7469B0339A89FB6C8FD3364F15249E05D242288EE9CC899D61432D3CF038A`다. `dist/index.html`과 `dist/card-print-studio.html`은 동일하다. 비밀 키가 `src/`·`dist/`에 포함되지 않는 자동 검사도 통과했다.

## 로컬 공유 검사

실제 로컬 Supabase의 새 키워드 효과·이미지 공유와 잘못된 조합 거부 검사가 통과했다. 전체 로컬 통합 실행은 21개 중 20개 통과, 1개 실패였다. 기존 8 MiB 이미지 예약량 검사의 업로드 중 함수 실행이 CPU 제한으로 종료되어 빈 HTTP 응답을 받았다. 이 항목만 따로 재실행한 결과는 1/1 통과했다. 전체 21개가 한 번에 통과한 것으로 합산하지 않는다.

검증을 위해 서버 제한·권한·SQL을 바꾸지 않았다. 로그는 `artifacts/qa/keyword-heat-cloud-tests.log`에 보관한다. 운영 환경의 설정과 배포는 이 기록에 포함되지 않는다.

## 재현

```text
npm run build
npm run build:server
node scripts/build-harness.mjs
node --test --test-concurrency=1 tests/keyword-effects.test.mjs tests/heat-haze.test.mjs tests/text-ranges.test.mjs tests/effect-playback.test.mjs tests/visual-effects-v2.test.mjs tests/keyword-effects-editor.spec.mjs tests/keyword-heat-render.spec.mjs
npm test
npm run test:cloud
```

브라우저 검사는 실제 Microsoft Edge를 사용한다. 로컬 공유 검사에는 실행 중인 로컬 Supabase와 커밋하지 않는 `.env.cloud-test`가 필요하다. 테스트 계정과 자료만 만들고 정리하며, 사용자 자료를 초기화하지 않는다.
