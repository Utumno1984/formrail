import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow, expectSingleScroller } from './helpers/geometry';
import { expectPlayToPass } from './helpers/story';

const STORY = (name: string) => `data-listreporttable--${name}`;
const scroller = (page: Page): Locator => page.getByTestId('scroller');
const header = (page: Page, name: string | RegExp): Locator => page.getByRole('columnheader', { name });
const sortButton = (page: Page, name: string): Locator => header(page, name).getByRole('button');
// Longer than the tooltip delay (500ms): "nothing opened" is not just "not yet".
const SETTLE = 900;

/** Text of one column of the body, in display order. */
const column = (page: Page, index: number): Promise<string[]> =>
  page.locator('#storybook-root tbody tr').evaluateAll((rows, i) => rows.map((r) => r.children[i]!.textContent ?? ''), index);

const rect = (locator: Locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  });

test.describe('Data/ListReportTable: stories play', () => {
  for (const name of ['playground', 'plain', 'mixed-widths', 'rem-widths', 'long-texts', 'narrow-container', 'sticky-after-scroll', 'twenty-columns', 'rtl']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('sorting', () => {
  test('mouse: Amount ascending, descending (arrow and aria-sort), then none; the focus stays on the button', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    const button = sortButton(page, 'Amount');
    const original = await column(page, 0);
    await button.click();
    await expect(header(page, 'Amount')).toHaveAttribute('aria-sort', 'ascending');
    expect(await button.locator('svg').evaluate((el) => getComputedStyle(el).rotate)).toBe('180deg');
    const asc = (await column(page, 3)).map((t) => Number(t.replace('€ ', '')));
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    await button.click();
    await expect(header(page, 'Amount')).toHaveAttribute('aria-sort', 'descending');
    const desc = (await column(page, 3)).map((t) => Number(t.replace('€ ', '')));
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    await expect(button).toBeFocused();
    // the arrow marks only the sorted column and flips with the direction
    const opacity = (name: string) => sortButton(page, name).locator('svg').evaluate((el) => getComputedStyle(el).opacity);
    const rotate = () => button.locator('svg').evaluate((el) => getComputedStyle(el).rotate);
    expect(await opacity('Amount')).toBe('1');
    expect(await opacity('Customer')).toBe('0');
    expect(await rotate()).toBe('none');
    await button.click();
    await expect(header(page, 'Amount')).not.toHaveAttribute('aria-sort');
    expect(await column(page, 0)).toEqual(original);
  });

  test('keyboard: Tab reaches the header buttons; Enter and Space cycle the sort and the focus node does not change', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    // The first tab stop is the scroll container itself, then the sortable headers in order.
    await page.keyboard.press('Tab');
    await expect(scroller(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const button = sortButton(page, 'Customer');
    await expect(button).toBeFocused();
    await button.evaluate((el) => ((window as unknown as { __marked: Element }).__marked = el));

    await page.keyboard.press('Enter');
    await expect(header(page, 'Customer')).toHaveAttribute('aria-sort', 'ascending');
    await page.keyboard.press('Enter');
    await expect(header(page, 'Customer')).toHaveAttribute('aria-sort', 'descending');
    await page.keyboard.press('Space');
    await expect(header(page, 'Customer')).not.toHaveAttribute('aria-sort');
    const same = await page.evaluate(() => document.activeElement === (window as unknown as { __marked: Element }).__marked);
    expect(same).toBe(true);
  });

  test('"Date" starts descending (firstSortDirection desc); non-sortable "Description" has no button', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    await sortButton(page, 'Date').click();
    await expect(header(page, 'Date')).toHaveAttribute('aria-sort', 'descending');
    await expect(header(page, 'Description').getByRole('button')).toHaveCount(0);
    const dates = await column(page, 4);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

test.describe('geometry', () => {
  test('columns with a width have exactly it; the others share the rest; the table fills the container', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    const widths = await page.getByRole('columnheader').evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().width));
    expect(widths[0]).toBeCloseTo(90, 0);
    expect(widths[3]).toBeCloseTo(120, 0);
    expect(widths[4]).toBeCloseTo(120, 0);
    const container = await rect(scroller(page));
    const total = widths.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - (container.width - 0))).toBeLessThanOrEqual(1);
    // the two flexible columns split what is left evenly
    expect(Math.abs(widths[1]! - widths[2]!)).toBeLessThanOrEqual(1);
  });

  test('every column with a width, in a wider container: px stays exact, % is a share of the table, rem is exact', async ({ page }) => {
    await expectPlayToPass(page, STORY('mixed-widths'));
    const widths = await page.getByRole('columnheader').evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().width));
    expect(Math.abs(widths[0]! - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(widths[1]! - 0.3 * (200 / 0.7))).toBeLessThanOrEqual(1);
    expect((await rect(page.locator('#storybook-root table'))).width).toBeLessThan(300);

    await expectPlayToPass(page, STORY('rem-widths'));
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const remWidths = await page.getByRole('columnheader').evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().width));
    remWidths.forEach((w) => expect(Math.abs(w - 10 * rem)).toBeLessThanOrEqual(1));
  });

  test('the focus ring of the scroll container is drawn outside it, not under the sticky header', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    await page.keyboard.press('Tab');
    await expect(scroller(page)).toBeFocused();
    expect(await scroller(page).evaluate((el) => parseFloat(getComputedStyle(el).outlineOffset))).toBeGreaterThanOrEqual(0);
    await expectFocusRingVisible(scroller(page));
  });

  test('a very long text does not widen its column', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    const before = await page.getByRole('columnheader').evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().width));
    await page.locator('#storybook-root tbody tr').first().getByRole('cell').nth(1).evaluate((td) => {
      td.firstElementChild!.textContent = 'x'.repeat(2000);
    });
    const after = await page.getByRole('columnheader').evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().width));
    after.forEach((w, i) => expect(Math.abs(w - before[i]!)).toBeLessThanOrEqual(1));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
  });

  test('all body rows (and the header) have the same height', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    const heights = await page.locator('#storybook-root tr').evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
    expect(new Set(heights.map((h) => Math.round(h))).size).toBe(1);
  });

  test('narrow container: the table scrolls inside it and the page does not', async ({ page }) => {
    await expectPlayToPass(page, STORY('narrow-container'));
    const s = scroller(page);
    const { scrollWidth, clientWidth } = await s.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    // 90 + 160 + 200 + 120 + 120
    expect(scrollWidth).toBeGreaterThanOrEqual(690);
    expect(clientWidth).toBeLessThan(scrollWidth);
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('the Playground at 360px (Controls): still no overflow outside the box', async ({ page }) => {
    await expectPlayToPass(page, STORY('playground'), 'containerWidth:360');
    const box = page.getByTestId('box');
    expect((await rect(box)).width).toBeLessThanOrEqual(360);
    expect(await scroller(page).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });

  test('twenty columns: scroll inside the box; the long header stays on one line and its button still sorts', async ({ page }) => {
    await expectPlayToPass(page, STORY('twenty-columns'));
    // (this story also scrolls vertically, which the helper would count as a nested overflow)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await rect(scroller(page))).width).toBeLessThanOrEqual(360);
    const long = header(page, /A very long header/);
    await long.scrollIntoViewIfNeeded();
    const th = await rect(long);
    const other = await rect(header(page, /^Col\. 1$/));
    expect(th.height).toBeCloseTo(other.height, 0);
    await long.getByRole('button').click();
    await expect(long).toHaveAttribute('aria-sort', 'ascending');
  });

  test('align end: the amount sits at the end of its header and cells (left in rtl)', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    const edge = (cell: Locator) =>
      cell.evaluate((td) => {
        const range = document.createRange();
        range.selectNodeContents(td);
        const text = range.getBoundingClientRect();
        const box = td.getBoundingClientRect();
        return { textRight: text.right, boxRight: box.right, textLeft: text.left, boxLeft: box.left };
      });
    const cell = await edge(page.locator('#storybook-root tbody tr').first().getByRole('cell').nth(3));
    expect(cell.boxRight - cell.textRight).toBeLessThanOrEqual(13);
    const head = await edge(header(page, 'Amount'));
    // header text sits before the (invisible when unsorted) arrow: inside the 12px padding + icon
    expect(head.boxRight - head.textRight).toBeLessThanOrEqual(13);
    expect(await header(page, 'Amount').evaluate((th) => getComputedStyle(th).textAlign)).toBe('end');

    await expectPlayToPass(page, STORY('rtl'));
    const rtl = await edge(page.locator('#storybook-root tbody tr').first().getByRole('cell').nth(3));
    expect(rtl.textLeft - rtl.boxLeft).toBeLessThanOrEqual(13);
  });
});

