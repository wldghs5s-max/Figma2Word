# Project Handoff Document
## Figma2Word Engineering Architecture & Production Capability Status

- **버전**: Phase 40.5 Visual Fidelity Breakthrough & Editable DOCX Quality Improvement
- **저장소**: `wldghs5s-max/Figma2Word`
- **브랜치**: `master`
- **기준 Git HEAD**: `2030b8f2f453c9524e05faeeb65f4764b811de80`
- **독립 감사자 / 엔지니어링 작업자 대상**: AI Engineering Collaborators (ChatGPT, Codex, Gemini)

---

## 1. 프로젝트의 본질과 궁극적 목표

본 프로젝트의 궁극적인 목적은 **Figma 디자인을 높은 시각적 충실도를 유지하면서 Microsoft Word에서 실제로 편집 가능한 고품질 DOCX 문서로 변환하는 범용 엔지니어링 엔진**을 구현하는 것입니다.

장기적으로 동일한 정규화된 중간 표현(Canvas IR)을 활용하여 HWPX(한글 문서) 생성까지 유연하게 확장할 수 있는 아키텍처를 지향합니다.

다음 기본 원칙을 엄격하게 준수합니다:
1. **실제 변환 품질 최우선**: 시각 충실도와 Word 실사용 편집성을 동시에 보호합니다.
2. **시각 점수 조작 행위 엄금**: 텍스트나 도형을 통짜 이미지로 대체하는 등 편집성을 훼손하는 우회는 일절 배제합니다.
3. **Fail-Closed 품질 게이트**: 불완전한 검사나 잘못된 입력으로 인한 허위 성공(False Positive)을 원천 차단합니다.
4. **정직한 출처(Provenance) 분류**: 추정 형상을 원본 복원으로 과장하지 않고, 출처를 투명하게 구분하여 보고합니다.

---

## 2. 시스템 아키텍처 및 Canvas IR 구조

```text
[Figma JSON Document]
        │
        ▼
1. Source Parser (`src/canvas/parser/figmaCanvasParser.ts`)
   - 17개 타깃 프레임 탐색, 기하학적 정규화, 오토레이아웃 계산
   - 텍스트/스타일 추출, 도형/선 추출, 이미지 노드 추출
   - 다중 자식 VECTOR 분해 합성 (`totalVectorSiblings > 1`: search 렌즈-손잡이 분해, 원, 막대 등)
   - UI 아이콘 의미적 패스 매핑 (단어 경계 기반: profile, update, rotate-cw, rotate-ccw 등)
   - circle-check 라디오버튼/체크박스 정밀 합성: 단일 벡터(미선택 원형) 및 복합 벡터(선택 원+체크) 완벽 구분
   - search 아이콘 stroke 전용 단일 원형 렌즈+대각선 손잡이 패스 합성
   - Fill & Stroke 동시 존재 노드 분리 (`strokeVectorPath`, `fillRule: evenodd`)
   - 형상 출처(Provenance) 명시적 태깅 (`geometryProvenance`, 기본도형 `PRIMITIVE_SHAPE`)
        │
        ▼
2. Intermediate Representation (Canvas IR: `src/canvas/types.ts`)
   - CanvasDocument / CanvasPage / CanvasElement
   - 해상도 독립적 절대 좌표계 (pt 단위)
   - `geometryProvenance`: SOURCE_GEOMETRY | LOCALLY_RECOVERED_GEOMETRY |
                           SEMANTIC_APPROXIMATION | GEOMETRIC_FALLBACK |
                           PRIMITIVE_SHAPE | UNRESOLVED
        │
        ▼
3. Document Renderers
   ├─► DOCX Renderer (`src/canvas/renderer/docxCanvasRenderer.ts`)
   │   - OpenXML / VML (`<v:shape>`, `<v:textbox>`, `<v:rect>`, `<v:roundrect>`, `<v:line>`)
   │   - `<v:path fillrule="evenodd"/>` 태그 및 면/선 분리 VML 렌더링
   │   - 제로 너비/높이 수평·수직선 벡터의 최소 선 두께(0.75pt) 보장 클램핑
   │   - `alt="${elem.sourceNodeId}"` 및 `o:title` 원본 식별자 영속 바인딩
   │   - 단일 라인 텍스트박스 인라인 줄바꿈 방지 (`mso-wrap-style:none`)
   │   - 미디어 관계(`word/_rels/document.xml.rels`) 및 바이너리 매핑
   └─► HWPX Renderer (Canvas IR 기반 HWPX 확장 준비 완료)
        │
        ▼
4. Verification & Fidelity Engine (`src/fidelity/`)
   - `verificationVerdict.ts`: 9대 필수 게이트 단일 승인 계약 및 OS 프로세스 종료 코드(0/1) 보장
   - `integrityGate.ts`: 절대 벤치마크 모드(`ABSOLUTE_FIGMA_TO_WORD`) 및 입력 디스크 바이너리 SHA-256 검증
   - `objectTraceability.ts`: 정밀 상태 체계(`DetailedContentState`), 텍스트·도형·이미지 100% 보존 Fail-Closed 게이트
   - `layoutStabilityAuditor.ts`: Before/After Union Bounding Box 기반 마스크 레이아웃 안정성 감사
   - `editabilityAuditor.ts`: Word 네이티브 편집성 점수 감사
```

