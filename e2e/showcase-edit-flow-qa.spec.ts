import { expect, test, type Locator, type Page } from '@playwright/test';

// #151 QA: gaps not covered by showcase-edit-flow.spec.ts.
const FIXTURE = 'showcase-invoices--edit-flow-manual';
const LIST_QUERY = 'filter=open&q=FT-2026-00&sort=amount.desc';
const table = (page: Page): Locator => page.getByRole('table', { name: /Invoices/ });
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const amountInput = (page: Page): Locator => page.getByRole('textbox', { name: /Amount/ });
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const dialogOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
const stored = (page: Page): Promise<string> =>
  page.evaluate(() =>
    JSON.stringify((window as unknown as { __ropShowcaseStore: { snapshot: () => unknown } }).__ropShowcaseStore.snapshot()),
  );

async function openList(page: Page, args = '', query = LIST_QUERY): Promise<void> {
  await page.goto(`/iframe.html?id=${FIXTURE}&viewMode=story&${query}${args ? `&args=${encodeURIComponent(args)}` : ''}`);
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
}
async function openRecord(page: Page, n: number): Promise<string> {
  const number = (await page.locator('a[data-record-id]').nth(n).innerText()).trim();
  await page.getByRole('link', { name: number, exact: true }).click();
  await expect(amountInput(page)).toBeVisible();
  return number;
}

test.describe('EditFlow QA', () => {
  test('double Save click saves once', async ({ page }) => {
    await openList(page, 'saveDelayMs:600');
    await openRecord(page, 2);
    await amountInput(page).fill('777');
    await footer(page).getByRole('button', { name: 'Save' }).dblclick();
    await expect(footer(page)).toHaveCount(0);
    await expect(amountInput(page)).toHaveValue('777.00');
  });

  test('save error then footer Discard resets; Back needs no Dialog', async ({ page }) => {
    await openList(page, 'saveOutcome:error');
    await openRecord(page, 1);
    await amountInput(page).fill('5');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toContainText('Could not save');
    await footer(page).getByRole('button', { name: 'Discard' }).click();
    await expect(footer(page)).toHaveCount(0);
    await back(page).click();
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(table(page)).toBeVisible();
  });

  test('save in flight + Back: save lands, value normalized, form clean', async ({ page }) => {
    await openList(page, 'saveDelayMs:800');
    await openRecord(page, 2);
    await amountInput(page).fill('12.5');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await back(page).click();
    await dialogOf(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(amountInput(page)).toHaveValue('12.50');
    await expect(footer(page)).toHaveCount(0);
  });

  test('sort asc: edited row moves away from the top after save', async ({ page }) => {
    await openList(page, '', 'filter=open&sort=amount.asc');
    const number = await openRecord(page, 0);
    await amountInput(page).fill('999999');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toHaveCount(0);
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('row').nth(1)).not.toContainText(number);
  });

  test('invalid amount: Save blocked, store unchanged, Back asks', async ({ page }) => {
    await openList(page);
    await openRecord(page, 1);
    const before = await stored(page);
    await amountInput(page).fill('abc');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    expect(await stored(page)).toBe(before);
    await back(page).click();
    await expect(dialogOf(page)).toBeVisible();
  });

  test.describe('mobile', () => {
    test.use({ viewport: { width: 375, height: 667 } });
    test('round trip on a narrow viewport: Dialog fits, no horizontal overflow', async ({ page }) => {
      await openList(page);
      const number = await openRecord(page, 2);
      await amountInput(page).fill('321');
      await back(page).click();
      const box = await dialogOf(page).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
      await dialogOf(page).getByRole('button', { name: 'Keep editing' }).click();
      await footer(page).getByRole('button', { name: 'Save' }).click();
      await expect(footer(page)).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      await back(page).click();
      await expect(table(page)).toBeVisible();
      await expect(page.getByRole('link', { name: number, exact: true })).toBeVisible();
    });
  });
});
