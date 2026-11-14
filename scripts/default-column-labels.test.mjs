import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { REPO_ROOT, checkLabels, measureLabels } from './default-column-measure.mjs';

// #540: the default of a label key. Convention (b): the prose states it ("Default `x`."), there is no `@default`
// (the Docs show `labels` as ONE row with an empty Default column: e2e/docs-props.spec.ts). The guard is
// `measureLabels` + `checkLabels`, run by `--check` next to the props guard of #476.

/** A fixture package tree (core + an empty pro) with the given files; `index.ts` re-exports every `.tsx`. */
const fixtureRoot = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'formrail-labels-'));
  const core = join(dir, 'packages/core/src');
  mkdirSync(core, { recursive: true });
  mkdirSync(join(dir, 'packages/pro/src'), { recursive: true });
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'));
  writeFileSync(join(dir, 'packages/pro/src/index.ts'), 'export {};\n');
  const tsx = Object.keys(files).filter((f) => f.endsWith('.tsx'));
  writeFileSync(join(core, 'index.ts'), tsx.map((f) => `export * from './${f.replace('.tsx', '')}';`).join('\n') + '\n');
  for (const [name, code] of Object.entries(files)) writeFileSync(join(core, name), code);
  return dir;
};

describe('label interfaces: the guard (#540)', { timeout: 60_000 }, () => {
  const labelsOf = (code) => {
    const root = fixtureRoot({ 'Labels.tsx': code });
    try {
      return measureLabels({ root });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
  const kinds = (code) => checkLabels(labelsOf(code)).map((i) => `${i.component}.${i.prop}:${i.kind}`);

  it('a key that states its default in the prose is clean', () => {
    expect(kinds('export interface FooLabels {\n  /** Name of the button. Default `Save`. */\n  save: string;\n}')).toEqual([]);
  });
  it('a key with no default in the prose is reported, with the interface and the key', () => {
    expect(kinds('export interface FooLabels {\n  /** Name of the button. */\n  save: string;\n}')).toEqual(['FooLabels.save:label-no-default']);
  });
  it('a key with no TSDoc at all is reported too', () => {
    expect(kinds('export interface FooLabels {\n  save: string;\n}')).toEqual(['FooLabels.save:label-no-default']);
  });
  it('a key with `@default` AND the prose default (the mixed form) is reported as mixed', () => {
    expect(kinds('export interface FooLabels {\n  /** Name. Default `Save`.\n   * @default Save\n   */\n  save: string;\n}')).toEqual(['FooLabels.save:label-mixed']);
  });
  it('a key with only `@default` is reported: nothing in the Docs would show it', () => {
    expect(kinds('export interface FooLabels {\n  /** Name.\n   * @default Save\n   */\n  save: string;\n}')).toEqual(['FooLabels.save:label-tag']);
  });
  it('`@defaultValue` is a tag too (the same report, with its own name in the message)', () => {
    const [issue] = checkLabels(labelsOf('export interface FooLabels {\n  /** Name.\n   * @defaultValue Save\n   */\n  save: string;\n}'));
    expect(issue).toMatchObject({ kind: 'label-tag' });
    expect(issue.message).toContain('@defaultValue');
  });
  it('a default that is a function says what it returns, in the prose', () => {
    expect(kinds('export interface FooLabels {\n  /** Name of a page. Default `Page ${n}`. */\n  page: (n: number) => string;\n}')).toEqual([]);
    expect(kinds('export interface FooLabels {\n  /** Name of a page. */\n  page: (n: number) => string;\n}')).toEqual(['FooLabels.page:label-no-default']);
  });
  it('a default with quotes, an apostrophe or `<` in the prose is read and does not break the guard', () => {
    const code = [
      'export interface FooLabels {',
      "  /** One. Default `Don't save`. */",
      '  a: string;',
      '  /** Two. Default `Close: <title>`. */',
      '  b: string;',
      '  /** Three. Default "Say hi". */',
      '  c: string;',
      '}',
    ].join('\n');
    const rows = labelsOf(code);
    expect(rows.map((r) => [r.key, r.prose])).toEqual([['a', "`Don't save`"], ['b', '`Close: <title>`'], ['c', '"Say hi"']]);
    expect(checkLabels(rows)).toEqual([]);
  });
  it('a key inherited from a base interface is reported once, under the interface that declares it', () => {
    const code = [
      'export interface BaseLabels {\n  /** Base. */\n  loading: string;\n}',
      'export interface FooLabels extends BaseLabels {\n  /** Own. Default `Own`. */\n  own: string;\n}',
      'export type AliasLabels = FooLabels;',
    ].join('\n');
    expect(labelsOf(code).map((r) => `${r.iface}.${r.key}`)).toEqual(['BaseLabels.loading', 'FooLabels.own']);
    expect(kinds(code)).toEqual(['BaseLabels.loading:label-no-default']);
  });
  it('an interface whose name does not end in `Labels`, and a key tagged `@internal`, are not label keys', () => {
    const code = [
      'export interface FooTexts {\n  /** x. */\n  a: string;\n}',
      'export interface BarLabels {\n  /** x.\n   * @internal\n   */\n  hidden: string;\n  /** x. Default `y`. */\n  shown: string;\n}',
    ].join('\n');
    expect(labelsOf(code).map((r) => `${r.iface}.${r.key}`)).toEqual(['BarLabels.shown']);
  });
  it('a label interface that the entry does not export is not public: it is not checked', () => {
    expect(labelsOf('interface HiddenLabels {\n  /** x. */\n  a: string;\n}\nexport const x = 1;')).toEqual([]);
  });
  it('a mention of "default" with no value stated is not a default', () => {
    expect(kinds('export interface FooLabels {\n  /** Name. The default theme is dark. */\n  a: string;\n}')).toEqual(['FooLabels.a:label-no-default']);
  });

  describe('the --check command line on label keys', { timeout: 120_000 }, () => {
    const run = (root) => spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/default-column-measure.mjs'), '--check', '--root', root], { encoding: 'utf8' });
    const clean = fixtureRoot({ 'Labels.tsx': 'export interface FooLabels {\n  /** Name. Default `Save`. */\n  save: string;\n}' });
    const mixed = fixtureRoot({ 'Labels.tsx': 'export interface FooLabels {\n  /** Name. Default `Save`.\n   * @default Save\n   */\n  save: string;\n}' });
    const missing = fixtureRoot({ 'Labels.tsx': 'export interface FooLabels {\n  /** Name. */\n  save: string;\n}' });
    afterAll(() => {
      for (const dir of [clean, mixed, missing]) rmSync(dir, { recursive: true, force: true });
    });
    it('exits 0 when every key states its default in the prose', () => {
      const r = run(clean);
      expect([r.status, r.stdout]).toEqual([0, 'Default column check: OK\n']);
    });
    it('exits non-zero on the mixed form and names the interface and the key', () => {
      const r = run(mixed);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('FooLabels.save [label-mixed]');
    });
    it('exits non-zero on a key with no default and names the interface and the key', () => {
      const r = run(missing);
      expect(r.status).toBe(1);
      expect(r.stdout).toContain('FooLabels.save [label-no-default]');
      expect(r.stdout).toContain('1 problem');
    });
  });
});

describe('label interfaces: the repository (#540)', { timeout: 120_000 }, () => {
  const rows = measureLabels();
  const rowOfKey = (iface, key) => rows.find((r) => r.iface === iface && r.key === key);
  it('every key of every public label interface states its default in the prose, with no tag', () => {
    expect(checkLabels(rows)).toEqual([]);
  });
  it('the interfaces of the ticket are really read (the check is not vacuous)', () => {
    const ifaces = new Set(rows.map((r) => r.iface));
    for (const name of ['ListReportTableLabels', 'ListReportFrameLabels', 'PaginationLabels', 'NumberInputLabels', 'ChangeSummaryValueLabels', 'RebaseNoticeLabels']) expect(ifaces, name).toContain(name);
    expect(rowOfKey('ListReportFrameLabels', 'clearSelection')).toMatchObject({ prose: '`Clear selection`', tag: undefined });
    expect(rowOfKey('ListReportFrameLabels', 'selectionBar')).toMatchObject({ prose: '`Selection`' });
    expect(rowOfKey('PaginationLabels', 'previous')).toMatchObject({ prose: '`Previous page`' });
    expect(rowOfKey('NumberInputLabels', 'increment')).toMatchObject({ prose: '`Increase`' });
    expect(rows.length).toBeGreaterThan(50);
  });
  it('the keys ListReportFrameLabels inherits from ListReportTableLabels are reported under the table interface only', () => {
    expect(rowOfKey('ListReportTableLabels', 'loading')).toBeDefined();
    expect(rowOfKey('ListReportFrameLabels', 'loading')).toBeUndefined();
    expect(rowOfKey('VirtualListReportLabels', 'loading')).toBeUndefined();
  });
});
