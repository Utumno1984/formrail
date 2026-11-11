// packages/pro/dist/styles.css: deterministic build and no token declarations (#175).
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = resolve(ROOT, 'packages/pro/scripts/build-css.mjs');
const dirs = [];

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'pro-css-'));
  dirs.push(dir);
  execFileSync('node', [SCRIPT, dir], { stdio: 'pipe' });
  return readFileSync(join(dir, 'styles.css'));
}

/**
 * Class names used in the selectors of a stylesheet (unescaped, `sm\:flex-row` → `sm:flex-row`).
 * Only the preludes are read (text before each `{`), never declarations (`0.25rem` is no class);
 * at-rules (`@property --tw-*`, `@layer`, `@container (...)`) are skipped.
 */
function classSelectors(css) {
  const names = new Set();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      const prelude = text.slice(start, i).trim();
      if (!prelude.startsWith('@')) {
        for (const m of prelude.matchAll(/\.((?:\\.|[\w-])+)/g)) names.add(m[1].replace(/\\(.)/g, '$1'));
      }
    }
    if (ch === '{' || ch === '}' || ch === ';') start = i + 1;
  }
  return names;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('pro styles.css build', () => {
  it('is deterministic: two builds are byte-identical', () => {
    expect(build().equals(build())).toBe(true);
  });

  it('declares no token variable (they come from core theme.css)', () => {
    const css = build().toString('utf8');
    expect(css).not.toMatch(/--rop-[\w-]*\s*:/);
    expect(css).not.toMatch(/--(color|text|font|radius|z-index|motion|icon|container)-rop-[\w-]*\s*:/);
  });

  it('puts its rules in the nested rop.utilities.pro layer (below core utilities) and has no preflight', () => {
    const css = build().toString('utf8');
    expect(css).toContain('@layer rop.theme, rop.utilities;');
    expect(css).toContain('@layer rop.utilities.pro;');
    expect(css).toMatch(/@layer rop\.utilities\.pro \{/);
    // Nothing directly in rop.utilities: there, a pro rule would compete with core's by source order.
    expect(css).not.toMatch(/@layer rop\.utilities \{/);
    expect(css).not.toMatch(/box-sizing:\s*border-box;\s*margin:\s*0/);
  });

  it('emits only its own .rop-pro-* classes: no Tailwind utility, nothing read from comments', () => {
    const classes = classSelectors(build().toString('utf8'));
    expect(classes.size).toBeGreaterThan(0);
    expect([...classes].filter((name) => !name.startsWith('rop-pro-'))).toEqual([]);
  });

  it('shares no class name with core dist/styles.css (no collision, whatever the import order)', () => {
    const core = classSelectors(readFileSync(resolve(ROOT, 'packages/core/dist/styles.css'), 'utf8'));
    expect(core.has('flex-col')).toBe(true); // sanity: the core file is the real one
    const pro = classSelectors(build().toString('utf8'));
    expect([...pro].filter((name) => core.has(name))).toEqual([]);
  });

  it('is exported as @formrail/pro/styles.css and flagged as a side effect', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'packages/pro/package.json'), 'utf8'));
    expect(pkg.exports['./styles.css']).toBe('./dist/styles.css');
    expect(pkg.sideEffects).toEqual(['**/*.css']);
    expect(pkg.peerDependencies['@formrail/core']).toBeDefined();
    expect(pkg.devDependencies['@formrail/core']).toBeDefined();
  });
});
