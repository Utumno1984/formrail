// #515: the ratchet guard on the legacy demo data.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GUIDE,
  compareLegacy,
  countsOf,
  findOccurrences,
  isScanned,
  measureFiles,
  serialize,
  updateBaseline,
  validateBaseline,
} from './legacy-demo-data.mjs';

const base = (files) => ({ version: 1, files });
const foundOf = (files) => measureFiles(Object.keys(files), (p) => files[p]);

describe('findOccurrences', () => {
  it.each([
    ["const s = 'Rossi Construction Ltd';", 1],
    ['// Bianchi Supplies, see the invoice', 1], // a comment counts: it ends up in "Show code"
    ["supplier: 'ACME'", 1],
    ["supplier: 'acme corp'", 1],
    ["'Northwind Building Ltd'", 1], // the full name is one occurrence, not name + Northwind
    ['Northwind', 1],
    ["number: 'FT-2026-0001'", 1],
    ["import { makeDemoInvoices } from '../internal/demo-invoices';", 1],
    ["import { makeDemoRows } from './demo-rows';", 1],
    ["const m = await import('../internal/demo-invoices.ts');", 1],
    ['Rossi and Rossi', 2],
    ["'Rossi', 'Verdi'", 2],
  ])('%s -> %i', (text, n) => {
    expect(findOccurrences(text)).toHaveLength(n);
  });

  it.each([
    'Rossini',
    'Prossi',
    'Rossi2',
    'Acmeda',
    'Pacme',
    'Ferraris',
    'FT-2025-0001',
    'a demo-invoices note',
    "import { x } from '../internal/demo-data';",
    "import { x } from '../internal/demo-invoices-like-name-without-slash';",
    'Orders for Hartmann Maschinenbau GmbH',
  ])('%s is not legacy', (text) => {
    expect(findOccurrences(text)).toEqual([]);
  });

  it('counts across lines and is not stateful between calls', () => {
    const text = 'Rossi\nVerdi\nAcme';
    expect(findOccurrences(text)).toHaveLength(3);
    expect(findOccurrences(text)).toHaveLength(3);
  });
});

describe('isScanned', () => {
  it.each([
    'packages/core/src/list-report/ListReport.stories.tsx',
    'packages/pro/src/list-report/demo-rows.ts',
    'e2e/list-report.spec.ts',
    '.storybook/Introduction.mdx',
    'site-root/index.html',
    'README.md',
    'packages/core/README.md',
    'packages/pro/README.md',
  ])('%s is scanned', (p) => expect(isScanned(p)).toBe(true));

  it.each([
    '.changeset/some-change.md',
    '.changeset/README.md',
    'CHANGELOG.md',
    'packages/core/CHANGELOG.md',
    'packages/core/src/CHANGELOG.md',
    'docs/planning/design-system-spec.md',
    'CONTRIBUTING.md',
    'scripts/legacy-demo-data.mjs',
    'e2e/snapshots/list-report.png',
    'packages/core/dist/index.js',
    'node_modules/x/src/a.js',
  ])('%s is not scanned', (p) => expect(isScanned(p)).toBe(false));

  it('changesets and changelogs with legacy strings are history, not demo: not measured', () => {
    const files = {
      '.changeset/x.md': 'The Rossi Construction Ltd rows',
      'CHANGELOG.md': 'Acme',
      'packages/core/CHANGELOG.md': 'FT-2026-0001',
      'packages/core/src/a.stories.tsx': 'Rossi',
    };
    expect(Object.keys(foundOf(files))).toEqual(['packages/core/src/a.stories.tsx']);
  });
});

