import { expect, test, type Page } from '@playwright/test';
import { browserBack, browserForward } from './helpers/history';
import { gotoStory } from './helpers/story';

// #154 QA: extra popstate cases for useDirtyGuard, on the Patterns/DirtyGuard BrowserHistory fixture.
const HISTORY = 'patterns-dirtyguard--browser-history';
const dlg = (page: Page) => page.getByRole('dialog', { name: 'Unsaved changes' });
const route = (page: Page) => page.getByTestId('route');
const field = (page: Page) => page.getByLabel('Supplier name');
const hash = (page: Page) => page.evaluate(() => window.location.hash);
const leave = (page: Page) => page.getByRole('button', { name: 'Leave without saving' }).click();
const settle = (page: Page) => page.waitForTimeout(300);

test.describe('#154 QA: popstate dirty guard extra cases', () => {
  test('Back with the dialog already open: still one dialog, route stays, Leave goes back once', async ({ page }) => {
    await gotoStory(page, HISTORY);
    await field(page).fill('x');
    browserBack(page);
    await expect(dlg(page)).toBeVisible();
    await settle(page);
    await page.evaluate(() => window.history.back());
    await settle(page);
    await expect(dlg(page)).toHaveCount(1);
    expect(await hash(page)).toBe('#step-3');
    await leave(page);
    await expect(route(page)).toHaveText('Route: #step-2');
    expect(await hash(page)).toBe('#step-2');
  });

  test('Keep editing repeatedly re-asks; clearing the field then makes Back free', async ({ page }) => {
    await gotoStory(page, HISTORY);
    await field(page).fill('x');
    for (let i = 0; i < 3; i++) {
      browserBack(page);
      await expect(dlg(page)).toBeVisible();
      await settle(page);
      await page.getByRole('button', { name: 'Keep editing' }).click();
      await expect(dlg(page)).toHaveCount(0);
      expect(await hash(page)).toBe('#step-3');
    }
    await field(page).fill('');
    browserBack(page);
    await expect(route(page)).toHaveText('Route: #step-2');
    await expect(dlg(page)).toHaveCount(0);
  });

  test('when turns false with the dialog open: the dialog stays and Leave still navigates', async ({ page }) => {
    await gotoStory(page, HISTORY);
    await field(page).fill('x');
    browserBack(page);
    await expect(dlg(page)).toBeVisible();
    await settle(page);
    await page.evaluate(() => {
      const input = document.querySelector('input') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(dlg(page)).toBeVisible();
    await leave(page);
    await expect(route(page)).toHaveText('Route: #step-2');
    expect(await hash(page)).toBe('#step-2');
  });

  test('after Leave and a clean form Back/Forward are free and the history is intact', async ({ page }) => {
    await gotoStory(page, HISTORY);
    await field(page).fill('x');
    browserBack(page);
    await leave(page);
    await expect(route(page)).toHaveText('Route: #step-2');
    await field(page).fill('');
    browserBack(page);
    await expect(route(page)).toHaveText('Route: #step-1');
    browserForward(page);
    await expect(route(page)).toHaveText('Route: #step-2');
    browserForward(page);
    await expect(route(page)).toHaveText('Route: #step-3');
  });

  for (const gap of [5, 30, 100]) {
    test(`two Backs ${gap}ms apart while dirty: after Keep editing the route is back on step-3`, async ({ page }) => {
      await gotoStory(page, HISTORY);
      await field(page).fill('x');
      await page.evaluate((ms) => {
        window.history.back();
        setTimeout(() => window.history.back(), ms);
      }, gap);
      await expect(dlg(page)).toBeVisible();
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: 'Keep editing' }).click();
      await settle(page);
      expect(await hash(page)).toBe('#step-3');
    });
  }

  test('a router listening on window BEFORE the guard never sees the Back (the route never flashes step-2)', async ({
    page,
  }) => {
    await gotoStory(page, HISTORY);
    await field(page).fill('x');
    await page.evaluate(() => {
      const w = window as unknown as { __routes: string[] };
      w.__routes = [];
      const el = document.querySelector('[data-testid=route]')!;
      new MutationObserver(() => w.__routes.push(el.textContent ?? '')).observe(el, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
    browserBack(page);
    await expect(dlg(page)).toBeVisible();
    await settle(page);
    const seen = await page.evaluate(() => (window as unknown as { __routes: string[] }).__routes);
    expect(seen).toEqual([]);
  });

  test('history.go(-2) while dirty: Leave goes back two entries', async ({ page }) => {
    await gotoStory(page, HISTORY);
    await field(page).fill('x');
    await page.evaluate(() => window.history.go(-2));
    await expect(dlg(page)).toBeVisible();
    await settle(page);
    expect(await hash(page)).toBe('#step-3');
    await leave(page);
    await expect(route(page)).toHaveText('Route: #step-1');
  });

  test('beforeunload stays registered while dirty (also after the popstate dialog) and goes when clean', async ({
    page,
  }) => {
    await gotoStory(page, HISTORY);
    await field(page).fill('x');
    browserBack(page);
    await expect(dlg(page)).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    const prevented = () =>
      page.evaluate(() => {
        const e = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      });
    expect(await prevented()).toBe(true);
    await field(page).fill('');
    expect(await prevented()).toBe(false);
  });
});
