import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_BASELINE_IDS, isVisualEntry, visualEntries } from '../e2e/visual/visual-stories.mjs';
import { compareBaselines, readBaselines, readVisualIds } from './visual-orphans.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'visual-orphans.mjs');

describe('isVisualEntry (the filter shared with visual.spec.ts)', () => {
  it('keeps a story tagged visual, drops one without the tag', () => {
    expect(isVisualEntry({ id: 'a--b', type: 'story', tags: ['visual'] })).toBe(true);
    expect(isVisualEntry({ id: 'a--c', type: 'story', tags: ['autodocs'] })).toBe(false);
    expect(isVisualEntry({ id: 'a--d', type: 'story' })).toBe(false);
  });
  it('keeps a docs entry only with visual-docs, not with the inherited visual tag', () => {
    expect(isVisualEntry({ id: 'intro--docs', type: 'docs', tags: ['visual-docs'] })).toBe(true);
    expect(isVisualEntry({ id: 'a--docs', type: 'docs', tags: ['visual', 'autodocs'] })).toBe(false);
  });
  it('visualEntries filters a whole index', () => {
    const ids = visualEntries({
      x: { id: 'x', type: 'story', tags: ['visual'] },
      y: { id: 'y', type: 'story', tags: [] },
    }).map((e) => e.id);
    expect(ids).toEqual(['x']);
  });
});

describe('compareBaselines', () => {
  it('reports no orphan when every PNG has an entry', () => {
    expect(compareBaselines(['a--b'], { 'visual-desktop': ['a--b.png'] })).toEqual({ orphans: [], missing: {} });
  });
  it('lists an orphan PNG per viewport, with its folder', () => {
    const { orphans } = compareBaselines(['a--b'], {
      'visual-desktop': ['a--b.png', 'old--name.png'],
      'visual-mobile': ['a--b.png', 'old--name.png'],
      'visual-tablet': ['a--b.png'],
    });
    expect(orphans).toEqual(['visual-desktop/old--name.png', 'visual-mobile/old--name.png']);
  });
  it('treats a story without the visual tag as absent: its PNG is an orphan', () => {
    const ids = visualEntries({ u: { id: 'a--untagged', type: 'story', tags: [] } }).map((e) => e.id);
    expect(compareBaselines(ids, { 'visual-desktop': ['a--untagged.png'] }).orphans).toEqual([
      'visual-desktop/a--untagged.png',
    ]);
  });
  it('a visual-docs page owns its PNG', () => {
    const ids = visualEntries({ d: { id: 'intro--docs', type: 'docs', tags: ['visual-docs'] } }).map((e) => e.id);
    expect(compareBaselines(ids, { 'visual-desktop': ['intro--docs.png'] }).orphans).toEqual([]);
  });
  it.each(['visual-desktop', 'visual-tablet', 'visual-mobile'])('catches an orphan present only in %s', (folder) => {
    const files = { 'visual-desktop': ['a--b.png'], 'visual-tablet': ['a--b.png'], 'visual-mobile': ['a--b.png'] };
    files[folder] = ['a--b.png', 'old--name.png'];
    expect(compareBaselines(['a--b'], files).orphans).toEqual([`${folder}/old--name.png`]);
  });
  it('compares ids case-sensitively (Foo--Bar.png is not foo--bar)', () => {
    expect(compareBaselines(['foo--bar'], { 'visual-desktop': ['Foo--Bar.png'] }).orphans).toEqual([
      'visual-desktop/Foo--Bar.png',
    ]);
  });
  it('compares ids case-sensitively in the other direction too (id Foo--Bar, file foo--bar.png)', () => {
    expect(compareBaselines(['Foo--Bar'], { 'visual-desktop': ['foo--bar.png'] }).orphans).toEqual([
      'visual-desktop/foo--bar.png',
    ]);
  });
  it('reports a missing baseline without calling it an orphan', () => {
    expect(compareBaselines(['a--b', 'a--c'], { 'visual-desktop': ['a--b.png'] })).toEqual({
      orphans: [],
      missing: { 'visual-desktop': ['a--c'] },
    });
  });
  it('ignores files that are not PNG', () => {
    const files = { 'visual-desktop': ['a--b.png', '.DS_Store', 'notes.txt', 'x.png.bak'] };
    expect(compareBaselines(['a--b'], files).orphans).toEqual([]);
  });
  it('knows a Pro id when the index includes it (and flags it when it does not)', () => {
    const pro = 'pro-formrebase--default';
    expect(compareBaselines(['a--b', pro], { 'visual-desktop': [`${pro}.png`] }).orphans).toEqual([]);
    expect(compareBaselines(['a--b'], { 'visual-desktop': [`${pro}.png`] }).orphans).toEqual([
      `visual-desktop/${pro}.png`,
    ]);
  });
});

