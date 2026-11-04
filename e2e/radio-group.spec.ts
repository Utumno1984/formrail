import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-radiogroup--${name}`;
const radio = (page: Page, name: string): Locator => page.getByRole('radio', { name, exact: true });
const group = (page: Page): Locator => page.getByRole('radiogroup');
const calls = (page: Page) => page.getByTestId('calls');
const checkedValue = (page: Page) =>
  group(page).evaluate((g) => (g.querySelector('input:checked') as HTMLInputElement | null)?.value ?? null);

test.describe('Forms/RadioGroup: stories play', () => {
  for (const name of ['playground', 'async-hydration']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('mouse and keyboard (default)', () => {
  test('clicking a radio or its label selects it; the Field label changes nothing', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    expect(await checkedValue(page)).toBe('free');
    await radio(page, 'Business').click();
    expect(await checkedValue(page)).toBe('business');
    await page.getByText('Free', { exact: true }).click();
    expect(await checkedValue(page)).toBe('free');
    await page.locator('label', { hasText: /^Plan$/ }).click();
    expect(await checkedValue(page)).toBe('free');
  });

  test('Tab enters on the selected radio, arrows select skipping the disabled one, Tab leaves', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await page.keyboard.press('Tab');
    await expect(radio(page, 'Free')).toBeFocused();
    await expectFocusRingVisible(radio(page, 'Free'));
    await page.keyboard.press('ArrowDown');
    await expect(radio(page, 'Business')).toBeFocused();
    await expect(radio(page, 'Business')).toBeChecked();
    await page.keyboard.press('ArrowDown');
    await expect(radio(page, 'Enterprise')).toBeChecked();
    await page.keyboard.press('ArrowDown');
    await expect(radio(page, 'Free')).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(radio(page, 'Free')).not.toBeFocused();
  });

  test('the Field id is on the radiogroup, never on an input', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const id = await group(page).getAttribute('id');
    expect(id).toBeTruthy();
    expect(await page.locator('input[type="radio"]').evaluateAll((els, v) => els.some((e) => e.id === v), id)).toBe(false);
  });

  test('each row is at least 24px tall', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const row = page.locator('label', { has: radio(page, 'Free') });
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  });
});

for (const state of ['forced', 'locked'] as const) {
  test.describe(state, () => {
    const args = `fieldState:${state}`;

    test('Tab reaches the selected radio, the reason is read, the focus ring is visible', async ({ page }) => {
      await gotoStory(page, STORY('manual'), args);
      await page.keyboard.press('Tab');
      await expect(radio(page, 'Free')).toBeFocused();
      await expect(group(page)).toHaveAttribute('aria-readonly', 'true');
      await expect(group(page)).toHaveAccessibleDescription(/Decided by the framework agreement/);
      await expectFocusRingVisible(radio(page, 'Free'));
    });

    test('controlled: real arrows and Space change nothing', async ({ page }) => {
      await gotoStory(page, STORY('manual'), args);
      await page.keyboard.press('Tab');
      for (const key of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Space', 'ArrowDown', 'Space']) {
        await page.keyboard.press(key);
        expect(await checkedValue(page)).toBe('free');
        await expect(radio(page, 'Free')).toBeFocused();
      }
    });

    test('controlled: clicks on a radio, an inline label and the Field label change nothing', async ({ page }) => {
      await gotoStory(page, STORY('manual'), args);
      await radio(page, 'Business').click();
      expect(await checkedValue(page)).toBe('free');
      await page.getByText('Enterprise', { exact: true }).click();
      expect(await checkedValue(page)).toBe('free');
      await page.locator('label', { hasText: /^Plan$/ }).click();
      expect(await checkedValue(page)).toBe('free');
      await radio(page, 'Business').click();
      expect(await checkedValue(page)).toBe('free');
    });

    test('uncontrolled: every gesture, twice, changes and reports nothing; then unlock and Reset work', async ({ page }) => {
      await gotoStory(page, STORY('uncontrolled-blocked'), args);
      const start = await checkedValue(page);
      expect(start).toBe('team');
      for (let round = 0; round < 2; round++) {
        await radio(page, 'Business').click();
        await page.getByText('Enterprise', { exact: true }).click();
        await page.locator('label', { hasText: /^Plan$/ }).click();
        await radio(page, 'Team').focus();
        for (const key of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'Space']) await page.keyboard.press(key);
        expect(await checkedValue(page)).toBe('team');
        await expect(calls(page)).toHaveText('[]');
      }
      await page.getByRole('button', { name: 'Unlock' }).click();
      await expect(group(page)).not.toHaveAttribute('aria-readonly', 'true');
      await radio(page, 'Business').click();
      expect(await checkedValue(page)).toBe('business');
      await radio(page, 'Enterprise').click();
      await expect(calls(page)).toHaveText('["business","enterprise"]');
      await page.getByRole('button', { name: 'Reset' }).click();
      await expect.poll(() => checkedValue(page)).toBe('team');
      await radio(page, 'Free').click();
      await expect(calls(page)).toHaveText('["business","enterprise","free"]');
    });
  });
}

test.describe('disabled', () => {
  test('out of the tab order and no click on radio or labels changes it', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'fieldState:disabled');
    for (const r of await page.getByRole('radio').all()) await expect(r).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio').first()).not.toBeFocused();
    // `force`: Playwright otherwise waits for a label of a disabled control to become enabled.
    await page.getByText('Business', { exact: true }).click({ force: true });
    await radio(page, 'Business').click({ force: true });
    await page.locator('label', { hasText: /^Plan$/ }).click({ force: true });
    expect(await checkedValue(page)).toBe('free');
  });
});

test.describe('form', () => {
  test('submits the selected value; Reset goes back to defaultValue', async ({ page }) => {
    await gotoStory(page, STORY('in-form'));
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('form')).toHaveAttribute('data-submitted', '[["plan","team"]]');
    await radio(page, 'Free').click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.locator('form')).toHaveAttribute('data-submitted', '[["plan","free"]]');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(radio(page, 'Team')).toBeChecked();
  });
});

test.describe('selected without colour and forced-colors', () => {
  test('the dot is displayed only on the selected radio', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const dots = () =>
      page.locator('input[type="radio"]').evaluateAll((els) =>
        els.map((e) => getComputedStyle(e.nextElementSibling as Element).display),
      );
    expect(await dots()).toEqual(['block', 'none', 'none', 'none']);
    await radio(page, 'Business').click();
    expect(await dots()).toEqual(['none', 'none', 'block', 'none']);
  });

  test('forced-colors: the selected radio has a visible dot, different from the border', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoStory(page, STORY('manual'));
    const info = await page.locator('input[type="radio"]:checked').evaluate((el) => {
      const dot = el.nextElementSibling as Element;
      const cs = getComputedStyle(dot);
      return { display: cs.display, bg: cs.backgroundColor, canvas: getComputedStyle(el).backgroundColor };
    });
    expect(info.display).toBe('block');
    expect(info.bg).not.toBe(info.canvas);
  });
});

test.describe('layout', () => {
  test('375px: five long options wrap without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, STORY('long-horizontal'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await gotoStory(page, STORY('state-matrix'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
  });
});

test.describe('accessibility', () => {
  for (const name of ['manual', 'state-matrix', 'long-horizontal']) {
    test(`${name}: no axe violations`, async ({ page }) => {
      await gotoStory(page, STORY(name));
      await expectNoA11yViolations(page);
    });
  }

  test('locked and invalid states: no axe violations', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'fieldState:locked;invalid:!true;required:!true');
    await expectNoA11yViolations(page);
  });
});
