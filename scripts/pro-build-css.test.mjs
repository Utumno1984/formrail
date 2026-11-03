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

  it('puts the utilities in the rop.utilities layer and has no preflight', () => {
    const css = build().toString('utf8');
    expect(css).toContain('@layer rop.theme, rop.utilities;');
    expect(css).toMatch(/@layer rop\.utilities \{/);
    expect(css).not.toMatch(/box-sizing:\s*border-box;\s*margin:\s*0/);
  });

  it('is exported as @react-object-page/pro/styles.css and flagged as a side effect', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'packages/pro/package.json'), 'utf8'));
    expect(pkg.exports['./styles.css']).toBe('./dist/styles.css');
    expect(pkg.sideEffects).toEqual(['**/*.css']);
    expect(pkg.peerDependencies['@react-object-page/core']).toBeDefined();
    expect(pkg.devDependencies['@react-object-page/core']).toBeDefined();
  });
});
