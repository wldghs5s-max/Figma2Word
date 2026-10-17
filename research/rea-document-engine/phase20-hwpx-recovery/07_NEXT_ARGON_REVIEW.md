# Instructions for Web Argon: Phase 20 Independent Verification Protocol

본 문서는 사용자가 내일 Gemini 웹의 Argon 모델에게 Figma2Word 프로젝트의 HWPX 엔진 복구 결과를 독립 검토 의뢰할 때, Argon이 효율적이고 체계적으로 검증할 수 있도록 돕는 검토 지침서이다.

---

## 1. 독립 검토자가 확인해야 할 핵심 자산 위치

1. **수정된 핵심 소스 코드**:
   - [`src/canvas/renderer/hwpxCanvasRenderer.ts`](file:///c:/Users/77/Documents/Figma2Word/src/canvas/renderer/hwpxCanvasRenderer.ts)
2. **무수정 보존된 DOCX 및 공통 파일 (수정 금지 준수 확인용)**:
   - `src/canvas/renderer/docxCanvasRenderer.ts` (Git diff 없음)
   - `src/canvas/parser/figmaCanvasParser.ts` (Git diff 없음)
   - `src/canvas/parser/docxCanvasParser.ts` (Git diff 없음)
   - `src/canvas/geometry/svgPathParser.ts` (Git diff 없음)
   - `src/canvas/types.ts` (Git diff 없음)
3. **새로 작성된 적격성 테스트 스위트**:
   - [`tests/hwpx-schema-conformance.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/hwpx-schema-conformance.test.ts)
4. **단계별 HWPX 산출물 (7종)**:
   - `debug/hwpx-recovery/stage1-korean-text.hwpx`
   - `debug/hwpx-recovery/stage2-typography.hwpx`
   - `debug/hwpx-recovery/stage3-rect-line.hwpx`
   - `debug/hwpx-recovery/stage4-textbox-oval-vector.hwpx`
   - `debug/hwpx-recovery/stage5-images.hwpx`
   - `debug/hwpx-recovery/stage6-representative-report.hwpx`
   - `debug/hwpx-recovery/stage7-full-report.hwpx`
5. **Argon 전용 컨텍스트 주입 파일**:
   - `PHASE20_ARGON_REINGEST.txt` (저장소 루트에 위치)

---

## 2. 권장 검토 체크리스트 (Audit Checklist)

Argon은 다음 8개 체크포인트를 집중 점검하라:

- [ ] **체크포인트 1: DOCX 엔진 비침범성 (Zero Regression)**
  - `git diff origin/master -- src/canvas/renderer/docxCanvasRenderer.ts`가 완전히 비어있는지 확인.
  - DOCX 텍스트 충실도 및 기존 테스트 스위트(357건)가 모두 정상 작동하는지 확인.
- [ ] **체크포인트 2: `<hp:secPr>` 위치 및 내용 모델**
  - `Contents/section0.xml`에서 `<hp:secPr>`가 문단(`<hp:p>`) 직하에 노출되지 않고, 반드시 `<hp:run charPrIDRef="0">` 내부에 감싸져 있는지 확인.
  - `hp:grid` -> `hp:startNum` -> `hp:visibility` -> `hp:lineNumberShape` -> `hp:pagePr` -> `hp:footNotePr` -> `hp:endNotePr` -> `hp:pageBorderFill` 순서 준수 여부.
- [ ] **체크포인트 3: 도형 자식 요소의 엄격한 순서 (Schema Sequence)**
  - `hp:rect`, `hp:oval`, `hp:line`, `hp:polygon`, `hp:pic` 모두 15단계 순서(`offset` -> `orgSz` -> `curSz` -> `flip` -> `rotationInfo` -> `renderingInfo` -> `lineShape` -> `fillBrush`/`imgRect` -> `drawText` -> `shadow` -> Geometry -> `sz` -> `pos` -> `outMargin`)를 지키는지 확인.
- [ ] **체크포인트 4: 타원 전용 지오메트리**
  - `hp:oval`에 `<hc:center>`, `<hc:ax1>`, `<hc:ax2>`, `<hc:start1..end2>`가 올바른 수치로 계산되어 방출되는지 확인.
  - 속성에 `intervalDirty="0"`, `hasArcPr="0"`, `arcType="NORMAL"`이 포함되었는지 확인.
- [ ] **체크포인트 5: 선 및 다각형 좌표 네임스페이스**
  - `hp:line`이 `isReverseHV="0"` 및 `<hc:pt0>`, `<hc:pt1>`을 사용하는지 확인.
  - `hp:polygon`이 `<hc:pt x="..." y="..."/>`를 사용하는지 확인.
- [ ] **체크포인트 6: 이미지 구조 정합성**
  - 비표준 `binRef` 및 불필요한 `<hp:inImgDim>`이 완전히 제거되었는지 확인.
  - `<hp:imgRect>` 내부에 `<hc:pt0>`~`<hc:pt3>`이 자식으로 들어가 있는지 확인.
- [ ] **체크포인트 7: 도형 ID 타입 (`unsignedInt`)**
  - `id` 및 `instid`에 `1_1`, `1_1_1` 같은 문자열이 없고, 1부터 증가하는 순수 정수(`1, 2, 3...`)인지 확인.
- [ ] **체크포인트 8: 헤더 7대 언어 대문자 열거형**
  - `Contents/header.xml`의 `hh:fontface`에 `lang="HANGUL"`, `lang="LATIN"` 등 대문자 열거형이 올바르게 반영되었는지 확인.

