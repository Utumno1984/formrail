import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory as openStory } from './helpers/story';

// Stories with a play function are opened after it has finished (it would otherwise race the real input).
const NO_PLAY = new Set(['overlays-tooltip--inside-dialog-manual']);
const gotoStory = (page: Page, id: string) => (NO_PLAY.has(id) ? openStory(page, id) : expectPlayToPass(page, id));

// QA: attempts to break the "real gesture only" gating of the Tooltip with real mouse and keyboard
// input (no play function: stories are opened as they are).
const STORY = (name: string) => `overlays-tooltip--${name}`;
const tooltips = (page: Page) => page.getByRole('tooltip');
const SETTLE = 900;

test.describe('Tooltip gating (QA)', () => {
  test('a programmatic focus() after a Tab has been released does not open the tooltip', async ({ page }) => {
    await gotoStory(page, STORY('toolbar'));
    await page.keyboard.press('Tab');
    await expect(tooltips(page)).toHaveText('Edit');
    await page.keyboard.press('Tab'); // Duplicate
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Archive')?.focus();
    });
    await expect(page.getByRole('button', { name: 'Archive' })).toBeFocused();
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
  });

  test('a script focus() after a letter key (non-navigation) does not open it', async ({ page }) => {
    await gotoStory(page, STORY('toolbar'));
    await page.keyboard.press('a');
    await page.evaluate(() => (document.querySelector('button') as HTMLElement).focus());
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
  });

  test('a script focus() after Shift+Tab/Tab pair has finished, via setTimeout, does not open it', async ({ page }) => {
    await gotoStory(page, STORY('toolbar'));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(50);
    await page.evaluate(() => setTimeout(() => (document.querySelectorAll('button')[2] as HTMLElement).focus(), 20));
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
  });

  test('Tab held down (auto-repeat) lands on the trigger and opens it; releasing keeps it', async ({ page }) => {
    await gotoStory(page, STORY('toolbar'));
    await page.keyboard.down('Tab');
    await page.keyboard.down('Tab');
    await page.keyboard.up('Tab');
    await expect(tooltips(page)).toHaveCount(1);
  });

  test('focus given by a mouse click does not open it after the pointerdown (no tooltip left after the click)', async ({ page }) => {
    await gotoStory(page, STORY('toolbar'));
    const trigger = page.getByRole('button', { name: 'Duplicate' });
    const b = (await trigger.boundingBox())!;
    // Press without hovering first long enough to open (delay 600ms): move and press at once.
    await page.mouse.move(b.x + 8, b.y + 8);
    await page.mouse.down();
    await page.mouse.up();
    await expect(trigger).toBeFocused();
    await page.waitForTimeout(SETTLE + 300);
    await expect(tooltips(page)).toHaveCount(0);
    await expect(trigger).not.toHaveAttribute('aria-describedby');
  });

  test('Space on a dialog opener: the focus moved into the dialog opens no tooltip', async ({ page }) => {
    await gotoStory(page, STORY('inside-dialog-manual'));
    await page.getByRole('button', { name: 'Open' }).focus();
    await page.keyboard.press('Space');
    const dialog = page.getByRole('dialog', { name: 'Delete row' });
    await expect(dialog.getByRole('button', { name: 'Delete row' })).toBeFocused();
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
  });

  test('keyboard-opened dialog with the key still held down (keydown only) opens no tooltip', async ({ page }) => {
    await gotoStory(page, STORY('inside-dialog-manual'));
    await page.getByRole('button', { name: 'Open' }).focus();
    await page.keyboard.down('Enter');
    await page.waitForTimeout(SETTLE);
    await page.keyboard.up('Enter');
    await expect(tooltips(page)).toHaveCount(0);
  });

  test('mouse resting on the trigger position before a reload: nothing opens at mount before the pointer moves', async ({ page }) => {
    await gotoStory(page, STORY('auto-focus'));
    const trigger = page.getByRole('button', { name: 'With autofocus' });
    const b = (await trigger.boundingBox())!;
    await page.mouse.move(b.x + 4, b.y + 4);
    await page.reload();
    await page.waitForTimeout(SETTLE);
    // Declared behaviour check: no tooltip may exist from focus (autoFocus) alone.
    const count = await tooltips(page).count();
    const focused = await trigger.evaluate((el) => el === document.activeElement);
    test.info().annotations.push({ type: 'observed', description: `tooltips=${count} focused=${focused}` });
    // Without any pointer movement after load, no tooltip should be open.
    expect(count).toBe(0);
  });

  test('empty content: Tab through the page shows no tooltip', async ({ page }) => {
    await gotoStory(page, STORY('empty-content'));
    await page.evaluate(() => undefined);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await expect(tooltips(page)).toHaveCount(0);
  });
});
