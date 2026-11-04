import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

const MANUAL = 'navigation-pagination--manual';
const nav = (page: Page) => page.getByTestId('pagination');
// Higher specificity than preflight's `*`, no !important: what a host without preflight looks like
// (the component's inline box-sizing must still win).
const CONTENT_BOX = 'html body *, html body *::before, html body *::after { box-sizing: content-box; }';

// QA additions for #184: Space key, every slot (ellipses too) has one width, a host without preflight
// (content-box) keeps equal slots, out-of-range clamp, ARIA, RTL arrows.
test.describe('Navigation/Pagination QA', () => {
  test('Space activates a page button and keeps the focus on it', async ({ page }) => {
    await gotoStory(page, MANUAL, 'page:1;pageCount:120');
    const target = page.getByRole('button', { name: 'Page 2', exact: true });
    await target.focus();
    await page.keyboard.press('Space');
    await expect(target).toHaveAttribute('aria-current', 'page');
    await expect(target).toBeFocused();
  });

  test('numbers, arrows and ellipses all have the same width, with and without preflight', async ({ page }) => {
    await gotoStory(page, MANUAL, 'page:60;pageCount:1200');
    const slots = () =>
      nav(page).evaluate((el) =>
        Array.from(el.querySelectorAll('li')).map((li) => Math.round(li.getBoundingClientRect().width * 10) / 10),
      );
    expect(new Set(await slots()).size).toBe(1);
    await page.addStyleTag({ content: CONTENT_BOX });
    const widths = await slots();
    expect(new Set(widths).size, JSON.stringify(widths)).toBe(1);
    expect(widths[0]).toBeGreaterThanOrEqual(32);
  });

  test('slot count is constant for every page of 120', async ({ page }) => {
    const counts = new Set<number>();
    for (const n of [1, 2, 3, 4, 5, 6, 7, 60, 114, 115, 116, 117, 118, 119, 120]) {
      await gotoStory(page, MANUAL, `page:${n};pageCount:120`);
      counts.add(await nav(page).locator('li').count());
    }
    expect([...counts]).toHaveLength(1);
  });

  test('ellipses are aria-hidden and not tab stops; nav is named; one aria-current', async ({ page }) => {
    await gotoStory(page, MANUAL, 'page:60;pageCount:120');
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible();
    await expect(nav(page).locator('li[aria-hidden="true"]')).toHaveCount(2);
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
    expect(await nav(page).locator('li[aria-hidden="true"] button, li[aria-hidden="true"] [tabindex]').count()).toBe(0);
  });

  test('out-of-range page/pageCount are clamped visibly', async ({ page }) => {
    await gotoStory(page, MANUAL, 'page:999;pageCount:10');
    await expect(page.getByRole('button', { name: 'Page 10', exact: true })).toHaveAttribute('aria-current', 'page');
    await gotoStory(page, MANUAL, 'page:0;pageCount:10');
    await expect(page.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute('aria-current', 'page');
    await gotoStory(page, MANUAL, 'page:3;pageCount:0');
    await expect(nav(page).getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('RTL: arrows are mirrored', async ({ page }) => {
    await gotoStory(page, 'navigation-pagination--right-to-left');
    const t = await page.evaluate(
      () => getComputedStyle(document.querySelector('[aria-label="Next page"] svg')!).transform,
    );
    expect(t).toBe('matrix(-1, 0, 0, 1, 0, 0)');
  });

  test('375px, 3-digit pageCount, host without preflight: one row, no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoStory(page, MANUAL, 'page:500;pageCount:999');
    await page.addStyleTag({ content: CONTENT_BOX });
    const m = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth,
      c: document.documentElement.clientWidth,
    }));
    expect(m.s).toBeLessThanOrEqual(m.c);
    expect((await nav(page).boundingBox())!.height).toBeLessThanOrEqual(40);
  });

  test('disabled while a page loads: the focus ends on the current page, never on body', async ({ page }) => {
    await expectPlayToPass(page, 'navigation-pagination--loading-on-change');
  });
});
