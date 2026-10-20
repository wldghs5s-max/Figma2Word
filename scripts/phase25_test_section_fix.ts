import * as fs from 'fs';
import * as path from 'path';
import { FigmaCanvasParser } from '../src/canvas/parser/figmaCanvasParser.js';
import { DocxCanvasRenderer } from '../src/canvas/renderer/docxCanvasRenderer.js';

async function main() {
  const debugDir = path.resolve(process.cwd(), 'debug/phase25-web-ui-fidelity');
  const jsonPath = path.join(debugDir, 'pentech_v3_original.json');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Filter out non-screen guide groups like "📏 Container" from figmaNode.children
  if (raw.figmaNode && Array.isArray(raw.figmaNode.children)) {
    const originalCount = raw.figmaNode.children.length;
    raw.figmaNode.children = raw.figmaNode.children.filter((c: any) => {
      // Exclude measurement container groups that are not design screens
      if (c.name && c.name.includes('Container') && c.type === 'GROUP') {
        console.log(`Filtering out non-screen guide group: "${c.name}" (${c.id})`);
        return false;
      }
      return true;
    });
    console.log(`Top-level nodes filtered from ${originalCount} to ${raw.figmaNode.children.length}`);
  }

  const parser = new FigmaCanvasParser({
    imageMap: raw.imageMap,
    scalePolicy: 'fit-a4',
  });

  const doc = parser.parse(raw);
  console.log(`Parsed CanvasDocument with ${doc.pages.length} pages.`);

  // Custom renderer with SECTION BREAK ON EVERY PAGE
  class FixedDocxRenderer extends DocxCanvasRenderer {
    // Override renderDocumentXml to ensure every page has its own section break
    public renderDocumentXml(
      doc: any,
      imageRelMap: Map<string, string>
    ): string {
      const pageParagraphs: string[] = [];

      for (let pIdx = 0; pIdx < doc.pages.length; pIdx++) {
        const page = doc.pages[pIdx];
        const runsXml: string[] = [];

        const pageWidthPt = page.bounds.width || doc.pageSize.widthPt;
        const pageHeightPt = page.bounds.height || doc.pageSize.heightPt;

        if (page.backgroundColor) {
          runsXml.push(
            (this as any).buildBackgroundRect(
              pIdx,
              page.backgroundColor,
              pageWidthPt,
              pageHeightPt
            )
          );
        }

        for (let eIdx = 0; eIdx < page.elements.length; eIdx++) {
          const elem = page.elements[eIdx];
          const elemXml = (this as any).renderElement(
            pIdx,
            eIdx,
            elem,
            imageRelMap,
            doc.resources
          );
          if (elemXml) {
            runsXml.push(elemXml);
          }
        }

        const ptToTwip = (pt: number) => Math.round(pt * 20);
        const curWidthTwips = ptToTwip(pageWidthPt);
        const curHeightTwips = ptToTwip(pageHeightPt);
        const curIsLandscape = pageWidthPt > pageHeightPt;
        const curOrient = curIsLandscape ? 'landscape' : 'portrait';

        const isLast = pIdx === doc.pages.length - 1;

        let pPrXml = '';
        if (!isLast) {
          // Every non-last page gets a section break to the next page with THIS page's dimensions
          pPrXml = `<w:pPr>
  <w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>
  <w:autoSpaceDE w:val="0"/>
  <w:autoSpaceDN w:val="0"/>
  <w:sectPr>
    <w:type w:val="nextPage"/>
    <w:pgSz w:w="${curWidthTwips}" w:h="${curHeightTwips}" w:orient="${curOrient}"/>
    <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>
  </w:sectPr>
</w:pPr>`;
        } else {
          // Final page paragraph has no sectPr in pPr (it will be at end of body)
          pPrXml = `<w:pPr>
  <w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>
  <w:autoSpaceDE w:val="0"/>
  <w:autoSpaceDN w:val="0"/>
</w:pPr>`;
        }

        pageParagraphs.push(`<w:p>
  ${pPrXml}
  ${runsXml.join('\n  ')}
</w:p>`);
      }

      // Final section properties for the last page at end of body
      const lastPage = doc.pages[doc.pages.length - 1];
      const lastWidthPt = lastPage ? (lastPage.bounds.width || doc.pageSize.widthPt) : doc.pageSize.widthPt;
      const lastHeightPt = lastPage ? (lastPage.bounds.height || doc.pageSize.heightPt) : doc.pageSize.heightPt;
      const ptToTwip = (pt: number) => Math.round(pt * 20);
      const finalWidthTwips = ptToTwip(lastWidthPt);
      const finalHeightTwips = ptToTwip(lastHeightPt);
      const isLandscape = lastWidthPt > lastHeightPt;
      const orient = isLandscape ? 'landscape' : 'portrait';

      const sectPrXml = `<w:sectPr>
  <w:pgSz w:w="${finalWidthTwips}" w:h="${finalHeightTwips}" w:orient="${orient}"/>
  <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>
</w:sectPr>`;

      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${pageParagraphs.join('\n')}
    ${sectPrXml}
  </w:body>
</w:document>`.trim();
    }
  }

  const renderer = new FixedDocxRenderer();
  const buffer = await renderer.renderToBuffer(doc);
  const outDocxPath = path.join(debugDir, 'pentech_fixed_sections.docx');
  fs.writeFileSync(outDocxPath, buffer);
  console.log(`Generated fixed DOCX: ${outDocxPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(console.error);
