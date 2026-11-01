import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

// #76, round 2: what a panel that is exiting must NOT do. The first round of tests clicked with
// Playwright's `click()`, which waits until the target can receive the event, so it only clicked once
// the exit was over and never exercised the exit itself. These tests look at the exit directly.

const DIALOG = (name: string) => `overlays-dialog--${name}`;
const SHEET = (name: string) => `overlays-sheet--${name}`;

async function slowDown(page: Page, ms: number): Promise<void> {
  await page.addStyleTag({ content: `:root { --motion-rop-overlay-duration: ${ms}ms; }` });
}

const settled = (page: Page) => page.evaluate(() => document.getAnimations().length);

test.use({ reducedMotion: 'no-preference' });

for (const [label, story] of [
  ['Dialog', DIALOG('playground')],
  ['Sheet', SHEET('playground')],
] as const) {
  test.describe(label, () => {
    test('while exiting, the opener behind is the hit target (the backdrop does not intercept) and the panel is inert', async ({ page }) => {
      await expectPlayToPass(page, story);
      await slowDown(page, 1500);
      const trigger = page.locator('button').filter({ hasText: /^Apri$/ });
      await trigger.click();
      await expect.poll(() => settled(page), { timeout: 5000 }).toBe(0);
      await page.keyboard.press('Escape');
      await expect(page.locator('[role=dialog][data-state=closed]')).toHaveCount(1);
      const isOpenerHit = await trigger.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return top === el || (top !== null && el.contains(top));
      });
      expect(isOpenerHit).toBe(true);
      // The exiting wrapper is inert: no focus, no events, out of the accessibility tree.
      expect(await page.evaluate(() => document.querySelector('.z-rop-modal')?.hasAttribute('inert'))).toBe(true);
    });

    test('reopening DURING the exit (a real click on the opener) gives an open panel and one close at the end', async ({ page }) => {
      await expectPlayToPass(page, story);
      await slowDown(page, 1500);
      const trigger = page.locator('button').filter({ hasText: /^Apri$/ });
      await trigger.click();
      await expect.poll(() => settled(page), { timeout: 5000 }).toBe(0);
      await page.keyboard.press('Escape');
      await expect(page.locator('[role=dialog][data-state=closed]')).toHaveCount(1);
      // `force` skips Playwright's actionability wait: a plain `click()` would wait for the exit to
      // finish and the test would never see the exit. With the backdrop transparent to the pointer,
      // this is a genuine click that reaches the opener.
      await trigger.click({ force: true });
      await expect(page.locator('[role=dialog][data-state=open]')).toHaveCount(1);
      await expect.poll(() => settled(page), { timeout: 5000 }).toBe(0);
      expect(await page.locator('[role=dialog]').evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(page.locator('[role=dialog]')).toHaveCount(0, { timeout: 6000 });
      await expect(trigger).toBeFocused();
    });
  });
}

test('nested, DECLARED LIMIT: an Escape pressed while the inner dialog is still exiting is consumed by it; the next one closes the outer', async ({ page }) => {
  // Radix keeps the exiting layer on its stack until it unmounts, and the highest layer takes the
  // Escape. Nothing is closed twice and nothing breaks: the user presses Escape once more.
  await expectPlayToPass(page, DIALOG('nested'));
  await slowDown(page, 800);
  const first = page.getByRole('dialog', { name: 'Primo dialog' });
  const second = page.getByRole('dialog', { name: 'Secondo dialog' });
  await page.getByRole('button', { name: 'Apri il secondo' }).click();
  await expect(second).toHaveAttribute('data-state', 'open');
  await expect.poll(() => settled(page), { timeout: 5000 }).toBe(0);
  await page.keyboard.press('Escape');
  await expect(second).toHaveAttribute('data-state', 'closed');
  await page.keyboard.press('Escape'); // swallowed by the exiting inner dialog
  await expect(second).toHaveCount(0, { timeout: 6000 });
  await expect(first).toHaveAttribute('data-state', 'open');
  await page.keyboard.press('Escape');
  await expect(first).toHaveCount(0, { timeout: 6000 });
});

test('a chain "close A, open B in the same handler": text typed in B at once is not selected by the delayed focus return of A', async ({ page }) => {
  // The play function types right after the click, waits for A's exit, and types again.
  // A slow exit, set before the story (and its play function) runs.
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = ':root { --motion-rop-overlay-duration: 700ms; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  });
  await expectPlayToPass(page, DIALOG('chained'));
});

test('the exit has a safety net: if the animation never ends, the panel is removed and the page is released', async ({ page }) => {
  await expectPlayToPass(page, DIALOG('playground'));
  const trigger = page.locator('button').filter({ hasText: /^Apri$/ });
  await trigger.click();
  await expect(page.locator('[role=dialog][data-state=open]')).toHaveCount(1);
  // Freeze every animation: `animationend` will never fire.
  await page.addStyleTag({ content: '*, *::before, *::after { animation-play-state: paused !important; }' });
  await page.keyboard.press('Escape');
  await expect(page.locator('[role=dialog]')).toHaveCount(0, { timeout: 5000 });
  expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
  await expect(trigger).toBeFocused();
});
