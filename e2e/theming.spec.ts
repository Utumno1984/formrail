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
    // Must differ from the story's initial `customColor` arg (#b4236b), otherwise this assertion
    // would hold even with a disconnected colour-picker onChange. #2e8540 = rgb(46, 133, 64).
    await page.getByLabel('Primary').fill('#2e8540');
    expect(await bg(button)).toBe('rgb(46, 133, 64)');
    expect(await bg(badge)).not.toBe(defaultBadge);

    await page.getByRole('radio', { name: 'Default' }).check();
    expect(await bg(button)).toBe(defaultButton);
    expect(await bg(badge)).toBe(defaultBadge);
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  });

  // #316: the bare native radio showed no dot on Chrome Android. The switcher now uses RadioGroup,
  // which draws its own indicator: the radio is `appearance: none` and a sibling dot is displayed
  // only for the checked one, so the selected state never depends on native radio rendering.
  test('the selected theme radio shows a drawn indicator (not the native one)', async ({ page }) => {
    await gotoStory(page, STORY);
    const dotOf = (name: string) =>
      page.getByRole('radio', { name }).evaluate((el) => {
        const dot = el.nextElementSibling as HTMLElement;
        return { appearance: getComputedStyle(el).appearance, display: getComputedStyle(dot).display, w: dot.getBoundingClientRect().width };
      });
    for (const name of ['Default', 'Violet', 'Forest', 'Custom colour']) {
      expect((await dotOf(name)).appearance).toBe('none');
    }
    expect(await dotOf('Default')).toMatchObject({ display: 'block', w: 8 });
    expect((await dotOf('Violet')).display).toBe('none');
    await page.getByRole('radio', { name: 'Violet' }).click();
    expect(await dotOf('Violet')).toMatchObject({ display: 'block', w: 8 });
    expect((await dotOf('Default')).display).toBe('none');
  });

  test('the Introduction links to the Theming story, which exists', async ({ page }) => {
    await page.goto('/iframe.html?id=introduction--docs&viewMode=docs');
    await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
    await expect(page.locator('a[href*="foundations-theming--switcher"]').first()).toBeVisible();
  });
});
