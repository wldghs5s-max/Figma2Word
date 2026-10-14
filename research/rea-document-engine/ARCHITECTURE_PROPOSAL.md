# Architecture Proposal: Unified 2D Canvas Engine
**Figma2Word — 2D 캔버스 중간 표현(Canvas IR) 및 DOCX/HWPX 듀얼 렌더러 아키텍처 설계**

---

## 1. 배경 및 아키텍처 전환의 당위성

### 1.1 현재 파이프라인의 구조적 한계 (Flow IR)
현재 Figma2Word는 Figma의 2차원 그래픽 트리를 1차원 문서 흐름(Flow Document: 문단, 헤딩, 표의 선형 배열)으로 강제 변환한다.
```
[Figma JSON] (2D Canvas: x, y, w, h)
      ↓
[InternalDocument IR] (1D Sequential Sections: Paragraphs, Tables)
      ↓  ← 이 단계에서 2D 절대좌표 정보 영구 손실
[LayoutEngine] (휴리스틱 기반 중첩 테이블 생성: depth 1~4)
      ↓
[DocxRenderer] (Word Table 기반 렌더링)
      ↓
[결과물] (셀 패딩 누적, 수직 팽창, 행간 왜곡, 페이지 오버플로우)
```

### 1.2 제안하는 신규 아키텍처 (Canvas IR & Dual Renderer)
Figma의 2D 절대 배치를 왜곡 없이 그대로 보존하는 **Canvas IR (2D Canvas Intermediate Representation)**을 도입하고, 이를 바탕으로 DOCX와 HWPX를 1:1 병렬 출력하는 듀얼 렌더러 구조로 전환한다.
```
                  [Figma JSON] (2D Canvas: x, y, w, h)
                            ↓
                    [FigmaCanvasParser]
                            ↓
                   [CanvasDocument IR]
         (Pages, Elements with exact x, y, w, h, z, styling)
                            ↓
       ┌────────────────────┴────────────────────┐
       ↓                                         ↓
[DocxCanvasRenderer]                    [HwpxCanvasRenderer]
- A4 0-margin Page                      - A4 0-margin Page (59530x84190 HWPU)
- 1 Paragraph per Page                  - 1 Section, 1 Paragraph per Page
- Absolute VML/DrawingML Textboxes      - Absolute OWPML hp:rect + hp:drawText
- Native Editable Text                  - Native Editable Text
       ↓                                         ↓
   [.docx 완성]                              [.hwpx 완성]
```

---

## 2. Canvas IR 데이터 모델 명세 (TypeScript Interface)

Canvas IR은 복잡한 DTP 레이아웃을 손실 없이 담을 수 있는 정규화된 2D 데이터 모델이다.

```typescript
export interface CanvasDocument {
  title: string;
  pageSize: {
    widthPt: number;    // 595.3 pt (A4)
    heightPt: number;   // 841.9 pt (A4)
    unit: 'pt';
  };
  margins: {
    top: number;        // 0 pt
    bottom: number;     // 0 pt
    left: number;       // 0 pt
    right: number;      // 0 pt
  };
  embeddedFonts?: EmbeddedFont[];
  pages: CanvasPage[];
}

export interface CanvasPage {
  pageNumber: number;
  backgroundColor?: string;
  elements: CanvasElement[]; // z-index 오름차순 정렬
}

export interface CanvasBounds {
  x: number;            // 용지 좌측 끝단 기준 (pt)
  y: number;            // 용지 상단 끝단 기준 (pt)
  width: number;        // (pt)
  height: number;       // (pt)
}

export interface CanvasStyle {
  fillColor?: string;   // '#FFFFFF', '#F8FAFC'
  fillOpacity?: number; // 0.0 ~ 1.0
  strokeColor?: string; // '#D0D5DD'
  strokeWidth?: number; // (pt)
  cornerRadius?: number;// (pt)
}

export type CanvasElementType = 'card' | 'text' | 'image' | 'table' | 'line';

export interface CanvasElement {
  id: string;
  type: CanvasElementType;
  bounds: CanvasBounds;
  zIndex: number;
  style: CanvasStyle;
  
  // 텍스트 요소 또는 텍스트를 포함하는 카드인 경우
  textRuns?: CanvasTextRun[];
  paragraphAlign?: 'left' | 'center' | 'right' | 'justify';
  
  // 이미지 요소인 경우
  imageData?: {
    resourceId: string; // image1.png, BIN0001.png
    base64Data?: string;
    originalWidth: number;
    originalHeight: number;
  };
  
  // 구조화된 네이티브 표인 경우 (옵션)
  tableData?: CanvasTableData;
}

export interface CanvasTextRun {
  text: string;
  fontFamily: string;   // 'Inter', 'Pretendard', '맑은 고딕'
  fontSizePt: number;   // 9.0, 10.5, 14.0 pt
  fontWeight?: number;  // 400, 600, 700
  color: string;        // '#1E293B'
  lineHeightPt?: number;// 행간
  letterSpacingPt?: number; // 자간
}

export interface CanvasTableData {
  rowCount: number;
  colCount: number;
  colWidthsPt: number[];
  cells: CanvasTableCell[][];
}

export interface CanvasTableCell {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  backgroundColor?: string;
  textRuns: CanvasTextRun[];
}
```

