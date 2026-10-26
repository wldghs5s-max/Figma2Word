# Report 04: Binary PNG Format & Payload Anti-Poisoning

## 1. Overview
Figma reference capture processes images from external CDN endpoints. If an HTTP 403 Forbidden, 429 Too Many Requests, or HTML maintenance page is returned with an HTTP 200 or saved unchecked, non-image data would corrupt the visual regression engine.

To prevent this, `src/cache/pngValidator.ts` was implemented to parse the binary structure of PNG buffers before saving to disk.

---

## 2. Technical Validation Rules
[`validatePngBuffer`](file:///Users/mac/projects/Figma2Word/Figma2Word/src/cache/pngValidator.ts#L33) enforces the standard ISO/IEC 15948:2004 (PNG) specification:

1. **Minimum Length Check**: A valid PNG cannot be shorter than 29 bytes (8-byte signature + 13-byte IHDR + 8-byte IEND).
2. **Text Payload Rejection**:
   - Rejects buffers starting with `<!DOCTYPE`, `<html`, or `<xml`.
   - Rejects buffers starting with JSON structures `{` or `[`.
3. **8-Byte Magic Signature Check**:
   - Compares bytes 0-7 against `[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]`.
4. **IHDR Chunk Parsing**:
   - Checks that chunk length is exactly 13 bytes (`ihdrLength === 13`).
   - Checks that chunk type is `"IHDR"`.
   - Extracts width (`ihdrData.readUInt32BE(0)`) and height (`ihdrData.readUInt32BE(4)`).
   - Validates dimension bounds: $1 \le \text{width} \le 16384$ and $1 \le \text{height} \le 16384$.
   - Validates bit depth $\in \{1, 2, 4, 8, 16\}$.
   - Validates color type $\in \{0, 2, 3, 4, 6\}$.
5. **IEND Chunk Validation**:
   - Scans remaining chunks to ensure an `"IEND"` trailer chunk is present, ensuring the file was not truncated during network transmission.

---

## 3. Minimal Valid PNG Generator
For deterministic unit tests without network or disk assets, `createMinimalValidPng(width, height)` synthesizes an RFC-compliant RGBA 8-bit PNG buffer in memory including calculated CRC32 checksums and Deflate IDAT data.

---

## 4. Verification Evidence
Unit tests in `tests/phase34a-capture-hardening.test.ts` (Tests 3.1 - 3.4) verify:
- Accurate width/height extraction from authentic PNG binaries.
- Immediate rejection of truncated files or missing IHDR/IEND.
- Immediate rejection of HTML (`<html><body>Error</body></html>`) and JSON error payloads.
- Rejection of 0-dimension images or dimensions exceeding 16,384 pixels.
