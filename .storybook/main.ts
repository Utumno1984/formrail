import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/react-vite';
// @ts-expect-error plain .mjs helper (unit-tested from scripts/), no type declarations
import { previewAnnotations, storyGlobs } from './story-globs.mjs';

const config: StorybookConfig = {
  // Core always; packages/pro unless STORYBOOK_EXCLUDE_PRO is set (public deploy: Free only).
  stories: storyGlobs() as string[],
  // Absolute paths: relative ones would be resolved from the working directory, not `.storybook/`.
  previewAnnotations: (entry: string[] = []) => [
    ...entry,
    ...(previewAnnotations() as string[]).map((file) => fileURLToPath(new URL(file, import.meta.url))),
  ],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  // Same Tailwind pipeline as the published `styles.css` (packages/core/src/styles/index.css).
  // Pro stories import `@react-object-page/core`, whose package entry points at `dist/` (not built in
  // the e2e/visual jobs): resolve it to the sources instead, like the Free stories do.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
    resolve: {
      ...viteConfig.resolve,
      alias: [
        { find: /^@react-object-page\/core\/theme\.css$/, replacement: fileURLToPath(new URL('../packages/core/src/styles/tokens.css', import.meta.url)) },
        { find: /^@react-object-page\/core$/, replacement: fileURLToPath(new URL('../packages/core/src/index.ts', import.meta.url)) },
        ...(Array.isArray(viteConfig.resolve?.alias) ? viteConfig.resolve.alias : Object.entries(viteConfig.resolve?.alias ?? {}).map(([find, replacement]) => ({ find, replacement }))),
      ],
    },
  }),
};

export default config;
