import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';

const STORY = 'foundations-theming--switcher';

const bg = (loc: import('@playwright/test').Locator) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe('Foundations/Theming', () => {
  test('the story play function passes and axe is clean', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await expectNoA11yViolations(page);
  });

  test('changing preset or custom colour restyles Button and StatusBadge without a reload', async ({ page }) => {
    await expectPlayToPass(page, STORY);
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
    await expectPlayToPass(page, STORY);
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

  // The group is named once, by the Field label (the pattern of every other RadioGroup): no
  // fieldset/legend around it and no aria-label on it repeating "Theme", so a screen reader
  // entering the switcher hears the group name a single time.
  test('the theme switcher group is named "Theme" exactly once', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    const group = page.getByRole('radiogroup', { name: 'Theme', exact: true });
    await expect(group).toHaveCount(1);
    await expect(group).toHaveAccessibleName('Theme');
    await expect(group).not.toHaveAttribute('aria-label');
    const labelledBy = (await group.getAttribute('aria-labelledby')) ?? '';
    expect(labelledBy.split(/\s+/).filter(Boolean)).toHaveLength(1);
    await expect(page.locator(`[id="${labelledBy}"]`)).toHaveText('Theme');
    // No enclosing group (fieldset or role=group) that also announces a name.
    expect(
      await group.evaluate((el) => {
        const named: string[] = [];
        for (let p = el.parentElement; p; p = p.parentElement) {
          const isGroup = p.tagName === 'FIELDSET' || p.getAttribute('role') === 'group' || p.getAttribute('role') === 'radiogroup';
          if (isGroup) named.push(p.tagName);
        }
        return named;
      }),
    ).toEqual([]);
    await expect(page.getByRole('group', { name: 'Theme' })).toHaveCount(0);
    // The radios themselves are still named by their own text only.
    await expect(group.getByRole('radio')).toHaveCount(4);
    await expect(page.getByRole('radio', { name: 'Violet', exact: true })).toHaveCount(1);
  });

  test('the Introduction links to the Theming story, which exists', async ({ page }) => {
    await page.goto('/iframe.html?id=introduction--docs&viewMode=docs');
    await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
    await expect(page.locator('a[href*="foundations-theming--switcher"]').first()).toBeVisible();
  });
});
