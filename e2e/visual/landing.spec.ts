import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
// @ts-expect-error plain .mjs helper, no type declarations
import { assembleSite } from '../../scripts/assemble-site.mjs';

// Visual baseline of the public landing page (ticket #382) at the three viewports of the visual
// projects. The landing is not a story: it is assembled into a temp folder (same assembler as the
// real site, early-access CTA included, with the committed EARLY_ACCESS_URL) and served through
// `page.route` under the Storybook origin, so no extra server or port is needed. The assembler
// needs the built Storybook only to validate its presence; it is already there for this project.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PREFIX = '/__landing__/';
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

let siteDir = '';
test.beforeAll(() => {
  siteDir = assembleSite({
    storybookDir: path.join(ROOT, 'storybook-static'),
    outDir: path.join(mkdtempSync(path.join(tmpdir(), 'rop-landing-')), 'site'),
  }) as string;
});

// The public pages of the site: the landing (#382), the Pro page for teams and the privacy notice (#490).
const PAGES = [
  { name: 'landing', path: '', heading: 'Formrail' },
  { name: 'teams', path: 'teams/', heading: 'Formrail Pro for teams' },
  { name: 'privacy', path: 'privacy/', heading: 'Privacy notice' },
] as const;

for (const { name, path: pagePath, heading } of PAGES) {
  test(`visual: ${name}`, async ({ page }, testInfo) => {
    if (testInfo.config.updateSnapshots !== 'none' && !process.env.VISUAL_DOCKER) {
      throw new Error(
        'visual: refusing to update baselines outside the pinned Docker image (VISUAL_DOCKER is not set). ' +
          'Run "npm run test:visual:update" instead; nothing was written.',
      );
    }
    await page.route(`**${PREFIX}**`, (route) => {
      let rel = new URL(route.request().url()).pathname.slice(PREFIX.length);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      try {
        route.fulfill({
          body: readFileSync(path.join(siteDir, rel)),
          contentType: TYPES[path.extname(rel)] ?? 'application/octet-stream',
        });
      } catch {
        route.fulfill({ status: 404, body: 'not found' });
      }
    });
    await page.goto(PREFIX + pagePath);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });
  });
}
