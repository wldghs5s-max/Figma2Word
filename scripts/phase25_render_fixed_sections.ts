import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const debugDir = path.resolve(process.cwd(), 'debug/phase25-web-ui-fidelity');
const fixedDocx = '/Users/mac/Downloads/pentech_prod_fixed.docx';
const fixedPdf = '/Users/mac/Downloads/pentech_prod_fixed.pdf';
const outDir = path.join(debugDir, 'prod_fixed_pages');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('1. Exporting DOCX to PDF via Word AppleScript...');
const appleScript = `
with timeout of 600 seconds
    tell application "Microsoft Word"
        open posix file "${fixedDocx}"
        repeat 30 times
            if (count of documents) > 0 then exit repeat
            delay 1
        end repeat
        delay 5
        save as document (its name of front document) file name "${fixedPdf}" file format format PDF
        try
            close active document saving no
        end try
    end tell
end timeout
`;

fs.writeFileSync(path.join(debugDir, 'export_fixed.scpt'), appleScript);
execSync(`osascript "${path.join(debugDir, 'export_fixed.scpt')}"`);
console.log('PDF exported successfully!');

console.log('2. Rendering PDF pages to PNG using Swift...');
const swiftCode = `
import Foundation
import PDFKit
import AppKit

let pdfPath = "${fixedPdf}"
let outDir = "${outDir}"
let doc = PDFDocument(url: URL(fileURLWithPath: pdfPath))!
print("Total PDF pages: \\(doc.pageCount)")
for i in 0..<doc.pageCount {
    let page = doc.page(at: i)!
    let box = page.bounds(for: .mediaBox)
    let scale: CGFloat = 1.5
    let size = NSSize(width: box.width * scale, height: box.height * scale)
    let image = page.thumbnail(of: size, for: .mediaBox)
    if let tiff = image.tiffRepresentation,
       let rep = NSBitmapImageRep(data: tiff),
       let png = rep.representation(using: .png, properties: [:]) {
        let outPath = "\\(outDir)/fixed_page_\\(i + 1).png"
        try! png.write(to: URL(fileURLWithPath: outPath))
        print("Rendered fixed_page_\\(i + 1): \\(size.width)x\\(size.height)")
    }
}
`;
fs.writeFileSync(path.join(debugDir, 'render_fixed.swift'), swiftCode);
execSync(`swift "${path.join(debugDir, 'render_fixed.swift')}"`);
console.log('Rendered all fixed pages successfully!');
