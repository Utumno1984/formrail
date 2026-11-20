import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #498: with the virtual keyboard open, a focused Field inside the Object Page lands just above the keyboard. The
// keyboard's height is measured from the bottom of the window, but the page's scroller ends above the save bar, which
// the keyboard covers first: the save bar must be counted once, not added to the keyboard (which left a gap of the
// save bar's height between the field and the keyboard).
//
// The keyboard is a stand-in for the visual viewport (the technique of e2e/field.spec.ts and
// e2e/object-page-focus-not-obscured.spec.ts): chromium only, like every keyboard stand-in of the repository.
const STORY = 'floorplans-object-page-layout--long-form';
const SCROLLER = '[data-object-page-scroller]';
// A Field ends 0.5rem above the keyboard (its own scroll margin).
const MARGIN = 8;

type KeyboardWindow = { __setKeyboard: (px: number) => void };
const setKeyboard = (page: Page, px: number) => page.evaluate((n) => (window as unknown as KeyboardWindow).__setKeyboard(n), px);

interface Spot {
  /** Bottom of the focused control's Field (label, control and message slot). */
  fieldBottom: number;
  /** Bottom of the focused control itself. */
  controlBottom: number;
  /** Bottom of what the user sees: the visual viewport (above the keyboard). */
  visibleBottom: number;
  /** Height of the save bar's slot, under the scroller. */
  footer: number;
  /** The scroll margin the browser keeps under the focused control. */
  marginBottom: number;
  scrollY: number;
}

