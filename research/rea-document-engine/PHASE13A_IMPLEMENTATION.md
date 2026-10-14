# Phase 13A: Canvas 기반 DOCX/HWPX 듀얼 렌더링 엔진 구현 보고서

## 1. 개요 (Executive Summary)

Phase 13A에서는 기존 HTML 흐름 기반 레이아웃(Flow Engine)의 본질적 한계(A4 페이지 경계 오차, 복잡한 그래픽 겹침 누락 등)를 해결하기 위해, Figma의 2차원 절대 좌표계를 100% 보존하는 **Canvas IR (Intermediate Representation)** 및 이를 바탕으로 편집 가능한 OpenXML DOCX와 한컴오피스 HWPX를 생성하는 **Dual Canvas Engine**을 성공적으로 구축하였다.

기존 Flow 엔진(`InternalDocument`, `DocxRenderer`, `FigmaParser`)은 기본 엔진으로 100% 온전하게 보존되며, 48개 테스트 스위트(290개 테스트) 모두 무결하게 통과한다. 신규 Canvas 엔진은 `--engine canvas` 플래그 및 API를 통해 독립적으로 구동된다.

---

## 2. Canvas IR v1 설계 내역

Canvas IR은 `src/canvas/types.ts`에 정의되어 있으며, Figma 디자인과 Word/한글 문서 포맷 사이의 공통 2차원 벡터 좌표계를 제공한다.

### 2.1 핵심 인터페이스 구조

```typescript
export interface CanvasBounds {
  x: number;      // pt, 페이지 좌상단(0, 0) 기준 X 좌표
  y: number;      // pt, 페이지 좌상단(0, 0) 기준 Y 좌표
  width: number;  // pt, 요소 가로 폭
  height: number; // pt, 요소 세로 높이
}

export interface CanvasStyle {
  fillColor?: string;     // '#RRGGBB'
  fillOpacity?: number;   // 0.0 ~ 1.0
  strokeColor?: string;   // '#RRGGBB'
  strokeWidth?: number;   // pt
  strokeDashed?: boolean;
  cornerRadius?: number;  // pt
}

export interface CanvasTextRun {
  text: string;
  fontFamily?: string;     // 'Pretendard', 'Inter', '맑은 고딕' 등
  fontSizePt?: number;     // pt (한컴오피스는 pt * 100 HWPU)
  fontWeight?: number;     // 400, 500, 600, 700
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;          // '#RRGGBB'
  lineHeightPt?: number;
  letterSpacingPt?: number;
}

export type CanvasElementType = "card" | "text" | "image" | "line" | "table" | "group";

export interface CanvasElement {
  id: string;
  name?: string;
  type: CanvasElementType;
  bounds: CanvasBounds;
  zIndex: number;
  rotation?: number;
  opacity?: number;
  style: CanvasStyle;
  textRuns?: CanvasTextRun[];
  paragraphAlign?: "left" | "center" | "right" | "justify";
  innerPaddingPt?: CanvasPadding;
  imageRef?: string;
  tableData?: CanvasTableData;
  sourceNodeId?: string;
  sourceNodeType?: string;
}

export interface CanvasPage {
  pageNumber: number;
  name?: string;
  bounds: CanvasBounds;
  backgroundColor?: string;
  elements: CanvasElement[];
}

export interface CanvasDocument {
  title: string;
  pageSize: {
    name: "A4" | "Letter" | "Custom";
    widthPt: number;
    heightPt: number;
    unit: "pt";
  };
  marginsPt: { top: number; right: number; bottom: number; left: number };
  pages: CanvasPage[];
  resources: Record<string, CanvasResource>;
  diagnostics: { notices: string[]; warnings: string[] };
}
```

### 2.2 단위 변환 수학 공식

내부 표준 단위는 **PostScript Point (pt, 1/72 inch)**이다.

- **Word Twip (dxa)**: $1\text{ pt} = 20\text{ twip}$ (`ptToTwip(pt) = Math.round(pt * 20)`)
- **Word EMU**: $1\text{ pt} = 12,700\text{ EMU}$ (`ptToEmu(pt) = Math.round(pt * 12700)`)
- **한컴 HWPU**: $1\text{ pt} = 100\text{ HWPU}$ (`ptToHwpu(pt) = Math.round(pt * 100)`)
- **Figma 96 DPI CSS Pixel to Point**:
  $$794\text{ px} \times \frac{72}{96} = 794 \times 0.75 = 595.5\text{ pt} \approx 595.28\text{ pt (A4)}$$
  `fit-a4` 스케일 전략 적용 시:
  $$\text{ScaleX} = \frac{595.28}{794} \approx 0.7497229, \quad \text{ScaleY} = \frac{841.89}{1123} \approx 0.7496794$$

---

## 3. 모듈별 구현 아키텍처

### 3.1 FigmaCanvasParser (`src/canvas/parser/figmaCanvasParser.ts`)
- **다중 페이지 분할 규칙**:
  - Figma 트리의 Canvas(PAGE) 노드 하위의 Top-level FRAME 노드를 검사하여 너비 600~1300, 높이 900~1600 범위의 프레임을 A4 페이지로 판별.
  - Y좌표 기준 정렬 후 1-based `pageNumber` 부여.
