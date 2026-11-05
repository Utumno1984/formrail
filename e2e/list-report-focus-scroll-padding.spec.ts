import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// Shift+Tab upwards through the selection checkboxes must never leave the focused one, or its focus ring,
// behind the sticky header.
const BASE = 'pro-floorplans-virtual-list-report';
// Shift+Tab presses per starting offset; the first one is the case under test, the others keep scrolling upwards.
const STEPS = 3;
// How far below the header's bottom edge the first Shift+Tab target sits when the keys start: a target
// just under the header is inside the scrollport, so only the scroll padding makes the browser scroll.
const OFFSETS = [1, 3, 5];

interface Probe {
  box: boolean;
  boxTop: number;
  ringTop: number;
  headerBottom: number;
}

function probeFocused(page: Page): Promise<Probe | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    // The sticky element is the header cell, not the `thead` (which scrolls away with the rows).
    const header = el?.closest('table')?.querySelector('thead th');
    if (!el || !header || el.tagName !== 'INPUT' || !el.closest('tbody')) return null;
    const style = getComputedStyle(el);
    const boxTop = el.getBoundingClientRect().top;
    const ring = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
    return { box: true, boxTop, ringTop: boxTop - ring, headerBottom: header.getBoundingClientRect().bottom };
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
  test(`${name}: the checkbox with the focus and its ring stay below the sticky header on Shift+Tab @engines`, async ({
    page,
  }, testInfo) => {
    const browserName = testInfo.project.name;
    await gotoStory(page, story);
    const table = page.getByRole('table', { name: 'Invoices' });
    const scroller = table.locator('..');
    await expect(table.getByRole('checkbox', { name: 'Select INV-000003' })).toBeVisible();

    for (const offset of OFFSETS) {
      await scroller.evaluate((el) => {
        el.scrollTop = 1000;
      });
      // The virtualized rows are mounted a commit after the scroll event: wait for a row at the header edge.
      await expect.poll(() => firstRowBoxLabel(scroller)).not.toBeNull();
      // Place the first Shift+Tab target `offset` px below the header's bottom edge; focus the row after it.
      const start = await scroller.evaluate((el, offsetPx) => {
        const header = el.querySelector('thead th')!.getBoundingClientRect().bottom;
        const boxes = [...el.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')];
        const i = boxes.findIndex((b) => b.getBoundingClientRect().top >= header - 0.5);
        el.scrollTop += boxes[i]!.getBoundingClientRect().top - header - offsetPx;
        return boxes[i + 1]!.getAttribute('aria-label');
      }, offset);
      await table.getByRole('checkbox', { name: start! }).focus();
      for (let i = 0; i < STEPS; i++) {
        await page.keyboard.press('Shift+Tab');
        const probe = await probeFocused(page);
        const where = `offset ${offset}px, step ${i + 1}`;
        expect(probe, `${where}: a row checkbox has the focus`).not.toBeNull();
        expect(probe!.boxTop, `${where}: checkbox below the header`).toBeGreaterThanOrEqual(probe!.headerBottom - 0.5);
        // Firefox scrolls a focused element into view only when it is entirely hidden, so it leaves a box
        // that is partly clear of the header (and its ring under it) where it is: the ring is asserted
        // in the engines that scroll as soon as any part is hidden.
        if (browserName === 'chromium') {
          expect(probe!.ringTop, `${where}: focus ring below the header`).toBeGreaterThanOrEqual(
            probe!.headerBottom - 0.5,
          );
        }
      }
    }
  });
}
