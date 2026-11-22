import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';
import { MOBILE_VIEWPORT } from './helpers/viewports';

const EXAMPLE = 'navigation-appswitcher--example';
const DIRTY = 'navigation-appswitcher--with-dirty-guard';
const ONLY_CURRENT = 'navigation-appswitcher--only-the-current-app';
const NEW_PAGE = 'navigation-appswitcher--focus-on-the-new-page';
const DESKTOP = { width: 1280, height: 800 };

const trigger = (page: Page) => page.locator('[data-rop-app-switcher]');
const menuItem = (page: Page, name: string) => page.getByRole('menuitem', { name });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Switch app' });

// Records, for every click and auxclick that reaches the document, whether a handler already cancelled it (what the
// browser sees when it decides to navigate), then cancels it so the test page does not leave the story or open a tab.
async function recordClicks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __clicks: string[] };
    w.__clicks = [];
    for (const type of ['click', 'auxclick']) {
      document.addEventListener(type, (event) => {
        w.__clicks.push(`${type}:${event.defaultPrevented}`);
        event.preventDefault();
      });
    }
  });
}
const clicks = (page: Page) => page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks);

test.describe('AppSwitcher', () => {
  for (const name of ['playground', 'menu-open', 'sheet-open', 'with-dirty-guard', 'closed', 'only-the-current-app', 'focus-on-the-new-page']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, `navigation-appswitcher--${name}`);
    });
  }

  test('the trigger: a button named after the current app, closed markup', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await expectPlayToPass(page, EXAMPLE);
    const button = page.getByRole('button', { name: 'Switch app, current: App one' });
    await expect(button).toHaveText('App one');
    await expect(button).toHaveAttribute('aria-haspopup', 'menu');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('Menu: current app marked, disabled app described, no axe violations with the menu open', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await expectPlayToPass(page, 'navigation-appswitcher--menu-open');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(menuItem(page, 'App one')).toHaveAttribute('aria-current', 'true');
    await expect(menuItem(page, 'App two')).toHaveAttribute('aria-disabled', 'true');
    await expect(menuItem(page, 'App two')).toHaveAccessibleDescription('You do not have access to this app');
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    await expectNoA11yViolations(page);
  });

  test('Menu: arrows and typeahead skip the disabled app', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await expectPlayToPass(page, 'navigation-appswitcher--closed');
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(menuItem(page, 'App one')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menuItem(page, 'App three')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(menuItem(page, 'App one')).toBeFocused();
    await page.keyboard.type('App t');
    await expect(menuItem(page, 'App three')).toBeFocused();
  });

  test('Menu: a plain click closes, focuses the trigger, then navigates through onNavigate', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await expectPlayToPass(page, EXAMPLE);
    await trigger(page).click();
    await recordClicks(page);
    await menuItem(page, 'App two').click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await expect(trigger(page)).toHaveAccessibleName('Switch app, current: App two');
    expect(await clicks(page)).toEqual(['click:true']);
  });

  test('Menu: Enter navigates; choosing the current app only closes', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await expectPlayToPass(page, EXAMPLE);
    await recordClicks(page);
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(menuItem(page, 'App one')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await expect(trigger(page)).toHaveAccessibleName('Switch app, current: App one');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await expect(menuItem(page, 'App two')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(trigger(page)).toBeFocused();
    await expect(trigger(page)).toHaveAccessibleName('Switch app, current: App two');
  });

  test('Menu: Ctrl+click and the middle button are the browser\'s, onNavigate is not called', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await expectPlayToPass(page, EXAMPLE);
    await trigger(page).click();
    await recordClicks(page);
    await menuItem(page, 'App two').click({ modifiers: ['Control'] });
    await expect(page.getByRole('menu')).toHaveCount(0);
    await trigger(page).click();
    await menuItem(page, 'App four').click({ button: 'middle' });
    await expect(page.getByRole('menu')).toHaveCount(0);
    // The Ctrl+click and the middle button's auxclick reach the browser uncancelled (`onNavigate` never ran).
    expect(await clicks(page)).toContain('click:false');
    expect(await clicks(page)).toContain('auxclick:false');
    expect(await clicks(page)).not.toContain('click:true');
    await expect(trigger(page)).toHaveAccessibleName('Switch app, current: App one');
  });

  test('Sheet at 375px: focus on the current app, no axe violations, Escape returns the focus to the trigger', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await expectPlayToPass(page, 'navigation-appswitcher--mobile');
    await trigger(page).click();
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(sheet(page).getByRole('link', { name: 'App one' })).toBeFocused();
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'dialog');
    await expectNoA11yViolations(page);
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  });

  test('Sheet: a plain click closes, focuses the trigger, then navigates; Ctrl+click is the browser\'s', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await expectPlayToPass(page, EXAMPLE);
    await trigger(page).click();
    await recordClicks(page);
    await sheet(page).getByRole('link', { name: 'App two' }).click({ modifiers: ['Control'] });
    await expect(sheet(page)).toHaveCount(0);
    await expect(trigger(page)).toHaveAccessibleName('Switch app, current: App one');
    expect(await clicks(page)).toEqual(['click:false']);
    await trigger(page).click();
    await sheet(page).getByRole('link', { name: 'App two' }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await expect(trigger(page)).toHaveAccessibleName('Switch app, current: App two');
  });

  test('Sheet: a disabled app keeps its focus stop and does nothing', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await expectPlayToPass(page, EXAMPLE);
    await trigger(page).click();
    const three = sheet(page).getByRole('link', { name: 'App three' });
    await expect(three).toHaveAttribute('aria-disabled', 'true');
    await expect(three).toHaveAccessibleDescription('Ask an administrator for access');
    // Playwright does not click an `aria-disabled` element: the keyboard, then a dispatched click.
    await three.focus();
    await expect(three).toBeFocused();
    await page.keyboard.press('Enter');
    await three.dispatchEvent('click');
    await expect(sheet(page)).toBeVisible();
    // The trigger is hidden from assistive technology while the Sheet is open: read the example's own caption.
    await expect(page.getByText('Current app: App one')).toBeVisible();
  });

  test('the form chosen at opening is kept when the viewport crosses the breakpoint', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await expectPlayToPass(page, EXAMPLE);
    await trigger(page).click();
    await expect(sheet(page)).toBeVisible();
    await page.setViewportSize(DESKTOP);
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await trigger(page).click();
    await expect(page.getByRole('menu')).toBeVisible();
  });

  for (const presentation of ['menu', 'sheet'] as const) {
    test(`${presentation} with useDirtyGuard: "Keep editing" returns the focus to the trigger, "Leave" navigates`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await expectPlayToPass(page, DIRTY, `presentation:${presentation}`);
      const pick = async () => {
        await trigger(page).click();
        if (presentation === 'menu') await menuItem(page, 'App two').click();
        else await sheet(page).getByRole('link', { name: 'App two' }).click();
      };
      await expect(page.getByText('Last app opened: none')).toBeVisible();
      await pick();
      const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Keep editing' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger(page)).toBeFocused();
      await expect(page.getByText('Last app opened: none')).toBeVisible();
      await pick();
      await dialog.getByRole('button', { name: 'Leave without saving' }).click();
      await expect(page.getByText('Last app opened: App two')).toBeVisible();
    });
  }

  test('@touch a tap on the trigger opens the Sheet and it stays open; a tap on an app navigates', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await expectPlayToPass(page, EXAMPLE);
    await trigger(page).tap();
    await expect(sheet(page)).toBeVisible();
    // The end of the tap that opened it did not land on the panel (the close button sits at the same height).
    await expect(sheet(page)).toHaveAttribute('data-state', 'open');
    await expect(sheet(page).getByRole('link', { name: 'App one' })).toBeFocused();
    await sheet(page).getByRole('link', { name: 'App four' }).tap();
    await expect(sheet(page)).toHaveCount(0);
    await expect(trigger(page)).toHaveAccessibleName('Switch app, current: App four');
  });
  // A menu must contain an item (axe aria-required-children, critical): with no other app the text is its only item.
  for (const presentation of ['menu', 'sheet'] as const) {
    test(`${presentation} with only the current app: the empty text, no axe violations with the list open`, async ({ page }) => {
      await page.setViewportSize(presentation === 'menu' ? DESKTOP : MOBILE_VIEWPORT);
      await expectPlayToPass(page, ONLY_CURRENT, `presentation:${presentation}`);
      if (presentation === 'menu') {
        await expect(page.getByRole('menu')).toHaveAccessibleDescription('No other apps available');
        await expect(page.getByRole('menuitem')).toHaveCount(1);
        await expect(page.getByRole('menuitem', { name: 'No other apps available' })).toHaveAttribute('aria-disabled', 'true');
      } else {
        await expect(sheet(page).getByText('No other apps available')).toBeVisible();
      }
      await expectNoA11yViolations(page);
      await page.keyboard.press('Escape');
      await expect(trigger(page)).toBeFocused();
    });

    test(`${presentation}: the focus onNavigate moves to the new page's heading is still there 800ms later`, async ({ page }) => {
      await page.setViewportSize(presentation === 'menu' ? DESKTOP : MOBILE_VIEWPORT);
      await expectPlayToPass(page, NEW_PAGE, `presentation:${presentation}`);
      const heading = page.locator('#storybook-root h1');
      await expect(heading).toHaveText('App three');
      await trigger(page).click();
      if (presentation === 'menu') await menuItem(page, 'App two').click();
      else await sheet(page).getByRole('link', { name: 'App two' }).click();
      await expect(heading).toHaveText('App two');
      await expect(heading).toBeFocused();
      // Well past the Sheet's exit animation and its return of the focus.
      await page.waitForTimeout(800);
      await expect(page.locator('[role="menu"], [role="dialog"]')).toHaveCount(0);
      await expect(heading).toBeFocused();
    });
  }

  test('Sheet: the middle button is the browser\'s, onNavigate is not called, the Sheet closes', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await expectPlayToPass(page, EXAMPLE);
    await trigger(page).click();
    await recordClicks(page);
    await sheet(page).getByRole('link', { name: 'App two' }).click({ button: 'middle' });
    await expect(sheet(page)).toHaveCount(0);
    expect(await clicks(page)).toEqual(['auxclick:false']);
    await expect(trigger(page)).toHaveAccessibleName('Switch app, current: App one');
  });

  // The Sheet opens on the click, the activation of a button; the Menu on the press (Radix).
  test('@engines Sheet: a press opens nothing until its click; a press dragged off the trigger opens nothing', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await expectPlayToPass(page, EXAMPLE);
    const box = (await trigger(page).boundingBox())!;
    const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await frames();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 200, { steps: 4 });
    await page.mouse.up();
    await frames();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await frames();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.mouse.up();
    await expect(sheet(page)).toBeVisible();
  });

  test('@touch Sheet: a touch opens nothing until it ends in a tap; a touch that moves away (a scroll) opens nothing', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await expectPlayToPass(page, EXAMPLE);
    const box = (await trigger(page).boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
    const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await frames();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (const dy of [20, 60, 120]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: point.y + dy }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await frames();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await frames();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).getByRole('link', { name: 'App one' })).toBeFocused();
  });
});
