# Figma2Word — 문서 변환 품질 감사 인프라 사용자 가이드 (Quality Audit Guide)

## 1. 개요

본 가이드는 Figma 디자인을 DOCX로 변환한 결과물의 시각적 충실도와 OpenXML 구조적 무결성을 정량적·객관적으로 검증하기 위해 구축된 **품질 감사 인프라(`tools/quality-audit`)**의 사용 방법 및 지표 해석 기준을 설명합니다.

본 도구는 외부 AI API나 클라우드 서비스에 일체 의존하지 않고, **로컬 환경(Windows PowerShell + Word COM + WinRT PDF + JSZip)**에서 결정론적으로 실행됩니다.

---

## 2. 지원하는 감사 모드 및 입력 사양

품질 감사 엔진은 제공된 입력 데이터의 조합에 따라 4가지 실행 모드를 자동으로 전환하여 동작합니다.

| 모드 | 필수 입력 | 비교 내용 | 적용 시점 |
| :--- | :--- | :--- | :--- |
| **Full Audit** | • Figma 원본 PNG<br>• 생성 DOCX<br>• 기준 DOCX | • Figma vs DOCX 시각 차이<br>• 생성 DOCX vs 기준 DOCX 구조 차이 | Figma 원본과 사람이 작성한 정답 DOCX가 모두 구비된 최종 검증 |
| **Figma vs Generated** | • Figma 원본 PNG<br>• 생성 DOCX | • Figma 원본 vs DOCX 렌더링 시각 비교<br>• 생성 DOCX 단독 구조 분석 | 실제 디자인 원본 대비 시각적 재현율 평가 |
| **Reference vs Generated** | • 생성 DOCX<br>• 기준 DOCX | • 두 DOCX 간 시각 차이<br>• OpenXML 표/이미지/문단 구조 대조 | 사람이 수작업한 Word 문서 대비 네이티브 구조 완성도 평가 |
| **Structure Only** | • 생성 DOCX | • 단독 DOCX의 표, 문단, 이미지, 섹션 추출 | Word COM이 없거나 시각 비교 이미지가 없는 경량 환경 |

---

## 3. 실행 방법

### A. 프로그래밍 방식 실행 (TypeScript / Node.js)

```typescript
import { QualityAuditRunner } from './tools/quality-audit/index.js';

const runner = new QualityAuditRunner();

const result = await runner.runAudit(
  {
    id: 'customer-proposal-audit',
    title: '고객 제안서 A4 변환 품질 감사',
    generatedDocx: 'output/proposal.docx',
    referenceDocx: 'samples/proposal-reference.docx', // 선택 사항
    figmaImages: [
      'snapshots/page-1.png',
      'snapshots/page-2.png'
    ], // 선택 사항
    options: {
      targetWidth: 1400,          // 렌더링 해상도 (기본 1400px)
      toleranceThreshold: 10,     // 픽셀 오차 허용치 (0~255, 기본 10)
      timeoutSec: 60,             // Word COM 타임아웃
    },
  },
  'debug/quality-audit/reports'   // 리포트 출력 경로
);

console.log(`감사 결과: ${result.summary.status}`);
console.log(`HTML 리포트: ${result.reportHtmlPath}`);
```

