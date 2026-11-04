import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { SELECTED_PILL, STORY, SURFACES, look, paint, type Surface } from './helpers/affordance';
import { expectPlayToPass } from './helpers/story';

// A phone profile: `hover: none` and `pointer: coarse`, so the `rop-hover` variant must not apply.
// The "chromium-touch" project only adds `hasTouch`, which does not change those media features:
// the precondition is therefore asserted in every test, so none can pass vacuously.
const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 5'];
test.use({ ...phone, reducedMotion: 'reduce' });

const PRECISE_HOVER = '(hover: hover) and (pointer: fine)';

async function open(page: Page, args?: string): Promise<void> {
  await expectPlayToPass(page, STORY, args);
  const matches = await page.evaluate((q) => matchMedia(q).matches, PRECISE_HOVER);
  expect(matches, 'precondition: this device must not report a precise hover').toBe(false);
}

const target = (s: Surface, page: Page) => (s.target ?? s.measure)(page);

/**
 * After a tap the look must settle on `expected` and stay there. Chrome keeps `:active` for a
 * moment after a quick tap, so the first frames may still be pressed; a stuck hover would never
 * settle (and would come back if it were only a transition).
 */
async function settles(page: Page, el: Locator, expected: string): Promise<void> {
  await expect.poll(async () => paint(await look(el)), { timeout: 3000, intervals: [50] }).toBe(expected);
  await page.waitForTimeout(400);
  expect(paint(await look(el))).toBe(expected);
}

// Logical state reached with the keyboard (no pointer involved), the reference for a tap.
// `null`: the tap changes no logical state, so the reference is the rest look.
const KEYBOARD_ACTION: Record<string, 'Space' | null> = {
  'Button primary': null,
  'Button secondary': null,
  'Button ghost': null,
  'Button danger': null,
  'Button asChild without href': null,
  'Checkbox (checked)': 'Space',
  'Switch (off)': 'Space',
  'Radio (not selected)': 'Space',
  'Sortable header': null,
  'Breadcrumb link asChild without href': null,
};
const TAPPED = SURFACES.filter((s) => s.name in KEYBOARD_ACTION);

test.describe('Foundations/Interaction states: touch affordance', () => {
  for (const s of TAPPED) {
    test(`@touch ${s.name}: after a tap there is no stuck hover`, async ({ page }) => {
      // Reference: the same logical state reached from the keyboard, on a fresh page.
      await open(page);
      await s.measure(page).scrollIntoViewIfNeeded();
      const action = KEYBOARD_ACTION[s.name];
      if (action) {
        await s.measure(page).focus();
        await page.keyboard.press(action);
      }
      const reference = paint(await look(s.measure(page)));

      await open(page);
      await s.measure(page).scrollIntoViewIfNeeded();
      await target(s, page).tap();
      await settles(page, s.measure(page), reference);
    });
  }

  test('@touch the unselected pill, after a tap, looks like the selected one (no stuck hover)', async ({ page }) => {
    await open(page);
    const selected = paint(await look(SELECTED_PILL.measure(page)));
    const pill = SURFACES.find((s) => s.name === 'Filter pill (not selected)')!;
    await pill.measure(page).tap();
    await expect(pill.measure(page)).toHaveAttribute('aria-checked', 'true');
    await settles(page, pill.measure(page), selected);
  });

  test('@touch the Select trigger shows no hover after the list is dismissed', async ({ page }) => {
    await open(page);
    const trigger = SURFACES.find((s) => s.name === 'Select trigger')!.measure(page);
    const rest = paint(await look(trigger));
    await trigger.tap();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await settles(page, trigger, rest);
  });

  // A finger held on the control: the pressed look appears (touchStart, read, touchEnd via CDP).
  // Not the Select trigger: Radix opens the list on the touch itself, and no pressed frame of the
  // trigger is observable (the desktop spec covers its pressed look with a real mouse).
  for (const name of ['Button secondary', 'Checkbox (checked)', 'Filter pill (not selected)', 'Sortable header']) {
    test(`@touch ${name}: a held touch shows the pressed look`, async ({ page }) => {
      await open(page);
      const s = SURFACES.find((x) => x.name === name)!;
      const el = target(s, page);
      await el.scrollIntoViewIfNeeded();
      const rest = paint(await look(s.measure(page)));
      const box = (await el.boundingBox())!;
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const cdp = await page.context().newCDPSession(page);
      // Chrome (headless, synthetic touch) applies `:active` only when the gesture is recognised, i.e.
      // around the release, and keeps it for a short while: sample the style every frame from
      // before the touch until well after it, and require at least one pressed frame.
      const sampler = s.measure(page).evaluate(
        (node, { resting }) =>
          new Promise<boolean>((resolve) => {
            const t0 = performance.now();
            const read = () => {
              const cs = getComputedStyle(node);
              return [cs.backgroundColor, cs.borderTopColor, cs.color, cs.textDecorationLine].join('|');
            };
            const tick = () => {
              if (read() !== resting) return resolve(true);
              if (performance.now() - t0 > 2500) return resolve(false);
              requestAnimationFrame(tick);
            };
            tick();
          }),
        { resting: rest },
      );
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await page.waitForTimeout(250);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      expect(await sampler, `${name}: a pressed frame was seen`).toBe(true);
    });
  }
});