describe('CLI on a fake tree', () => {
  const dirs = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  function tree({ free = {}, pro, pngs }) {
    const root = mkdtempSync(join(tmpdir(), 'visual-orphans-'));
    dirs.push(root);
    const write = (name, entries) => writeFileSync(join(root, name), JSON.stringify({ v: 5, entries }));
    write('free.json', free);
    if (pro) write('pro.json', pro);
    for (const [folder, names] of Object.entries(pngs)) {
      mkdirSync(join(root, 'shots', folder), { recursive: true });
      for (const n of names) writeFileSync(join(root, 'shots', folder, n), '');
    }
    return root;
  }
  const story = (id) => ({ id, type: 'story', tags: ['visual'] });
  const run = (root, ...args) =>
    spawnSync('node', [SCRIPT, '--dir', join(root, 'shots'), ...args], { encoding: 'utf8' });

  it('passes when baselines match the index', () => {
    const root = tree({ free: { a: story('a--b') }, pngs: { 'visual-desktop': ['a--b.png'] } });
    expect(run(root, '--index', join(root, 'free.json')).status).toBe(0);
  });
  it('fails citing the orphan and the removal command', () => {
    const root = tree({ free: { a: story('a--b') }, pngs: { 'visual-desktop': ['a--b.png', 'fake--story.png'] } });
    const r = run(root, '--index', join(root, 'free.json'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('visual-desktop/fake--story.png');
    expect(r.stderr).toContain('git rm');
  });
  it('merges several indexes (a Pro-only story keeps its PNG)', () => {
    const root = tree({
      free: { a: story('a--b') },
      pro: { p: story('pro--x') },
      pngs: { 'visual-desktop': ['a--b.png', 'pro--x.png'] },
    });
    expect(run(root, '--index', join(root, 'free.json')).status).toBe(1);
    expect(run(root, '--index', join(root, 'free.json'), '--index', join(root, 'pro.json')).status).toBe(0);
  });
  it('errors explicitly when the index is missing (not "no orphans")', () => {
    const root = tree({ pngs: { 'visual-desktop': [] } });
    const r = run(root, '--index', join(root, 'absent.json'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('cannot read');
  });
  it.each(['visual-desktop', 'visual-tablet', 'visual-mobile'])('CLI fails on an orphan only in %s', (folder) => {
    const pngs = { 'visual-desktop': ['a--b.png'], 'visual-tablet': ['a--b.png'], 'visual-mobile': ['a--b.png'] };
    pngs[folder] = ['a--b.png', 'old--name.png'];
    const root = tree({ free: { a: story('a--b') }, pngs });
    const r = run(root, '--index', join(root, 'free.json'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`${folder}/old--name.png`);
  });
  it('CLI: Foo--Bar.png with id foo--bar is an orphan', () => {
    const root = tree({ free: { a: story('foo--bar') }, pngs: { 'visual-desktop': ['Foo--Bar.png'] } });
    const r = run(root, '--index', join(root, 'free.json'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Foo--Bar.png');
  });
  it('errors (exit 2) when the baselines folder does not exist', () => {
    const root = tree({ free: { a: story('a--b') }, pngs: {} });
    const r = spawnSync('node', [SCRIPT, '--dir', join(root, 'nope'), '--index', join(root, 'free.json')], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('baselines folder not found');
  });
  it('errors (exit 2) when the folder exists but has no visual-* subfolder', () => {
    const root = tree({ free: { a: story('a--b') }, pngs: { other: ['a--b.png'] } });
    const r = run(root, '--index', join(root, 'free.json'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('no visual-* folder');
  });
  it('errors (exit 2) on an unknown argument instead of ignoring it', () => {
    const root = tree({ free: { a: story('a--b') }, pngs: { 'visual-desktop': ['a--b.png'] } });
    const r = run(root, '--indx', join(root, 'free.json'));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown argument --indx');
  });
  it('readVisualIds refuses an index with no visual entry', () => {
    const root = tree({ free: { a: { id: 'a', type: 'story', tags: [] } }, pngs: {} });
    expect(() => readVisualIds(join(root, 'free.json'))).toThrow(/no entry tagged/);
  });
  it('readBaselines only reads visual-* folders', () => {
    const root = tree({ pngs: { 'visual-desktop': ['a.png'], other: ['b.png'] } });
    expect(readBaselines(join(root, 'shots'))).toEqual({ 'visual-desktop': ['a.png'] });
  });
});

describe('PAGE_BASELINE_IDS', () => {
  it('lists exactly the pages photographed by landing.spec.ts', () => {
    const src = readFileSync(resolve(dirname(SCRIPT), '../e2e/visual/landing.spec.ts'), 'utf8');
    const names = [...src.matchAll(/\{ name: '([^']+)'/g)].map((m) => m[1]);
    expect(names.sort()).toEqual([...PAGE_BASELINE_IDS].sort());
  });
  it('the CLI does not flag those PNGs', () => {
    const root = mkdtempSync(join(tmpdir(), 'visual-orphans-'));
    try {
      writeFileSync(join(root, 'i.json'), JSON.stringify({ entries: { a: { id: 'a--b', type: 'story', tags: ['visual'] } } }));
      mkdirSync(join(root, 'shots/visual-desktop'), { recursive: true });
      for (const n of ['a--b', ...PAGE_BASELINE_IDS]) writeFileSync(join(root, 'shots/visual-desktop', `${n}.png`), '');
      const r = spawnSync('node', [SCRIPT, '--dir', join(root, 'shots'), '--index', join(root, 'i.json')], { encoding: 'utf8' });
      expect(r.status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
