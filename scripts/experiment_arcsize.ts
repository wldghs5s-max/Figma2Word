import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import {
  openTargetDocumentSafely,
  exportTargetDocToPdfOnly,
  closeTargetDocOnly,
  safeCleanupIsolatedDirectory,
  captureWordState,
} from '../tools/visual-regression/safe_word_automation.js';

// Three separate pages so shapes never overlap
function buildDocxXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:w10="urn:schemas-microsoft-com:office:word"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <!-- Page 1: arcsize = 0.100 -->
    <w:p>
      <w:r>
        <w:pict>
          <v:roundrect id="shape1" arcsize="0.100" style="position:absolute;margin-left:50pt;margin-top:50pt;width:200pt;height:100pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;" filled="t" fillcolor="#2563EB" stroked="f"/>
        </w:pict>
      </w:r>
    </w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>

    <!-- Page 2: arcsize = 0.250 -->
    <w:p>
      <w:r>
        <w:pict>
          <v:roundrect id="shape2" arcsize="0.250" style="position:absolute;margin-left:50pt;margin-top:50pt;width:200pt;height:100pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;" filled="t" fillcolor="#2563EB" stroked="f"/>
        </w:pict>
      </w:r>
    </w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>

    <!-- Page 3: arcsize = 0.500 -->
    <w:p>
      <w:r>
        <w:pict>
          <v:roundrect id="shape3" arcsize="0.500" style="position:absolute;margin-left:50pt;margin-top:50pt;width:200pt;height:100pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;" filled="t" fillcolor="#2563EB" stroked="f"/>
        </w:pict>
      </w:r>
    </w:p>

    <w:sectPr>
      <w:pgSz w:w="8640" w:h="11520" w:orient="portrait"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

async function run() {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`
  );

  zip.file('word/document.xml', buildDocxXml());

  const outDocx = path.resolve('debug/test_arcsize.docx');
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outDocx, buf);

  const snapshot = captureWordState();
  const handle = await openTargetDocumentSafely(outDocx, snapshot);

  const outPdf = path.resolve('debug/test_arcsize.pdf');
  exportTargetDocToPdfOnly(handle, outPdf);

  closeTargetDocOnly(handle);
  safeCleanupIsolatedDirectory(handle);
  console.log('PDF exported successfully across 3 pages.');
}

run().catch(console.error);
