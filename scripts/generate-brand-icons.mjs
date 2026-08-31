/**
 * Renders public/brand/logo-icon.svg to favicons and a static Open Graph PNG.
 * Static files keep next/og (resvg.wasm) out of the Cloudflare Worker bundle.
 * Run: npm run icons
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

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
const rootDir = join(__dirname, "..");
const appDir = join(rootDir, "app");
const publicDir = join(rootDir, "public");
const sourceSvg = join(publicDir, "brand/logo-icon.svg");

async function main() {
  if (!existsSync(sourceSvg)) {
    console.error(`Missing source mark: ${sourceSvg}`);
    process.exit(1);
  }

  const svg = readFileSync(sourceSvg);
  const base = sharp(svg).ensureAlpha();

  await base.clone().resize(512, 512).png().toFile(join(publicDir, "icon.png"));
  await base.clone().resize(180, 180).png().toFile(join(publicDir, "apple-touch-icon.png"));

  const mark = await base.clone().resize(420, 420).png().toBuffer();
  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 15, g: 10, b: 26, alpha: 1 },
    },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toFile(join(appDir, "opengraph-image.png"));

  const png16 = await base.clone().resize(16, 16).png().toBuffer();
  const png32 = await base.clone().resize(32, 32).png().toBuffer();
  const png48 = await base.clone().resize(48, 48).png().toBuffer();
  const ico = icoFromPngs([
    { width: 16, height: 16, data: png16 },
    { width: 32, height: 32, data: png32 },
    { width: 48, height: 48, data: png48 },
  ]);

  writeFileSync(join(publicDir, "favicon.ico"), ico);
  writeFileSync(join(appDir, "favicon.ico"), ico);

  console.log(
    "Wrote public/icon.png, apple-touch-icon.png, favicon.ico, app/favicon.ico, and app/opengraph-image.png from brand/logo-icon.svg",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
