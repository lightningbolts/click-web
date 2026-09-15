import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve('maplibre-gl/package.json'));
const distDir = path.join(packageDir, 'dist');
const outputDir = path.join(process.cwd(), 'public', 'maplibre');

mkdirSync(outputDir, { recursive: true });

for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(distDir, file), path.join(outputDir, file));
}
