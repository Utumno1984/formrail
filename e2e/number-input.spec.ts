import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass } from './helpers/story';

// NumberInput (#337): commit on blur/Enter, immediate steps, locale decimals, blocked states,
// wheel, native form, geometry. Driven against the Storybook stories `Forms/NumberInput`.
const QUANTITY = 'forms-numberinput--quantity';
const UNIT_PRICE = 'forms-numberinput--unit-price';
const NATIVE_FORM = 'forms-numberinput--native-form';
const STATES = 'forms-numberinput--states';

const spin = (page: Page, name: string | RegExp = /Quantity/) => page.getByRole('spinbutton', { name });
const valueNow = (input: Locator) => input.getAttribute('aria-valuenow');

// The stories' play functions change the value: wait for them, then bring the field back to a known
// state through the UI (Quantity: 1, not focused; Unit price: empty, not focused).
async function openQuantity(page: Page, args?: string): Promise<Locator> {
  await expectPlayToPass(page, QUANTITY, args);
  const input = spin(page);
  await input.fill('1');
  await input.press('Enter');
  await input.blur();
  expect(await valueNow(input)).toBe('1');
  return input;
}

async function openUnitPrice(page: Page): Promise<Locator> {
  await expectPlayToPass(page, UNIT_PRICE);
  const input = spin(page, /Unit price/);
  await input.fill('');
  await input.press('Enter');
  await input.blur();
  expect(await valueNow(input)).toBeNull();
  return input;
}

test.describe('play functions and accessibility', () => {
  for (const story of [QUANTITY, UNIT_PRICE, NATIVE_FORM, STATES]) {
    test(`${story}: play passes, no axe violation`, async ({ page }) => {
      await expectPlayToPass(page, story);
      await expectNoA11yViolations(page);
    });
  }

  test('States: nothing overflows on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expectPlayToPass(page, STATES);
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
  });
});

test.describe('typing is a draft committed on blur / Enter', () => {
  test('it-IT: "12,5" changes nothing while typing, 12.5 on Tab; the text keeps the comma', async ({ page }) => {
    const input = await openUnitPrice(page);
    await input.click();
    await page.keyboard.type('12,');
    expect(await valueNow(input)).toBeNull();
    await page.keyboard.type('5');
    expect(await valueNow(input)).toBeNull();
    await page.keyboard.press('Tab');
    expect(await valueNow(input)).toBe('12.5');
    await expect(input).toHaveValue('12,5');
  });

  test('it-IT: "12.5" (keypad dot) is read the same way', async ({ page }) => {
    const input = await openUnitPrice(page);
    await input.fill('12.5');
    await input.press('Enter');
    expect(await valueNow(input)).toBe('12.5');
    await expect(input).toHaveValue('12,5');
  });

  test('en-US: "12.5" → 12.5', async ({ page }) => {
    // The play function only runs in it-IT: the field starts empty.
    await expectPlayToPass(page, UNIT_PRICE, 'locale:en-US');
    const input = spin(page, /Unit price/);
    await input.fill('12.5');
    await input.press('Tab');
    expect(await valueNow(input)).toBe('12.5');
    await expect(input).toHaveValue('12.5');
  });

  test('text that is not a number is restored on blur', async ({ page }) => {
    await openQuantity(page);
    const input = spin(page);
    await input.fill('abc');
    await expect(input).toHaveValue('abc');
    await input.press('Tab');
    await expect(input).toHaveValue('1');
    expect(await valueNow(input)).toBe('1');
  });

  test('limits: 150 → 100, -5 → 0; emptying gives an empty field', async ({ page }) => {
    await openQuantity(page);
    const input = spin(page);
    await input.fill('150');
    await input.press('Tab');
    await expect(input).toHaveValue('100');
    await input.fill('-5');
    await input.press('Enter');
    await expect(input).toHaveValue('0');
    await input.fill('');
    await input.press('Tab');
    await expect(input).toHaveValue('');
    expect(await valueNow(input)).toBeNull();
  });
});

