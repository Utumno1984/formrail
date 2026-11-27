import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Resolves the colours of the added / removed / changed badges (#485) from pro's index.css against
// core's tokens.css, with the same sRGB maths as the browser, and measures the WCAG contrast.
const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const tokensCss = read('../../../core/src/styles/tokens.css');
const proCss = read('../styles/index.css');

const declarations = new Map<string, string>();
for (const m of tokensCss.matchAll(/(--[\w-]+):\s*([^;]+);/g)) declarations.set(m[1]!, m[2]!.trim());

type Rgb = [number, number, number];

/** Splits `a, b c%` at the top-level commas (the arguments of `color-mix(...)`). */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(from, i).trim());
      from = i + 1;
    }
  }
  out.push(s.slice(from).trim());
  return out;
}

/** `scope` holds the per-badge custom properties (`--_cs-tone`), which win over tokens.css. */
function resolve(value: string, scope: Map<string, string>): Rgb {
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgb;
  if (v === 'black') return [0, 0, 0];
  if (v === 'white') return [255, 255, 255];
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(scope.get(ref[1]!) ?? declarations.get(ref[1]!) ?? `missing ${ref[1]}`, scope);
  const mix = v.match(/^color-mix\((.*)\)$/s);
  if (mix) {
    const [space, a, b] = splitArgs(mix[1]!);
    if (space !== 'in srgb' || !a || !b) throw new Error(`unsupported color-mix: ${v}`);
    const [colorA, pctA] = a.match(/^(.*?)\s+([\d.]+)%$/)!.slice(1);
    const p = Number(pctA) / 100;
    const ca = resolve(colorA!, scope);
    const cb = resolve(b, scope);
    return ca.map((c, i) => c * p + cb[i]! * (1 - p)) as Rgb;
  }
  throw new Error(`unsupported color expression: ${v}`);
}

const lum = ([r, g, b]: Rgb) => {
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Body of the rule of `selector`, up to its first nested rule. */
function ruleBody(selector: string): string {
  const start = proCss.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`rule ${selector} not found`);
  const body = proCss.slice(start + selector.length + 2);
  return body.slice(0, Math.min(...['&', '}'].map((c) => (body.indexOf(c) < 0 ? body.length : body.indexOf(c)))));
}

function declaration(body: string, property: string): string {
  const m = body.match(new RegExp(`(?:^|[\\s;])${property}:\\s*([^;]+);`));
  if (!m) throw new Error(`no ${property} declared`);
  return m[1]!.trim();
}

const BASE = '.rop-pro-change-summary__kind';
/** `text-rop-text` in the `@apply` of a rule, as the token it reads. */
const applyText = (body: string): string | null => (/\btext-rop-text\b/.test(body) ? 'var(--color-rop-text)' : null);
const KINDS = ['added', 'removed', 'changed'] as const;
const TONE_TOKEN = { added: '--color-rop-success', removed: '--color-rop-error', changed: '--color-rop-info' } as const;

/** Text and background of one badge, with `overrides` replacing tokens (a consumer's theme). */
function badge(kind: (typeof KINDS)[number], overrides: Record<string, string> = {}) {
  const base = ruleBody(BASE);
  const toneBody = ruleBody(`${BASE}--${kind}`);
  const scope = new Map<string, string>(Object.entries(overrides));
  scope.set('--_cs-tone', declaration(toneBody, '--_cs-tone'));
  return {
    // The text is the dark text token, as in core's StatusBadge (`text-rop-text` in the rule's `@apply`).
    fg: resolve(applyText(base) ?? declaration(base, 'color'), scope),
    bg: resolve(declaration(base, 'background-color'), scope),
    surface: resolve('var(--color-rop-surface)', scope),
  };
}

