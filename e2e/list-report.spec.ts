import { expect, test, type Locator, type Page } from '@playwright/test';
import { formatEuro, makeDemoInvoices } from '../packages/core/src/internal/demo-invoices';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow, expectSingleScroller } from './helpers/geometry';
import { expectPlayToPass } from './helpers/story';

const gotoStory = expectPlayToPass;

const STORY = (name: string) => `floorplans-list-report--${name}`;
// The showcase without its play function: the Playground's one filters, searches and sorts (and leaves
// the sort active), so a test that interacts starts from the same page without it.
const PLAYGROUND = STORY('no-play');

const table = (page: Page): Locator => page.getByRole('table', { name: 'Fatture' });
const scroller = (page: Page): Locator => table(page).locator('..');
const heading = (page: Page): Locator => page.getByRole('heading', { name: /Fatture/ });
const pill = (page: Page, name: string): Locator => page.getByRole('radio', { name });
const search = (page: Page): Locator => page.getByRole('searchbox', { name: 'Search' });
const bodyRows = (page: Page): Locator => table(page).locator('tbody tr:not([aria-hidden])');

const ALL = makeDemoInvoices(200);
const PENDING = ALL.filter((r) => r.status === 'pending');
const FOUND = PENDING.filter((r) => r.supplier.includes('Ferrari')).sort((a, b) => b.amount - a.amount);

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The boxes of the fixed parts of the report, relative to the page. */
async function layout(page: Page): Promise<{ header: Box; bar: Box; scroller: Box }> {
  const box = async (l: Locator): Promise<Box> => {
    const b = await l.boundingBox();
    if (!b) throw new Error('layout: element has no box');
    return { top: b.y, left: b.x, width: b.width, height: b.height };
  };
  return {
    header: await box(heading(page).locator('..')),
    bar: await box(page.getByRole('search')),
    scroller: await box(scroller(page)),
  };
}

const close = (a: number, b: number): void => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(1);
const sameBox = (a: Box, b: Box): void => {
  close(a.top, b.top);
  close(a.left, b.left);
  close(a.width, b.width);
  close(a.height, b.height);
};

/** Presses Tab until `target` has the focus (the sort buttons and the table sit between). */
async function tabTo(page: Page, target: Locator, max = 12): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`tabTo: not reached in ${max} Tab presses`);
}

test.describe('Floorplans/List Report: stories play', () => {
  for (const name of ['playground', 'with-active-filter', 'loading', 'empty', 'no-results', 'error-state', 'count-pill']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('accessibility', () => {
  for (const name of ['playground', 'with-active-filter', 'loading', 'empty', 'no-results', 'error-state', 'flow-layout', 'count-pill']) {
    test(`${name}: no axe violations`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
      await expectNoA11yViolations(page);
    });
  }

  test('the table is named by the title (aria-labelledby), the count is part of the heading only', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    await expect(heading(page)).toHaveText('Fatture (200)');
    const id = await table(page).getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    await expect(page.locator(`[id="${id}"]`)).toHaveText('Fatture');
    await expect(table(page)).not.toHaveAttribute('aria-label', /.+/);
  });

  test('a single live region in the report', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    await expect(page.locator('#storybook-root [aria-live]')).toHaveCount(1);
  });
});

