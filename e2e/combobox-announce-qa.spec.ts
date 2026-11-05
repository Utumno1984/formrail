import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-combobox--${name}`;
const input = (page: Page) => page.getByRole('combobox', { name: 'Comune' });
const status = (page: Page) => page.getByRole('status');

test.describe('QA #250: "no results" live region, uncovered cases', () => {
  test('Escape and Tab empty the region; reopening with the same query announces again', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await box.click();
    await page.keyboard.type('zz');
    await expect(status(page)).toHaveText('No results');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(status(page)).toHaveText('');
    await page.keyboard.press('ArrowDown');
    await expect(status(page)).toHaveText('No results');
    await page.keyboard.press('Tab');
    await expect(status(page)).toHaveText('');
    await expect(page.locator('[role="status"]')).toHaveCount(1);
  });

  test('a selected value never leaves a stale announcement', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await box.click();
    await page.keyboard.type('mi');
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('Milano');
    await expect(status(page)).toHaveText('');
    await page.keyboard.press('ArrowDown');
    await expect(status(page)).toHaveText('');
  });

  for (const name of ['disabled', 'forced']) {
    test(`${name}: the region stays empty and single`, async ({ page }) => {
      await gotoStory(page, STORY(name));
      await expect(page.locator('[role="status"]')).toHaveCount(1);
      await expect(status(page)).toHaveText('');
      if (name === 'disabled') {
        // A disabled input cannot receive keys: assert that instead of typing into nothing.
        await expect(input(page)).toBeDisabled();
      } else {
        await input(page).focus();
        await page.keyboard.type('zzz');
        await page.keyboard.press('ArrowDown');
      }
      await expect(status(page)).toHaveText('');
    });
  }

  test('small viewport: the region takes no layout space and causes no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, STORY('manual'));
    const before = await input(page).boundingBox();
    await input(page).click();
    await page.keyboard.type('zz');
    await expect(status(page)).toHaveText('No results');
    const after = await input(page).boundingBox();
    expect(after!.height).toBe(before!.height);
    expect(after!.y).toBe(before!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
