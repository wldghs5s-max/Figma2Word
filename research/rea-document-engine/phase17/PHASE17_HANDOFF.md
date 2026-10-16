# Phase 17 — Engineering Handoff & Reviewer Guide

## 1. 개요 및 인수인계 요약

- **저장소**: `wldghs5s-max/Figma2Word`
- **기준 커밋**: `eaad0ae`
- **목표 브랜치**: `master`
- **인수인계 상태**: **Phase 17 전체 트랙(A~E) 100% 완료**

이 문서는 다음 엔지니어 또는 외부 감사자가 Phase 17의 작업 내역을 즉시 재현하고 검증할 수 있도록 돕는 인수인계 가이드이다.

---

## 2. 변경된 파일 목록

### 핵심 엔진 소스코드
- `src/canvas/renderer/hwpxCanvasRenderer.ts`:
  - Figma `LINE` 노드의 KS X 6101 네이티브 `<hp:line>` 렌더링 (`pt0`, `pt1`, `isReverseHWP97="0"`).
  - 이미지 75 HWPU/px 단위 적용, `<hp:imgDim>` 및 `<hp:inImgDim>` 동시 방출, `binaryItemIDRef` 선언.
  - 둥근 사각형 `ratio` 0–50 엄격 클램핑.
  - 페이지별 오리엔테이션 및 치수 감지 시 동적 `<hp:secPr>` 방출.
- `src/canvas/renderer/docxCanvasRenderer.ts`:
  - 연속 페이지 간 오리엔테이션 및 크기 변경 시 인라인 `<w:pPr><w:sectPr w:type="nextPage">` 방출.
  - 최종 페이지 규격에 맞춘 본문 `<w:sectPr>` 동적 생성.
- `package.json`:
  - `@playwright/test` devDependency 추가 및 `"test:e2e": "playwright test"` 스크립트 등록.
- `playwright.config.ts`:
  - Headless Chromium 및 Vite Preview 웹 서버 자동 기동 설정.
- `vitest.config.ts`:
  - Vitest 테스트 대상을 `tests/**/*.test.ts`로 한정하고 `e2e/**` 격리.

### 테스트 및 검증 스크립트
- `e2e/web-ui.spec.ts`: Playwright 브라우저 E2E 자동화 스위트 (4개 시나리오 100% 통과).
- `tests/phase17-quality-integration.test.ts`: Phase 17 통합 단위 테스트 (6개 테스트 100% 통과).
- `research/rea-document-engine/phase17/scripts/validate_hwpx_semantics.ts`: HWPX Level 1/2 OWPML 시맨틱 전수 검증기 (9개 피스처 100% 통과).
- `research/rea-document-engine/phase17/scripts/test_word_com_phase17.ps1`: Microsoft Word COM 실물 열람/편집/저장/재열람 영속성 검증기 (3개 문서 100% 통과).

---

## 3. 재현 및 검증 명령어

### (1) 전체 Vitest 단위/통합 테스트 (54개 파일, 335개 테스트)
```bash
npm test
```

### (2) 브라우저 E2E 자동화 테스트 (Playwright 4개 시나리오)
```bash
npm run test:e2e
```

### (3) HWPX Level 1 & Level 2 시맨틱 정밀 검증
```bash
npx tsx research/rea-document-engine/phase17/scripts/validate_hwpx_semantics.ts
```

### (4) Microsoft Word COM 실물 편집 영속성 검증 (Windows PowerShell)
```powershell
powershell -ExecutionPolicy Bypass -File research/rea-document-engine/phase17/scripts/test_word_com_phase17.ps1
```

### (5) 프로덕션 프론트엔드 및 백엔드 빌드 검증
```bash
npm run build
npm run build:web
```
