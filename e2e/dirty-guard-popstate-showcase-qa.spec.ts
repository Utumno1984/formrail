import { expect, test } from '@playwright/test';
import { browserBack } from './helpers/history';

// #154 QA: the Invoices showcase (a mini router on history + popstate, registered BEFORE the page's guard).
test('showcase: browser Back with a dirty record opens the Unsaved changes dialog and keeps the record', async ({
  page,
}) => {
  await page.goto(
    '/iframe.html?id=showcase-invoices--edit-flow-manual&viewMode=story&filter=open&q=FT-2026-00&sort=amount.desc',
  );
  await expect(page.getByRole('table', { name: /Invoices/ })).toBeVisible();
  await page.locator('a[data-record-id]').nth(2).click();
  const amount = page.getByRole('textbox', { name: /Amount/ });
  await expect(amount).toBeVisible();
  await amount.fill('1234');
  browserBack(page);
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('record')).not.toBeNull();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(amount).toHaveValue('1234');
});
