import { describe, it, expect } from "vitest";
import { LayoutEngine } from "../src/layout/index.js";
import { FigmaParser } from "../src/parser/index.js";
import { FigmaNode } from "../src/parser/types.js";
import { findNodeEntry } from "../src/api/index.js";
import { safeFileStem } from "../src/pipeline/index.js";
import { detectImageType, decodeDataUrl, fitImageSize, pxToPt } from "../src/renderer/utils.js";
import { DocxRenderer } from "../src/renderer/index.js";
import { ContainerElement, InternalDocument } from "../src/model/index.js";

describe("Regression guards for conversion failures", () => {
  it("keeps column percentages positive when many narrow siblings share a row", () => {
    const engine = new LayoutEngine();
    const nodes: FigmaNode[] = Array.from({ length: 12 }, (_, index) => ({
      id: `col-${index}`,
      name: `Column ${index}`,
      type: "FRAME",
      absoluteBoundingBox: { x: index * 30, y: 0, width: 20, height: 40 },
    }));

    const clustered = engine.clusterHorizontalRows(nodes);
    expect(clustered).toHaveLength(1);
    const widths = (clustered[0] as FigmaNode & { _computedColumnWidths: number[] })
      ._computedColumnWidths;

    expect(widths).toHaveLength(12);
    expect(widths.every((width) => width > 0)).toBe(true);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(100);
  });

  it("still computes width ratios for a horizontal frame that is already a row cell", () => {
    const engine = new LayoutEngine();
    const rowCell = {
      id: "bar",
      name: "Icon And Label",
      type: "FRAME",
      layoutMode: "HORIZONTAL",
      _isRowCell: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 40 },
      children: [
        {
          id: "icon",
          name: "Icon",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 40 },
        },
        {
          id: "label",
          name: "Label",
          type: "FRAME",
          absoluteBoundingBox: { x: 80, y: 0, width: 320, height: 40 },
        },
      ],
    } as FigmaNode;

    const processed = engine.processNodes([rowCell]);
    const widths = (processed[0] as FigmaNode & { _computedColumnWidths?: number[] })
      ._computedColumnWidths;

    expect(widths).toBeDefined();
    expect(widths![0]).toBeLessThan(widths![1]);
    expect(widths!.reduce((sum, width) => sum + width, 0)).toBe(100);
  });

  it("does not fold siblings into a rectangle whose fill is hidden", () => {
    const parser = new FigmaParser();
    const canvas: FigmaNode = {
      id: "canvas",
      name: "Canvas",
      type: "CANVAS",
      children: [
        {
          id: "ghost",
          name: "Hidden Background",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
          fills: [{ type: "SOLID", visible: false, color: { r: 1, g: 1, b: 1 } }],
        },
        {
          id: "copy",
          name: "Visible Copy",
          type: "TEXT",
          characters: "그대로 남아야 하는 문장",
          absoluteBoundingBox: { x: 20, y: 20, width: 200, height: 30 },
          style: { fontSize: 14 },
        },
      ],
    };

    const elements = parser.parse(canvas).document.sections[0].elements;
    expect(elements.some((element) => element.type === "container")).toBe(false);
    expect(elements.some((element) => element.type === "paragraph" || element.type === "heading")).toBe(
      true
    );
  });

  it("keeps an image fill when text sits on top of the picture", () => {
    const parser = new FigmaParser({
      imageMap: {
        hero: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      },
    });
    const frame: FigmaNode = {
      id: "hero-frame",
      name: "Hero",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
      children: [
        {
          id: "hero-bg",
          name: "Hero Photo",
          type: "RECTANGLE",
          absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
          fills: [{ type: "IMAGE", imageRef: "hero" }],
        },
        {
          id: "hero-caption",
          name: "Caption",
          type: "TEXT",
          characters: "사진 위의 설명",
          absoluteBoundingBox: { x: 24, y: 24, width: 200, height: 28 },
          style: { fontSize: 14 },
        },
      ],
    };

    const root = parser.parse(frame).document.sections[0].elements[0] as ContainerElement;
    const card = (root.children.find((child) => child.type === "container") ?? root) as ContainerElement;
    expect(card.backgroundImage?.source.startsWith("data:image/png")).toBe(true);
    expect(card.children.some((child) => child.type === "paragraph" || child.type === "heading")).toBe(
      true
    );
  });

  it("reads text color from style.fills when node.fills is an empty array", () => {
    const parser = new FigmaParser();
    const text: FigmaNode = {
      id: "t",
      name: "Body",
      type: "TEXT",
      characters: "빨간 글자",
      fills: [],
      style: {
        fontSize: 14,
        fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
      },
    };

    const element = parser.parse(text).document.sections[0].elements[0];
    expect(element.type).toBe("paragraph");
    if (element.type === "paragraph") {
      expect(element.runs[0].style?.color?.hex).toBe("FF0000");
    }
  });

  it("does not promote body copy to a heading just because the text contains 'title'", () => {
    const parser = new FigmaParser();
    const text: FigmaNode = {
      id: "body-title",
      name: "The title of this paragraph is not a heading",
      type: "TEXT",
      characters: "The title of this paragraph is not a heading",
      style: { fontSize: 12 },
    };

    expect(parser.parse(text).document.sections[0].elements[0].type).toBe("paragraph");
  });

  it("converts auto-layout spacing from pixels into points", () => {
    const parser = new FigmaParser();
    const frame: FigmaNode = {
      id: "stack",
      name: "Stack",
      type: "FRAME",
      layoutMode: "VERTICAL",
      itemSpacing: 16,
      paddingTop: 8,
      children: [
        {
          id: "a",
          name: "A",
          type: "TEXT",
          characters: "첫째",
          style: { fontSize: 12 },
        },
        {
          id: "b",
          name: "B",
          type: "TEXT",
          characters: "둘째",
          style: { fontSize: 12 },
        },
      ],
    };

    const container = parser.parse(frame).document.sections[0].elements[0] as ContainerElement;
    expect(container.gap).toBe(16);
    expect(container.padding?.top).toBe(8);
    expect(pxToPt(container.gap)).toBe(12);
    expect(pxToPt(container.padding?.top)).toBe(6);
  });

  it("page-breaks side-by-side artboards even when the canvas has a text label", () => {
    const parser = new FigmaParser();
    const canvas: FigmaNode = {
      id: "canvas",
      name: "Flows",
      type: "CANVAS",
      children: [
        {
          id: "label",
          name: "Flow Label",
          type: "TEXT",
          characters: "온보딩",
          absoluteBoundingBox: { x: 0, y: -200, width: 120, height: 24 },
          style: { fontSize: 14 },
        },
        {
          id: "screen-a",
          name: "Login",
          type: "FRAME",
          absoluteBoundingBox: { x: 0, y: 0, width: 375, height: 812 },
          children: [
            { id: "a-text", name: "A", type: "TEXT", characters: "로그인", style: { fontSize: 18 } },
          ],
        },
        {
          id: "screen-b",
          name: "Home",
          type: "FRAME",
          absoluteBoundingBox: { x: 450, y: 0, width: 375, height: 812 },
          children: [
            { id: "b-text", name: "B", type: "TEXT", characters: "홈", style: { fontSize: 18 } },
          ],
        },
      ],
    };

    const elements = parser.parse(canvas).document.sections[0].elements;
    expect(elements.some((element) => element.type === "page_break")).toBe(true);
  });

  it("finds a Figma node when the response key uses a hyphen or encoding", () => {
    const document = { id: "12:34", name: "Frame", type: "FRAME" } as FigmaNode;
    expect(findNodeEntry({ "12-34": { document } }, "12:34")?.document.id).toBe("12:34");
    expect(findNodeEntry({ "12%3A34": { document } }, "12:34")?.document.id).toBe("12:34");
  });

  it("strips characters that are illegal in a Windows file name", () => {
    expect(safeFileStem("보고서:최종")).toBe("보고서_최종");
    expect(safeFileStem("   ")).toBe("figma-export");
  });

  it("recognizes JPEG bytes even when the data URL mime type is generic", () => {
    const payload = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
    const decoded = decodeDataUrl(`data:application/octet-stream;base64,${payload}`);
    expect(decoded).not.toBeNull();
    expect(detectImageType(decoded!.bytes, decoded!.mime)).toBe("jpg");
    expect(fitImageSize(1200, 600, 600)).toEqual({ width: 600, height: 300 });
  });

  it("embeds a JPEG data URL in a docx without failing the render", async () => {
    const payload = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
    const doc: InternalDocument = {
      version: "1.0.0",
      metadata: { title: "JPEG", convertedAt: "2026-10-08T00:00:00Z" },
      pageConfig: {
        size: "A4",
        widthMm: 210,
        heightMm: 297,
        orientation: "portrait",
        marginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
      },
      sections: [
        {
          elements: [
            {
              type: "image",
              source: `data:application/octet-stream;base64,${payload}`,
              width: 1200,
              height: 600,
              altText: "Photo",
              alignment: "center",
            },
          ],
        },
      ],
    };

    const buffer = await new DocxRenderer().renderToBuffer(doc);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
