import { expect, test } from '@playwright/test';

// The Introduction page is dogfooded (ticket #275): the examples are real library components and must
// work, not just compile.

test.describe('Introduction page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/iframe.html?id=introduction--docs&viewMode=docs');
    await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
  });

  test('List Report demo: a filter narrows the rows', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(page.getByRole('row', { name: /INV-1001/ })).toBeVisible();
    await page.getByRole('radio', { name: 'Approved', exact: true }).click();
    await expect(page.getByRole('row', { name: /INV-1001/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /INV-1002/ })).toBeVisible();
  });

  test('dirty tracking demo: edit makes it dirty, restoring the baseline makes it clean', async ({ page }) => {
    const field = page.getByRole('textbox', { name: 'Supplier' });
    await expect(page.getByText('No changes', { exact: true })).toBeVisible();
    await field.fill('Northwind Components X');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await field.fill('Northwind Components');
    await expect(page.getByText('No changes', { exact: true })).toBeVisible();
  });

  test('field states demo: locked field is focusable with a described reason, disabled is not', async ({ page }) => {
    const locked = page.getByRole('textbox', { name: 'Approver' });
    await locked.focus();
    await expect(locked).toBeFocused();
    await expect(locked).toHaveAccessibleDescription(/permission/);
    await expect(page.getByRole('textbox', { name: 'Cost center' })).toBeDisabled();
  });

  test('theme override demo: the overridden wrapper changes the primary button colour', async ({ page }) => {
    const defaultBg = await page
      .getByRole('button', { name: 'Primary action' })
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const themedBg = await page
      .getByTestId('theme-override')
      .getByRole('button', { name: 'Primary action' })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(themedBg).not.toBe(defaultBg);
  });

  test('links to the Tokens page and the floorplans are present', async ({ page }) => {
    await expect(page.locator('a[href*="foundations-tokens--docs"]').first()).toBeVisible();
    await expect(page.locator('a[href*="floorplans-list-report--docs"]').first()).toBeVisible();
  });
});
