/// <reference types="vite/client" />
import type { Preview } from '@storybook/react-vite';
// The SAME entry the package compiles into dist/styles.css (not a copy).
import '../packages/core/src/styles/index.css';
import { createElement, lazy, Suspense } from 'react';
import { transformSource } from './source-transform';
import { ropTheme } from './theme';

// Storybook's native developer tools (grid / background / outline / measure) are for people building
// components, not for someone evaluating the published library, and they are easy to hit by accident
// on touch screens (the grid persists across pages and looks like a library defect, ticket #294).
// Hidden in every static build (the public deploy and the e2e/visual builds); available in the local
// dev server (`npm run storybook`) only. import.meta.env.PROD reflects Vite's actual build mode
// (set by the build command itself), unlike process.env.NODE_ENV which can leak an unrelated
// ambient value from whatever shell/CI/container runs the build.
const devToolsDisabled = import.meta.env.PROD;

// The Docs page template (./docs-page.tsx), loaded only when a Docs page renders: it imports
// `@storybook/addon-docs/blocks`, whose `components` chunk registers a window `beforeunload` listener at
// module load. Imported eagerly here it would be in every story's iframe too, where the e2e count the
// page's own `beforeunload` listeners (showcase-edit-flow) and where a story should run exactly as before.
const LazyDocsPage = lazy(() => import('./docs-page').then((m) => ({ default: m.FormrailDocsPage })));
function FormrailDocsPage() {
  return createElement(Suspense, { fallback: null }, createElement(LazyDocsPage));
}

const preview: Preview = {
  // Every meta gets a Docs tab (description from the JSDoc above the component, props table,
  // "Show code" per story). Internal fixtures opt out with `tags: ['!autodocs']`.
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      theme: ropTheme,
      // Example first, then the Playground with the Controls, then the other stories (ticket #403). Pages
      // without a copy-paste example get Storybook's own template: see ./docs-page.tsx.
      page: FormrailDocsPage,
      source: {
        // "Show code" defaults to `dynamic` (JSX synthesized from the rendered tree, with the live args):
        // right for `render: (args) => <X {...args} />` and for stories with no render of their own
        // (`export const Playground: Story = {}`, where `type: 'code'` would print just `{}`). But a `render`
        // that declares a local stateful component and renders it (`function XyzDemo() {...}; return <XyzDemo />`,
        // ~27 stories) collapses into a minified placeholder such as `<t />` (ticket #333). For exactly those
        // stories, print the story's original source text instead (see ./source-transform.ts for the exact
        // rule). Guarded by e2e/docs-source.spec.ts on every story of every Docs page.
        transform: transformSource,
      },
    },
    backgrounds: { disable: devToolsDisabled },
    outline: { disable: devToolsDisabled },
    measure: { disable: devToolsDisabled },
    // Viewport toolbar (built into Storybook core since 9: `storybook/viewport`, no separate addon
    // package). Presets mirror the `visual-mobile|tablet|desktop` projects in playwright.config.ts,
    // so what you see in the canvas is what the visual regression captures. The default stays the
    // responsive (full-width) viewport: existing stories render exactly as before.
    viewport: {
      options: {
        mobile: { name: 'Mobile (375×667)', styles: { width: '375px', height: '667px' }, type: 'mobile' },
        tablet: { name: 'Tablet (768×1024)', styles: { width: '768px', height: '1024px' }, type: 'tablet' },
        desktop: { name: 'Desktop (1280×800)', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
      },
    },
    // `Introduction` and `Showcase` first; the sections not listed keep their relative order.
    options: { storySort: { order: ['Introduction', 'Pro introduction', 'Showcase'] } },
  },
};

export default preview;
