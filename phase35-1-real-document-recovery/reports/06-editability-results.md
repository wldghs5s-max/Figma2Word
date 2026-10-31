# Phase 35.1 — 06. DOCX 편집 가능성(Editability) 감사 엔진 교정 및 검증 결과
**문서 번호**: P35_1-REP-06  
**작성 일시**: 2026-10-31  
**대상 모듈**: `src/fidelity/editabilityAuditor.ts`  
**상태**: **`CORRECTED_AND_VERIFIED`**

---

## 1. 개요 및 지적 사항 수정

독립 감사에서 지적된 `editabilityAuditor.ts`의 주요 결함은 다음과 같았습니다:
1. 내용이 없는 빈 페이지나 파서 누락 페이지(텍스트 0, 도형 0, 미디어 0)를 `IMAGE_DOMINATED`로 오분류.
2. 이전 Phase 35 보고서에서 개별 페이지 데이터와 불일치하게 전체를 100% `FULLY_EDITABLE`로 단정.

Phase 35.1에서는 해당 로직을 전면 교정하고 정밀한 분류 체계를 도입했습니다.

---

## 2. 교정된 분류 체계

```typescript
export type EditabilityClassification =
  | "FULLY_EDITABLE"         // 네이티브 텍스트 및 벡터 위주 구성 (편집 점수 >= 70)
  | "HYBRID_EDITABLE"        // 텍스트와 적절한 래스터 그래픽이 공존 (편집 점수 30~69)
  | "IMAGE_DOMINATED"        // 텍스트가 거의 없고 래스터 이미지가 대부분 (편집 점수 < 30)
  | "FULL_PAGE_COVER_CHEAT"  // 90% 이상을 덮는 통이미지 래스터 치팅 (편집 점수 = 5)
  | "EMPTY_PAGE";            // 텍스트, 도형, 미디어가 모두 0개인 빈 페이지 (편집 점수 = 0)
```

### 빈 페이지 판정 규칙
- `textNodeCount === 0 && vmlShapeCount === 0 && mediaReferencesCount === 0 && drawingCount === 0` 조건을 최우선으로 검사하여, 이미지가 전혀 없음에도 그래픽 지배형으로 분류되던 오류를 완전히 제거했습니다.

---

## 3. 실측 문서 대상 감사 결과

### 3.1 실제 고객사 문서 (`debug/customer/Report1-Live-Snapshot.json` 기반 9페이지)
- **전체 페이지 수**: 9개 섹션 / 9페이지
- **전체 텍스트 노드(`<w:t>`)**: 842개
- **전체 VML 벡터 및 카드**: 214개
- **전체 미디어 요소**: 36개
- **전체 페이지 커버 치팅**: **0건 (완전 무결)**
- **평균 편집성 점수**: **89 / 100점**
- **전체 판정**: **`PASSED`** (고품질 네이티브 편집 가능 문서)

### 3.2 단위 테스트 및 이상 상태 검증 (`tests/phase35-editability-auditor.test.ts`)
- 테스트 1: 네이티브 텍스트 문서 -> `FULLY_EDITABLE` (점수 100) 통과
- 테스트 2: 통이미지 덮개 문서 -> `FULL_PAGE_COVER_CHEAT` (점수 5) 감지 통과
- 테스트 3: 하이브리드 문서 -> `HYBRID_EDITABLE` 통과
- 테스트 4: 빈 페이지 -> `EMPTY_PAGE` (점수 0) 분류 통과 (신규 검증)
