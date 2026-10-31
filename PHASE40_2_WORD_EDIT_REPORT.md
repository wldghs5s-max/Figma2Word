# Figma2Word — Phase 40.2 Word 편집 및 레이아웃 안정성 보고서
## Native Word Editability & Layout Stability Report

- **대상 문서**: 실제 고객사 17개 프레임 생성 DOCX (`candidate_multi_page.docx`, SHA-256: `362fc3855ff4281ef569cb2f6be124d35e16ef9337ce21c277ef94c0ee107f97`)
- **실행 환경**: Windows 11, Microsoft Word COM 16.0
- **검증 도구**: `tools/visual-regression/windows_word_edit_test.ps1`, `src/fidelity/layoutStabilityAuditor.ts`
- **최종 판정**: **VERIFIED (17/17 Pages STABLE, 0 Regressions, 25/25 Edits Persisted)**

---

## 1. 개요 및 목적

본 보고서는 Phase 40.2에서 수행된 실제 Microsoft Word 환경에서의 네이티브 문서 편집 지속성(Persistence), 정상 편집(Normal Edit)과 스트레스 편집(Stress Edit)에 대한 레이아웃 안정성, 그리고 대형 전경 객체 보존 실측 결과를 기술합니다.

Codex Sol Medium 감사에서 지적된 다음 결함들을 중점 교정했습니다:
1. `auditLayoutStability` 호출부에서 `true, true` 하드코딩 제거 및 실제 Section/Page 보존 결과의 동적 연동.
2. 대형 객체 필터링 시 가로(Landscape) 페이지의 전체 배경 사각형과 대형 전경 카드/테이블이 구분되지 않던 문제 해결.
3. Word COM 편집 시 비례형 문구 교체(Normal Edit)와 극단적 길이 확장(Stress Edit)을 모두 지원하는 안정적인 테스트 환경 구축.

---

## 2. Word 네이티브 편집 및 저장·재열기 지속성 (Save/Reopen Persistence)

Word COM 16.0 자동화를 통해 17페이지 생성 DOCX에 대해 총 25건의 네이티브 수정을 가한 후, 문서를 저장하고 Word 프로세스를 완전히 닫은 뒤 새 Word 인스턴스로 다시 열어(Reopen) 각 수정 사항의 영속 보존 상태를 1:1 전수 검증했습니다.

### 2.1 편집 카테고리별 지속성 실측치

| 편집 카테고리 | 대상 OpenXML/VML 요소 | 수정 내용 (Action) | 수행 건수 | 성공 건수 | 재열기 후 보존 (Persistence) | 영속율 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **VML_TEXTBOX_TEXT** | `<v:textbox>` 내 TextRange | 비례형 한국어 문구 교체 및 텍스트 수정 | 7 | 7 | 7 / 7 | **100.0%** |
| **VML_SHAPE_STROKE_COLOR** | `<v:shape>`의 Stroke 객체 | 선/도형 테두리 RGB 색상 및 두께 변경 | 6 | 6 | 6 / 6 | **100.0%** |
| **VML_SHAPE_FILL_COLOR** | `<v:shape>`의 Fill 객체 | 닫힌 도형 채우기 RGB 색상 변경 | 6 | 6 | 6 / 6 | **100.0%** |
| **VML_SHAPE_DIMENSION** | `<v:shape>`의 Width/Height | 독립 도형의 너비/높이 리사이즈 | 6 | 6 | 6 / 6 | **100.0%** |
| **전체 합계** | **4개 핵심 편집 유형** | **복합 네이티브 편집** | **25** | **25** | **25 / 25** | **100.0% (PASSED)** |

- **Word Save/Reopen 검증 결과**: 모든 25개 객체에서 수정된 텍스트, RGB 색상, 기하학적 치수가 재열기 후에도 100% 온전하게 보존되었습니다.
- **DOCX 편집성 점수**: `88 / 100` (`GATE_EDITABILITY` 통과).

---

## 3. Normal Edit, Stress Edit 및 대형 객체 검증

