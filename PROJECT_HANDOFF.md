# Project Handoff Document
## Figma2Word Engineering Architecture & Production Capability Status

- **버전**: Phase 40.2 Original Vector Fidelity Recovery & Native Word Editing Hardening
- **저장소**: `wldghs5s-max/Figma2Word`
- **브랜치**: `master`
- **수정 전 Git HEAD**: `d4896be6afbbcd9a4e075375b8bc352264d75ef8`
- **독립 감사자 / 엔지니어링 협업자 대상**: AI Engineering Collaborators (ChatGPT, Codex, Gemini)

---

## 1. 프로젝트의 본질과 궁극적 목표

본 프로젝트의 궁극적인 목적은 **Figma 디자인을 높은 시각적 충실도를 유지하면서 Microsoft Word에서 실제로 편집 가능한 DOCX 문서로 변환하는 범용 엔지니어링 엔진**을 구현하는 것입니다.

장기적으로 동일한 정규화된 중간 표현(Canvas IR)을 활용하여 HWPX(한글 문서) 생성까지 원활하게 확장할 수 있는 아키텍처를 지향합니다.

다음 기본 원칙을 엄격하게 준수합니다:
1. **실제 변환 품질 최우선**: 시각 충실도와 Word 실사용 편집성을 동시에 보호합니다.
2. **Fail-Closed 품질 게이트**: 불완전한 검사나 잘못된 입력으로 인한 허위 성공(False Positive)을 원천 차단합니다.
3. **정직한 출처(Provenance) 분류**: 추정 형상을 원본 복원으로 과장하지 않고, 출처를 투명하게 구분하여 보고합니다.

---

## 2. 시스템 아키텍처 및 Canvas IR 구조

```text
[Figma JSON Document]
        ↓
1. Source Parser (`src/canvas/parser/figmaCanvasParser.ts`)
   - 17개 타겟 프레임 탐색, 기하학적 정규화, 오토레이아웃 계산
   - 텍스트 스타일 런 추출, 도형/선 추출, 이미지 노드 추출
   - 다중 자식 VECTOR 분해 합성 (`totalVectorSiblings > 1`: 선, 호, 훅, 점, 박스)
   - UI 아이콘 의미적 패스 매핑 (단어 경계 기반: profile, update, chevron 등)
   - 형상 출처(Provenance) 명시적 태깅 (`geometryProvenance`)
        ↓
2. Intermediate Representation (Canvas IR: `src/canvas/types.ts`)
   - CanvasDocument / CanvasPage / CanvasElement
   - 해상도 독립적 절대 좌표계 (pt 단위)
   - `geometryProvenance`: SOURCE_GEOMETRY | LOCALLY_RECOVERED_GEOMETRY |
                           SEMANTIC_APPROXIMATION | GEOMETRIC_FALLBACK | UNRESOLVED
        ↓
3. Document Renderers
   ├─ DOCX Renderer (`src/canvas/renderer/docxCanvasRenderer.ts`)
   │  - OpenXML / VML (`<v:shape>`, `<v:textbox>`, `<v:rect>`, `<v:line>`)
   │  - `alt="${elem.sourceNodeId}"` 및 `o:title` 원본 식별자 영속 바인딩
   │  - 단일 라인 텍스트박스 인라인 줄바꿈 방지 (`mso-wrap-style:none`)
   │  - 미디어 관계(`word/_rels/document.xml.rels`) 및 바이너리 매핑
   └─ HWPX Renderer (Canvas IR 기반 HWPX 확장 준비 완료)
        ↓
4. Verification & Fidelity Engine (`src/fidelity/`)
   - `verificationVerdict.ts`: 9대 필수 게이트 단일 승인 계약 및 OS 프로세스 종료 코드(0/1) 보장
   - `integrityGate.ts`: 절대 벤치마크 모드(`ABSOLUTE_FIGMA_TO_WORD`) 및 입력 디스크 바이트 SHA-256 검증
   - `objectTraceability.ts`: 1:1 소스-Word 객체 매핑, `<w:br>`/`<w:cr>` 줄바꿈 지원 텍스트 100% 일치 검증
   - `layoutStabilityAuditor.ts`: 마스킹 기반 비편집 영역 무훼손(Zero Collateral Damage) 및 동적 Page/Section 보존 검증
   - `editabilityAuditor.ts`: Word 네이티브 편집성 점수 감사
```

---

## 3. 실제 구현 및 검증된 기능 현황 (Phase 40.2 완료)

### 3.1 렌더러 및 벡터 형상 충실도
- **토큰 오분류 원천 차단**:
  - `profile` 토큰: 기존 `file` 정규식 충돌을 제거하고 사용자 두상(원형) + 어깨 곡선 경로 매핑 (`SEMANTIC_APPROXIMATION`).
  - `update` 토큰: 기존 `date` 정규식 충돌을 제거하고 270도 회전 원호 + 화살촉 경로 매핑 (`SEMANTIC_APPROXIMATION`).
  - 화살표 꺾쇠 분리: `arrow-left`(`<`)와 `arrow-right`(`>`) 방향성 명확히 분리.
