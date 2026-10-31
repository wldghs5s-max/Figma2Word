import { describe, it, expect } from "vitest";
import { buildObjectTraceability } from "../src/fidelity/objectTraceability.js";
import { CanvasDocument } from "../src/canvas/types.js";

describe("Phase 40.4 — Content Integrity & Fail-Closed Gate Suite", () => {
  const dummySha = "dummy_sha256_phase40_4";

  it("1. Fails verification when a single text node is missing from Word document", () => {
    const rawFigma = {
      id: "0:0",
      children: [
        {
          id: "frame_1",
          type: "FRAME",
          children: [
            {
              id: "text_1",
              type: "TEXT",
              characters: "중요한 고객사 제목 문구",
              visible: true,
            },
          ],
        },
      ],
    };

    const canvasDoc: CanvasDocument = {
      title: "Test",
      pageSize: { widthPt: 595.28, heightPt: 841.89 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "elem_t1",
              sourceNodeId: "text_1",
              type: "text",
              bounds: { x: 10, y: 10, width: 200, height: 30 },
              text: "중요한 고객사 제목 문구",
              style: {},
            },
          ],
        },
      ],
      resources: {},
    };

    // Missing text in Word OpenXML (empty text paragraph)
    const docxXmlMissing = `<w:document><w:body><w:p><w:r><w:pict><v:shape id="s_t1" alt="text_1"><v:textbox><w:txbxContent><w:p><w:r><w:t></w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p></w:body></w:document>`;

    const report = buildObjectTraceability(
      rawFigma,
      ["frame_1"],
      canvasDoc,
      docxXmlMissing,
      dummySha
    );

    expect(report.summary.preservedTextsCount).toBe(0);
    expect(report.summary.textPreservationRate).toBe(0);
    expect(report.summary.traceabilityVerdict).not.toBe("VERIFIED");
    const m = report.mappings.find((x) => x.sourceNodeId === "text_1");
    expect(m?.contentVerified).toBe(false);
    expect(m?.contentState).toBe("CONTENT_UNVERIFIED");
  });

  it("2. Fails verification when the trailing part of a text string is truncated", () => {
    const rawFigma = {
      id: "0:0",
      children: [
        {
          id: "frame_1",
          type: "FRAME",
          children: [
            {
              id: "text_trunc",
              type: "TEXT",
              characters: "한국어 원본 문장의 앞부분과 뒷부분까지 완벽하게 보존되어야 합니다.",
              visible: true,
            },
          ],
        },
      ],
    };

    const canvasDoc: CanvasDocument = {
      title: "Test",
      pageSize: { widthPt: 595.28, heightPt: 841.89 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "elem_trunc",
              sourceNodeId: "text_trunc",
              type: "text",
              bounds: { x: 10, y: 10, width: 300, height: 30 },
              text: "한국어 원본 문장의 앞부분과 뒷부분까지 완벽하게 보존되어야 합니다.",
              style: {},
            },
          ],
        },
      ],
      resources: {},
    };

    // Trailing part truncated in Word OpenXML (only first 15 chars preserved)
    const docxXmlTrunc = `<w:document><w:body><w:p><w:r><w:pict><v:shape id="s_trunc" alt="text_trunc"><v:textbox><w:txbxContent><w:p><w:r><w:t>한국어 원본 문장의 앞부분과</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p></w:body></w:document>`;

    const report = buildObjectTraceability(
      rawFigma,
      ["frame_1"],
      canvasDoc,
      docxXmlTrunc,
      dummySha
    );

    expect(report.summary.traceabilityVerdict).not.toBe("VERIFIED");
    const m = report.mappings.find((x) => x.sourceNodeId === "text_trunc");
    expect(m?.contentVerified).toBe(false);
    expect(m?.contentState).toBe("CONTENT_MISMATCH");
  });

  it("3. Fails verification when a Shape tag is empty with zero geometry/path/styling", () => {
    const rawFigma = {
      id: "0:0",
      children: [
        {
          id: "frame_1",
          type: "FRAME",
          children: [
            {
              id: "vector_empty",
              type: "VECTOR",
              visible: true,
            },
          ],
        },
      ],
    };

    const canvasDoc: CanvasDocument = {
      title: "Test",
      pageSize: { widthPt: 595.28, heightPt: 841.89 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "elem_v_empty",
              sourceNodeId: "vector_empty",
              type: "shape",
              bounds: { x: 10, y: 10, width: 50, height: 50 },
              geometryProvenance: "GEOMETRIC_FALLBACK",
            },
          ],
        },
      ],
      resources: {},
    };

    // Word OpenXML has a shape tag with alt="vector_empty", but completely empty: no path, no fill, no stroke
    const docxXmlEmptyShape = `<w:document><w:body><w:p><w:r><w:pict><v:shape id="s_v_empty" alt="vector_empty"/></w:pict></w:r></w:p></w:body></w:document>`;

    const report = buildObjectTraceability(
      rawFigma,
      ["frame_1"],
      canvasDoc,
      docxXmlEmptyShape,
      dummySha
    );

    expect(report.summary.preservedShapesCount).toBe(0);
    expect(report.summary.shapePreservationRate).toBe(0);
    expect(report.summary.traceabilityVerdict).not.toBe("VERIFIED");
    const m = report.mappings.find((x) => x.sourceNodeId === "vector_empty");
    expect(m?.contentVerified).toBe(false);
    expect(m?.contentState).toBe("CONTENT_UNVERIFIED");
  });

  it("4. Fails verification when an Image has a relationship but media bytes are placeholder or missing", () => {
    const rawFigma = {
      id: "0:0",
      children: [
        {
          id: "frame_1",
          type: "FRAME",
          children: [
            {
              id: "img_broken",
              type: "RECTANGLE",
              visible: true,
              fills: [{ type: "IMAGE", imageRef: "img_ref_1" }],
            },
          ],
        },
      ],
    };

    const canvasDoc: CanvasDocument = {
      title: "Test",
      pageSize: { widthPt: 595.28, heightPt: 841.89 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "elem_img_1",
              sourceNodeId: "img_broken",
              type: "image",
              bounds: { x: 10, y: 10, width: 100, height: 100 },
              imageRef: "img_ref_1",
            },
          ],
        },
      ],
      resources: {},
    };

    const docxXml = `<w:document><w:body><w:p><w:r><w:pict><v:shape id="s_img_1" alt="img_broken"><v:imagedata r:id="rId100"/></v:shape></w:pict></w:r></w:p></w:body></w:document>`;
    const relsXml = `<Relationships><Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image100.png"/></Relationships>`;

    // Media file map has placeholder dummy bytes (size 50 bytes <= 100 or isPlaceholder=true)
    const mediaFilesMap = new Map<string, { size: number; isPlaceholder: boolean; sha256: string }>();
    mediaFilesMap.set("media/image100.png", {
      size: 40,
      isPlaceholder: true,
      sha256: "dummy_placeholder_hash",
    });

    const report = buildObjectTraceability(
      rawFigma,
      ["frame_1"],
      canvasDoc,
      docxXml,
      dummySha,
      {
        docxRelsXml: relsXml,
        mediaFilesMap: mediaFilesMap,
      }
    );

    expect(report.summary.preservedImagesCount).toBe(0);
    expect(report.summary.imagePreservationRate).toBe(0);
    expect(report.summary.traceabilityVerdict).not.toBe("VERIFIED");
    const m = report.mappings.find((x) => x.sourceNodeId === "img_broken");
    expect(m?.contentVerified).toBe(false);
    expect(m?.contentState).toBe("CONTENT_MISMATCH");
  });

  it("5. Successfully VERIFIES authentic document with text, genuine shapes, valid image, and transparent containers", () => {
    const rawFigma = {
      id: "0:0",
      children: [
        {
          id: "frame_1",
          type: "FRAME",
          children: [
            {
              id: "container_wrapper",
              type: "FRAME",
              visible: true,
              children: [
                {
                  id: "text_ok",
                  type: "TEXT",
                  characters: "정상 텍스트",
                  visible: true,
                },
                {
                  id: "rect_ok",
                  type: "RECTANGLE",
                  visible: true,
                },
                {
                  id: "img_ok",
                  type: "RECTANGLE",
                  visible: true,
                  fills: [{ type: "IMAGE", imageRef: "img_ok_ref" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const canvasDoc: CanvasDocument = {
      title: "Test",
      pageSize: { widthPt: 595.28, heightPt: 841.89 },
      pages: [
        {
          pageNumber: 1,
          bounds: { x: 0, y: 0, width: 595.28, height: 841.89 },
          elements: [
            {
              id: "elem_t_ok",
              sourceNodeId: "text_ok",
              type: "text",
              bounds: { x: 10, y: 10, width: 100, height: 20 },
              text: "정상 텍스트",
              style: {},
            },
            {
              id: "elem_r_ok",
              sourceNodeId: "rect_ok",
              type: "card",
              bounds: { x: 10, y: 40, width: 100, height: 50 },
              geometryProvenance: "PRIMITIVE_SHAPE",
            },
            {
              id: "elem_i_ok",
              sourceNodeId: "img_ok",
              type: "image",
              bounds: { x: 10, y: 100, width: 100, height: 80 },
              imageRef: "img_ok_ref",
            },
          ],
        },
      ],
      resources: {},
    };

    const docxXml = `
<w:document>
  <w:body>
    <w:p>
      <w:r>
        <w:pict>
          <v:shape id="s_t_ok" alt="text_ok"><v:textbox><w:txbxContent><w:p><w:r><w:t>정상 텍스트</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape>
          <v:rect id="s_r_ok" alt="rect_ok" fillcolor="#ffffff"/>
          <v:shape id="s_i_ok" alt="img_ok"><v:imagedata r:id="rId200"/></v:shape>
        </w:pict>
      </w:r>
    </w:p>
  </w:body>
</w:document>
    `;

    const relsXml = `<Relationships><Relationship Id="rId200" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image200.png"/></Relationships>`;
    const mediaFilesMap = new Map<string, { size: number; isPlaceholder: boolean; sha256: string }>();
    mediaFilesMap.set("media/image200.png", {
      size: 5120,
      isPlaceholder: false,
      sha256: "real_media_hash",
    });

    const report = buildObjectTraceability(
      rawFigma,
      ["frame_1"],
      canvasDoc,
      docxXml,
      dummySha,
      {
        docxRelsXml: relsXml,
        mediaFilesMap: mediaFilesMap,
      }
    );

    expect(report.summary.sourceTextsCount).toBe(1);
    expect(report.summary.preservedTextsCount).toBe(1);
    expect(report.summary.sourceShapesCount).toBe(1);
    expect(report.summary.preservedShapesCount).toBe(1);
    expect(report.summary.sourceImagesCount).toBe(1);
    expect(report.summary.preservedImagesCount).toBe(1);
    expect(report.summary.intentionallyOmittedCount).toBe(1);
    expect(report.summary.traceabilityVerdict).toBe("VERIFIED");

    expect(report.summary.contentStateBreakdown?.contentVerifiedCount).toBe(3);
    expect(report.summary.contentStateBreakdown?.intentionalOmissionCount).toBe(1);
  });
});