describe('compareLegacy', () => {
  const baseline = base({ 'packages/core/src/a.stories.tsx': 2, 'e2e/b.spec.ts': 1 });

  it('passes when nothing changed', () => {
    const found = foundOf({ 'packages/core/src/a.stories.tsx': 'Rossi, Verdi', 'e2e/b.spec.ts': 'Acme' });
    expect(compareLegacy(found, baseline)).toEqual({ ok: true, errors: [], notes: [] });
  });

  it('a new file with a legacy string fails, naming the file, the string and the CONTRIBUTING section', () => {
    const found = foundOf({ 'packages/core/src/a.stories.tsx': 'Rossi, Verdi', 'e2e/b.spec.ts': 'Acme', 'packages/core/src/new.stories.tsx': "const s = 'Rossi Construction Ltd';" });
    const r = compareLegacy(found, baseline);
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('packages/core/src/new.stories.tsx');
    expect(r.errors[0]).toContain('rossi construction ltd');
    expect(r.errors[0]).toContain('CONTRIBUTING.md');
    expect(r.errors[0]).toContain('"Demo data"');
    expect(r.errors[0]).toContain(GUIDE);
  });

  it('the message for a new file explains the rename case', () => {
    const r = compareLegacy(foundOf({ 'e2e/renamed.spec.ts': 'Acme' }), base({ 'e2e/b.spec.ts': 1 }));
    expect(r.errors[0]).toMatch(/rename/);
    expect(r.errors[0]).toMatch(/legacy-demo:update/);
    expect(r.errors[0]).toMatch(/total does not grow/);
  });

  it('a file in the baseline whose count grows fails', () => {
    const found = foundOf({ 'packages/core/src/a.stories.tsx': 'Rossi, Verdi, Bianchi', 'e2e/b.spec.ts': 'Acme' });
    const r = compareLegacy(found, baseline);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('packages/core/src/a.stories.tsx');
    expect(r.errors[0]).toContain('3');
    expect(r.errors[0]).toContain('baseline 2');
    expect(r.errors[0]).toContain(GUIDE);
  });

  it('a lower count passes and suggests the update', () => {
    const found = foundOf({ 'packages/core/src/a.stories.tsx': 'Rossi', 'e2e/b.spec.ts': 'Acme' });
    const r = compareLegacy(found, baseline);
    expect(r.ok).toBe(true);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toContain('packages/core/src/a.stories.tsx');
    expect(r.notes[0]).toContain('legacy-demo:update');
  });

  it('a baseline file that no longer exists is not an error: the note says to drop the entry', () => {
    const found = foundOf({ 'packages/core/src/a.stories.tsx': 'Rossi, Verdi' });
    const r = compareLegacy(found, baseline);
    expect(r.ok).toBe(true);
    expect(r.notes[0]).toContain('e2e/b.spec.ts');
    expect(r.notes[0]).toMatch(/drop the entry/);
  });

  it('a malformed baseline fails', () => {
    for (const bad of [null, [], { version: 2, files: {} }, { version: 1 }, { version: 1, files: { a: 0 } }, { version: 1, files: { a: 1.5 } }]) {
      const r = compareLegacy({}, bad);
      expect(r.ok).toBe(false);
      expect(validateBaseline(bad).length).toBeGreaterThan(0);
    }
  });
});

  const baseline = base({ 'a.ts': 2, 'e2e/b.spec.ts': 3, 'gone.ts': 1 });
  const at = (files) => foundOf(Object.fromEntries(Object.entries(files).map(([p, n]) => [`packages/core/src/${p}`, 'Rossi '.repeat(n)])));
  const ratchet = base({ 'packages/core/src/a.ts': 2, 'packages/core/src/b.ts': 3, 'packages/core/src/gone.ts': 1 });

  it('lowers a count and drops the file that no longer exists', () => {
    const r = updateBaseline(at({ 'a.ts': 1, 'b.ts': 3 }), ratchet);
    expect(r.ok).toBe(true);
    expect(r.baseline).toEqual({ version: 1, files: { 'packages/core/src/a.ts': 1, 'packages/core/src/b.ts': 3 } });
  });

  it('refuses to raise a count', () => {
    const r = updateBaseline(at({ 'a.ts': 3, 'b.ts': 3 }), ratchet);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('packages/core/src/a.ts');
  });

  it('refuses to raise a count even if the total goes down elsewhere', () => {
    const r = updateBaseline(at({ 'a.ts': 3 }), ratchet);
    expect(r.ok).toBe(false);
  });

  it('refuses to add a file when the total grows', () => {
    const r = updateBaseline(at({ 'a.ts': 2, 'b.ts': 3, 'gone.ts': 1, 'new.ts': 1 }), ratchet);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/never adds/);
  });

  it('accepts a rename: the new file takes the count of the one that disappeared (same total)', () => {
    const r = updateBaseline(at({ 'a.ts': 2, 'b.ts': 3, 'renamed.ts': 1 }), ratchet);
    expect(r.ok).toBe(true);
    expect(r.baseline.files).toEqual({ 'packages/core/src/a.ts': 2, 'packages/core/src/b.ts': 3, 'packages/core/src/renamed.ts': 1 });
  });

  it('accepts a rename that also lowers the total', () => {
    const r = updateBaseline(at({ 'a.ts': 2, 'b.ts': 3 }), base({ ...ratchet.files, 'packages/core/src/old.ts': 2 }));
    expect(r.ok).toBe(true);
  });

  it('the written file is sorted, versioned and ends with a newline', () => {
    const text = serialize({ files: countsOf(at({ 'b.ts': 1, 'a.ts': 2 })) });
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual({ version: 1, files: { 'packages/core/src/a.ts': 2, 'packages/core/src/b.ts': 1 } });
    expect(Object.keys(JSON.parse(text).files)).toEqual(['packages/core/src/a.ts', 'packages/core/src/b.ts']);
  });
});

