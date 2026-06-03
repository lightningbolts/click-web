import fs from 'node:fs';
import path from 'node:path';

/**
 * Load `.env.local` then `.env` from the project root (same order as Next.js).
 * Does not override variables already set in the shell.
 */
export function loadEnvFiles(rootDir: string = process.cwd()): void {
  for (const name of ['.env.local', '.env']) {
    const filePath = path.join(rootDir, name);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;

      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;

      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}
