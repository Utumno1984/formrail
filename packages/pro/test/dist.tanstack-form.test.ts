// @vitest-environment node
// `@formrail/pro/tanstack-form` on the BUILT files (run `npm run build` first; `npm run check` does), ticket #508:
// the adapter files and what they reach never import `@tanstack/*` (types only) nor name `@formrail/core`; its
// declaration files name neither `@formrail/core` nor `react-hook-form`; the main entry, the engine entry and the
// React Hook Form entry never name `@tanstack/`, so a consumer without TanStack Form has no type error; the adapter
// bundles no second copy of an engine module; an app that uses both adapters loads the engines once; it renders on
// the server.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useForm } from '@tanstack/react-form';
import { useForm as useRhfForm } from 'react-hook-form';
import * as esmAdapter from '../dist/tanstack-form.js';
import * as esmRhf from '../dist/react-hook-form.js';
import * as esmEngine from '../dist/engine.js';
import { distClosure, filesNamingCore } from './dist-closure';

type Adapter = typeof import('../src/tanstack-form');

const dist = (file: string): string => fileURLToPath(new URL(`../dist/${file}`, import.meta.url));
const require = createRequire(import.meta.url);
const cjsAdapter = require(dist('tanstack-form.cjs')) as Adapter;

/** An import, export-from, dynamic import or require of a `@tanstack/` package in built code. */
const TANSTACK_IMPORT = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s+)(['"])@tanstack\/[^'"]*\1/;

/** The files of the closure of `entry` that import a `@tanstack/` package. */
const filesImportingTanStack = (entry: string): string[] => distClosure(entry).filter((file) => TANSTACK_IMPORT.test(readFileSync(file, 'utf8')));

/** The files of the closure of `entry` whose text names `@tanstack/` at all. */
const filesNamingTanStack = (entry: string): string[] => distClosure(entry).filter((file) => readFileSync(file, 'utf8').includes('@tanstack/'));

/** Source modules bundled into a built JS file, from the `// src/...` comment esbuild writes before each one. */
const modulesOf = (file: string): string[] => [...new Set(readFileSync(dist(file), 'utf8').match(/^\/\/ src\/\S+$/gm) ?? [])].map((line) => line.slice(3)).sort();

describe('dist of @formrail/pro/tanstack-form', () => {
  it.each(['tanstack-form.js', 'tanstack-form.cjs'])('%s and the files it reaches import no @tanstack/* and name no @formrail/core', (file) => {
    expect(distClosure(dist(file)).length).toBeGreaterThan(0);
    expect(filesImportingTanStack(dist(file))).toEqual([]);
    expect(filesNamingCore(dist(file))).toEqual([]);
  });

  it.each(['tanstack-form.d.ts', 'tanstack-form.d.cts'])('%s names no @formrail/core nor react-hook-form (it names @tanstack/react-form, for the types)', (file) => {
    expect(filesNamingCore(dist(file))).toEqual([]);
    for (const reached of distClosure(dist(file))) expect(readFileSync(reached, 'utf8')).not.toContain('react-hook-form');
    expect(readFileSync(dist(file), 'utf8')).toMatch(/import \{[^}]*\bReactFormExtendedApi\b[^}]*\} from '@tanstack\/react-form'/);
  });

  it.each(['index', 'engine', 'react-hook-form'].flatMap((entry) => ['js', 'cjs', 'd.ts', 'd.cts'].map((ext) => `${entry}.${ext}`)))(
    '%s and the files it reaches never name @tanstack/',
    (file) => {
      expect(filesNamingTanStack(dist(file))).toEqual([]);
    },
  );

  it('exports exactly the adapter, in ESM and CJS', () => {
    const names = (mod: object) => Object.keys(mod).filter((key) => key !== '__esModule' && key !== 'default').sort();
    expect(names(esmAdapter)).toEqual(['useTanStackFormBinding']);
    expect(names(cjsAdapter)).toEqual(['useTanStackFormBinding']);
  });

  it.each(['js', 'cjs'])('the .%s adapter bundles only its own modules: no second copy of an engine or of a shared helper', (ext) => {
    // (The CJS build also writes the comment of the entry file itself.) `internal/is-dev.ts` is the one module every
    // entry bundles on purpose (tsup.config.ts). The pure snapshot helpers of the React Hook Form adapter
    // (`snapshot.ts`, no state, no library) are bundled by both adapter files: an app that uses one adapter loads
    // nothing of the other.
    expect(modulesOf(`tanstack-form.${ext}`).filter((module) => module !== 'src/tanstack-form.ts')).toEqual([
      'src/integrations/react-hook-form/snapshot.ts',
      'src/integrations/tanstack-form/use-tanstack-form-binding.ts',
      'src/internal/is-dev.ts',
    ]);
    expect(distClosure(dist(`tanstack-form.${ext}`))).toContain(dist(`shared.${ext}`));
    const others = ['index', 'engine', 'shared'].flatMap((entry) => modulesOf(`${entry}.${ext}`));
    expect(modulesOf(`tanstack-form.${ext}`).filter((module) => module !== 'src/internal/is-dev.ts' && others.includes(module))).toEqual([]);
    // Neither adapter file reaches the other.
    expect(distClosure(dist(`tanstack-form.${ext}`))).not.toContain(dist(`react-hook-form.${ext}`));
    expect(distClosure(dist(`react-hook-form.${ext}`))).not.toContain(dist(`tanstack-form.${ext}`));
  });

  it.each(['tanstack-form.js', 'tanstack-form.cjs'])('%s and its files contain no runtime licensing / network mechanism', (file) => {
    for (const reached of distClosure(dist(file))) {
      const code = readFileSync(reached, 'utf8');
      expect(code).not.toContain('fetch(');
      expect(code).not.toContain('XMLHttpRequest');
      expect(code).not.toContain('WebSocket');
      expect(code.match(/process\.env(?!\.NODE_ENV)/g)).toBeNull();
    }
  });

  it('renders on the server with a real useForm: no window, no document', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    function Probe() {
      const form = useForm({ defaultValues: { name: 'Lumen Parts', city: 'Turin' } });
      const binding = esmAdapter.useTanStackFormBinding(form);
      const summary = esmEngine.useChangeSummary({ values: binding.values, baseline: binding.baseline });
      const rebase = esmEngine.useFormRebase(binding);
      return createElement('p', null, `${binding.values.name}|${summary.entries.length}|${rebase.conflicts.length}|${String(binding.isSaving)}`);
    }
    expect(renderToString(createElement(Probe))).toBe('<p>Lumen Parts|0|0|false</p>');
  });

  it('an app with both adapters: one engine module for both, a development warning once', () => {
    // Both adapter files import the same `engine.js` (no copy of the engines in either).
    expect(distClosure(dist('tanstack-form.js'))).not.toContain(dist('engine.js'));
    expect(readFileSync(dist('tanstack-form.js'), 'utf8')).not.toContain('function warnOnce');
    expect(readFileSync(dist('react-hook-form.js'), 'utf8')).not.toContain('function warnOnce');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const options = { baseline: { lines: [{ id: 1 }, { id: 1 }] }, values: { lines: [{ id: 1 }] }, arrayIdKeys: { lines: 'id' } };
      function Both() {
        const tanstack = esmAdapter.useTanStackFormBinding(useForm({ defaultValues: options.baseline }));
        const rhf = esmRhf.useReactHookFormBinding(useRhfForm({ defaultValues: options.baseline }));
        for (const binding of [tanstack, rhf]) esmEngine.useChangeSummary({ values: options.values, baseline: binding.baseline, arrayIdKeys: options.arrayIdKeys });
        return null;
      }
      renderToString(createElement(Both));
      // A duplicate id under an id key: one development warning per path, for both adapters together.
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('@tanstack import search on a dist: negative cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'formrail-dist-tanstack-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each([
    ['ESM import in a chunk', "export { a } from './chunk-a.js';", 'chunk-a.js', 'import { batch } from "@tanstack/store";\nexport const a = batch;'],
    ['CJS require in a chunk', "module.exports = require('./chunk-a.cjs');", 'chunk-a.cjs', "exports.a = require('@tanstack/form-core');"],
    ['dynamic import', "export { a } from './chunk-a.js';", 'chunk-a.js', "export const a = () => import('@tanstack/react-form');"],
    ['bare side-effect import', "export { a } from './chunk-a.js';", 'chunk-a.js', "import '@tanstack/store';\nexport const a = 1;"],
  ])('%s is found', (_label, entrySource, chunk, chunkSource) => {
    writeFileSync(join(dir, 'entry.js'), entrySource);
    writeFileSync(join(dir, chunk), chunkSource);
    expect(filesImportingTanStack(join(dir, 'entry.js'))).toEqual([join(dir, chunk)]);
  });

  it('the name in a comment or a string is not an import (but is found by the plain name search)', () => {
    writeFileSync(join(dir, 'entry.js'), '// binds a @tanstack/react-form form\nexport const name = "@tanstack/react-form adapter";');
    expect(filesImportingTanStack(join(dir, 'entry.js'))).toEqual([]);
    expect(filesNamingTanStack(join(dir, 'entry.js'))).toEqual([join(dir, 'entry.js')]);
  });
});