- **좌표 평탄화 (Flattening)**:
  - 프레임의 원점 $(x_0, y_0)$을 기준으로 모든 자식 노드의 절대 좌표 $(X, Y)$를 페이지 로컬 좌표로 변환:
    $$x_{\text{local}} = (X - x_0) \times \text{scaleX}, \quad y_{\text{local}} = (Y - y_0) \times \text{scaleY}$$
- **스타일 및 텍스트 파싱**:
  - 단색/그라디언트 채우기(fillColor), 외곽선(strokeColor, strokeWidth), 모서리 둥글기(cornerRadius) 추출.
  - `characterStyleOverrides` 매핑을 적용하여 복합 서식 텍스트 런 분할.
  - `IMAGE` 타입 채우기가 포함된 노드는 Base64 이미지 맵과 연동하여 `CanvasResource`로 패키징.

### 3.2 DocxCanvasRenderer (`src/canvas/renderer/docxCanvasRenderer.ts`)
- **페이지 분할 메커니즘**:
  - A4 용지 크기($11906 \times 16838\text{ dxa}$)에 상/하/좌/우 여백 0(`w:top="0" w:right="0"...`) 설정.
  - 각 페이지는 하나의 상위 `<w:p>`로 구성되며, 2페이지부터 `<w:pPr><w:pageBreakBefore/></w:pPr>` 적용.
- **VML 절대 좌표 Textbox 렌더링**:
  - 각 도형/텍스트 요소를 `<w:pict>` 내부의 `<v:rect>` 또는 `<v:roundrect>`로 생성.
  - `style="position:absolute;left:${x}pt;top:${y}pt;width:${w}pt;height:${h}pt;z-index:${z}"` 인라인 스타일 적용.
  - 내부 `<v:textbox inset="0,0,0,0"><w:txbxContent>` 내에 네이티브 `<w:p>` 및 `<w:r>` 런을 배치하여 Word에서 자유롭게 수정 가능한 텍스트 상자 구조 완성.
- **이미지 패키징**:
  - `word/media/image{N}.png`로 바이너리 번들링 및 `word/_rels/document.xml.rels`에 Relationship 등록.

### 3.3 HwpxCanvasRenderer (`src/canvas/renderer/hwpxCanvasRenderer.ts`)
- **OWPML (KS X 6101) 표준 규격 준수**:
  - `mimetype`: 압축하지 않고(`STORE`), 19바이트 정확한 `application/hwp+zip` 헤더 생성.
  - `version.xml`, `settings.xml`, `META-INF/container.xml`, `META-INF/manifest.xml`.
  - `Contents/content.hpf`: spine 및 manifest 메타데이터 정의.
- **동적 헤더 등록 (`Contents/header.xml`)**:
  - 문서 내에서 사용된 폰트, 크기, 색상, 굵기 조합을 스캔하여 고유한 `<hh:charPr>` ID를 동적 생성 및 매핑.
  - 기본 테두리/채우기 `<hh:borderFill>` 레지스트리 구축.
- **다중 페이지 및 도형 렌더링 (`Contents/section0.xml`)**:
  - 페이지 전환 시 `<hp:p pageBreak="1">` 선언.
  - 배경색 사각 박스 및 각 요소별 `<hp:rect>` 객체 렌더링:
    `pos treatAsChar="0" horzRelTo="PAPER" vertRelTo="PAPER" horzOffset="${xHWPU}" vertOffset="${yHWPU}"`
  - 텍스트가 있는 경우 `<hp:drawText>` 내에 `<hp:subList>` 및 `<hp:p>` 구조를 생성하고 등록된 `charPrIDRef` 부여.
  - 이미지는 `BinData/BIN{NNNN}.png`로 번들링 후 `<hp:pic>` 객체와 매핑.

### 3.4 DocxCanvasParser (`src/canvas/parser/docxCanvasParser.ts`)
- **역공학 추출 엔진**:
  - 생성된 DOCX의 `word/document.xml`을 파싱하여 VML `<v:rect>`/`<v:roundrect>` 및 `w:txbxContent`를 추출.
  - 중첩 태그 오류 방지를 위해 깊이 추적(depth-tracking) 기반의 단락 스캐너를 구현.
  - 추출된 요소를 완벽한 `CanvasDocument` IR로 재구성하여 **DOCX → HWPX 직접 변환** 지원.

### 3.5 통합 CLI 지원 (`src/cli.ts`)
- 옵션:
  - `--engine canvas | flow` (기본값: `flow`)
  - `--format docx | hwpx | both` (기본값: `docx`)
  - `--scale fit-a4 | css-96dpi | 1:1` (기본값: `fit-a4`)
  - `-o, --output <path>`

---

## 4. 빌드 및 테스트 검증 상태

1. **TypeScript 컴파일**: `npm run build` (`tsc`) 무오류 0 경고 통과.
2. **기존 Flow 엔진 회귀 테스트**: 47개 파일 280개 테스트 100% Pass.
3. **신규 Canvas 엔진 단위 테스트**: `tests/canvas-engine.test.ts` 10개 테스트 100% Pass.
4. **전체 테스트**: 48개 파일 290개 테스트 전원 통과.
