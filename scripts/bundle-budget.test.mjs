import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleExport, buildBaseline, compareBudget, limitFor, runCheck, runUpdate } from './bundle-budget.mjs';

describe('compareBudget', () => {
  const budget = { version: 1, exports: { a: { baseline: 100, limit: 120 } } };

  it('passes within the limit', () => {
    const r = compareBudget({ a: 110 }, budget);
    expect(r.ok).toBe(true);
    expect(r.lines[0]).toContain('delta +10 B');
  });

  it('passes at exactly the limit', () => {
    expect(compareBudget({ a: 120 }, budget).ok).toBe(true);
  });

  it('fails over the limit reporting import, measured, baseline and delta', () => {
    const r = compareBudget({ a: 121 }, budget);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('a:');
    expect(r.errors[0]).toContain('measured 121 B');
    expect(r.errors[0]).toContain('baseline 100 B');
    expect(r.errors[0]).toContain('delta +21 B');
  });

  it('fails for a public export missing from the baseline', () => {
    const r = compareBudget({ a: 100, b: 5 }, budget);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/b: public export without a budget/);
  });

  it('fails for an orphan baseline entry', () => {
    const r = compareBudget({}, budget);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/a: orphan budget entry/);
  });

  it('passes on a negative delta and reports it', () => {
    const r = compareBudget({ a: 80 }, budget);
    expect(r.ok).toBe(true);
    expect(r.lines[0]).toContain('delta -20 B');
    expect(r.lines[0]).toContain('lighter than baseline');
  });

  it('treats a missing exports map as empty (every export is then unbudgeted)', () => {
    expect(compareBudget({ a: 1 }, {}).ok).toBe(false);
  });

  it('rejects an entry without limit (gate must not be silently green)', () => {
    const r = compareBudget({ a: 9999 }, { version: 1, exports: { a: { baseline: 100 } } });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/limit must be a non-negative integer/);
  });

  it('rejects non-numeric / non-integer / negative-margin values', () => {
    for (const entry of [
      { baseline: 100, limit: '120' },
      { baseline: 100, limit: 120.5 },
      { baseline: 100, limit: null },
      { baseline: '100', limit: 120 },
      { baseline: 100, limit: 90 },
    ]) {
      expect(compareBudget({ a: 1 }, { version: 1, exports: { a: entry } }).ok).toBe(false);
    }
  });

  it('rejects a wrong or missing version', () => {
    expect(compareBudget({ a: 1 }, { version: 2, exports: { a: { baseline: 1, limit: 2 } } }).ok).toBe(false);
    expect(compareBudget({ a: 1 }, { exports: { a: { baseline: 1, limit: 2 } } }).ok).toBe(false);
  });

  it('does not treat Object.prototype names as budgeted exports', () => {
    const measured = Object.assign(Object.create(null), { toString: 5, constructor: 5, valueOf: 5 });
    const r = compareBudget(measured, { version: 1, exports: {} });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(3);
    expect(r.errors.every((e) => /public export without a budget/.test(e))).toBe(true);
  });

  it('reports a prototype-named baseline entry as orphan when the export is gone', () => {
    const exports = JSON.parse('{"toString":{"baseline":1,"limit":2}}');
    const r = compareBudget(Object.create(null), { version: 1, exports });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/toString: orphan budget entry/);
  });

  it('does not match an inherited name against a plain measured object', () => {
    const exports = JSON.parse('{"constructor":{"baseline":1,"limit":2}}');
    const r = compareBudget({}, { version: 1, exports });
    expect(r.errors[0]).toMatch(/constructor: orphan budget entry/);
  });
});

describe('limitFor / buildBaseline', () => {
  it('gives headroom above the measured size', () => {
    expect(limitFor(1000)).toBe(1100);
    expect(limitFor(10)).toBe(30);
    expect(buildBaseline({ x: 100 }).exports.x).toEqual({ baseline: 100, limit: 120 });
  });
});

