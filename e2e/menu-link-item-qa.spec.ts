import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

const STORY = 'overlays-menu--navigation-items';
const trigger = (page: Page) => page.getByRole('button', { name: 'Switch workspace', includeHidden: true });
const item = (page: Page, name: string) => page.getByRole('menuitem', { name });

// Records, for every click and auxclick that reaches the document, whether a handler already cancelled it (what the
// browser sees when it decides to navigate or open a tab), then cancels it so the test page stays on the story.
async function record(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __ev: string[] };
    w.__ev = [];
    for (const type of ['click', 'auxclick']) {
      document.addEventListener(type, (event) => {
        w.__ev.push(`${type}:${event.defaultPrevented}`);
        event.preventDefault();
      });
    }
  });
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { __ev: string[] }).__ev);

test.describe('Menu: MenuLinkItem (QA)', () => {
  test('middle click: the new tab is left to the browser, never handed to the app, and the menu closes', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await trigger(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await record(page);
    await item(page, 'Reports').click({ button: 'middle' });
    await expect(page.getByRole('menu')).toHaveCount(0);
    const ev = await events(page);
    expect(ev).toContain('auxclick:false');
    expect(ev.every((e) => e.endsWith(':false'))).toBe(true);
  });

  test('right click does not navigate nor activate', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await trigger(page).click();
    await record(page);
    await item(page, 'Reports').click({ button: 'right' });
    expect((await events(page)).some((e) => e === 'click:true')).toBe(false);
  });

  test('typeahead reaches a link item and Home/End include link items', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(item(page, 'Overview')).toBeFocused();
    await page.keyboard.press('r');
    await expect(item(page, 'Reports')).toBeFocused();
    await page.keyboard.press('End');
    await expect(item(page, 'Settings')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(item(page, 'Overview')).toBeFocused();
  });

  test('mobile viewport: tap on a link item hands it to the app, focus on trigger', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expectPlayToPass(page, STORY);
    await trigger(page).click();
    await record(page);
    await item(page, 'Reports').click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    expect(await events(page)).toEqual(['click:true']);
  });
});
