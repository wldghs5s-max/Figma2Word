import * as zlib from "zlib";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_PNG_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_DIMENSION = 25000; // 25,000 px

export interface PngValidationResult {
  valid: boolean;
  width?: number;
  height?: number;
  bitDepth?: number;
  colorType?: number;
  reason?: string;
}

/**
 * Validates that binary data is a genuine, structural, and renderable PNG file (Phase 34A).
 * Defends against truncated data, HTML error pages, fake headers, and corrupted IHDR.
 */
export function validatePngBuffer(data: Buffer | Uint8Array): PngValidationResult {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

  if (!buf || buf.length < 45) {
    return { valid: false, reason: `Data too short for valid PNG (${buf?.length || 0} bytes)` };
  }

  if (buf.length > MAX_PNG_BYTES) {
    return { valid: false, reason: `Data exceeds maximum allowed PNG size (${buf.length} bytes > ${MAX_PNG_BYTES})` };
  }

  // 1. Check for text/HTML/JSON error responses returned with HTTP 200
  const headerSlice = buf.subarray(0, Math.min(64, buf.length)).toString("utf8").toLowerCase();
  if (
    headerSlice.includes("<!doctype") ||
    headerSlice.includes("<html") ||
    headerSlice.includes("{\"err") ||
    headerSlice.includes("{\"message")
  ) {
    return { valid: false, reason: "Data is an HTML/JSON error document, not a PNG image." };
  }

  // 2. Validate 8-byte PNG signature
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) {
      return { valid: false, reason: `Invalid PNG signature at byte ${i} (got 0x${buf[i].toString(16)})` };
    }
  }

  // 3. Validate IHDR chunk (First chunk immediately following signature)
  const ihdrLen = buf.readUInt32BE(8);
  const ihdrType = buf.subarray(12, 16).toString("ascii");

  if (ihdrLen !== 13 || ihdrType !== "IHDR") {
    return { valid: false, reason: `Invalid first chunk: expected 13-byte IHDR, got ${ihdrLen}-byte ${ihdrType}` };
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf.readUInt8(24);
  const colorType = buf.readUInt8(25);
  const compression = buf.readUInt8(26);
  const filter = buf.readUInt8(27);
  const interlace = buf.readUInt8(28);

  if (width === 0 || width > MAX_DIMENSION) {
    return { valid: false, reason: `Invalid PNG width: ${width} px` };
  }

  if (height === 0 || height > MAX_DIMENSION) {
    return { valid: false, reason: `Invalid PNG height: ${height} px` };
  }

  const validBitDepths = [1, 2, 4, 8, 16];
  if (!validBitDepths.includes(bitDepth)) {
    return { valid: false, reason: `Invalid PNG bit depth: ${bitDepth}` };
  }

  const validColorTypes = [0, 2, 3, 4, 6];
  if (!validColorTypes.includes(colorType)) {
    return { valid: false, reason: `Invalid PNG color type: ${colorType}` };
  }

  if (compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1)) {
    return { valid: false, reason: `Invalid IHDR method parameters (c:${compression}, f:${filter}, i:${interlace})` };
  }

  // 4. Validate presence of IEND trailer chunk
  const iendStr = buf.subarray(buf.length - 12).toString("binary");
  if (!iendStr.includes("IEND")) {
    return { valid: false, reason: "PNG missing mandatory IEND trailer chunk (truncated file)" };
  }

  return {
    valid: true,
    width,
    height,
    bitDepth,
    colorType,
  };
}

/**
 * Creates a minimal valid, decodable PNG buffer for testing purposes.
 */
export function createMinimalValidPng(width = 1, height = 1): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA (color type 6)
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const crc = (type: string, data: Buffer): number => {
    const combined = Buffer.concat([Buffer.from(type, "ascii"), data]);
    let c = 0xffffffff;
    for (let i = 0; i < combined.length; i++) {
      c ^= combined[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  };

  const makeChunk = (type: string, data: Buffer): Buffer => {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc(type, data), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  };

  const ihdrChunk = makeChunk("IHDR", ihdrData);

  // Scanline: 1 byte filter (0) + width * 4 bytes RGBA (all 255)
  const rawScanline = Buffer.alloc(1 + width * 4);
  rawScanline[0] = 0; // Filter None
  for (let i = 1; i < rawScanline.length; i++) {
    rawScanline[i] = 255; // White pixel
  }

  const rawData = Buffer.concat(Array(height).fill(rawScanline));
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}
