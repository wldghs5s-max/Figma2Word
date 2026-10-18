# Phase 23: Cross-Format Fidelity Verification Harness

## 1. 하네스 개요
- 파일: `scripts/run_cross_format_harness.ts`
- 목적: 단일 Canonical JSON (`CanvasDocument`)을 입력으로 받아 DOCX와 HWPX를 병렬 생성하고, 두 출력물 간의 구조적·내용적 정합성을 독립적으로 검증함.

---

## 2. 검증 프로세스 및 검사항목

1. **ZIP 패키지 무결성 검증**:
   - DOCX: `[Content_Types].xml`, `_rels/.rels`, `word/document.xml` 유효성 검사.
   - HWPX: `mimetype` (STORED 19B), `Contents/section0.xml`, `Contents/header.xml`, `Contents/content.hpf` 유효성 검사.
2. **개체 수 및 텍스트 런 보존율 검증**:
   - Canonical IR 상의 총 개체 수와 텍스트 런 수가 양쪽 출력물에서 누락 없이 반영되었는지 검사.
3. **샘플 텍스트 인코딩 및 일치율 검사**:
   - 국문/영문/숫자 혼합 텍스트의 손상 여부 확인.

---

## 3. 실측 실행 결과 (`debug/cross-format-phase23/CROSS_FORMAT_COMPARISON_REPORT.json`)

```json
[
  {
    "suiteName": "Stage 6 (Proposal Report)",
    "sourceNodesCount": 1,
    "canvasElementsCount": 8,
    "hwpxPackageValid": true,
    "docxPackageValid": true,
    "textRunsCount": 5,
    "textsSample": [
      "전략 기획 / AI 혁신 과제",
      "2026 차세대 엔터프라이즈 AI 자동화 구축 제안서",
      "본 제안서는 사내 디자인 및 기획 자산의 신속한 문서화",
      "1. 핵심 기대 효과 및 도입 타당성",
      "※ 본 문서는 Figma2Word 엔진에 의해 자동 생"
    ],
    "hwpxSize": 6635,
    "docxSize": 5396,
    "conformanceStatus": "PASSED"
  },
  {
    "suiteName": "Stage 7 (Customer 9-Page Full Report)",
    "sourceNodesCount": 9,
    "canvasElementsCount": 780,
    "hwpxPackageValid": true,
    "docxPackageValid": true,
    "textRunsCount": 434,
    "textsSample": [
      "드론 AI 외벽 진단",
      "1차 진단",
      "2026 정밀 진단 종합보고",
      "해운대동신아파트",
      "외벽 균열 진단 종합보고서 · 9개 동 · 기준 202"
    ],
    "hwpxSize": 14215855,
    "docxSize": 14200148,
    "conformanceStatus": "PASSED"
  }
]
```

양대 핵심 실측 보고서(Stage 6 및 Stage 7) 모두 **`PASSED`**를 기록하여 크로스포맷 정합성을 입증함.