describe('CLI on a fixture package', () => {
  let dir;
  let budgetPath;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'budget-'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(
      join(dir, 'dist/index.js'),
      `export const small = () => 1;\nexport const big = () => "${'x'.repeat(200)}".split("").reverse().join("");\n`,
    );
    budgetPath = join(dir, 'bundle-budget.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('measures per import (tree-shaken): small is lighter than big', async () => {
    await runUpdate({ packageDir: dir });
    const { exports } = JSON.parse(readFileSync(budgetPath, 'utf8'));
    expect(Object.keys(exports)).toEqual(['big', 'small']);
    expect(exports.small.baseline).toBeLessThan(exports.big.baseline);
  });

  it('check passes and never rewrites the baseline file, even when lighter than baseline', async () => {
    await runUpdate({ packageDir: dir });
    const stale = JSON.parse(readFileSync(budgetPath, 'utf8'));
    stale.exports.big.baseline += 500;
    stale.exports.big.limit += 500;
    writeFileSync(budgetPath, `${JSON.stringify(stale, null, 2)}\n`);
    const before = readFileSync(budgetPath);
    const result = await runCheck({ packageDir: dir });
    expect(result.ok).toBe(true);
    expect(readFileSync(budgetPath).equals(before)).toBe(true);
  });

  it('check does not create the baseline when missing, and fails', async () => {
    const result = await runCheck({ packageDir: dir });
    expect(result.ok).toBe(false);
    expect(() => readFileSync(budgetPath)).toThrow();
  });

  it('check fails when a new export is not in the baseline, and leaves the file untouched', async () => {
    await runUpdate({ packageDir: dir });
    const before = readFileSync(budgetPath);
    writeFileSync(
      join(dir, 'dist/index.js'),
      `${readFileSync(join(dir, 'dist/index.js'), 'utf8')}export const added = 1;\n`,
    );
    const result = await runCheck({ packageDir: dir });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('added');
    expect(readFileSync(budgetPath).equals(before)).toBe(true);
  });

  it('check fails on an orphan entry when an export disappears from dist', async () => {
    await runUpdate({ packageDir: dir });
    writeFileSync(join(dir, 'dist/index.js'), 'export const small = () => 1;\n');
    const result = await runCheck({ packageDir: dir });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/big: orphan/);
  });

  it('check fails when dist is missing', async () => {
    await runUpdate({ packageDir: dir });
    rmSync(join(dir, 'dist'), { recursive: true });
    await expect(runCheck({ packageDir: dir })).rejects.toThrow(/npm run build/);
  });
});

describe('react externals measurement (#34)', () => {
  let dir;
  const entry = (extra = '') =>
    [
      `import { forwardRef } from "react";`,
      `import { jsx } from "react/jsx-runtime";`,
      `export const composeRefs = (a, b) => (n) => { if (a) a.current = n; if (b) b.current = n; ${extra} };`,
      `export const Comp = forwardRef((p, r) => jsx("div", { ref: r, ...p }));`,
      '',
    ].join('\n');
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'budget-react-'));
    mkdirSync(join(dir, 'dist'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('does not charge an export for react imports it does not use, however many modules import them', async () => {
    writeFileSync(join(dir, 'dist/index.js'), entry());
    const before = (await runUpdate({ packageDir: dir })).composeRefs;
    const extraModules = Array.from(
      { length: 30 },
      (_, i) =>
        `import { useState as u${i}, useEffect as e${i} } from "react";\nimport { jsx as j${i} } from "react/jsx-runtime";\nexport const M${i} = () => j${i}("p", { c: u${i}, d: e${i} });\n`,
    ).join('');
    writeFileSync(join(dir, 'dist/index.js'), entry() + extraModules);
    const after = (await runUpdate({ packageDir: dir })).composeRefs;
    expect(after).toBe(before);
  });

  it('still charges react bindings an export really uses', async () => {
    const comp = (hooks) =>
      `import { forwardRef, ${hooks.join(', ')} } from "react";\nexport const Comp = forwardRef(() => [${hooks.map((h) => `${h}()`).join(', ')}]);\n`;
    writeFileSync(join(dir, 'dist/index.js'), comp([]));
    const none = (await runUpdate({ packageDir: dir })).Comp;
    writeFileSync(join(dir, 'dist/index.js'), comp(['useState', 'useEffect', 'useMemo']));
    const used = (await runUpdate({ packageDir: dir })).Comp;
    expect(used).toBeGreaterThan(none);
    // Discriminating: the minified output keeps the react import for used bindings...
    expect(await bundleExport(join(dir, 'dist/index.js'), 'Comp')).toContain('from"react"');
    // ...and drops it when nothing from react is used.
    writeFileSync(
      join(dir, 'dist/index.js'),
      'import { useState } from "react";\nexport const Plain = () => 1;\nexport const Hook = () => useState;\n',
    );
    expect(await bundleExport(join(dir, 'dist/index.js'), 'Plain')).not.toContain('react');
    expect(await bundleExport(join(dir, 'dist/index.js'), 'Hook')).toContain('from"react"');
  });

  it('keeps react subpaths (react-dom/client, jsx-dev-runtime) external instead of bundling them', async () => {
    writeFileSync(
      join(dir, 'dist/index.js'),
      [
        'import { createRoot } from "react-dom/client";',
        'import { jsxDEV } from "react/jsx-dev-runtime";',
        'export const mount = (el) => createRoot(el);',
        'export const dev = () => jsxDEV("p", {});',
        '',
      ].join('\n'),
    );
    const measured = await runUpdate({ packageDir: dir });
    expect(measured.mount).toBeLessThan(1024);
    expect(measured.dev).toBeLessThan(1024);
  });

  it('still detects a real size increase of composeRefs against the committed baseline', async () => {
    writeFileSync(join(dir, 'dist/index.js'), entry());
    await runUpdate({ packageDir: dir });
    expect((await runCheck({ packageDir: dir })).ok).toBe(true);
    const bloat = Array.from(
      { length: 12 },
      (_, i) => `if (a && n === ${i}) console.log("branch-${i}", a, b);`,
    ).join(' ');
    writeFileSync(join(dir, 'dist/index.js'), entry(bloat));
    const result = await runCheck({ packageDir: dir });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/composeRefs:.*OVER LIMIT/);
  });
});
