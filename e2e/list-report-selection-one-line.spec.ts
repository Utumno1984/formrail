import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeDemoInvoices } from '../packages/core/src/internal/demo-invoices';
import { expectPlayToPass, gotoStory } from './helpers/story';
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

// #509: the count keeps a readable minimum width (8ch); when there is no room the bar goes to two lines,
// the same at 0, 3 and all selected.
const setRootFont = (page: Page, px: number): Promise<void> =>
  page.evaluate((v) => {
    document.documentElement.style.fontSize = `${v}px`;
  }, px);
const setDir = (page: Page, dir: 'rtl' | 'ltr'): Promise<void> =>
  page.evaluate((d) => {
    document.documentElement.setAttribute('dir', d);
  }, dir);
/** The computed min-width of the count, in px (8ch of its own font). */
const minCount = (page: Page): Promise<number> => count(page).evaluate((el) => parseFloat(getComputedStyle(el).minWidth));
/** `pick` for large text: the sticky header can cover a row, so the box is clicked through the DOM (the same React event). */
async function pickDom(page: Page, n: number): Promise<void> {
  for (const row of SCENARIO.slice(0, n)) await page.getByRole('checkbox', { name: `Select ${row.number}` }).evaluate((el) => (el as HTMLInputElement).click());
}
const LONG_CLEAR = 'Remove every invoice from the selection';
const longClear = (page: Page): Locator => page.locator('[data-rop-selection-bar] button', { hasText: LONG_CLEAR });

/** Runs 0 / 3 / hidden / all / cleared and checks that the bar, the count and the page hold at each step. */
async function expectStableThrough(page: Page, wrapped: boolean): Promise<void> {
  const bar0 = await box(bar(page));
  const gap0 = (await box(scroller(page))).y - bar0.y;
  const min = await minCount(page);
  expect(min).toBeGreaterThan(0);
  const check = async (what: string): Promise<void> => {
    // Clicking a control can scroll the page: the position is compared at the top of the page.
    await page.evaluate(() => window.scrollTo(0, 0));
    const now = await box(bar(page));
    // The pills and the count of the title above can change height at large text (a filter changes "(n)" to
    // "(n of m)"): the bar is compared in x, width, height and in its distance to the table, not in absolute y.
    for (const k of ['x', 'width', 'height'] as const) expect(Math.abs(now[k] - bar0[k]), `bar ${k} ${what}`).toBeLessThanOrEqual(0.5);
    expect(Math.abs((await box(scroller(page))).y - now.y - gap0), `bar to table gap ${what}`).toBeLessThanOrEqual(0.5);
    const c = await box(count(page));
    expect(c.width, `count width ${what}`).toBeGreaterThanOrEqual(min - 0.5);
    const b = await box(bar(page));
    expect(c.x, `count inside the bar ${what}`).toBeGreaterThanOrEqual(b.x - 0.5);
    expect(c.x + c.width, `count inside the bar ${what}`).toBeLessThanOrEqual(b.x + b.width + 0.5);
    const k = await box(clear(page));
    expect(k.x, `clear inside the bar ${what}`).toBeGreaterThanOrEqual(b.x - 0.5);
    expect(k.x + k.width, `clear inside the bar ${what}`).toBeLessThanOrEqual(b.x + b.width + 0.5);
    if (wrapped) expect(k.y, `clear below the count ${what}`).toBeGreaterThan(c.y + c.height - 1);
    else await sameRow(page);
    await expectNoHorizontalOverflow(bar(page));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  };
  await check('at 0');
  await pickDom(page, 3);
  await expect(bar(page)).toContainText('3 selected');
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
}

