import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeDemoInvoices } from '../packages/core/src/internal/demo-invoices';
import { gotoStory } from './helpers/story';
import { expectNoHorizontalOverflow } from './helpers/geometry';

// #499: below 640px a selection bar without `bulkActions` is one line (count + "Clear selection").
const NO_BULK = 'floorplans-list-report--selection-without-bulk-actions-no-play';
const WITH_BULK = 'floorplans-list-report--selection-no-play';
const PRO = 'pro-floorplans-virtual-list-report--default-no-play';

// The scenario of the Selection story: the first open invoice and the first two that are not open.
const ROWS = makeDemoInvoices(200);
const SCENARIO = [ROWS.find((r) => r.status === 'pending')!, ...ROWS.filter((r) => r.status !== 'pending').slice(0, 2)];

const bar = (page: Page): Locator => page.getByRole('group', { name: 'Selection Invoices' });
const count = (page: Page): Locator => page.locator('[data-rop-selection-count]');
const clear = (page: Page): Locator => page.locator('[data-rop-selection-bar] button', { hasText: 'Clear selection' });
const allBox = (page: Page): Locator => page.getByRole('checkbox', { name: 'Select all results' });
const pill = (page: Page, name: string): Locator => page.getByRole('radio', { name });
const scroller = (page: Page): Locator => page.getByRole('table', { name: 'Invoices' }).locator('..');
const rowBoxes = (page: Page): Locator => page.getByRole('checkbox', { name: /^Select (INV|FT)-/ });

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('no bounding box');
  return b;
}
const cy = (b: Box): number => b.y + b.height / 2;
function same(a: Box, b: Box, what: string): void {
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(a[k] - b[k]), `${what} ${k}`).toBeLessThanOrEqual(0.5);
}
/** Height of one `sm` button plus the bar's vertical padding and border (read from the DOM, not hard-coded). */
async function oneLineHeight(page: Page): Promise<number> {
  return page.locator('[data-rop-selection-bar] button').first().evaluate((el) => {
    const barEl = el.closest('[data-rop-selection-bar]') as HTMLElement;
    const cs = getComputedStyle(barEl);
    const v = (s: string): number => parseFloat(s);
    return el.getBoundingClientRect().height + v(cs.paddingTop) + v(cs.paddingBottom) + v(cs.borderTopWidth) + v(cs.borderBottomWidth);
  });
}
async function pick(page: Page, n: number): Promise<void> {
  for (const row of SCENARIO.slice(0, n)) await page.getByRole('checkbox', { name: `Select ${row.number}` }).click();
}
const sameRow = async (page: Page): Promise<void> => {
  expect(Math.abs(cy(await box(count(page))) - cy(await box(clear(page))))).toBeLessThanOrEqual(1);
};

for (const vp of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test.describe(`selection bar without bulkActions at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('one line at 0 selected: count and the box of "Clear selection" are on the same row', async ({ page }) => {
      await gotoStory(page, NO_BULK);
      await expect(bar(page)).toContainText('No items selected');
      await sameRow(page);
      expect(Math.abs((await box(bar(page))).height - (await oneLineHeight(page)))).toBeLessThanOrEqual(1);
    });

    test('footprint: bar and table keep their box through select, filter, select all and clear', async ({ page }) => {
      await gotoStory(page, NO_BULK);
      const bar0 = await box(bar(page));
      const table0 = await box(scroller(page));
      const check = async (what: string): Promise<void> => {
        same(await box(bar(page)), bar0, `bar ${what}`);
        same(await box(scroller(page)), table0, `table ${what}`);
      };
      await pick(page, 3);
      await expect(bar(page)).toContainText('3 selected');
      await expect(clear(page)).toBeVisible();
      await sameRow(page);
      await check('3 selected');
      await pill(page, 'Open').click();
      await expect(bar(page)).toContainText('hidden by filters');
      await check('with hidden ids');
      await pill(page, 'All').click();
      await allBox(page).click();
      await expect(bar(page)).toContainText('200 selected');
      await check('all selected');
      await clear(page).click();
      await expect(bar(page)).toContainText('No items selected');
      await check('cleared');
      await expectNoHorizontalOverflow(bar(page));
    });

    test('Enter on "Clear selection" clears and moves the focus to the header checkbox', async ({ page }) => {
      await gotoStory(page, NO_BULK);
      await pick(page, 2);
      await clear(page).focus();
      await page.keyboard.press('Enter');
      await expect(bar(page)).toContainText('No items selected');
      await expect(allBox(page)).toBeFocused();
    });

    test('with bulkActions: still two lines (count above, actions and clear below)', async ({ page }) => {
      await gotoStory(page, WITH_BULK);
      const c = await box(count(page));
      const a = await box(page.getByRole('button', { name: 'Approve' }));
      expect(a.y).toBeGreaterThan(c.y + c.height - 1);
      expect((await box(bar(page))).height).toBeGreaterThan((await oneLineHeight(page)) + 10);
    });

    test('Pro VirtualListReport: always has "Select all N results", stays on two lines', async ({ page }) => {
      await gotoStory(page, PRO);
      await rowBoxes(page).first().click();
      const c = await box(count(page));
      const a = await box(page.getByRole('button', { name: /^Select all .* results$/ }));
      expect(a.y).toBeGreaterThan(c.y + c.height - 1);
      expect((await box(bar(page))).height).toBeGreaterThan((await oneLineHeight(page)) + 10);
    });

    test('bulkActions switched on after mount (Control): the bar goes to two lines without errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await gotoStory(page, NO_BULK);
      const oneLine = (await box(bar(page))).height;
      await gotoStory(page, NO_BULK, 'withBulkActions:!true');
      expect((await box(bar(page))).height).toBeGreaterThan(oneLine + 10);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('narrow edge cases', () => {
  test('320px: a long count is truncated on one line, "Clear selection" stays whole and clickable', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, NO_BULK);
    await pick(page, 3);
    await pill(page, 'Open').click();
    await expect(bar(page)).toContainText('1 selected (2 hidden by filters)');
    const c = await box(count(page));
    const b = await box(clear(page));
    await sameRow(page);
    expect(c.x + c.width).toBeLessThanOrEqual(b.x + 0.5);
    const barBox = await box(bar(page));
    expect(b.x + b.width).toBeLessThanOrEqual(barBox.x + barBox.width + 0.5);
    await expectNoHorizontalOverflow(bar(page));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await clear(page).click();
    await expect(bar(page)).toContainText('No items selected');
  });

  test('crossing 640px (639 to 640 and back): one line in both, no two-line state', async ({ page }) => {
    await page.setViewportSize({ width: 639, height: 800 });
    await gotoStory(page, NO_BULK);
    const h639 = (await box(bar(page))).height;
    expect(Math.abs(h639 - (await oneLineHeight(page)))).toBeLessThanOrEqual(1);
    for (const w of [640, 639, 640]) {
      await page.setViewportSize({ width: w, height: 800 });
      expect(Math.abs((await box(bar(page))).height - h639)).toBeLessThanOrEqual(1);
      await sameRow(page);
    }
  });

  for (const withBulk of [false, true]) {
    test(`1280px, bulkActions ${String(withBulk)}: one line as before`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoStory(page, withBulk ? WITH_BULK : NO_BULK);
      expect(Math.abs((await box(bar(page)).then((b) => b.height)) - (await oneLineHeight(page)))).toBeLessThanOrEqual(1);
    });
  }
});
