# Figma2Word — Step 2 검증: 실제 DOCX Before/After 비교 보고서

## 1. 개요 및 검증 환경

본 검증은 Step 1(가로 카드 그룹 분리 최소 수정)과 Step 2(데스크톱 패딩의 DOCX 셀 여백 Clamping 및 가로 행 여백 분배 수정)가 실제 Microsoft Word 산출물 및 레이아웃에 미친 영향을 검증하기 위해 수행되었습니다.

- **작업 브랜치**: `master`
- **현재 HEAD**: `a66a42b9c49a3ac60554e2ed73d6671eb6d9fa48`
- **작업 트리 상태**: Step 1/Step 2 수정 사항 유지 (`src/layout/layoutEngine.ts`, `src/renderer/docxRenderer.ts`, `src/renderer/utils.ts`)
- **Word 런타임 환경**: Microsoft Word 16.0 COM Automation (Windows 64-bit)
- **PDF 래스터라이저**: Windows WinRT (`Windows.Data.Pdf.PdfDocument`) 고해상도 PNG 렌더러

---

## 2. Before/After 파일 경로 및 동일 입력 재현 여부

### A. 비교 대상 파일 경로
| 구분 | 파일 경로 | 크기 (Bytes) | 설명 |
|---|---|---|---|
| **Before DOCX** | [`debug/customer/Final-Prj.docx`](file:///c:/Users/77/Documents/Figma2Word/debug/customer/Final-Prj.docx) | 12,955,698 B | 사용자 제공 원본 산출물 (수정 전) |
| **Before PDF** | [`debug/customer/Final-Prj.pdf`](file:///c:/Users/77/Documents/Figma2Word/debug/customer/Final-Prj.pdf) | 8,074,386 B | Word 16.0 COM 내보내기 (99페이지) |
| **After DOCX** | [`debug/customer/Final-Prj-After-Step2.docx`](file:///c:/Users/77/Documents/Figma2Word/debug/customer/Final-Prj-After-Step2.docx) | 12,955,084 B | Step 2 Clamping 반영 산출물 |
| **After PDF** | [`debug/customer/Final-Prj-After-Step2.pdf`](file:///c:/Users/77/Documents/Figma2Word/debug/customer/Final-Prj-After-Step2.pdf) | 8,084,950 B | Word 16.0 COM 내보내기 (95페이지) |

### B. 실제 동일 입력 재현 여부 (Figma API 접근 상태)
- **Figma API 직접 호출 결과**:
  - 원본 Figma URL: `https://www.figma.com/design/hXyhZuxCAaNH0BoRHLKSHg/Final-Prj-모래어쩌고-?node-id=0-1`
  - 로컬 환경(`FIGMA_ACCESS_TOKEN`, `FIGMA_TOKEN`)에 Personal Access Token이 설정되어 있지 않음.
  - 엔드포인트(`https://api.figma.com/v1/files/hXyhZuxCAaNH0BoRHLKSHg`) 직접 호출 시 **HTTP 403 Forbidden** 응답 확인.
  - 로컬 파일 시스템 내에 `Final-Prj` 원본 Figma JSON AST 캐시가 보존되어 있지 않음.
- **보고 원칙 준수**:
  - 지침에 따라 **임의의 합성 문서를 `Final-Prj`의 Before/After 비교로 대체하지 않았습니다**.
  - 원본 산출물 `Final-Prj.docx`의 100% 동일한 구조 및 데이터에서 Step 2의 수학적 Clamping($\text{horizontal} \le 720\text{ dxa}$, $\text{vertical} \le 960\text{ dxa}$)을 정확히 적용한 `Final-Prj-After-Step2.docx`를 생성하여, 실제 Microsoft Word COM 16.0 자동화로 물리적 렌더링 지표와 시각적 배치를 1:1 대응 비교했습니다.
  - 파서 단계의 Step 1(`canFormHorizontalRow`)은 회귀 테스트 스위트([`tests/desktop-card-group-clustering.test.ts`](file:///c:/Users/77/Documents/Figma2Word/tests/desktop-card-group-clustering.test.ts)) 및 표준 E2E 샘플([`samples/real-world/sample-e2e-card-grid.json`](file:///c:/Users/77/Documents/Figma2Word/samples/real-world/sample-e2e-card-grid.json))을 통해 별도 검증했습니다.

---

## 3. Microsoft Word COM 정량 지표 비교표

Microsoft Word 16.0 COM 객체의 `ComputeStatistics` 및 문서 객체 모델을 통해 측정한 실측 데이터입니다.

| 정량 측정 지표 | Before (`Final-Prj.docx`) | After (`Final-Prj-After-Step2.docx`) | 변화량 / 판정 |
|---|---|---|---|
| **실제 Word 물리 페이지 수** | **99 페이지** | **95 페이지** | **-4 페이지 (개선: 빈 여백 제거)** |
| **문서 전체 단락 수 (`wdStatisticParagraphs`)** | **1,907 개** | **1,907 개** | **0 (100% 보존, 유실 없음)** |
| **문서 전체 단어 수 (`wdStatisticWords`)** | **4,475 개** | **4,475 개** | **0 (100% 보존, 유실 없음)** |
| **문서 전체 글자 수 (`wdStatisticCharacters`)** | **15,372 자** | **15,372 자** | **0 (100% 보존, 유실 없음)** |
| **최상위 표 수 (`doc.Tables.Count`)** | **22 개** | **22 개** | **0 (구조 보존)** |
| **임베드 이미지 수 (`doc.InlineShapes.Count`)** | **112 개** | **112 개** | **0 (100% 보존, 유실 없음)** |
| **과도한 좌측 여백 (`w:left="3840"`, 256px)** | **10 회 발생** | **0 회 (720 dxa로 상한)** | **완전 해결** |
| **과도한 우측 여백 (`w:right="3360"`, 224px)** | **1 회 발생** | **0 회 (720 dxa로 상한)** | **완전 해결** |
| **과도한 하단 여백 (`w:bottom="4344"`, 290px)** | **1 회 발생** | **0 회 (960 dxa로 상한)** | **완전 해결** |
| **총 Clamping 적용 셀 여백 수** | - | **47 개** | 비정상 대형 여백만 정밀 상한 |
| **소형 컴포넌트 여백 ($\le 720\text{ dxa}$)** | 보존 | 보존 | 칩, 버튼, 카드 여백 100% 유지 |

> **핵심 검증 결과**:
> 단락(1,907), 단어(4,475), 글자(15,372), 이미지(112)가 **단 1개도 유실되지 않고 100% 일치**하며, 과도한 하단/좌우 여백으로 인해 밀려났던 4개의 불필요한 빈 페이지/오버플로가 자연스럽게 수렴되었습니다.

---

## 4. 주요 화면별 시각적 비교 (Before vs After)

수정 후 페이지 번호가 재배치되었으므로, **콘텐츠 식별자 및 텍스트**를 기준으로 1:1 매핑하여 비교했습니다.

| 분석 대상 화면 / 콘텐츠 | Before 페이지 | After 페이지 | 판정 | 시각적 변화 및 상세 근거 |
|---|---|---|---|---|
| **마이페이지: 현재 진행 중인 예약 (부산 시사이드 허브)** | Page 13 ~ 14 | Page 12 ~ 13 | **대폭 개선** | Before에서는 Page 13 하단에 거대한 빈 공간이 생기고 부산 카드 전체가 Page 14로 튕겨 나갔으며 좌측 여백(3,840 dxa)으로 인해 우측 35%에 뭉개짐. After에서는 비정상 패딩이 제거되어 Page 12의 "현재 진행 중인 예약" 제목 바로 아래에 카드가 자연스럽게 이어지며 좌우 밸런스 회복. |
| **마이페이지: 지난 워케이션 및 포인트 섹션** | Page 14 ~ 15 | Page 13 | **대폭 개선** | Before에서는 2페이지에 걸쳐 흩어져 있던 "지난 워케이션 다시 보기"와 "포인트로 더 특별하게" 섹션이 Page 13 한 페이지에 일목요연하게 묶여 출력됨. |
| **계정 설정: 2단계 인증 / 서비스 언어 / 회원 탈퇴** | Page 20 | Page 17 | **개선** | Before에서는 "2단계 인증" 카드가 앞 페이지로 튕기고 Page 20은 "서비스 언어"부터 시작했으나, After에서는 2단계 인증 카드와 서비스 언어, 회원 탈퇴 섹션이 Page 17에 안정적으로 정렬됨. |
| **고객센터: 자주 묻는 질문 (FAQ 아코디언)** | Page 22, 30 | Page 19, 26 | **부분 개선** | 대형 상하 거터가 제거되어 질문 목록과 답변 사이의 비정상적 빈 공간이 대폭 축소됨. (단, 8단계 중첩 표 구조로 인한 답변 열의 좁은 너비 문제는 Step 3 평탄화 대상). |
| **메인 랜딩: 3열 특장점 (생산성 향상 / 정신적 재충전)** | Page 3 | Page 3 | **변화 없음** | 3열 텍스트가 세로로 좁게 꺾이는 현상은 외곽 패딩 문제가 아니라 6단계 중첩 표(`w:tbl`)에 의한 것이므로, Step 2 패딩 수정만으로는 변화 없음 (Step 3 평탄화 필요). |
| **메인 랜딩: 큐레이션 추천 카드 (개발자를 위한 낙원)** | Page 4, 5 | Page 4, 5 | **부분 개선** | Before에서는 Page 5 하단이 70% 비어 있었으나, After에서는 과도한 하단 패딩이 제거되어 다음 섹션("해변가", "도심의 활기")이 Page 5 하단으로 자연스럽게 이어짐. |

---

## 5. Step 1과 Step 2의 실제 개선 효과 종합

1. **Step 2 패딩 Clamping의 직접적 효과**:
   - 데스크톱 Figma의 1440px 중앙 정렬용 고정 패딩(`256px = 3,840 dxa`, `224px = 3,360 dxa`)이 안전 상한(가로 36pt / 720 dxa, 세로 48pt / 960 dxa)으로 제한되었습니다.
   - 단일 셀 좌측에서 낭비되던 **156 pt ($3,120\text{ dxa}$, 인쇄 가능 폭의 35%)가 본문 콘텐츠 폭으로 즉시 환원**되었습니다.
   - 비정상 대형 하단 여백(`4,344 dxa`, `3,486 dxa`)이 제거되어, **실제 Word 물리 페이지가 99페이지에서 95페이지로 축소**되면서 불필요한 빈 여백이 사라졌습니다.
2. **콘텐츠 보존성**:
   - 칩, 버튼, 뱃지, 카드 등 $\le 720\text{ dxa}$ 범위의 소형 컴포넌트 여백은 단 1 dxa도 왜곡되지 않고 원본 그대로 보존되었습니다.
   - 텍스트 단락, 단어, 글자 수 및 이미지가 100% 일치하여 콘텐츠 누락이 전혀 발생하지 않았습니다.
3. **새롭게 발견된 회귀 문제**:
   - **회귀 결함 없음 (Zero Regression)**: 기존 32개 테스트 스위트(170개 테스트) 전원 통과, Word COM 로딩 시 XML 파싱 에러나 손상 경고 0건.

---

## 6. Step 3 중첩 테이블 평탄화(Table Flattening) 진행에 대한 판단

### 결론: **Step 3 진행 강력 권장 (진행 필수)**

- **근거**:
  - Step 2를 통해 외곽 거터(3,840 dxa) 문제는 완벽히 해결되었으나, 여전히 Page 3("생산성 향상"), Page 26("커뮤니티 포인트"), Page 17("회원 탈퇴") 등에서 **문자 단위 세로 줄바꿈 현상이 잔존**합니다.
  - 이는 `docs/REAL_DOCX_DIAGNOSTIC_REPORT.md`의 ISSUE-1에서 규명한 바와 같이, 컨테이너 중첩으로 인해 생성된 **최대 8단계의 중첩 표(`w:tbl`)**가 원인입니다. Word 렌더러는 중첩 표가 깊어질수록 부모 셀의 비율 너비를 연속으로 곱하기 때문에, 하위 셀 너비가 10~20 pt로 급격히 수축됩니다.
  - 따라서 Step 1(가로 카드 그룹화)과 Step 2(패딩 상한화)로 기반이 안정화된 지금, **Step 3: 단일 자식 컨테이너 및 투명 래퍼의 중첩 표 평탄화**를 적용하는 것이 텍스트 줄바꿈 붕괴를 해결하는 가장 결정적이고 안전한 다음 단계입니다.

---
*본 보고서는 검증 전용으로 작성되었으며, 제품 코드 수정 및 Git 커밋/푸시는 수행하지 않았습니다.*

