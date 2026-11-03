import { expect, test, type Page } from '@playwright/test';

// #150 QA: extra edge cases around the list <-> record navigation.
const FIXTURE = 'showcase-invoices--list-to-record-manual';
const url = (q = '') => `/iframe.html?id=${FIXTURE}&viewMode=story${q ? `&${q}` : ''}`;
const withArgs = (q: string, args: string) => `${url(q)}&args=${encodeURIComponent(args)}`;
const table = (p: Page) => p.getByRole('table', { name: /Invoices/ });
const back = (p: Page) => p.getByRole('button', { name: 'Back to list' });
const params = (p: Page) => new URL(p.url()).searchParams;
const bodyFocused = (p: Page) => p.evaluate(() => document.activeElement === document.body);

test.describe('Showcase/Invoices ListToRecord QA', () => {
  test('middle click does not navigate in-page', async ({ page, context }) => {
    await page.goto(url('filter=open'));
    await expect(table(page)).toBeVisible();
    const popup = context.waitForEvent('page', { timeout: 3000 }).catch(() => null);
    await page.getByRole('link', { name: 'FT-2026-0012', exact: true }).click({ button: 'middle' });
    (await popup)?.close();
    expect(params(page).get('record')).toBeNull();
    await expect(table(page)).toBeVisible();
  });

  test('reload on the record page, then Back to list returns to the list with the parameters', async ({ page }) => {
    await page.goto(url('filter=open&q=FT-2026-00&sort=amount.desc'));
    await expect(table(page)).toBeVisible();
    await page.getByRole('link', { name: 'FT-2026-0012', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /FT-2026-0012/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: /FT-2026-0012/ })).toBeVisible();
    await back(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('record')).toBeNull();
    expect(params(page).get('filter')).toBe('open');
    expect(params(page).get('sort')).toBe('amount.desc');
    await expect.poll(() => bodyFocused(page)).toBe(false);
  });

  test('history=push: a pill gesture then open, browser Back lands on the list with that pill', async ({ page }) => {
    await page.goto(withArgs('', 'history:push'));
    await expect(table(page)).toBeVisible();
    await page.getByRole('radio', { name: 'Open' }).click();
    await page.locator('a[data-record-id]').first().click();
    await expect(back(page)).toBeVisible();
    await page.goBack();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Open' })).toBeChecked();
    expect(params(page).get('record')).toBeNull();
  });

  test('deep link then Back to list: focus never on body', async ({ page }) => {
    await page.goto(url('record=inv-12'));
    await expect(page.getByRole('heading', { level: 1, name: /FT-2026-0012/ })).toBeVisible();
    await back(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('record')).toBeNull();
    await expect.poll(() => bodyFocused(page)).toBe(false);
  });

  test('prefers-reduced-motion: open and return still work', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url('filter=open'));
    await expect(table(page)).toBeVisible();
    await page.getByRole('link', { name: 'FT-2026-0012', exact: true }).click();
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Open' })).toBeChecked();
  });

  test('mobile viewport: open, browser Back, scroll restored', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(url('filter=open&sort=amount.desc'));
    await expect(table(page)).toBeVisible();
    const sc = table(page).locator('..');
    await sc.evaluate((el) => void (el.scrollTop = 400));
    await page.waitForTimeout(300);
    const link = page.locator('a[data-record-id]').nth(12);
    const number = ((await link.textContent()) ?? '').trim();
    await link.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const before = await sc.evaluate((el) => el.scrollTop);
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    await page.goBack();
    await expect(table(page)).toBeVisible();
    await expect.poll(async () => Math.abs((await sc.evaluate((el) => el.scrollTop)) - before)).toBeLessThanOrEqual(1);
    expect(await bodyFocused(page)).toBe(false);
  });

  test('user scrolls while the list is still loading on return', async ({ page }) => {
    await page.goto(withArgs('filter=open', 'listLoadDelayMs:1000'));
    await expect(table(page)).toBeVisible();
    await page.getByRole('link', { name: 'FT-2026-0012', exact: true }).click();
    await back(page).click();
    await page.mouse.wheel(0, 300);
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Open' })).toBeChecked();
    await expect.poll(() => bodyFocused(page)).toBe(false);
  });
});
