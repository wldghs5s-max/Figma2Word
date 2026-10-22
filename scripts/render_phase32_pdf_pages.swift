import Foundation
import PDFKit
import CoreGraphics
import AppKit

let pdfPath = "/Users/mac/projects/Figma2Word/Figma2Word/debug/phase32-benchmark/phase32_rendered.pdf"
let outDir = "/Users/mac/projects/Figma2Word/Figma2Word/debug/phase32-benchmark/pages"

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

guard let doc = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
    print("Failed to open PDF")
    exit(1)
}

print("Rendering \(doc.pageCount) pages to PNGs...")
let scale: CGFloat = 1.5 // 108 DPI for crisp text inspection without excessive memory
let colorSpace = CGColorSpaceCreateDeviceRGB()

for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let width = Int(bounds.width * scale)
    let height = Int(bounds.height * scale)

    guard let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { continue }

    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.saveGState()
    context.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: context)
    context.restoreGState()

    if let cgImage = context.makeImage() {
        let rep = NSBitmapImageRep(cgImage: cgImage)
        if let pngData = rep.representation(using: .png, properties: [:]) {
            let outPath = "\(outDir)/page-\(String(format: "%03d", i + 1)).png"
            try? pngData.write(to: URL(fileURLWithPath: outPath))
            print("  Rendered Page \(i + 1): \(width) x \(height) px -> \(outPath)")
        }
    }
}
print("Done rendering all pages.")
