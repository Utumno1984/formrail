// @vitest-environment node
// Boundary of `@formrail/pro/tanstack-form` (ticket #508) on the SOURCES, with the walker of engine-boundary.test.ts:
// no module reached from `src/tanstack-form.ts` names `@formrail/core` or `react-hook-form`, and `@tanstack/*` is reached
// only by type-only syntax (decision 2a of #489: the adapter calls the methods of the form object, never the library,
// so no `batch` of `@tanstack/store` either). The built files are checked by `dist.tanstack-form.test.ts`.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importGraph, isCoreSpecifier, moduleImports, type GraphHost } from './import-graph';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ENTRY = `${SRC}tanstack-form.ts`;

const diskHost: GraphHost = { read: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined) };
const memoryHost = (files: Record<string, string>): GraphHost => ({
  read: (path) => (Object.hasOwn(files, path) ? files[path] : undefined),
});

const isTanStack = (specifier: string): boolean => /^@tanstack\//.test(specifier);
const isRhf = (specifier: string): boolean => /^react-hook-form(\/|$)/.test(specifier);

/** Every import of a module reached from `entry`, with the file that names it and whether it is type-only. */
function importsFrom(entry: string, host: GraphHost) {
  return importGraph(entry, host).files.flatMap((file) => moduleImports(host.read(file)!, file).map((found) => ({ from: file, ...found })));
}

/** The imports of `@tanstack/*` that can load it at runtime. */
const runtimeTanStack = (entry: string, host: GraphHost) => importsFrom(entry, host).filter((found) => isTanStack(found.specifier) && !found.typeOnly);

describe('@formrail/pro/tanstack-form: import graph of the sources', () => {
  it('reaches the adapter modules, the pure snapshot helpers and the contract types, not the components', () => {
    const files = importGraph(ENTRY, diskHost).files.map((file) => file.slice(SRC.length));
    expect(files).toEqual(
      expect.arrayContaining([
        'tanstack-form.ts',
        'integrations/tanstack-form/use-tanstack-form-binding.ts',
        'integrations/react-hook-form/snapshot.ts',
        'form-rebase/types.ts',
      ]),
    );
    // Not the React Hook Form adapter itself: only its library-free snapshot helpers.
    expect(files).not.toContain('integrations/react-hook-form/use-react-hook-form-binding.ts');
    expect(files.some((file) => /ChangeSummary\.tsx$|RebaseNotice\.tsx$|list-report\//.test(file))).toBe(false);
  });

  it('no module reached names @formrail/core or a subpath of it, nor react-hook-form', () => {
    const { edges } = importGraph(ENTRY, diskHost);
    expect(edges.filter((edge) => isCoreSpecifier(edge.specifier))).toEqual([]);
    expect(edges.filter((edge) => isRhf(edge.specifier))).toEqual([]);
  });

  it('@tanstack/* is reached, by type-only imports only (no batch of @tanstack/store, no form-core)', () => {
    const tanstack = importsFrom(ENTRY, diskHost).filter((found) => isTanStack(found.specifier));
    expect(tanstack.length).toBeGreaterThan(0);
    expect(runtimeTanStack(ENTRY, diskHost)).toEqual([]);
  });

  it('outside the package: react at runtime, @tanstack/react-form for the types, nothing else', () => {
    const external = importsFrom(ENTRY, diskHost).filter((found) => !found.specifier.startsWith('.'));
    expect([...new Set(external.filter((found) => !found.typeOnly).map((found) => found.specifier))].sort()).toEqual(['react']);
    expect([...new Set(external.filter((found) => found.typeOnly).map((found) => found.specifier))].sort()).toEqual(['@tanstack/react-form']);
  });

  it('the engine entry, the main entry and the React Hook Form entry reach no @tanstack/* at all (not even a type)', () => {
    for (const entry of ['engine.ts', 'index.ts', 'react-hook-form.ts']) {
      expect(importGraph(`${SRC}${entry}`, diskHost).edges.filter((edge) => isTanStack(edge.specifier))).toEqual([]);
    }
  });
});

// The copy-paste example of the story: what a reader without the core pastes (ticket #508).
const EXAMPLE_ALLOWED = new Set(['react', '@tanstack/react-form', '@formrail/pro/engine', '@formrail/pro/tanstack-form']);
const exampleIntruders = (source: string) => moduleImports(source, '/v/x.example.tsx').filter((found) => !EXAMPLE_ALLOWED.has(found.specifier));

describe('TanStackForm.example.tsx imports only react, @tanstack/react-form and the two Pro subpaths', () => {
  const source = readFileSync(`${SRC}integrations/tanstack-form/TanStackForm.example.tsx`, 'utf8');

  it('nothing else, no core', () => {
    expect(exampleIntruders(source)).toEqual([]);
    expect(new Set(moduleImports(source, 'x.tsx').map((found) => found.specifier))).toEqual(
      new Set(['react', '@tanstack/react-form', '@formrail/pro/engine', '@formrail/pro/tanstack-form']),
    );
  });

  it.each(["import { cn } from '@formrail/core';", "import { ChangeSummary } from '@formrail/pro';", "import { useForm } from 'react-hook-form';", "import { batch } from '@tanstack/store';"])(
    'negative: %s is found',
    (line) => {
      expect(exampleIntruders(`${source}\n${line}`)).toHaveLength(1);
    },
  );
});

describe('@tanstack runtime import guard: negative cases', () => {
  it.each([
    ["import { batch } from '@tanstack/store';"],
    ["import { useForm } from '@tanstack/react-form';"],
    ["import { type FormApi } from '@tanstack/form-core';"],
    ["import '@tanstack/form-core';"],
    ["export { batch } from '@tanstack/store';"],
    ["export * from '@tanstack/react-form';"],
    ["const lazy = () => import('@tanstack/store');"],
    ["const store = require('@tanstack/store');"],
    ["import store = require('@tanstack/store');"],
  ])('a runtime import two modules away is found: %s', (line) => {
    const host = memoryHost({
      '/v/entry.ts': "export { a } from './a';",
      '/v/a.ts': "import { b } from './deep/b';\nexport const a = b;",
      '/v/deep/b.ts': `${line}\nexport const b = 1;`,
    });
    expect(runtimeTanStack('/v/entry.ts', host)).toEqual([expect.objectContaining({ from: '/v/deep/b.ts', typeOnly: false })]);
  });

  it.each([
    ["import type { ReactFormExtendedApi } from '@tanstack/react-form';"],
    ["export type { FormApi } from '@tanstack/form-core';"],
    ["type F = import('@tanstack/react-form').ReactFormExtendedApi<any, any, any, any, any, any, any, any, any, any, any, any>;"],
    ['/// <reference types="@tanstack/react-form" />'],
    ["import type store = require('@tanstack/store');"],
  ])('a type-only import is not a runtime one: %s', (line) => {
    const host = memoryHost({ '/v/entry.ts': `${line}\nexport const b = 1;` });
    expect(importsFrom('/v/entry.ts', host).filter((found) => isTanStack(found.specifier))).toHaveLength(1);
    expect(runtimeTanStack('/v/entry.ts', host)).toEqual([]);
  });

  it('a core or react-hook-form import in the adapter graph is found as well', () => {
    const host = memoryHost({ '/v/entry.ts': "import type { cn } from '@formrail/core';\nimport type { Control } from 'react-hook-form';\nexport {};" });
    const { edges } = importGraph('/v/entry.ts', host);
    expect(edges.filter((edge) => isCoreSpecifier(edge.specifier))).toHaveLength(1);
    expect(edges.filter((edge) => isRhf(edge.specifier))).toHaveLength(1);
  });
});
