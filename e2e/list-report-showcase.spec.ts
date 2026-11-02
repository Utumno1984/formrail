import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #132: the Smart Filter Bar showcase. URL state + scroll restoration + "New" -> Cancel, on the iframe.
const STORY = 'floorplans-list-report--smart-filter-bar-showcase';
const FIXTURE = 'floorplans-list-report--smart-filter-bar-showcase-no-play';

const table = (page: Page): Locator => page.getByRole('table', { name: /Invoices/ });
const scroller = (page: Page): Locator => table(page).locator('..');
const pill = (page: Page, name: string): Locator => page.getByRole('radio', { name });
const search = (page: Page): Locator => page.getByRole('searchbox', { name: 'Search' });
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;
const scrollTop = (page: Page): Promise<number> => scroller(page).evaluate((el) => el.scrollTop);

test.describe('Floorplans/List Report: SmartFilterBarShowcase', () => {
  test('the play function passes', async ({ page }) => {
    await expectPlayToPass(page, STORY);
  });

  test('without parameters: default pill, no search, no sort, no list parameters in the URL', async ({ page }) => {
    await gotoStory(page, FIXTURE);
    await expect(pill(page, 'All')).toBeChecked();
    await expect(search(page)).toHaveValue('');
    const p = params(page);
    expect([p.get('filter'), p.get('q'), p.get('sort')]).toEqual([null, null, null]);
    await expect(page.getByRole('columnheader', { name: /Amount/ })).not.toHaveAttribute(
      'aria-sort',
      /ascending|descending/,
    );
  });

  test('with ?filter=open&q=rossi&sort=amount.desc the first render is that view', async ({ page }) => {
    await page.goto(`/iframe.html?id=${FIXTURE}&viewMode=story&filter=open&q=rossi&sort=amount.desc`);
    await expect(table(page)).toBeVisible();
    await expect(pill(page, 'Open')).toBeChecked();
    await expect(search(page)).toHaveValue('rossi');
    await expect(page.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'descending');
    const rows = (await page.getByRole('row').allTextContents()).slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const t of rows) expect(t.toLowerCase()).toContain('rossi');
  });

  test('invalid parameters fall back to the defaults without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/iframe.html?id=${FIXTURE}&viewMode=story&filter=xyz&sort=amount.sideways`);
    await expect(table(page)).toBeVisible();
    await expect(pill(page, 'All')).toBeChecked();
    expect(errors).toEqual([]);
  });

  test('history: push: Back/Forward move the view', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'history:push');
    await expect(table(page)).toBeVisible();
    await pill(page, 'Open').click();
    await expect(pill(page, 'Open')).toBeChecked();
    await page.goBack();
    await expect(pill(page, 'All')).toBeChecked();
    await page.goForward();
    await expect(pill(page, 'Open')).toBeChecked();
  });

  test('no layout jump between loading, empty and data (table container size)', async ({ page }) => {
    const sizes: Record<string, { width: number; height: number }> = {};
    for (const state of ['data', 'loading', 'empty']) {
      await gotoStory(page, FIXTURE, `state:${state}`);
      await expect(pill(page, 'All')).toBeVisible();
      const box = await scroller(page).boundingBox();
      sizes[state] = { width: box!.width, height: box!.height };
    }
    expect(sizes['loading']).toEqual(sizes['data']);
    expect(sizes['empty']).toEqual(sizes['data']);
  });

  test('error and empty: the filter bar stays usable and the URL follows', async ({ page }) => {
    for (const state of ['error', 'empty']) {
      await gotoStory(page, FIXTURE, `state:${state}`);
      await pill(page, 'Open').click();
      await expect(pill(page, 'Open')).toBeChecked();
      await expect.poll(() => params(page).get('filter')).toBe('open');
    }
  });

  test('loading then data: the scroll is restored only after the rows are there', async ({ page }) => {
    await gotoStory(page, FIXTURE);
    await pill(page, 'Open').click();
    await scroller(page).evaluate((el) => void (el.scrollTop = 500));
    await expect.poll(() => scrollTop(page)).toBe(500);
    // Let the throttled write to sessionStorage happen, then reload the same view with late data.
    await page.waitForTimeout(500);
    await page.goto(`/iframe.html?id=${FIXTURE}&viewMode=story&filter=open&args=loadDelayMs:600`);
    await expect(scroller(page)).toHaveAttribute('aria-busy', 'true');
    expect(await scrollTop(page)).toBe(0);
    await expect(page.getByRole('row').nth(10)).toBeVisible();
    await expect.poll(async () => Math.abs((await scrollTop(page)) - 500)).toBeLessThanOrEqual(1);
  });

  for (const reduced of [false, true]) {
    test(`the play function passes with reducedMotion=${reduced}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await expectPlayToPass(page, STORY);
    });
  }

  test.describe('mobile', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('overlay auto opens a Sheet; the focused field stays above the virtual keyboard; Cancel restores', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const target = new EventTarget();
        let keyboard = 0;
        const vv = Object.defineProperties(target, {
          offsetTop: { value: 0 },
          offsetLeft: { value: 0 },
          pageTop: { value: 0 },
          pageLeft: { value: 0 },
          scale: { value: 1 },
          height: { get: () => window.innerHeight - keyboard },
          width: { get: () => window.innerWidth },
        });
        Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
        (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard = (px) => {
          keyboard = px;
          target.dispatchEvent(new Event('resize'));
        };
      });
      await gotoStory(page, FIXTURE);
      await pill(page, 'Open').click();
      await scroller(page).evaluate((el) => void (el.scrollTop = 400));
      await expect.poll(() => scrollTop(page)).toBe(400);
      const newButton = page.getByRole('button', { name: 'New', exact: true });
      await newButton.click();
      const sheet = page.getByRole('dialog', { name: 'New invoice' });
      await expect(sheet).toBeVisible();
      const input = sheet.getByRole('textbox', { name: 'Supplier name' });
      await input.focus();
      const keyboard = 300;
      await page.evaluate(
        (px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px),
        keyboard,
      );
      const limit = 844 - keyboard;
      await expect
        .poll(async () => (await input.boundingBox())!.y + (await input.boundingBox())!.height)
        .toBeLessThanOrEqual(limit);
      await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(0));
      await sheet.getByRole('button', { name: 'Cancel' }).click();
      await expect(sheet).toHaveCount(0);
      await expect(newButton).toBeFocused();
      expect(await scrollTop(page)).toBe(400);
      await expect(pill(page, 'Open')).toBeChecked();
    });
  });
});
