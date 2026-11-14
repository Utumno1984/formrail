// @vitest-environment node
// `@formrail/pro/engine` on the BUILT files (run `npm run build` first; `npm run check` does), ticket #489:
// the entry and the chunks it reaches name no `@formrail/core`, in ESM, CJS and the declaration files; the two
// entries share their modules (no duplicated state); the entry renders on the server.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, useState } from 'react';
import { renderToString } from 'react-dom/server';
import * as esmEngine from '../dist/engine.js';
import * as esmIndex from '../dist/index.js';
import { distClosure, filesNamingCore } from './dist-closure';

type Engine = typeof import('../src/engine');
type Index = typeof import('../src/index');

const dist = (file: string): string => fileURLToPath(new URL(`../dist/${file}`, import.meta.url));
const require = createRequire(import.meta.url);
const cjsEngine = require(dist('engine.cjs')) as Engine;
const cjsIndex = require(dist('index.cjs')) as Index;

const ENGINE_FILES = ['engine.js', 'engine.cjs', 'engine.d.ts', 'engine.d.cts'];
const ENGINE_EXPORTS = ['computeChangeSummary', 'computeRebase', 'formatChangeValue', 'inferSegmentLabel', 'useChangeSummary', 'useFormRebase'];

describe('dist of @formrail/pro/engine', () => {
  it.each(ENGINE_FILES)('%s and the chunks it reaches never name @formrail/core', (file) => {
    expect(distClosure(dist(file)).length).toBeGreaterThan(0);
    expect(filesNamingCore(dist(file))).toEqual([]);
  });

  it('the main entry imports the engines from the engine files, not from a second copy', () => {
    expect(distClosure(dist('index.js'))).toContain(dist('engine.js'));
    expect(distClosure(dist('index.cjs'))).toContain(dist('engine.cjs'));
    // The once-per-path warnings live in the engine files only.
    for (const file of ['index.js', 'index.cjs']) expect(readFileSync(dist(file), 'utf8')).not.toContain('resetDiffWarnings');
    for (const file of ['engine.js', 'engine.cjs']) expect(readFileSync(dist(file), 'utf8')).toContain('function warnOnce');
  });

  it.each(['engine.js', 'engine.cjs'])('%s and its chunks contain no runtime licensing / network mechanism', (file) => {
    for (const reached of distClosure(dist(file))) {
      const code = readFileSync(reached, 'utf8');
      expect(code).not.toContain('fetch(');
      expect(code).not.toContain('XMLHttpRequest');
      expect(code).not.toContain('WebSocket');
      expect(code.match(/process\.env(?!\.NODE_ENV)/g)).toBeNull();
    }
  });

  it('the main entry, by contrast, names @formrail/core (the search is not blind)', () => {
    expect(filesNamingCore(dist('index.js')).length).toBeGreaterThan(0);
    expect(filesNamingCore(dist('index.d.ts')).length).toBeGreaterThan(0);
  });

  it('exports exactly the engines, in ESM and CJS', () => {
    const names = (mod: object) => Object.keys(mod).filter((key) => key !== '__esModule' && key !== 'default').sort();
    expect(names(esmEngine)).toEqual(ENGINE_EXPORTS);
    expect(names(cjsEngine)).toEqual(ENGINE_EXPORTS);
  });

  // `useFormRebase` of the main entry is a wrapper typed for core's form around the engine hook.
  it.each(ENGINE_EXPORTS.filter((name) => name !== 'useFormRebase'))('%s is the same function from both entries (one module, ESM and CJS)', (name) => {
    expect(esmEngine[name as keyof Engine]).toBe(esmIndex[name as keyof Index]);
    expect(cjsEngine[name as keyof Engine]).toBe(cjsIndex[name as keyof Index]);
  });

  it('a development warning is emitted once for both entries (the warning state is not duplicated)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      // A duplicate id under an id key: diffed as a block, with one development warning per path.
      const options = { baseline: { lines: [{ id: 1 }, { id: 1 }] }, values: { lines: [{ id: 1 }] }, arrayIdKeys: { lines: 'id' } };
      for (const api of [esmIndex, esmEngine]) api.computeChangeSummary(options);
      expect(warn).toHaveBeenCalledTimes(1);
      for (const api of [cjsIndex, cjsEngine]) api.computeChangeSummary(options);
      // The CJS build is a second copy of the package (as for any dual package), shared by its two entries.
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it('renders on the server: no window, no document', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    const baseline = { name: 'Acme', city: 'Turin' };
    function Probe() {
      const [values] = useState({ name: 'Acme Inc', city: 'Turin' });
      const summary = esmEngine.useChangeSummary({ values, baseline });
      const rebase = esmEngine.useFormRebase({ baseline, values, isSaving: false, saveError: null, reset: () => {}, setValues: () => {} });
      return createElement('p', null, `${summary.entries.map((entry) => entry.label).join(',')}|${rebase.conflicts.length}`);
    }
    expect(renderToString(createElement(Probe))).toBe('<p>Name|0</p>');
  });
});

describe('dist closure: negative cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'formrail-dist-closure-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each([
    ['ESM import of a chunk', "export { a } from './chunk-a.js';", 'chunk-a.js', "import { cn } from '@formrail/core';\nexport const a = cn;"],
    ['CJS require of a chunk', "module.exports = require('./chunk-a.cjs');", 'chunk-a.cjs', "exports.a = require('@formrail/core/internal');"],
    ['declaration file importing a declaration chunk', "export { A } from './types-a.js';", 'types-a.js', "import type { X } from '@formrail/core';\nexport type A = X;"],
  ])('%s naming core is found', (_label, entrySource, chunk, chunkSource) => {
    writeFileSync(join(dir, 'entry.js'), entrySource);
    writeFileSync(join(dir, chunk), chunkSource);
    expect(filesNamingCore(join(dir, 'entry.js'))).toEqual([join(dir, chunk)]);
  });

  it('a relative file that does not exist fails, it is never skipped', () => {
    writeFileSync(join(dir, 'entry.js'), "export * from './gone.js';");
    expect(() => distClosure(join(dir, 'entry.js'))).toThrow(/gone\.js: not found/);
  });
});
