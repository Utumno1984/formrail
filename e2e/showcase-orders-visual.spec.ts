import { expect, test, type Page } from '@playwright/test';
import { expectFocusRingVisible, expectNoHorizontalOverflow, expectSingleScroller } from './helpers/geometry';
import { gotoStory } from './helpers/story';

// #525 (part 2): the sales-order equivalent of the geometry, virtual keyboard and reduced-motion tests of
// `showcase-visual.spec.ts` (#152). The invoices' spec stays until #527. Not repeated here, because the orders already
// have them: the Anchor Bar that fits on mobile (`showcase-sales-orders.spec.ts`, "the page and the list do not overflow
// sideways; the Anchor Bar with four sections fits", mobile and tablet) and the reduced-motion end state of the visual
// stories (the same file, "the reduced-motion preference leads the visual stories to the same end state", and
// `showcase-sales-orders-crud.spec.ts` for the creation/deletion ones). The pictures are in e2e/visual.
const FIXTURE = 'showcase-record-editing--sales-order-list-to-record-manual';
const CRUD = 'showcase-record-editing--sales-order-crud-manual';
const NO_DELAYS = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
const SCROLLER = '[data-object-page-scroller]';
// The seed's first orders, in the order of the unsorted list.
const SELECTED = ['SO-2026-018000002', 'SO-2026-056000003', 'SO-2026-038000004'];

type KeyboardWindow = { __setKeyboard: (px: number) => void };

const openFirstRecord = async (page: Page): Promise<void> => {
  await gotoStory(page, FIXTURE, NO_DELAYS);
  await page.locator('a[data-record-id]').first().click();
  await expect(page.getByRole('textbox', { name: 'Notes' })).toBeVisible();
};

test.describe('Showcase/Record editing, orders: visual states (geometry)', () => {
  for (const [name, viewport] of [
    ['mobile', { width: 375, height: 667 }],
    ['tablet', { width: 768, height: 1024 }],
    ['desktop', { width: 1280, height: 800 }],
  ] as const) {
    test.describe(name, () => {
      test.use({ viewport });

      test('the detail page has one scroller and no horizontal overflow, also dirty', async ({ page }) => {
        await openFirstRecord(page);
        const root = page.locator('#storybook-root');
        await expectSingleScroller(root);
        await expectNoHorizontalOverflow(root);
        await page.getByRole('textbox', { name: 'Notes' }).fill('Dirty on purpose');
        await expect(page.getByRole('region', { name: 'Save actions' })).toBeVisible();
        await expectSingleScroller(root);
        await expectNoHorizontalOverflow(root);
        // The page (document) does not scroll: the Object Page scroller is the one.
        expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
      });

      test('the list has no horizontal overflow and the row link focus ring is not clipped', async ({ page }) => {
        await gotoStory(page, FIXTURE, 'listLoadDelayMs:0;recordLoadDelayMs:0');
        await expect(page.getByRole('link').first()).toBeVisible();
        // The table scrolls sideways INSIDE its own scroller on narrow screens (by design): what must hold is
        // that the page itself does not.
        expect(await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
        await expectFocusRingVisible(page.getByRole('link').first());
      });

      test('the confirmation Dialog fits the viewport', async ({ page }) => {
        await openFirstRecord(page);
        await page.getByRole('textbox', { name: 'Notes' }).fill('Dirty on purpose');
        await page.getByRole('button', { name: 'Back to list' }).click();
        const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
        await expect(dialog).toBeVisible();
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      });

      test('#366 CRUD list: the selection bar keeps its height with "Delete selected" enabled or disabled; the bulk dialog fits', async ({ page }) => {
        await gotoStory(page, CRUD, NO_DELAYS);
        const bar = page.locator('[data-rop-selection-bar]');
        await expect(page.getByRole('checkbox', { name: /^Select SO-/ }).first()).toBeVisible();
        const button = page.getByRole('button', { name: 'Delete selected' });
        await expect(button).toHaveAttribute('aria-disabled', 'true');
        const idle = (await bar.boundingBox())!;
        for (const n of SELECTED) {
          await page.getByRole('checkbox', { name: `Select ${n}`, exact: true }).check();
        }
        await expect(button).not.toHaveAttribute('aria-disabled', 'true');
        const selected = (await bar.boundingBox())!;
        expect(selected.height).toBeCloseTo(idle.height, 0);
        expect(selected.y).toBeCloseTo(idle.y, 0);
        // The bar's controls stay inside the viewport (no wrap that pushes "Delete selected" out of view).
        const buttonBox = (await button.boundingBox())!;
        expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(viewport.width);
        // The table scrolls sideways inside its own scroller on narrow screens (by design); the page must not.
        expect(await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
        await button.click();
        const dialog = page.getByRole('dialog', { name: 'Delete 3 sales orders?' });
        await expect(dialog).toBeVisible();
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      });
    });
  }
});

test.describe('Showcase/Record editing, orders: virtual keyboard on the Notes field', () => {
  for (const [name, viewport] of [
    ['mobile', { width: 375, height: 667 }],
    ['tablet', { width: 768, height: 1024 }],
  ] as const) {
    test.describe(name, () => {
      test.use({ viewport, hasTouch: true });

      test.beforeEach(async ({ page }) => {
        // Same stand-in for the visual viewport as e2e/object-page-layout.spec.ts and e2e/field.spec.ts.
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

      test('"Notes" stays above the keyboard and is not covered by the save bar', async ({ page }) => {
        await openFirstRecord(page);
        const notes = page.getByRole('textbox', { name: 'Notes' });
        // Dirty first, so the sticky save bar is on screen (the worst case for covering the field).
        await notes.fill('Dirty on purpose');
        const bar = page.getByRole('region', { name: 'Save actions' });
        await expect(bar).toBeVisible();
        await page.locator(SCROLLER).evaluate((el) => (el.scrollTop = el.scrollHeight));
        const keyboard = Math.round(viewport.height * 0.45);
        const rect = (loc: typeof notes) => loc.evaluate((el) => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));

        await notes.focus();
        await page.evaluate((px) => (window as unknown as KeyboardWindow).__setKeyboard(px), keyboard);

        await expect.poll(async () => (await rect(notes)).bottom).toBeLessThanOrEqual(viewport.height - keyboard);
        expect((await rect(notes)).top).toBeGreaterThanOrEqual(0);
        // The sticky bar does not sit on top of the field.
        const field = await rect(notes);
        const barBox = await rect(bar);
        expect(field.bottom <= barBox.top + 1 || field.top >= barBox.bottom - 1).toBe(true);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        await expect(notes).toBeFocused();
      });
    });
  }
});

test.describe('Showcase/Record editing, orders: prefers-reduced-motion', () => {
  test('the Dialog opens without a transition under the preference', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFirstRecord(page);
    await page.getByRole('textbox', { name: 'Notes' }).fill('Dirty on purpose');
    await page.getByRole('button', { name: 'Back to list' }).click();
    const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
    await expect(dialog).toBeVisible();
    const t = await dialog.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { opacity: cs.opacity, duration: cs.transitionDuration, animation: cs.animationName };
    });
    expect(t.opacity).toBe('1');
    expect(t.animation === 'none' || t.duration.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
  });
});
