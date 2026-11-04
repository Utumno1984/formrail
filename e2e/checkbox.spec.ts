import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-checkbox--${name}`;
const checkbox = (page: Page): Locator => page.getByRole('checkbox');

test.describe('Forms/Checkbox: stories play', () => {
  for (const name of ['playground', 'select-all', 'async-hydration']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('mouse and keyboard (default)', () => {
  test('click on the box, on the inline label and on the Field label toggle it; Space too', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = checkbox(page);
    await expect(box).not.toBeChecked();
    await box.click();
    await expect(box).toBeChecked();
    await page.getByText('I accept the terms and conditions').click();
    await expect(box).not.toBeChecked();
    await page.locator('label', { hasText: /^Terms$/ }).click();
    await expect(box).toBeChecked();
    await page.mouse.click(2, 2);
    await page.keyboard.press('Tab');
    await expect(box).toBeFocused();
    await page.keyboard.press('Space');
    await expect(box).not.toBeChecked();
  });

  test('the row is at least 24px tall and the focus ring is visible inside the Field', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const row = page.locator('label', { has: checkbox(page) });
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await page.keyboard.press('Tab');
    await expectFocusRingVisible(checkbox(page));
  });

  test('a click on the keyboard-focused-box is not blocked: Space toggles repeatedly', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await page.keyboard.press('Tab');
    for (const expected of [true, false, true]) {
      await page.keyboard.press('Space');
      await expect(checkbox(page)).toBeChecked({ checked: expected });
    }
  });
});

for (const state of ['forced', 'locked'] as const) {
  test.describe(`${state}`, () => {
    test(`Tab reaches it; clicks (box, Field label, inline label) and Space change nothing; the reason describes it`, async ({
      page,
    }) => {
      await gotoStory(page, STORY('manual'), `fieldState:${state};checked:!true`);
      const box = checkbox(page);
      await expect(box).toBeChecked();
      await page.keyboard.press('Tab');
      await expect(box).toBeFocused();
      await expect(box).toHaveAttribute('aria-readonly', 'true');
      await expect(box).toHaveAccessibleDescription(/Decided by the framework agreement/);
      await box.click();
      await page.getByText('I accept the terms and conditions').click();
      await page.locator('label', { hasText: /^Terms$/ }).click();
      await box.focus();
      await page.keyboard.press('Space');
      await expect(box).toBeChecked();
      await expect(box).toBeFocused();
      await expectFocusRingVisible(box);
    });

    test('unchecked stays unchecked', async ({ page }) => {
      await gotoStory(page, STORY('manual'), `fieldState:${state}`);
      const box = checkbox(page);
      await box.click({ force: true });
      await page.locator('label', { hasText: /^Terms$/ }).click();
      await box.focus();
      await page.keyboard.press('Space');
      await expect(box).not.toBeChecked();
    });
  });
}

test.describe('disabled', () => {
  test('out of the tab order and no click changes it', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'fieldState:disabled');
    const box = checkbox(page);
    await expect(box).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(box).not.toBeFocused();
    // `force`: Playwright otherwise waits for a label of a disabled control to become enabled.
    await page.getByText('I accept the terms and conditions').click({ force: true });
    await page.locator('label', { hasText: /^Terms$/ }).click({ force: true });
    await box.click({ force: true });
    await expect(box).not.toBeChecked();
  });
});

test.describe('indeterminate', () => {
  test('select all: a child makes the parent mixed, a click on the parent ticks all', async ({ page }) => {
    await gotoStory(page, STORY('select-all'));
    // The play already ended unchecked; drive it again with the real mouse.
    const parent = page.getByRole('checkbox', { name: 'Select all' });
    await page.getByRole('checkbox', { name: 'Receipts' }).click();
    expect(await parent.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
    await expect(parent).toBeChecked({ indeterminate: true });
    await parent.click();
    await expect(parent).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Invoices' })).toBeChecked();
    expect(await parent.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(false);
  });

  test('indeterminate has a dash and checked a tick: distinct without colour', async ({ page }) => {
    await gotoStory(page, STORY('state-matrix'));
    const marks = async (name: string) =>
      page
        .locator('label', { hasText: new RegExp(`^${name} / default$`) })
        .locator('xpath=..')
        .locator('svg')
        .evaluateAll((svgs) => svgs.map((s) => getComputedStyle(s).display));
    expect(await marks('Unchecked')).toEqual(['none', 'none']);
    expect(await marks('Checked')).toEqual(['block', 'none']);
    expect(await marks('Indeterminate')).toEqual(['none', 'block']);
  });
});

test.describe('form', () => {
  test('submits name only when ticked; Reset goes back to defaultChecked', async ({ page }) => {
    await gotoStory(page, STORY('in-form'));
    const news = page.getByRole('checkbox', { name: 'Newsletter' });
    const terms = page.getByRole('checkbox', { name: 'Terms' });
    await expect(news).toBeChecked();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('form')).toHaveAttribute('data-submitted', '["news"]');
    await news.click();
    await terms.click();
    await expect(news).not.toBeChecked();
    await expect(terms).toBeChecked();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('form')).toHaveAttribute('data-submitted', '["terms"]');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(news).toBeChecked();
    await expect(terms).not.toBeChecked();
  });
});

test.describe('layout', () => {
  test('375px: the matrix and long labels do not overflow, the box stays on top of a wrapped label', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, STORY('field-messages'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    const long = page.getByRole('checkbox', { name: /Privacy/ });
    const label = page.locator('label', { has: long });
    const boxTop = (await long.boundingBox())!.y;
    const labelBox = (await label.boundingBox())!;
    expect(labelBox.height).toBeGreaterThan(48);
    expect(boxTop - labelBox.y).toBeLessThan(12);
    await gotoStory(page, STORY('state-matrix'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
  });
});

test.describe('accessibility', () => {
  for (const name of ['manual', 'state-matrix', 'field-messages', 'select-all']) {
    test(`${name}: no axe violations`, async ({ page }) => {
      await gotoStory(page, STORY(name));
      await expectNoA11yViolations(page);
    });
  }

  test('forced and invalid states: no axe violations', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'fieldState:forced;invalid:!true;required:!true');
    await expectNoA11yViolations(page);
  });
});
