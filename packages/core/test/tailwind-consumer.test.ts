// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDerivedTokens } from '../src/utils/token-scale';
import { customProperties, hoverRules } from './helpers/css-analysis';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = join(packageDir, 'test/fixtures/tailwind-consumer');
const local = join(packageDir, 'node_modules/.bin/tailwindcss');
const bin = existsSync(local) ? local : resolve(packageDir, '../../node_modules/.bin/tailwindcss');

function compile(input: string): string {
  const out = mkdtempSync(join(tmpdir(), 'rop-consumer-'));
  try {
    execFileSync(bin, ['-i', join(fixtureDir, input), '-o', join(out, 'out.css')], {
      cwd: fixtureDir,
      stdio: 'pipe',
    });
    return readFileSync(join(out, 'out.css'), 'utf8');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const GUARD = '@media (hover: hover) and (pointer: fine)';
const squash = (css: string): string => css.replace(/\s+/g, ' ');

describe('a Tailwind v4 consumer (theme.css + @source), requires a prior build', () => {
  it('generates the token utilities with the token values', () => {
    const css = squash(compile('input.css'));
    expect(css).toMatch(/\.z-rop-popover \{ z-index: var\(--z-index-rop-popover\); \}/);
    expect(css).toMatch(/--z-index-rop-popover: 40;/);
    expect(css).toMatch(/\.font-rop-mono \{ font-family: var\(--font-rop-mono\); \}/);
    expect(css).toMatch(/--font-rop-mono: [^;]*monospace;/);
    expect(css).toMatch(/\.text-rop-error \{ color: var\(--color-rop-error\); \}/);
  });

  it('the rop-hover variant keeps the hover guard even when the consumer redefines `hover`', () => {
    const rules = hoverRules(compile('override-hover.css'));
    const library = rules.filter((r) => r.selector.includes('rop-hover'));
    expect(library.length).toBeGreaterThan(0);
    for (const r of library) expect(r.media, r.selector).toContain(GUARD);
    // The consumer's own `hover:` is the unguarded one it asked for: the override really applied.
    const own = rules.find((r) => r.selector.includes('hover\\:underline') && !r.selector.includes('rop-hover'));
    expect(own).toBeDefined();
    expect(own?.media ?? []).not.toContain(GUARD);
  });

  it('the derived tokens are unset there too: no declaration, the formula lives in the utilities', () => {
    const css = compile('input.css');
    const declared = customProperties(css);
    const derived = parseDerivedTokens(readFileSync(join(packageDir, 'dist/theme.css'), 'utf8'));
    expect(derived.size).toBeGreaterThan(0);
    for (const [name, value] of derived) {
      expect(declared.has(name), name).toBe(false);
      expect(css, name).toContain(`var(${name}, ${value})`);
    }
    expect(declared.has('--color-rop-primary')).toBe(true);
  });

  it('--theme(<token>) keeps the override, --theme(<token> inline) gives the bare formula (documented)', () => {
    const css = squash(compile('theme-function.css'));
    const formula = 'color-mix(in srgb, var(--color-rop-primary) 80%, black)';
    expect(css).toContain(`background-color: var(--color-rop-primary-hover, ${formula});`);
    expect(css).toContain(`background-color: ${formula};`);
  });

  it('a build-time @theme redefinition of a derived token replaces the slot', () => {
    const css = squash(compile('override-derived.css'));
    expect(css).toMatch(/--color-rop-primary-hover: #123456;/);
    expect(css).toMatch(/\{ background-color: var\(--color-rop-primary-hover\); \}/);
  });

  it('importing styles.css on top of theme.css is unsupported (duplication) but does not crash', () => {
    const css = compile('both.css');
    expect(css).toContain('.z-rop-popover');
  });
});
