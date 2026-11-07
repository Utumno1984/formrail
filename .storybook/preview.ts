/// <reference types="vite/client" />
import type { Preview } from '@storybook/react-vite';
// The SAME entry the package compiles into dist/styles.css (not a copy).
import '../packages/core/src/styles/index.css';
import { ropTheme } from './theme';

// Storybook's native developer tools (grid / background / outline / measure) are for people building
// components, not for someone evaluating the published library, and they are easy to hit by accident
// on touch screens (the grid persists across pages and looks like a library defect, ticket #294).
// Hidden in every static build (the public deploy and the e2e/visual builds); available in the local
// dev server (`npm run storybook`) only. import.meta.env.PROD reflects Vite's actual build mode
// (set by the build command itself), unlike process.env.NODE_ENV which can leak an unrelated
// ambient value from whatever shell/CI/container runs the build.
const devToolsDisabled = import.meta.env.PROD;

const preview: Preview = {
  // Every meta gets a Docs tab (description from the JSDoc above the component, props table,
  // "Show code" per story). Internal fixtures opt out with `tags: ['!autodocs']`.
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { theme: ropTheme },
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
    options: { storySort: { order: ['Introduction', 'Showcase'] } },
  },
};

export default preview;