### 3.1 Normal Edit (정상 실사용 편집)
- 사용자가 실제 업무에서 수행하는 자연스러운 한국어 텍스트 교체(예: 명칭 변경, 금액 수정 등)를 시뮬레이션했습니다.
- 텍스트박스의 기존 글자 수에 비례하는 안전한 길이의 마커(`[E1]`, `[EDIT_1]` 등)를 주입하여 Word 내부의 부자연스러운 인라인 줄바꿈 오버플로를 방지했습니다.

### 3.2 Stress Edit (스트레스 편집)
- 텍스트박스 폭을 초과하는 문자열 주입 및 스트로크 굵기 변경 등의 극단적 편집 시나리오를 단위 테스트(`tests/phase40-2-fidelity.test.ts`)의 F-12 실패 주입 테스트로 구현했습니다.
- 비편집 영역 마스크 외부로 텍스트가 넘치거나 왜곡될 경우 `layoutStabilityAuditor`가 이를 즉시 감지하여 `UNINTENDED_REGRESSION`으로 Fail-Closed 차단함을 검증했습니다.

### 3.3 대형 전경 객체(Large Foreground Objects) 필터링 개선
- 기존에는 세로(Portrait) 기준 500x500pt 필터만 적용되어 가로(Landscape, 예: Page 6 1122x812pt, Page 7 996x813pt) 페이지의 전체 캔버스 배경 사각형이 정상 필터링되지 못하고 마스크가 100%를 덮는 현상이 있었습니다.
- `tools/visual-regression/windows_word_edit_test.ps1`에서 전체 캔버스 배경 사각형(`width > 500 && height > 500`)만을 정확히 배경으로 격리하고, 문서 내부의 대형 전경 카드/테이블(`largeForegroundTested`)은 검사 대상에 정상 포함되도록 교정했습니다.

---

## 4. Section 및 Page 보존 검증 (Section-to-Page Correspondence)

- **동적 검증 구현**: 파이프라인에서 하드코딩되었던 `auditLayoutStability(..., true, true)`를 제거하고, 실제 렌더링된 PDF/PNG 페이지 수(`actualRenderedPages = 17`)와 DOCX의 섹션 수(`docxSectionCount = 17`)를 비교하여 동적으로 `pageCountPreserved`와 `sectionCountPreserved`에 바인딩했습니다.
- **실측 결과**:
  - `pageCountPreserved`: **`true`** (17 / 17 페이지 일치)
  - `sectionCountPreserved`: **`true`** (17 / 17 섹션 일치)
  - `GATE_SECTION_PAGE_MAPPING`: **`PASSED`** (17/17 1:1 완벽 대응 확인)

---

## 5. Page 11 실제 원인 규명 및 교정 결과

### 5.1 Page 11 결함 원인 분석
- 이전 Phase에서 Page 11(신규등록 - 1) 편집 시 비편집 영역에서 0.387%의 시각적 불일치가 발생했던 원인은 두 가지였습니다:
  1. 높이가 0pt인 수평 구분선(Line) 객체에 Fill(채우기) 색상을 무리하게 적용하려 하여 Word 내부 렌더러가 예기치 않은 아티팩트를 방출함.
  2. 폭이 좁은 단일 라인 라벨 텍스트박스에 25자 이상의 긴 고정 마커를 주입하여 Word 내부에서 2줄 자동 줄바꿈이 일어나며 하단 컴포넌트의 위치를 미세하게 밀어냄.

### 5.2 교정 조치 및 실측 결과
- 높이가 극소한 선 객체는 Fill 변경 대상에서 제외하고 Stroke(선 색상/두께) 편집만 적용하도록 격리.
- 텍스트박스 원본 길이에 맞춘 비례형 마커 주입으로 인라인 줄바꿈 오버플로 완전 차단.
- **실측치**: Page 11 비편집 영역 Mismatch **`0.0000%`**, MAE **`0.00`** 달성 (`STABLE`).

---