- **다중 VECTOR 자식 분해 합성**:
  - 부모 아래 복수의 VECTOR 자식이 존재할 때, 동일한 아이콘이 중복 합성되어 찌그러지던 현상 해소.
  - 자식의 가로/세로 비율과 치수에 맞추어 선 0x2, 원형 호, 훅(화살촉), 점, 박스로 분해 복원 (`LOCALLY_RECOVERED_GEOMETRY`).
- **서브패스 전수 결합**:
  - Figma의 `fillGeometry`, `strokeGeometry`, `vectorPaths` 모든 서브패스를 누락 없이 `paths.join(" ")` 결합 (`SOURCE_GEOMETRY`).
- **미인식 아이콘 기하 폴백**:
  - 의미적 추정이 불가능한 노드는 거짓 복원하지 않고 `GEOMETRIC_FALLBACK`으로 투명하게 분류.

### 3.2 콘텐츠 보존율 (Content Preservation)
- **텍스트 보존율**: **628 / 628 (100.00%)**
  - `<w:br>` 및 `<w:cr>` 태그 파싱 지원으로 이전 오판되었던 4개 노드(`757:155`, `757:165`, `766:1947`, `759:1622`) 텍스트 100% 일치 확인.
- **도형 보존율**: **327 / 327 (100.00%)**
  - 모든 327개 도형이 VML 네이티브 벡터 요소로 DOCX에 생성됨.
- **이미지 보존율**: **19 / 19 (100.00%)**
  - 11개 고유 미디어 바이너리 및 관계가 완벽하게 바인딩됨.
- **DOCX OpenXML 매핑**: **1,312 / 1,312 (100.00%)**, 미해결 객체 **0개**.

### 3.3 Word 실사용 편집 안정성 (Editability & Layout Stability)
- **네이티브 Word 편집 영속성**: **25 / 25 (100.00%)**
  - Word 16.0 COM으로 텍스트 수정(7), 선/도형 스트로크 색상 변경(6), 도형 채우기 색상 변경(6), 도형 너비 확장(6) 수행.
  - 저장 및 프로세스 완전 종료 후 새 Word 인스턴스로 재열어 25건 전원 보존 확인.
- **마스킹 기반 레이아웃 안정성**:
  - 17개 페이지 전원 **`STABLE`** (0건의 의도치 않은 회귀).
  - 비편집 영역 부수적 훼손(Collateral Damage): **0.0030% (극소)**, MAE **0.00**.
  - 동적 Section-to-Page 대응: `pageCountPreserved = true`, `sectionCountPreserved = true` (17/17 일치).

### 3.4 시각적 충실도 (Visual Fidelity)
- **16개 유효 프레임 평균 SSIM**: **`0.9492`** (Phase 40 0.9490 대비 향상, 0개 프레임 후퇴).
- 평균 MAE `2.55`, 평균 RMSE `14.83`.

---

## 4. 실제 고객사 문서 실측 베이스라인 (Ground Truth)

- **입력 파일**: `펜테크 3차 디자인.json` (SHA-256: `390e774379c9ff9bdc72e0b1918c557e9ea9f3128662692456f8e84a82e0527a`, 186.52 MB)
- **대상 프레임**: 17개
- **참조 이미지**: 16개 (프레임 `759:1533`은 원본 PNG 없음)
- **생성 DOCX SHA-256**: `362fc3855ff4281ef569cb2f6be124d35e16ef9337ce21c277ef94c0ee107f97`
- **총 소스 노드**: 2,033개
- **Canvas IR 객체**: 1,312개 (컨테이너 721개 제외)
- **DOCX OpenXML 매핑 객체**: 1,312개 (미해결 0개)
- **형상 출처(Provenance) 구성**:
  - Source Geometry: 0 (고객사 JSON 원본에 SVG 기하 데이터 부재)
  - Locally Recovered: 175 (복수 자식 기하 분해 합성)
  - Semantic Approximation: 60 (토큰 기반 의미적 근사)
  - Geometric Fallback: 3 (기본 도형 폴백)
  - Unresolved: 89 (형상 데이터 부재 특수 노드)
- **9대 필수 게이트**: **9 / 9 PASSED (`FINAL VERDICT: PASSED (Approved: true, Exit Code: 0)`)**

---

## 5. HWPX 확장 계획 및 아키텍처 로드맵

1. **Canvas IR 기반 HWPX Renderer 구축**:
   - 현재 정립된 Canvas IR(1,312개 객체, 정규화된 좌표계, UI 아이콘 VML/SVG 경로)을 활용하여 HWPX의 `section*.xml` (한글 네이티브 드로잉 및 텍스트박스 요소)으로의 1:1 변환 엔진 구현.
2. **Word 네이티브 표(Table) 최적화**:
   - 현재 절대 좌표 격자로 렌더링되는 표 요소들을 Word 네이티브 `<w:tbl>` 구조로 고도화하여 표 셀 단위의 직관적인 편집 지원 강화.
3. **Figma Vector Export 연동**:
   - Figma 플러그인 또는 API 호출 시 vector data export 옵션을 활성화하여 `SOURCE_GEOMETRY` 비율을 추가 확대.
