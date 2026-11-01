import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

const PREFIX = 'floorplans-object-page-schema-validation--';
const WITH_SCHEMA = `${PREFIX}with-schema`;
const ROOT_RULE = `${PREFIX}whole-object-rule`;
const ASYNC = `${PREFIX}async-schema-unsupported`;
// Same story without a play function: the tests themselves type and click Save.
const NO_PLAY = `${PREFIX}with-schema-no-play`;

const footer = (page: Page) => page.getByRole('region', { name: 'Save actions' });
const save = (page: Page) => footer(page).getByRole('button', { name: 'Save' });

test.describe('useObjectPageForm({ schema }): stories', () => {
  for (const id of [WITH_SCHEMA, ROOT_RULE, ASYNC]) {
    test(`${id}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, id);
    });
  }
});

test.describe('useObjectPageForm({ schema }): behavior in a real browser', () => {
  test('Save with nothing filled in: a message on each invalid field (nested path included), focus on the first, footer clean', async ({
    page,
  }) => {
    await gotoStory(page, NO_PLAY);
    await save(page).click();
    await expect(page.getByLabel('Supplier')).toBeFocused();
    await expect(page.getByText('Supplier is required')).toBeVisible();
    await expect(page.getByText('Amount must be a positive number')).toBeAttached();
    await expect(page.getByText('City is required')).toBeAttached();
    for (const label of ['Supplier', 'Amount', 'City']) {
      await expect(page.getByLabel(label)).toHaveAttribute('aria-invalid', 'true');
    }
    await expect(page.getByLabel('City')).toHaveAttribute('data-rop-name', 'address.city');
    // A schema failure is not a save error: the footer carries no message, and no issue JSON leaks.
    await expect(footer(page)).toHaveText(/^\s*Save\s*Discard changes\s*$/);
    await expect(page.locator('body')).not.toContainText(/too_small|"code"|"path"/);
    await expect(page.getByTestId('form-errors')).toHaveCount(0);
  });

  test('only the nested field left empty: the focus scrolls to City in the second section', async ({ page }) => {
    await gotoStory(page, NO_PLAY);
    await page.getByLabel('Supplier').fill('ACME Ltd');
    await page.getByLabel('Amount').fill('120');
    await save(page).click();
    await expect(page.getByLabel('City')).toBeFocused();
    await expect(page.getByLabel('City')).toBeInViewport();
    await expect(page.getByText('City is required')).toBeVisible();
    await expect(page.getByLabel('Supplier')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('typing clears the errors; with everything valid the save goes through', async ({ page }) => {
    await gotoStory(page, NO_PLAY);
    await save(page).click();
    await expect(page.getByLabel('Supplier')).toBeFocused();
    await page.keyboard.type('ACME Ltd');
    await expect(page.getByText('Supplier is required')).toHaveCount(0);
    await page.getByLabel('Amount').fill('120');
    await page.getByLabel('City').fill('Milan');
    await save(page).click();
    await expect(page.getByTestId('saved')).toHaveText('Saved 1 time(s).');
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  });

  test('a rule on the whole object: formErrors in the strip, no field marked invalid, no save', async ({ page }) => {
    await gotoStory(page, NO_PLAY, 'schema:fields-and-root-rule;initial:filled');
    await save(page).click();
    await expect(page.getByTestId('form-errors')).toContainText('Orders shipped to Rome above 1000 need a manager approval.');
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(page.getByTestId('saved')).toHaveText('');
    await expect(footer(page)).toHaveText(/^\s*Save\s*Discard changes\s*$/);
  });

  test('an asynchronous schema: an explicit save error in the footer at once, never stuck saving', async ({ page }) => {
    // The development-only `console.error` is covered by the unit tests (the static Storybook build
    // may run in production mode).
    await gotoStory(page, NO_PLAY, 'schema:async;initial:filled');
    await save(page).click();
    await expect(footer(page)).toContainText('asynchronous schema not supported');
    await expect(save(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('saved')).toHaveText('');
  });
});
