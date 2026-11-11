import { defineConfig, devices } from '@playwright/test';
// @ts-expect-error plain .mjs helper shared with the assembler and the server, no type declarations
import { SITE_BASE, SITE_PORT } from './scripts/site-config.mjs';

// Pre-deploy smoke of the assembled Pages site (ticket #380): the `site/` folder produced by
// scripts/assemble-site.mjs, served locally under the same `/formrail/` prefix as the live
// site. NOT part of the PR e2e suite (playwright.config.ts ignores e2e/site/): it runs in the
// `deploy-pages` job, right before the artifact upload, and a failure there means no deploy.
//   npm run build && npm run build-storybook && node scripts/assemble-site.mjs && npm run test:site
export default defineConfig({
  testDir: './e2e/site',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-site' }]] : [['list']],
  // Trailing slash on purpose: tests navigate with relative URLs ('?path=...', 'storybook/').
  use: { baseURL: `http://localhost:${SITE_PORT}${SITE_BASE}`, trace: 'retain-on-failure' },
  // Serves what is already assembled; never rebuilds (the job assembles first, on purpose).
  webServer: {
    command: 'node scripts/serve-site.mjs',
    url: `http://localhost:${SITE_PORT}${SITE_BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
