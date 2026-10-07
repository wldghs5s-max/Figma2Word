# 다음 작업자 인수인계 가이드 (NEXT_STEPS)

- **갱신 일시**: 2026-10-07 (Phase 2 완료 후)

본 문서는 Phase 2에서 규명된 한계점과 P0~P3 문제 분류를 바탕으로, 다음 개발자가 즉시 착수해야 할 작업 로드맵을 안내한다.

---

## 1. 현재 환경 및 코드베이스 상태

- **빌드 상태**: `npm run build` 및 `npm run build:web` 100% 정상 (0 에러).
- **테스트 상태**: `npm test` 실행 시 8개 테스트 파일, **24개 테스트 100% 통과**.
- **검증용 샘플 데이터**:
  - `samples/figma/`: 기본 Fixture 3종 (`simple-document`, `card-layout`, `auto-layout`)
  - `samples/real-world/`: 실무/스트레스 Fixture 4종 (`sample-a-proposal-doc`, `sample-b-nested-autolayout`, `sample-c-stress-absolute`, `sample-d-edge-cases`)
- **생성된 결과물**: `samples/output/*.docx`

---

## 2. 다음 개발 우선순위 과제 (Action Items)

### [우선순위 1] P1-1: 수평 인접 노드 클러스터링 알고리즘 구현 (`src/parser/figmaParser.ts`)
- **문제**: Non-Auto Layout에서 좌우 2단 배치 요소가 세로 1단으로 늘어짐.
- **해결 방안**:
  1. `parseChildren`에서 Y좌표로 정렬하기 전, Y좌표 범위가 유사(예: `|y1 - y2| < 15px`)하고 X좌표가 겹치지 않는 노드들을 감지.
  2. 감지된 노드들을 단일 가로 `ContainerElement` (또는 1행 N열 테이블)로 자동 묶어주는 수평 클러스터링 로직 구현.

### [우선순위 2] P1-3: Auto Layout Sizing Mode 비율 분할 (`src/renderer/docxRenderer.ts`)
- **문제**: 가로 Auto Layout에서 모든 자식 셀이 `100% / N`으로 균등 분할됨.
- **해결 방안**:
  1. 각 자식의 `absoluteBoundingBox.width` 비율을 계산.
  2. 고정 너비와 가변 너비의 상대 비율에 따라 `TableCell.width`를 동적으로 할당 (`Math.round(childWidth / totalWidth * 100)%`).

### [우선순위 3] P2-2: Figma REST API Live Fetcher 연동 (`src/api/figmaClient.ts`)
- **목적**: Figma Personal Access Token을 이용해 URL/Key만으로 실제 디자인 JSON 및 이미지 바이너리를 직접 가져오기.
- **구현 내용**:
  1. `GET https://api.figma.com/v1/files/:file_key` 호출.
  2. AST 내 모든 `imageRef` 수집 후 `GET https://api.figma.com/v1/images/:file_key`로 이미지 URL 획득 및 다운로드.
  3. `ConversionPipeline`의 `imageMap`에 바인딩하여 무중단 자동 변환.

### [우선순위 4] P2-1: 단일 텍스트 노드 내 다중 스타일 분할 (`characterStyleOverrides`)
- **문제**: 피그마에서 글자별로 다른 서식이 단일 서식으로 통일됨.
- **해결 방안**:
  - `node.characterStyleOverrides` 배열을 순회하며 스타일이 변하는 지점을 기준으로 문자열을 쪼개어 복수의 `TextRun`으로 생성.
