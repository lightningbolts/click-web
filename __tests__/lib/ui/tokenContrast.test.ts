/**
 * Spec §4.1 / §12.3: every text-on-background token pair meets WCAG contrast in both
 * themes. Reads the real values from app/globals.css so the CSS stays the source of truth.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { contrastRatio } from '@/lib/ui/generateCardVisual';

const css = readFileSync(path.join(__dirname, '..', '..', '..', 'app', 'globals.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('}', start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\b/gi)) vars[m[1]] = m[2];
  return vars;
}

const light = block(':root');
const dark = { ...light, ...block('.dark') };

type Pair = [fg: string, bg: string, min: number];

const TEXT = 4.5;
const LARGE_OR_ICON = 3;

const pairs: Pair[] = [
  ['text', 'bg', 7],
  ['text', 'surface', 7],
  ['text', 'surface-raised', 7],
  ['text', 'bg-elevated', 7],
  ['text-secondary', 'surface', 7],
  ['text-secondary', 'bg', TEXT],
  ['text-secondary', 'surface-raised', TEXT],
  ['text-tertiary', 'surface', TEXT],
  ['text-tertiary', 'bg', TEXT],
  ['text-tertiary', 'bg-elevated', TEXT],
  ['text-on-action', 'action', TEXT],
  ['text-on-action', 'action-hover', TEXT],
  ['text-on-action', 'bubble-out', TEXT],
  ['text', 'bubble-in', TEXT],
  ['accent', 'surface', TEXT],
  ['accent', 'bg', TEXT],
  ['accent', 'selection', TEXT],
  ['text', 'selection', TEXT],
  ['text-on-action', 'live', LARGE_OR_ICON],
  ['destructive', 'surface', TEXT],
  ['destructive', 'destructive-fill', TEXT],
  ['warning-text', 'warning-fill', TEXT],
  ['warning-text', 'surface', TEXT],
  ['online-text', 'surface', TEXT],
  ['read-receipt', 'surface', LARGE_OR_ICON],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme token contrast', (_name, tokens) => {
  it.each(pairs)('%s on %s ≥ %p:1', (fg, bg, min) => {
    expect(tokens[fg]).toMatch(/^#/);
    expect(tokens[bg]).toMatch(/^#/);
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(min);
  });
});
