import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

async function main() {
  const debugDir = path.resolve(process.cwd(), 'debug/phase25-web-ui-fidelity');
  const docxPath = path.join(debugDir, 'pentech_v3_original.docx');
  const jsonPath = path.join(debugDir, 'pentech_v3_original.json');

  console.log('=== 1. DOCX OOXML Inspection ===');
  if (fs.existsSync(docxPath)) {
    const stat = fs.statSync(docxPath);
    console.log(`DOCX File: ${docxPath}`);
    console.log(`File Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB (${stat.size} bytes)`);

    const data = fs.readFileSync(docxPath);
    const zip = await JSZip.loadAsync(data);
    const filenames = Object.keys(zip.files);
    console.log(`Total ZIP Entries: ${filenames.length}`);

    const mediaEntries = filenames.filter((name) => name.startsWith('word/media/'));
    console.log(`Embedded Media count: ${mediaEntries.length}`);

    const docXmlFile = zip.file('word/document.xml');
    if (docXmlFile) {
      const docXml = await docXmlFile.async('text');
      console.log(`word/document.xml size: ${(docXml.length / 1024).toFixed(1)} KB`);

      const vmlShapeCount = (docXml.match(/<v:shape/g) || []).length;
      const vmlRectCount = (docXml.match(/<v:rect/g) || []).length;
      const vmlRoundRectCount = (docXml.match(/<v:roundrect/g) || []).length;
      const vmlOvalCount = (docXml.match(/<v:oval/g) || []).length;
      const totalVmlShapes = vmlShapeCount + vmlRectCount + vmlRoundRectCount + vmlOvalCount;
      const textboxCount = (docXml.match(/<v:textbox/g) || []).length;
      const pageBreakCount = (docXml.match(/<w:br\s+w:type="page"/g) || []).length;
      const sectPrCount = (docXml.match(/<w:sectPr/g) || []).length;
      const tableCount = (docXml.match(/<w:tbl/g) || []).length;
      const paragraphCount = (docXml.match(/<w:p[\s>]/g) || []).length;
      const textRunCount = (docXml.match(/<w:r[\s>]/g) || []).length;

      // Extract section page dimensions
      const pgSzMatches = [...docXml.matchAll(/<w:pgSz\s+([^>]+)\/>/g)];
      console.log(`VML Shapes: ${totalVmlShapes} (shape: ${vmlShapeCount}, rect: ${vmlRectCount}, roundrect: ${vmlRoundRectCount}, oval: ${vmlOvalCount})`);
      console.log(`VML Textboxes: ${textboxCount}`);
      console.log(`Page breaks (<w:br w:type="page"/>): ${pageBreakCount}`);
      console.log(`Section properties (<w:sectPr>): ${sectPrCount}`);
      console.log(`Tables (<w:tbl>): ${tableCount}`);
      console.log(`Paragraphs (<w:p>): ${paragraphCount}`);
      console.log(`Page Sizes in XML (${pgSzMatches.length}):`);
      for (let i = 0; i < Math.min(pgSzMatches.length, 5); i++) {
        console.log(`  [${i + 1}] ${pgSzMatches[i][1]}`);
      }
    }
  } else {
    console.log(`DOCX file not found at ${docxPath}`);
  }

  console.log('\n=== 2. JSON Snapshot Inspection ===');
  if (fs.existsSync(jsonPath)) {
    const stat = fs.statSync(jsonPath);
    console.log(`JSON File: ${jsonPath}`);
    console.log(`File Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB (${stat.size} bytes)`);

    // Stream parse or read JSON
    const content = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(content);

    const isSnapshot = parsed && (parsed.source === 'figma2word' || 'figmaNode' in parsed);
    console.log(`Is FigmaSnapshot: ${isSnapshot}`);
    if (isSnapshot) {
      console.log(`Snapshot Version: ${parsed.version}`);
      console.log(`Source: ${parsed.source}`);
      console.log(`ExportedAt: ${parsed.exportedAt}`);
      console.log(`Metadata:`, parsed.metadata);
      const imgKeys = Object.keys(parsed.imageMap || {});
      console.log(`ImageMap count: ${imgKeys.length}`);
      const rootNode = parsed.figmaNode;
      console.log(`Root Node Type: ${rootNode?.type}, Name: ${rootNode?.name}, ID: ${rootNode?.id}`);
      if (rootNode?.children) {
        console.log(`Root top-level children count: ${rootNode.children.length}`);
        console.log('Top-level children summary:');
        rootNode.children.forEach((child: any, idx: number) => {
          const bbox = child.absoluteBoundingBox;
          const bboxStr = bbox ? `[x:${bbox.x}, y:${bbox.y}, w:${bbox.width}, h:${bbox.height}]` : 'no-bbox';
          console.log(`  [${idx + 1}] "${child.name}" (${child.type}, id:${child.id}) ${bboxStr} children:${child.children?.length ?? 0}`);
        });
      }
    } else {
      console.log(`Root keys: ${Object.keys(parsed).join(', ')}`);
      const doc = parsed.document || parsed;
      console.log(`Document type: ${doc.type}, Name: ${doc.name}`);
      if (doc.children) {
        console.log(`Document children count: ${doc.children.length}`);
      }
    }
  } else {
    console.log(`JSON file not found at ${jsonPath}`);
  }
}

main().catch(console.error);
