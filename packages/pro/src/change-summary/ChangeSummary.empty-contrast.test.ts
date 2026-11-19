import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Resolves the colours the empty state really uses (from pro's index.css) against core's tokens.css.
const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const tokensCss = read('../../../core/src/styles/tokens.css');
const proCss = read('../styles/index.css');

const declarations = new Map<string, string>();
for (const m of tokensCss.matchAll(/(--[\w-]+):\s*([^;]+);/g)) declarations.set(m[1]!, m[2]!.trim());

type Rgb = [number, number, number];
function resolve(value: string): Rgb {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgb;
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(declarations.get(ref[1]!) ?? `missing ${ref[1]}`);
  throw new Error(`unsupported color expression: ${value}`);
}
const lum = ([r, g, b]: Rgb) => {
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** The last `text-rop-*` / `bg-rop-*` utility that the rule of `selector` applies. */
function applied(selector: string, prefix: 'text' | 'bg'): string {
  const rule = proCss.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`));
  if (!rule) throw new Error(`rule ${selector} not found`);
  const found = [...rule[1]!.matchAll(new RegExp(`${prefix}-rop-([\\w-]+)`, 'g'))].map((m) => m[1]!);
  if (found.length === 0) throw new Error(`${selector} sets no ${prefix}-rop-* colour`);
  return found[found.length - 1]!;
}

describe('ChangeSummary empty state contrast', () => {
  it('the empty text on the box background is at least 4.5:1 (WCAG AA)', () => {
    const fg = applied('.rop-pro-change-summary__empty-text', 'text');
    const bg = applied('.rop-pro-change-summary', 'bg');
    const ratio = contrast(resolve(`var(--color-rop-${fg})`), resolve(`var(--color-rop-${bg})`));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
