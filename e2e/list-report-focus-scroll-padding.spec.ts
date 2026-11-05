import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// Shift+Tab upwards through the selection checkboxes must never leave the focused one behind the sticky header.
const BASE = 'pro-floorplans-virtual-list-report';
// More than a viewport of rows (the stories show about 10), fewer than the rows above the start.
const STEPS = 18;

function focusedBelowHeader(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    // The sticky element is the header cell, not the `thead` (which scrolls away with the rows).
    const header = el?.closest('table')?.querySelector('thead th');
    if (!el || !header || el.tagName !== 'INPUT' || !el.closest('tbody')) return false;
    return el.getBoundingClientRect().top >= header.getBoundingClientRect().bottom - 0.5;
  });
}

/** Label of the first row checkbox whose top is within one row of the header's bottom edge, or null. */
function firstRowBoxLabel(scroller: Locator): Promise<string | null> {
  return scroller.evaluate((el) => {
    const header = el.querySelector('thead th')!.getBoundingClientRect().bottom;
    const boxes = [...el.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')];
    const first = boxes.find((b) => b.getBoundingClientRect().top >= header - 0.5);
    return first && first.getBoundingClientRect().top - header < 60 ? first.getAttribute('aria-label') : null;
  });
}

for (const [name, story] of [
  ['Free List Report', `${BASE}--free-reference`],
  ['virtualized List Report', `${BASE}--default-no-play`],
] as const) {
  test(`${name}: the checkbox with the focus stays below the sticky header on Shift+Tab`, async ({ page }) => {
    await gotoStory(page, story);
    const table = page.getByRole('table', { name: 'Invoices' });
    const scroller = table.locator('..');
    await expect(table.getByRole('checkbox', { name: 'Select INV-000003' })).toBeVisible();
    await scroller.evaluate((el) => {
      el.scrollTop = 1000;
    });
    // The virtualized rows are mounted a commit after the scroll event: wait for a row at the header edge.
    await expect.poll(() => firstRowBoxLabel(scroller)).not.toBeNull();
    // Align that row flush with the header's bottom edge: the row above is then entirely behind the
    // header, still inside the scrollport.
    const start = await scroller.evaluate((el) => {
      const header = el.querySelector('thead th')!.getBoundingClientRect().bottom;
      const boxes = [...el.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')];
      const first = boxes.find((b) => b.getBoundingClientRect().top >= header - 0.5)!;
      el.scrollTop += first.getBoundingClientRect().top - header;
      return first.getAttribute('aria-label');
    });
    await table.getByRole('checkbox', { name: start! }).focus();
    for (let i = 0; i < STEPS; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusedBelowHeader(page), `step ${i + 1}`).toBe(true);
    }
  });
}
