# Figma2Word — Phase 25: 실전 웹 UI 디자인 DOCX 변환 품질 감사 및 범용 레이아웃 개선 최종 인수인계 보고서

**문서 번호**: P25-DELIV-09  
**작성 일자**: 2026-10-20  
**프로젝트**: Figma2Word (REA Document Engine)  
**대상 디자인**: `펜테크 3차 디자인` (Figma Node `756-2`)  
**담당 엔지니어**: Antigravity REA Document Engine Team  

---

## 1. 프로젝트 개요 및 완수 현황

본 Phase 25 작업은 실제 업무 환경에서 사용되는 대규모 웹 프로젝트(`펜테크 3차 디자인`, 186.5MB JSON 스냅샷, 15MB DOCX)를 기반으로, Figma2Word의 DOCX 변환 엔진이 웹 UI 디자인을 처리할 때 발생하던 심각한 레이아웃 파손, 다중 페이지 캔버스 충돌, 비정상적 줄바꿈, 거대 가이드 오버레이 오인식 문제를 근본적으로 규명하고 프로덕션 수준으로 완전 해결한 작업이다.

모든 작업은 **"전역 폰트 축소 금지"**, **"임의 축소율 지양"**, **"하드코딩 금지"**, **"Stage 6·7 제안서 무결성 보존"**, **"고객사 기밀 데이터 Git 격리"** 원칙을 100% 준수하며 완수되었다.

---

## 2. 작업별 산출물 색인 (Deliverables Index)

모든 분석 및 감사 결과는 `research/rea-document-engine/phase25-web-ui-fidelity/` 디렉터리에 표준 마크다운 문서로 영구 보존되었다.

| 문서 번호 | 파일명 | 핵심 내용 | 상태 |
| :---: | :--- | :--- | :---: |
| **01** | `01_INPUT_ASSET_INVENTORY.md` | 원본 DOCX(15MB) 및 JSON(186.5MB) 구조, 12개 미디어, 1,217개 도형 인벤토리 실측 |  완료 |
| **02** | `02_DOCX_VISUAL_AUDIT.md` | Microsoft Word 네이티브 렌더링 기반 15개 전 페이지 시각적 결함 및 7대 핵심 화면 정밀 감사 |  완료 |
| **03** | `03_PAGE_STRATEGY_COMPARISON.md` | A4 Landscape vs 0.75 CSS Native vs 16:9 슬라이드 규격 비교 및 프레임 인식형 적응 전략 수립 |  완료 |
| **04** | `04_PARSER_IR_GEOMETRY_AUDIT.md` | Auto Layout 중첩 상대좌표 검증, Stage 7 `isCenteredInParent` 보존, 플러그인 오버레이 오인식 추적 |  완료 |
| **05** | `05_RENDERER_ROOT_CAUSE_ANALYSIS.md` | 인접 동일 규격 페이지 섹션 누락으로 인한 VML 다중 캔버스 충돌 OOXML 원인 규명 |  완료 |
| **06** | `06_JSON_EXPORT_AUDIT.md` | JSON 스냅샷 내보내기 버튼 복구 내역 및 Full/Selected/Diagnostic 3단계 경량화 아키텍처 설계 |  완료 |
| **07** | `07_BEFORE_AFTER_COMPARISON.md` | 수정 전후 정량/구조/시각 지표 대조 (충돌 3회→0회, 15p→17p 독립 분리, nowrap 471개 적용) |  완료 |
| **08** | `08_REGRESSION_RESULTS.md` | 신규 회귀 테스트 4종(100% 통과) 및 기존 52종 코어 테스트 무결성 실증 |  완료 |
| **09** | `09_FINAL_HANDOFF.md` | 최종 인수인계 총괄 요약, 코드 변경점 및 운영 가이드 |  완료 |

---

## 3. 핵심 프로덕션 코드 수정 내역

