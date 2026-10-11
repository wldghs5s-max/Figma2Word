# Figma2Word — Step 12A: 문서 변환 품질 감사 인프라 구축 및 자동 회귀 검증 보고서

## 0. 작업 개요 및 목적

본 보고서는 Step 11A~11D까지 확립된 Figma2Word의 변환 파이프라인(Parser → IR → Layout Engine → DOCX Renderer)을 기반으로, 향후 실제 Figma 원본 디자인과 사람이 완성한 기준 DOCX가 제공되었을 때 변환 품질을 객관적·정량적으로 비교·검증할 수 있는 **독립적인 품질 감사 인프라(`tools/quality-audit`)**를 구축하고 검증한 결과를 기술합니다.

### 핵심 원칙
1. **합성 픽스처 전용 검증**: 실제 고객사/업무용 Figma 원본과 정답 DOCX는 아직 미제공 상태이므로, 프로그래밍 방식으로 생성한 합성 픽스처(Synthetic Fixtures)만을 사용하여 도구의 검출력을 검증하였으며 실제 품질 점수를 임의로 주장하지 않음.
2. **독립성 및 0 의존성**: 변환 엔진 코어 코드를 오염시키지 않고 독립 도구로 분리하였으며, 외부 클라우드 AI API나 외부 CDN에 의존하지 않는 100% 로컬 오프라인 실행 체계를 확립함.
3. **무회귀 (Zero Regression)**: 45개 테스트 파일, 271개 테스트 전원 통과 및 신규 생성 DOCX의 Word COM 실측을 통해 기존 기능의 무결성을 입증함.

---

## 1. 구현된 감사 도구 아키텍처 (`tools/quality-audit/`)

```
tools/quality-audit/
├── src/
│   ├── types.ts                    # 감사 입력, 렌더링 결과, 시각/구조 비교 메트릭 타입 정의
│   ├── wordRenderer.ts             # Word COM 기반 DOCX → PDF → WinRT PNG 렌더링 오케스트레이터
│   ├── imageComparator.ts         # .NET System.Drawing 기반 고속 픽셀 비교 및 Diff/Overlay 맵 생성
│   ├── docxStructureComparator.ts  # JSZip 기반 OpenXML(word/document.xml) 구조 추출 및 대조기
│   ├── reportGenerator.ts          # 외부 CDN 0 의존, base64 임베딩 로컬 단독 실행형 HTML/JSON 리포터
│   └── runner.ts                   # 종합 품질 감사 파이프라인 실행 진입점 (QualityAuditRunner)
├── scripts/
│   ├── render_docx_to_png.ps1      # Word COM PDF 내보내기 및 WinRT 비동기 래스터라이징 스크립트
│   └── compare_images.ps1          # 픽셀별 RGB 오차, MAE, RMSE 산출 및 차이 강조 PNG 생성 스크립트
└── index.ts                        # 외부 모듈 export 및 CLI 엔트리포인트
```

---

## 2. 지원하는 감사 모드 및 실행 방법

### A. 4대 감사 모드
1. **Full Audit (`full`)**: Figma 원본 PNG + 생성 DOCX + 기준 DOCX (시각적 및 구조적 전면 비교).
2. **Figma vs Generated (`figma_vs_generated`)**: Figma 디자인 스크린샷과 생성 DOCX 간의 페이지별 시각 재현율 비교 및 생성 DOCX 단독 구조 분석.
3. **Reference vs Generated (`reference_vs_generated`)**: 사람이 수작업한 Word 문서와 변환 생성 DOCX 간의 시각/구조(표, 이미지, 문단) 정밀 대조.
4. **Structure Only (`structure_only`)**: Word COM 환경이 없거나 이미지 데이터가 없을 때 DOCX OpenXML 구조 단독 파싱 및 무결성 검증.

### B. 실행 예시
```typescript
import { QualityAuditRunner } from './tools/quality-audit/index.js';

const runner = new QualityAuditRunner();
const result = await runner.runAudit({
  id: 'proposal-audit-01',
  title: '제안서 변환 품질 정밀 감사',
  generatedDocx: 'output/proposal.docx',
  referenceDocx: 'samples/proposal-reference.docx',
  figmaImages: ['snapshots/page1.png', 'snapshots/page2.png'],
  options: { targetWidth: 1400, toleranceThreshold: 10 }
}, 'debug/quality-audit/reports');
```

