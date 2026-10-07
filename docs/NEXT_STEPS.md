# 다음 작업자 인수인계 가이드 (NEXT_STEPS)

- **갱신 일시**: 2026-10-07 (Phase 4 완료 기준)

본 문서는 Phase 4(실제 Figma 연결 및 E2E 검증) 완료 후, 후속 개발자(Phase 5)가 즉시 착수할 수 있는 작업 로드맵을 안내한다.

---

## 1. 현재 시스템 환경 요약

- **빌드 상태**: `npm run build` (`tsc`) 및 `npm run build:web` (`vite build`) 100% 정상 (0 에러).
- **테스트 현황**: 11개 테스트 파일, **50개 테스트 100% 통과 (Vitest 50/50 Passed)**.
- **파이프라인 아키텍처**:
  ```text
  Figma URL / File Key
          ↓
  FigmaClient (REST API & Image Fills Download)
          ↓
  FigmaParser
          ↓
  LayoutEngine (P1-1 수평 클러스터링, P1-2 오버레이, P1-3 비례 너비)
          ↓
  Internal Document Model (IR)
          ↓
  DocxRenderer (Word OpenXML 패킹)
          ↓
  .docx
  ```
- **CLI & Web UI**:
  - CLI: `npm run convert:url -- <FIGMA_URL>`
  - Web UI: `npm run dev:web` (Figma URL & PAT 직접 입력 지원)

---

## 2. 다음 단계 (Phase 5) 권장 우선순위 과제

### [과제 1] P2-1: 단일 텍스트 내 다중 스타일 분할 (`characterStyleOverrides`)
- **목적**: 하나의 Figma TEXT 노드 안에서 일부 단어만 굵게(Bold) 처리되거나 색상이 다른 디자인의 보존율 극대화.
- **구현 방안**:
  1. `node.characterStyleOverrides` 배열과 `node.styleOverrideTable`을 순회.
  2. 스타일이 변하는 인덱스를 기준으로 텍스트를 청크 단위로 쪼개어 복수의 `TextRun` 생성.
  3. Word 렌더러가 여러 `TextRun`을 단일 `Paragraph`에 순차 추가하도록 연동.

### [과제 2] P2-3: Line / Divider 요소의 정렬 및 가변 폭 제어
- **목적**: 구분선(Line)이 부모 폭의 100%로 고정되는 것을 방지하고, Figma 바운딩 박스 폭 및 좌/중/우 정렬 반영.

### [과제 3] 프레임 단위 일괄 변환 (Batch Multi-Page Export)
- **목적**: 대형 피그마 파일의 모든 캔버스(페이지) 또는 복수의 메인 프레임을 단일 DOCX의 다중 섹션(`DocumentSection`) 또는 개별 DOCX 파일들로 일괄 변환하는 배치 모드 추가.
