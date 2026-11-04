import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-calendar--${name}`;
const day = (scope: Page | Locator, name: string): Locator => scope.getByRole('gridcell', { name, exact: true });
const focusedIso = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-iso') ?? null);
const selectedIsos = (page: Page) =>
  page.locator('[role="gridcell"][aria-selected="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-iso')));

/** Tab from the page start into the grid: previous month, next month, then the grid's tab stop. */
async function tabIntoGrid(page: Page) {
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
}

test.describe('Forms/Calendar: stories play', () => {
  for (const name of ['playground', 'async-hydration']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('keyboard', () => {
  test('Tab lands on today, a single tab stop; Tab leaves the grid', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await tabIntoGrid(page);
    await expect(day(page, 'Tuesday, March 10, 2026')).toBeFocused();
    await expect(page.locator('[role="grid"] [tabindex="0"]')).toHaveCount(1);
    await expectFocusRingVisible(day(page, 'Tuesday, March 10, 2026'));
    await page.keyboard.press('Tab');
    expect(await focusedIso(page)).toBeNull();
  });

  test('arrows, Home/End, PageUp/PageDown, Shift+PageDown, Enter', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await tabIntoGrid(page);
    await page.keyboard.press('ArrowRight');
    expect(await focusedIso(page)).toBe('2026-03-11');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedIso(page)).toBe('2026-03-09');
    await page.keyboard.press('ArrowUp');
    expect(await focusedIso(page)).toBe('2026-03-02');
    await page.keyboard.press('ArrowUp');
    expect(await focusedIso(page)).toBe('2026-02-23');
    await expect(page.getByText('February 2026')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    expect(await focusedIso(page)).toBe('2026-03-02');
    // en-US: the week runs Sunday..Saturday.
    await page.keyboard.press('Home');
    expect(await focusedIso(page)).toBe('2026-03-01');
    await page.keyboard.press('End');
    expect(await focusedIso(page)).toBe('2026-03-07');
    await page.keyboard.press('PageDown');
    expect(await focusedIso(page)).toBe('2026-04-07');
    await page.keyboard.press('PageUp');
    expect(await focusedIso(page)).toBe('2026-03-07');
    await page.keyboard.press('Shift+PageDown');
    expect(await focusedIso(page)).toBe('2027-03-07');
    await expect(page.getByText('March 2027')).toBeVisible();
    await page.keyboard.press('Shift+PageUp');
    await page.keyboard.press('Enter');
    expect(await selectedIsos(page)).toEqual(['2026-03-07']);
    await expect(page.getByTestId('value')).toHaveText('2026-03-07');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('value')).toHaveText('2026-03-08');
  });

  test('PageDown from January 31 goes to February 28, not March', async ({ page }) => {
    await gotoStory(page, STORY('controlled-month'));
    await tabIntoGrid(page);
    expect(await focusedIso(page)).toBe('2026-01-31');
    await page.keyboard.press('PageDown');
    expect(await focusedIso(page)).toBe('2026-02-28');
    await expect(page.getByTestId('month')).toHaveText('2026-02');
  });

  test('the page does not scroll on Space/PageDown/arrows inside the grid', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 300 });
    await gotoStory(page, STORY('manual'));
    await tabIntoGrid(page);
    const before = await page.evaluate(() => window.scrollY);
    for (const key of ['PageDown', 'ArrowDown', 'Space', 'PageUp', 'End']) await page.keyboard.press(key);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

test.describe('mouse', () => {
  test('click selects; month buttons change month; heading is announced', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await day(page, 'Friday, March 20, 2026').click();
    await expect(page.getByTestId('value')).toHaveText('2026-03-20');
    await expect(day(page, 'Friday, March 20, 2026')).toHaveAttribute('aria-selected', 'true');
    const heading = page.locator('[aria-live="polite"]');
    await expect(heading).toHaveText('March 2026');
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(heading).toHaveText('April 2026');
    await expect(page.getByRole('grid')).toHaveAccessibleName('April 2026');
    await page.getByRole('button', { name: 'Previous month' }).click();
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(heading).toHaveText('February 2026');
  });
});

test.describe('limits', () => {
  test('past max: reachable, not selectable; next month disabled at the last reachable month', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'max:2026-04-20');
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled();
    // The click disabled the button under the focus: the focus moved to "Previous month".
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeFocused();
    // `force`: Playwright treats an aria-disabled cell as not actionable; this is still a real mouse click.
    await day(page, 'Saturday, April 25, 2026').click({ force: true });
    await expect(day(page, 'Saturday, April 25, 2026')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('value')).toHaveText('none');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedIso(page)).toBe('2026-04-20');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('value')).toHaveText('2026-04-20');
    await page.keyboard.press('PageDown');
    expect(await focusedIso(page)).toBe('2026-04-20');
  });

  test('disabled weekends are skipped by selection, not by the arrows', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'disableWeekends:!true');
    await tabIntoGrid(page);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    expect(await focusedIso(page)).toBe('2026-03-14'); // Saturday
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('value')).toHaveText('none');
  });
});

test.describe('disabled / readOnly / Field states', () => {
  test('disabled: out of the tab order, nothing reacts', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'disabled:!true');
    await page.keyboard.press('Tab');
    expect(await focusedIso(page)).toBeNull();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled();
    await day(page, 'Friday, March 20, 2026').click({ force: true });
    await expect(page.getByTestId('value')).toHaveText('none');
    expect(await page.locator('[role="grid"] [tabindex]').count()).toBe(0);
  });

  test('readOnly: navigable, nothing selected by click, Enter or Space', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'readOnly:!true');
    await tabIntoGrid(page);
    expect(await focusedIso(page)).toBe('2026-03-10');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await day(page, 'Friday, March 20, 2026').click();
    await expect(page.getByTestId('value')).toHaveText('none');
    await page.keyboard.press('PageDown');
    await expect(page.getByText('April 2026')).toBeVisible();
  });

  for (const state of ['forced', 'locked'] as const) {
    test(`Field ${state}: focusable, reason read, nothing selectable`, async ({ page }) => {
      await gotoStory(page, STORY('in-field'));
      await page.getByRole('button', { name: `Make ${state}` }).click();
      const group = page.getByRole('group', { name: 'Contract start' });
      await expect(group).toHaveAccessibleDescription(/Set by the framework agreement/);
      await expect(page.getByRole('grid')).toHaveAttribute('aria-readonly', 'true');
      await day(page, 'Friday, March 20, 2026').click();
      await page.keyboard.press('Enter');
      await expect(day(page, 'Monday, March 16, 2026')).toHaveAttribute('aria-selected', 'true');
      await expect(day(page, 'Friday, March 20, 2026')).toHaveAttribute('aria-selected', 'false');
      await expectFocusRingVisible(day(page, 'Friday, March 20, 2026'));
    });
  }

  test('Field disabled: no tab stop in the grid', async ({ page }) => {
    await gotoStory(page, STORY('in-field'));
    await page.getByRole('button', { name: 'Make disabled' }).click();
    await expect(page.getByRole('grid')).toHaveAttribute('aria-disabled', 'true');
    expect(await page.locator('[role="grid"] [tabindex]').count()).toBe(0);
  });
});

test.describe('controlled month from outside', () => {
  test('focus stays in the grid, on the same day or the last valid one', async ({ page }) => {
    await gotoStory(page, STORY('controlled-month'));
    await tabIntoGrid(page);
    expect(await focusedIso(page)).toBe('2026-01-31');
    await page.getByRole('button', { name: 'Show 2026-02' }).click();
    await expect(page.getByText('February 2026')).toBeVisible();
    expect(await focusedIso(page)).toBe('2026-02-28');
    await page.getByRole('button', { name: 'Show 2026-07' }).click();
    expect(await focusedIso(page)).toBe('2026-07-28');
    await page.keyboard.press('ArrowRight');
    expect(await focusedIso(page)).toBe('2026-07-29');
  });
});

test.describe('layout', () => {
  test('February 2026 (4 weeks) and August 2026 (6 weeks) have the same height, 6 rows each', async ({ page }) => {
    await gotoStory(page, STORY('stable-footprint'));
    const feb = await page.getByTestId('february').boundingBox();
    const aug = await page.getByTestId('august').boundingBox();
    expect(feb && aug).toBeTruthy();
    expect(feb!.height).toBe(aug!.height);
    for (const id of ['february', 'august']) {
      await expect(page.getByTestId(id).locator('tbody tr')).toHaveCount(6);
    }
  });

  test('day cells are at least 32×32 and the month buttons 32px', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = await day(page, 'Tuesday, March 10, 2026').boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(32);
    expect(box!.height).toBeGreaterThanOrEqual(32);
    const button = await page.getByRole('button', { name: 'Next month' }).boundingBox();
    expect(button!.height).toBeGreaterThanOrEqual(32);
  });

  test('no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    for (const story of ['manual', 'states', 'locales']) {
      await gotoStory(page, STORY(story));
      await expectNoHorizontalOverflow(page.locator('#storybook-root'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test('focus ring of a day is visible and not clipped, also on the selected day', async ({ page }) => {
    await gotoStory(page, STORY('states'));
    const first = page.getByRole('group', { name: 'Selected and today' });
    await expectFocusRingVisible(day(first, 'Tuesday, March 17, 2026'));
    await expectFocusRingVisible(day(first, 'Wednesday, March 18, 2026'));
  });
});

test.describe('locales', () => {
  test('it-IT starts on Monday, en-US on Sunday', async ({ page }) => {
    await gotoStory(page, STORY('locales'));
    const it = page.getByRole('group', { name: 'it-IT' });
    const us = page.getByRole('group', { name: 'en-US' });
    await expect(it.getByRole('columnheader').first()).toHaveAttribute('aria-label', 'lunedì');
    await expect(us.getByRole('columnheader').first()).toHaveAttribute('aria-label', 'Sunday');
    await expect(day(it, 'martedì 17 marzo 2026')).toHaveAttribute('aria-selected', 'true');
  });

  test('ar-EG in RTL: Saturday first, ArrowLeft moves forward (best effort)', async ({ page }) => {
    await gotoStory(page, STORY('right-to-left'));
    await expect(page.getByRole('columnheader').first()).toHaveAttribute('aria-label', 'السبت');
    await tabIntoGrid(page);
    expect(await focusedIso(page)).toBe('2026-03-17');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedIso(page)).toBe('2026-03-18');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await focusedIso(page)).toBe('2026-03-16');
  });
});

test.describe('accessibility', () => {
  for (const story of ['manual', 'states', 'locales', 'in-field', 'stable-footprint', 'controlled-month']) {
    test(`${story}: no axe violations`, async ({ page }) => {
      await gotoStory(page, STORY(story));
      await expectNoA11yViolations(page);
    });
  }

  test('in-field disabled / locked: no axe violations', async ({ page }) => {
    await gotoStory(page, STORY('in-field'));
    for (const state of ['disabled', 'locked']) {
      await page.getByRole('button', { name: `Make ${state}` }).click();
      await expectNoA11yViolations(page);
    }
  });
});
