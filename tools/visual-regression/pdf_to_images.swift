import Foundation
import PDFKit
import AppKit
import CryptoKit

struct PageMeta: Codable {
    let pageNumber: Int
    let pngPath: String
    let widthPt: Double
    let heightPt: Double
    let widthPx: Int
    let heightPx: Int
    let sha256: String
}

struct RenderResult: Codable {
    let success: Bool
    let totalPages: Int
    let pages: [PageMeta]
    let error: String?
}

let args = CommandLine.arguments
if args.count < 3 {
    let res = RenderResult(success: false, totalPages: 0, pages: [], error: "Usage: swift pdf_to_images.swift <pdfPath> <outDir> [scale]")
    let data = try! JSONEncoder().encode(res)
    print(String(data: data, encoding: .utf8)!)
    exit(1)
}

let pdfPath = args[1]
let outDir = args[2]
let scale: CGFloat = args.count >= 4 ? CGFloat(Double(args[3]) ?? 1.5) : 1.5

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true, attributes: nil)

guard let doc = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
    let res = RenderResult(success: false, totalPages: 0, pages: [], error: "Failed to open PDF at \(pdfPath)")
    let data = try! JSONEncoder().encode(res)
    print(String(data: data, encoding: .utf8)!)
    exit(1)
}

var pageMetas: [PageMeta] = []

for i in 0..<doc.pageCount {
    let pageNum = i + 1
    guard let page = doc.page(at: i) else { continue }
    let box = page.bounds(for: .mediaBox)
    let pixelWidth = Int(round(box.width * scale))
    let pixelHeight = Int(round(box.height * scale))
    let size = NSSize(width: pixelWidth, height: pixelHeight)
    
    let thumb = page.thumbnail(of: size, for: .mediaBox)
    guard let tiff = thumb.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let pngData = rep.representation(using: .png, properties: [:]) else {
        continue
    }
    
    let filename = String(format: "page-%03d.png", pageNum)
    let outPath = (outDir as NSString).appendingPathComponent(filename)
    try? pngData.write(to: URL(fileURLWithPath: outPath))
    
    let digest = SHA256.hash(data: pngData)
    let hashString = digest.compactMap { String(format: "%02x", $0) }.joined()
    
    pageMetas.append(PageMeta(
        pageNumber: pageNum,
        pngPath: outPath,
        widthPt: Double(box.width),
        heightPt: Double(box.height),
        widthPx: pixelWidth,
        heightPx: pixelHeight,
        sha256: hashString
    ))
}

let result = RenderResult(
    success: true,
    totalPages: doc.pageCount,
    pages: pageMetas,
    error: nil
)

let encoder = JSONEncoder()
encoder.outputFormatting = .prettyPrinted
if let data = try? encoder.encode(result), let str = String(data: data, encoding: .utf8) {
    print(str)
}