describe('the versioned baseline', () => {
  const baselineFile = join(dirname(fileURLToPath(import.meta.url)), 'legacy-demo-data.baseline.json');
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));

  it('is valid and has no excluded file', () => {
    expect(validateBaseline(baseline)).toEqual([]);
    for (const file of Object.keys(baseline.files)) expect(isScanned(file), file).toBe(true);
  });

  it('is sorted (a stable diff)', () => {
    const keys = Object.keys(baseline.files);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('the CLI, on a scratch repository', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  function scratch(files, baselineFiles) {
    const dir = mkdtempSync(join(tmpdir(), 'legacy-demo-'));
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    cpSync(join(root, 'scripts/legacy-demo-data.mjs'), join(dir, 'scripts/legacy-demo-data.mjs'));
    writeFileSync(join(dir, 'scripts/legacy-demo-data.baseline.json'), serialize({ files: baselineFiles }));
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), text);
    }
    execFileSync('git', ['init', '-q'], { cwd: dir });
    return dir;
  }
  const run = (dir, command) => {
    try {
      const stdout = execFileSync('node', ['scripts/legacy-demo-data.mjs', command], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, stdout, stderr: '' };
    } catch (e) {
      return { code: e.status, stdout: String(e.stdout), stderr: String(e.stderr) };
    }
  };

  it('check: an untracked new file with a legacy string fails; update refuses; removing it passes', () => {
    const dir = scratch({ 'packages/core/src/a.stories.tsx': "const s = 'Rossi Construction Ltd';\n", '.changeset/x.md': 'Acme\n' }, { 'packages/core/src/a.stories.tsx': 1 });
    try {
      expect(run(dir, 'check').code).toBe(0);
      writeFileSync(join(dir, 'packages/core/src/b.stories.tsx'), "const s = 'Rossi Construction Ltd';\n");
      const failed = run(dir, 'check');
      expect(failed.code).toBe(1);
      expect(failed.stderr).toContain('packages/core/src/b.stories.tsx');
      expect(failed.stderr).toContain('CONTRIBUTING.md');
      expect(run(dir, 'update').code).toBe(1);
      rmSync(join(dir, 'packages/core/src/b.stories.tsx'));
      expect(run(dir, 'check').code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('check passes with a lower count and suggests the update, which then lowers the baseline', () => {
    const dir = scratch({ 'packages/core/src/a.stories.tsx': "const s = 'Rossi';\n" }, { 'packages/core/src/a.stories.tsx': 2 });
    try {
      const passed = run(dir, 'check');
      expect(passed.code).toBe(0);
      expect(passed.stdout).toContain('legacy-demo:update');
      expect(run(dir, 'update').code).toBe(0);
      const written = JSON.parse(readFileSync(join(dir, 'scripts/legacy-demo-data.baseline.json'), 'utf8'));
      expect(written.files).toEqual({ 'packages/core/src/a.stories.tsx': 1 });
      expect(run(dir, 'check').stdout).not.toContain('lower it');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('update after a rename keeps the total', () => {
    const dir = scratch({ 'packages/core/src/renamed.stories.tsx': "const s = 'Rossi';\n" }, { 'packages/core/src/old.stories.tsx': 1 });
    try {
      expect(run(dir, 'check').code).toBe(1);
      expect(run(dir, 'update').code).toBe(0);
      expect(run(dir, 'check').code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
