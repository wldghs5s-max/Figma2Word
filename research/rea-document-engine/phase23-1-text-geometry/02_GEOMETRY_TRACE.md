# Phase 23.1 Geometry Trace & Provenance Analysis

## 1. 개요 및 추적 원칙
본 문서는 Figma 원본 JSON에서 출발하여 Canvas IR(Canonical JSON), DOCX Renderer, HWPX Renderer에 이르기까지 텍스트 기하학적 수치(너비, 높이, 내부 여백, 유효 텍스트 영역)가 변환되는 과정을 단계별로 정밀 기록한다.

---

## 2. Stage 6: `sample-a-proposal-doc.json` 추적

### 문제 대상 요소: `Executive Summary Lead Paragraph` (id: `1:40`)
- **텍스트 내용 (152자)**:
  `"본 제안서는 사내 디자인 및 기획 자산의 신속한 문서화를 위해, Figma 디자인을 표준 Microsoft Word(.docx) 형식으로 무손실 변환하는 자체 자동화 시스템 도입 방안을 제시합니다. 디자이너와 기획자 간의 수작업 포맷 재구성 비용을 80% 이상 절감하는 것을 목표로 합니다."`
- **폰트 메타데이터**: `맑은 고딕` (Malgun Gothic), `10.5pt`, `lineHeight: 18.0pt`

#### A. Figma Node & Canvas IR 변환
- Figma 원본: Auto-Layout 세로 프레임 내부(`Doc Frame - A4`, `paddingLeft=56px`, `paddingRight=56px`, `width=794px`).
- 프레임 가용 폭: `794 - 112 = 682 px`.
- Scale Factor (A4 맞춤): `scaleX = 595.28 / 794 ≈ 0.7497`, `scaleY = 841.89 / 1123 ≈ 0.7497`.
- **Canvas IR Bounds (pt)**:
  - `x = 56 * 0.7497 = 42.0 pt`
  - `y = 166 * 0.7497 = 124.4 pt`
  - `width = 682 * 0.7497 = 511.3 pt`
  - `height = 76 * 0.7497 = 57.0 pt`

#### B. DOCX Renderer 기하 변환
- 입력 Canvas IR: `w = 511.3 pt`, `h = 57.0 pt`.
- 단위 변환: DXA (`1 pt = 20 dxa`), EMU (`1 pt = 12700 emu`).
- 출력 도형/텍스트박스:
  - Width: `511.3 pt` (`10226 dxa`)
  - Height: `57.0 pt` (`1140 dxa`)
  - Padding: `top=0, bottom=0, left=0, right=0`
  - 줄바꿈 정책: Word 기본 텍스트 래핑 적용.

#### C. HWPX Renderer 기하 변환
- 입력 Canvas IR: `w = 511.3 pt`, `h = 57.0 pt`.
- 단위 변환: HWPUNIT (`1 pt = 100 HWPU`).
- 출력 도형/텍스트박스:
  - `outerWidth = 51131 HWPU` (`511.3 pt`)
  - `outerHeight = 5698 HWPU` (`57.0 pt`)
  - `leftInset (marginL) = 0 HWPU` (`0.0 pt`)
  - `rightInset (marginR) = 0 HWPU` (`0.0 pt`)
  - `innerWidth = 51131 - 0 - 0 = 51131 HWPU` (`511.3 pt`)
  - `innerHeight = 5698 - 0 - 0 = 5698 HWPU` (`57.0 pt`)
  - XML 속성: `<hp:drawText lastWidth="51131">`, `<hp:subList textWidth="51131" lineWrap="BREAK">`

#### D. 하단 인접 요소와의 거리 추적
- 다음 요소: `Section Subtitle` (id: `1:50`)
- IR Bounds: `x = 42.0 pt`, `y = 199.4 pt`, `height = 24.0 pt`.
- **수정 전 (Phase 23)**:
  - `snapToGrid="1"` 및 `KEEP_WORD` 결함으로 인해 1행에 약 38자만 수용되고 4줄로 강제 개행됨.
  - 4줄 높이: `4 * 18.0pt = 72.0pt`.
  - 텍스트 도달 위치: `124.4 + 72.0 = 196.4 pt`.
  - `199.4 - 196.4 = 3.0 pt`의 극소 간격만 남아 소제목 텍스트의 상단 어센더(ascender)와 직접 시각적 충돌 발생.
