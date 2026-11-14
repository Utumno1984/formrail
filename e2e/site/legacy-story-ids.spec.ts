import { expect, test, type FrameLocator, type Page } from '@playwright/test';
// @ts-expect-error plain .mjs (inlined into the Storybook heads), no type declarations
import { LEGACY_STORY_IDS } from '../../.storybook/legacy-story-ids.mjs';
// @ts-expect-error plain .mjs helper (unit-tested from scripts/), no type declarations
import { legacyIndexProblems } from '../../scripts/legacy-story-ids-check.mjs';
// @ts-expect-error plain .mjs helper shared with the assembler and the server, no type declarations
import { SITE_BASE } from '../../scripts/site-config.mjs';
import { historyCalls, initialHref, PROBE, recordHistory } from '../helpers/legacy-redirect';

// Ticket #516 on the deploy builds, as published: the Free Storybook under storybook/ and the Pro demo
// under pro/, both below the Pages prefix (see playwright.site.config.ts). An old URL must land on a
// rendered story in both, in the manager and in the preview, with no history entry of its own.

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

  // The Free build is probed with the fixture (`--default`), the Pro demo, which carries no internal fixture, with
  // `--pro`, which lands on a public Pro story.
  for (const [dir, probe, args] of [
    ['storybook', PROBE.story, 'label:Redirected'],
    ['pro', PROBE.pro, 'pending:!true'],
  ] as const) {
    /** The preview of `target` (a page or the manager's frame) rendered the story, not an error page. */
    const expectRendered = async (target: Page | FrameLocator) => {
      await expect(target.locator('#storybook-root > *').first()).toBeAttached({ timeout: 30_000 });
      await expect(target.locator('body.sb-show-errordisplay')).toHaveCount(0);
    };

    test.describe(`${dir}/`, () => {
      test(`manager: the old story URL (${probe.old}) opens the new story; Back does not return to the old id`, async ({ page }) => {
        // A real page of the same build as the origin of the navigation.
        await page.goto(`${dir}/iframe.html?id=${probe.new}&viewMode=story`);
        await expectRendered(page);
        const origin = page.url();

        await page.goto(`${dir}/?path=/story/${probe.old}`);
        const url = new URL(page.url());
        expect(url.pathname).toBe(`${base}${dir}/`);
        expect((await historyCalls(page))[0]).toEqual(['replaceState', `${url.origin}${base}${dir}/?path=/story/${probe.new}`]);
        await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe(`/story/${probe.new}`);
        await expect(page.locator('#storybook-preview-iframe')).toHaveAttribute(
          'src',
          new RegExp(`${base}${dir}/iframe\\.html\\?id=${probe.new}&`),
          { timeout: 30_000 },
        );
        await expectRendered(page.frameLocator('#storybook-preview-iframe'));
        const frame = page.frame({ url: /iframe\.html/ })!;
        expect(await initialHref(frame)).toContain(`id=${probe.new}&`);

        await page.goBack();
        expect(page.url()).toBe(origin);
        expect(page.url()).not.toContain(probe.old);
      });

      test(`iframe: the old story URL (${probe.old}) renders the new story, args kept`, async ({ page }) => {
        await page.goto(`${dir}/iframe.html?id=${probe.old}&viewMode=story&args=${args}`);
        const first = (await historyCalls(page))[0];
        expect(first).toEqual(['replaceState', `${new URL(page.url()).origin}${base}${dir}/iframe.html?id=${probe.new}&viewMode=story&args=${args}`]);
        await expectRendered(page);
        if (dir === 'storybook') await expect(page.getByTestId('legacy-redirect-target')).toHaveText('Redirected');
        const url = new URL(page.url());
        expect(url.pathname).toBe(`${base}${dir}/iframe.html`);
        expect(url.searchParams.get('id')).toBe(probe.new);
      });
    });
  }

  test('pro/: the Pro demo carries no redirect fixture (its probe lands on a public Pro story)', async ({ page }) => {
    const entries = await readEntries(page, 'pro');
    expect(entries[PROBE.story.new]).toBeUndefined();
    expect(entries[PROBE.pro.new]).toBeDefined();
  });

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
