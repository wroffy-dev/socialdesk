import { open } from 'node:fs/promises';

/**
 * Reads duration and the first video track's dimensions from an MP4/MOV file by walking the
 * ISO-BMFF box tree (moov → mvhd, trak → tkhd). Returns nulls when the file can't be parsed.
 */
export async function probeMp4(filePath: string): Promise<{ durationSec: number | null; width: number | null; height: number | null }> {
  const empty = { durationSec: null, width: null, height: null };
  const fh = await open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    const read = async (pos: number, len: number) => {
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, pos);
      return buf.subarray(0, bytesRead);
    };

    async function findBox(start: number, end: number, type: string): Promise<{ start: number; end: number } | null> {
      let pos = start;
      while (pos + 8 <= end) {
        const h = await read(pos, 16);
        if (h.length < 8) return null;
        let boxSize = h.readUInt32BE(0);
        const boxType = h.toString('ascii', 4, 8);
        let header = 8;
        if (boxSize === 1) {
          if (h.length < 16) return null;
          boxSize = Number(h.readBigUInt64BE(8));
          header = 16;
        } else if (boxSize === 0) {
          boxSize = end - pos;
        }
        if (boxSize < header) return null;
        if (boxType === type) return { start: pos + header, end: Math.min(end, pos + boxSize) };
        pos += boxSize;
      }
      return null;
    }

    const moov = await findBox(0, size, 'moov');
    if (!moov) return empty;

    let durationSec: number | null = null;
    const mvhd = await findBox(moov.start, moov.end, 'mvhd');
    if (mvhd) {
      const b = await read(mvhd.start, 32);
      if (b[0] === 1 && b.length >= 32) {
        const timescale = b.readUInt32BE(20);
        durationSec = timescale ? Number(b.readBigUInt64BE(24)) / timescale : null;
      } else if (b.length >= 20) {
        const timescale = b.readUInt32BE(12);
        durationSec = timescale ? b.readUInt32BE(16) / timescale : null;
      }
    }

    let width: number | null = null;
    let height: number | null = null;
    let pos = moov.start;
    while (pos < moov.end) {
      const trak = await findBox(pos, moov.end, 'trak');
      if (!trak) break;
      const tkhd = await findBox(trak.start, trak.end, 'tkhd');
      if (tkhd) {
        const version = (await read(tkhd.start, 1))[0];
        const wh = await read(tkhd.start + (version === 1 ? 88 : 76), 8);
        if (wh.length === 8) {
          const w = wh.readUInt32BE(0) / 65536;
          const h = wh.readUInt32BE(4) / 65536;
          if (w > 0 && h > 0) {
            width = Math.round(w);
            height = Math.round(h);
            break;
          }
        }
      }
      pos = trak.end;
    }
    return { durationSec, width, height };
  } catch {
    return empty;
  } finally {
    await fh.close();
  }
}
