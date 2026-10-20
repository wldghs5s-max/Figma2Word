# Phase 26 — 04. Figma ↔ DOCX 이미지 정렬 및 비교 전략 (Alignment Strategy)

**문서 작성 일시**: 2026-10-20  
**작업자**: Antigravity (Google DeepMind Advanced Agentic Coding)  

---

## 1. 정렬(Alignment)의 필요성 및 배경

Figma의 캔버스 좌표계와 Microsoft Word의 OpenXML / VML 페이지 모델은 설계 목적이 근본적으로 다르다:
- **Figma**: 96 DPI 기준의 CSS 픽셀($px$) 단위, 무한 2D 캔버스, 절대 좌표계.
- **Word OpenXML**: $1/72$ 인치 포인트($pt$) 및 $1/20$ 포인트 트윕($twip$) 단위, 인쇄 가능한 페이지 경계($w:pgSz$), $0$ pt 여백을 전제로 한 VML 뷰포트.

따라서 단순한 1:1 픽셀 중첩 비교는 무의미한 불일치(False Negative)를 유발하므로, **수학적으로 엄밀한 3단계 정규화 및 다층 비교 모드**를 정의하여 정렬을 수행한다.

---

## 2. 좌표 및 해상도 정규화 규칙 (Normalization Rules)

### 2.1 단위 및 배율 변환 공식 (Figma px → Word pt)
- 표준 변환식:
  $$\text{Value}_{pt} = \text{Value}_{px} \times \frac{72}{96} = \text{Value}_{px} \times 0.75$$
- 예시 ($1920 \times 1080$ px 풀 HD 웹 프레임):
  - Width: $1920 \times 0.75 = 1440.0$ pt ($28,800$ twips)
  - Height: $1080 \times 0.75 = 810.0$ pt ($16,200$ twips)
- 정렬 검증 원칙: Figma의 모든 객체는 이 $0.75$ 변환 배율을 엄밀히 유지해야 하며, 임의의 스케일 왜곡이나 종횡비 왜곡은 결함으로 판정함.

### 2.2 종횡비(Aspect Ratio) 보존 규칙
- 어떤 정규화 알고리즘도 이미지의 가로/세로 비율을 강제로 왜곡(Non-uniform stretch)하여 유사도 점수를 높여서는 안 됨.
- 해상도 불일치 시 원본 비율을 엄격히 고정한 채 Uniform Scaling(등비 배율)을 적용하고, 남는 영역은 투명 또는 흰색 패딩으로 마스킹함.

---

## 3. 다층 비교 모드 (Three Evaluation Modes)

### Mode 1 — 전체 페이지 비교 (Full Page Canvas Comparison)
- **목적**: 문서의 거시적 레이아웃, 페이지 방향(Landscape/Portrait), 배경색, 페이지 경계 보존 상태 평가.
- **정규화 방식**: DOCX 렌더링 이미지와 Figma 프레임 이미지를 표준 캔버스 뷰포트에 1:1 매핑 후 전역 SSIM 및 MAE 계산.

### Mode 2 — 실제 콘텐츠 영역 비교 (Content Bounding Box Comparison)
- **목적**: 페이지 여백(Margin)의 차이로 인한 전역 점수 왜곡 방지.
- **정규화 방식**:
  1. 페이지 내부의 실제 렌더링된 요소들의 최소 경계 박스(Tight Bounding Box: $X_{\min}, Y_{\min}, X_{\max}, Y_{\max}$)를 계산.
  2. 배경 여백을 제외한 유효 콘텐츠 영역만을 크롭하여 픽셀 레벨 정렬 후 비교.

### Mode 3 — 객체별 기하학 비교 (Object-Level Geometry & Typography Audit)
- **목적**: 픽셀 비교가 놓칠 수 있는 텍스트 줄바꿈(Wrap), 글꼴 크기 드리프트, Z-index 역전 등을 감지.
- **검증 항목**:
  1. **텍스트 박스 높이/너비 드리프트**: Figma 원본 너비 대비 Word VML textbox의 폭 확장/축소 비율.
  2. **단어 조기 줄바꿈 (Early Wrap)**: 단일행으로 디자인된 텍스트가 2줄 이상으로 쪼개졌는지 여부 (`element.textRuns.length` 및 렌더링 행 수 비교).
  3. **VML 도형 클리핑**: 부모 프레임 경계 밖으로 벗어난 객체의 오버플로우 처리.
