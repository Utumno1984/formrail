import { resolve } from 'node:path';
import { defineConfig } from 'tsup';
import type { Plugin } from 'esbuild';

const ENGINE_SOURCE = resolve(import.meta.dirname, 'src/engine.ts');

/**
 * `@formrail/pro/engine` (#489) is the only copy of the engines: a module that imports `src/engine.ts` (the
 * main entry and the core-typed `useFormRebase`) gets `./engine.js` / `./engine.cjs` of the same `dist`, an
 * external import, instead of a second bundled copy. An app that imports both entries then loads the engine
 * modules once, with one module-level state (the once-per-path development warnings). The stateless helpers
 * the components share with the engines (value formatting, labels) are bundled in both entries.
 */
const engineEntryExternal: Plugin = {
  name: 'engine-entry-external',
  setup(build) {
    const target = build.initialOptions.format === 'cjs' ? './engine.cjs' : './engine.js';
    build.onResolve({ filter: /(^|\/)engine$/ }, (args) => {
      if (args.kind === 'entry-point' || resolve(args.resolveDir, `${args.path}.ts`) !== ENGINE_SOURCE) return undefined;
      return { path: target, external: true };
    });
  },
};

export default defineConfig({
  // `engine` (#489): `@formrail/pro/engine`, the engines without `@formrail/core`.
  entry: { index: 'src/index.ts', engine: 'src/engine.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'react/jsx-runtime', '@formrail/core', '@formrail/core/internal'],
  esbuildPlugins: [engineEntryExternal],
  // No shared chunks (tsup splits ESM by default): `dist/index.*` keeps all its own code, as before #489.
  splitting: false,
});
