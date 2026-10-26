# Report 02: PNG Binary Integrity & Full Decompression Hardening (GATE-01)

## 1. Context & Identified Vulnerability
In Phase 34A, `validatePngBuffer` only inspected:
- 8-byte magic header (`0x89 50 4E 47 0D 0A 1A 0A`)
- HTML/JSON string headers
- 13-byte IHDR first chunk length
- Trailing substring `"IEND"` within the final 12 bytes

**Vulnerability:** A file containing a valid 8-byte header, a 13-byte IHDR, corrupted or empty IDAT data, invalid chunk CRCs, or malicious trailing data was falsely classified as `valid: true`.

## 2. Hardened Architecture (`src/cache/pngValidator.ts`)

### 1) IEEE 802.3 Standard CRC-32 Engine
Implemented a deterministic precomputed 256-entry table CRC-32 generator (`computeCrc32`). Every chunk traversed in the PNG byte stream (IHDR, PLTE, IDAT, IEND) undergoes CRC-32 verification computed over `Chunk Type (4 bytes) + Chunk Data (N bytes)`. Any byte tampering triggers immediate rejection.

### 2) W3C Specification Color Type & Bit Depth Combinations
Enforced canonical color type and bit depth pairing:
- Color Type 0 (Grayscale): Bit depth 1, 2, 4, 8, 16
- Color Type 2 (Truecolor RGB): Bit depth 8, 16 (1, 2, 4 strictly rejected)
- Color Type 3 (Indexed-color): Bit depth 1, 2, 4, 8 (Requires PLTE chunk before IDAT)
- Color Type 4 (Grayscale + Alpha): Bit depth 8, 16
- Color Type 6 (Truecolor RGBA): Bit depth 8, 16

### 3) Chunk Stream Traversal & Ordering
Walks chunk boundaries from offset 8 to EOF:
- Chunk 1 must be `IHDR` with length exactly 13. Duplicate IHDR chunks are rejected.
- `PLTE` must precede `IDAT`.
- At least one `IDAT` chunk must exist. If multiple IDAT chunks exist, they must be consecutive.
- `IEND` must have length 0 and occur after `IDAT`.
- **Trailing Data Rejection:** Any trailing bytes detected after `IEND` (`buf.length > offset + 12`) are rejected.

### 4) Full IDAT Zlib Stream Decompression & Scanline Verification
Concatenates all IDAT chunk payloads into a continuous buffer and decompresses via Node.js `zlib.inflateSync`.
- **Expected Scanline Calculation:**
  $$\text{scanlineBytes} = 1 + \left\lceil \frac{\text{width} \times \text{bitsPerPixel}}{8} \right\rceil$$
  $$\text{expectedRawBytes} = \text{height} \times \text{scanlineBytes}$$
- For non-interlaced images, the decompressed byte count must match $\text{expectedRawBytes}$ exactly.

### 5) Decompression Bomb Defenses
- Pre-calculates $\text{expectedRawBytes}$ prior to invoking zlib.
- Rejects any image whose expected uncompressed scanlines exceed `MAX_DECOMPRESSED_BYTES` (100 MB).
- Passes `{ maxOutputLength: Math.min(maxDecompressed, expectedRawBytes * 2) }` to `zlib.inflateSync`, bounding memory consumption under abnormal compression ratios.

## 3. Test Verification (`tests/phase34a1-release-gate.test.ts`)

| Test Case | Description | Result |
|---|---|---|
| `1.1` | Genuine RGBA (colorType 6) and RGB (colorType 2) decoding | **PASSED** (Accurate dimensions, channels, scanlines) |
| `1.2` | Corrupted CRC-32 in IHDR chunk | **PASSED** (Rejected: `CRC-32 mismatch in chunk 'IHDR'`) |
| `1.3` | Corrupted IDAT compressed zlib data | **PASSED** (Rejected: `Corrupted IDAT zlib stream`) |
| `1.4` | Missing IDAT chunk | **PASSED** (Rejected: `IEND chunk appears before any IDAT`) |
| `1.5` | Missing IEND trailer chunk | **PASSED** (Rejected: `missing mandatory IEND trailer chunk`) |
| `1.6` | Invalid colorType (2) with bitDepth (1) | **PASSED** (Rejected: `Invalid bit depth 1 for PNG color type 2`) |
| `1.7` | Trailing malicious payload after IEND | **PASSED** (Rejected: `Trailing data (28 bytes) detected after IEND`) |
| `1.8` | Decompression bomb defense (20,000 x 20,000 px) | **PASSED** (Rejected: `Decompression bomb defense: expected uncompressed scanlines exceeds limit`) |
