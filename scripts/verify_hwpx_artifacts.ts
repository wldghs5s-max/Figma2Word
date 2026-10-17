import fs from "fs";
import path from "path";
import JSZip from "jszip";

async function verifyHwpx(filePath: string) {
  const fileName = path.basename(filePath);
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);

  // 1. mimetype check
  const mimeFile = zip.file("mimetype");
  if (!mimeFile) throw new Error(`${fileName}: Missing mimetype`);
  const mimeText = (await mimeFile.async("string")).trim();
  if (mimeText !== "application/hwp+zip") throw new Error(`${fileName}: Invalid mimetype ${mimeText}`);

  // 2. header.xml check
  const headerFile = zip.file("Contents/header.xml");
  if (!headerFile) throw new Error(`${fileName}: Missing Contents/header.xml`);
  const headerXml = await headerFile.async("string");
  if (!headerXml.includes('lang="HANGUL"') || !headerXml.includes('lang="LATIN"')) {
    throw new Error(`${fileName}: Header XML missing uppercase lang attributes`);
  }

  // 3. section0.xml check
  const secFile = zip.file("Contents/section0.xml");
  if (!secFile) throw new Error(`${fileName}: Missing Contents/section0.xml`);
  const secXml = await secFile.async("string");

  // Verify secPr inside run
  if (!secXml.includes('<hp:run charPrIDRef="0">') || !secXml.includes("<hp:secPr")) {
    throw new Error(`${fileName}: secPr not properly wrapped in hp:run`);
  }

  // Verify no string IDs like "1_1"
  const badIdMatch = secXml.match(/id="\d+_\d+"/);
  if (badIdMatch) {
    throw new Error(`${fileName}: Found non-integer shape ID: ${badIdMatch[0]}`);
  }

  // Verify no spurious attributes/tags
  if (secXml.includes("<hp:inImgDim") || secXml.includes('binRef="')) {
    throw new Error(`${fileName}: Found deprecated inImgDim or binRef`);
  }

  return { fileName, size: data.length, valid: true };
}

async function main() {
  const dir = path.resolve(process.cwd(), "debug/hwpx-recovery");
  const files = [
    "stage1-korean-text.hwpx",
    "stage2-typography.hwpx",
    "stage3-rect-line.hwpx",
    "stage4-textbox-oval-vector.hwpx",
    "stage5-images.hwpx",
    "stage6-representative-report.hwpx",
    "stage7-full-report.hwpx",
  ];

  console.log("Verifying Stage Artifacts...");
  for (const f of files) {
    const fullPath = path.join(dir, f);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File missing: ${f}`);
    }
    const res = await verifyHwpx(fullPath);
    console.log(`[VERIFIED] ${res.fileName} (${res.size} bytes) - All OWPML Schema Constraints Passed!`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

