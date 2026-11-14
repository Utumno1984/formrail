import { expect, test, type Page } from '@playwright/test';
// @ts-expect-error plain .mjs (inlined into the Storybook heads), no type declarations
import { LEGACY_STORY_IDS } from '../.storybook/legacy-story-ids.mjs';
// @ts-expect-error plain .mjs helper (unit-tested from scripts/), no type declarations
import { legacyIndexProblems } from '../scripts/legacy-story-ids-check.mjs';
import { historyCalls, initialHref, PROBE, recordHistory } from './helpers/legacy-redirect';

// Ticket #516: an old story id in a published link (manager `?path=`, preview `iframe.html?id=`) lands on
// the story that replaced it, in place (`history.replaceState` from the head, before Storybook reads the
// URL): no extra history entry, no second redirect. This suite runs on the complete build served at `/`;
// e2e/site/legacy-story-ids.spec.ts repeats it on the Free and Pro deploy builds under the Pages prefix.

const ORIGIN = 'internal-harness--valid';

async function expectManagerOn(page: Page, path: string, frameId: string) {
  await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe(path);
  const iframe = page.locator('#storybook-preview-iframe');
  await expect(iframe).toHaveAttribute('src', new RegExp(`iframe\\.html\\?id=${frameId}&`), { timeout: 30_000 });
}

test.describe('renamed story ids: complete build (#516)', () => {
  test.beforeEach(async ({ page }) => {
    await recordHistory(page);
  });

  test('manager: an old ?path=/story/ lands on the new story, Back does not return to the old id', async ({ page, baseURL }) => {
    await page.goto(`/?path=/story/${ORIGIN}`);
    await expectManagerOn(page, `/story/${ORIGIN}`, ORIGIN);
    const origin = page.url();
    const length = await page.evaluate(() => history.length);

    await page.goto(`/?path=/story/${PROBE.story.old}`);
    // The very first history call of the page is the redirect, with the exact new URL.
    expect((await historyCalls(page))[0]).toEqual(['replaceState', `${baseURL}/?path=/story/${PROBE.story.new}`]);
    await expectManagerOn(page, `/story/${PROBE.story.new}`, PROBE.story.new);
    const preview = page.frameLocator('#storybook-preview-iframe');
    await expect(preview.getByTestId('legacy-redirect-target')).toHaveText('Legacy redirect target');
    // The preview frame was loaded with the new id: its own copy of the redirect had nothing to do.
    const frame = page.frame({ url: /iframe\.html/ })!;
    expect(await initialHref(frame)).toContain(`id=${PROBE.story.new}&`);
    expect(JSON.stringify(await historyCalls(frame))).not.toContain(PROBE.story.old);
    // No history call anywhere ever carried the old id, and the old URL took no entry of its own.
    expect(JSON.stringify((await historyCalls(page)).slice(1))).not.toContain(PROBE.story.old);
    expect(await page.evaluate(() => history.length)).toBe(length + 1);

    await page.goBack();
    expect(page.url()).toBe(origin);
    await expectManagerOn(page, `/story/${ORIGIN}`, ORIGIN);
    await page.goForward();
    expect(new URL(page.url()).searchParams.get('path')).toBe(`/story/${PROBE.story.new}`);
  });

  test('manager: an old ?path=/docs/ lands on the new Docs page', async ({ page }) => {
    await page.goto(`/?path=/docs/${PROBE.docs.old}`);
    await expectManagerOn(page, `/docs/${PROBE.docs.new}`, PROBE.docs.new);
    await expect(page.frameLocator('#storybook-preview-iframe').locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
  });

  test('manager: an encoded path (%2F) and the globals next to it', async ({ page, baseURL }) => {
    await page.goto(`/?globals=outline:!true&path=%2Fstory%2F${PROBE.story.old}`);
    expect((await historyCalls(page))[0]).toEqual(['replaceState', `${baseURL}/?globals=outline:!true&path=/story/${PROBE.story.new}`]);
    await expectManagerOn(page, `/story/${PROBE.story.new}`, PROBE.story.new);
    await expect(page.frameLocator('#storybook-preview-iframe').getByTestId('legacy-redirect-target')).toBeVisible();
  });

  test('iframe: an old ?id= renders the new story with its args, Back does not return to the old id', async ({ page, baseURL }) => {
    await page.goto(`/iframe.html?id=${ORIGIN}&viewMode=story`);
    await expect(page.locator('#storybook-root > *').first()).toBeAttached({ timeout: 30_000 });
    const origin = page.url();
    const length = await page.evaluate(() => history.length);

    const query = `viewMode=story&args=label:Redirected&globals=outline:!true`;
    await page.goto(`/iframe.html?id=${PROBE.story.old}&${query}`);
    expect((await historyCalls(page))[0]).toEqual(['replaceState', `${baseURL}/iframe.html?id=${PROBE.story.new}&${query}`]);
    await expect(page.getByTestId('legacy-redirect-target')).toHaveText('Redirected', { timeout: 30_000 });
    await expect(page.locator('body.sb-show-errordisplay')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('id')).toBe(PROBE.story.new);
    expect(await page.evaluate(() => history.length)).toBe(length + 1);

    await page.goBack();
    expect(page.url()).toBe(origin);
    expect(page.url()).not.toContain(PROBE.story.old);
  });

  test('iframe: an old Docs id renders the new Docs page', async ({ page }) => {
    await page.goto(`/iframe.html?viewMode=docs&id=${PROBE.docs.old}`);
    await expect(page.locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).searchParams.get('id')).toBe(PROBE.docs.new);
  });

  test('a current id is left alone: no redirect call at all', async ({ page }) => {
    await page.goto(`/iframe.html?id=${PROBE.story.new}&viewMode=story`);
    await expect(page.getByTestId('legacy-redirect-target')).toBeVisible({ timeout: 30_000 });
    const calls = await historyCalls(page);
    // Storybook may write its own URL later; none of the calls may change the id.
    for (const [, url] of calls) expect(url === null || new URL(url).searchParams.get('id') === PROBE.story.new).toBe(true);
  });

  test('no old id of the map is still a story or Docs page of this build', async ({ request }) => {
    const index = (await (await request.get('/index.json')).json()) as { entries: Record<string, unknown> };
    // Old ids only: a new id may exist in the Pro demo build alone (e.g. its own introduction page), which this
    // build does not include; e2e/site/legacy-story-ids.spec.ts checks the new ids against the deploy builds.
    expect(legacyIndexProblems(LEGACY_STORY_IDS, [{ name: 'the complete build', entries: index.entries }], { targets: false })).toEqual([]);
    // The probes land on entries of this build.
    expect(index.entries[PROBE.story.new]).toBeDefined();
    expect(index.entries[PROBE.docs.new]).toBeDefined();
  });
});
