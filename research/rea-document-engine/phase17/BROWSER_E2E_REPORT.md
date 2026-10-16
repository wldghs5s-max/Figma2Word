# Phase 17 — Playwright Browser End-to-End Automation Report

## 1. 개요

Phase 16 및 16.1 감사에서 지적된 "웹 UI 브라우저 실제 E2E 미수행" 한계를 극복하기 위해, Phase 17에서는 공식 E2E 프레임워크인 `@playwright/test`와 최신 Chromium 헤드리스 브라우저 엔진을 구축하고, 실제 브라우저 런타임 환경에서 4가지 핵심 시나리오를 자동 검증하였다.

---

## 2. 테스트 환경 구성

- **프레임워크**: `@playwright/test` v1.64.1
- **브라우저 엔진**: Chromium (Chrome for Testing 156.0.8078.4, win64)
- **로컬 웹 서버**: Vite Preview (`npm --prefix apps/web run preview -- --port 4173 --host 127.0.0.1`)
- **실행 모드**: Headless (1280x800 Viewport)
- **설정 파일**: [`playwright.config.ts`](file:///c:/Users/77/Documents/Figma2Word/playwright.config.ts)
- **테스트 스크립트**: [`e2e/web-ui.spec.ts`](file:///c:/Users/77/Documents/Figma2Word/e2e/web-ui.spec.ts)

---

## 3. 세부 테스트 시나리오 및 실행 결과

### E2E-1: 단일 메모 프리셋 로드 및 듀얼 변환 (DOCX + HWPX)
- **동작**:
  1. 웹 페이지 접속 (`http://127.0.0.1:4173/`).
  2. 프리셋 버튼 `1. 단일 메모 (Brief)` 클릭.
  3. 출력 포맷 `듀얼 (DOCX + HWPX)` 활성화 확인.
  4. `변환 실행` 버튼 클릭.
  5. 비동기 변환 완료 상태(`상태: 변환 성공`) 대기 및 검증.
  6. `📥 Word 문서 (.docx) 다운로드` 및 `📥 한컴 한글 문서 (.hwpx) 다운로드` 버튼 렌더링 검증.
  7. 하단 `Canvas IR 정밀 구조 통계` 그리드 표시 확인.
- **소요 시간**: 493ms
- **결과**: **PASS**

### E2E-2: 출력 포맷 필터링 (HWPX 단독 및 DOCX 단독)
- **동작**:
  1. `HWPX (한글)` 포맷 버튼 클릭 후 변환 실행.
  2. HWPX 다운로드 버튼만 노출되고 DOCX 다운로드 버튼은 DOM에서 제거되었는지 검증.
  3. `DOCX (Word)` 포맷 버튼 클릭 후 변환 실행.
  4. DOCX 다운로드 버튼만 노출되고 HWPX 다운로드 버튼은 DOM에서 제거되었는지 검증.
- **소요 시간**: 566ms
- **결과**: **PASS**

### E2E-3: 대시보드 변환 및 브라우저 다운로드 Blob 바이너리 무결성 검증
- **동작**:
  1. 고난도 복합 레이아웃 `6. 중첩 대시보드 (Dashboard)` 프리셋 로드.
  2. `변환 실행` 클릭 후 완료 대기.
  3. Playwright `page.waitForEvent('download')` 이벤트 리스너 바인딩.
  4. DOCX 다운로드 버튼 클릭 → 바이너리 스트림 수신 → 버퍼 크기 검증 (> 1,000 bytes) → `JSZip`으로 압축 해제 → `word/document.xml` 내 `<w:document>` 태그 검증.
  5. HWPX 다운로드 버튼 클릭 → 바이너리 스트림 수신 → 버퍼 크기 검증 (> 1,000 bytes) → `JSZip`으로 압축 해제 → `Contents/section0.xml` 내 `<hs:sec>` 태그 검증.
- **소요 시간**: 612ms
- **결과**: **PASS**

### E2E-4: 사용자 정의 Figma JSON 파일 업로드 및 프레임 감지
- **동작**:
  1. 파일 업로드 `<input type="file" accept=".json">`에 실제 Figma AST JSON(`single-page-brief.json`) 주입.
  2. UI에 `📁 single-page-brief.json` 파일 뱃지 및 프레임 수치 표시 확인.
  3. `변환 실행` 클릭 후 성공 상태 및 다운로드 활성화 검증.
- **소요 시간**: 390ms
- **결과**: **PASS**

---

## 4. 실행 요약

```text
Running 4 tests using 1 worker

  ok 1 [chromium] › e2e\web-ui.spec.ts:13:3 › E2E-1: loads preset fixture and executes dual conversion (DOCX + HWPX) (493ms)
  ok 2 [chromium] › e2e\web-ui.spec.ts:39:3 › E2E-2: verifies format filtering for HWPX only and DOCX only (566ms)
  ok 3 [chromium] › e2e\web-ui.spec.ts:67:3 › E2E-3: converts complex dashboard fixture and downloads structurally valid DOCX & HWPX (612ms)
  ok 4 [chromium] › e2e\web-ui.spec.ts:116:3 › E2E-4: handles custom Figma JSON file upload and frame toggling (390ms)

  4 passed (3.8s)
```

모든 테스트는 모의 객체나 스텁이 아닌, 실제 브라우저 환경에서 실제 Blob 생성과 다운로드 이벤트를 통해 검증되었다.
