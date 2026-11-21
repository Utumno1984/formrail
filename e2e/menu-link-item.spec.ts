import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';

const STORY = 'overlays-menu--navigation-items';
const trigger = (page: Page) => page.getByRole('button', { name: 'Switch workspace', includeHidden: true });
const item = (page: Page, name: string) => page.getByRole('menuitem', { name });

// Records, for every click that reaches the document, whether a handler already cancelled it (that is what the browser
// sees when it decides to navigate), then cancels it so the test page does not leave the story or open a tab.
async function recordClicks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __clicks: boolean[] };
    w.__clicks = [];
    document.addEventListener('click', (event) => {
      w.__clicks.push(event.defaultPrevented);
      event.preventDefault();
    });
  });
}
const clicks = (page: Page) => page.evaluate(() => (window as unknown as { __clicks: boolean[] }).__clicks);

test.describe('Menu: MenuLinkItem', () => {
  for (const name of ['navigation-items', 'navigation-items-open']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, `overlays-menu--${name}`);
    });
  }

  test('the open menu has real links, no axe violations, and the disabled item has no href', async ({ page }) => {
    await expectPlayToPass(page, 'overlays-menu--navigation-items-open');
    await expect(item(page, 'Overview')).toHaveAttribute('href', '/overview');
    await expect(item(page, 'Overview')).toHaveAttribute('aria-current', 'page');
    await expect(item(page, 'Billing')).not.toHaveAttribute('href');
    await expect(item(page, 'Billing')).toHaveAttribute('aria-disabled', 'true');
    await expectNoA11yViolations(page);
  });

  test('a plain click is handed to the app: cancelled for the browser, menu closed, focus on the trigger', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await recordClicks(page);
    await trigger(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await item(page, 'Reports').click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    expect(await clicks(page)).toEqual([true]);
  });

  test('Enter is handed to the app; Space does nothing', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await recordClicks(page);
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(item(page, 'Overview')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('menu')).toBeVisible();
    expect(await clicks(page)).toEqual([]);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    expect(await clicks(page)).toEqual([true]);
  });

  test('a Ctrl+click is the browser\'s: not cancelled, href intact, the menu closes', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await recordClicks(page);
    await trigger(page).click();
    await item(page, 'Reports').click({ modifiers: ['Control'] });
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(await clicks(page)).toEqual([false]);
  });

  test('the disabled item is skipped by the arrows and a click on it does nothing', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await recordClicks(page);
    await trigger(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, 'Overview')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, 'Reports')).toBeFocused();
    await item(page, 'Billing').click({ force: true });
    await expect(page.getByRole('menu')).toBeVisible();
    expect(await clicks(page)).toEqual([true]);
  });
});
