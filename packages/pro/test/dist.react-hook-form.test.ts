// @vitest-environment node
// `@formrail/pro/react-hook-form` on the BUILT files (run `npm run build` first; `npm run check` does), ticket #507:
// the adapter files and what they reach never import `react-hook-form` (types only) nor name `@formrail/core`; the
// main entry and the engine entry never name `react-hook-form`, so a consumer without it has no type error; the
// adapter bundles no second copy of an engine module; it renders on the server.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import * as esmAdapter from '../dist/react-hook-form.js';
import * as esmEngine from '../dist/engine.js';
import { distClosure, filesNamingCore } from './dist-closure';

type Adapter = typeof import('../src/react-hook-form');

const dist = (file: string): string => fileURLToPath(new URL(`../dist/${file}`, import.meta.url));
const require = createRequire(import.meta.url);
const cjsAdapter = require(dist('react-hook-form.cjs')) as Adapter;

/** An import, export-from, dynamic import or require of `react-hook-form` (or a subpath) in built code. */
const RHF_IMPORT = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s+)(['"])react-hook-form(?:\/[^'"]*)?\1/;

/** The files of the closure of `entry` that import `react-hook-form`. */
const filesImportingRhf = (entry: string): string[] => distClosure(entry).filter((file) => RHF_IMPORT.test(readFileSync(file, 'utf8')));

/** The files of the closure of `entry` whose text names `react-hook-form` at all. */
const filesNamingRhf = (entry: string): string[] => distClosure(entry).filter((file) => readFileSync(file, 'utf8').includes('react-hook-form'));

/** Source modules bundled into a built JS file, from the `// src/...` comment esbuild writes before each one. */
const modulesOf = (file: string): string[] => [...new Set(readFileSync(dist(file), 'utf8').match(/^\/\/ src\/\S+$/gm) ?? [])].map((line) => line.slice(3)).sort();

describe('dist of @formrail/pro/react-hook-form', () => {
  it.each(['react-hook-form.js', 'react-hook-form.cjs'])('%s and the files it reaches import no react-hook-form and name no @formrail/core', (file) => {
    expect(distClosure(dist(file)).length).toBeGreaterThan(0);
    expect(filesImportingRhf(dist(file))).toEqual([]);
    expect(filesNamingCore(dist(file))).toEqual([]);
  });

  it.each(['react-hook-form.d.ts', 'react-hook-form.d.cts'])('%s names no @formrail/core (it names react-hook-form, for the types)', (file) => {
    expect(filesNamingCore(dist(file))).toEqual([]);
    expect(readFileSync(dist(file), 'utf8')).toMatch(/import \{[^}]*\bUseFormReturn\b[^}]*\} from 'react-hook-form'/);
  });

  it.each(['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts', 'engine.js', 'engine.cjs', 'engine.d.ts', 'engine.d.cts'])(
    '%s and the files it reaches never name react-hook-form',
    (file) => {
      expect(filesNamingRhf(dist(file))).toEqual([]);
    },
  );

  it('exports exactly the adapter, in ESM and CJS', () => {
    const names = (mod: object) => Object.keys(mod).filter((key) => key !== '__esModule' && key !== 'default').sort();
    expect(names(esmAdapter)).toEqual(['useReactHookFormBinding']);
    expect(names(cjsAdapter)).toEqual(['useReactHookFormBinding']);
  });

  it.each(['js', 'cjs'])('the .%s adapter bundles only its own modules: no second copy of an engine or of a shared helper', (ext) => {
    // (The CJS build also writes the comment of the entry file itself.)
    expect(modulesOf(`react-hook-form.${ext}`).filter((module) => module !== 'src/react-hook-form.ts')).toEqual([
      'src/integrations/react-hook-form/snapshot.ts',
      'src/integrations/react-hook-form/use-react-hook-form-binding.ts',
    ]);
    // The layout-effect helper comes from the shared file both other entries import.
    expect(distClosure(dist(`react-hook-form.${ext}`))).toContain(dist(`shared.${ext}`));
    const others = ['index', 'engine', 'shared'].flatMap((entry) => modulesOf(`${entry}.${ext}`));
    expect(modulesOf(`react-hook-form.${ext}`).filter((module) => others.includes(module))).toEqual([]);
  });

  it.each(['react-hook-form.js', 'react-hook-form.cjs'])('%s and its files contain no runtime licensing / network mechanism', (file) => {
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
      const form = useForm({ defaultValues: { name: 'Acme', city: 'Turin' } });
      const binding = esmAdapter.useReactHookFormBinding(form);
      const summary = esmEngine.useChangeSummary({ values: binding.values, baseline: binding.baseline });
      const rebase = esmEngine.useFormRebase(binding);
      return createElement('p', null, `${binding.values.name}|${summary.entries.length}|${rebase.conflicts.length}|${String(binding.isSaving)}`);
    }
    expect(renderToString(createElement(Probe))).toBe('<p>Acme|0|0|false</p>');
  });
});

describe('react-hook-form import search on a dist: negative cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'formrail-dist-rhf-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each([
    ['ESM import in a chunk', "export { a } from './chunk-a.js';", 'chunk-a.js', 'import { useWatch } from "react-hook-form";\nexport const a = useWatch;'],
    ['CJS require in a chunk', "module.exports = require('./chunk-a.cjs');", 'chunk-a.cjs', "exports.a = require('react-hook-form');"],
    ['dynamic import of a subpath', "export { a } from './chunk-a.js';", 'chunk-a.js', "export const a = () => import('react-hook-form/dist/x.js');"],
    ['bare side-effect import', "export { a } from './chunk-a.js';", 'chunk-a.js', "import 'react-hook-form';\nexport const a = 1;"],
  ])('%s is found', (_label, entrySource, chunk, chunkSource) => {
    writeFileSync(join(dir, 'entry.js'), entrySource);
    writeFileSync(join(dir, chunk), chunkSource);
    expect(filesImportingRhf(join(dir, 'entry.js'))).toEqual([join(dir, chunk)]);
  });

  it('the name in a comment or a string is not an import (but is found by the plain name search)', () => {
    writeFileSync(join(dir, 'entry.js'), '// binds a react-hook-form form\nexport const name = "react-hook-form adapter";');
    expect(filesImportingRhf(join(dir, 'entry.js'))).toEqual([]);
    expect(filesNamingRhf(join(dir, 'entry.js'))).toEqual([join(dir, 'entry.js')]);
  });
});
