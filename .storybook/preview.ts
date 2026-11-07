import type { Preview } from '@storybook/react-vite';
// The SAME entry the package compiles into dist/styles.css (not a copy).
import '../packages/core/src/styles/index.css';
import { ropTheme } from './theme';

const preview: Preview = {
  // Every meta gets a Docs tab (description from the JSDoc above the component, props table,
  // "Show code" per story). Internal fixtures opt out with `tags: ['!autodocs']`.
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: { theme: ropTheme },
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
