import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-checkbox--${name}`;
const checkbox = (page: Page): Locator => page.getByRole('checkbox');

test.describe('Forms/Checkbox: stories play', () => {
  for (const name of ['playground', 'select-all', 'async-hydration', 'uncontrolled-blocked-walkthrough']) {
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

const GESTURES: Array<[string, (page: Page) => Promise<void>]> = [
  ['click on the box', async (page) => checkbox(page).click()],
  ['click on the inline label', async (page) => page.getByText('I accept the terms and conditions').click()],
  ['click on the Field label', async (page) => page.locator('label', { hasText: /^Terms$/ }).click()],
  [
    'Space',
    async (page) => {
      await checkbox(page).focus();
      await page.keyboard.press('Space');
    },
  ],
];
const calls = (page: Page) => page.getByTestId('calls');

for (const state of ['forced', 'locked'] as const) {
  test.describe(`${state}`, () => {
    test('Tab reaches it, aria-readonly, described by the reason, focus ring visible', async ({ page }) => {
      await gotoStory(page, STORY('manual'), `fieldState:${state};checked:!true`);
      const box = checkbox(page);
      await page.keyboard.press('Tab');
      await expect(box).toBeFocused();
      await expect(box).toHaveAttribute('aria-readonly', 'true');
      await expect(box).toHaveAccessibleDescription(/Decided by the framework agreement/);
      await expectFocusRingVisible(box);
    });

    for (const initial of [true, false]) {
      for (const [name, gesture] of GESTURES) {
        const start = initial ? 'checked' : 'unchecked';
        test(`controlled, ${name}, starting ${start}: state unchanged`, async ({ page }) => {
          await gotoStory(page, STORY('manual'), `fieldState:${state};checked:!${initial}`);
          await expect(checkbox(page)).toBeChecked({ checked: initial });
          await gesture(page);
          await expect(checkbox(page)).toBeChecked({ checked: initial });
          await gesture(page);
          await expect(checkbox(page)).toBeChecked({ checked: initial });
        });

        test(`uncontrolled, ${name}, starting ${start}: state unchanged and nothing reported`, async ({ page }) => {
          await gotoStory(page, STORY('uncontrolled-blocked'), `fieldState:${state};checked:!${initial}`);
          await expect(checkbox(page)).toBeChecked({ checked: initial });
          await gesture(page);
          await expect(checkbox(page)).toBeChecked({ checked: initial });
          await gesture(page);
          await expect(checkbox(page)).toBeChecked({ checked: initial });
          await expect(calls(page)).toHaveText('[]');
        });
      }
    }

    test(`uncontrolled: after blocked gestures and unlocking, a normal click toggles and reports`, async ({ page }) => {
      await gotoStory(page, STORY('uncontrolled-blocked'), `fieldState:${state}`);
      for (const [, gesture] of GESTURES) await gesture(page);
      await expect(checkbox(page)).not.toBeChecked();
      await page.getByRole('button', { name: 'Unlock' }).click();
      await expect(checkbox(page)).not.toHaveAttribute('aria-readonly', 'true');
      await checkbox(page).click();
      await expect(checkbox(page)).toBeChecked();
      await expect(calls(page)).toHaveText('[true]');
      await checkbox(page).click();
      await expect(checkbox(page)).not.toBeChecked();
      await expect(calls(page)).toHaveText('[true,false]');
    });
  });
}

test.describe('uncontrolled in a form', () => {
  test('after Reset the next click still reports', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'));
    await page.getByRole('button', { name: 'Unlock' }).click();
    await checkbox(page).click();
    await expect(calls(page)).toHaveText('[true]');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(checkbox(page)).not.toBeChecked();
    await checkbox(page).click();
    await expect(checkbox(page)).toBeChecked();
    await expect(calls(page)).toHaveText('[true,true]');
  });
});

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

test.describe('forced-colors', () => {
  test('checked and indeterminate have a visible, mutually exclusive mark', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoStory(page, STORY('state-matrix'));
    const read = async (name: string) =>
      page
        .locator('label', { hasText: new RegExp(`^${name} / default$`) })
        .locator('xpath=..')
        .evaluate((cell) => {
          const input = cell.querySelector('input')!;
          const bg = getComputedStyle(input).backgroundColor;
          return Array.from(cell.querySelectorAll('svg')).map((s) => {
            const cs = getComputedStyle(s);
            return { display: cs.display, differsFromBox: cs.color !== bg };
          });
        });
    const checked = await read('Checked');
    expect(checked.map((m) => m.display)).toEqual(['block', 'none']);
    expect(checked[0]!.differsFromBox).toBe(true);
    const mixed = await read('Indeterminate');
    expect(mixed.map((m) => m.display)).toEqual(['none', 'block']);
    expect(mixed[1]!.differsFromBox).toBe(true);
    expect((await read('Unchecked')).map((m) => m.display)).toEqual(['none', 'none']);
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

// #292: controlled in a form. The real Chromium Reset changes only the DOM; the box must keep showing
// the React state, report nothing for the reset, and the next real click must still report.
test.describe('controlled in a form (#292)', () => {
  test('Reset keeps the box aligned with the state, reports nothing, and the next click reports', async ({ page }) => {
    await gotoStory(page, STORY('controlled-in-form'));
    const box = checkbox(page);
    // The story's play already ran (on, Reset, off): it ends off with two calls. Drive it again by hand.
    await expect(calls(page)).toHaveText('[true,false]');
    await expect(box).not.toBeChecked();
    await box.click();
    await expect(box).toBeChecked();
    await expect(calls(page)).toHaveText('[true,false,true]');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByTestId('state')).toHaveText('true');
    await expect(box).toBeChecked();
    await expect(calls(page)).toHaveText('[true,false,true]');
    await box.click();
    await expect(box).not.toBeChecked();
    await expect(page.getByTestId('state')).toHaveText('false');
    await expect(calls(page)).toHaveText('[true,false,true,false]');
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

// #223: the UncontrolledBlocked Controls act on the DOM, and Lock / Unlock switch the Field state
// after mount (dashed <-> solid) without remounting the box.
test.describe('UncontrolledBlocked: Controls and Lock / Unlock', () => {
  const lockButton = (page: Page) => page.getByRole('button', { name: 'Lock', exact: true });
  const unlockButton = (page: Page) => page.getByRole('button', { name: 'Unlock', exact: true });
  const borderStyle = (page: Page) => checkbox(page).evaluate((el) => getComputedStyle(el).borderTopStyle);

  test('without arguments it starts locked; fieldState:default starts it editable', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'));
    await expect(checkbox(page)).toHaveAttribute('aria-readonly', 'true');
    await expect(page.getByTestId('field-state')).toHaveText('locked');
    await expect(lockButton(page)).toBeDisabled();
    await gotoStory(page, STORY('uncontrolled-blocked'), 'fieldState:default');
    await expect(checkbox(page)).not.toHaveAttribute('aria-readonly');
    await expect(page.getByTestId('field-state')).toHaveText('default');
    await expect(unlockButton(page)).toBeDisabled();
    await checkbox(page).click();
    await expect(checkbox(page)).toBeChecked();
    await expect(calls(page)).toHaveText('[true]');
  });

  test('invalid and required reach the box as aria-invalid and aria-required', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'), 'invalid:!true;required:!true');
    await expect(checkbox(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(checkbox(page)).toHaveAttribute('aria-required', 'true');
    await gotoStory(page, STORY('uncontrolled-blocked'));
    await expect(checkbox(page)).not.toHaveAttribute('aria-invalid');
    await expect(checkbox(page)).not.toHaveAttribute('aria-required');
  });

  test('fieldLabel is part of the accessible name', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'), 'fieldLabel:Consent');
    await expect(checkbox(page)).toHaveAccessibleName(/Consent/);
    await expect(page.locator('label', { hasText: /^Consent$/ })).toBeVisible();
  });

  test('Lock / Unlock alternate the dashed and the solid border; the value stays (no remount)', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'), 'fieldState:default');
    expect(await borderStyle(page)).toBe('solid');
    await checkbox(page).click();
    const node = await checkbox(page).elementHandle();
    await lockButton(page).click();
    await expect(checkbox(page)).toHaveAttribute('aria-readonly', 'true');
    expect(await borderStyle(page)).toBe('dashed');
    await expect(checkbox(page)).toBeChecked();
    expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
    await unlockButton(page).click();
    await expect(checkbox(page)).not.toHaveAttribute('aria-readonly');
    expect(await borderStyle(page)).toBe('solid');
    await expect(checkbox(page)).toBeChecked();
    await expect(calls(page)).toHaveText('[true]');
  });

  test('checked:!true mounts the box checked and reports nothing', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'), 'checked:!true');
    await expect(checkbox(page)).toBeChecked();
    await expect(calls(page)).toHaveText('[]');
  });

  test('checked:indeterminate is not valid uncontrolled: an explicit note, the box unchecked', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled-blocked'), 'checked:indeterminate');
    await expect(page.getByText('Indeterminate needs a controlled Checkbox (see Playground): showing unchecked.')).toBeVisible();
    await expect(checkbox(page)).not.toBeChecked();
  });
});
