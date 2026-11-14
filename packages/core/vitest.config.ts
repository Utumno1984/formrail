import { configDefaults, defineConfig } from 'vitest/config';

// The demo-data performance budget (ticket #513) is a wall-clock measurement: it runs as its own
// project, after every other test file has finished (`sequence.groupOrder`), so the files that
// Vitest runs in parallel do not compete with it for the CPU. `include` is set per project: with
// `extends: true` a root `include` would be merged into the perf project too.
const PERF_TESTS = ['src/internal/demo-data/perf.test.ts'];

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Vitest blanks every `.css` module, `?raw` imports included. `cn()` reads tokens.css as
    // text (the single source of the token names), so let `?raw` imports through untouched.
    css: { include: [/\.css\?raw$/] },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, ...PERF_TESTS],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: { name: 'perf', include: PERF_TESTS, sequence: { groupOrder: 1 } },
      },
    ],
  },
});
