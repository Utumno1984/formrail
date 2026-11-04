import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// QA edge cases for the DatePicker (#195) not covered by `date-picker.spec.ts`.
const STORY = (name: string) => `forms-datepicker--${name}`;
const input = (scope: Page | Locator, name = 'Due date'): Locator => scope.getByRole('textbox', { name, exact: true });
const button = (scope: Page | Locator): Locator => scope.getByRole('button', { name: /^Choose date/ });
const popover = (page: Page): Locator => page.getByRole('dialog', { name: 'Choose date', exact: true });

test.describe('DatePicker QA edge cases', () => {
  test('a date after max is refused: value none, text kept; a pasted ISO date is accepted in it-IT', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'locale:it-IT');
    const box = input(page);
    await box.click();
    await page.keyboard.insertText('2026-03-15');
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('15/03/2026');
    await expect(page.getByTestId('value')).toHaveText('2026-03-15');
    await box.fill('01/01/2027');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('value')).toHaveText('none');
    await expect(box).toHaveValue('01/01/2027');
  });

  test('a stale two-digit-year text is refused (4-digit year required)', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).fill('03/15/26');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('value')).toHaveText('none');
    await expect(input(page)).toHaveValue('03/15/26');
  });

  for (const story of ['inside-dialog', 'inside-sheet']) {
    test(`${story} at 375x667: the popover stays inside the viewport and a tap picks a day`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await gotoStory(page, STORY(story));
      const modal = page.getByRole('dialog', { name: 'Edit invoice' });
      await expect(modal).toBeVisible();
      if (await popover(page).count()) {
        await page.keyboard.press('Escape');
        await expect(popover(page)).toHaveCount(0);
      }
      await button(modal).click();
      await expect(popover(page)).toBeVisible();
      const r = (await popover(page).boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(375);
      expect(r.y + r.height).toBeLessThanOrEqual(667);
      await popover(page).getByRole('gridcell', { name: 'Friday, March 20, 2026', exact: true }).click();
      await expect(popover(page)).toHaveCount(0);
      await expect(input(modal)).toHaveValue('03/20/2026');
      await expect(modal).toBeVisible();
    });
  }
});
