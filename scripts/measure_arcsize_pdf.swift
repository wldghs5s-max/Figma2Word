import Foundation
import PDFKit
import CoreGraphics
import AppKit

let pdfPath = "/Users/mac/projects/Figma2Word/Figma2Word/debug/test_arcsize.pdf"
guard let doc = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
    print("Failed to open PDF")
    exit(1)
}

print("PDF Page Count: \(doc.pageCount)")

let scale: CGFloat = 2.0
let colorSpace = CGColorSpaceCreateDeviceRGB()

let testCases: [(pageIdx: Int, name: String, arcsize: Double)] = [
    (0, "Shape 1 (arcsize=0.100)", 0.100),
    (1, "Shape 2 (arcsize=0.250)", 0.250),
    (2, "Shape 3 (arcsize=0.500)", 0.500)
]

for test in testCases {
    guard let page = doc.page(at: test.pageIdx) else { continue }
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

    guard let cgImage = context.makeImage(),
          let data = cgImage.dataProvider?.data,
          let ptr = CFDataGetBytePtr(data) else { continue }

    func isBlue(_ x: Int, _ y: Int) -> Bool {
        if x < 0 || x >= width || y < 0 || y >= height { return false }
        let offset = (y * width + x) * 4
        let r = ptr[offset]
        let b = ptr[offset+2]
        return b > 180 && r < 100
    }

    // Find bounding box
    var minX: Int?
    var maxX: Int?
    var minY: Int?
    var maxY: Int?

    for y in 0..<height {
        for x in 0..<width {
            if isBlue(x, y) {
                if minX == nil || x < minX! { minX = x }
                if maxX == nil || x > maxX! { maxX = x }
                if minY == nil || y < minY! { minY = y }
                if maxY == nil || y > maxY! { maxY = y }
            }
        }
    }

    guard let slx = minX, let srx = maxX, let sty = minY, let sby = maxY else {
        print("Page \(test.pageIdx): No shape found")
        continue
    }

    let shapeW_pt = Double(srx - slx + 1) / Double(scale)
    let shapeH_pt = Double(sby - sty + 1) / Double(scale)

    print("\n==========================================")
    print("Page \(test.pageIdx + 1): \(test.name)")
    print("Rendered Dimensions: \(shapeW_pt) pt x \(shapeH_pt) pt (\(srx - slx + 1) x \(sby - sty + 1) px)")

    // Measure top edge straight span: at y = sty, how many pixels are blue?
    var topEdgeStart: Int?
    var topEdgeEnd: Int?
    for x in slx...srx {
        if isBlue(x, sty) {
            if topEdgeStart == nil { topEdgeStart = x }
            topEdgeEnd = x
        }
    }
    let topStraightSpan_px = (topEdgeEnd != nil && topEdgeStart != nil) ? (topEdgeEnd! - topEdgeStart! + 1) : 0
    let topCornerInset_px = (topEdgeStart != nil) ? (topEdgeStart! - slx) : 0
    let topCornerInset_pt = Double(topCornerInset_px) / Double(scale)

    // Measure right edge straight span: at x = srx, how many pixels are blue?
    var rightEdgeStart: Int?
    var rightEdgeEnd: Int?
    for y in sty...sby {
        if isBlue(srx, y) {
            if rightEdgeStart == nil { rightEdgeStart = y }
            rightEdgeEnd = y
        }
    }
    let rightStraightSpan_px = (rightEdgeEnd != nil && rightEdgeStart != nil) ? (rightEdgeEnd! - rightEdgeStart! + 1) : 0
    let rightCornerInset_px = (rightEdgeStart != nil) ? (rightEdgeStart! - sty) : 0
    let rightCornerInset_pt = Double(rightCornerInset_px) / Double(scale)

    print("Top edge corner inset: \(topCornerInset_pt) pt (straight span: \(Double(topStraightSpan_px)/Double(scale)) pt)")
    print("Right edge corner inset: \(rightCornerInset_pt) pt (straight span: \(Double(rightStraightSpan_px)/Double(scale)) pt)")

    // Find where the left profile reaches minimum X (where curvature ends vertically)
    // Scan down from sty to sby at x = slx to slx + 50pt:
    var cornerRadiusY_pt: Double = 0
    for dy in 0...(sby - sty)/2 {
        let y = sty + dy
        var firstX = slx
        for x in slx...srx {
            if isBlue(x, y) {
                firstX = x
                break
            }
        }
        if firstX == slx {
            // First time it touches the extreme left wall!
            cornerRadiusY_pt = Double(dy) / Double(scale)
            break
        }
    }

    print("Measured Corner Radius (vertical tangent point): \(cornerRadiusY_pt) pt")
    print("Theoretical R if formula is R = arcsize * minDim: \(test.arcsize * shapeH_pt) pt")
    print("Theoretical R if formula is R = arcsize * (minDim/2): \(test.arcsize * (shapeH_pt / 2.0)) pt")
    print("Empirical match: |measured - (arcsize*H)| = \(abs(cornerRadiusY_pt - test.arcsize * shapeH_pt)) pt")
}
