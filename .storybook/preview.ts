import type { Preview } from '@storybook/react-vite';
// The SAME entry the package compiles into dist/styles.css (not a copy).
import '../packages/core/src/styles/index.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
    // `Showcase` first; the sections not listed keep their relative order.
    options: { storySort: { order: ['Showcase'] } },
  },
};

export default preview;
