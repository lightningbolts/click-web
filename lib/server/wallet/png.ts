import { deflateSync } from 'zlib';
import { crc32 } from '@/lib/server/wallet/pkpass';

export type Rgb = readonly [number, number, number];

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * A small PNG fading diagonally from `from` (top left) to `to` (bottom right). Wallet stretches
 * and blurs a pass background, so a few dozen pixels make a smooth full-card wash.
 */
export function gradientPng(width: number, height: number, from: Rgb, to: Rgb): Buffer {
  const row = 1 + width * 3;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = (x / Math.max(width - 1, 1) + y / Math.max(height - 1, 1)) / 2;
      const at = y * row + 1 + x * 3;
      for (let c = 0; c < 3; c++) raw[at + c] = Math.round(from[c]! + (to[c]! - from[c]!) * t);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor RGB
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