test.describe('single scroller', () => {
  test('200 rows in a 600px parent: only the table container scrolls, header and bar stay put, the table header sticks', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    await expect(bodyRows(page)).toHaveCount(200);
    await expectSingleScroller(page.locator('#storybook-root'));
    const box = await scroller(page).evaluate((el) => ({ scrollable: el.scrollHeight > el.clientHeight, client: el.clientHeight }));
    expect(box.scrollable).toBe(true);
    const page_ = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
    expect(page_.sh).toBeLessThanOrEqual(page_.ch);

    const before = await layout(page);
    const headerCell = table(page).locator('th').first();
    const headerBefore = await headerCell.boundingBox();
    await scroller(page).evaluate((el) => {
      el.scrollTop = 900;
    });
    await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
    const after = await layout(page);
    sameBox(before.header, after.header);
    sameBox(before.bar, after.bar);
    sameBox(before.scroller, after.scroller);
    const headerAfter = await headerCell.boundingBox();
    close(headerAfter!.y, headerBefore!.y);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('the report fills a 600px parent (not shorter, not taller)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoStory(page, PLAYGROUND);
    const root = scroller(page).locator('..');
    const b = await root.boundingBox();
    close(b!.height, 600);
  });

  test('a window resize: the scroller adapts, never two scrollers', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoStory(page, PLAYGROUND);
    const tall = (await scroller(page).boundingBox())!.height;
    await page.setViewportSize({ width: 1280, height: 640 });
    await expect.poll(async () => (await scroller(page).boundingBox())!.height).toBeLessThan(tall);
    await expectSingleScroller(page.locator('#storybook-root'));
    await page.setViewportSize({ width: 1000, height: 900 });
    await expectSingleScroller(page.locator('#storybook-root'));
  });

  test('without a parent height it does not collapse: the table grows with its rows and the page scrolls (still one scroller)', async ({ page }) => {
    await gotoStory(page, STORY('flow-layout'));
    await expect(bodyRows(page)).toHaveCount(200);
    const rowHeight = (await bodyRows(page).first().boundingBox())!.height;
    const container = (await scroller(page).boundingBox())!;
    expect(container.height).toBeGreaterThan(200 * rowHeight);
    const metrics = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
    expect(metrics.sh).toBeGreaterThan(metrics.ch);
    await expectSingleScroller(page.locator('#storybook-root'));
    expect(await scroller(page).evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  });

  test('few rows: the report keeps the footprint of the table body, no zero height', async ({ page }) => {
    await gotoStory(page, STORY('flow-layout'), 'dataset:3');
    await expect(bodyRows(page)).toHaveCount(3);
    expect((await scroller(page).boundingBox())!.height).toBeGreaterThan(100);
    await expectSingleScroller(page.locator('#storybook-root'));
  });
});

test.describe('responsive', () => {
  test('mobile 390x844: title above, actions below, no page overflow, the table scrolls sideways inside', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoStory(page, PLAYGROUND);
    const title = await heading(page).boundingBox();
    const action = await page.getByRole('button', { name: 'Nuova fattura' }).boundingBox();
    expect(action!.y).toBeGreaterThanOrEqual(title!.y + title!.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await scroller(page).evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expectSingleScroller(page.locator('#storybook-root'));
  });

  test('320px wide: no horizontal overflow of the page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, PLAYGROUND);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // the container may scroll sideways inside itself; nothing else sticks out of the report
    await expectNoHorizontalOverflow(page.getByRole('search'));
  });

  test('desktop: title and actions on one row', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    const title = await heading(page).boundingBox();
    const action = await page.getByRole('button', { name: 'Nuova fattura' }).boundingBox();
    expect(action!.y).toBeLessThan(title!.y + title!.height);
    expect(action!.x).toBeGreaterThan(title!.x + title!.width);
  });
});

test.describe('live region count', () => {
  test('a filter and a committed search that stay in ready announce the new count, in the one live region', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    const region = page.locator('#storybook-root [aria-live="polite"]');
    await expect(region).toHaveCount(1);
    await pill(page, 'Tutte').focus();
    await page.keyboard.press('ArrowRight');
    await expect(region).toHaveText(`${PENDING.length} results`);
    await search(page).focus();
    await page.keyboard.type('Ferrari');
    await page.keyboard.press('Enter');
    await expect(region).toHaveText(FOUND.length === 1 ? '1 result' : `${FOUND.length} results`);
    await expect(region).toHaveCount(1);
  });
});