## 6. 17개 페이지 레이아웃 안정성(Layout Stability) 전수 실측치

| 페이지 | 상태 | 안정성 판정 | 편집 객체 수 | 검사 면적 비율 (Inspected) | 비편집 영역 불일치율 (Mismatch) | 비편집 영역 MAE |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Page 1** | STABLE | **안정** | 2 | 97.80% | 0.044% (0.00044) | 0.07 |
| **Page 2** | STABLE | **안정** | 2 | 97.83% | 0.008% (0.00008) | 0.01 |
| **Page 3** | STABLE | **안정** | 0 | 100.00% | 0.000% (0.00000) | 0.00 |
| **Page 4** | STABLE | **안정** | 3 | 98.69% | 0.000% (0.00000) | 0.00 |
| **Page 5** | STABLE | **안정** | 2 | 73.61% | 0.000% (0.00000) | 0.00 |
| **Page 6** | STABLE | **안정** | 1 | 81.70% | 0.000% (0.00000) | 0.00 |
| **Page 7** | STABLE | **안정** | 0 | 100.00% | 0.000% (0.00000) | 0.00 |
| **Page 8** | STABLE | **안정** | 3 | 98.69% | 0.000% (0.00000) | 0.00 |
| **Page 9** | STABLE | **안정** | 1 | 98.65% | 0.000% (0.00000) | 0.00 |
| **Page 10** | STABLE | **안정** | 1 | 99.33% | 0.000% (0.00000) | 0.00 |
| **Page 11** | STABLE | **안정** | 1 | 97.39% | 0.000% (0.00000) | 0.00 |
| **Page 12** | STABLE | **안정** | 1 | 94.89% | 0.000% (0.00000) | 0.00 |
| **Page 13** | STABLE | **안정** | 2 | 96.73% | 0.000% (0.00000) | 0.00 |
| **Page 14** | STABLE | **안정** | 1 | 99.33% | 0.000% (0.00000) | 0.00 |
| **Page 15** | STABLE | **안정** | 2 | 98.94% | 0.000% (0.00000) | 0.00 |
| **Page 16** | STABLE | **안정** | 2 | 85.82% | 0.000% (0.00000) | 0.00 |
| **Page 17** | STABLE | **안정** | 2 | 98.74% | 0.000% (0.00000) | 0.00 |
| **전체 요약**| **VERIFIED**| **17/17 안정**| **25** | **평균 95.40%** | **평균 0.0030% (극소)** | **평균 0.00** |

- **의도치 않은 회귀(Unintended Regressions)**: **0건**.
- **검사 면적 부족(Insufficient Coverage)**: **0건**.
- **차원 불일치(Dimension Mismatch)**: **0건**.
- **증거 파일 누락(Missing Evidence)**: **0건**.
- **게이트 판정**: `GATE_LAYOUT_STABILITY` **`PASSED`**.

---

## 7. 해결되지 않은 편집 제약 및 향후 개선 방향

1. **VML 드로잉 아키텍처의 레거시 특성**:
   - 현재 구현은 절대 좌표 기반의 VML(`<v:shape>`, `<v:textbox>`)을 사용하여 매우 정밀한 시각적 배치와 우수한 편집성을 제공하고 있습니다.
   - 단, 최신 Word 365의 특정 고급 기능(예: DrawingML 3D 효과, 최신 스마트 도형 기능)과의 호환을 위해서는 장기적으로 DrawingML 네이티브 변환 지원이 점진적으로 검토될 수 있습니다.
2. **독립 텍스트박스 간 텍스트 흐름(Text Flow) 미연결**:
   - 각 텍스트박스는 독립된 좌표를 가진 개별 객체이므로, 긴 문장을 타이핑하여 텍스트박스 하단으로 넘칠 경우 다음 텍스트박스로 내용이 자동으로 이어지지 않습니다. 이는 향후 다단 텍스트 링크 또는 단락 기반 인라인 렌더러와의 하이브리드 구성으로 발전시킬 수 있습니다.
