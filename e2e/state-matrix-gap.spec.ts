import { expect, test } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #311: in the single-column reflow (375px) of every "state matrix" story, the vertical space
// between two adjacent entries must be the same everywhere, including between state groups.
const STORIES = ['forms-checkbox--state-matrix', 'forms-switch--state-matrix', 'forms-radiogroup--state-matrix'];

test.use({ viewport: { width: 375, height: 667 } });

for (const id of STORIES) {
  test(`${id}: uniform vertical gap between entries at 375px`, async ({ page }) => {
    await gotoStory(page, id);
    const result = await page.evaluate(() => {
      const grid = [...document.querySelectorAll<HTMLElement>('#storybook-root div')].find(
        (d) => getComputedStyle(d).display === 'grid',
      )!;
      const items = [...grid.children] as HTMLElement[];
      // Bottom of the last visible leaf (text or control) of an entry, not of its box.
      const contentBottom = (el: HTMLElement) => {
        let bottom = el.getBoundingClientRect().top;
        for (const d of el.querySelectorAll<HTMLElement>('*')) {
          const r = d.getBoundingClientRect();
          if (r.height > 0 && d.children.length === 0 && (d.textContent ?? '').trim() !== '') {
            bottom = Math.max(bottom, r.bottom);
          }
        }
        return bottom;
      };
      return {
        cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        boxGaps: items.slice(1).map((it, i) => it.getBoundingClientRect().top - items[i]!.getBoundingClientRect().bottom),
        gaps: items.slice(1).map((it, i) => it.getBoundingClientRect().top - contentBottom(items[i]!)),
      };
    });
    expect(result.cols).toBe(1);
    expect(result.gaps.length).toBeGreaterThan(5);
    const first = result.gaps[0]!;
    for (const g of result.gaps) expect(Math.abs(g - first)).toBeLessThanOrEqual(1);
  });
}