test.describe('#509 minimum width of the count', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('root font 32px at 390px: the count keeps its minimum, the bar wraps and never moves', async ({ page }) => {
    await gotoStory(page, NO_BULK);
    await setRootFont(page, 32);
    await expect(bar(page)).toContainText('No items selected');
    const c = await box(count(page));
    expect(c.width).toBeGreaterThanOrEqual((await minCount(page)) - 0.5);
    // Two lines: "Clear selection" (hidden, but with its box) is below the count.
    expect((await box(bar(page))).height).toBeGreaterThan((await oneLineHeight(page)) + 10);
    await expectStableThrough(page, true);
  });

  test('default font at 390x844 stays on one line (no regression of #499) and the count is above its minimum', async ({ page }) => {
    await gotoStory(page, NO_BULK);
    expect(Math.abs((await box(bar(page))).height - (await oneLineHeight(page)))).toBeLessThanOrEqual(1);
    await expectStableThrough(page, false);
  });

  test('the wrap does not depend on the selection: same layout at 0 and at 3 for every root font size', async ({ page }) => {
    await gotoStory(page, NO_BULK);
    for (const px of [16, 20, 24, 28, 32]) {
      await setRootFont(page, px);
      const h0 = (await box(bar(page))).height;
      const y0 = (await box(clear(page))).y;
      await pickDom(page, 3);
      await expect(bar(page)).toContainText('3 selected');
      expect(Math.abs((await box(bar(page))).height - h0), `height at ${px}px`).toBeLessThanOrEqual(0.5);
      expect(Math.abs((await box(clear(page))).y - y0), `clear y at ${px}px`).toBeLessThanOrEqual(0.5);
      await clear(page).click();
      await expect(bar(page)).toContainText('No items selected');
    }
  });

  test('a long localized "Clear selection": the bar wraps, the label stays whole, the count keeps its minimum', async ({ page }) => {
    await gotoStory(page, NO_BULK, 'longClearLabel:!true');
    await expect(bar(page)).toContainText('No items selected');
    const b0 = await box(bar(page));
    expect(b0.height).toBeGreaterThan((await oneLineHeight(page)) + 10);
    const k = await box(longClear(page));
    expect(k.x).toBeGreaterThanOrEqual(b0.x - 0.5);
    expect(k.x + k.width).toBeLessThanOrEqual(b0.x + b0.width + 0.5);
    // Not truncated: the text of the button fits its box.
    expect(await longClear(page).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await pickDom(page, 3);
    await expect(bar(page)).toContainText('3 selected');
    await expect(longClear(page)).toBeVisible();
    same(await box(bar(page)), b0, 'bar at 3 selected');
    expect((await box(count(page))).width).toBeGreaterThanOrEqual((await minCount(page)) - 0.5);
    await expectNoHorizontalOverflow(bar(page));
    await longClear(page).click();
    await expect(bar(page)).toContainText('No items selected');
    same(await box(bar(page)), b0, 'bar cleared');
  });

  test('RTL: the count starts on the right, "Clear selection" at the end (left), same box through select and clear', async ({ page }) => {
    await gotoStory(page, NO_BULK);
    await setDir(page, 'rtl');
    await expect(bar(page)).toContainText('No items selected');
    const bar0 = await box(bar(page));
    expect(Math.abs(bar0.height - (await oneLineHeight(page)))).toBeLessThanOrEqual(1);
    await pickDom(page, 3);
    await expect(clear(page)).toBeVisible();
    const c = await box(count(page));
    const k = await box(clear(page));
    expect(k.x + k.width).toBeLessThanOrEqual(c.x + 0.5);
    expect(k.x).toBeGreaterThanOrEqual(bar0.x - 0.5);
    expect(c.x + c.width).toBeLessThanOrEqual(bar0.x + bar0.width + 0.5);
    await sameRow(page);
    same(await box(bar(page)), bar0, 'bar at 3 selected (rtl)');
    await expectNoHorizontalOverflow(bar(page));
    await clear(page).click();
    await expect(bar(page)).toContainText('No items selected');
    same(await box(bar(page)), bar0, 'bar cleared (rtl)');
  });

  test('RTL with a long label: two lines, mirrored, nothing outside the bar', async ({ page }) => {
    await gotoStory(page, NO_BULK, 'longClearLabel:!true');
    await setDir(page, 'rtl');
    await expect(bar(page)).toContainText('No items selected');
    const b0 = await box(bar(page));
    expect(b0.height).toBeGreaterThan((await oneLineHeight(page)) + 10);
    await pickDom(page, 3);
    await expect(bar(page)).toContainText('3 selected');
    const c = await box(count(page));
    const k = await box(longClear(page));
    expect(k.y).toBeGreaterThan(c.y + c.height - 1);
    expect(k.x).toBeGreaterThanOrEqual(b0.x - 0.5);
    expect(k.x + k.width).toBeLessThanOrEqual(b0.x + b0.width + 0.5);
    // Mirrored: the button sits at the end of its line, that is on the left.
    expect(k.x - b0.x).toBeLessThan(b0.x + b0.width - (k.x + k.width) + 0.5);
    same(await box(bar(page)), b0, 'bar at 3 selected (rtl, long label)');
    await expectNoHorizontalOverflow(bar(page));
  });
});

// #509 review: the minimum of 8ch is below 640px only; from 640px the computed min-width is 0 as before.
test.describe('#509 no minimum from 640px', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('1280px viewport, narrow container (320px) and a long label: min-width of the count is 0, Clear stays inside the bar', async ({ page }) => {
    await gotoStory(page, NO_BULK, 'containerWidth:320;longClearLabel:!true');
    await expect(bar(page)).toContainText('No items selected');
    expect(await minCount(page)).toBe(0);
    const inside = async (): Promise<void> => {
      const b = await box(bar(page));
      const k = await box(longClear(page));
      expect(k.x).toBeGreaterThanOrEqual(b.x - 0.5);
      expect(k.x + k.width).toBeLessThanOrEqual(b.x + b.width + 0.5);
    };
    await inside();
    await pickDom(page, 3);
    await expect(bar(page)).toContainText('3 selected');
    expect(await minCount(page)).toBe(0);
    await inside();
  });

  test('computed min-width of the count: 0 at 1280px and at 640px, above 0 at 639px', async ({ page }) => {
    await gotoStory(page, NO_BULK);
    for (const [w, positive] of [
      [1280, false],
      [640, false],
      [639, true],
    ] as const) {
      await page.setViewportSize({ width: w, height: 800 });
      expect((await minCount(page)) > 0, `width ${w}`).toBe(positive);
    }
  });
});

// The play function of the story (it also checks the minimum of the count) at a narrow and at a wide viewport.
for (const vp of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
]) {
  test(`story SelectionWithoutBulkActions: the play function passes at ${vp.width}px`, async ({ page }) => {
    await page.setViewportSize(vp);
    await expectPlayToPass(page, 'floorplans-list-report--selection-without-bulk-actions');
  });
}
