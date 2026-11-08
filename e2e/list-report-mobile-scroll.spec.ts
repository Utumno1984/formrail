import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #306: documents that the List Report table is horizontally scrollable on mobile and that every
// column (down to the last one, "Status") is reachable. A first look at the visual baselines
// suggested a clipped column, but those are post-scroll/post-sort frames and normal cell
// truncation: there is no layout bug. This test keeps that false alarm from coming back.
const VIEWPORT = { width: 375, height: 667 };

const CASES = [
  {
    name: 'SmartFilterBarShowcase',
    open: (p: Page) => gotoStory(p, 'floorplans-list-report--smart-filter-bar-showcase-no-play'),
  },
  {
    name: 'SmartFilterBarShowcaseActiveFilter',
    open: (p: Page) => gotoStory(p, 'floorplans-list-report--smart-filter-bar-showcase-active-filter'),
  },
  {
    name: 'Introduction (docs page)',
    open: async (p: Page) => {
      await p.goto('/iframe.html?id=introduction--docs&viewMode=docs');
    },
  },
];

/** The table whose header row contains a "Status" column. */
const statusTable = (page: Page): Locator =>
  page
    .getByRole('table')
    .filter({ has: page.getByRole('columnheader', { name: /Status/ }) })
    .first();

for (const c of CASES) {
  test(`375px: ${c.name}: scrolling to the end makes the last column (Status) fully visible`, async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await c.open(page);
    const table = statusTable(page);
    await table.waitFor();
    await table.scrollIntoViewIfNeeded();

    // Nearest horizontally scrollable ancestor of the table.
    const scroller = await table.evaluateHandle((el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth) return n;
      }
      return null;
    });
    const scrollerEl = scroller.asElement();
    expect(scrollerEl, 'the table must be inside a horizontally scrollable container at 375px').not.toBeNull();

    // The document itself must not scroll sideways: the overflow is contained in the table wrapper.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await scrollerEl!.evaluate((n) => {
      n.scrollLeft = n.scrollWidth;
    });
    expect(await scrollerEl!.evaluate((n) => n.scrollLeft + n.clientWidth >= n.scrollWidth - 1)).toBe(true);

    const header = table.getByRole('columnheader', { name: /Status/ });
    await expect(header).toBeVisible();
    const box = (await header.boundingBox())!;
    const wrap = (await scrollerEl!.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(wrap.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(wrap.x + wrap.width + 1);
    expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORT.width + 1);

    // The same holds for a body cell of the last column.
    const cell = (await table.getByRole('row').nth(1).getByRole('cell').last().boundingBox())!;
    expect(cell.x).toBeGreaterThanOrEqual(wrap.x - 1);
    expect(cell.x + cell.width).toBeLessThanOrEqual(wrap.x + wrap.width + 1);
  });
}
