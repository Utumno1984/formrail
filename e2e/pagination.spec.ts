import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

// The Playground story runs a play function that pages to the end, which would race with the tests
// that set `page` through args: they use the same control without a play function.
const PLAYGROUND = 'navigation-pagination--manual';
const nav = (page: Page) => page.getByTestId('pagination');
const width = (page: Page) => nav(page).evaluate((el) => el.getBoundingClientRect().width);

test.describe('Navigation/Pagination', () => {
  test('the Playground play function passes and axe is clean', async ({ page }) => {
    await expectPlayToPass(page, 'navigation-pagination--playground');
    await expectNoA11yViolations(page);
  });

  test('every story is free of a11y violations', async ({ page }) => {
    for (const id of ['first-page', 'middle-page', 'last-page', 'single-page', 'disabled', 'right-to-left']) {
      await gotoStory(page, `navigation-pagination--${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('the width does not change from page 1 to 9, 10, 99, 100 with pageCount=120', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'page:1;pageCount:120');
    const reference = await width(page);
    for (const n of [1, 9, 10, 11, 99, 100, 101, 120]) {
      await gotoStory(page, PLAYGROUND, `page:${n};pageCount:120`);
      expect(Math.abs((await width(page)) - reference), `page ${n}`).toBeLessThanOrEqual(0.5);
    }
  });

  test('the width does not change while clicking through 9 -> 10 and 99 -> 100', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'page:8;pageCount:120');
    const reference = await width(page);
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Next page' }).click();
      expect(Math.abs((await width(page)) - reference)).toBeLessThanOrEqual(0.5);
    }
    await gotoStory(page, PLAYGROUND, 'page:98;pageCount:120');
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Next page' }).click();
      expect(Math.abs((await width(page)) - reference)).toBeLessThanOrEqual(0.5);
    }
  });

  test('the buttons use tabular digits and every slot has the same width', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'page:60;pageCount:120');
    const m = await nav(page).evaluate((el) => {
      const buttons = Array.from(el.querySelectorAll('button'));
      return {
        tabular: buttons.map((b) => getComputedStyle(b).fontVariantNumeric),
        widths: buttons.map((b) => Math.round(b.getBoundingClientRect().width * 10) / 10),
        heights: buttons.map((b) => Math.round(b.getBoundingClientRect().height * 10) / 10),
      };
    });
    m.tabular.forEach((t) => expect(t).toContain('tabular-nums'));
    expect(new Set(m.widths).size).toBe(1);
    m.heights.forEach((h) => expect(h).toBeGreaterThanOrEqual(32));
    m.widths.forEach((w) => expect(w).toBeGreaterThanOrEqual(32));
  });

  test('keyboard: Enter on Next up to the last page never leaves the focus on body', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'page:116;pageCount:120');
    await page.getByRole('button', { name: 'Next page' }).focus();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Enter');
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
    }
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Page 120' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Page 120' })).toHaveAttribute('aria-current', 'page');
  });

  test('keyboard: Previous at page 2 moves the focus to page 1', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'page:2;pageCount:120');
    await page.getByRole('button', { name: 'Previous page' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Page 1', exact: true })).toBeFocused();
  });

  test('a number that changes position after the click keeps the focus on the same node', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'page:1;pageCount:120');
    const five = page.getByRole('button', { name: 'Page 5', exact: true });
    const position = () =>
      five.evaluate((el) => Array.from(el.closest('ul')!.children).indexOf(el.parentElement!));
    const before = await position();
    await five.evaluate((el) => el.setAttribute('data-probe', 'same-node'));
    await five.focus();
    await page.keyboard.press('Enter');
    await expect(five).toHaveAttribute('aria-current', 'page');
    await expect(five).toBeFocused();
    await expect(five).toHaveAttribute('data-probe', 'same-node');
    expect(await position()).not.toBe(before);
  });

  test('the tab sequence skips the ellipses', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'page:60;pageCount:120');
    await page.getByRole('button', { name: 'Previous page' }).focus();
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      seen.push((await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ?? '');
    }
    expect(seen).toEqual(['Page 1', 'Page 59', 'Page 60', 'Page 61', 'Page 120', 'Next page']);
  });

  test('pageCount 1: one current page, both arrows disabled, same height as with data', async ({ page }) => {
    await gotoStory(page, 'navigation-pagination--single-page');
    await expect(page.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
    const single = (await nav(page).boundingBox())!.height;
    await gotoStory(page, PLAYGROUND, 'page:60;pageCount:120');
    expect(Math.abs((await nav(page).boundingBox())!.height - single)).toBeLessThanOrEqual(0.5);
  });

  test('disabled: every button is disabled and the size is the same as enabled', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'page:60;pageCount:120');
    const enabled = (await nav(page).boundingBox())!;
    await gotoStory(page, 'navigation-pagination--disabled');
    for (const b of await nav(page).getByRole('button').all()) await expect(b).toBeDisabled();
    const disabled = (await nav(page).boundingBox())!;
    expect(Math.abs(disabled.width - enabled.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(disabled.height - enabled.height)).toBeLessThanOrEqual(0.5);
  });

  test('375px with pageCount=100: no horizontal overflow, touch targets >= 32px, one row', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoStory(page, PLAYGROUND, 'page:50;pageCount:100');
    await expectNoHorizontalOverflow(page.locator('body'));
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(m.scroll).toBeLessThanOrEqual(m.client);
    const boxes = await nav(page)
      .getByRole('button')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height };
        }),
      );
    boxes.forEach((b) => {
      expect(b.w).toBeGreaterThanOrEqual(32);
      expect(b.h).toBeGreaterThanOrEqual(32);
    });
    expect((await nav(page).boundingBox())!.height).toBeLessThanOrEqual(40);
  });

  test('the focus ring of every kind of button is fully visible', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'page:60;pageCount:120');
    await expectFocusRingVisible(page.getByRole('button', { name: 'Previous page' }));
    await expectFocusRingVisible(page.getByRole('button', { name: 'Page 1', exact: true }));
    await expectFocusRingVisible(page.getByRole('button', { name: 'Page 60' }));
    await expectFocusRingVisible(page.getByRole('button', { name: 'Next page' }));
  });

  test('RTL: the layout flows right to left and the arrows are mirrored', async ({ page }) => {
    await gotoStory(page, 'navigation-pagination--right-to-left');
    const previous = (await page.getByRole('button', { name: 'Previous page' }).boundingBox())!;
    const next = (await page.getByRole('button', { name: 'Next page' }).boundingBox())!;
    expect(previous.x).toBeGreaterThan(next.x);
    const transforms = await page.evaluate(() =>
      ['Previous page', 'Next page'].map(
        (l) => getComputedStyle(document.querySelector(`[aria-label="${l}"] svg`)!).transform,
      ),
    );
    transforms.forEach((t) => expect(t).toBe('matrix(-1, 0, 0, 1, 0, 0)'));
  });

  test('LTR: the arrows are not mirrored', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    const t = await page.evaluate(
      () => getComputedStyle(document.querySelector('[aria-label="Next page"] svg')!).transform,
    );
    expect(t).toBe('none');
  });
});
