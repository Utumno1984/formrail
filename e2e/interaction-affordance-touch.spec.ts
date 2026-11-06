import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { SELECTED_PILL, STORY, SURFACES, look, paint, type Surface } from './helpers/affordance';
import { expectPlayToPass, gotoStory } from './helpers/story';

// A phone profile: `hover: none` and `pointer: coarse`, so the `rop-hover` variant must not apply.
// The "chromium-touch" project only adds `hasTouch`, which does not change those media features:
// the precondition is therefore asserted in every test, so none can pass vacuously.
// `defaultBrowserType` cannot be set inside a describe block, so it is dropped from the profile.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  /**
   * A finger held on `tapTarget` must show the pressed look on `measure` at least once
   * (touchStart, read, touchEnd via CDP). Chrome (headless, synthetic touch) applies `:active`
   * only when the gesture is recognised, i.e. around the release, and keeps it for a short
   * while: the style is sampled every frame from before the touch until well after it.
   */
  async function pressedAppearsOnHeldTouch(page: Page, tapTarget: Locator, measure: Locator, label: string): Promise<void> {
    const rest = paint(await look(measure));
    const box = (await tapTarget.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    const sampler = measure.evaluate(
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
    expect(await sampler, `${label}: a pressed frame was seen`).toBe(true);
  }

  // A finger held on the control: the pressed look appears.
  // Not the Select trigger: Radix opens the list on the touch itself, and no pressed frame of the
  // trigger is observable (the desktop spec covers its pressed look with a real mouse).
  for (const name of ['Button secondary', 'Checkbox (checked)', 'Filter pill (not selected)', 'Sortable header']) {
    test(`@touch ${name}: a held touch shows the pressed look`, async ({ page }) => {
      await open(page);
      const s = SURFACES.find((x) => x.name === name)!;
      const el = target(s, page);
      await el.scrollIntoViewIfNeeded();
      await pressedAppearsOnHeldTouch(page, el, s.measure(page), name);
    });
  }

  /**
   * The precondition asserted by hand (no `expectPlayToPass`: the "Manual" stories have no play
   * function, built for e2e driving the real pointer, same convention as `e2e/select-qa2.spec.ts`).
   */
  async function openManual(page: Page, storyId: string): Promise<void> {
    await gotoStory(page, storyId);
    const matches = await page.evaluate((q) => matchMedia(q).matches, PRECISE_HOVER);
    expect(matches, 'precondition: this device must not report a precise hover').toBe(false);
  }

  /**
   * Two things get in the way of observing a touch-pressed option directly:
   *
   * 1. Picking an option normally selects it on the synthesized `click` and unmounts the whole
   *    listbox well before Chrome (headless, synthetic touch) ever applies `:active` (confirmed
   *    by hand: sampling every frame through the gesture, the node is already disconnected a
   *    couple of frames after `touchEnd`, always at the "rest" look). A capturing `click`
   *    listener swallows that one synthesized click (Radix's touch selection path is `onClick`,
   *    not `onPointerUp` — `@radix-ui/react-select/dist/index.mjs` around line 901; the
   *    Combobox's is a plain `onClick` too, see `use-combobox.ts`), so the option stays mounted.
   * 2. Chrome's compatibility mouse events for a synthetic touch still run the browser's default
   *    "focus follows pointerdown" on a Select option, and still fire `mousemove` over a
   *    Combobox option (confirmed by hand: with neither blocked, `data-highlighted` flips to set
   *    within a frame or two of `:active` turning true — too close for "does the look ever
   *    differ from rest" to tell a pressed-only rule from a pressed-AND-highlighted one; both
   *    pass, bug or no bug). A capturing `mousedown` listener with `preventDefault()` blocks the
   *    default focus (Select), and a capturing `mousemove` listener blocks the compatibility
   *    move reaching the option (Combobox) — neither blocks `:active` itself, which is driven by
   *    the touch sequence, not by focus or by the mouse-tracked highlight. `data-highlighted`
   *    then stays unset for the entire gesture: a clean, unconfounded "pressed with NO
   *    highlight" case.
   *
   * Reverting the `LISTBOX_ITEM` fix with these guards in place reproduces the bug exactly as
   * filed: `:active` turns true but the look stays at rest the whole time, because the rule
   * required `data-[highlighted]` too.
   */
  async function armTouchOnOption(el: Locator): Promise<void> {
    await el.evaluate(() => {
      document.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true });
      document.addEventListener('mousedown', (e) => e.preventDefault(), { capture: true, once: true });
      document.addEventListener('mousemove', (e) => e.stopPropagation(), { capture: true });
    });
  }

  // Options of an open listbox: `data-[highlighted]` (Radix Select) and the Combobox's own
  // highlight both come from a pointer-tracked focus/hover that a tap never produces (#196
  // follow-up), so the pressed rule in `LISTBOX_ITEM` must fire from `:active` alone, independent
  // of the highlight. These two options can't piggy-back on the `TAPPED` loop above: opening the
  // list is itself a tap, and `Surface` has no notion of "open first, then touch an option".
  test('@touch Select option: a held touch shows the pressed look, never highlighted', async ({ page }) => {
    await openManual(page, 'forms-select--manual');
    const trigger = page.getByRole('combobox', { name: 'Country' });
    await trigger.tap();
    const option = page.getByRole('option', { name: 'France' });
    await expect(option).toBeVisible();
    await expect(option, 'precondition: untouched, so not data-highlighted either').not.toHaveAttribute('data-highlighted', '');
    await armTouchOnOption(option);
    await pressedAppearsOnHeldTouch(page, option, option, 'Select option (France)');
    await expect(option, 'never highlighted: focus was blocked for the whole gesture').not.toHaveAttribute('data-highlighted', '');
  });

  test('@touch Combobox option: a held touch shows the pressed look, never highlighted', async ({ page }) => {
    await openManual(page, 'forms-combobox--manual');
    const input = page.getByRole('combobox', { name: 'City' });
    await input.tap();
    const option = page.getByRole('option', { name: 'Milano' });
    await expect(option).toBeVisible();
    await expect(option, 'precondition: untouched, so not data-highlighted either').not.toHaveAttribute('data-highlighted', '');
    await armTouchOnOption(option);
    await pressedAppearsOnHeldTouch(page, option, option, 'Combobox option (Milano)');
    await expect(option, 'never highlighted: focus was blocked for the whole gesture').not.toHaveAttribute('data-highlighted', '');
  });
});
