# 02. PNG Data Integrity & Decompression Analysis (Audit A1)

## 1. Problem Statement & Baseline Discovery

In Phase 30, `scripts/generate_phase30_synthetic_fixture.ts` defined:
```typescript
const BLUE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/AwMDEwMDAwAAAAAUAAXeN9fQAAAAASUVORK5CYII=';
```
While this 77-byte binary string possessed a valid PNG signature (`89 50 4E 47 0D 0A 1A 0A`) and IHDR chunk ($2 \times 2$ px, RGBA 8-bit), decompression and decoding revealed critical data corruption.

---

## 2. Low-Level Chunk Breakdown & Decompression Failure

Byte-level inspection of the 77-byte stream:
```
Offset 00: 89 50 4E 47 0D 0A 1A 0A -> Signature (Valid)
Offset 08: 00 00 00 0D 49 48 44 52 -> Chunk IHDR (13 bytes)
Offset 16: 00 00 00 02 00 00 00 02 08 06 00 00 00 -> 2x2 px, bitDepth=8, colorType=6 (RGBA)
Offset 29: 72 B6 0D 24             -> IHDR CRC (Valid)
Offset 33: 00 00 00 14 49 44 41 54 -> Chunk IDAT (20 bytes)
Offset 41: 78 DA 63 64 F8 CF C0 C0 C0 C4 C0 C0 C0 C0 00 00 00 05 00 01 -> Deflate Payload
Offset 61: 77 8D F5 F4             -> IDAT CRC (Valid)
Offset 65: 00 00 00 00 49 45 4E 44 -> Chunk IEND
Offset 73: AE 42 60 82             -> IEND CRC (Valid)
```

### The Root Cause of Corruption
1. **Adler-32 Checksum Mismatch**:
   Executing standard zlib decompression on the IDAT payload:
   ```javascript
   zlib.inflateSync(idatData); // Error: incorrect data check
   ```
2. **Scanline Truncation**:
   A $2 \times 2$ RGBA image requires:
   $$\text{Scanline Length} = 1\text{ (filter byte)} + 2 \times 4\text{ (RGBA)} = 9\text{ bytes}$$
   $$\text{Total Uncompressed Size} = 9 \times 2 = 18\text{ bytes}$$
   Using raw deflate (`zlib.inflateRawSync`), the payload yielded only **12 bytes** (`01 00 ff 00 00 00 02 00 00 00 00 00`), truncating the second row entirely.
3. **Decoded Pixel Values**:
   When passed to macOS CoreGraphics / NSImage, the decoder recovered gracefully by padding missing pixels with zeroes:
   ```swift
   let rep = img.representations.first as! NSBitmapImageRep
   rep.colorAt(x: 0, y: 0) // NSCalibratedRGBColorSpace 0 0 0 0 (Alpha = 0, Fully Transparent)
   ```

---

## 3. The Visual Domino Effect

Because the input PNG was rendered as 100% transparent:
1. The card had `filled="f"` in VML, meaning no background fill was painted.
2. The page background (`#F5F7FA`, light gray) showed through the transparent image.
3. The white overlay text (`#FFFFFF`) sat directly on top of the light gray page background.
4. Without the solid blue card behind it, the white text lost all contrast and appeared visually absent.

---

## 4. Resolution & Programmatic Generator

Rather than relying on fragile manual base64 strings, Phase 31 implements a programmatic solid PNG generator with guaranteed Adler-32 and CRC32 conformance:

```typescript
function createSolidPng(width: number, height: number, r: number, g: number, b: number, a: number = 255): Buffer {
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }
  const compressed = zlib.deflateSync(rawData);
  // Constructs valid IHDR, IDAT, IEND chunks with exact CRC32
  ...
}
```

- Verified Blue PNG Base64: `iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGNQTX79H4QZYAwAUe4JyX4GS0cAAAAASUVORK5CYII=`
- Decoded Color: `NSCalibratedRGBColorSpace 0.145098 0.388235 0.921569 1.0` (`#2563EB`, fully opaque).
- Verified by automated unit test in `tests/phase31-audit-verification.test.ts` (Tests 1 & 2).