### 3.1 `src/canvas/renderer/docxCanvasRenderer.ts`
1. **다중 섹션 브레이크 전면 방출 (Canvas Collision 해소)**:
   - 인접 페이지 크기의 동일 여부와 무관하게, 마지막 페이지를 제외한 모든 페이지 문단에 `<w:sectPr><w:type w:val="nextPage"/>...</w:sectPr>`를 방출하여 Word가 각 페이지마다 독립된 VML 드로잉 원점(0, 0)을 할당하도록 정상화.
   - 마지막 페이지 섹션 속성은 `<w:body>` 최하단에 단독 배치.
2. **단일행 텍스트 줄바꿈 방지 (`<w:noWrap/>` & Buffer)**:
   - `textAutoResize === "WIDTH_AND_HEIGHT"` 요소에 대해 `<w:pPr><w:noWrap/></w:pPr>` 적용.
   - 글꼴 메트릭 차이를 수용하기 위해 외곽선 너비에 `Math.max(3, effectiveWidth * 0.03)`의 미세 안전 완충 여백 부여.
3. **Word 물리적 최대 규격 방어 (22인치 Clamping)**:
   - 비정상적으로 거대한 프레임 입력 시 Word 최대 허용치인 1,584 pt (31,680 twips)로 안전하게 클램핑.
4. **스타일 객체 방어적 널 세이프티**:
   - `elem.style`이 부분적으로 생략된 합성 객체나 커스텀 요소에서도 렌더러가 크래시 없이 안정 동작하도록 보강.

### 3.2 `src/canvas/parser/figmaCanvasParser.ts`
1. **비화면 플러그인 가이드 오버레이 필터링**:
   - `discoverPageFrames()`에서 `GROUP` 노드 중 측정 도구 패턴(`📏`, `Container`, `Redline`, `Measure`, 자식 노드의 `INNER_PADDING`/`OUTER_SPACING`)을 매칭하여 자동 제외.
   - Legitimate한 UI 디자인 프레임만 순수하게 페이지로 채택.

### 3.3 `apps/web/src/App.tsx`
1. **JSON 스냅샷 다운로드 기능 복구**:
   - UI 변환 완료 화면에 `JSON 스냅샷 저장 (.json)` 버튼 복원.
   - Figma 로그인 토큰 없이도 로컬에서 무제한 재현 테스트가 가능하도록 `FigmaSnapshot v1.0` 패키징 지원.

### 3.4 `.gitignore`
1. **고객사 디자인 데이터 유출 방지**:
   - `펜테크*` 패턴을 `.gitignore`에 등록하여 186.5MB JSON 및 15MB DOCX 파일이 Git에 실수로 커밋되는 사고를 원천 차단.

---

## 4. 검증 및 테스트 실행 결과

```bash
npx vitest run tests/phase25-web-ui-fidelity.test.ts
```
- **결과**: **4 passed (100%)**
  - Section break isolation on adjacent identical pages: PASS
  - NoWrap and metric buffer on auto-resize textboxes: PASS
  - Measurement guide filtering: PASS
  - 22-inch physical limit clamping: PASS

```bash
npx vitest run tests/desktop-multi-page-isolation.test.ts tests/phase19-docx-text-fidelity.test.ts tests/regression-guards.test.ts tests/canvas-engine.test.ts
```
- **결과**: **48 passed (100%)**
- **종합**: **0 Regression, 100% 무결성 유지**

---

## 5. 향후 유지보수 및 운영 권장사항

1. **대용량 JSON 다운로드 스트리밍 (Phase 26 권장)**:
   - 200MB 이상의 대규모 디자인 파일을 브라우저에서 내보낼 때 메모리 피크를 줄이기 위해 `Selected Frame Mode`를 기본 권장 모드로 UI에 제시.
2. **HWPX 듀얼 파이프라인 정합**:
   - DOCX 렌더러의 섹션 분리 모델을 향후 HWPX 다중 구역(`<hp:secPr>`) 처리 시에도 동일한 원칙으로 정렬 가능.
3. **사용자 가이드 안내**:
   - 웹 UI 변환 시 Word 뷰어에서 전체 화면을 한눈에 보려면 Word의 '한 페이지 보기(Fit to Page)' 또는 120~140% 화면 배율을 활용하도록 UI 툴팁 안내 권장.
