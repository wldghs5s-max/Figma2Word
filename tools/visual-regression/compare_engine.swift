import Foundation
import AppKit
import CoreGraphics

struct CompareResult: Codable {
    let success: Bool
    let image1Path: String
    let image2Path: String
    let width1: Int
    let height1: Int
    let width2: Int
    let height2: Int
    let evaluatedPixels: Int
    let mismatchPixels: Int
    let mismatchRatio: Double
    let mae: Double
    let globalSsim: Double
    let localWindowSsim: Double
    let worstLocalSsim: Double
    let edgeDiff: Double
    let diffImagePath: String?
    let error: String?
}

let args = CommandLine.arguments
if args.count < 3 {
    let res = CompareResult(
        success: false, image1Path: "", image2Path: "",
        width1: 0, height1: 0, width2: 0, height2: 0,
        evaluatedPixels: 0, mismatchPixels: 0, mismatchRatio: 1.0,
        mae: 255.0, globalSsim: 0.0, localWindowSsim: 0.0, worstLocalSsim: 0.0, edgeDiff: 255.0,
        diffImagePath: nil,
        error: "Usage: swift compare_engine.swift <img1> <img2> [diffOut] [tolerance]"
    )
    let d = try! JSONEncoder().encode(res)
    print(String(data: d, encoding: .utf8)!)
    exit(1)
}

let path1 = args[1]
let path2 = args[2]
let diffPath = args.count >= 4 && !args[3].isEmpty ? args[3] : nil
let tolerance: Double = args.count >= 5 ? (Double(args[4]) ?? 10.0) : 10.0

guard let img1 = NSImage(contentsOfFile: path1),
      let img2 = NSImage(contentsOfFile: path2) else {
    let res = CompareResult(
        success: false, image1Path: path1, image2Path: path2,
        width1: 0, height1: 0, width2: 0, height2: 0,
        evaluatedPixels: 0, mismatchPixels: 0, mismatchRatio: 1.0,
        mae: 255.0, globalSsim: 0.0, localWindowSsim: 0.0, worstLocalSsim: 0.0, edgeDiff: 255.0,
        diffImagePath: nil,
        error: "Failed to load input images."
    )
    let d = try! JSONEncoder().encode(res)
    print(String(data: d, encoding: .utf8)!)
    exit(1)
}

guard let cg1 = img1.cgImage(forProposedRect: nil, context: nil, hints: nil),
      let cg2 = img2.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    let res = CompareResult(
        success: false, image1Path: path1, image2Path: path2,
        width1: 0, height1: 0, width2: 0, height2: 0,
        evaluatedPixels: 0, mismatchPixels: 0, mismatchRatio: 1.0,
        mae: 255.0, globalSsim: 0.0, localWindowSsim: 0.0, worstLocalSsim: 0.0, edgeDiff: 255.0,
        diffImagePath: nil,
        error: "Failed to create CGImage."
    )
    let d = try! JSONEncoder().encode(res)
    print(String(data: d, encoding: .utf8)!)
    exit(1)
}

let w1 = cg1.width
let h1 = cg1.height
let w2 = cg2.width
let h2 = cg2.height

let evalW = min(w1, w2)
let evalH = min(h1, h2)
let totalPixels = evalW * evalH

guard totalPixels > 0 else {
    let res = CompareResult(
        success: false, image1Path: path1, image2Path: path2,
        width1: w1, height1: h1, width2: w2, height2: h2,
        evaluatedPixels: 0, mismatchPixels: 0, mismatchRatio: 1.0,
        mae: 255.0, globalSsim: 0.0, localWindowSsim: 0.0, worstLocalSsim: 0.0, edgeDiff: 255.0,
        diffImagePath: nil,
        error: "Zero comparison area."
    )
    let d = try! JSONEncoder().encode(res)
    print(String(data: d, encoding: .utf8)!)
    exit(1)
}

let bytesPerPixel = 4
let bytesPerRow = evalW * bytesPerPixel
let colorSpace = CGColorSpaceCreateDeviceRGB()
let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue

guard let ctx1 = CGContext(data: nil, width: evalW, height: evalH, bitsPerComponent: 8, bytesPerRow: bytesPerRow, space: colorSpace, bitmapInfo: bitmapInfo),
      let ctx2 = CGContext(data: nil, width: evalW, height: evalH, bitsPerComponent: 8, bytesPerRow: bytesPerRow, space: colorSpace, bitmapInfo: bitmapInfo) else {
    exit(1)
}

ctx1.draw(cg1, in: CGRect(x: 0, y: 0, width: evalW, height: evalH))
ctx2.draw(cg2, in: CGRect(x: 0, y: 0, width: evalW, height: evalH))

guard let ptr1 = ctx1.data?.assumingMemoryBound(to: UInt8.self),
      let ptr2 = ctx2.data?.assumingMemoryBound(to: UInt8.self) else {
    exit(1)
}

var diffData: [UInt8] = []
if diffPath != nil {
    diffData = [UInt8](repeating: 255, count: totalPixels * bytesPerPixel)
}

var totalAbsDiff: Double = 0
var mismatchCount = 0

// Luminance grid for Local Window SSIM and Edge detection
var lum1 = [Double](repeating: 0, count: totalPixels)
var lum2 = [Double](repeating: 0, count: totalPixels)

var sum1: Double = 0
var sum2: Double = 0
var sumSq1: Double = 0
var sumSq2: Double = 0
var sumProd: Double = 0

for i in 0..<totalPixels {
    let offset = i * bytesPerPixel
    let r1 = Double(ptr1[offset])
    let g1 = Double(ptr1[offset + 1])
    let b1 = Double(ptr1[offset + 2])
    
    let r2 = Double(ptr2[offset])
    let g2 = Double(ptr2[offset + 1])
    let b2 = Double(ptr2[offset + 2])
    
    let y1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1
    let y2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2
    lum1[i] = y1
    lum2[i] = y2
    
    sum1 += y1
    sum2 += y2
    sumSq1 += y1 * y1
    sumSq2 += y2 * y2
    sumProd += y1 * y2
    
    let diffR = abs(r1 - r2)
    let diffG = abs(g1 - g2)
    let diffB = abs(b1 - b2)
    let maxDiff = max(diffR, max(diffG, diffB))
    let pixelDiff = (diffR + diffG + diffB) / 3.0
    totalAbsDiff += pixelDiff
    
    let isMismatch = maxDiff > tolerance
    if isMismatch {
        mismatchCount += 1
    }
    
    if diffPath != nil {
        if isMismatch {
            diffData[offset] = 255
            diffData[offset + 1] = UInt8(max(0, 255 - Int(pixelDiff * 2)))
            diffData[offset + 2] = UInt8(max(0, 255 - Int(pixelDiff * 2)))
            diffData[offset + 3] = 255
        } else {
            let muted = UInt8(round(y1 * 0.7 + 76))
            diffData[offset] = muted
            diffData[offset + 1] = muted
            diffData[offset + 2] = muted
            diffData[offset + 3] = 255
        }
    }
}

let n = Double(totalPixels)
let mae = totalAbsDiff / n
let mismatchRatio = Double(mismatchCount) / n

// 1. Global SSIM
let c1: Double = (0.01 * 255) * (0.01 * 255)
let c2: Double = (0.03 * 255) * (0.03 * 255)

let mu1 = sum1 / n
let mu2 = sum2 / n
let sigmaSq1 = max(0, (sumSq1 / n) - (mu1 * mu1))
let sigmaSq2 = max(0, (sumSq2 / n) - (mu2 * mu2))
let sigma12 = (sumProd / n) - (mu1 * mu2)

var globalSsim = ((2 * mu1 * mu2 + c1) * (2 * sigma12 + c2)) / ((mu1 * mu1 + mu2 * mu2 + c1) * (sigmaSq1 + sigmaSq2 + c2))
if globalSsim.isNaN || globalSsim < 0 { globalSsim = 0.0 }
if globalSsim > 1.0 { globalSsim = 1.0 }

// 2. Local Window SSIM (8x8 sliding blocks)
let blockSize = 8
let blocksX = evalW / blockSize
let blocksY = evalH / blockSize
var localSsimSum: Double = 0
var worstLocalSsim: Double = 1.0
var totalBlocks = 0

