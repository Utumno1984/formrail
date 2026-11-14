// @vitest-environment node
// Boundary of `@formrail/pro/react-hook-form` (ticket #507) on the SOURCES, with the walker of engine-boundary.test.ts:
// no module reached from `src/react-hook-form.ts` names `@formrail/core`, and `react-hook-form` is reached only by
// type-only syntax (decision 2a of #489: the adapter calls the methods of the form object, never the library). The
// built files are checked by `dist.react-hook-form.test.ts`.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importGraph, isCoreSpecifier, moduleImports, type GraphHost } from './import-graph';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ENTRY = `${SRC}react-hook-form.ts`;

const diskHost: GraphHost = { read: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined) };
const memoryHost = (files: Record<string, string>): GraphHost => ({
  read: (path) => (Object.hasOwn(files, path) ? files[path] : undefined),
});

const isRhf = (specifier: string): boolean => /^react-hook-form(\/|$)/.test(specifier);

/** Every import of a module reached from `entry`, with the file that names it and whether it is type-only. */
function importsFrom(entry: string, host: GraphHost) {
  return importGraph(entry, host).files.flatMap((file) => moduleImports(host.read(file)!, file).map((found) => ({ from: file, ...found })));
}

/** The imports of `react-hook-form` that can load it at runtime. */
const runtimeRhf = (entry: string, host: GraphHost) => importsFrom(entry, host).filter((found) => isRhf(found.specifier) && !found.typeOnly);

describe('@formrail/pro/react-hook-form: import graph of the sources', () => {
  it('reaches the adapter modules and the contract types, not the components', () => {
    const files = importGraph(ENTRY, diskHost).files.map((file) => file.slice(SRC.length));
    expect(files).toEqual(
      expect.arrayContaining([
        'react-hook-form.ts',
        'integrations/react-hook-form/use-react-hook-form-binding.ts',
        'integrations/react-hook-form/snapshot.ts',
        'form-rebase/types.ts',
      ]),
    );
    expect(files.some((file) => /ChangeSummary\.tsx$|RebaseNotice\.tsx$|list-report\//.test(file))).toBe(false);
  });

  it('no module reached names @formrail/core or a subpath of it', () => {
    expect(importGraph(ENTRY, diskHost).edges.filter((edge) => isCoreSpecifier(edge.specifier))).toEqual([]);
  });

  it('react-hook-form is reached, by type-only imports only', () => {
    const rhf = importsFrom(ENTRY, diskHost).filter((found) => isRhf(found.specifier));
    expect(rhf.length).toBeGreaterThan(0);
    expect(runtimeRhf(ENTRY, diskHost)).toEqual([]);
  });

  it('outside the package: react at runtime, react-hook-form for the types, nothing else', () => {
    const external = importsFrom(ENTRY, diskHost).filter((found) => !found.specifier.startsWith('.'));
    expect([...new Set(external.filter((found) => !found.typeOnly).map((found) => found.specifier))].sort()).toEqual(['react']);
    expect([...new Set(external.filter((found) => found.typeOnly).map((found) => found.specifier))].sort()).toEqual(['react-hook-form']);
  });

  it('the engine entry and the main entry reach no react-hook-form at all (not even a type)', () => {
    for (const entry of ['engine.ts', 'index.ts']) {
      expect(importGraph(`${SRC}${entry}`, diskHost).edges.filter((edge) => isRhf(edge.specifier))).toEqual([]);
    }
  });
});

describe('react-hook-form runtime import guard: negative cases', () => {
  it.each([
    ["import { useWatch } from 'react-hook-form';"],
    ["import { type Control } from 'react-hook-form';"],
    ["import 'react-hook-form';"],
    ["export { useWatch } from 'react-hook-form';"],
    ["export * from 'react-hook-form';"],
    ["const lazy = () => import('react-hook-form');"],
    ["const rhf = require('react-hook-form');"],
    ["import rhf = require('react-hook-form');"],
  ])('a runtime import two modules away is found: %s', (line) => {
    const host = memoryHost({
      '/v/entry.ts': "export { a } from './a';",
      '/v/a.ts': "import { b } from './deep/b';\nexport const a = b;",
      '/v/deep/b.ts': `${line}\nexport const b = 1;`,
    });
    expect(runtimeRhf('/v/entry.ts', host)).toEqual([expect.objectContaining({ from: '/v/deep/b.ts', specifier: 'react-hook-form', typeOnly: false })]);
  });

  it.each([
    ["import type { Control } from 'react-hook-form';"],
    ["export type { Control } from 'react-hook-form';"],
    ["type C = import('react-hook-form').Control;"],
    ['/// <reference types="react-hook-form" />'],
    ["import type rhf = require('react-hook-form');"],
  ])('a type-only import is not a runtime one: %s', (line) => {
    const host = memoryHost({ '/v/entry.ts': `${line}\nexport const b = 1;` });
    expect(importsFrom('/v/entry.ts', host).filter((found) => isRhf(found.specifier))).toHaveLength(1);
    expect(runtimeRhf('/v/entry.ts', host)).toEqual([]);
  });

  it('a core import in the adapter graph is found as well', () => {
    const host = memoryHost({ '/v/entry.ts': "import type { cn } from '@formrail/core';\nexport {};" });
    expect(importGraph('/v/entry.ts', host).edges.filter((edge) => isCoreSpecifier(edge.specifier))).toHaveLength(1);
  });
});
