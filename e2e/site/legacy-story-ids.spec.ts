import { expect, test, type Page } from '@playwright/test';
// @ts-expect-error plain .mjs (inlined into the Storybook heads), no type declarations
import { LEGACY_STORY_IDS } from '../../.storybook/legacy-story-ids.mjs';
// @ts-expect-error plain .mjs helper (unit-tested from scripts/), no type declarations
import { legacyIndexProblems } from '../../scripts/legacy-story-ids-check.mjs';
// @ts-expect-error plain .mjs helper shared with the assembler and the server, no type declarations
import { SITE_BASE } from '../../scripts/site-config.mjs';
import { historyCalls, initialHref, PROBE, recordHistory } from '../helpers/legacy-redirect';

// Ticket #516 on the deploy builds, as published: the Free Storybook under storybook/ and the Pro demo
// under pro/, both below the Pages prefix (see playwright.site.config.ts). The same old URL must land on
// the same probe target in both, in the manager and in the preview, with no history entry of its own.

const base = SITE_BASE as string;

async function readEntries(page: Page, dir: 'storybook' | 'pro'): Promise<Record<string, unknown>> {
  const res = await page.request.get(`${dir}/index.json`);
  expect(res.status()).toBe(200);
  return (await res.json()).entries as Record<string, unknown>;
}

test.describe('renamed story ids: Free and Pro deploy builds (#516)', () => {
  test.beforeEach(async ({ page }) => {
    await recordHistory(page);
  });

  test('every new id exists in the Free or the Pro build, no old id exists in either', async ({ page }) => {
    const indexes = [
      { name: 'storybook/index.json (Free)', entries: await readEntries(page, 'storybook') },
      { name: 'pro/index.json (Pro)', entries: await readEntries(page, 'pro') },
    ];
    expect(legacyIndexProblems(LEGACY_STORY_IDS, indexes)).toEqual([]);
  });

  for (const dir of ['storybook', 'pro'] as const) {
    test.describe(`${dir}/`, () => {
      test('manager: the old story URL opens the new story; Back does not return to the old id', async ({ page }) => {
        // A real page of the same build as the origin of the navigation.
        await page.goto(`${dir}/iframe.html?id=${PROBE.story.new}&viewMode=story`);
        await expect(page.getByTestId('legacy-redirect-target')).toBeVisible({ timeout: 30_000 });
        const origin = page.url();

        await page.goto(`${dir}/?path=/story/${PROBE.story.old}`);
        const url = new URL(page.url());
        expect(url.pathname).toBe(`${base}${dir}/`);
        expect((await historyCalls(page))[0]).toEqual(['replaceState', `${url.origin}${base}${dir}/?path=/story/${PROBE.story.new}`]);
        await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe(`/story/${PROBE.story.new}`);
        await expect(page.locator('#storybook-preview-iframe')).toHaveAttribute(
          'src',
          new RegExp(`${base}${dir}/iframe\\.html\\?id=${PROBE.story.new}&`),
          { timeout: 30_000 },
        );
        await expect(page.frameLocator('#storybook-preview-iframe').getByTestId('legacy-redirect-target')).toBeVisible({ timeout: 30_000 });
        const frame = page.frame({ url: /iframe\.html/ })!;
        expect(await initialHref(frame)).toContain(`id=${PROBE.story.new}&`);

        await page.goBack();
        expect(page.url()).toBe(origin);
        expect(page.url()).not.toContain(PROBE.story.old);
      });

      test('iframe: the old story URL renders the new story, args kept', async ({ page }) => {
        await page.goto(`${dir}/iframe.html?id=${PROBE.story.old}&viewMode=story&args=label:Redirected`);
        await expect(page.getByTestId('legacy-redirect-target')).toHaveText('Redirected', { timeout: 30_000 });
        await expect(page.locator('body.sb-show-errordisplay')).toHaveCount(0);
        const url = new URL(page.url());
        expect(url.pathname).toBe(`${base}${dir}/iframe.html`);
        expect(url.searchParams.get('id')).toBe(PROBE.story.new);
      });
    });
  }

  test('storybook/: the old Docs URL opens the new Docs page (manager and iframe)', async ({ page }) => {
    await page.goto(`storybook/?path=/docs/${PROBE.docs.old}`);
    await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe(`/docs/${PROBE.docs.new}`);
    await expect(page.frameLocator('#storybook-preview-iframe').locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
    await page.goto(`storybook/iframe.html?id=${PROBE.docs.old}&viewMode=docs`);
    await expect(page.locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('id')).toBe(PROBE.docs.new);
  });

  test('an old id in a link to the site root: forwarded to storybook/ (site-root/redirect.mjs), then rewritten', async ({ page }) => {
    await page.goto(`?path=/story/${PROBE.story.old}`);
    await page.waitForURL((url) => url.pathname === `${base}storybook/` && url.searchParams.get('path') === `/story/${PROBE.story.new}`);
    await expect(page.frameLocator('#storybook-preview-iframe').getByTestId('legacy-redirect-target')).toBeVisible({ timeout: 30_000 });

    await page.goto(`iframe.html?id=${PROBE.story.old}&viewMode=story`);
    await page.waitForURL((url) => url.pathname === `${base}storybook/iframe.html` && url.searchParams.get('id') === PROBE.story.new);
    await expect(page.getByTestId('legacy-redirect-target')).toBeVisible({ timeout: 30_000 });
  });
});
