# Instructions for Web Argon: Phase 22 Independent Audit Protocol

본 문서는 사용자가 Gemini 웹의 Argon 모델에게 Figma2Word Phase 22 복구 결과에 대한 3차 독립 검토를 의뢰할 때, Argon이 효율적이고 체계적으로 검증할 수 있도록 돕는 검토 지침서이다.

---

## 1. 독립 검토자가 확인해야 할 핵심 자산 위치

1. **수정된 핵심 소스 코드**:
   - [`src/canvas/renderer/hwpxCanvasRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/hwpxCanvasRenderer.ts)
     - 구분선 캐노니컬 사각형 표현 로직 (`elem.type === "line"`)
     - 네이티브 `<hp:line>` 정규화 (`startPt`, `endPt`, `isReverseHV="0"`)
     - `header.xml` 내 `secCnt="1"` 고정
     - 기본 `charPr` 7대 필수 요소 완비
     - `drawText` 내부 안전 여백 및 수직 중앙 정렬
2. **무수정 보존된 DOCX 및 공통 파일 (수정 금지 준수 확인)**:
   - `src/canvas/renderer/docxCanvasRenderer.ts` (Git diff 0 바이트)
   - `src/canvas/parser/figmaCanvasParser.ts` (Git diff 0 바이트)
   - `src/canvas/parser/docxCanvasParser.ts` (Git diff 0 바이트)
   - `src/canvas/geometry/svgPathParser.ts` (Git diff 0 바이트)
   - `src/canvas/types.ts` (Git diff 0 바이트)
3. **신규 생성된 Phase 22 산출물 (22종)**:
   - `debug/hwpx-phase22/` 폴더 내 정규 7단계 및 분리형 15종 파일
4. **독립 AST 비교 도구**:
   - [`scripts/compare_hwpx_ast.py`](file:///c:/Users/77/Documents/Figma2Word/scripts/compare_hwpx_ast.py)
5. **독립 감사용 최신 컨텍스트 인제스트**:
   - `research/rea-document-engine/phase22-hwpx-recovery/PHASE22_ARGON_REINGEST.txt`

---

## 2. 권장 감사 체크포인트 (Audit Checklist)

Argon 모델은 다음 6개 항목을 집중 점검하라:

- [ ] **체크포인트 1: `<hp:line>` 하위 태그 및 속성 정합성**
  - 기존 `<hc:pt0>`/`<hc:pt1>`이 완전히 제거되고 `<hc:startPt>`와 `<hc:endPt>`가 올바르게 방출되는지 확인.
  - `isReverseHV="0"` 속성이 누락 없이 포함되어 있는지 확인.
- [ ] **체크포인트 2: 수평/수직 구분선의 캐노니컬 사각형 직렬화**
  - 보고서 및 카드의 직선형 구분선이 정품 한컴 문서와 동일하게 채움 사각형(`<hp:rect>`)으로 변환되어 뷰어 크래시 위험이 제거되었는지 확인.
- [ ] **체크포인트 3: 다중 페이지 구역 카운트 (`secCnt`) 일관성**
  - Stage 7(9페이지)의 `Contents/header.xml`에서 `secCnt`가 `9`가 아닌 실제 구역 수인 `1`로 기록되어 있는지 확인.
- [ ] **체크포인트 4: 기본 문자 속성 (`charPr id="0"`) 완전성**
  - 텍스트가 없는 진단 문서에서도 `hh:fontRef`, `hh:ratio`, `hh:spacing`, `hh:relSz`, `hh:offset`이 모두 포함되는지 확인.
- [ ] **체크포인트 5: DOCX 무회귀 (Zero Regression)**
  - DOCX 5대 핵심 소스코드가 전혀 수정되지 않았으며, 365개 Vitest 테스트가 100% 통과하는지 확인.
- [ ] **체크포인트 6: 정품 레퍼런스 문서와의 AST 정합성**
  - `python scripts/compare_hwpx_ast.py` 실행 시 규격 위반(SPEC_VIOLATION)이 0건인지 확인.