test.describe('keyboard and steppers', () => {
  test('arrows, PageUp/PageDown, Home/End: immediate, within the limits, the page does not scroll', async ({ page }) => {
    await openQuantity(page);
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '3000px';
      document.body.append(spacer);
    });
    const input = spin(page);
    await input.focus();
    const steps: [string, string][] = [
      ['ArrowUp', '2'],
      ['ArrowDown', '1'],
      ['PageUp', '11'],
      ['PageDown', '1'],
      ['End', '100'],
      ['ArrowUp', '100'],
      ['Home', '0'],
      ['ArrowDown', '0'],
    ];
    for (const [key, expected] of steps) {
      await page.keyboard.press(key);
      expect(await valueNow(input), key).toBe(expected);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('a stepper click changes the value and leaves the focus on the input; disabled at the limit', async ({ page }) => {
    await openQuantity(page, 'max:3');
    const input = spin(page);
    await input.focus();
    const inc = page.getByRole('button', { name: 'Increase' });
    const dec = page.getByRole('button', { name: 'Decrease' });
    await inc.click();
    expect(await valueNow(input)).toBe('2');
    await expect(input).toBeFocused();
    await inc.click();
    expect(await valueNow(input)).toBe('3');
    await expect(inc).toBeDisabled();
    // A press on the disabled button changes nothing and does not take the focus off the input.
    await inc.click({ force: true });
    expect(await valueNow(input)).toBe('3');
    await expect(input).toBeFocused();
    await dec.click();
    expect(await valueNow(input)).toBe('2');
    await expect(input).toBeFocused();
  });

  test('a stepper click without focus does not move the focus to the button', async ({ page }) => {
    await openQuantity(page);
    await page.getByRole('button', { name: 'Increase' }).click();
    expect(await valueNow(spin(page))).toBe('2');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');
  });

  test('the steppers are out of the tab order', async ({ page }) => {
    await openQuantity(page);
    await spin(page).focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).not.toMatch(/Increase|Decrease/);
  });

  test('the stepper buttons offer a touch target of at least 24 × 24px, at the inline end (also in RTL)', async ({ page }) => {
    await openQuantity(page);
    const input = spin(page);
    const box = (await input.boundingBox())!;
    for (const name of ['Increase', 'Decrease']) {
      const b = (await page.getByRole('button', { name }).boundingBox())!;
      expect(b.width, name).toBeGreaterThanOrEqual(24);
      expect(b.height, name).toBeGreaterThanOrEqual(24);
      expect(b.x, `${name} on the right in LTR`).toBeGreaterThan(box.x + box.width / 2);
    }
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    const rtl = (await input.boundingBox())!;
    for (const name of ['Increase', 'Decrease']) {
      const b = (await page.getByRole('button', { name }).boundingBox())!;
      expect(b.x + b.width, `${name} on the left in RTL`).toBeLessThan(rtl.x + rtl.width / 2);
    }
  });
});

test.describe('touch @touch', () => {
  test('tapping a stepper steps once and does not focus the button', async ({ page }) => {
    await openQuantity(page);
    await page.getByRole('button', { name: 'Increase' }).tap();
    expect(await valueNow(spin(page))).toBe('2');
    await page.getByRole('button', { name: 'Decrease' }).tap();
    await page.getByRole('button', { name: 'Decrease' }).tap();
    expect(await valueNow(spin(page))).toBe('0');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BUTTON');
  });
});

test.describe('the mouse wheel', () => {
  for (const focused of [false, true]) {
    test(`never changes the value (${focused ? 'focused' : 'not focused'}) and the page scrolls`, async ({ page }) => {
      await openQuantity(page);
      await page.evaluate(() => {
        const spacer = document.createElement('div');
        spacer.style.height = '3000px';
        document.body.append(spacer);
      });
      const input = spin(page);
      if (focused) await input.focus();
      await input.hover();
      await page.mouse.wheel(0, 400);
      await page.waitForFunction(() => window.scrollY > 0);
      await page.mouse.wheel(0, -100);
      expect(await valueNow(input)).toBe('1');
      await expect(input).toHaveValue('1');
    });
  }
});

