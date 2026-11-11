import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { Plugin } from 'esbuild';
import { defineConfig } from 'tsup';

// `import css from './x.css?raw'` -> the CSS text as a string (comments stripped), the same
// behaviour Vite/Vitest provide natively, so tokens.css stays the single source for cn().
const cssRaw: Plugin = {
  name: 'css-raw',
  setup(build) {
    build.onResolve({ filter: /\.css\?raw$/ }, (args) => ({
      // Keep the `?raw` suffix on the virtual path so esbuild does not pick the css loader.
      // Package-relative, so no machine-specific path ends up in dist/ or in the sourcemaps.
      path: relative(process.cwd(), resolve(args.resolveDir, args.path)),
      namespace: 'css-raw',
    }));
    build.onLoad({ filter: /.*/, namespace: 'css-raw' }, (args) => {
      const css = readFileSync(resolve(args.path.replace(/\?raw$/, '')), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      return { contents: `export default ${JSON.stringify(css)};`, loader: 'js', resolveDir: dirname(resolve(args.path)) };
    });
  },
};

export default defineConfig({
  // Two entries: the public API and `/internal` (facade for @formrail/pro, no semver
  // guarantee). `splitting: true` makes esbuild hoist the code they share — most of the List
  // Report, since `internal.ts` exports the exact building blocks `index.ts`'s `ListReportTable`/
  // `ListReport` are made of — into one shared chunk both entries import, instead of bundling two
  // copies (which would duplicate module-level state, e.g. React Context instances, silently).
  // Verified on the built `dist/` by `test/internal-identity.test.ts` (ESM and CJS).
  entry: { index: 'src/index.ts', internal: 'src/internal.ts' },
  format: ['esm', 'cjs'],
  splitting: true,
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  esbuildPlugins: [cssRaw],
});
