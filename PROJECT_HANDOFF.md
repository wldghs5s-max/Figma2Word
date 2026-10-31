# Project Handoff Document
## Figma2Word Engineering Architecture & Production Capability Status

- **버전**: Phase 40.3 Production Fidelity & Real-World Word Editing Hardening
- **저장소**: `wldghs5s-max/Figma2Word`
- **브랜치**: `master`
- **수정 전 Git HEAD**: `139c9990ac19fb66a80d16833f81732c8ebb4b91`
- **독립 감사자 / 엔지니어링 작업자 대상**: AI Engineering Collaborators (ChatGPT, Codex, Gemini)

---

## 1. 프로젝트의 본질과 궁극적 목표

본 프로젝트의 궁극적인 목적은 **Figma 디자인을 높은 시각적 충실도를 유지하면서 Microsoft Word에서 실제로 편집 가능한 DOCX 문서로 변환하는 범용 엔지니어링 엔진**을 구현하는 것입니다.

장기적으로 동일한 정규화된 중간 표현(Canvas IR)을 활용하여 HWPX(한글 문서) 생성까지 유연하게 확장할 수 있는 아키텍처를 지향합니다.

다음 기본 원칙을 엄격하게 준수합니다:
1. **실제 변환 품질 최우선**: 시각 충실도와 Word 실사용 편집성을 동시에 보호합니다.
2. **Fail-Closed 품질 게이트**: 불완전한 검사나 잘못된 입력으로 인한 허위 성공(False Positive)을 원천 차단합니다.
3. **정직한 출처(Provenance) 분류**: 추정 형상을 원본 복원으로 과장하지 않고, 출처를 투명하게 구분하여 보고합니다.

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
   │   - OpenXML / VML (`<v:shape>`, `<v:textbox>`, `<v:rect>`, `<v:line>`)
   │   - `<v:path fillrule="evenodd"/>` 태그 및 면/선 분리 VML 렌더링
   │   - `alt="${elem.sourceNodeId}"` 및 `o:title` 원본 식별자 영속 바인딩
   │   - 단일 라인 텍스트박스 인라인 줄바꿈 방지 (`mso-wrap-style:none`)
   │   - 미디어 관계(`word/_rels/document.xml.rels`) 및 바이너리 매핑
   └─► HWPX Renderer (Canvas IR 기반 HWPX 확장 준비 완료)
        │
        ▼
4. Verification & Fidelity Engine (`src/fidelity/`)
   - `verificationVerdict.ts`: 9대 필수 게이트 단일 승인 계약 및 OS 프로세스 종료 코드(0/1) 보장
   - `integrityGate.ts`: 절대 벤치마크 모드(`ABSOLUTE_FIGMA_TO_WORD`) 및 입력 디스크 바이너리 SHA-256 검증
   - `objectTraceability.ts`: 1:1 소스-Word 객체 매핑, 텍스트 누락 차단, 빈 shape 허위 성공 배제
   - `layoutStabilityAuditor.ts`: 마스크 기반 비편집 영역 무훼손(Zero Collateral Damage) 및 동적 Page/Section 보존 검증
   - `editabilityAuditor.ts`: Word 네이티브 편집성 점수 감사
```

---

## 3. Phase 40.3 주요 개선 사항 및 실측 성과

### 3.1 7대 독립 감사 결함(F-01 ~ F-07) 전수 해결
1. **F-01 (Fill & Stroke 동시 존재 및 Winding Rule 보존)**: 면 채우기와 윤곽선이 동시에 있는 노드에서 `strokeVectorPath`를 별도 추출하여 채우기 VML shape과 선 VML shape을 순차 방출, `<v:path fillrule="evenodd"/>` 지원.
2. **F-02 (복합 아이콘 분해 및 CW/CCW 회전 방향 구분)**: 다중 자식 벡터로 구성된 `search` 아이콘을 렌즈(원)와 손잡이(막대)로 분해 렌더링, 시계방향(`rotate-cw`)과 반시계방향(`rotate-ccw`) 아이콘 명확히 분리.
3. **F-03 (Word Stress Edit 실제 실행 및 격리 분리)**: 실제 Word COM을 통해 실제 개행(`\r\n`), 긴 한글 문단, 폭 30% 확장을 적용하는 고강도 스트레스 편집을 `debug/phase39-editability-stress/`에서 독립 실행하고 25/25 영속성 실측.
4. **F-04 (대형 전경 객체 카운터 왜곡 교정)**: 실제 z-order와 Word COM 편집 성공 여부를 확인하여 `$largeForegroundTested`를 엄격하게 카운트.
5. **F-05 (Fail-Closed 콘텐츠 보존 강화)**: 텍스트 1건이라도 누락 시 `VERIFIED` 불가, 기하 속성이 전혀 없는 빈 셰이프 태그의 허위 성공 판정 원천 차단.
6. **F-06 (Visual Fidelity Gate 실질 품질 연결)**: 단순 비교 수량(`validCount >= 16`)뿐 아니라 `meanSsim >= 0.9400`을 게이트 통과 필수로 강제.
7. **F-07 (보고서 및 해시 정합성, 89개 Primitive 객체 정직한 분류)**: Candidate DOCX와 Word Saved DOCX의 해시 역할 분리 명시, 사각형/선/타원 89개에 `PRIMITIVE_SHAPE` 부여하여 미해결 오인 완전 해소.

### 3.2 최신 핵심 벤치마크 지표 요약

| 지표 항목 | 실측값 | 판정 기준 | 최종 상태 |
|---|---:|---|---|
| **평균 SSIM (16개 프레임)** | **0.9492** | >= 0.9400 | **PASSED** |
| **평균 MAE / RMSE** | **2.53 / 14.78** | 최적화 개선 | **PASSED** |
| **Normal Edit Persistence** | **25 / 25 (100%)** | 100% 지속 | **PASSED** |
| **Stress Edit Persistence** | **25 / 25 (100%)** | 100% 지속 | **PASSED** |
| **Normal Layout Stability** | **0 Regressions (0.0030% Mismatch)** | 0 회귀 | **VERIFIED** |
| **Stress Layout Stability** | **4 Pages Reflow Detected** | 정직한 실측 기록 | **DOCUMENTED** |
| **Source-to-Word Traceability** | **Text 628/628, Shape 327/327, Image 19/19** | 누락 0건 | **VERIFIED** |
| **Unresolved Objects in DOCX** | **0 건** | 0건 | **VERIFIED** |
| **9대 필수 게이트 통과율** | **9 / 9 (100%)** | 전원 통과 필수 | **PASSED (Exit 0)** |

---

## 4. 재현 및 검증 실행 방법

### 4.1 단위 테스트
```bash
npx vitest run tests/phase40-3-fidelity.test.ts
npx vitest run tests/phase38-object-traceability.test.ts
```

### 4.2 타입 검사 및 웹 빌드
```bash
npx tsc --noEmit
npx tsc -p tsconfig.scripts.json --noEmit
npm --prefix apps/web run build
```

### 4.3 전체 프로덕션 파이프라인 (Word COM 자동화 포함)
```bash
npx tsx scripts/run_phase39_production_pipeline.ts
```

---

## 5. 향후 작업 로드맵 (HWPX 지원 확장 등)

- **Canvas IR 기반 HWPX 렌더러 구현**: 현재 정규화된 Canvas IR을 활용하여 HWPX의 `<hp:shape>`, `<hp:textart>`, 테이블 구조로의 직접 변환기 확장.
- **다중 열 오토레이아웃 고도화**: 복잡한 반응형 디자인 요소의 네이티브 Word 표/컬럼 변환 고도화.
