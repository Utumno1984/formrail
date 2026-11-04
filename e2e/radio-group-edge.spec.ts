import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-radiogroup--${name}`;
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const checkedValues = (page: Page) =>
  page
    .locator('input[type="radio"]')
    .evaluateAll((els) => els.filter((e) => (e as HTMLInputElement).checked).map((e) => (e as HTMLInputElement).value));
const checkedPerGroup = (page: Page) =>
  page.getByRole('radiogroup').evaluateAll((gs) =>
    gs.map((g) =>
      Array.from(g.querySelectorAll('input'))
        .filter((i) => i.checked)
        .map((i) => i.value)
        .join(','),
    ),
  );

test.describe('RadioGroup edge cases in real Chromium (QA #189)', () => {
  test('value matching no item: nothing is selected and Tab enters on the first enabled radio', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'value:;disabledItem:free');
    expect(await checkedValues(page)).toEqual([]);
    await page.keyboard.press('Tab');
    await expect(radio(page, 'Team')).toBeFocused();
    expect(await checkedValues(page)).toEqual([]);
  });

  test('selected item that becomes disabled stays selected and visible; the group stays reachable by keyboard', async ({
    page,
  }) => {
    await gotoStory(page, STORY('manual'), 'value:free;disabledItem:free');
    await expect(radio(page, 'Free')).toBeChecked();
    await expect(radio(page, 'Free')).toBeDisabled();
    await expect(radio(page, 'Free')).toBeVisible();
    const dot = await page.locator('input[type="radio"]:checked + span').evaluate((el) => getComputedStyle(el).display);
    expect(dot).toBe('block');
    // "the group stays reachable": some radio of the group receives focus with Tab.
    await page.keyboard.press('Tab');
    const focusedInGroup = await page.evaluate(() => document.activeElement?.closest('[role="radiogroup"]') != null);
    expect(focusedInGroup).toBe(true);
  });

  test('RTL horizontal: ArrowLeft goes to the next item, ArrowRight to the previous', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'orientation:horizontal;value:free');
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await page.keyboard.press('Tab');
    await expect(radio(page, 'Free')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(radio(page, 'Business')).toBeChecked();
    await page.keyboard.press('ArrowRight');
    await expect(radio(page, 'Free')).toBeChecked();
  });

  test('RTL horizontal locked: horizontal arrows change nothing', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'orientation:horizontal;value:free;fieldState:locked');
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await page.keyboard.press('Tab');
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowDown']) await page.keyboard.press(key);
    expect(await checkedValues(page)).toEqual(['free']);
  });

  test('groups without name on one page get distinct names; arrows of one never touch the others', async ({ page }) => {
    await gotoStory(page, STORY('state-matrix'));
    const groups = page.getByRole('radiogroup');
    const n = await groups.count();
    expect(n).toBeGreaterThan(1);
    const perGroup = await groups.evaluateAll((gs) =>
      gs.map((g) => Array.from(new Set(Array.from(g.querySelectorAll('input')).map((i) => i.name)))),
    );
    for (const names of perGroup) expect(names).toHaveLength(1);
    expect(new Set(perGroup.flat()).size).toBe(n);

    const before = await checkedPerGroup(page);
    const target = groups.first().locator('input[type="radio"]:not(:disabled)').first();
    await target.focus();
    await page.keyboard.press('ArrowDown');
    const after = await checkedPerGroup(page);
    expect(after.slice(1)).toEqual(before.slice(1));
  });

  test('no non-DOM prop leaks on the group markup', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'orientation:horizontal');
    const group = page.locator('[role="radiogroup"]');
    const html = await group.evaluate((el) => el.outerHTML);
    expect(html).not.toMatch(/onvaluechange|interactionblocked/i);
    const attrs = await group.evaluate((el) => el.getAttributeNames());
    expect(attrs.filter((a) => /orientation/i.test(a))).toEqual(['aria-orientation']);
  });
});
