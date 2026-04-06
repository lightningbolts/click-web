/**
 * Renders the Click squircle logo (SVG) to PNGs in public/ and a multi-size favicon.ico.
 * Run: node scripts/generate-brand-icons.mjs
 * Replace the SVG paths if swapping in exported art from ClickLogo2.png.
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/** Single-file .ico containing one or more embedded PNGs (Windows 7+). */
function icoFromPngs(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entrySize = 16;
  const dir = Buffer.alloc(entrySize * count);
  let offset = 6 + entrySize * count;
  for (let i = 0; i < count; i++) {
    const { width, height, data } = images[i];
    const base = i * entrySize;
    dir.writeUInt8(width === 256 ? 0 : width, base + 0);
    dir.writeUInt8(height === 256 ? 0 : height, base + 1);
    dir.writeUInt8(0, base + 2);
    dir.writeUInt8(0, base + 3);
    dir.writeUInt16LE(1, base + 4);
    dir.writeUInt16LE(32, base + 6);
    dir.writeUInt32LE(data.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += data.length;
  }

  return Buffer.concat([header, dir, ...images.map((x) => x.data)]);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4c1d95"/>
      <stop offset="55%" style="stop-color:#7c3aed"/>
      <stop offset="100%" style="stop-color:#a78bfa"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="128" fill="url(#bg)"/>
  <path fill="#ffffff" d="M96 416 L96 256 L256 96 L416 256 L416 416 L320 416 L320 288 L256 222 L192 288 L192 416 Z"/>
</svg>`;

async function main() {
  const buf = Buffer.from(svg);

  await sharp(buf).resize(512, 512).png().toFile(join(publicDir, 'icon.png'));
  await sharp(buf).resize(180, 180).png().toFile(join(publicDir, 'apple-touch-icon.png'));

  const png16 = await sharp(buf).resize(16, 16).png().toBuffer();
  const png32 = await sharp(buf).resize(32, 32).png().toBuffer();
  const png48 = await sharp(buf).resize(48, 48).png().toBuffer();

  writeFileSync(
    join(publicDir, 'favicon.ico'),
    icoFromPngs([
      { width: 16, height: 16, data: png16 },
      { width: 32, height: 32, data: png32 },
      { width: 48, height: 48, data: png48 },
    ]),
  );

  console.log('Wrote public/icon.png, apple-touch-icon.png, favicon.ico');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
