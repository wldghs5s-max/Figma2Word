import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";

const refFiles = [
  { name: "Report 1 Ref", path: "완성본-20261012/report-1차-진단-편집가능-Word보정-v3.docx" },
  { name: "Report 2 Ref", path: "완성본-20261012/report-2차-경과-편집가능-Word보정-v3.docx" },
  { name: "Report 3 Ref", path: "완성본-20261012/report-3차-성과검증-편집가능-Word보정-v3.docx" },
];

for (const r of refFiles) {
  console.log(`\n=== Inspecting ${r.name} (${r.path}) ===`);
  const zip = new AdmZip(r.path);
  const docXml = zip.readAsText("word/document.xml");
  const appXml = zip.readAsText("docProps/app.xml");

  // Extract page count from app.xml if present
  const pageMatch = appXml.match(/<Pages>(\d+)<\/Pages>/);
  console.log(`App.xml Pages: ${pageMatch ? pageMatch[1] : "Unknown"}`);

  // Count page breaks
  const brCount = (docXml.match(/<w:br\s+w:type="page"\/>/g) || []).length;
  const lastRenderedPageBreakCount = (docXml.match(/<w:lastRenderedPageBreak\/>/g) || []).length;
  console.log(`Explicit Page Breaks (<w:br w:type="page"/>): ${brCount}`);
  console.log(`LastRenderedPageBreaks: ${lastRenderedPageBreakCount}`);

  // Sample texts
  const texts: string[] = [];
  const textMatches = docXml.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g);
  for (const m of textMatches) {
    if (m[1].trim().length > 3) {
      texts.push(m[1].trim());
    }
  }
  console.log(`Total text tokens: ${texts.length}`);
  console.log(`Sample texts (first 8):`);
  for (const t of texts.slice(0, 8)) {
    console.log(`  - "${t}"`);
  }
}
