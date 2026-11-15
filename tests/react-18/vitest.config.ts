import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  // The core sources live outside this workspace and would resolve the root's React 19: pin
  // react / react-dom (and the JSX runtime) to this workspace's React 18, or the test would
  // exercise 19 while claiming 18.
  resolve: {
    alias: [
      { find: /^react$/, replacement: here('./node_modules/react') },
      { find: /^react\/jsx-runtime$/, replacement: here('./node_modules/react/jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: here('./node_modules/react/jsx-dev-runtime.js') },
      { find: /^react-dom$/, replacement: here('./node_modules/react-dom') },
      { find: /^react-dom\/client$/, replacement: here('./node_modules/react-dom/client.js') },
      // The scroll-lock libraries behind Radix's Dialog resolve to their CommonJS build, which
      // `require`s the root's React 19 whatever is aliased here: point them at the ES build so the
      // aliases above apply (without this a Dialog backdrop renders React 19 elements under 18).
      ...['react-remove-scroll-bar', 'react-remove-scroll', 'react-style-singleton', 'use-callback-ref', 'use-sidecar'].map(
        (name) => ({
          find: new RegExp(`^${name}$`),
          replacement: here(`../../node_modules/${name}/dist/es2015/index.js`),
        }),
      ),
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['*.test.{ts,tsx}'],
    // Radix lives in the root node_modules and would be loaded un-transformed with the root's
    // React 19; inlining it makes the aliases above apply to it too. Same for the scroll-lock
    // libraries Radix's Dialog depends on (they render React elements themselves). React Hook Form too (#507):
    // `useForm` calls React's hooks, which must be this workspace's React 18.
    server: {
      deps: {
        inline: [/@radix-ui/, /react-remove-scroll/, /react-style-singleton/, /use-callback-ref/, /use-sidecar/, /react-hook-form/],
      },
    },
    // Core sources import tokens.css as text (`?raw`); Vitest would blank it otherwise.
    css: { include: [/\.css\?raw$/] },
  },
});
