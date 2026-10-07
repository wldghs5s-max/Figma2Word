import { describe, it, expect } from "vitest";
import { FigmaParser } from "../src/parser/figmaParser.js";
import { DocxRenderer } from "../src/renderer/docxRenderer.js";
import { simpleDocumentFixture } from "../src/fixtures/samples.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

describe("Determinism Verification (결정론성 검증)", () => {
  it("produces identical InternalDocument IR across multiple consecutive runs", () => {
    const parser = new FigmaParser();

    const run1 = parser.parse(simpleDocumentFixture);
    const run2 = parser.parse(simpleDocumentFixture);
    const run3 = parser.parse(simpleDocumentFixture);

    // Section contents must be 100% identical
    expect(run1.document.sections).toEqual(run2.document.sections);
    expect(run2.document.sections).toEqual(run3.document.sections);

    // Notices and stats must be 100% identical
    expect(run1.notices).toEqual(run2.notices);
    expect(run1.stats).toEqual(run2.stats);
  });

  it("produces structurally deterministic document XML content across multiple runs", async () => {
    const parser = new FigmaParser();
    const renderer = new DocxRenderer();

    const parseResult = parser.parse(simpleDocumentFixture);
    parseResult.document.metadata.convertedAt = "2026-10-07T12:00:00.000Z";

    const buffer1 = await renderer.renderToBuffer(parseResult.document);
    const buffer2 = await renderer.renderToBuffer(parseResult.document);

    // Save temporary docx files to inspect internal document.xml determinism
    const tmpDir = path.join(process.cwd(), "samples/output");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tmp1 = path.join(tmpDir, "det-1.docx");
    const tmp2 = path.join(tmpDir, "det-2.docx");
    fs.writeFileSync(tmp1, buffer1);
    fs.writeFileSync(tmp2, buffer2);

    // Verify via python that document.xml contents match 100% (normalizing auto-incrementing docPr ids)
    const p1 = tmp1.replace(/\\/g, "/");
    const p2 = tmp2.replace(/\\/g, "/");
    const pyCmd = `python -c "import zipfile, re; z1=zipfile.ZipFile('${p1}'); z2=zipfile.ZipFile('${p2}'); x1=re.sub('docPr id=[^ ]+', '', z1.read('word/document.xml').decode('utf-8')); x2=re.sub('docPr id=[^ ]+', '', z2.read('word/document.xml').decode('utf-8')); print('MATCH' if x1 == x2 else 'MISMATCH')"`;
    const result = execSync(pyCmd).toString().trim();
    expect(result).toBe("MATCH");
  });
});

