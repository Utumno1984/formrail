import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// The day number is an inner `pointer-events-none` span; the gridcell is the hit target.
const STORY = 'forms-calendar--manual';
const PRECISE_HOVER = '(hover: hover) and (pointer: fine)';
const cell = (page: Page, name: string): Locator => page.getByRole('gridcell', { name, exact: true });
const face = (c: Locator): Locator => c.locator('span');
const bg = (el: Locator) => el.evaluate((n) => getComputedStyle(n).backgroundColor);
const leave = (page: Page) => page.mouse.move(0, 0);

// An unselected, enabled day (today is Tuesday, March 10, 2026 in this story).
const DAY = 'Friday, March 13, 2026';

test.describe('Forms/Calendar: day affordance (desktop)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('hover and pressed change the background, release away restores rest', async ({ page }) => {
    await gotoStory(page, STORY);
    const c = cell(page, DAY);
    await c.scrollIntoViewIfNeeded();
    await leave(page);
    const rest = await bg(face(c));

    await c.hover();
    const hover = await bg(face(c));
    expect(hover, 'hover differs from rest').not.toBe(rest);
    expect(await c.evaluate((n) => getComputedStyle(n).cursor)).toBe('pointer');

    await page.mouse.down();
    const pressed = await bg(face(c));
    await leave(page);
    await page.mouse.up();
    expect(pressed, 'pressed differs from rest').not.toBe(rest);
    expect(pressed, 'pressed differs from hover').not.toBe(hover);

    await leave(page);
    expect(await bg(face(c))).toBe(rest);
  });

  test('a disabled day (outside max) shows neither hover nor pressed', async ({ page }) => {
    await gotoStory(page, STORY, 'max:2026-03-12');
    const c = cell(page, DAY);
    await leave(page);
    const rest = await bg(face(c));
    await c.hover({ force: true });
    expect(await bg(face(c))).toBe(rest);
    await page.mouse.down();
    expect(await bg(face(c))).toBe(rest);
    await page.mouse.up();
  });

  test('a disabled calendar shows neither hover nor pressed', async ({ page }) => {
    await gotoStory(page, STORY, 'disabled:!true');
    const c = cell(page, DAY);
    await leave(page);
    const rest = await bg(face(c));
    await c.hover({ force: true });
    expect(await bg(face(c))).toBe(rest);
    await page.mouse.down();
    expect(await bg(face(c))).toBe(rest);
    await page.mouse.up();
  });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 5'];

test.describe('Forms/Calendar: day affordance (touch)', () => {
  test.use({ ...phone, reducedMotion: 'reduce' });

  test('@touch a held touch shows the pressed look', async ({ page }) => {
    await gotoStory(page, STORY);
    expect(await page.evaluate((q) => matchMedia(q).matches, PRECISE_HOVER), 'precondition: no precise hover').toBe(false);
    const c = cell(page, DAY);
    await c.scrollIntoViewIfNeeded();
    const rest = await bg(face(c));
    const box = (await c.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    // Chrome applies `:active` around the gesture recognition: sample every frame.
    const sampler = face(c).evaluate(
      (node, resting) =>
        new Promise<boolean>((resolve) => {
          const t0 = performance.now();
          const tick = () => {
            if (getComputedStyle(node).backgroundColor !== resting) return resolve(true);
            if (performance.now() - t0 > 2500) return resolve(false);
            requestAnimationFrame(tick);
          };
          tick();
        }),
      rest,
    );
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(250);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await sampler, 'a pressed frame was seen').toBe(true);
  });
});
