// @vitest-environment node
// Boundary of `@formrail/pro/engine` (ticket #489) on the SOURCES: no module reached from `src/engine.ts`
// names `@formrail/core` or one of its subpaths, by any syntax, not even for a type. The built files are
// checked by `dist.engine.test.ts`.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importGraph, isCoreSpecifier, moduleSpecifiers, type GraphHost } from './import-graph';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ENGINE = `${SRC}engine.ts`;

const diskHost: GraphHost = { read: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined) };

/** A host over an in-memory tree rooted at `/v/`. */
const memoryHost = (files: Record<string, string>): GraphHost => ({
  read: (path) => (Object.hasOwn(files, path) ? files[path] : undefined),
});

const coreEdges = (entry: string, host: GraphHost) => importGraph(entry, host).edges.filter((edge) => isCoreSpecifier(edge.specifier));

describe('@formrail/pro/engine: import graph of the sources', () => {
  it('reaches the engine modules (the walk follows the relative imports)', () => {
    const files = importGraph(ENGINE, diskHost).files.map((file) => file.slice(SRC.length));
    expect(files).toEqual(
      expect.arrayContaining([
        'engine.ts',
        'change-summary/compute-change-summary.ts',
        'change-summary/use-change-summary.ts',
        'form-rebase/compute-rebase.ts',
        'form-rebase/use-form-rebase.ts',
        'form-rebase/types.ts',
        'internal/structural-diff.ts',
      ]),
    );
    // Visual components stay out: they use core's tokens and `cn`.
    expect(files.some((file) => /ChangeSummary\.tsx$|RebaseNotice\.tsx$|list-report\//.test(file))).toBe(false);
  });

  it('no module reached names @formrail/core or a subpath of it', () => {
    expect(coreEdges(ENGINE, diskHost)).toEqual([]);
  });

  it('only react and react-dom outside the package', () => {
    const external = new Set(
      importGraph(ENGINE, diskHost)
        .edges.map((edge) => edge.specifier)
        .filter((specifier) => !specifier.startsWith('.')),
    );
    expect([...external].sort()).toEqual(['react', 'react-dom']);
  });

  it('the main entry, by contrast, does reach @formrail/core (the guard is not blind)', () => {
    expect(coreEdges(`${SRC}index.ts`, diskHost).length).toBeGreaterThan(0);
  });
});

describe('import graph guard: negative cases', () => {
  it.each([
    ["import type { UseObjectPageFormReturn } from '@formrail/core';", '@formrail/core'],
    ["import { type cn } from '@formrail/core';", '@formrail/core'],
    ["export type { ListReportTableProps } from '@formrail/core/internal';", '@formrail/core/internal'],
    ["export * from '@formrail/core';", '@formrail/core'],
    ["type F = import('@formrail/core').UseObjectPageFormReturn<object>;", '@formrail/core'],
    ["const lazy = () => import('@formrail/core/internal');", '@formrail/core/internal'],
    ["const core = require('@formrail/core');", '@formrail/core'],
    ["import core = require('@formrail/core');", '@formrail/core'],
    ['/// <reference types="@formrail/core" />\nexport {};', '@formrail/core'],
  ])('an import two modules away is found: %s', (line, specifier) => {
    const host = memoryHost({
      '/v/engine.ts': "export { a } from './a';",
      '/v/a.ts': "import { b } from './deep/b';\nexport const a = b;",
      '/v/deep/b.ts': `${line}\nexport const b = 1;`,
    });
    expect(coreEdges('/v/engine.ts', host)).toEqual([{ from: '/v/deep/b.ts', specifier }]);
  });

  it('a similar name is not core', () => {
    expect(moduleSpecifiers("import x from '@formrail/core-extra';", '/v/x.ts').filter(isCoreSpecifier)).toEqual([]);
    expect(moduleSpecifiers("import x from '@formrail/pro';", '/v/x.ts').filter(isCoreSpecifier)).toEqual([]);
  });

  it('a relative import that resolves to no file fails the walk, it is never skipped', () => {
    const host = memoryHost({ '/v/engine.ts': "export { a } from './missing';" });
    expect(() => importGraph('/v/engine.ts', host)).toThrow(/cannot resolve \.\/missing/);
  });
});
