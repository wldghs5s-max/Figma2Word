# Phase 17 — Regression Test Inventory & Benchmark Report

## 1. 개요

Phase 17 시점에서 Figma2Word의 전체 자동화 테스트 스위트는 **54개 테스트 파일, 335개 테스트 케이스**로 구성되어 있으며, 전수 100% 통과(실패 0건, 건너뜀 0건)를 달성하였다.

추가로 브라우저 E2E 테스트 스위트(`@playwright/test`) 4개 시나리오가 100% 성공하였다.

---

## 2. 전체 회귀 테스트 인벤토리

- **테스트 러너**: Vitest v5.0.3 (Node.js v24.14.1, win64)
- **설정 파일**: [`vitest.config.ts`](file:///c:/Users/77/Documents/Figma2Word/vitest.config.ts)
- **총 테스트 파일**: 54개
- **총 테스트 케이스**: 335개 (PASS: 335, FAIL: 0, SKIP: 0)
- **전체 소요 시간**: 63.64초

### 주요 테스트 스위트 현황
1. `tests/step-2b5-safe-flatten.test.ts` (6 tests)
2. `tests/nested-table-flattening-guard.test.ts` (7 tests)
3. `tests/step-2b6-background-row.test.ts` (10 tests)
4. `tests/figma-offline-snapshot.test.ts` (10 tests)
5. `tests/e2e-real-figma.test.ts` (4 tests)
6. `tests/frame-selection.test.ts` (11 tests)
7. `tests/layout-p1.test.ts` (8 tests)
8. `tests/step-12b-fidelity-improvements.test.ts` (5 tests)
9. `tests/browser-memory-stability.test.ts` (4 tests)
10. `tests/stress.test.ts` (4 tests)
11. `tests/step-2b2-flatten.test.ts` (8 tests)
12. `tests/geometry-cluster.test.ts` (9 tests)
13. `tests/border-preservation.test.ts` (7 tests)
14. `tests/faq-table-isolation.test.ts` (6 tests)
15. `tests/decorative-shapes-minimization.test.ts` (5 tests)
16. `tests/compact-chip-boundary.test.ts` (5 tests)
17. `tests/page-orientation-selection.test.ts` (6 tests)
18. `tests/renderer.test.ts` (2 tests)
19. `tests/cta-padding-preservation.test.ts` (4 tests)
20. `tests/synthetic-benchmarks.test.ts` (7 tests)
21. `tests/determinism.test.ts` (2 tests)
22. `tests/canvas-engine.test.ts` (17 tests)
23. `tests/geometry-cluster-coordinates.test.ts` (7 tests)
24. `tests/parent-context-row-cluster.test.ts` (12 tests)
25. `tests/canvas-multi-screen-isolation.test.ts` (6 tests)
26. `tests/pipeline.test.ts` (2 tests)
27. `tests/data-table-support.test.ts` (11 tests)
28. `tests/character-style-overrides.test.ts` (12 tests)
29. `tests/step-12c-fidelity-improvements.test.ts` (4 tests)
30. `tests/phase17-quality-integration.test.ts` (6 tests) — **신규 추가 (Phase 17)**
31. `tests/phase16-1-remediation.test.ts` (9 tests)
32. `tests/tabbar-button-wrapping.test.ts` (2 tests)
33. `tests/desktop-padding-clamping.test.ts` (5 tests)
34. `tests/screen36-modal-isolation.test.ts` (4 tests)
35. `tests/phase16-h2-remediation.test.ts` (7 tests)
36. `tests/bento-grid-layout.test.ts` (8 tests)
37. `tests/folded-cards-clustering.test.ts` (2 tests)
38. `tests/empty-shape-no-table.test.ts` (3 tests)
39. `tests/header-overlay.test.ts` (1 test)
40. `tests/desktop-screen-isolation.test.ts` (9 tests)
41. `tests/figma-api.test.ts` (18 tests)
42. `tests/desktop-multi-page-isolation.test.ts` (6 tests)
43. `tests/canvas-and-guard.test.ts` (4 tests)
44. `tests/regression-guards.test.ts` (12 tests)
45. `tests/text-layout.test.ts` (1 test)
46. `tests/quality-audit/audit-infra.test.ts` (4 tests)
47. `tests/desktop-card-group-clustering.test.ts` (4 tests)
48. `tests/phase16-h1-remediation.test.ts` (5 tests)
49. `tests/edge-cases.test.ts` (5 tests)
50. `tests/autolayout.test.ts` (2 tests)
51. `tests/parser.test.ts` (4 tests)
52. `tests/model.test.ts` (3 tests)
53. `tests/phase16-h3-remediation.test.ts` (4 tests)
54. `tests/quality-audit/synthetic-fixtures.test.ts` (6 tests)

---

## 3. 브라우저 E2E 벤치마크

- **테스트 러너**: Playwright v1.64.1 (Chromium)
- **테스트 파일**: [`e2e/web-ui.spec.ts`](file:///c:/Users/77/Documents/Figma2Word/e2e/web-ui.spec.ts)
- **시나리오**:
  1. `E2E-1`: 단일 메모 프리셋 듀얼 변환 (493ms)
  2. `E2E-2`: 포맷 필터링 HWPX/DOCX 분기 (566ms)
  3. `E2E-3`: 복합 대시보드 변환 및 실제 바이너리 다운로드 검증 (612ms)
  4. `E2E-4`: 커스텀 JSON 파일 업로드 및 프레임 선택 (390ms)
- **총 실행 시간**: 3.8초

---

## 4. 빌드 및 번들 벤치마크

- `npm run build` (TypeScript tsc): 1.8초 (오류 0건)
- `npm run build:web` (Vite 8 + React 19 번들): 469ms (오류 0건, 청크 13개)