describe('ChangeSummary kind badges: contrast (#485)', () => {
  it('each badge takes its tone from the matching semantic token, never a literal', () => {
    for (const kind of KINDS) {
      expect(declaration(ruleBody(`${BASE}--${kind}`), '--_cs-tone')).toBe(`var(${TONE_TOKEN[kind]})`);
    }
    const base = ruleBody(BASE);
    expect(base).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    // No mix with a literal `black`: the text is a token, as in core's StatusBadge.
    expect(base).not.toMatch(/\bblack\b|\bwhite\b/);
  });

  it.each(KINDS)('%s, default tokens: text on its tint and on the box surface is at least 4.5:1', (kind) => {
    const { fg, bg, surface } = badge(kind);
    const onTint = contrast(fg, bg);
    const onSurface = contrast(fg, surface);
    expect(onTint).toBeGreaterThanOrEqual(4.5);
    expect(onSurface).toBeGreaterThanOrEqual(4.5);
  });

  // The primaries already used by tokens.contrast.test.ts, plus the same idea for success / error.
  // The text is the dark text token, not a mix of the tone, so the contrast does not depend on the tone (as StatusBadge).
  const PRIMARIES: Record<string, string> = {
    'default blue': '#0a6ed1',
    'light blue': '#7fb4ff',
    'dark violet': '#6b3fa0',
    'near black': '#10081c',
    'light yellow': '#ffd84d',
    // Even a primary that is almost white stays readable: the text is the dark text token, not a mix of the tone.
    'near white': '#fafafa',
  };
  it.each(Object.entries(PRIMARIES))('changed with --color-rop-info %s: at least 4.5:1', (_name, hex) => {
    const { fg, bg, surface } = badge('changed', { '--color-rop-info': hex });
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fg, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['added', '--color-rop-success', '#2e7d32'],
    ['added', '--color-rop-success', '#7bd88f'],
    ['removed', '--color-rop-error', '#b00020'],
    ['removed', '--color-rop-error', '#ff8a80'],
  ] as const)('%s with %s %s: at least 4.5:1', (kind, token, hex) => {
    const { fg, bg } = badge(kind, { [token]: hex });
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('measures what it claims: the tint is a 10% mix of the tone on the surface and the text the dark text token', () => {
    const { fg, bg } = badge('changed');
    expect(bg.map(Math.round)).toEqual([0.1 * 0 + 0.9 * 255, 0.1 * 112 + 0.9 * 255, 0.1 * 242 + 0.9 * 255].map(Math.round));
    expect(fg.map(Math.round)).toEqual([0x1d, 0x2d, 0x3e]);
  });
});

describe('ChangeSummary kind badges: styles that must stay (#485)', () => {
  it('keeps a 1px outline in the tone (the badge must not vanish in forced-colors mode: the outline stays, in a system colour)', () => {
    expect(declaration(ruleBody(BASE), 'outline')).toBe('1px solid var(--_cs-tone)');
  });

  it('draws a different shape per kind, and the icon is a pseudo-element (no DOM node to name)', () => {
    const shapes = KINDS.map((k) => declaration(ruleBody(`${BASE}--${k}`), '--_cs-shape'));
    expect(new Set(shapes).size).toBe(3);
    expect(proCss).toMatch(/&::before\s*\{[^}]*content:\s*'';[^}]*clip-path:\s*var\(--_cs-shape\)/);
  });

  it('has a forced-colors rule that gives the icon a system colour', () => {
    expect(proCss).toMatch(/@media \(forced-colors: active\)\s*\{\s*\.rop-pro-change-summary__kind::before\s*\{\s*background-color: CanvasText;/);
  });

  it('stays inline (an inline-block adds a space to the accessible name) and wraps rather than overflows', () => {
    const rule = proCss.match(/__kind \{\s*@apply ([^;]+);/)![1]!;
    expect(rule).not.toMatch(/\b(inline-block|inline-flex|flex|block)\b/);
    expect(rule).not.toMatch(/whitespace-nowrap/);
    expect(rule).toMatch(/overflow-wrap:anywhere/);
  });
});
