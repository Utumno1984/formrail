import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUDGETED_PACKAGES,
  bundleExport,
  buildBaseline,
  compareBudget,
  displayPath,
  limitFor,
  runCheck,
  runCheckAll,
  runUpdate,
  updateCommand,
  updatedMessage,
} from './bundle-budget.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

  it('keeps @react-object-page/core (peer dependency of pro) external: never charged to a pro export (#175)', async () => {
    const big = Array.from({ length: 200 }, (_, i) => `"core-code-${i}-${'x'.repeat(40)}"`).join(',');
    mkdirSync(join(dir, 'node_modules/@react-object-page/core'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules/@react-object-page/core/package.json'),
      JSON.stringify({ name: '@react-object-page/core', type: 'module', exports: './index.js' }),
    );
    writeFileSync(
      join(dir, 'node_modules/@react-object-page/core/index.js'),
      `export const cn = (...a) => [${big}].concat(a).join(' ');\n`,
    );
    writeFileSync(
      join(dir, 'dist/index.js'),
      'import { cn } from "@react-object-page/core";\nexport const Uses = (c) => cn(c);\n',
    );
    const out = await bundleExport(join(dir, 'dist/index.js'), 'Uses');
    expect(out).toContain('from"@react-object-page/core"');
    expect(out).not.toContain('core-code-');
    expect((await runUpdate({ packageDir: dir })).Uses).toBeLessThan(200);
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

describe('multi-package check (#174)', () => {
  let dirs;
  const makePackage = (code) => {
    const dir = mkdtempSync(join(tmpdir(), 'budget-pkg-'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist/index.js'), code);
    dirs.push(dir);
    return dir;
  };
  beforeEach(() => {
    dirs = [];
  });
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('checks core and pro by default, each with its own versioned baseline file', () => {
    expect(BUDGETED_PACKAGES).toEqual([resolve(ROOT, 'packages/core'), resolve(ROOT, 'packages/pro')]);
  });

  it('the committed pro baseline has one valid entry per public export of pro', () => {
    const budget = JSON.parse(readFileSync(resolve(ROOT, 'packages/pro/bundle-budget.json'), 'utf8'));
    expect(Object.keys(budget.exports).sort()).toEqual([
      'ChangeSummary',
      'VirtualListReport',
      'VirtualListReportTable',
      'computeChangeSummary',
      'computeRebase',
      'formatChangeValue',
      'inferSegmentLabel',
      'useChangeSummary',
      'useFormRebase',
    ]);
    const measured = Object.fromEntries(Object.entries(budget.exports).map(([k, v]) => [k, v.baseline]));
    expect(compareBudget(measured, budget).ok).toBe(true);
  });

  it('passes when every package is within its limits, with lines prefixed by package', async () => {
    const a = makePackage('export const a = () => 1;\n');
    const b = makePackage('export const b = () => 2;\n');
    await runUpdate({ packageDir: a });
    await runUpdate({ packageDir: b });
    const result = await runCheckAll({ packageDirs: [a, b] });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].startsWith(`[${displayPath(a)}] a: measured`)).toBe(true);
    expect(result.lines[1].startsWith(`[${displayPath(b)}] b: measured`)).toBe(true);
  });

  it('one package over its limit fails the whole check even if the other is fine', async () => {
    const ok = makePackage('export const fine = () => 1;\n');
    const over = makePackage('export const heavy = () => 1;\n');
    await runUpdate({ packageDir: ok });
    await runUpdate({ packageDir: over });
    const bloat = Array.from({ length: 300 }, (_, i) => i.toString(36)).join('');
    writeFileSync(join(over, 'dist/index.js'), `export const heavy = () => "${bloat}";\n`);
    expect((await runCheck({ packageDir: ok })).ok).toBe(true);
    for (const order of [
      [ok, over],
      [over, ok],
    ]) {
      const result = await runCheckAll({ packageDirs: order });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(`[${displayPath(over)}] heavy:`);
      expect(result.errors[0]).toContain('OVER LIMIT');
      expect(result.lines.some((l) => l.includes('fine:'))).toBe(true);
    }
  });

  it('an unbudgeted export in one package fails the check and names that package baseline', async () => {
    const ok = makePackage('export const fine = () => 1;\n');
    const other = makePackage('export const known = () => 1;\n');
    await runUpdate({ packageDir: ok });
    await runUpdate({ packageDir: other });
    writeFileSync(join(other, 'dist/index.js'), 'export const known = () => 1;\nexport const fresh = 1;\n');
    const result = await runCheckAll({ packageDirs: [ok, other] });
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('fresh: public export without a budget');
    expect(result.errors[0]).toContain(join(other, 'bundle-budget.json'));
  });

  it('a package without a baseline fails the check', async () => {
    const ok = makePackage('export const fine = () => 1;\n');
    const missing = makePackage('export const x = 1;\n');
    await runUpdate({ packageDir: ok });
    const result = await runCheckAll({ packageDirs: [ok, missing] });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/bundle-budget\.json not found/);
  });

  it('messages name the baseline file and the update command of the package really involved', () => {
    expect(updatedMessage(resolve(ROOT, 'packages/pro/bundle-budget.json'))).toBe(
      'Baseline written. Review and commit packages/pro/bundle-budget.json.',
    );
    expect(updatedMessage(resolve(ROOT, 'packages/core/bundle-budget.json'))).toBe(
      'Baseline written. Review and commit packages/core/bundle-budget.json.',
    );
    expect(updateCommand(resolve(ROOT, 'packages/core'))).toBe('npm run bundle:update-baseline');
    expect(updateCommand(resolve(ROOT, 'packages/pro'))).toBe('npm run bundle:update-baseline -- --package packages/pro');
    const r = compareBudget(
      { x: 1 },
      { version: 1, exports: {} },
      'packages/pro/bundle-budget.json',
      updateCommand(resolve(ROOT, 'packages/pro')),
    );
    expect(r.errors[0]).toBe(
      'x: public export without a budget. Add it explicitly with `npm run bundle:update-baseline -- --package packages/pro` and commit packages/pro/bundle-budget.json.',
    );
  });
});