---

## 3. 핵심 렌더링 전략

### 3.1 텍스트 및 카드 렌더링 (Absolute Textbox Strategy)
- **DOCX**:
  - 각 카드는 `<v:rect style="position:absolute;margin-left:{x}pt;margin-top:{y}pt;width:{w}pt;height:{h}pt;z-index:{z};mso-position-horizontal-relative:page;mso-position-vertical-relative:page;">`로 출력.
  - 내부에 `<v:textbox>`와 `<w:txbxContent>`를 두고 `<w:p>` / `<w:r>` 서식을 적용하여 100% 네이티브 편집 가능성 확보.
- **HWPX**:
  - `<hp:rect>` 요소에 `<hp:pos horzRelTo="PAPER" vertRelTo="PAPER" horzOffset="{x*100}" vertOffset="{y*100}"/>` 설정.
  - 내부에 `<hp:drawText>`와 `<hp:subList>`를 두어 한글 프로그램에서 즉시 편집 가능.

### 3.2 표 / 그리드 처리 전략 (Hybrid Mode)
1. **DTP 카드 레이아웃 (기본)**:
   - 각 셀이 독립된 배경색, 패딩, 테두리를 가지는 디자인 컴포넌트는 절대좌표 박스로 배치하여 레이아웃 어긋남을 100% 방지.
2. **정형 데이터 테이블 (선택)**:
   - Figma 상에서 행/열이 명확하고 셀 간 텍스트 정렬이 중요한 데이터 표인 경우, 절대좌표로 위치가 지정된 단일 컨테이너 내부에 네이티브 `<hp:tbl>` 또는 DrawingML 내부 `<w:tbl>`로 직렬화하여 표 셀 이동/행 추가가 가능하도록 지원.

### 3.3 폰트 및 리소스 임베딩 전략
- **DOCX**:
  - `word/fonts/fontTable.xml`과 `word/fonts/font{N}.odttf`를 패키징하여 배포 PC에 Inter나 커스텀 폰트가 없어도 100% 시각 동일성 보장.
- **HWPX**:
  - `Contents/content.hpf` 매니페스트 및 `Contents/header.xml`에 `<hh:font>` 등록 후 `BinData/FONT{N}.ttf`에 트루타입 폰트를 내장.

---

## 4. 기존 코드베이스와의 공존 및 단계별 마이그레이션

기존 시스템의 안정성을 해치지 않기 위해 **비파괴적 병행 아키텍처**를 채택한다:

1. **Step 1 (엔진 코어 확장)**:
   - `packages/core/src/canvas/` 디렉터리에 `CanvasDocument`, `CanvasPage`, `CanvasElement` 타입 정의.
   - `FigmaCanvasParser` 구현: Figma AST 노드에서 절대좌표 트리를 추출하여 `CanvasDocument` 빌드.
2. **Step 2 (신규 렌더러 구현)**:
   - `DocxCanvasRenderer`: `CanvasDocument` → VML/DrawingML 절대좌표 DOCX 생성기.
   - `HwpxCanvasRenderer`: `CanvasDocument` → OWPML HWPX 생성기.
3. **Step 3 (선택형 엔진 스위치 제공)**:
   - Web UI 및 변환 API에 변환 모드 옵션 추가:
     - `engine: 'canvas'` (신규 권장: 픽셀 퍼펙트 DTP 모드, DOCX/HWPX 지원)
     - `engine: 'flow'` (기존 레거시: 유동 텍스트/표 모드)
4. **Step 4 (점진적 전환 및 완전 교체)**:
   - 3종 실무 보고서 회귀 검증 완료 후 `canvas` 모드를 기본값(default)으로 승격.

