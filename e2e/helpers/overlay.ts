import type { Locator, Page } from '@playwright/test';

/**
 * Waits until a modal panel that has just appeared reacts to a press outside it (on its backdrop). Call it
 * between "the panel is visible" and a raw `page.mouse` press outside the panel.
 *
 * Why (#579): Radix's dismissable layer adds its `pointerdown` listener on `document` in a `setTimeout(0)`
 * scheduled by a passive effect (on purpose: the press that opened the panel must not close it). The panel
 * is in the DOM, so `toBeVisible` passes, before that timer has run; Chromium runs an input task before a
 * pending timer task on a busy main thread, so a press dispatched in that window is not seen and the panel
 * stays open (`dirty-guard.spec.ts:97` in CI: the backdrop press 3-6 ms after `toBeVisible`, twice in a row).
 *
 * The wait is on order, not on time: the focus moving into the panel is done by the effects of the same
 * commit, which run after the layer's effect has scheduled its timer; one more zero-delay timer then fires
 * after it (timers of equal delay run in the order they were scheduled). No fixed delay.
 */
export async function waitForOutsidePressArmed(page: Page, panel: Locator): Promise<void> {
  await page.waitForFunction((el) => !!el && el.contains(document.activeElement), await panel.elementHandle());
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}
