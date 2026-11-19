import { expect, test, type Locator, type Page } from '@playwright/test';
import { browserBack } from './helpers/history';

// #525 (migration of e2e/showcase-edit-flow-qa.spec.ts, e2e/showcase-save-in-flight-qa.spec.ts and
// e2e/dirty-guard-popstate-showcase-qa.spec.ts from Showcase/Invoices to the sales orders). The invoice's "Amount" is the
// quantity of the first line, its "Open" pill is "Confirmed".
const FIXTURE = 'showcase-record-editing--sales-order-edit-flow-manual';
const LIST_QUERY = 'module=sales-orders&sales-orders.filter=confirmed&sales-orders.q=SO-2026&sales-orders.sort=total.desc';
const table = (page: Page): Locator => page.getByRole('table', { name: /Sales orders/ });
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const quantity = (page: Page): Locator => page.getByRole('textbox', { name: 'Line 1 quantity' });
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
  await expect(quantity(page)).toBeVisible();
  return number;
}
/** Opens the order at row `n` with a save that takes `delay` ms. */
async function toRecord(page: Page, delay: number, n = 2): Promise<string> {
  await openList(page, `saveDelayMs:${delay}`);
  return openRecord(page, n);
}

test.describe('Showcase/Record editing, orders: EditFlow QA (migrated from Showcase/Invoices)', () => {
  test('double Save click saves once', async ({ page }) => {
    await openList(page, 'saveDelayMs:600');
    await openRecord(page, 2);
    await quantity(page).fill('777');
    await footer(page).getByRole('button', { name: 'Save' }).dblclick();
    await expect(footer(page)).toHaveCount(0);
    await expect(quantity(page)).toHaveValue('777');
  });

  test('save error then footer Discard resets; Back needs no Dialog', async ({ page }) => {
    await openList(page, 'saveOutcome:error');
    await openRecord(page, 1);
    await quantity(page).fill('5');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toContainText('Could not save');
    await footer(page).getByRole('button', { name: 'Discard' }).click();
    await expect(footer(page)).toHaveCount(0);
    await back(page).click();
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(table(page)).toBeVisible();
  });

  test('save in flight + Back: save lands, value kept, form clean', async ({ page }) => {
    await openList(page, 'saveDelayMs:800');
    await openRecord(page, 2);
    await quantity(page).fill('125');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await back(page).click();
    await dialogOf(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(quantity(page)).toHaveValue('125');
    await expect(footer(page)).toHaveCount(0);
  });

  test('sort asc: edited row moves away from the top after save', async ({ page }) => {
    await openList(page, '', 'module=sales-orders&sales-orders.filter=confirmed&sales-orders.sort=total.asc');
    const number = await openRecord(page, 0);
    await quantity(page).fill('99999');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toHaveCount(0);
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('row').nth(1)).not.toContainText(number);
  });

  test('invalid quantity: Save blocked, store unchanged, Back asks', async ({ page }) => {
    await openList(page);
    await openRecord(page, 1);
    const before = await stored(page);
    await quantity(page).fill('abc');
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
      await quantity(page).fill('321');
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

test.describe('Showcase/Record editing, orders: #166 exit dialog with a save in flight (migrated from Showcase/Invoices)', () => {
  test('browser Back with a save in flight: dialog says Leave anyway; Keep editing stays', async ({ page }) => {
    await toRecord(page, 2000);
    await quantity(page).fill('777');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    browserBack(page);
    await expect(dialogOf(page)).toContainText('A save is still in progress');
    await expect(dialogOf(page).getByRole('button', { name: 'Discard changes' })).toHaveCount(0);
    await dialogOf(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(quantity(page)).toBeVisible();
  });

  test('Save, Discard, browser Back: still asks', async ({ page }) => {
    await toRecord(page, 2000);
    await quantity(page).fill('777');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await footer(page).getByRole('button', { name: 'Discard' }).click();
    await expect(footer(page)).toBeHidden();
    browserBack(page);
    await expect(dialogOf(page).getByRole('button', { name: 'Leave anyway' })).toBeVisible();
  });

  test('save settles while the dialog is open: labels do not flip, Leave anyway still leaves', async ({ page }) => {
    await toRecord(page, 1200);
    await quantity(page).fill('777');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await back(page).click();
    await expect(dialogOf(page).getByRole('button', { name: 'Leave anyway' })).toBeVisible();
    await page.waitForTimeout(2000);
    await expect(dialogOf(page).getByRole('button', { name: 'Leave anyway' })).toBeVisible();
    await expect(dialogOf(page).getByRole('button', { name: 'Discard changes' })).toHaveCount(0);
    await dialogOf(page).getByRole('button', { name: 'Leave anyway' }).click();
    await expect(table(page)).toBeVisible();
  });

  test('save finished, then a new edit: back to the Discard changes wording', async ({ page }) => {
    await toRecord(page, 300);
    await quantity(page).fill('777');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toBeHidden();
    await quantity(page).fill('888');
    await back(page).click();
    await expect(dialogOf(page).getByRole('button', { name: 'Discard changes' })).toBeVisible();
    await expect(dialogOf(page)).not.toContainText('save is still in progress');
  });

  test('save finished and clean: Back leaves with no dialog', async ({ page }) => {
    await toRecord(page, 300);
    await quantity(page).fill('777');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toBeHidden();
    await page.waitForTimeout(500);
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(0);
  });

  test('edit during the save: the dialog opens and does not claim a discard', async ({ page }) => {
    await toRecord(page, 1500);
    await quantity(page).fill('777');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await page.getByRole('textbox', { name: 'Notes' }).fill('typed meanwhile');
    await back(page).click();
    await expect(dialogOf(page)).toBeVisible();
    await expect(dialogOf(page)).toContainText('made after pressing Save');
    await expect(dialogOf(page).getByRole('button', { name: 'Discard newer changes' })).toBeVisible();
    await expect(dialogOf(page).getByRole('button', { name: 'Leave anyway' })).toHaveCount(0);
  });
});

test.describe('Showcase/Record editing, orders: #154 the mini router and the guard (migrated from Showcase/Invoices)', () => {
  test('browser Back with a dirty record opens the Unsaved changes dialog and keeps the record', async ({ page }) => {
    await openList(page);
    await openRecord(page, 2);
    await quantity(page).fill('1234');
    browserBack(page);
    await expect(dialogOf(page)).toBeVisible();
    expect(new URL(page.url()).searchParams.get('record')).not.toBeNull();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(quantity(page)).toHaveValue('1234');
  });
});
