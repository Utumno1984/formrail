import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow, expectSingleScroller } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `floorplans-object-page-layout--${name}`;
const SCROLLER = '[data-object-page-scroller]';

type KeyboardWindow = { __setKeyboard: (px: number) => void };

test.describe('Floorplans/Object Page/Layout', () => {
  for (const width of [640, 700, 768, 900]) {
    test(`header action labels never break mid-word at ${width}px with a long title (#310)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1024 });
      await gotoStory(page, STORY('overview'));
      for (const name of ['Approve', 'Reject']) {
        const button = page.getByRole('button', { name });
        // One line: as tall as a single md button (36px), not two wrapped lines.
        expect((await button.boundingBox())?.height).toBeLessThanOrEqual(40);
        // The label fits on its own line.
        expect(await button.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      }
    });
  }

  for (const width of [640, 700, 768, 900]) {
    test(`many long header actions are never clipped by the scroller at ${width}px (#310)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1024 });
      await gotoStory(page, STORY('many-actions'));
      const scroller = await page.locator(SCROLLER).boundingBox();
      for (const name of ['Request more information', 'Put on hold', 'Reject', 'Approve and schedule payment']) {
        const button = page.getByRole('button', { name });
        const box = await button.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(scroller!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(scroller!.x + scroller!.width + 1);
        expect(await button.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      }
    });
  }

  test('the root fills a 600px parent and exactly one element scrolls, header included', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('overview'));
    const root = page.locator(`${SCROLLER}`).locator('..');
    expect((await root.boundingBox())?.height).toBe(600);
    await expectSingleScroller(page.locator('#storybook-root'));
    const scroller = page.locator(SCROLLER);
    expect(await scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
    // The page (document) does not scroll: the inner container is the one.
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);

    const heading = page.getByRole('heading', { level: 1 });
    const scrollerTop = await scroller.evaluate((el) => el.getBoundingClientRect().top);
    expect(await heading.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(scrollerTop);
    await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
    // No sticky or compressing header: after scrolling it has left the visible area.
    expect(await heading.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThan(scrollerTop);
  });

  test('heading hierarchy, regions and axe on the overview', async ({ page }) => {
    await gotoStory(page, STORY('overview'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('region')).toHaveCount(6);
    await expect(page.getByRole('region', { name: 'Lines' })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('the story play functions pass', async ({ page }) => {
    for (const id of ['playground', 'scrolled-to-end']) {
      await expectPlayToPass(page, STORY(id));
    }
  });

  test('a header only page and a page without a parent height each have one scroller and no error', async ({ page }) => {
    await gotoStory(page, STORY('header-only'));
    await expectSingleScroller(page.locator('#storybook-root'));
    await expect(page.getByRole('region')).toHaveCount(0);

    await gotoStory(page, STORY('no-parent-height'));
    await expectSingleScroller(page.locator('#storybook-root'));
    // The document is the scroller, the inner container is not.
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight)).toBeGreaterThan(0);
    const inner = await page.locator(SCROLLER).evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(inner).toBeLessThanOrEqual(1);
  });

  test('at 320px the actions sit under the title, nothing overflows horizontally and a long title wraps', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, STORY('overview'));
    const heading = page.getByRole('heading', { level: 1 });
    const approve = page.getByRole('button', { name: 'Approve' });
    const headingBox = (await heading.boundingBox())!;
    const approveBox = (await approve.boundingBox())!;
    expect(approveBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
    // Wrapped on several lines (not cut): taller than one line and as wide as the column allows.
    expect(headingBox.height).toBeGreaterThan(60);
    expect(await heading.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expectNoHorizontalOverflow(page.locator(SCROLLER));
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('text-only content: Tab reaches the scroller and PageDown/Space scroll it, not the document', async ({ page }) => {
    // Short viewport: the content is longer than two keyboard pages, so PageDown and Space both have room to scroll.
    await page.setViewportSize({ width: 1024, height: 300 });
    await gotoStory(page, STORY('text-and-wide-content'));
    await expectNoA11yViolations(page);
    const scroller = page.locator(SCROLLER);
    // Resolves with the final scrollTop once it has not changed for several consecutive frames (end of the scroll).
    const settledScrollTop = () =>
      scroller.evaluate(
        (el) =>
          new Promise<number>((resolve) => {
            let last = el.scrollTop;
            let stable = 0;
            const tick = () => {
              if (el.scrollTop === last) stable += 1;
              else {
                last = el.scrollTop;
                stable = 0;
              }
              if (stable >= 10) resolve(last);
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );
    await page.keyboard.press('Tab');
    await expect(scroller).toBeFocused();
    await page.keyboard.press('PageDown');
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const afterPageDown = await settledScrollTop();
    await page.keyboard.press('Space');
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(afterPageDown);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('a section wider than the page scrolls inside its own body, not the page', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await gotoStory(page, STORY('text-and-wide-content'));
    const body = page.getByTestId('wide').locator('..');
    expect(await body.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
    expect(await page.locator(SCROLLER).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the focus ring of a control filling a section body is not clipped by the body', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('keyboard-safe'));
    const input = page.getByRole('textbox', { name: 'Billing address' });
    await input.scrollIntoViewIfNeeded();
    await page.keyboard.press('Tab');
    await input.focus();
    await expectFocusRingVisible(input);
    const slack = await input.evaluate((el) => {
      const cs = getComputedStyle(el);
      const reach = parseFloat(cs.outlineWidth) + parseFloat(cs.outlineOffset);
      // The ring is drawn `reach` px outside the control; the body clips at its padding box.
      const body = el.closest('section')!.lastElementChild!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return Math.min(box.left - reach - body.left, body.right - (box.right + reach), body.bottom - (box.bottom + reach));
    });
    expect(slack).toBeGreaterThanOrEqual(0);
  });

  test('sections stop below the sticky offset variable when scrolled into view', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('overview'));
    const scroller = page.locator(SCROLLER);
    // Set on the scroller, where the Anchor Bar publishes it (the bar's own, measured value is overridden here,
    // so the sections' reaction to the variable is checked with a known number). Same expectation as before.
    await scroller.evaluate((el) => el.style.setProperty('--rop-object-page-sticky-offset', '48px'));
    await page.locator('#section-4').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const delta = await page.locator('#section-4').evaluate((el, top) => el.getBoundingClientRect().top - top, await scroller.evaluate((el) => el.getBoundingClientRect().top));
    // The offset (48) plus the 4px a section keeps below the bar for its title's focus indicator.
    expect(Math.round(delta)).toBe(52);
  });
});

// Keyboard-safe focus (spec §1.10) with the visual viewport replaced by a controllable stand-in
// (same technique as e2e/field.spec.ts): the keyboard shrinks it from the bottom and fires `resize`.
for (const [name, viewport] of [
  ['mobile', { width: 375, height: 667 }],
  ['tablet', { width: 768, height: 1024 }],
] as const) {
  test.describe(`Object Page keyboard-safe focus (${name})`, () => {
    test.use({ viewport, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const target = new EventTarget();
        let keyboard = 0;
        const vv = Object.defineProperties(target, {
          offsetTop: { value: 0 },
          offsetLeft: { value: 0 },
          pageTop: { value: 0 },
          pageLeft: { value: 0 },
          scale: { value: 1 },
          height: { get: () => window.innerHeight - keyboard },
          width: { get: () => window.innerWidth },
        });
        Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
        (window as unknown as KeyboardWindow).__setKeyboard = (px) => {
          keyboard = px;
          target.dispatchEvent(new Event('resize'));
        };
      });
    });

    const setKeyboard = (page: Page, px: number) => page.evaluate((n) => (window as unknown as KeyboardWindow).__setKeyboard(n), px);

    test('a field in the last section ends above the keyboard, scrolling the inner scroller and not the document', async ({ page }) => {
      await gotoStory(page, STORY('keyboard-safe'));
      const input = page.getByRole('textbox', { name: 'Billing address' });
      const scroller = page.locator(SCROLLER);
      // Bottom edge of the scroll area: visible now, under the keyboard later.
      await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
      const keyboard = Math.round(viewport.height * 0.45);
      const box = () => input.evaluate((el) => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
      expect((await box()).bottom).toBeGreaterThan(viewport.height - keyboard);

      await input.focus();
      await setKeyboard(page, keyboard);

      await expect.poll(async () => (await box()).bottom).toBeLessThanOrEqual(viewport.height - keyboard);
      expect((await box()).top).toBeGreaterThanOrEqual(0);
      // The inner container moved; the document did not.
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      // The scroller pads its bottom with the keyboard inset (plus the page margin).
      const padding = await scroller.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
      expect(padding).toBeGreaterThanOrEqual(keyboard);

      await input.blur();
      await setKeyboard(page, 0);
      expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--rop-keyboard-inset'))).toBe('');
    });
  });
}
