# Internal Document Model 설계 문서 (DOCUMENT_MODEL)

본 문서는 Figma2Word의 중간 표현 계층(IR: Internal Representation)의 스키마와 타입 명세를 정의한다.

---

## 1. 모델 설계 기본 원칙

1. **포맷 독립성**: Figma나 Word의 특정 바이너리/API 구조에 종속되지 않는 범용 문서 모델.
2. **엄격한 타입 안전성**: TypeScript 정적 타입 + `Zod` 스키마를 통한 런타임 유효성 검증.
3. **직관적인 의미론(Semantics)**: 헤딩, 단락, 카드, 표, 선, 이미지 등 문서 작성에 필수적인 요소 중심 설계.

---

## 2. 모델 계층 다이어그램

```text
InternalDocument
 ├── Metadata (title, author, source, convertedAt, conversionMode)
 ├── PageConfig (size: A4/Letter, widthMm, heightMm, orientation, marginsMm)
 ├── Header? (elements: DocElement[])
 ├── Footer? (elements: DocElement[])
 └── Sections: DocumentSection[]
      └── elements: DocElement[]
           ├── HeadingElement (level 1~6, runs, alignment, spacing)
           ├── ParagraphElement (runs, alignment, spacing, bullet, numbered)
           ├── ImageElement (source, width, height, alignment, altText)
           ├── LineElement (thickness, color, length, spacing)
           ├── ShapeElement (shapeType, fill, stroke, cornerRadius, content)
           ├── TableElement (rows, columnWidths, borders, alignment)
           └── ContainerElement (layoutDirection, gap, padding, background, border, children)
```

---

## 3. 핵심 스키마 명세

### 3.1 스타일 공통 모델 (`src/model/style.ts`)

- `Color`: `{ r: 0~255, g: 0~255, b: 0~255, a: 0~1, hex?: string }`
- `BorderStyle`: `{ color?: Color, width: number, style: "solid" | "dashed" | "dotted" | "none" }`
- `Spacing`: `{ top: number, right: number, bottom: number, left: number }` (단위: pt 또는 mm)
- `TextStyle`: `{ fontFamily: string, fontSize: number, fontWeight: string | number, italic: boolean, underline: boolean, strike: boolean, color: Color }`

### 3.2 문서 요소 모델 (`src/model/elements.ts`)

#### HeadingElement
```typescript
{
  type: "heading",
  level: 1 | 2 | 3 | 4 | 5 | 6,
  runs: TextRun[],
  alignment: "left" | "center" | "right" | "justify",
  spacing?: Partial<Spacing>
}
```

#### ParagraphElement
```typescript
{
  type: "paragraph",
  runs: TextRun[],
  alignment: "left" | "center" | "right" | "justify",
  spacing?: Partial<Spacing>,
  isBullet?: boolean,
  isNumbered?: boolean
}
```

#### ContainerElement (카드 및 오토레이아웃 그리드)
```typescript
{
  type: "container",
  layoutDirection: "vertical" | "horizontal" | "none",
  gap: number,
  padding?: Partial<Spacing>,
  background?: Color,
  border?: BorderStyle,
  cornerRadius?: number,
  width?: number | "100%",
  children: DocElement[]
}
```

#### TableElement
```typescript
{
  type: "table",
  rows: Array<{
    id?: string,
    isHeader: boolean,
    cells: Array<{
      colSpan: number,
      rowSpan: number,
      background?: Color,
      border?: BorderStyle,
      padding?: Partial<Spacing>,
      children: DocElement[]
    }>
  }>,
  columnWidths?: number[],
  borders?: BorderStyle,
  alignment: "left" | "center" | "right" | "justify"
}
```

