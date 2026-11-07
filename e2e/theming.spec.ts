import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = 'foundations-theming--switcher';

const bg = (loc: import('@playwright/test').Locator) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe('Foundations/Theming', () => {
  test('the story play function passes and axe is clean', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await expectNoA11yViolations(page);
  });

  test('changing preset or custom colour restyles Button and StatusBadge without a reload', async ({ page }) => {
    await gotoStory(page, STORY);
    await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
    const button = page.getByRole('button', { name: 'Approve' });
    const badge = page.getByTestId('themed-badge');
    const defaultButton = await bg(button);
    const defaultBadge = await bg(badge);

    const outline = (loc: import('@playwright/test').Locator) => loc.evaluate((el) => getComputedStyle(el).outlineColor);
    const defaultOutline = await outline(badge);

    await page.getByRole('radio', { name: 'Violet' }).check();
    expect(await bg(button)).toBe('rgb(107, 63, 160)');
    expect(await bg(badge)).not.toBe(defaultBadge);
    expect(await outline(badge)).not.toBe(defaultOutline);
    const forestRadius = await button.evaluate((el) => getComputedStyle(el).borderRadius);
    await page.getByRole('radio', { name: 'Forest' }).check();
    expect(await bg(button)).toBe('rgb(31, 107, 58)');
    expect(await bg(badge)).not.toBe(defaultBadge);
    expect(await button.evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe(forestRadius);

    await page.getByRole('radio', { name: 'Custom colour' }).check();
    await page.getByLabel('Primary').fill('#b4236b');
    expect(await bg(button)).toBe('rgb(180, 35, 107)');
    expect(await bg(badge)).not.toBe(defaultBadge);

    await page.getByRole('radio', { name: 'Default' }).check();
    expect(await bg(button)).toBe(defaultButton);
    expect(await bg(badge)).toBe(defaultBadge);
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  });

  test('the Introduction links to the Theming story, which exists', async ({ page }) => {
    await page.goto('/iframe.html?id=introduction--docs&viewMode=docs');
    await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
    await expect(page.locator('a[href*="foundations-theming--switcher"]').first()).toBeVisible();
  });
});