if blocksX > 0 && blocksY > 0 {
    for by in 0..<blocksY {
        for bx in 0..<blocksX {
            var bSum1: Double = 0
            var bSum2: Double = 0
            var bSumSq1: Double = 0
            var bSumSq2: Double = 0
            var bSumProd: Double = 0
            let bN = Double(blockSize * blockSize)
            
            for ly in 0..<blockSize {
                let py = by * blockSize + ly
                let rowOffset = py * evalW
                for lx in 0..<blockSize {
                    let px = bx * blockSize + lx
                    let idx = rowOffset + px
                    let v1 = lum1[idx]
                    let v2 = lum2[idx]
                    bSum1 += v1
                    bSum2 += v2
                    bSumSq1 += v1 * v1
                    bSumSq2 += v2 * v2
                    bSumProd += v1 * v2
                }
            }
            
            let bMu1 = bSum1 / bN
            let bMu2 = bSum2 / bN
            let bSigSq1 = max(0, (bSumSq1 / bN) - (bMu1 * bMu1))
            let bSigSq2 = max(0, (bSumSq2 / bN) - (bMu2 * bMu2))
            let bSig12 = (bSumProd / bN) - (bMu1 * bMu2)
            
            var bSsim = ((2 * bMu1 * bMu2 + c1) * (2 * bSig12 + c2)) / ((bMu1 * bMu1 + bMu2 * bMu2 + c1) * (bSigSq1 + bSigSq2 + c2))
            if bSsim.isNaN || bSsim < 0 { bSsim = 0.0 }
            if bSsim > 1.0 { bSsim = 1.0 }
            
            localSsimSum += bSsim
            if bSsim < worstLocalSsim {
                worstLocalSsim = bSsim
            }
            totalBlocks += 1
        }
    }
}

let localWindowSsim = totalBlocks > 0 ? (localSsimSum / Double(totalBlocks)) : globalSsim

// 3. Edge Difference (Horizontal & Vertical simple gradient difference)
var edgeDiffSum: Double = 0
var edgePixelCount = 0
for y in 0..<(evalH - 1) {
    let row = y * evalW
    let nextRow = (y + 1) * evalW
    for x in 0..<(evalW - 1) {
        let idx = row + x
        let grad1 = abs(lum1[idx + 1] - lum1[idx]) + abs(lum1[nextRow + x] - lum1[idx])
        let grad2 = abs(lum2[idx + 1] - lum2[idx]) + abs(lum2[nextRow + x] - lum2[idx])
        edgeDiffSum += abs(grad1 - grad2)
        edgePixelCount += 1
    }
}
let edgeDiff = edgePixelCount > 0 ? (edgeDiffSum / Double(edgePixelCount)) : 0.0

if let dp = diffPath {
    diffData.withUnsafeMutableBytes { rawBuf in
        if let basePtr = rawBuf.baseAddress {
            if let diffCtx = CGContext(data: basePtr, width: evalW, height: evalH, bitsPerComponent: 8, bytesPerRow: bytesPerRow, space: colorSpace, bitmapInfo: bitmapInfo),
               let diffCg = diffCtx.makeImage() {
                let rep = NSBitmapImageRep(cgImage: diffCg)
                if let png = rep.representation(using: .png, properties: [:]) {
                    try? png.write(to: URL(fileURLWithPath: dp))
                }
            }
        }
    }
}

let result = CompareResult(
    success: true,
    image1Path: path1,
    image2Path: path2,
    width1: w1,
    height1: h1,
    width2: w2,
    height2: h2,
    evaluatedPixels: totalPixels,
    mismatchPixels: mismatchCount,
    mismatchRatio: (mismatchRatio * 10000).rounded() / 10000,
    mae: (mae * 100).rounded() / 100,
    globalSsim: (globalSsim * 10000).rounded() / 10000,
    localWindowSsim: (localWindowSsim * 10000).rounded() / 10000,
    worstLocalSsim: (worstLocalSsim * 10000).rounded() / 10000,
    edgeDiff: (edgeDiff * 100).rounded() / 100,
    diffImagePath: diffPath,
    error: nil
)

let enc = JSONEncoder()
enc.outputFormatting = .prettyPrinted
if let d = try? enc.encode(result), let str = String(data: d, encoding: .utf8) {
    print(str)
}
