import { describe, it, expect } from "vitest";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { InternalDocument } from "../src/model/document.js";
import { ConversionPipeline } from "../src/pipeline/index.js";
import { simpleDocumentFixture } from "../src/fixtures/samples.js";

describe("Step 5: Page Orientation Selection (Portrait vs Landscape)", () => {
  const renderer = new DocxRenderer();

  it("configures default portrait A4 page dimensions (11906 x 16838 dxa)", () => {
    const doc: InternalDocument = {
      version: "1.0.0",
      metadata: { title: "Portrait Test" },
      pageConfig: {
        size: "A4",
        widthMm: 210,
        heightMm: 297,
        orientation: "portrait",
      },
      sections: [
        {
          elements: [
            {
              type: "paragraph",
              runs: [{ type: "run", text: "Portrait paragraph" }],
              alignment: "left",
            },
          ],
        },
      ],
    };

    const docx = renderer.createDocument(doc);
    const pgSzAttr = (docx as any).documentWrapper.document.root[1].sections[0].root[0].root[0].root;
    expect(pgSzAttr).toBeDefined();
    expect(pgSzAttr.orientation.value).toBe("portrait");
    expect(pgSzAttr.width.value).toBe(11906); // 210mm in twips/dxa
    expect(pgSzAttr.height.value).toBe(16838); // 297mm in twips/dxa
  });

  it("configures landscape A4 page dimensions (16838 x 11906 dxa) when orientation is landscape", () => {
    const doc: InternalDocument = {
      version: "1.0.0",
      metadata: { title: "Landscape Test" },
      pageConfig: {
        size: "A4",
        widthMm: 210,
        heightMm: 297,
        orientation: "landscape",
      },
      sections: [
        {
          elements: [
            {
              type: "paragraph",
              runs: [{ type: "run", text: "Landscape paragraph" }],
              alignment: "left",
            },
          ],
        },
      ],
    };

    const docx = renderer.createDocument(doc);
    const pgSzAttr = (docx as any).documentWrapper.document.root[1].sections[0].root[0].root[0].root;
    expect(pgSzAttr).toBeDefined();
    expect(pgSzAttr.orientation.value).toBe("landscape");
    expect(pgSzAttr.width.value).toBe(16838); // 297mm in twips/dxa
    expect(pgSzAttr.height.value).toBe(11906); // 210mm in twips/dxa
  });

  it("respects section-level pageConfig orientation override", () => {
    const doc: InternalDocument = {
      version: "1.0.0",
      metadata: { title: "Mixed Orientation Test" },
      pageConfig: {
        size: "A4",
        widthMm: 210,
        heightMm: 297,
        orientation: "portrait",
      },
      sections: [
        {
          id: "sec-portrait",
          elements: [{ type: "paragraph", runs: [{ type: "run", text: "Section 1" }], alignment: "left" }],
        },
        {
          id: "sec-landscape",
          pageConfig: {
            size: "A4",
            widthMm: 210,
            heightMm: 297,
            orientation: "landscape",
          },
          elements: [{ type: "paragraph", runs: [{ type: "run", text: "Section 2" }], alignment: "left" }],
        },
      ],
    };

    const docx = renderer.createDocument(doc);
    const body = (docx as any).documentWrapper.document.root[1];

    // In docx library, previous sections are stored in body.sectionParagraphs Map
    // while the final section is stored in body.sections[0]
    const priorSections = Array.from(body.sectionParagraphs.values()) as any[];
    expect(priorSections.length).toBe(1);

    const sec1PgSz = priorSections[0].root[0].root[0].root;
    expect(sec1PgSz.orientation.value).toBe("portrait");
    expect(sec1PgSz.width.value).toBe(11906);
    expect(sec1PgSz.height.value).toBe(16838);

    const sec2PgSz = body.sections[0].root[0].root[0].root;
    expect(sec2PgSz.orientation.value).toBe("landscape");
    expect(sec2PgSz.width.value).toBe(16838);
    expect(sec2PgSz.height.value).toBe(11906);
  });

  it("applies pageOrientation option in pipeline convert() to internal document and sections", async () => {
    const pipeline = new ConversionPipeline();
    const portraitResult = await pipeline.convert(simpleDocumentFixture, { pageOrientation: "portrait" });
    expect(portraitResult.internalDocument.pageConfig.orientation).toBe("portrait");
    for (const sec of portraitResult.internalDocument.sections) {
      if (sec.pageConfig) {
        expect(sec.pageConfig.orientation).toBe("portrait");
      }
    }
    expect(portraitResult.docxBuffer).toBeInstanceOf(Buffer);
    expect(portraitResult.docxBuffer.length).toBeGreaterThan(1000);

    const landscapeResult = await pipeline.convert(simpleDocumentFixture, { pageOrientation: "landscape" });
    expect(landscapeResult.internalDocument.pageConfig.orientation).toBe("landscape");
    for (const sec of landscapeResult.internalDocument.sections) {
      if (sec.pageConfig) {
        expect(sec.pageConfig.orientation).toBe("landscape");
      }
    }
    expect(landscapeResult.docxBuffer).toBeInstanceOf(Buffer);
    expect(landscapeResult.docxBuffer.length).toBeGreaterThan(1000);
  });

  it("calculates content width correctly (Portrait: 602px, Landscape: 931px, +54.6% expansion)", () => {
    const rPortrait = new DocxRenderer();
    const rLandscape = new DocxRenderer();

    const portraitDoc: InternalDocument = {
      version: "1.0.0",
      metadata: { title: "Portrait" },
      pageConfig: { size: "A4", orientation: "portrait" },
      sections: [{ elements: [] }],
    };
    const landscapeDoc: InternalDocument = {
      version: "1.0.0",
      metadata: { title: "Landscape" },
      pageConfig: { size: "A4", orientation: "landscape" },
      sections: [{ elements: [] }],
    };

    rPortrait.createDocument(portraitDoc);
    rLandscape.createDocument(landscapeDoc);

    const portraitContentPx = (rPortrait as any).contentWidthPx;
    const landscapeContentPx = (rLandscape as any).contentWidthPx;

    expect(portraitContentPx).toBe(602);
    expect(landscapeContentPx).toBe(931);

    const expansionRatio = (landscapeContentPx - portraitContentPx) / portraitContentPx;
    expect(expansionRatio).toBeCloseTo(0.546, 2); // 54.6% width increase
  });

  it("renders both Portrait and Landscape to valid buffers and blobs without errors", async () => {
    const doc: InternalDocument = {
      version: "1.0.0",
      metadata: { title: "E2E Buffer Check" },
      pageConfig: { size: "A4", orientation: "landscape" },
      sections: [
        {
          elements: [
            {
              type: "paragraph",
              runs: [{ type: "run", text: "Testing renderToBuffer and renderToBlob in landscape mode" }],
              alignment: "left",
            },
          ],
        },
      ],
    };

    const buffer = await renderer.renderToBuffer(doc);
    const blob = await renderer.renderToBlob(doc);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(1000);
  });
});