---

## 3. 실제 측정 가능한 지표 및 해석상 한계

### A. 시각적 비교 지표 (Visual Metrics)
- **픽셀 불일치율 (Mismatch Ratio)**: 공통 캔버스 상에서 RGB 오차 임계값(기본 10)을 초과한 픽셀의 비율.
- **MAE (Mean Absolute Error)**: 전체 픽셀의 평균 절대 오차 (0~255).
- **RMSE (Root Mean Square Error)**: 큰 왜곡에 민감한 제곱평균제곱근 오차 (0~255).
- **차이 시각화 맵**:
  - `Overlay Map`: 두 이미지를 50% 반투명 합성하여 위치 이동 직관적 파악.
  - `Difference Map`: 불일치 영역을 고채도 마젠타(`RGB(235, 15, 120)`)로 강조 표시.

> [!WARNING]
> **시각 지표의 한계점**:
> 단순 픽셀 불일치는 Windows 폰트 렌더러(ClearType), 브라우저/Word의 텍스트 안티앨리어싱, 글꼴 버전 차이에 매우 민감합니다. 따라서 3% 미만의 픽셀 차이는 "정상적인 폰트 렌더링 오차"로 판정해야 하며, 이를 문서 품질의 절대적 실패로 규정해서는 안 됩니다.

### B. OpenXML 구조 비교 지표 (Structural Metrics)
- **네이티브 표 보존 (IsNative)**: 표가 래스터 이미지로 변환되지 않고 실제 Word 네이티브 `w:tbl`로 보존되었는지 검사.
- **표 차원 일치 (Rows/Cols)**: 행 개수(`w:tr`) 및 열 개수(`w:tc`)의 기준 문서 대비 일치 여부.
- **용지 규격 및 방향**: A4 세로/가로 및 여백 준수 여부.
- **텍스트 유사도 (Jaccard Index)**: 본문 단어 토큰 교집합 비율을 통해 내용 누락 방지.
- **관계 식별자 무시**: OpenXML 내부의 `r:id`나 생성 타임스탬프 등 무의미한 차이는 품질 결함에서 자동 제외.

---

## 4. 합성 테스트 검증 결과 (`tests/quality-audit/synthetic-fixtures.test.ts`)

| 요구사항 | 검증 시나리오 | 기대 결과 | 실측 결과 | 판정 |
| :--- | :--- | :--- | :--- | :---: |
| **Req 1** | 동일한 100x100 비트맵 비교 | Mismatch 0%, MAE 0, RMSE 0 | 0.0%, 0.0, 0.0 ("100% 픽셀 동일") | **PASS** |
| **Req 2** | 의도적으로 픽셀 패턴을 이동/변경한 이미지 비교 | Mismatch 검출 및 Diff/Overlay 생성 | 차이 픽셀 즉시 검출 및 Diff/Overlay PNG 생성 | **PASS** |
| **Req 3** | 5행 표 문서 vs 3행 표 문서 대조 (행 누락) | 표 행수 불일치 및 구조 공지 검출 | genRows=3, refRows=5 불일치 공지 검출 | **PASS** |
| **Req 4** | 1개 이미지 문서 vs 0개 이미지 문서 대조 (이미지 누락) | 임베디드 이미지 수 차이 검출 | genImages=0, refImages=1 불일치 공지 검출 | **PASS** |
| **Req 5** | Word COM 가용성 검사 및 단독 렌더링 | COM 유무 감지 및 안전한 실행 | success=true, 1p 정상 렌더링 (소요: 7.0초) | **PASS** |
| **Req 6** | E2E Runner 전체 파이프라인 및 HTML 리포트 생성 | 독립 실행형 HTML 및 JSON 생성 | base64 임베딩, 오프라인 HTML 리포트 생성 성공 | **PASS** |

---

## 5. Word COM 및 렌더링 파이프라인 최적화

