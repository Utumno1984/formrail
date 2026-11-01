import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

// QA #76 (extra cases not in overlay-motion.spec.ts): Tab / repeated Escape / backdrop click during the
// exit, Sheet side changed during the exit, 375px, RTL, dirty-guard leave path with the slow exit.

const SLOW = 900;
const slowDown = (page: Page, ms = SLOW) =>
  page.addStyleTag({ content: `:root { --motion-rop-overlay-duration: ${ms}ms; }` });
const dialogOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Modifica fornitore' });
const sheetOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Dettaglio fornitore' });
const opener = (page: Page) => page.locator('button').filter({ hasText: /^Apri$/ });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

test('Escape repeated during the exit: one clean close, focus back on the opener, no error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await expectPlayToPass(page, 'overlays-dialog--playground');
  await slowDown(page);
  await opener(page).click();
  await expect(dialogOf(page)).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(1000);
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
  }
  await expect(dialogOf(page)).toHaveCount(0, { timeout: 5000 });
  await expect(opener(page)).toBeFocused();
  await expect(page.locator('.z-rop-modal')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Tab during the exit does not move the focus onto the page behind before the end', async ({ page }) => {
  await expectPlayToPass(page, 'overlays-dialog--playground');
  await slowDown(page);
  await opener(page).click();
  await expect(dialogOf(page)).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await expect(dialogOf(page)).toHaveAttribute('data-state', 'closed');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(dialogOf(page)).toHaveCount(0, { timeout: 5000 });
  // The page is usable and no wrapper / scroll lock is left behind.
  expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
  await expect(page.locator('.z-rop-modal')).toHaveCount(0);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement !== null)).toBe(true);
});

test('backdrop click during the exit goes through to the page (no double close, no stuck overlay)', async ({ page }) => {
  await expectPlayToPass(page, 'overlays-dialog--playground');
  await slowDown(page);
  await opener(page).click();
  await expect(dialogOf(page)).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await expect(dialogOf(page)).toHaveAttribute('data-state', 'closed');
  await page.mouse.click(4, 4);
  await expect(dialogOf(page)).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('.z-rop-modal')).toHaveCount(0);
  await expect(opener(page)).toBeFocused();
  expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
});

test('backdrop click closes an open dialog and the focus returns after the exit', async ({ page }) => {
  await expectPlayToPass(page, 'overlays-dialog--playground');
  await slowDown(page, 400);
  await opener(page).click();
  await expect(dialogOf(page)).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(600);
  await page.mouse.click(4, 4);
  await expect(dialogOf(page)).toHaveAttribute('data-state', 'closed');
  await expect(dialogOf(page)).toHaveCount(0, { timeout: 5000 });
  await expect(opener(page)).toBeFocused();
});

test('Sheet: changing `side` while it is exiting does not strand the wrapper or the focus', async ({ page }) => {
  await expectPlayToPass(page, 'overlays-sheet--playground');
  await slowDown(page);
  await opener(page).click();
  await expect(sheetOf(page)).toHaveAttribute('data-state', 'open');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await expect(sheetOf(page)).toHaveAttribute('data-state', 'closed');
  await page.evaluate(() => {
    const ch = (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void } })
      .__STORYBOOK_ADDONS_CHANNEL__;
    const id = new URLSearchParams(location.search).get('id');
    ch.emit('updateStoryArgs', { storyId: id, updatedArgs: { side: 'left' } });
  });
  await expect(sheetOf(page)).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('.z-rop-modal')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
  await opener(page).click();
  await expect(sheetOf(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheetOf(page)).toHaveCount(0, { timeout: 5000 });
  await expect(opener(page)).toBeFocused();
});

for (const [label, story, panel] of [
  ['Dialog', 'overlays-dialog--playground', dialogOf],
  ['Sheet', 'overlays-sheet--playground', sheetOf],
] as const) {
  test(`${label} at 375px: opens inside the viewport, exits and returns the focus`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expectPlayToPass(page, story);
    await slowDown(page, 500);
    await opener(page).click();
    await expect(panel(page)).toHaveAttribute('data-state', 'open');
    await page.waitForTimeout(800);
    const box = await panel(page).evaluate((el) => el.getBoundingClientRect().toJSON());
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0, { timeout: 5000 });
    await expect(opener(page)).toBeFocused();
  });

  test(`${label} in RTL: centred / flush to the physical edge after the entry, clean exit`, async ({ page }) => {
    await expectPlayToPass(page, story);
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await slowDown(page, 400);
    await opener(page).click();
    await expect(panel(page)).toHaveAttribute('data-state', 'open');
    await page.waitForTimeout(700);
    const vw = await page.evaluate(() => window.innerWidth);
    const box = await panel(page).evaluate((el) => el.getBoundingClientRect().toJSON());
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(vw);
    if (label === 'Dialog') expect(Math.abs(box.left + box.width / 2 - vw / 2)).toBeLessThan(1);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0, { timeout: 5000 });
    await expect(opener(page)).toBeFocused();
  });
}

test('dirty-guard: "Esci senza salvare" with a slow exit still runs the action and leaves no orphan', async ({ page }) => {
  await expectPlayToPass(page, 'patterns-dirtyguard--playground', 'when:!true');
  await slowDown(page);
  await page.getByRole('button', { name: 'Torna alla lista' }).click();
  await page.getByRole('button', { name: 'Esci senza salvare' }).click();
  await expect(page.getByRole('dialog', { name: 'Modifiche non salvate' })).toHaveCount(0, { timeout: 5000 });
  const state = await page.evaluate(() => ({
    locked: document.body.hasAttribute('data-scroll-locked'),
    hidden: document.querySelectorAll('[data-aria-hidden]').length,
    dialogs: document.querySelectorAll('[role=dialog]').length,
  }));
  expect(state).toEqual({ locked: false, hidden: 0, dialogs: 0 });
});
