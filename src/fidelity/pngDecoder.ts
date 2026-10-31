import * as zlib from "zlib";

export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array; // RGBA 4 bytes per pixel
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buf: Buffer): DecodedImage {
  if (buf.length < 24) throw new Error("Buffer too small for PNG header");
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    throw new Error("Invalid PNG signature");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;

  while (offset < buf.length) {
    if (offset + 8 > buf.length) break;
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + len);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      trns = data;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + len;
  }

  if (width === 0 || height === 0) throw new Error("Missing or invalid IHDR");
  if (idatChunks.length === 0) throw new Error("Missing IDAT chunks");
  if (bitDepth !== 8) throw new Error(`Only 8-bit PNGs are supported, got ${bitDepth}-bit`);
  if (interlace !== 0) throw new Error("Interlaced PNGs are not supported");

  let bytesPerPixel = 0;
  if (colorType === 0) bytesPerPixel = 1; // Grayscale
  else if (colorType === 2) bytesPerPixel = 3; // RGB
  else if (colorType === 3) bytesPerPixel = 1; // Indexed
  else if (colorType === 4) bytesPerPixel = 2; // Gray + Alpha
  else if (colorType === 6) bytesPerPixel = 4; // RGBA
  else throw new Error(`Unsupported PNG color type: ${colorType}`);

  const compressed = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(compressed);

  const scanlineLen = 1 + width * bytesPerPixel;
  if (decompressed.length !== height * scanlineLen) {
    throw new Error(`Decompressed size mismatch: expected ${height * scanlineLen}, got ${decompressed.length}`);
  }

  const out = new Uint8Array(width * height * 4);
  const currentScanline = new Uint8Array(width * bytesPerPixel);
  const prevScanline = new Uint8Array(width * bytesPerPixel);

  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * scanlineLen;
    const filter = decompressed[scanlineOffset];
    const rawData = decompressed.subarray(scanlineOffset + 1, scanlineOffset + scanlineLen);

    for (let i = 0; i < rawData.length; i++) {
      const bpp = bytesPerPixel;
      const a = i >= bpp ? currentScanline[i - bpp] : 0;
      const b = prevScanline[i];
      const c = i >= bpp ? prevScanline[i - bpp] : 0;
      const raw = rawData[i];

      let val = 0;
      if (filter === 0) val = raw;
      else if (filter === 1) val = (raw + a) & 0xff;
      else if (filter === 2) val = (raw + b) & 0xff;
      else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) val = (raw + paethPredictor(a, b, c)) & 0xff;
      else throw new Error(`Unknown PNG filter type: ${filter}`);

      currentScanline[i] = val;
    }

    // Convert scanline to RGBA
    for (let x = 0; x < width; x++) {
      const outIdx = (y * width + x) * 4;
      const srcIdx = x * bytesPerPixel;

      if (colorType === 6) {
        out[outIdx] = currentScanline[srcIdx];
        out[outIdx + 1] = currentScanline[srcIdx + 1];
        out[outIdx + 2] = currentScanline[srcIdx + 2];
        out[outIdx + 3] = currentScanline[srcIdx + 3];
      } else if (colorType === 2) {
        out[outIdx] = currentScanline[srcIdx];
        out[outIdx + 1] = currentScanline[srcIdx + 1];
        out[outIdx + 2] = currentScanline[srcIdx + 2];
        out[outIdx + 3] = 255;
      } else if (colorType === 0) {
        const g = currentScanline[srcIdx];
        out[outIdx] = g;
        out[outIdx + 1] = g;
        out[outIdx + 2] = g;
        out[outIdx + 3] = 255;
      } else if (colorType === 4) {
        const g = currentScanline[srcIdx];
        out[outIdx] = g;
        out[outIdx + 1] = g;
        out[outIdx + 2] = g;
        out[outIdx + 3] = currentScanline[srcIdx + 1];
      } else if (colorType === 3 && palette) {
        const pIdx = currentScanline[srcIdx] * 3;
        out[outIdx] = palette[pIdx];
        out[outIdx + 1] = palette[pIdx + 1];
        out[outIdx + 2] = palette[pIdx + 2];
        out[outIdx + 3] = trns && currentScanline[srcIdx] < trns.length ? trns[currentScanline[srcIdx]] : 255;
      }
    }

    prevScanline.set(currentScanline);
  }

  return { width, height, data: out };
}

// Simple PNG encoder for diff / overlay visualization
export function encodePng(img: DecodedImage): Buffer {
  const { width, height, data } = img;
  const scanlineLen = 1 + width * 4;
  const raw = Buffer.alloc(height * scanlineLen);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLen;
    raw[rowOffset] = 0; // Filter 0 (None)
    const srcRow = y * width * 4;
    for (let x = 0; x < width * 4; x++) {
      raw[rowOffset + 1 + x] = data[srcRow + x];
    }
  }

  const compressed = zlib.deflateSync(raw);

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  function crc32(b: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) {
      c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(typeStr: string, payload: Buffer): Buffer {
    const len = payload.length;
    const chunk = Buffer.alloc(12 + len);
    chunk.writeUInt32BE(len, 0);
    chunk.write(typeStr, 4, 4, "ascii");
    payload.copy(chunk, 8);
    const typeAndData = chunk.subarray(4, 8 + len);
    chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
    return chunk;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Deflate
  ihdr[11] = 0; // Standard filter
  ihdr[12] = 0; // Non-interlaced

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}
