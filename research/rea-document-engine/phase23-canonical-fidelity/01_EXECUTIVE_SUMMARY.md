# Phase 23: Executive Summary — Canonical JSON Cross-Format Fidelity Recovery

## 1. 개요 및 목적
Phase 23의 핵심 임무는 **Canonical JSON (Canvas IR)을 단일 원본(Single Source of Truth)으로 유지하면서 DOCX 및 HWPX 렌더링 일관성과 한컴오피스 2024 뷰어에서의 시각적 충실도를 전면 회복**하는 것이다.

Phase 22에서 파일 열람 불가 및 뷰어 비정상 종료(Crash)를 유발하던 4대 핵심 구조적 결함(Root Causes 1~4)을 해결하여 모든 파일의 정상 오픈을 달성한 이후, 본 Phase에서는 실측 사용자 검증(Ground Truth)에서 확인된 시각적 레이아웃 결함들을 집중 해결하였다.

---

## 2. 해결된 주요 시각적 결함 (User Ground Truth)

| 결함 항목 | Phase 22 증상 | 근본 원인 | Phase 23 해결 결과 |
|---|---|---|---|
| **헤더/푸터 및 챕터 제목 박스화** | 상·하단 구분선 및 "1. 진단개요" 등의 제목 주변에 불필요한 사각형 박스가 표시됨 | 투명 배경 텍스트 박스에 `<hc:fillBrush><hc:winBrush faceColor="none" hatchColor="#999999" alpha="0"/></hc:fillBrush>`를 방출하여 뷰어가 회색 브러시 경계선으로 렌더링함 | 정품 레퍼런스 규격에 맞춰 빈 태그 `<hc:fillBrush/>`로 정류화하여 불필요한 박스 잔상 완전 제거 |
| **텍스트 수평 겹침 및 압축** | Stage 6·7에서 텍스트가 한 줄로 겹치거나 글자가 찌그러짐 | `hwpxCanvasRenderer`의 `<hp:subList>`에서 `lineWrap="SQUEEZE"`가 타이트한 너비에서 글자 간격을 강제 압축 | `lineWrap="BREAK"`로 정류화하여 너비 초과 시 자연스러운 단어 단위 개행 및 가독성 확보 |
| **도형 내 글자 하단 치우침** | 사각 도형과 겹쳐 배치되는 글자가 기하학적 중심보다 아래로 내려앉음 | `vertAlign="CENTER"` 적용 시 한글 폰트 어센더 기준선 특성에 더해, `defaultPadT` 상단 여백이 이중 가산되어 아래로 밀려남 | `vertAlignAttr === "CENTER"` 적용 시 상단 가산 여백을 0으로 보정하고 수직 대칭 유지 |
| **크로스포맷 일관성** | DOCX와 HWPX의 렌더링 결과 간 시각적·구조적 격차 | 포맷별 독립 파싱 및 렌더링 편차 | 동일한 Canvas IR을 단일 입력으로 받아 DOCX/HWPX를 병렬 생성하는 크로스포맷 검증 하네스 구축 |

---

## 3. 검증 지표 및 성과 요약

1. **테스트 슈트 100% 통과**:
   - Vitest: 57개 테스트 파일, 365개 단위/통합 테스트 전부 PASS (0 실패).
   - TypeScript 컴파일: `npx tsc --noEmit` 에러 0건.
2. **정품 레퍼런스 AST 비교**:
   - `python scripts/compare_hwpx_ast.py` 실행 결과: `0 violations detected` (Clean OWPML conformance).
3. **크로스포맷 하네스 검증**:
   - `scripts/run_cross_format_harness.ts`를 통해 Stage 6 및 Stage 7에 대해 DOCX와 HWPX 동시 유효성(Valid Package: true) 및 텍스트/도형 개수 정합성 검증 완료.
4. **산출물 체계**:
   - `debug/hwpx-phase23/`: 개선된 Stage 1~7 및 마이크로 진단 파일 생성 완료.
   - `debug/cross-format-phase23/`: 동일 IR 기반 병렬 DOCX/HWPX 산출물 배치 완료.
