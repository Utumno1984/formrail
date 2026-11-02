import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `floorplans-object-page-validation--${name}`;

const save = (page: Page) => page.getByRole('button', { name: 'Save' });
const supplierOf = (page: Page) => page.getByRole('textbox', { name: 'Supplier' });
const countryOf = (page: Page) => page.getByRole('combobox', { name: 'Country' });
const cityOf = (page: Page) => page.getByRole('combobox', { name: 'City' });

/** Every id in aria-describedby points to a node that exists, and the ids of the error, if any. */
const describedBy = (control: Locator) =>
  control.evaluate((el) => {
    const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    return { ids, allExist: ids.every((id) => !!document.getElementById(id)), errorIds: ids.filter((id) => id.endsWith('-error')) };
  });

const top = (locator: Locator) => locator.evaluate((el) => el.getBoundingClientRect().top);

test.describe('ValidationProvider: stories', () => {
  for (const name of ['with-validation', 'explicit-error-wins', 'without-provider']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('ValidationProvider in a real browser', () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test('Save with nothing filled in: a message and aria-invalid on each field, the focus on the first one', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    for (const control of [supplierOf(page), countryOf(page), cityOf(page)]) {
      await expect(control).not.toHaveAttribute('aria-invalid');
    }
    await save(page).click();
    await expect(supplierOf(page)).toBeFocused();
    for (const [control, message] of [
      [supplierOf(page), 'Supplier is required'],
      [countryOf(page), 'Country is required'],
      [cityOf(page), 'City is required'],
    ] as const) {
      await expect(control).toHaveAttribute('aria-invalid', 'true');
      await expect(control).toHaveAccessibleDescription(message);
      await expect(page.getByText(message)).toBeVisible();
      const d = await describedBy(control);
      expect(d.allExist).toBe(true);
      expect(d.errorIds).toHaveLength(1);
    }
    // The validation message stays on the fields: the footer has no message.
    await expect(page.locator('[data-object-page-footer-message]')).toBeEmpty();
    await expectNoA11yViolations(page);
  });

  test('the explicit error of a Field wins over the provider (args)', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'countryError:Not served');
    await expect(countryOf(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(countryOf(page)).toHaveAccessibleDescription('Not served');
    await save(page).click();
    await expect(supplierOf(page)).toBeFocused();
    await expect(countryOf(page)).toHaveAccessibleDescription('Not served');
    await expect(page.getByText('Country is required')).toHaveCount(0);
    await expect(supplierOf(page)).toHaveAccessibleDescription('Supplier is required');
  });

  test('without the provider, errors passed by hand with error= give the same messages and focus', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'withProvider:!false');
    await save(page).click();
    await expect(supplierOf(page)).toBeFocused();
    await expect(supplierOf(page)).toHaveAccessibleDescription('Supplier is required');
    await expect(cityOf(page)).toHaveAccessibleDescription('City is required');
  });

  test('the error appears and goes away with the field focused: the control does not move, describedby stays coherent', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const supplier = supplierOf(page);
    const countryLabel = page.locator('label', { hasText: 'Country' });
    const before = { control: await top(supplier), next: await top(countryLabel) };

    await save(page).click();
    await expect(supplier).toBeFocused();
    const message = page.getByText('Supplier is required').locator('xpath=ancestor::div[1]');
    await expect(message).toBeVisible();
    const messageBox = await message.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { height: r.height, marginTop: parseFloat(getComputedStyle(el).marginTop), top: r.top };
    });
    const invalid = { control: await top(supplier), next: await top(countryLabel) };
    // The control stays where it was; the next field moves down only by what the message needs
    // beyond the reserved one-line room (#140: a one-line message moves nothing).
    const reserved = 16 + 4; // caption line + gap
    expect(Math.abs(invalid.control - before.control)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(invalid.next - before.next - Math.max(0, messageBox.height + messageBox.marginTop - reserved))).toBeLessThanOrEqual(1);
    let d = await describedBy(supplier);
    expect(d.allExist).toBe(true);
    expect(d.errorIds).toHaveLength(1);

    // Typing clears only the error of the field written (per-path clearing, #102): Country keeps its.
    await page.keyboard.type('A');
    await expect(supplier).toBeFocused();
    await expect(supplier).not.toHaveAttribute('aria-invalid');
    await expect(page.getByText('Supplier is required')).toHaveCount(0);
    await expect(countryOf(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(countryOf(page)).toHaveAccessibleDescription('Country is required');
    d = await describedBy(supplier);
    expect(d.allExist).toBe(true);
    expect(d.errorIds).toHaveLength(0);
    const after = { control: await top(supplier), next: await top(countryLabel) };
    expect(Math.abs(after.control - before.control)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(after.next - before.next)).toBeLessThanOrEqual(0.5);
  });

  test('filling in the first field and saving again moves the focus to the next invalid one (a Select)', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await supplierOf(page).fill('ACME srl');
    await save(page).click();
    await expect(countryOf(page)).toBeFocused();
    await expect(supplierOf(page)).not.toHaveAttribute('aria-invalid');
    await expect(countryOf(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(cityOf(page)).toHaveAttribute('aria-invalid', 'true');
  });
});
