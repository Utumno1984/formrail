import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

// useListReportScrollRestoration, on the iframe of the story: list <-> detail, data arriving late.
const STORY = 'floorplans-list-report--scroll-restoration';
const FIXTURE = 'floorplans-list-report--scroll-restoration-no-play';
const DELAY = 'loadDelayMs:600';

const pill = (page: Page, name: string): Locator => page.getByRole('radio', { name });
const scroller = (page: Page): Locator => page.getByRole('table', { name: 'Records' }).locator('..');
const detailTitle = (page: Page): Locator => page.getByText('Record detail');
const scrollTop = (page: Page): Promise<number> => scroller(page).evaluate((el) => el.scrollTop);
const setScrollTop = (page: Page, top: number): Promise<void> =>
  scroller(page).evaluate((el, t) => void (el.scrollTop = t), top);

async function openAndScroll(page: Page, name: string, top: number): Promise<number> {
  await expect(page.getByRole('row').nth(10)).toBeVisible();
  await pill(page, name).click();
  await expect(pill(page, name)).toBeChecked();
  await setScrollTop(page, top);
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(top - 2);
  const actual = await scrollTop(page);
  // Let the throttled write happen, then go to the detail through the real UI.
  await page.waitForTimeout(300);
  await clickVisibleRow(page);
  await expect(detailTitle(page)).toBeVisible();
  return actual;
}

/** Clicks a record link that is already inside the scroller's viewport: Playwright would otherwise scroll one into view (and move the position under test). */
async function clickVisibleRow(page: Page): Promise<void> {
  const links = page.getByRole('button', { name: /^REC-/ });
  const box = await scroller(page).boundingBox();
  const index = await links.evaluateAll(
    (els, area) =>
      els.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return area !== null && r.top >= area.y + 60 && r.bottom <= area.y + area.height - 10;
      }),
    box,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  await links.nth(index).click();
}

test.describe('Floorplans/List Report: ScrollRestoration', () => {
  test('the play function passes', async ({ page }) => {
    await expectPlayToPass(page, STORY);
  });

  test('Cancel: loading first (not scrolled), then the data and the position; window untouched', async ({ page }) => {
    await gotoStory(page, FIXTURE, DELAY);
    const saved = await openAndScroll(page, 'Pending', 600);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(scroller(page)).toHaveAttribute('aria-busy', 'true');
    expect(await scrollTop(page)).toBe(0);
    await expect(page.getByRole('button', { name: /^REC-/ }).first()).toBeVisible();
    await expect.poll(async () => Math.abs((await scrollTop(page)) - saved)).toBeLessThanOrEqual(1);
    await expect(pill(page, 'Pending')).toBeChecked();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('real browser Back restores the same way', async ({ page }) => {
    await gotoStory(page, FIXTURE, DELAY);
    const saved = await openAndScroll(page, 'Pending', 500);
    await page.goBack();
    await expect(page.getByRole('button', { name: /^REC-/ }).first()).toBeVisible();
    await expect.poll(async () => Math.abs((await scrollTop(page)) - saved)).toBeLessThanOrEqual(1);
    await expect(pill(page, 'Pending')).toBeChecked();
  });

  test('a full reload of the list page restores it (sessionStorage survives)', async ({ page }) => {
    await gotoStory(page, FIXTURE, DELAY);
    await expect(page.getByRole('row').nth(10)).toBeVisible();
    await pill(page, 'Pending').click();
    await setScrollTop(page, 400);
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(398);
    const saved = await scrollTop(page);
    await page.waitForTimeout(300);
    await page.reload();
    await expect(pill(page, 'Pending')).toBeChecked();
    await expect(page.getByRole('button', { name: /^REC-/ }).first()).toBeVisible();
    await expect.poll(async () => Math.abs((await scrollTop(page)) - saved)).toBeLessThanOrEqual(1);
  });

  test('another pill starts at the top (no position saved for that URL)', async ({ page }) => {
    await gotoStory(page, FIXTURE, DELAY);
    await openAndScroll(page, 'Pending', 600);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: /^REC-/ }).first()).toBeVisible();
    await pill(page, 'On hold').click();
    await expect(pill(page, 'On hold')).toBeChecked();
    // The container keeps its position when the pill changes; the user opens a row without scrolling.
    await page.waitForTimeout(300);
    await clickVisibleRow(page);
    await expect(detailTitle(page)).toBeVisible();
    const keys = await page.evaluate(() => Object.keys(window.sessionStorage));
    expect(keys.some((k) => k.includes('filter=pending'))).toBe(true);
    expect(keys.some((k) => k.includes('filter=on-hold'))).toBe(false); // nothing was scrolled for this view
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: /^REC-/ }).first()).toBeVisible();
    await expect(pill(page, 'On hold')).toBeChecked();
    expect(await scrollTop(page)).toBe(0);
  });
});

// The same round trip on tablet and mobile viewports (the project runs Desktop Chrome; the viewport is set here).
for (const [name, width, height] of [
  ['tablet', 768, 1024],
  ['mobile', 375, 667],
] as const) {
  test.describe(`Floorplans/List Report: ScrollRestoration (${name})`, () => {
    test.use({ viewport: { width, height } });

    test('Cancel restores the position after the data arrives', async ({ page }) => {
      await gotoStory(page, FIXTURE, DELAY);
      const saved = await openAndScroll(page, 'Pending', 500);
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(scroller(page)).toHaveAttribute('aria-busy', 'true');
      await expect(page.getByRole('button', { name: /^REC-/ }).first()).toBeVisible();
      await expect.poll(async () => Math.abs((await scrollTop(page)) - saved)).toBeLessThanOrEqual(1);
      await expect(pill(page, 'Pending')).toBeChecked();
    });
  });
}
