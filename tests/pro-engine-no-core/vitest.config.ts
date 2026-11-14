import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['*.test.ts'],
    // Two `tsc` runs over react and react-hook-form declarations in a cold sandbox.
    testTimeout: 60_000,
  },
});