/** Waits until the scroller has not moved for 2 frames, then measures the focused control and its Field. */
const spot = (page: Page): Promise<Spot> =>
  page.evaluate(async (selector) => {
    const scroller = document.querySelector(selector) as HTMLElement;
    await new Promise<void>((resolve) => {
      let last = -1;
      let still = 0;
      const tick = () => {
        still = scroller.scrollTop === last ? still + 1 : 0;
        last = scroller.scrollTop;
        if (still >= 2) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const control = document.activeElement as HTMLElement;
    const field = control.closest('[data-state]') as HTMLElement;
    const vv = window.visualViewport!;
    return {
      fieldBottom: field.getBoundingClientRect().bottom,
      controlBottom: control.getBoundingClientRect().bottom,
      visibleBottom: vv.offsetTop + vv.height,
      footer: document.querySelector('[data-object-page-footer-slot]')!.getBoundingClientRect().height,
      marginBottom: parseFloat(getComputedStyle(control).scrollMarginBottom),
      scrollY: window.scrollY,
    };
  }, SCROLLER);

/** Positions of the field labels in the scroller. */
const labelTops = (page: Page) =>
  page.locator(SCROLLER).evaluate((el) => Array.from(el.querySelectorAll('label')).map((label) => label.getBoundingClientRect().top));

/** Scrolls the scroller so the Field of `name` ends just above the save bar (visible, where the keyboard will cover it), and focuses it. */
async function focusLow(page: Page, name: string): Promise<void> {
  const input = page.getByRole('textbox', { name, exact: true });
  await input.evaluate((el, selector) => {
    const scroller = document.querySelector(selector) as HTMLElement;
    const field = el.closest('[data-state]') as HTMLElement;
    scroller.scrollTop += field.getBoundingClientRect().bottom - (scroller.getBoundingClientRect().bottom - 8);
  }, SCROLLER);
  await input.focus();
}

for (const viewport of [
  { width: 390, height: 500 },
  { width: 390, height: 844 },
] as const) {
  // The repository's stand-in for a keyboard: 45% of the height.
  const keyboard = Math.round(viewport.height * 0.45);

  test.describe(`Object Page with a save bar, virtual keyboard of ${keyboard}px (${viewport.width}x${viewport.height}): the save bar is counted once (#498)`, () => {
    test.use({ viewport, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const target = new EventTarget();
        let height = 0;
        const vv = Object.defineProperties(target, {
          offsetTop: { value: 0 },
          offsetLeft: { value: 0 },
          pageTop: { value: 0 },
          pageLeft: { value: 0 },
          scale: { value: 1 },
          height: { get: () => window.innerHeight - height },
          width: { get: () => window.innerWidth },
        });
        Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
        (window as unknown as KeyboardWindow).__setKeyboard = (px) => {
          height = px;
          target.dispatchEvent(new Event('resize'));
        };
      });
      await gotoStory(page, STORY);
      await expect(page.getByRole('region', { name: 'Save actions' })).toBeVisible();
      await page.locator(SCROLLER).evaluate((el) => {
        (document.activeElement as HTMLElement | null)?.blur();
        el.scrollTop = 0;
      });
    });

    test('the field focused near the bottom lands just above the keyboard, with no gap of the save bar\'s height', async ({ page }) => {
      await focusLow(page, 'Supplier name');
      await setKeyboard(page, keyboard);
      await expect.poll(async () => (await spot(page)).controlBottom).toBeLessThanOrEqual(viewport.height - keyboard);
      const s = await spot(page);
      // The case under test: a save bar under the scroller, smaller than the keyboard (it is covered first).
      expect(s.footer).toBeGreaterThan(0);
      expect(s.footer).toBeLessThan(keyboard);
      expect(s.visibleBottom).toBe(viewport.height - keyboard);
      // Just above the keyboard: its own 0.5rem, not the save bar's height on top of it.
      expect(Math.abs(s.fieldBottom - (s.visibleBottom - MARGIN)), `Field bottom ${s.fieldBottom}, keyboard at ${s.visibleBottom}`).toBeLessThanOrEqual(1);
      // The margin every control of the scroller keeps: the part of the keyboard over the scroller, plus 0.5rem.
      expect(Math.abs(s.marginBottom - (keyboard - s.footer + MARGIN))).toBeLessThanOrEqual(1);
      // Only the inner scroller moved; the window's value of the keyboard is unchanged.
      expect(s.scrollY).toBe(0);
      expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--rop-keyboard-inset'))).toBe(`${keyboard}px`);

      // Measured again by the Field (a visual-viewport resize with the same keyboard): nothing moves.
      const before = await labelTops(page);
      await setKeyboard(page, keyboard);
      await spot(page);
      const after = await labelTops(page);
      for (const [i, top] of before.entries()) expect(Math.abs(after[i]! - top), `label #${i}`).toBeLessThanOrEqual(1);
    });

    test('Tab to the next field with the keyboard open: it lands just above the keyboard too', async ({ page }) => {
      await focusLow(page, 'Supplier name');
      await setKeyboard(page, keyboard);
      await expect.poll(async () => (await spot(page)).controlBottom).toBeLessThanOrEqual(viewport.height - keyboard);
      // The next field is below the keyboard now: Tab brings it up.
      await page.keyboard.press('Tab');
      await expect(page.getByRole('textbox', { name: 'VAT number', exact: true })).toBeFocused();
      await expect.poll(async () => (await spot(page)).controlBottom).toBeLessThanOrEqual(viewport.height - keyboard);
      const s = await spot(page);
      expect(Math.abs(s.fieldBottom - (s.visibleBottom - MARGIN)), `Field bottom ${s.fieldBottom}, keyboard at ${s.visibleBottom}`).toBeLessThanOrEqual(1);
      expect(s.scrollY).toBe(0);
    });

    test('a keyboard shorter than the save bar leaves the scroll margin at 0.5rem; closed, the same', async ({ page }) => {
      await focusLow(page, 'Supplier name');
      const footer = (await spot(page)).footer;
      await setKeyboard(page, Math.floor(footer / 2));
      expect((await spot(page)).marginBottom).toBe(MARGIN);
      await setKeyboard(page, 0);
      expect((await spot(page)).marginBottom).toBe(MARGIN);
    });
  });
}
