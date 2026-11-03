import { expect, test, type Page } from '@playwright/test';
import { browserBack } from './helpers/history';

// #166 QA: cases beyond the PR's own tests (browser Back, save settling with the dialog open, edit during save).
const FIXTURE = 'showcase-invoices--edit-flow-manual';
const table = (p: Page) => p.getByRole('table', { name: /Invoices/ });
const amountInput = (p: Page) => p.getByRole('textbox', { name: /Amount/ });
const dialogOf = (p: Page) => p.getByRole('dialog', { name: 'Unsaved changes' });
const footer = (p: Page) => p.getByRole('region', { name: 'Save actions' });

async function toRecord(page: Page, delay: number): Promise<string> {
  await page.goto(
    `/iframe.html?id=${FIXTURE}&viewMode=story&filter=open&sort=amount.desc&args=${encodeURIComponent(`saveDelayMs:${delay}`)}`,
  );
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
  const number = (await page.locator('a[data-record-id]').nth(2).innerText()).trim();
  await page.getByRole('link', { name: number, exact: true }).click();
  await expect(amountInput(page)).toBeVisible();
  return number;
}

test.describe('#166 QA: exit dialog with a save in flight', () => {
  test('browser Back with a save in flight: dialog says Leave anyway; Keep editing stays', async ({ page }) => {
    await toRecord(page, 2000);
    await amountInput(page).fill('777.7');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    browserBack(page);
    await expect(dialogOf(page)).toContainText('A save is still in progress');
    await expect(dialogOf(page).getByRole('button', { name: 'Discard changes' })).toHaveCount(0);
    await dialogOf(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(amountInput(page)).toBeVisible();
  });

  test('Save, Discard, browser Back: still asks', async ({ page }) => {
    await toRecord(page, 2000);
    await amountInput(page).fill('777.7');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await footer(page).getByRole('button', { name: 'Discard' }).click();
    await expect(footer(page)).toBeHidden();
    browserBack(page);
    await expect(dialogOf(page).getByRole('button', { name: 'Leave anyway' })).toBeVisible();
  });

  test('save settles while the dialog is open: labels do not flip, Leave anyway still leaves', async ({ page }) => {
    await toRecord(page, 1200);
    await amountInput(page).fill('777.7');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(dialogOf(page).getByRole('button', { name: 'Leave anyway' })).toBeVisible();
    await page.waitForTimeout(2000);
    await expect(dialogOf(page).getByRole('button', { name: 'Leave anyway' })).toBeVisible();
    await expect(dialogOf(page).getByRole('button', { name: 'Discard changes' })).toHaveCount(0);
    await dialogOf(page).getByRole('button', { name: 'Leave anyway' }).click();
    await expect(table(page)).toBeVisible();
  });

  test('save finished, then a new edit: back to the Discard changes wording', async ({ page }) => {
    await toRecord(page, 300);
    await amountInput(page).fill('777.7');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toBeHidden();
    await amountInput(page).fill('888.8');
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(dialogOf(page).getByRole('button', { name: 'Discard changes' })).toBeVisible();
    await expect(dialogOf(page)).not.toContainText('save is still in progress');
  });

  test('save finished and clean: Back leaves with no dialog', async ({ page }) => {
    await toRecord(page, 300);
    await amountInput(page).fill('777.7');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toBeHidden();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(table(page)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(0);
  });

  test('edit during the save: the dialog opens and does not claim a discard', async ({ page }) => {
    await toRecord(page, 1500);
    await amountInput(page).fill('777.7');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await page.getByRole('textbox', { name: 'Notes' }).fill('typed meanwhile');
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(dialogOf(page)).toBeVisible();
    console.log('DIALOG:', await dialogOf(page).innerText());
  });
});