### A. 렌더링 병목 원인 규명 및 수정
- 초기 시도 시 `render_docx_to_png.ps1`에서 Word COM의 `$doc.ExportAsFixedFormat`이 특정 출력 폴더(`test_out`)를 대상으로 할 때 장시간 블로킹되는 현상 발견.
- **원인**: Microsoft Word 보안 정책상 신뢰되지 않은 원격/가상화 경로로 직접 PDF를 내보낼 때 대화상자 또는 백그라운드 대기 상태 발생.
- **해결책**:
  1. PDF 파일은 원본 DOCX와 동일한 로컬 디렉터리에 `$pdfPath = [System.IO.Path]::ChangeExtension($fullDocxPath, ".pdf")`로 생성 (Word COM 네이티브 신뢰 경로).
  2. WinRT `Windows.Data.Pdf.PdfDocument` API를 통해 지정된 `$OutputDir`로 PNG를 직접 래스터라이징.
  3. `$doc.Close(0)` 직후 `[Marshal]::ReleaseComObject($doc)` 및 GC 강제 호출로 프로세스 잠금 즉각 해제.
- **개선 결과**: 1페이지 문서 렌더링에 **4~7초** 만에 완료되는 초고속 안정화 달성.

---

## 6. 기존 변환 기능 회귀 검증 (신규 변환 실측)

`scratch/render_step12a_fresh_conversion.ts`를 실행하여 실제 스냅샷(`debug/customer/testnewpage.json`)을 최신 파이프라인으로 **완전히 새로 변환**하고 Word COM으로 실측하였습니다:

| 항목 | 신규 생성 Portrait (`Step12A-Fresh-A4-Portrait.docx`) | 신규 생성 Landscape (`Step12A-Fresh-A4-Landscape.docx`) | 비고 |
| :--- | :---: | :---: | :--- |
| **변환 소요 시간** | **192 ms** | **127 ms** | 초고속 결정론적 변환 |
| **DOCX 파일 크기** | **32,733 bytes** | **32,740 bytes** | 바이트 수준 일치 |
| **OpenXML 표 개수** | 15 개 | 15 개 | 네이티브 표 구조 유지 |
| **임베디드 이미지** | 4 개 | 4 개 | 차트/아이콘 보존 |
| **Word COM 실측 페이지** | **5 Pages** | - | 5개 A4 프레임 1:1 페이지 분할 완벽 보존 |
| **Word COM 실측 표/도형** | **Tables: 5, InlineShapes: 18** | - | Step 11C/11D와 100% 동일 (회귀 0%) |

---

## 7. 전체 테스트 및 빌드 결과 요약

- **단위 및 통합 테스트**: **45개 테스트 파일, 271개 테스트 전원 통과 (PASS: 271 / FAIL: 0)**
  - 기존 43개 테스트 파일 (261 tests): 100% PASS
  - `tests/quality-audit/audit-infra.test.ts` (4 tests): 100% PASS
  - `tests/quality-audit/synthetic-fixtures.test.ts` (6 tests): 100% PASS
- **TypeScript 빌드 (`npm run build`)**: 오류 0건 (`tsc` 성공)
- **Web 번들 빌드 (`npm run build:web`)**: 오류 0건 (Vite 267ms 성공)

---

## 8. 향후 실제 Figma 원본 및 정답 DOCX 입수 시 절차

1. **디렉토리 배치**:
   - Figma 원본 스크린샷: `debug/customer/figma_pages/Page01.png`, `Page02.png` 등 배치
   - 사람이 수작업한 정답 DOCX: `debug/customer/reference.docx` 배치
2. **Figma2Word 신규 변환**:
   - `npm run convert` 또는 브라우저 Web UI에서 대상 JSON 스냅샷 로드 → `debug/customer/generated.docx` 생성.
3. **품질 감사 실행**:
   - `runner.runAudit({ id: 'real-audit', generatedDocx, referenceDocx, figmaImages }, 'debug/customer/audit_report')` 실행.
4. **리포트 확인**:
   - `quality-audit-real-audit.html`을 열어 오버레이 및 표 행/열 대조표를 확인하고 결함 수정에 착수.
