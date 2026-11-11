import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/react-vite';
// @ts-expect-error plain .mjs helper (unit-tested from scripts/), no type declarations
import { introductionPages, previewAnnotations, storyGlobs } from './story-globs.mjs';

const config: StorybookConfig = {
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
  core: { disableTelemetry: true },
  // Unused here, and not free: on every DOM change under the story it re-runs `getComputedStyle` on
  // every element of the page, a cost the performance e2e would charge to the component.
  features: { highlight: false },
  // Same Tailwind pipeline as the published `styles.css` (packages/core/src/styles/index.css).
  // Pro stories import `@formrail/core`, whose package entry points at `dist/` (not built in
  // the e2e/visual jobs): resolve it to the sources instead, like the Free stories do.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
    resolve: {
      ...viteConfig.resolve,
      alias: [
        { find: /^@formrail\/core\/theme\.css$/, replacement: fileURLToPath(new URL('../packages/core/src/styles/tokens.css', import.meta.url)) },
        // `/internal` (ticket #230): Pro stories build their own table from these building blocks;
        // resolved to the source facade for the same reason as the bare specifier above.
        { find: /^@formrail\/core\/internal$/, replacement: fileURLToPath(new URL('../packages/core/src/internal.ts', import.meta.url)) },
        { find: /^@formrail\/core$/, replacement: fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)) },
        ...(Array.isArray(viteConfig.resolve?.alias) ? viteConfig.resolve.alias : Object.entries(viteConfig.resolve?.alias ?? {}).map(([find, replacement]) => ({ find, replacement }))),
      ],
    },
  }),
};

export default config;
