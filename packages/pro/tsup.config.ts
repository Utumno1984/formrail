import { resolve } from 'node:path';
import { defineConfig } from 'tsup';
import type { Plugin } from 'esbuild';

const source = (path: string): string => resolve(import.meta.dirname, 'src', path);

const ENGINE_SOURCE = source('engine.ts');
const SHARED_ENTRY = source('internal/shared.ts');
/**
 * The modules `src/internal/shared.ts` re-exports (keep the two lists in sync; dist.engine.test.ts checks the
 * dist). Not `internal/is-dev.ts` (a three-line `process.env.NODE_ENV` read): each entry keeps its own copy, so
 * `dist/index.*` still holds the only environment read of the main entry, which dist.smoke.test.ts pins.
 */
const SHARED_SOURCES = new Set(
  ['change-summary/format-change-value.ts', 'change-summary/infer-label.ts', 'internal/use-isomorphic-layout-effect.ts'].map(source),
);

/**
 * One copy of each module in the dist, `is-dev` aside (#489). `@formrail/pro/engine` is the only copy of the engines: a module
 * that imports `src/engine.ts` (the main entry and the core-typed `useFormRebase`) gets `./engine.js` /
 * `./engine.cjs` of the same `dist`, an external import, instead of a second bundled copy. An app that imports
 * both entries then loads the engine modules once, with one module-level state (the once-per-path development
 * warnings). In the same way the stateless helpers that the engines and the components of the main entry both
 * use (value formatting, labels) live in `./shared.js` / `./shared.cjs`, which both entries import: a module
 * outside those helpers that imports one of them gets the shared file. Between themselves the helpers are
 * bundled (`format-change-value` imports `infer-label`), so `shared.*` is self-contained.
 *
 * Only extensionless relative specifiers are rewritten (`../engine`, `./infer-label`): the entry points come
 * with their extension (`src/engine.ts` resolves to `src/engine.ts.ts`), so they never match and are always
 * bundled; no separate `kind === 'entry-point'` check is needed.
 */
const oneCopyPerModule: Plugin = {
  name: 'one-copy-per-module',
  setup(build) {
    const cjs = build.initialOptions.format === 'cjs';
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      const target = resolve(args.resolveDir, `${args.path}.ts`);
      if (target === ENGINE_SOURCE) return { path: cjs ? './engine.cjs' : './engine.js', external: true };
      if (SHARED_SOURCES.has(target) && !SHARED_SOURCES.has(args.importer) && args.importer !== SHARED_ENTRY) {
        return { path: cjs ? './shared.cjs' : './shared.js', external: true };
      }
      return undefined;
    });
  },
};

export default defineConfig({
  // `engine` (#489): `@formrail/pro/engine`, the engines without `@formrail/core`. `shared`: the stateless
  // helpers of both entries, imported by them only (not a public subpath, so no declarations).
  entry: { index: 'src/index.ts', engine: 'src/engine.ts', shared: 'src/internal/shared.ts' },
  format: ['esm', 'cjs'],
  dts: { entry: { index: 'src/index.ts', engine: 'src/engine.ts' } },
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'react/jsx-runtime', '@formrail/core', '@formrail/core/internal'],
  esbuildPlugins: [oneCopyPerModule],
  // No automatic shared chunks (tsup splits ESM by default): they would move most of the code out of
  // `dist/index.js`. The files shared between the entries are the explicit ones above.
  splitting: false,
});
