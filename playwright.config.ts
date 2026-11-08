import { defineConfig, devices } from '@playwright/test';
import { VIEWPORTS } from './e2e/helpers/viewports';

// Overridable so parallel git worktrees can each serve their own build (default 6007).
const PORT = Number(process.env.PLAYWRIGHT_PORT) || 6007;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  // Policy on stale/missing builds: the server command ALWAYS rebuilds Storybook
  // before serving it, so tests never run against an old or absent `storybook-static/`
  // (a failing build makes the command, and therefore `test:e2e`, fail loudly).
  // `reuseExistingServer` is enabled only outside CI, for fast local iteration: in that
  // case whatever already listens on the port is used as-is (e.g. a server you started
  // yourself); stop it if you need a fresh build. In CI a busy port is an error.
  // `VISUAL_PREBUILT=1` (set by scripts/visual-docker.mjs, which builds Storybook on the host
  // before starting the container) skips the rebuild: the container only serves the static files.
  webServer: {
    command: `${process.env.VISUAL_PREBUILT ? '' : 'npm run build-storybook && '}npx http-server storybook-static -p ${PORT} -s -c-1`,
    url: `http://localhost:${PORT}/index.json`,
    reuseExistingServer: !isCI,
    timeout: 300_000,
  },
  // Visual regression: tolerance is declared here, once. Baselines are produced and compared
  // only inside the pinned Playwright Docker image, so the comparison is near-exact: at most
  // 10 differing pixels (sub-pixel noise guard) and a per-pixel YIQ threshold of 0.1.
  // A missing baseline is NEVER created implicitly ('none' => the test fails); baselines are
  // written only by `npm run test:visual:update`, which passes --update-snapshots explicitly.
  updateSnapshots: 'none',
  expect: { toHaveScreenshot: { maxDiffPixels: 10, threshold: 0.1 } },
  // `E2E_EXCLUDE_VISUAL=1` (set by `npm run test:e2e`) drops every `visual-*` project by name
  // pattern, so a project added later is part of test:e2e without touching the script.
  projects: [
    {
      name: 'chromium',
      testIgnore: /visual\//,
      grepInvert: /@touch/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Touch emulation, for tickets that need it. Opt-in by tag so that it does not
    // duplicate every test: tag tests with `@touch` to run them in this project.
    {
      name: 'chromium-touch',
      testIgnore: /visual\//,
      grep: /@touch/,
      use: { ...devices['Desktop Chrome'], hasTouch: true },
    },
    // Other engines, for the tests that must hold in all three (e.g. the declared 200,000-row ceiling of
    // the virtualized List Report: the maximum element height differs per engine). Opt-in by tag: tag a
    // test `@engines` to run it here too (it also runs in `chromium`).
    {
      name: 'firefox',
      testIgnore: /visual\//,
      grep: /@engines/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: /visual\//,
      grep: /@engines/,
      use: { ...devices['Desktop Safari'] },
    },
    // Viewport grid (spec §1.10): one baseline per story per viewport, viewport fixed.
    ...VIEWPORTS.map(([name, width, height]) => ({
      name: `visual-${name}`,
      testDir: './e2e/visual',
      // No retries: a screenshot that fails once and passes on retry would be reported "flaky"
      // with a green job, so "two consecutive runs both pass" would never be verified in CI.
      retries: 0,
      snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width, height },
        deviceScaleFactor: 1,
      },
    })),
  ].filter((p) => !(process.env.E2E_EXCLUDE_VISUAL && p.name.startsWith('visual-'))),
});