test.describe('real keyboard (no mouse)', () => {
  test('the scenario of the play function: filter, search, sort, no results, clear', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    await pill(page, 'Tutte').focus();
    await page.keyboard.press('ArrowRight');
    await expect(pill(page, 'Da approvare')).toBeChecked();
    await expect(pill(page, 'Da approvare')).toBeFocused();
    await expect(heading(page)).toHaveText(`Fatture (${PENDING.length} of 200)`);

    await page.keyboard.press('Tab');
    await expect(search(page)).toBeFocused();
    await page.keyboard.type('Ferrari');
    await page.keyboard.press('Enter');
    await expect(heading(page)).toHaveText(`Fatture (${FOUND.length} of 200)`);
    await expect(bodyRows(page)).toHaveCount(FOUND.length);

    await tabTo(page, page.getByRole('button', { name: 'Importo' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('columnheader', { name: 'Importo' })).toHaveAttribute('aria-sort', 'descending');
    await expect(bodyRows(page).nth(0)).toContainText(FOUND[0]!.number);
    await expect(bodyRows(page).nth(0)).toContainText(formatEuro(FOUND[0]!.amount));
    await expect(bodyRows(page).nth(1)).toContainText(FOUND[1]!.number);

    await search(page).focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('zzz');
    await page.keyboard.press('Enter');
    await expect(table(page).getByText('No results for the current filters', { exact: true })).toBeVisible();
    await expect(heading(page)).toHaveText('Fatture (0 of 200)');

    await tabTo(page, page.getByRole('button', { name: 'Clear filters' }));
    await page.keyboard.press('Enter');
    await expect(bodyRows(page)).toHaveCount(200);
    await expect(heading(page)).toHaveText('Fatture (200)');
    await expect(pill(page, 'Tutte')).toBeChecked();
    await expect(search(page)).toHaveValue('');
    await expect(search(page)).toBeFocused();
  });

  test('"Clear filters" with the mouse also lands the focus on the search box, not the body', async ({ page }) => {
    await gotoStory(page, STORY('no-results'));
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(bodyRows(page)).toHaveCount(200);
    await expect(search(page)).toBeFocused();
  });

  test('the table container is a tab stop (the keyboard can scroll it)', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    await scroller(page).focus();
    await page.keyboard.press('PageDown');
    await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });
});

test.describe('"Simula caricamento"', () => {
  test('title, filter bar and table do not move between data, loading and data again', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    await expect(bodyRows(page)).toHaveCount(200);
    const data = await layout(page);
    const headerCols = await table(page).locator('th').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));

    const button = page.getByRole('button', { name: 'Simula caricamento' });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(scroller(page)).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#storybook-root [data-rop-skeleton]').first()).toBeVisible();
    const loading = await layout(page);
    sameBox(data.header, loading.header);
    sameBox(data.bar, loading.bar);
    sameBox(data.scroller, loading.scroller);
    expect(await table(page).locator('th').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))).toEqual(headerCols);

    await expect(scroller(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(bodyRows(page)).toHaveCount(200);
    const back = await layout(page);
    sameBox(data.header, back.header);
    sameBox(data.bar, back.bar);
    sameBox(data.scroller, back.scroller);
  });

  test('a filter and a typed search survive loading -> data', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    await pill(page, 'Da approvare').click();
    await search(page).fill('Ferrari');
    await search(page).press('Enter');
    await expect(heading(page)).toHaveText(`Fatture (${FOUND.length} of 200)`);
    await page.getByRole('button', { name: 'Simula caricamento' }).click();
    await expect(scroller(page)).toHaveAttribute('aria-busy', 'true');
    await expect(scroller(page)).not.toHaveAttribute('aria-busy', 'true');
    await expect(pill(page, 'Da approvare')).toBeChecked();
    await expect(search(page)).toHaveValue('Ferrari');
    await expect(heading(page)).toHaveText(`Fatture (${FOUND.length} of 200)`);
  });
});

test.describe('controls', () => {
  test('status=error: Retry is there and the count is invisible', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'status:error');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(heading(page).getByText('(200)')).toBeHidden();
  });

  test('firstSortDirection of "Data": asc or desc at the first click', async ({ page }) => {
    for (const [direction, sort] of [
      ['asc', 'ascending'],
      ['desc', 'descending'],
    ] as const) {
      await gotoStory(page, PLAYGROUND, `firstSortDirection:${direction}`);
      await page.getByRole('button', { name: 'Data' }).click();
      await expect(page.getByRole('columnheader', { name: 'Data' })).toHaveAttribute('aria-sort', sort);
    }
  });

  test('containerWidth narrows the report', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'containerWidth:500');
    expect((await scroller(page).boundingBox())!.width).toBeLessThanOrEqual(501);
    await expectSingleScroller(page.locator('#storybook-root'));
  });
});
