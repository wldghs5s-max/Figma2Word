# Phase 15: Visual Quality & Regression Benchmark Results (Track D)

## 1. 개요 및 측정 방법론

Figma2Word Canvas 듀얼 엔진의 시각적 완성도와 회귀 방지 상태를 정량적으로 평가하기 위해, 실제 업무용 보고서 3종(총 30페이지)과 7대 신규 합성 아키타입을 대상으로 시각적 유사도(SSIM, Structural Similarity Index) 및 렌더링 무결성을 측정하였다.

- **측정 도구**: Microsoft Word COM 백그라운드 렌더러 + OpenCV / scikit-image (`measure_all_ssim.py`)
- **렌더링 해상도**: 96 DPI 및 192 DPI 고해상도 래스터화
- **비교 대상**:
  1. `Canvas Generated DOCX` (Figma2Word 차세대 엔진)
  2. `Flow Generated DOCX` (기존 레거시 1차원 플로우 엔진)
  3. `Human Reference DOCX` (전문 디자이너 수작업 최종본)

---

## 2. 실무 보고서 3종(30페이지) 정량 벤치마크 결과

| 대상 문서 | 페이지 수 | Canvas 엔진 SSIM | Flow 엔진 SSIM | 품질 향상도 (Canvas vs Flow) |
| :--- | :---: | :---: | :---: | :---: |
| **보고서 1 (보안 진단 보고서)** | 11 p | **0.8768** | 0.5891 | **+48.8% 향상** (문단 밀림 및 표 깨짐 소멸) |
| **보고서 2 (결함 분석 보고서)** | 9 p | **0.8210** *(0.865\*)* | 0.5218 | **+57.3% 향상** (다단 카드 및 지표 그리드 안정화) |
| **보고서 3 (기술 제안 보고서)** | 10 p | **0.8708** | 0.6120 | **+42.3% 향상** (표지 배너 및 복합 차트 정밀 정렬) |
| **전체 30페이지 종합 평균** | **30 p** | **0.8562** | **0.5743** | **+49.1% 대폭 향상** |

> **\* 보고서 2의 SSIM (0.8210 vs 0.865) 특이점 분석 (Ground Truth)**:
> 보고서 2의 8페이지(Frame 7)에서 관찰되는 오차는 엔진의 결함이 아니라, **인간 디자이너가 Word 수작업 편집 시 Figma 원본 대비 6장의 결함 사진 높이를 191.8pt에서 150.0pt로 일괄 41.8pt 축소하고 6개 배지를 삭제**하여 발생한 수직 위치 차이(125pt) 때문임. 이 인간 디자이너의 임의 수정 페이지를 제외한 보고서 2의 순수 Figma 충실도 SSIM은 **0.865 이상**을 기록함.

---

## 3. 신규 합성 아키타입 7종 검증 결과

`samples/synthetic-figma/`에 구축된 7대 합성 아키타입에 대한 Word COM 열기 및 HWPX XML 문법 검증 결과:

| 아키타입 명칭 | 구성 페이지 | 셰이프 수 | Word COM 검증 결과 | HWPX KS X 6101 검증 결과 |
| :--- | :---: | :---: | :---: | :---: |
| **1. 단일 메모 (`single-page-brief`)** | 1 p | 19개 | **정상 (Pages=1, Shifts=0)** | **통과 (XML 무결성, 0 오류)** |
| **2. 다중 보고서 (`multi-page-report`)** | 3 p | 37개 | **정상 (Pages=3, Shifts=0)** | **통과 (3p 구분자 정상 생성)** |
| **3. 이미지 갤러리 (`image-centric-portfolio`)** | 1 p | 17개 | **정상 (Pages=1, Shifts=0)** | **통과 (다중 종횡비 BinData 일치)** |
| **4. 텍스트 아티클 (`text-centric-article`)** | 1 p | 17개 | **정상 (Pages=1, Shifts=0)** | **통과 (H1/H2 서체 계층 보존)** |
| **5. 벡터 인포그래픽 (`vector-centric-infographic`)** | 1 p | 28개 | **정상 (Pages=1, Shifts=0)** | **통과 (`hp:polygon` 정점 생성)** |
| **6. 중첩 대시보드 (`complex-nested-dashboard`)** | 1 p | 41개 | **정상 (Pages=1, 가로형 유지)** | **통과 (가로형 용지 속성 일치)** |
| **7. 표/카드 하이브리드 (`table-card-hybrid`)** | 1 p | 48개 | **정상 (Pages=1, Shifts=0)** | **통과 (그리드 및 칩 배지 보존)** |

---

## 4. 시각적 결함 해소 및 비교 분석

1. **Text Fill Leak (텍스트 배경 누출) 100% 해소**:
   - Figma 텍스트 노드의 컨테이너 배경색이 텍스트박스 전체를 덮어 텍스트가 가려지던 문제를 `isPureTextNode` 검사로 완전 제거.
2. **이미지 종횡비(Crop Fraction) 정밀 보존**:
   - VML `<v:imagedata croptop="..." cropbottom="...">` 공식을 정밀 적용하여 왜곡(Stretching) 없이 `object-fit: cover` 효과 구현.
3. **네이티브 VML & HWPX 도형 변환**:
   - 단순 비트맵 캡처 방식 대신 네이티브 `<v:oval>`, `<v:shape>`, `<hp:oval>`, `<hp:polygon>`을 적용하여 확대 시에도 깨지지 않는 고해상도 벡터 품질 달성.

