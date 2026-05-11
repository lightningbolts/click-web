#!/usr/bin/env node
/**
 * Validates JSON syntax for Universal Links / App Links static files.
 * Usage: node scripts/verify-well-known-json.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const files = [
  join(root, 'public', '.well-known', 'apple-app-site-association'),
  join(root, 'public', '.well-known', 'assetlinks.json'),
];

let failed = false;
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  try {
    JSON.parse(raw);
    console.log(`OK  ${f}`);
  } catch (e) {
    failed = true;
    console.error(`BAD ${f}:`, e instanceof Error ? e.message : e);
  }
}

if (failed) process.exit(1);
