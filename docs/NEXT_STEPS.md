# 다음 작업자 인수인계 가이드 (NEXT_STEPS)

- **갱신 일시**: 2026-10-07 (Phase 3 완료 기준)

본 문서는 Phase 3(Layout Strategy 재설계 및 P1 해결) 완료 후, 후속 개발자(Phase 4)가 즉시 착수할 수 있는 작업 로드맵을 안내한다.

---

## 1. 현재 환경 및 코드베이스 상태

- **빌드 상태**: `npm run build` 및 `npm run build:web` 100% 정상 (0 에러).
- **테스트 상태**: `npm test` 실행 시 9개 테스트 스위트, **32개 테스트 100% 통과 (Vitest 32/32 Passed)**.
- **아키텍처 상태**:
  - `src/layout/layoutEngine.ts` 도입 완료.
  - P1-1(수평 클러스터링), P1-2(오버레이 폴딩), P1-3(비례 컬럼 너비) 해결 완료.
  - IR 최소 확장(`columnWidths`) 및 DOCX Renderer 반영 완료.
- **Fixture 및 결과물**:
  - `samples/layout/`: P1 검증 전용 Fixture 7종 완비.
  - `samples/output/`: 7대 Fixture 실제 DOCX 파일 생성 및 검증 완료.

---

## 2. 다음 단계 (Phase 4) 우선순위 과제 (Action Items)

### [우선순위 1] P2-2: Figma REST API Live Fetcher 연동 (`src/api/figmaClient.ts`)
- **목적**: 수동 JSON 복사/붙여넣기 없이 Figma URL 및 Personal Access Token(PAT) 입력만으로 라이브 디자인 데이터 가져오기.
- **구현 내용**:
  1. `GET https://api.figma.com/v1/files/:file_key` 호출 파서 연동.
  2. AST 내 모든 `imageRef` 수집 후 `GET https://api.figma.com/v1/images/:file_key`로 고해상도 이미지 바이너리 다운로드.
  3. `ConversionPipeline`의 `imageMap`에 바인딩하여 원격 이미지 자동 임베딩.

### [우선순위 2] P2-1: 단일 텍스트 노드 내 다중 스타일 분할 (`characterStyleOverrides`)
- **목적**: 하나의 텍스트 상자 안에서 일부 글자만 굵게(Bold), 밑줄, 다른 색상으로 지정된 실무 디자인 보존.
- **구현 내용**:
  - `node.characterStyleOverrides` 및 `styleOverrideTable`을 순회하여 스타일 경계면에서 텍스트를 청크로 분할하고 복수의 `TextRun` 생성.

### [우선순위 3] P2-3: Line 및 Divider 요소의 정렬/폭 커스터마이징
- **목적**: 구분선(Line, Divider)이 부모 폭의 100%로 고정되는 것을 방지하고, 피그마 상의 원래 너비 및 좌/우/중앙 정렬을 지원.

### [우선순위 4] 웹 UI 실무 연동 고도화 (`apps/web/`)
- **목적**: 브라우저에서 Figma Token 및 File URL을 입력하여 즉시 가져오고 변환할 수 있는 Live Importer 탭 추가.
