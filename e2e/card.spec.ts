import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow, expectSingleScroller } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

test.describe('Primitives/Card', () => {
  test('the Playground play function passes and axe is clean', async ({ page }) => {
    await expectPlayToPass(page, 'primitives-card--playground');
    await expectNoA11yViolations(page);
  });

  test('every story is free of a11y violations', async ({ page }) => {
    for (const id of ['complete', 'body-only', 'long-unbroken-text', 'many-actions', 'card-grid']) {
      await gotoStory(page, `primitives-card--${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('the focus ring of the footer button and of a body link is fully visible (not clipped)', async ({ page }) => {
    await gotoStory(page, 'primitives-card--playground');
    await expectFocusRingVisible(page.getByRole('button', { name: 'Edit' }));
    await expectFocusRingVisible(page.getByRole('button', { name: 'Cancel' }));
    await expectFocusRingVisible(page.getByRole('link', { name: 'Open the full details' }));
  });

  test('the card has no overflow other than visible, on any part', async ({ page }) => {
    await gotoStory(page, 'primitives-card--complete');
    const overflows = await page
      .getByTestId('card')
      .evaluate((el) => [el, ...Array.from(el.querySelectorAll('*'))].map((n) => getComputedStyle(n).overflow));
    expect(new Set(overflows)).toEqual(new Set(['visible']));
  });

  test('a 200-character word wraps inside the card at 375px, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoStory(page, 'primitives-card--long-unbroken-text');
    await expectNoHorizontalOverflow(page.locator('body'));
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(m.scroll).toBeLessThanOrEqual(m.client);
    const card = await page.getByTestId('card').boundingBox();
    expect(card!.width).toBeLessThanOrEqual(375);
  });

  test('footer actions are aligned to the end, and wrap at 280px without overlapping', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoStory(page, 'primitives-card--many-actions');
    const rects = await page
      .getByTestId('footer')
      .locator('button')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })));
    const lines = new Set(rects.map((r) => Math.round(r.t)));
    expect(lines.size).toBeGreaterThan(1);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlap = a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
        expect(overlap, `buttons ${i} and ${j} overlap`).toBe(false);
      }
    }
    await expectNoHorizontalOverflow(page.getByTestId('container'));
    // The last button ends at the content edge of the footer (LTR: right).
    const footer = await page.getByTestId('footer').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { right: r.right - parseFloat(getComputedStyle(el).paddingRight) };
    });
    const last = rects[rects.length - 1]!;
    expect(Math.abs(last.r - footer.right)).toBeLessThanOrEqual(1);
  });

  test('in RTL the footer actions are aligned to the left (the end of the line)', async ({ page }) => {
    await gotoStory(page, 'primitives-card--complete');
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    const m = await page.getByTestId('card').evaluate((card) => {
      const btn = card.querySelector('button') as HTMLElement;
      const buttons = Array.from(card.querySelectorAll('button')).map((b) => b.getBoundingClientRect());
      const c = card.getBoundingClientRect();
      return { cardLeft: c.left, cardRight: c.right, minLeft: Math.min(...buttons.map((b) => b.left)), maxRight: Math.max(...buttons.map((b) => b.right)), ok: !!btn };
    });
    expect(m.ok).toBe(true);
    expect(m.minLeft - m.cardLeft).toBeLessThan(m.cardRight - m.maxRight);
  });

  test('a card in a narrow grid column stays inside its cell', async ({ page }) => {
    await gotoStory(page, 'primitives-card--card-grid');
    const cells = await page.getByTestId('grid').evaluate((grid) =>
      Array.from(grid.children).map((c) => ({ w: c.getBoundingClientRect().width, scroll: c.scrollWidth, client: c.clientWidth })),
    );
    for (const c of cells) {
      expect(c.w).toBeLessThanOrEqual(142);
      expect(c.scroll).toBeLessThanOrEqual(c.client + 1);
    }
    await expectNoHorizontalOverflow(page.getByTestId('grid'));
  });

  test('as="section" is a region named by the title; two cards with equal titles name themselves', async ({ page }) => {
    await gotoStory(page, 'primitives-card--card-grid');
    await expect(page.getByRole('region', { name: 'One' })).toBeVisible();
    const ids = await page.locator('section[aria-labelledby]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby')));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('inside a Dialog there is a single scroller and no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 500 });
    await gotoStory(page, 'primitives-card--inside-dialog');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectSingleScroller(dialog);
    await expectSingleScroller(dialog, 'x');
    await expectNoHorizontalOverflow(dialog);
  });
});