test.describe('forced / locked / disabled', () => {
  for (const state of ['forced', 'locked'] as const) {
    test(`${state}: focusable; typing, paste, keys and steppers change nothing`, async ({ page }) => {
      // The play function does nothing when the Field is not `default`: the value stays 1.
      await expectPlayToPass(page, QUANTITY, `fieldState:${state}`);
      const input = spin(page);
      await expect(input).toHaveAttribute('aria-readonly', 'true');
      await expect(input).toHaveAccessibleDescription(/Set by the framework agreement\./);
      await input.click();
      await expect(input).toBeFocused();
      await page.keyboard.type('9');
      // Text insertion as a paste / IME commit does it (no key events).
      await page.keyboard.insertText('7');
      for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Enter']) await page.keyboard.press(key);
      for (const name of ['Increase', 'Decrease']) {
        const button = page.getByRole('button', { name });
        await expect(button).toBeDisabled();
        await button.click({ force: true });
      }
      await page.keyboard.press('Tab');
      await expect(input).toHaveValue('1');
      expect(await valueNow(input)).toBe('1');
      await expectFocusRingVisible(input);
    });
  }

  test('disabled: out of the tab order, steppers disabled', async ({ page }) => {
    await expectPlayToPass(page, QUANTITY, 'fieldState:disabled');
    await expect(spin(page)).toBeDisabled();
    await page.mouse.click(1, 1);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).not.toBe('spinbutton');
    for (const name of ['Increase', 'Decrease']) await expect(page.getByRole('button', { name })).toBeDisabled();
  });
});

test.describe('native form', () => {
  test('FormData gets the canonical "12.5" in it-IT; reset restores the default without a change', async ({ page }) => {
    // The play function submits and resets: the field is back to its default (2) when it ends.
    await expectPlayToPass(page, NATIVE_FORM);
    const input = spin(page, 'Quantity');
    await expect(input).toHaveValue('2');
    await input.fill('12,5');
    await input.press('Tab');
    const formValue = () => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('quantity'));
    expect(await formValue()).toBe('12.5');
    await expect(input).toHaveValue('12,5');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(input).toHaveValue('2');
    expect(await formValue()).toBe('2');
    // The field is still live after a reset.
    await input.focus();
    await page.keyboard.press('ArrowUp');
    await expect(input).toHaveValue('2,5');
    expect(await formValue()).toBe('2.5');
  });
});

test.describe('geometry', () => {
  test('the control keeps its width: empty, with a value, at the limit; focus ring visible', async ({ page }) => {
    await openQuantity(page);
    const input = spin(page);
    const root = input.locator('..');
    const width = async () => (await root.boundingBox())!.width;
    const withValue = await width();
    await input.fill('');
    await input.press('Tab');
    const empty = await width();
    await input.focus();
    await page.keyboard.press('End');
    const atMax = await width();
    expect(empty).toBe(withValue);
    expect(atMax).toBe(withValue);
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    await expectFocusRingVisible(input);
  });

  test('a long value is clipped inside the input, never under the steppers', async ({ page }) => {
    await openQuantity(page, 'max:1000000000000');
    const input = spin(page);
    await input.fill('123456789012');
    await input.press('Tab');
    const { paddingEnd, steppers } = await input.evaluate((el) => {
      const cs = getComputedStyle(el);
      const group = el.nextElementSibling as HTMLElement;
      return { paddingEnd: parseFloat(cs.paddingRight), steppers: group.getBoundingClientRect().width };
    });
    expect(paddingEnd).toBeGreaterThanOrEqual(steppers);
  });
});
