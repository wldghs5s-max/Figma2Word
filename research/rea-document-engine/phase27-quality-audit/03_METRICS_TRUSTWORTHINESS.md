# Phase 27 — 03. 검증 지표 하드코딩 제거 및 실측 기반 동적 엔진 보고서 (Metrics Trustworthiness)

**문서 작성 일시**: 2026-10-20  
**작업자**: Antigravity (Google DeepMind Advanced Agentic Coding)  
**수정 파일**: `tools/visual-regression/compute_full_metrics.ts`  
**보증 테스트**: `tests/metrics-trustworthiness.test.ts` (8개 합성 케이스 전수 통과)

---

## 1. 결함 발견 및 지적 사항 (Audit Findings)

### 1.1 Phase 26 레거시 하드코딩
`tools/visual-regression/compute_full_metrics.ts`의 `globalSummary`에서 다음과 같은 핵심 지표가 실제 측정 없이 상수로 하드코딩되어 있었다:
```ts
// Phase 26 Legacy (수정 전 결함 코드)
globalSummary: {
  totalCandidateFrames: 17,
  totalRenderedDocxSections: 17, // 하드코딩
  totalRenderedDocxPages: 17,    // 하드코딩
  frameCoveragePercent: 100.0,   // 하드코딩
  collisionsCount: 0,            // 하드코딩
  wordCompatibility: '100% Valid (Sections: 17, 0 Warnings)', // 하드코딩
}
```
이로 인해 다른 디자인이나 오류가 발생한 DOCX를 검사하더라도 무조건 17섹션, 충돌 0건, 100% Valid로 왜곡될 수 있는 중대한 신뢰성 문제가 존재했다.

---

## 2. 동적 실측 아키텍처 개편

Phase 27에서는 모든 지표를 실제 산출물 바이너리와 실행 로그로부터 동적으로 역산하도록 전면 재작성했다:

1. **실제 DOCX 섹션 수 동적 역산 (`totalRenderedDocxSections`)**:
   - 실제 생성된 DOCX 바이너리(`word/document.xml`)를 `JSZip`으로 압축 해제한 뒤, 실제 `<w:sectPr>` 태그 출현 빈도를 정규식으로 직접 카운트함.
2. **실제 Word 렌더링 페이지 수 동적 수집 (`totalRenderedDocxPages`)**:
   - `pipeline-manifest.json` 또는 PDF의 실제 물리적 페이지 수를 동적으로 읽음. 실행 전이거나 결과 부재 시 `"not_measured"`로 명확히 표기.
3. **도면 원점 충돌 동적 검출 (`detectedCollisionsCount`)**:
   - 캔버스 페이지 수 대비 실제 생성된 섹션 수의 차이를 수학적으로 비교하여, 섹션 격리가 누락되어 발생한 충돌 건수를 정밀 계산 (`totalCanvasPages - actualDocxSections`).
4. **프레임 커버리지 동적 계산 (`frameCoveragePercent`)**:
   - 후보 프레임 수 대비 캔버스에 등록된 페이지 수의 비율을 $(N_{\text{pages}} / N_{\text{frames}}) \times 100$ 으로 실시간 계산.
5. **호환성 상태의 조건부 분기 (`wordCompatibility`)**:
   - 파이프라인 미실행 시 `"not_measured"`, 실패 시 실제 에러 메시지(`"Failed: ..."`), 성공 시 실제 섹션/페이지 수를 포함한 문자열 동적 생성.

---

## 3. 8대 합성 입력 케이스 검증 실측표 (`tests/metrics-trustworthiness.test.ts`)

| 케이스 번호 | 입력 시나리오 | 기대 검증 지표 | 실제 동적 측정 결과 | 판정 |
| :---: | :--- | :--- | :--- | :---: |
| **Case 1** | 단일 프레임 (1 Frame) | Candidate: 1, Sections: 1, Coverage: 100% | Candidate: 1, Sections: 1, Coverage: 100% | **PASS** |
| **Case 2** | 다중 프레임 (3 Frames) | Candidate: 3, Sections: 3, Coverage: 100% | Candidate: 3, Sections: 3, Coverage: 100% | **PASS** |
| **Case 3** | 실전 디자인 (17 Frames) | Candidate: 17, Sections: 17, Elements: >1000 | Candidate: 17, Sections: 17, Elements: 1321 | **PASS** |
| **Case 4** | 동일 크기 인접 프레임 2개 | Collisions: 0, Sections: 2 | Collisions: 0, Sections: 2 | **PASS** |
| **Case 5** | 22인치 초과 대형 프레임 (3000px) | oversizedPagesCount: 1, Defect: OVERSIZED | oversizedPagesCount: 1, Defect: OVERSIZED | **PASS** |
| **Case 6** | 빈 프레임 (0 Children) | Elements: 0, Textboxes: 0, SingleLine: 0 | Elements: 0, Textboxes: 0, SingleLine: 0 | **PASS** |
| **Case 7** | 파이프라인 미실행 입력 | RenderedPages: "not_measured" | RenderedPages: "not_measured" | **PASS** |
| **Case 8** | Word 자동화 실패 로그 입력 | wordCompatibility: "Failed: Word crashed..." | wordCompatibility: "Failed: Word crashed..." | **PASS** |

모든 지표가 입력과 실행 상태에 따라 100% 동적으로 변화함을 확인하였으며, 하드코딩 결함이 완전히 해결되었다.