test.describe('one scroller and the sticky header', () => {
  test('no nested scrollers', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    await expectSingleScroller(scroller(page));
    await expectSingleScroller(scroller(page), 'x');
  });

  test('scrolling 40 rows: the header stays at the top of the container, also after scrolling sideways', async ({ page }) => {
    await expectPlayToPass(page, STORY('sticky-after-scroll'));
    const s = scroller(page);
    const top = (await rect(s)).top;
    for (const [x, y] of [
      [0, 0],
      [0, 300],
      [100, 1000],
      [300, 5000],
    ] as const) {
      await s.evaluate((el, [sx, sy]) => el.scrollTo(sx!, sy!), [x, y]);
      for (const th of await page.getByRole('columnheader').all()) {
        expect(Math.abs((await rect(th)).top - top)).toBeLessThanOrEqual(1);
      }
    }
  });

  test('the sticky header does not cover the tooltip of a cell beneath it', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    await scroller(page).evaluate((el) => el.scrollTo(0, 120));
    const header0 = await rect(page.getByRole('columnheader').nth(2));
    // the first description cell fully below the header
    const cells = page.getByRole('row').filter({ has: page.getByRole('cell') }).getByRole('cell').filter({ hasText: 'Invoice awaiting' });
    const count = await cells.count();
    let target: Locator | null = null;
    for (let i = 0; i < count; i++) {
      const r = await rect(cells.nth(i));
      if (r.top >= header0.bottom) {
        target = cells.nth(i);
        break;
      }
    }
    expect(target).not.toBeNull();
    await target!.locator('span').first().hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    const topmost = await tooltip.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    });
    expect(topmost).toBe(true);
  });
});

test.describe('truncation tooltip', () => {
  test('nothing at mount; the full text only on a real hover of a truncated cell', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    await page.waitForTimeout(SETTLE);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    const cell = page.locator('#storybook-root tbody tr').first().getByRole('cell').nth(2).locator('span').first();
    const full = (await cell.textContent()) ?? '';
    await cell.hover();
    await expect(page.getByRole('tooltip')).toHaveText(full);
    await page.mouse.move(600, 700, { steps: 8 });
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('a short, not truncated cell opens nothing', async ({ page }) => {
    await expectPlayToPass(page, STORY('plain'));
    await page.locator('#storybook-root tbody tr').first().getByRole('cell').first().locator('span').first().hover();
    await page.waitForTimeout(SETTLE);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });
});

test.describe('accessibility', () => {
  for (const name of ['plain', 'long-texts', 'narrow-container', 'sticky-after-scroll', 'twenty-columns', 'rtl']) {
    test(`${name}: no axe violations`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
      await expectNoA11yViolations(page);
    });
  }
});
