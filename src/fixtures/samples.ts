import { FigmaNode, FigmaFileResponse } from "../parser/types.js";

/**
 * Fixture 01: Simple Document
 * Page with Heading, Paragraph, Image, and Line Divider
 */
export const simpleDocumentFixture: FigmaFileResponse = {
  name: "Fixture 01 - Simple Document",
  lastModified: "2026-10-07T00:00:00Z",
  version: "1.0",
  document: {
    id: "doc-01",
    name: "Document",
    type: "DOCUMENT",
    children: [
      {
        id: "canvas-01",
        name: "Page 1 - Overview",
        type: "CANVAS",
        children: [
          {
            id: "node-h1",
            name: "Main Title Heading",
            type: "TEXT",
            characters: "2026 글로벌 AI 프로젝트 추진 기획서",
            absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 40 },
            style: {
              fontFamily: "Calibri",
              fontSize: 28,
              fontWeight: "bold",
              textAlignHorizontal: "LEFT",
            },
            fills: [
              {
                type: "SOLID",
                color: { r: 0.08, g: 0.16, b: 0.35 }, // Navy Blue
              },
            ],
          },
          {
            id: "node-divider",
            name: "Title Divider Line",
            type: "LINE",
            absoluteBoundingBox: { x: 50, y: 100, width: 600, height: 2 },
            strokeWeight: 2,
            strokes: [
              {
                type: "SOLID",
                color: { r: 0.0, g: 0.45, b: 0.85 }, // Blue
              },
            ],
          },
          {
            id: "node-p1",
            name: "Body Text Paragraph",
            type: "TEXT",
            characters:
              "본 문서는 Figma2Word 변환 파이프라인의 첫 번째 수직 슬라이스(Vertical Slice) 검증 문서입니다. Figma에서 작성된 문서 헤딩과 본문 텍스트가 Word 네이티브 단락 요소로 손실 없이 자동 변환됩니다.",
            absoluteBoundingBox: { x: 50, y: 120, width: 600, height: 60 },
            style: {
              fontFamily: "Calibri",
              fontSize: 14,
              fontWeight: "normal",
              textAlignHorizontal: "LEFT",
            },
            fills: [
              {
                type: "SOLID",
                color: { r: 0.2, g: 0.2, b: 0.2 },
              },
            ],
          },
          {
            id: "node-img",
            name: "Project Logo Image",
            type: "RECTANGLE",
            absoluteBoundingBox: { x: 50, y: 200, width: 120, height: 60 },
            fills: [
              {
                type: "IMAGE",
                imageRef: "sample-logo-ref",
              },
            ],
          },
        ],
      },
    ],
  },
};

/**
 * Fixture 02: Card Layout
 * Page with multiple card blocks containing headers, descriptions, and backgrounds
 */
export const cardLayoutFixture: FigmaFileResponse = {
  name: "Fixture 02 - Card Layout",
  lastModified: "2026-10-07T00:00:00Z",
  version: "1.0",
  document: {
    id: "doc-02",
    name: "Document",
    type: "DOCUMENT",
    children: [
      {
        id: "canvas-02",
        name: "Page 2 - Service Cards",
        type: "CANVAS",
        children: [
          {
            id: "card-section-title",
            name: "Section Heading",
            type: "TEXT",
            characters: "핵심 추진 전략 및 서비스 카드",
            absoluteBoundingBox: { x: 50, y: 40, width: 600, height: 35 },
            style: {
              fontFamily: "Calibri",
              fontSize: 24,
              fontWeight: "bold",
              textAlignHorizontal: "LEFT",
            },
            fills: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.4 } }],
          },
          {
            id: "card-container-1",
            name: "Card 1 - Automated Parser",
            type: "FRAME",
            layoutMode: "VERTICAL",
            paddingTop: 16,
            paddingBottom: 16,
            paddingLeft: 16,
            paddingRight: 16,
            itemSpacing: 8,
            cornerRadius: 8,
            fills: [{ type: "SOLID", color: { r: 0.95, g: 0.97, b: 1.0 } }],
            strokes: [{ type: "SOLID", color: { r: 0.75, g: 0.85, b: 0.95 } }],
            strokeWeight: 1,
            absoluteBoundingBox: { x: 50, y: 90, width: 600, height: 120 },
            children: [
              {
                id: "card-1-title",
                name: "Card 1 Title",
                type: "TEXT",
                characters: "01. 결정론적 규칙 기반 파서 (Deterministic Parser)",
                style: { fontFamily: "Calibri", fontSize: 18, fontWeight: "bold" },
                fills: [{ type: "SOLID", color: { r: 0.0, g: 0.35, b: 0.7 } }],
              },
              {
                id: "card-1-desc",
                name: "Card 1 Description",
                type: "TEXT",
                characters:
                  "Figma 노드 트리를 규칙에 따라 안정적으로 Internal Document Model로 매핑하여 재현성을 보장합니다.",
                style: { fontFamily: "Calibri", fontSize: 13, fontWeight: "normal" },
                fills: [{ type: "SOLID", color: { r: 0.25, g: 0.25, b: 0.25 } }],
              },
            ],
          },
          {
            id: "card-container-2",
            name: "Card 2 - Native Docx Renderer",
            type: "FRAME",
            layoutMode: "VERTICAL",
            paddingTop: 16,
            paddingBottom: 16,
            paddingLeft: 16,
            paddingRight: 16,
            itemSpacing: 8,
            cornerRadius: 8,
            fills: [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 0.98 } }],
            strokes: [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } }],
            strokeWeight: 1,
            absoluteBoundingBox: { x: 50, y: 230, width: 600, height: 120 },
            children: [
              {
                id: "card-2-title",
                name: "Card 2 Title",
                type: "TEXT",
                characters: "02. 고품질 Word 네이티브 렌더러 (DOCX Renderer)",
                style: { fontFamily: "Calibri", fontSize: 18, fontWeight: "bold" },
                fills: [{ type: "SOLID", color: { r: 0.1, g: 0.5, b: 0.3 } }],
              },
              {
                id: "card-2-desc",
                name: "Card 2 Description",
                type: "TEXT",
                characters:
                  "Word 내에서 테이블, 단락, 스타일, 이미지가 실제 네이티브 객체로 렌더링되어 사용자가 즉시 편집할 수 있습니다.",
                style: { fontFamily: "Calibri", fontSize: 13, fontWeight: "normal" },
                fills: [{ type: "SOLID", color: { r: 0.25, g: 0.25, b: 0.25 } }],
              },
            ],
          },
        ],
      },
    ],
  },
};

