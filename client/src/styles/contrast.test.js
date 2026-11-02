import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

// WCAG 2.x contrast computed from the real token file, so a token change that breaks readability fails the build.
const read = (f) => readFileSync(join(__dirname, f), 'utf8'); // vite-node provides __dirname (jsdom's import.meta.url is not a file: URL)
const css = read('tokens.css');
const global = read('global.css');
const block = (re) => { const m = re.exec(css); if (!m) throw new Error(`token block not found: ${re}`); return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((x) => [x[1], x[2]])); };
const light = block(/:root,\s*:root\[data-theme='light'\]\s*\{([^}]*)\}/);
const dark = { ...light, ...block(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/) };

const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// [foreground token, background token, minimum ratio, what it is]
const PAIRS = [
  ['text', 'bg', 4.5, 'body text'], ['text', 'surface', 4.5, 'card text'], ['text', 'surface-2', 4.5, 'text on subtle surface'],
  ['text-muted', 'bg', 4.5, 'secondary text'], ['text-muted', 'surface', 4.5, 'secondary text on cards'], ['text-muted', 'surface-2', 4.5, 'neutral badge / skeleton text'],
  ['link', 'bg', 4.5, 'links'], ['link', 'surface', 4.5, 'links on cards'], ['link', 'surface-2', 4.5, 'links on subtle surface'],
  ['on-brand', 'brand', 4.5, 'primary button / active nav text'], ['on-brand', 'brand-hover', 4.5, 'primary button hover text'],
  ['on-danger', 'danger-solid', 4.5, 'destructive button text'], ['on-danger', 'danger-solid-hover', 4.5, 'destructive button hover text'],
  ['danger', 'bg', 4.5, 'error text'], ['danger', 'surface', 4.5, 'error text on cards/modals'], ['danger', 'surface-2', 4.5, 'error text on subtle surface'],
  ['success', 'success-bg', 4.5, 'success badge'], ['warn-text', 'warn-bg', 4.5, 'warning badge'], ['bad-text', 'bad-bg', 4.5, 'failure badge'],
  ['focus', 'bg', 3, 'focus ring (non-text)'], ['focus', 'surface', 3, 'focus ring on cards (non-text)'], ['accent', 'bg', 3, 'accent indicators (non-text)'], ['accent', 'surface', 3, 'accent borders on cards (non-text)'],
];
describe.each([['light', light], ['dark', dark]])('%s theme contrast (WCAG AA)', (_name, t) => {
  it.each(PAIRS)('%s on %s >= %f (%s)', (fg, bg, min, what) => {
    expect(t[fg], `token --${fg}`).toBeDefined(); expect(t[bg], `token --${bg}`).toBeDefined();
    const r = ratio(t[fg], t[bg]);
    expect(r, `${what}: ${t[fg]} on ${t[bg]} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });
});
describe('token hygiene', () => {
  it('global.css uses tokens for colours; only the white PDF page canvas colours are literal', () => {
    const literals = [...global.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0].toLowerCase());
    expect([...new Set(literals)].sort()).toEqual(['#475569', '#fff']); // .pdf-page (always white, even in dark mode) and its loading text
  });
  it('the dark accent from the specification is kept (for non-text uses)', () => { expect(dark.accent.toLowerCase()).toBe('#6366f1'); });
  it('the specified light brand/background tokens are unchanged', () => { expect(light.brand).toBe('#1E40AF'); expect(light.bg).toBe('#F8FAFC'); expect(light.surface).toBe('#FFFFFF'); expect(light.text).toBe('#0F172A'); expect(dark.bg).toBe('#0F172A'); expect(dark.surface).toBe('#1E293B'); expect(dark.text).toBe('#F1F5F9'); });
});
