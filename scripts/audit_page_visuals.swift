import Foundation
import AppKit

let pagesDir = "/Users/mac/projects/Figma2Word/Figma2Word/debug/phase32-benchmark/pages"

for i in 1...17 {
    let filename = String(format: "page-%03d.png", i)
    let path = "\(pagesDir)/\(filename)"
    guard let img = NSImage(contentsOfFile: path),
          let rep = img.representations.first as? NSBitmapImageRep else {
        print("Page \(i): Cannot load image")
        continue
    }

    let w = rep.pixelsWide
    let h = rep.pixelsHigh

    // Sample pixels across page to detect background and content presence
    var nonWhiteCount = 0
    var darkTextCount = 0
    var colorPixels = 0

    // Downsampled sampling (every 4th pixel for speed)
    let step = 4
    for y in stride(from: 0, to: h, by: step) {
        for x in stride(from: 0, to: w, by: step) {
            guard let c = rep.colorAt(x: x, y: y) else { continue }
            let r = c.redComponent
            let g = c.greenComponent
            let b = c.blueComponent

            if r < 0.98 || g < 0.98 || b < 0.98 {
                nonWhiteCount += 1
            }
            if r < 0.3 && g < 0.3 && b < 0.3 {
                darkTextCount += 1
            }
            if abs(r - g) > 0.1 || abs(g - b) > 0.1 {
                colorPixels += 1
            }
        }
    }

    let totalSamples = (w / step) * (h / step)
    let nonWhitePct = Double(nonWhiteCount) / Double(totalSamples) * 100.0
    let darkTextPct = Double(darkTextCount) / Double(totalSamples) * 100.0
    let colorPct = Double(colorPixels) / Double(totalSamples) * 100.0

    print(String(format: "Page %2d (%4d x %4d px): Content=%.1f%%, DarkText=%.2f%%, Color=%.1f%%",
                 i, w, h, nonWhitePct, darkTextPct, colorPct))
}