---

## 3. Phase 40.5 주요 개선 사항 및 실측 성과

### 3.1 최저 충실도 페이지 (Page 13) 돌파 및 아이콘 기하학적 복원
1. **P13-01: `circle-check` 라디오 버튼 단일 벡터 원형 복원**:
   - Page 13 등에서 미선택 상태 라디오 버튼 12개 이상이 자식 벡터가 1개라는 이유로 `if (totalSiblings > 1)`을 벗어나 일반 체크 규칙에 걸려 체크마크로 왜곡되던 심각한 버그 규명.
   - 단일 벡터(`totalSiblings <= 1`) 또는 원형 크기(`wPt > 6 && hPt > 6`)일 때 정밀 원형 외곽선(`M 500 100 C 720 100 900 280 ...`, `LOCALLY_RECOVERED_GEOMETRY`)을 합성하도록 교정.
   - **실측 결과**: 라디오 버튼 국소 ROI SSIM **0.9882** 달성, Page 13 SSIM **0.8679 -> 0.8840 (+0.0161, +1.61%p 상승)**, MAE **6.28 -> 5.62 (-0.66 개선, -10.5%)**, RMSE **29.77 -> 27.82 (-1.95 개선)**.
2. **D-01: 선 기반 검색(`search`) 아이콘 이중선 왜곡 교정**:
   - `hasFill === false`인 선 기반 검색 아이콘에서 이중 윤곽선 대신 단일 원형 렌즈와 대각선 손잡이 스트로크로 정밀 분해 합성.
3. **E-01: VML 제로 너비/높이 벡터 shape 소실 방지**:
   - 너비나 높이가 0인 수평·수직선 벡터가 Word에서 소실되지 않도록 style에서 최소 선 두께(`Math.max(0.75, strokeWidth)`)를 보장.
4. **회귀 전무 (Zero Regression)**:
   - 16개 프레임 전수 평가 결과 단 1개의 프레임도 SSIM이 하락하지 않고 전원 유지 또는 개선.
   - 전체 평균 SSIM: **0.9492 -> 0.9502 (+0.0010 상승)**.

### 3.2 최신 핵심 벤치마크 지표 요약

| 지표 항목 | Phase 40.4 Baseline | Phase 40.5 Current | 판정 기준 | 최종 상태 |
|---|:---:|:---:|:---:|:---:|
| **평균 SSIM (16개 프레임)** | 0.9492 | **0.9502** | >= 0.9400 | **PASSED** |
| **평균 MAE / RMSE** | 2.51 / 14.88 | **2.49 / 14.65** | 최적화 개선 | **PASSED** |
| **Page 13 SSIM / MAE** | 0.8679 / 6.28 | **0.8840 / 5.62** | 최저점 집중 개선 | **BREAKTHROUGH** |
| **Normal Edit Persistence** | 25 / 25 (100%) | **25 / 25 (100%)** | 100% 지속 (한글 완전 일치) | **PASSED** |
| **Stress Edit Persistence** | 25 / 25 (100%) | **25 / 25 (100%)** | 100% 지속 (3단락 한글 완전 일치) | **PASSED** |
| **Normal Layout Stability** | 0 Regressions | **0 Regressions (0.0000%)** | 0 회귀 | **VERIFIED** |
| **Stress Layout Stability** | 0 Regressions | **0 Regressions (0.0000%)** | 0 회귀 | **VERIFIED** |
| **Source-to-Word Traceability** | 2,033 / 2,033 | **2,033 / 2,033 (100%)** | 누락 0건 | **VERIFIED** |
| **Unresolved Objects in DOCX** | 0 건 | **0 건** | 0건 | **VERIFIED** |
| **전체 회귀 단위 테스트** | 703 passed | **707 passed (100%)** | 전원 통과 필수 | **PASSED** |
| **9대 필수 게이트 통과율** | 9 / 9 (100%) | **9 / 9 (100%)** | 전원 통과 필수 | **APPROVED (Exit 0)** |

---

## 4. 알려진 한계 및 다음 Phase 권고사항

1. **OS 시스템 폰트 Fallback에 따른 한계**:
   - Figma 원본은 `Pretendard` 서체를 사용하나, 대상 시스템에 미설치 시 Word는 `맑은 고딕`으로 fallback합니다.
   - 글리프 너비 차이로 인한 텍스트 엣지 미세 오차는 시스템 폰트 설치 여부에 종속적입니다.
2. **모달 프레임 코너 라운딩**:
   - 모달 다이얼로그의 `cornerRadius: 24`는 Word DOCX 페이지 레벨에서는 직사각형 캔버스로 출력되므로 네 귀퉁이 배경 차이가 발생합니다.
3. **다음 개발 권고**:
   - Page 11, 10, 15 등의 다단 폼 입력 컴포넌트 내부 여백 및 텍스트박스 인셋(inset) 최적화
   - HWPX 렌더러 구현 본격 확장 (동일 Canvas IR 활용)