/**
 * Fixture 03: Auto Layout (Horizontal & Vertical)
 * Auto Layout Frame containing a 3-column horizontal grid
 */
export const autoLayoutFixture: FigmaFileResponse = {
  name: "Fixture 03 - Auto Layout",
  lastModified: "2026-10-07T00:00:00Z",
  version: "1.0",
  document: {
    id: "doc-03",
    name: "Document",
    type: "DOCUMENT",
    children: [
      {
        id: "canvas-03",
        name: "Page 3 - Auto Layout Multi-column",
        type: "CANVAS",
        children: [
          {
            id: "autolayout-title",
            name: "Auto Layout Title",
            type: "TEXT",
            characters: "3단 컬럼 가로 오토레이아웃 (Auto Layout Horizontal)",
            absoluteBoundingBox: { x: 50, y: 50, width: 600, height: 35 },
            style: { fontFamily: "Calibri", fontSize: 22, fontWeight: "bold" },
            fills: [{ type: "SOLID", color: { r: 0.1, g: 0.2, b: 0.3 } }],
          },
          {
            id: "horizontal-grid-frame",
            name: "Horizontal 3-Column Grid",
            type: "FRAME",
            layoutMode: "HORIZONTAL",
            primaryAxisAlignItems: "SPACE_BETWEEN",
            itemSpacing: 16,
            paddingTop: 12,
            paddingBottom: 12,
            paddingLeft: 12,
            paddingRight: 12,
            absoluteBoundingBox: { x: 50, y: 100, width: 600, height: 100 },
            children: [
              {
                id: "col-1",
                name: "Column 1 Box",
                type: "FRAME",
                layoutMode: "VERTICAL",
                fills: [{ type: "SOLID", color: { r: 0.92, g: 0.95, b: 0.99 } }],
                strokes: [{ type: "SOLID", color: { r: 0.7, g: 0.8, b: 0.95 } }],
                strokeWeight: 1,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 8,
                paddingRight: 8,
                children: [
                  {
                    id: "col-1-text",
                    name: "Col 1 Text",
                    type: "TEXT",
                    characters: "컬럼 1 (기획)",
                    style: { fontFamily: "Calibri", fontSize: 14, fontWeight: "bold" },
                    fills: [{ type: "SOLID", color: { r: 0.1, g: 0.3, b: 0.6 } }],
                  },
                ],
              },
              {
                id: "col-2",
                name: "Column 2 Box",
                type: "FRAME",
                layoutMode: "VERTICAL",
                fills: [{ type: "SOLID", color: { r: 0.94, g: 0.98, b: 0.94 } }],
                strokes: [{ type: "SOLID", color: { r: 0.7, g: 0.9, b: 0.7 } }],
                strokeWeight: 1,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 8,
                paddingRight: 8,
                children: [
                  {
                    id: "col-2-text",
                    name: "Col 2 Text",
                    type: "TEXT",
                    characters: "컬럼 2 (디자인)",
                    style: { fontFamily: "Calibri", fontSize: 14, fontWeight: "bold" },
                    fills: [{ type: "SOLID", color: { r: 0.1, g: 0.5, b: 0.2 } }],
                  },
                ],
              },
              {
                id: "col-3",
                name: "Column 3 Box",
                type: "FRAME",
                layoutMode: "VERTICAL",
                fills: [{ type: "SOLID", color: { r: 0.99, g: 0.95, b: 0.92 } }],
                strokes: [{ type: "SOLID", color: { r: 0.95, g: 0.8, b: 0.7 } }],
                strokeWeight: 1,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 8,
                paddingRight: 8,
                children: [
                  {
                    id: "col-3-text",
                    name: "Col 3 Text",
                    type: "TEXT",
                    characters: "컬럼 3 (개발)",
                    style: { fontFamily: "Calibri", fontSize: 14, fontWeight: "bold" },
                    fills: [{ type: "SOLID", color: { r: 0.7, g: 0.3, b: 0.1 } }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

