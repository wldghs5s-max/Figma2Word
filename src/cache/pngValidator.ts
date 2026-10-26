import * as zlib from "zlib";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_PNG_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_DIMENSION = 25000; // 25,000 px
const MAX_DECOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB max uncompressed scanline data

// Standard IEEE 802.3 CRC-32 table
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

/**
 * Computes standard IEEE 802.3 CRC-32 over a byte buffer.
 */
export function computeCrc32(buf: Uint8Array, prevCrc = 0xffffffff): number {
  let c = prevCrc;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface PngValidationOptions {
  maxBytes?: number;
  maxDimension?: number;
  maxDecompressedBytes?: number;
  strictEof?: boolean; // default true: reject trailing data after IEND
}

export interface PngValidationResult {
  valid: boolean;
  width?: number;
  height?: number;
  bitDepth?: number;
  colorType?: number;
  compressionMethod?: number;
  filterMethod?: number;
  interlaceMethod?: number;
  chunkCount?: number;
  decompressedBytes?: number;
  reason?: string;
}

const VALID_COLOR_DEPTH_COMBOS: Record<number, number[]> = {
  0: [1, 2, 4, 8, 16], // Grayscale
  2: [8, 16],          // Truecolor RGB
  3: [1, 2, 4, 8],     // Indexed-color
  4: [8, 16],          // Grayscale with alpha
  6: [8, 16],          // Truecolor with alpha RGBA
};

function getChannelsForColorType(colorType: number): number {
  switch (colorType) {
    case 0: return 1; // Grayscale
    case 2: return 3; // RGB
    case 3: return 1; // Indexed
    case 4: return 2; // Grayscale + Alpha
    case 6: return 4; // RGBA
    default: return 0;
  }
}

/**
 * Validates that binary data is a genuine, structural, and renderable PNG file.
 * Hardened for Phase 34A.1 (GATE-01):
 * - Verifies 8-byte PNG magic header
 * - Rejects HTML/JSON error payloads
 * - Enforces 13-byte IHDR chunk at byte offset 8
 * - Validates color type and bit depth combination per W3C specification
 * - Verifies full chunk stream boundaries
 * - Verifies chunk CRC-32 for every chunk (IHDR, PLTE, IDAT, IEND, etc.)
 * - Validates presence and consecutive sequence of IDAT chunks
 * - Fully decompresses IDAT zlib stream and verifies raw scanline byte length
 * - Enforces decompression bomb defenses (max dimensions and max decompressed bytes)
 * - Verifies IEND chunk position and structure
 * - Rejects truncated files and trailing garbage after IEND
 */
export function validatePngBuffer(
  data: Buffer | Uint8Array,
  options?: PngValidationOptions
): PngValidationResult {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

  const maxBytes = options?.maxBytes ?? MAX_PNG_BYTES;
  const maxDim = options?.maxDimension ?? MAX_DIMENSION;
  const maxDecompressed = options?.maxDecompressedBytes ?? MAX_DECOMPRESSED_BYTES;
  const strictEof = options?.strictEof ?? true;

  if (!buf || buf.length < 45) {
    return { valid: false, reason: `Data too short for valid PNG (${buf?.length || 0} bytes < 45)` };
  }

  if (buf.length > maxBytes) {
    return { valid: false, reason: `Data exceeds maximum allowed PNG size (${buf.length} bytes > ${maxBytes})` };
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

  // 3. First chunk MUST be IHDR (starts at byte 8)
  const firstChunkLen = buf.readUInt32BE(8);
  const firstChunkType = buf.subarray(12, 16).toString("ascii");

  if (firstChunkLen !== 13 || firstChunkType !== "IHDR") {
    return { valid: false, reason: `Invalid first chunk: expected 13-byte IHDR, got ${firstChunkLen}-byte ${firstChunkType}` };
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf.readUInt8(24);
  const colorType = buf.readUInt8(25);
  const compression = buf.readUInt8(26);
  const filter = buf.readUInt8(27);
  const interlace = buf.readUInt8(28);

  if (width === 0 || width > maxDim) {
    return { valid: false, reason: `Invalid PNG width: ${width} px (limit: ${maxDim})` };
  }

  if (height === 0 || height > maxDim) {
    return { valid: false, reason: `Invalid PNG height: ${height} px (limit: ${maxDim})` };
  }

  const allowedDepths = VALID_COLOR_DEPTH_COMBOS[colorType];
  if (!allowedDepths) {
    return { valid: false, reason: `Invalid PNG color type: ${colorType}` };
  }

  if (!allowedDepths.includes(bitDepth)) {
    return {
      valid: false,
      reason: `Invalid bit depth ${bitDepth} for PNG color type ${colorType} (allowed: ${allowedDepths.join(", ")})`,
    };
  }

  if (compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1)) {
    return { valid: false, reason: `Invalid IHDR method parameters (c:${compression}, f:${filter}, i:${interlace})` };
  }

  // 4. Calculate expected uncompressed scanline dimensions and defend against decompression bomb
  const channels = getChannelsForColorType(colorType);
  const bitsPerPixel = channels * bitDepth;
  const scanlineBytes = 1 + Math.ceil((width * bitsPerPixel) / 8);
  const expectedRawBytes = height * scanlineBytes;

  if (expectedRawBytes > maxDecompressed) {
    return {
      valid: false,
      reason: `Decompression bomb defense: expected uncompressed scanlines (${expectedRawBytes} bytes) exceeds limit (${maxDecompressed} bytes)`,
    };
  }

  // 5. Walk entire chunk stream from byte 8
  let offset = 8;
  let chunkCount = 0;
  let sawIhdr = false;
  let sawIend = false;
  let sawIdat = false;
  let idatEnded = false;
  let sawPlte = false;
  const idatChunks: Buffer[] = [];

  while (offset < buf.length) {
    // Need at least 8 bytes for length (4) + type (4)
    if (offset + 8 > buf.length) {
      return { valid: false, reason: `Truncated chunk header at byte ${offset} (expected 8 bytes, got ${buf.length - offset})` };
    }

    const chunkLen = buf.readUInt32BE(offset);
    const chunkType = buf.subarray(offset + 4, offset + 8).toString("ascii");

    // Need chunkLen + 4 (for CRC)
    if (offset + 8 + chunkLen + 4 > buf.length) {
      return {
        valid: false,
        reason: `Truncated chunk data for '${chunkType}' at byte ${offset} (length ${chunkLen}, buffer ends at ${buf.length})`,
      };
    }

    // Verify CRC-32 calculated over Type (4 bytes) + Data (chunkLen bytes)
    const typeAndData = buf.subarray(offset + 4, offset + 8 + chunkLen);
    const expectedCrc = buf.readUInt32BE(offset + 8 + chunkLen);
    const actualCrc = computeCrc32(typeAndData);

    if (expectedCrc !== actualCrc) {
      return {
        valid: false,
        reason: `CRC-32 mismatch in chunk '${chunkType}' at offset ${offset} (expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)})`,
      };
    }

    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLen);

    if (chunkType === "IHDR") {
      if (sawIhdr) {
        return { valid: false, reason: "Duplicate IHDR chunk found in PNG stream" };
      }
      sawIhdr = true;
    } else if (chunkType === "PLTE") {
      if (sawIdat) {
        return { valid: false, reason: "PLTE chunk appears after IDAT chunk" };
      }
      if (chunkLen % 3 !== 0) {
        return { valid: false, reason: `PLTE chunk length ${chunkLen} is not divisible by 3` };
      }
      sawPlte = true;
    } else if (chunkType === "IDAT") {
      if (idatEnded) {
        return { valid: false, reason: "Non-consecutive IDAT chunk detected in PNG stream" };
      }
      if (colorType === 3 && !sawPlte) {
        return { valid: false, reason: "Indexed-color PNG (type 3) missing required PLTE chunk before IDAT" };
      }
      sawIdat = true;
      idatChunks.push(chunkData);
    } else if (chunkType === "IEND") {
      if (!sawIdat || idatChunks.length === 0) {
        return { valid: false, reason: "IEND chunk appears before any IDAT chunk" };
      }
      if (chunkLen !== 0) {
        return { valid: false, reason: `IEND chunk must have 0 length (got ${chunkLen})` };
      }
      sawIend = true;

      const eofOffset = offset + 12;
      if (strictEof && eofOffset < buf.length) {
        return {
          valid: false,
          reason: `Trailing data (${buf.length - eofOffset} bytes) detected after IEND chunk`,
        };
      }
      break;
    } else {
      // Any other chunk after IDAT means IDAT sequence has concluded
      if (sawIdat) {
        idatEnded = true;
      }
    }

    offset += 12 + chunkLen;
    chunkCount++;
  }

  if (!sawIend) {
    return { valid: false, reason: "PNG missing mandatory IEND trailer chunk (truncated file)" };
  }

  if (!sawIdat || idatChunks.length === 0) {
    return { valid: false, reason: "PNG missing IDAT image data chunk" };
  }

  // 6. Concatenate IDAT chunks and decompress with zlib to verify valid image payload
  const compressedData = Buffer.concat(idatChunks);
  let decompressed: Buffer;
  try {
    decompressed = zlib.inflateSync(compressedData, {
      maxOutputLength: Math.min(maxDecompressed, Math.max(expectedRawBytes * 2, 64 * 1024)),
    });
  } catch (zErr: any) {
    return {
      valid: false,
      reason: `Corrupted IDAT zlib stream: ${zErr.message}`,
    };
  }

  // For non-interlaced images, the raw byte count must match exactly
  if (interlace === 0 && decompressed.length !== expectedRawBytes) {
    return {
      valid: false,
      reason: `Decompressed scanline size mismatch: expected ${expectedRawBytes} bytes, got ${decompressed.length} bytes`,
    };
  }

  return {
    valid: true,
    width,
    height,
    bitDepth,
    colorType,
    compressionMethod: compression,
    filterMethod: filter,
    interlaceMethod: interlace,
    chunkCount,
    decompressedBytes: decompressed.length,
  };
}

export interface MinimalPngOptions {
  colorType?: number; // default 6 (RGBA) or 2 (RGB)
  bitDepth?: number;  // default 8
  corruptCrc?: boolean;
  corruptIdat?: boolean;
  omitIdat?: boolean;
  omitIend?: boolean;
  trailingBytes?: Buffer;
}

/**
 * Creates valid or deliberately synthesized/corrupted PNG buffers for rigorous gate testing.
 */
export function createMinimalValidPng(
  width = 1,
  height = 1,
  options?: MinimalPngOptions | number
): Buffer {
  // Support legacy signature (width, height, colorTypeNumber)
  const opts: MinimalPngOptions =
    typeof options === "number" ? { colorType: options } : options || {};

  const colorType = opts.colorType ?? 6; // default RGBA
  const bitDepth = opts.bitDepth ?? 8;
  const signature = Buffer.from(PNG_SIGNATURE);

  const makeChunk = (type: string, data: Buffer, corruptCrc = false): Buffer => {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    let crcVal = computeCrc32(Buffer.concat([typeBuf, data]));
    if (corruptCrc) {
      crcVal ^= 0x12345678;
    }
    crcBuf.writeUInt32BE(crcVal >>> 0, 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  };

  // IHDR: 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(bitDepth, 8);
  ihdrData.writeUInt8(colorType, 9);
  ihdrData.writeUInt8(0, 10); // Deflate
  ihdrData.writeUInt8(0, 11); // Filter None
  ihdrData.writeUInt8(0, 12); // Interlace None

  const ihdrChunk = makeChunk("IHDR", ihdrData, opts.corruptCrc === true);

  // PLTE chunk if indexed color
  let plteChunk: Buffer | null = null;
  if (colorType === 3) {
    const plteData = Buffer.from([255, 255, 255, 0, 0, 0]); // 2 colors: white, black
    plteChunk = makeChunk("PLTE", plteData);
  }

  // Scanline data
  const channels = getChannelsForColorType(colorType);
  const bitsPerPixel = channels * bitDepth;
  const scanlineLength = 1 + Math.ceil((width * bitsPerPixel) / 8);
  const rawScanline = Buffer.alloc(scanlineLength);
  rawScanline[0] = 0; // Filter 0 (None)
  for (let i = 1; i < rawScanline.length; i++) {
    rawScanline[i] = 255;
  }

  const rawData = Buffer.concat(Array(height).fill(rawScanline));
  let compressed = zlib.deflateSync(rawData);

  if (opts.corruptIdat) {
    // Corrupt zlib stream bytes
    compressed = Buffer.from(compressed);
    if (compressed.length > 5) {
      compressed[compressed.length - 2] ^= 0xff;
      compressed[compressed.length - 3] ^= 0xaa;
    }
  }

  const chunks: Buffer[] = [signature, ihdrChunk];
  if (plteChunk) chunks.push(plteChunk);

  if (!opts.omitIdat) {
    chunks.push(makeChunk("IDAT", compressed));
  }

  if (!opts.omitIend) {
    chunks.push(makeChunk("IEND", Buffer.alloc(0)));
  }

  if (opts.trailingBytes) {
    chunks.push(opts.trailingBytes);
  }

  return Buffer.concat(chunks);
}
