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
    // `Introduction` and `Showcase` first; the sections not listed keep their relative order.
    options: { storySort: { order: ['Introduction', 'Showcase'] } },
  },
};

export default preview;