### B. 단독 실행 스크립트 활용
- **DOCX → PDF 및 페이지별 PNG 렌더링**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File tools/quality-audit/scripts/render_docx_to_png.ps1 `
    -DocxPath "output/document.docx" `
    -OutputDir "debug/rendered" `
    -Prefix "doc" `
    -Width 1400
  ```
- **두 이미지 간 픽셀 비교 및 Diff/Overlay 맵 생성**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File tools/quality-audit/scripts/compare_images.ps1 `
    -Image1 "snapshots/figma-p1.png" `
    -Image2 "debug/rendered/doc-Page01.png" `
    -OutDiffPng "debug/diff-p1.png" `
    -OutOverlayPng "debug/overlay-p1.png" `
    -Tolerance 10
  ```

---

## 4. 측정 지표 및 해석 가이드

### A. 시각적 비교 지표 (Visual Metrics)
1. **픽셀 불일치율 (Mismatch Ratio)**:
   - 두 이미지의 공통 캔버스에서 RGB 평균 차이가 임계값(Tolerance)을 초과한 픽셀의 비율.
   - `0.0% ~ 3.0%`: **최상 (Excellent)** — 폰트 렌더러 안티앨리어싱, 글꼴 힌팅 차이 수준.
   - `3.0% ~ 15.0%`: **양호 (Good)** — 미세한 여백, 줄바꿈 위치 이동 감지.
   - `15.0% ~ 35.0%`: **주의 (Warning)** — 폰트 크기 불일치, 컬럼 폭 차이 감지.
   - `35.0% 초과`: **경고 (Alert)** — 블록 누락 또는 심각한 레이아웃 왜곡.
2. **MAE (Mean Absolute Error)**: 픽셀별 평균 오차 크기 (0~255).
3. **RMSE (Root Mean Square Error)**: 큰 왜곡에 가중치를 둔 픽셀 제곱평균오차.

> [!WARNING]
> **시각 지표 해석상 한계**:
> 단순 픽셀 차이는 Windows 시스템 폰트, Word 렌더링 엔진, 안티앨리어싱 방식에 민감하므로 문서 품질의 **절대 점수**로 취급해서는 안 됩니다. 반드시 Overlay/Diff 맵과 함께 검토해야 합니다.

### B. OpenXML 구조 비교 지표 (Structural Metrics)
1. **네이티브 표 보존 여부**: 표가 이미지로 대체되지 않고 편집 가능한 `w:tbl`로 보존되었는지 검사.
2. **표 행/열 구조 일치율**: 기준 문서 대비 행 수(`w:tr`) 및 열 수(`w:tc`)의 일치 여부.
3. **용지 규격 및 방향**: A4 세로(Portrait) / 가로(Landscape) 및 여백 준수 여부.
4. **텍스트 유사도 (Jaccard Index)**: 문서 내 단어 토큰의 교집합 비율 (본문 누락 방지).

---

## 5. 산출물 및 HTML 리포트

감사 실행 시 지정된 출력 디렉터리에 다음 산출물이 생성됩니다:
1. `quality-audit-<id>.html`: **완전 독립 실행형 오프라인 HTML 보고서** (외부 CDN 0 의존, 이미지 base64 임베딩).
2. `quality-audit-<id>.json`: 파이프라인 자동화 및 CI 연동용 구조화된 JSON 결과.
3. `visual_diffs/`: 페이지별 Difference 및 Overlay PNG 이미지.
4. `rendered_generated/`: Figma2Word 생성 DOCX의 페이지별 고화질 렌더링 PNG.

---

## 6. 실제 업무용 샘플 입수 시 실행 절차

향후 실제 디자인 및 정답 DOCX가 확보되면 다음 절차에 따라 안전하게 검증을 수행합니다:

1. **디렉토리 배치**:
   - Figma 원본 스크린샷: `debug/customer/figma_pages/Page01.png`, `Page02.png`...
   - 사람이 작성한 기준 DOCX: `debug/customer/reference.docx`
2. **신규 DOCX 생성**:
   - `npm run convert` 또는 Web UI를 통해 대상 JSON 스냅샷 변환 → `debug/customer/generated.docx`
3. **품질 감사 실행**:
   ```typescript
   await runner.runAudit({
     id: 'real-customer-doc-audit',
     title: '실무 제안서 품질 정밀 감사',
     generatedDocx: 'debug/customer/generated.docx',
     referenceDocx: 'debug/customer/reference.docx',
     figmaImages: ['debug/customer/figma_pages/Page01.png', ...],
   }, 'debug/customer/audit_result');
   ```
4. **결과 확인**: 생성된 `audit_result/quality-audit-real-customer-doc-audit.html`을 브라우저에서 열어 페이지별 Diff 및 표 구조 대조 확인.
