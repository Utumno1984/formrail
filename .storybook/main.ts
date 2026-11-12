import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/react-vite';
import { docgenCompilerOptions, docgenExclude, docgenInclude, docgenPropFilter, docgenRelativePaths } from './docgen.ts';
// @ts-expect-error plain .mjs helper (unit-tested from scripts/), no type declarations
import { introductionPages, previewAnnotations, storyGlobs } from './story-globs.mjs';

const config: StorybookConfig = {
  // Props tables: react-docgen-typescript, not Storybook's default react-docgen (ticket #401).
  //
  // Why: react-docgen reads the syntax of the props type, not the type itself, so it lost every prop of
  // the composed types: `ListReport` (an `Omit<...>`, 0 props), `Accordion` (a union, 0 props),
  // `VirtualListReport` / `VirtualListReportTable` (types imported from @formrail/core, 1 and 3 props),
  // and the union members of `ListReportTable` (`aria-label` / `aria-labelledby` / `caption`: the
  // required accessible name), `Field` (`state` / `stateReason`), `Button` (`size`, the icon sizes'
  // required name). react-docgen-typescript asks the TypeScript checker, so all of them are there, with
  // their TSDoc: props before -> after, `ListReport` 0 -> 18, `Accordion` 0 -> 9, `VirtualListReport`
  // 1 -> 21, `VirtualListReportTable` 3 -> 17, `ListReportTable` 10 -> 14, `Field` 9 -> 11, `Button` 4 -> 8.
  //
  // Cost, measured on the same machine one build at a time (`npm run build-storybook`, 3 runs each,
  // load average below 1 before each run, nothing else running): 14.0-14.4 s with react-docgen,
  // 13.9-14.2 s with react-docgen-typescript, the transform of the docgen plugin itself 4.1-4.3 s vs
  // 2.5-2.9 s. The threshold set beforehand was +20 % (about +3 s) on this build, which every e2e and
  // visual CI job runs before its tests (minutes): above that, the plan was to stay on react-docgen and
  // compensate with explicit `argTypes` checked by the guard. Measured: no measurable difference, so the
  // engine that reads the real types is used, and the guard (e2e/docs-props.spec.ts) checks its output.
  //
  // `fileSystemCache: false`: the plugin's persistent cache keys a file by its own source, so a props
  // type changed in ANOTHER file could serve a stale table in a local build; the measured cost above is
  // the uncached one (as in CI, where node_modules is fresh), so the cache buys nothing worth that risk.
  // `docgenPropFilter`: see .storybook/docgen.ts (inherited HTML attributes out, redeclared ones in).
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      include: docgenInclude,
      exclude: docgenExclude,
      compilerOptions: docgenCompilerOptions,
      fileSystemCache: false,
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      propFilter: docgenPropFilter,
    },
  },
  // Core always; packages/pro unless STORYBOOK_EXCLUDE_PRO is set (Free deploy); only packages/pro with
  // STORYBOOK_EDITION=pro (Pro demo deploy). See story-globs.mjs.
  stories: [...(storyGlobs() as string[]), ...(introductionPages() as string[])],
  // Docs tab (autodocs, MDX pages): addon-docs is a separate package since Storybook 9.
  addons: ['@storybook/addon-docs'],
  // Favicon for the manager (see manager-head.html).
  staticDirs: ['./public'],
  // Absolute paths: relative ones would be resolved from the working directory, not `.storybook/`.
  previewAnnotations: (entry: string[] = []) => [
    ...entry,
    ...(previewAnnotations() as string[]).map((file) => fileURLToPath(new URL(file, import.meta.url))),
  ],
  framework: { name: '@storybook/react-vite', options: {} },
  // `disableProjectJson`: `project.json` (build metadata for Storybook's telemetry and hosted services,
  // read by nothing here) copies the options above into the published site, absolute docgen paths of the
  // build machine included (ticket #401).
  core: { disableTelemetry: true, disableProjectJson: true },
  // Unused here, and not free: on every DOM change under the story it re-runs `getComputedStyle` on
  // every element of the page, a cost the performance e2e would charge to the component.
  features: { highlight: false },
  // Same Tailwind pipeline as the published `styles.css` (packages/core/src/styles/index.css).
  // Pro stories import `@formrail/core`, whose package entry points at `dist/` (not built in
  // the e2e/visual jobs): resolve it to the sources instead, like the Free stories do.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), tailwindcss(), docgenRelativePaths()],
    resolve: {
      ...viteConfig.resolve,
      alias: [
        { find: /^@formrail\/core\/theme\.css$/, replacement: fileURLToPath(new URL('../packages/core/src/styles/tokens.css', import.meta.url)) },
        // `/internal` (ticket #230): Pro stories build their own table from these building blocks;
        // resolved to the source facade for the same reason as the bare specifier above.
        { find: /^@formrail\/core\/internal$/, replacement: fileURLToPath(new URL('../packages/core/src/internal.ts', import.meta.url)) },
        // The copy-paste examples of the Pro pages import `@formrail/pro` by name, as a consumer would (#403).
        { find: /^@formrail\/pro$/, replacement: fileURLToPath(new URL('../packages/pro/src/index.ts', import.meta.url)) },
        { find: /^@formrail\/core$/, replacement: fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)) },
        ...(Array.isArray(viteConfig.resolve?.alias) ? viteConfig.resolve.alias : Object.entries(viteConfig.resolve?.alias ?? {}).map(([find, replacement]) => ({ find, replacement }))),
      ],
    },
  }),
};

export default config;
