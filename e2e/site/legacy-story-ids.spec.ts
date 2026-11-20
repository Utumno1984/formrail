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

// #526: "Pro/Showcase/Invoices with Change Summary" was removed; its published links (the landing /teams/, the Pro
// introduction, issues and posts) land on "Pro/Showcase/Record editing integrity" in the Pro demo.
test.describe('renamed story ids: the removed invoice showcase of the Pro demo (#526)', () => {
  const OLD = 'pro-showcase-invoices-with-change-summary';
  const NEW = 'pro-showcase-record-editing-integrity';

  test.beforeEach(async ({ page }) => {
    await recordHistory(page);
  });

  test('every old id of the showcase, its Docs page included, is in the map and points at a story of the Pro demo', async ({ page }) => {
    const entries = await readEntries(page, 'pro');
    const old = ['docs', 'review-changes', 'manual', 'review-dialog', 'review-line-items', 'review-order-only', 'review-lines-dialog', 'server-update'];
    for (const name of old) {
      const target = (LEGACY_STORY_IDS as Record<string, string>)[`${OLD}--${name}`];
      expect(target, name).toMatch(new RegExp(`^${NEW}--`));
      expect(entries[target!], `${name} -> ${target}`).toBeDefined();
      expect(entries[`${OLD}--${name}`], name).toBeUndefined();
    }
    expect(Object.keys(entries).filter((id) => id.startsWith(`${OLD}--`))).toEqual([]);
  });

  test('manager: the old Docs URL opens the Docs page of the record-editing showcase, in place', async ({ page }) => {
    await page.goto(`pro/?path=/docs/${OLD}--docs`);
    const url = new URL(page.url());
    expect((await historyCalls(page))[0]).toEqual(['replaceState', `${url.origin}${base}pro/?path=/docs/${NEW}--docs`]);
    await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe(`/docs/${NEW}--docs`);
    const frame = page.frameLocator('#storybook-preview-iframe');
    await expect(frame.locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
    await expect(frame.getByRole('heading', { level: 1 }).first()).toHaveText('Record editing integrity');
  });

  test('iframe: the old "server update" story renders SalesOrderServerUpdate, its args kept', async ({ page }) => {
    const query = 'viewMode=story&args=saveOutcome:error';
    await page.goto(`pro/iframe.html?id=${OLD}--server-update&${query}`);
    expect((await historyCalls(page))[0]).toEqual(['replaceState', `${new URL(page.url()).origin}${base}pro/iframe.html?id=${NEW}--sales-order-server-update&${query}`]);
    expect(await initialHref(page)).toContain(`id=${OLD}--server-update&`);
    await expect(page.locator('#storybook-root > *').first()).toBeAttached({ timeout: 30_000 });
    await expect(page.locator('body.sb-show-errordisplay')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('id')).toBe(`${NEW}--sales-order-server-update`);
    expect(new URL(page.url()).searchParams.get('args')).toBe('saveOutcome:error');
    // The new story, not the invoices: its play opens order so-1.
    await expect(page.getByRole('heading', { level: 1, name: /SO-2026-147000001/ })).toBeVisible({ timeout: 30_000 });
  });

  test('iframe: the old "manual" fixture with the args of the old e2e specs opens the orders with the same args', async ({ page }) => {
    const args = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:0';
    await page.goto(`pro/iframe.html?id=${OLD}--manual&viewMode=story&args=${encodeURIComponent(args)}`);
    await page.waitForURL((u) => u.searchParams.get('id') === `${NEW}--sales-order-manual`);
    expect(new URL(page.url()).searchParams.get('args')).toBe(args);
    await page.getByRole('link', { name: 'SO-2026-147000001' }).click();
    await expect(page.getByRole('button', { name: 'Simulate server update' })).toBeVisible();
  });
});
