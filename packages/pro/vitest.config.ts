import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // The story-only `src/showcase/` tests (#377) render the Free CRUD showcase from the core sources, whose
    // `cn()` reads tokens.css as text: let `?raw` imports through, as core's own vitest config does.
    css: { include: [/\.css\?raw$/] },
  },
});