- **수정 후 (Phase 23.1)**:
  - `snapToGrid="0"`, `breakNonLatinWord="BREAK_WORD"`, `autoSpacing=0` 적용.
  - 가용 폭 `511.3 pt`에 한글 글리프(`10.5pt`)가 행당 48.7자 수용됨.
  - 152자 전체가 **정확히 3줄(`152 / 48.7 = 3.12` → 3줄 마진 내 수용)**에 배치됨.
  - 3줄 높이: `3 * 18.0pt = 54.0pt <= 57.0pt`.
  - 텍스트 도달 위치: `124.4 + 54.0 = 178.4 pt`.
  - 소제목(`y = 199.4 pt`)과의 사이에 **`21.0 pt`의 완전한 안전 여백 확보**됨.

---

## 3. Stage 7: `Report1-Live-Snapshot.json` 추적

### 주요 요소 비교: Page 9 `7:952` vs `7:954`
- 요소 `7:952` ("`등급 A는 타 동 대비 균열 발생 밀도와 심각도가 가장 낮음을...`", 82자)
  - Figma Bounding Box: `x = 7196`, `y = 9882`, `width = 666`, `height = 17 px` (Font: Manrope 11px)
  - Canvas IR Bounds: `x = 48.0 pt`, `y = 502.3 pt`, `width = 499.3 pt`, `height = 12.7 pt`
  - HWPX 출력:
    - `outerWidth = 49932 HWPU` (`499.3 pt`)
    - `outerHeight = 1274 HWPU` (`12.7 pt`)
    - `innerWidth = 49932 HWPU` (`499.3 pt`)
    - `textMargin = L:0, R:0, T:0, B:0`
- 다음 요소 `7:954` ("`2. AI 모델의 과대측정 편향 및 주의사항`")
  - Canvas IR Bounds: `x = 48.0 pt`, `y = 527.0 pt`, `height = 12.0 pt`
- **기하학적 분석**:
  - `527.0 - 502.3 = 24.7 pt`.
  - 82자 한글 문장은 499.3pt 너비에서 1줄에 587pt가 필요하므로 반드시 2줄로 개행됨.
  - 2줄 필요 높이: `2 * 12.37 pt = 24.74 pt`.
  - `502.3 + 24.74 = 527.04 pt`.
  - 이는 Figma 디자이너가 영어 폰트(Manrope) 1줄 높이(17px)만 할당하고 바로 아래에 다음 요소를 배치한 **원본 데이터 공간 부족(Source Geometry Conflict)**으로 판명됨.

---

## 4. 정품 레퍼런스와의 기하학적 비교표

| 속성 | Phase 22 | Phase 23 | Phase 23.1 (본 작업) | 정품 레퍼런스 |
|---|---|---|---|---|
| **lineWrap** | SQUEEZE | BREAK | **BREAK** | 문단: BREAK, 라벨: SQUEEZE |
| **snapToGrid** | 1 (격자 스냅) | 1 (격자 스냅) | **0 (스냅 해제)** | **0 (스냅 해제)** |
| **breakNonLatinWord** | 없음 | 없음 | **BREAK_WORD** | **BREAK_WORD** |
| **autoSpacing** | 없음 | 없음 | **eAsianEng="0", eAsianNum="0"** | **eAsianEng="0", eAsianNum="0"** |
| **paraPr Margin** | 없음 | 없음 | **intent=0, L=0, R=0, prev=0, next=0** | **intent=0, L=0, R=0, prev=0, next=0** |
| **textMargin (기본)** | L:0, R:0 | L:pad, R:pad (인위적 축소) | **L:0, R:0 (100% 가용)** | **L:0, R:0 (100% 가용)** |
| **Stage 6 여백** | 수평 겹침 | 3.0pt (충돌 위험) | **21.0pt (완전 분리)** | 정상 분리 |
