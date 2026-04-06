/**
 * Renders app/favicon.ico to PNGs in public/ and a multi-size favicon.ico.
 * Run: node scripts/generate-brand-icons.mjs
 *
 * Sharp cannot read BMP-embedded .ico files; decode-ico expands them to raw RGBA / PNG payloads.
 */
import { createRequire } from 'module';
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const decodeIco = require('decode-ico');

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
const rootDir = join(__dirname, '..');
const appDir = join(rootDir, 'app');
const publicDir = join(rootDir, 'public');
const sourceIco = join(appDir, 'favicon.ico');

/** Largest image in the ICO as a sharp instance (RGBA or embedded PNG). */
function sharpFromIcoFile(path) {
  const buf = readFileSync(path);
  const images = decodeIco(buf);
  if (!images.length) {
    throw new Error(`No images in ${path}`);
  }
  const best = images.reduce((a, b) =>
    a.width * a.height >= b.width * b.height ? a : b,
  );
  if (best.type === 'png') {
    return sharp(Buffer.from(best.data)).ensureAlpha();
  }
  return sharp(Buffer.from(best.data), {
    raw: {
      width: best.width,
      height: best.height,
      channels: 4,
    },
  }).ensureAlpha();
}

async function main() {
  if (!existsSync(sourceIco)) {
    console.error(`Missing source favicon: ${sourceIco}`);
    process.exit(1);
  }

  const base = sharpFromIcoFile(sourceIco);

  await base.clone().resize(512, 512).png().toFile(join(publicDir, 'icon.png'));
  await base.clone().resize(180, 180).png().toFile(join(publicDir, 'apple-touch-icon.png'));

  const png16 = await base.clone().resize(16, 16).png().toBuffer();
  const png32 = await base.clone().resize(32, 32).png().toBuffer();
  const png48 = await base.clone().resize(48, 48).png().toBuffer();

  writeFileSync(
    join(publicDir, 'favicon.ico'),
    icoFromPngs([
      { width: 16, height: 16, data: png16 },
      { width: 32, height: 32, data: png32 },
      { width: 48, height: 48, data: png48 },
    ]),
  );

  console.log('Wrote public/icon.png, apple-touch-icon.png, favicon.ico (from app/favicon.ico)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
