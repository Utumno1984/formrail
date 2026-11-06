import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory as openStory } from './helpers/story';

// QA round 2: real keyboard input against the "trigger existed before the key" gating.
const STORY = (name: string) => `overlays-tooltip--${name}`;
const tooltips = (page: Page) => page.getByRole('tooltip');
const SETTLE = 900;

test.describe('Tooltip gating, round 2 (QA)', () => {
  test('ArrowDown opens a menu whose autofocused trigger shows nothing, even held down and repeated', async ({ page }) => {
    await openStory(page, STORY('opened-by-arrow-down'));
    await page.getByRole('button', { name: 'Menu' }).focus();
    await page.keyboard.down('ArrowDown');
    await page.keyboard.down('ArrowDown'); // auto-repeat
    await expect(page.getByRole('button', { name: 'First item' })).toBeFocused();
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
  });

  test('a pre-existing trigger opens with Tab, the autofocused one stays quiet until a real Tab move', async ({ page }) => {
    await openStory(page, STORY('opened-by-arrow-down'));
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Page action' })).toBeFocused();
    await expect(tooltips(page)).toHaveText('Page action');
    await page.keyboard.press('Tab'); // Menu
    await page.keyboard.press('ArrowDown');
    const item = page.getByRole('button', { name: 'First item' });
    await expect(item).toBeFocused();
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
    // Back onto the page action (it existed before the key): opens.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Page action' })).toBeFocused();
    await expect(tooltips(page)).toHaveText('Page action');
    // And the item (now older than the key) opens on a real Tab move.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(item).toBeFocused();
    await expect(tooltips(page)).toHaveText('Item detail');
  });

  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End', 'ArrowUp', 'ArrowDown']) {
    test(`${key} moving the focus (app handler) onto a trigger that already exists opens the tooltip`, async ({ page }) => {
      await expectPlayToPass(page, STORY('toolbar'));
      await page.evaluate((k) => {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label]'));
        document.addEventListener('keydown', (e) => {
          if (e.key !== k) return;
          buttons[buttons.length - 1]!.focus();
        });
      }, key);
      await page.getByRole('button', { name: 'Edit' }).focus();
      await page.waitForTimeout(100);
      await page.keyboard.press(key);
      await expect(page.getByRole('button', { name: 'Archive' })).toBeFocused();
      await expect(tooltips(page)).toHaveText('Archive');
    });
  }

  test('a script focus() with no key down still opens nothing (regression)', async ({ page }) => {
    await expectPlayToPass(page, STORY('toolbar'));
    await page.evaluate(() => document.querySelector<HTMLButtonElement>('button[aria-label="Duplicate"]')!.focus());
    await page.waitForTimeout(SETTLE);
    await expect(tooltips(page)).toHaveCount(0);
  });
});
