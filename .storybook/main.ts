import tailwindcss from '@tailwindcss/vite';
import type { StorybookConfig } from '@storybook/react-vite';
// @ts-expect-error plain .mjs helper (unit-tested from scripts/), no type declarations
import { previewAnnotations, storyGlobs } from './story-globs.mjs';

const config: StorybookConfig = {
  // Core always; packages/pro unless STORYBOOK_EXCLUDE_PRO is set (public deploy: Free only).
  stories: storyGlobs() as string[],
  previewAnnotations: (entry: string[] = []) => [...entry, ...(previewAnnotations() as string[])],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
  // Same Tailwind pipeline as the published `styles.css` (packages/core/src/styles/index.css).
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
  }),
};

export default config;
