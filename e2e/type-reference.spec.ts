import { expect, test } from '@playwright/test';

// The hook/type reference generated from the TSDoc (ticket #402), on its List Report page.

const PAGE = '/iframe.html?id=reference-list-report--docs&viewMode=docs';

test.describe('Type reference: List Report page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE);
    await page.waitForSelector('[data-type-reference="UseListReportOptions"]', { timeout: 15_000 });
  });

  test('renders the hook and the three types, every option with a description', async ({ page }) => {
    for (const name of ['useListReport', 'UseListReportOptions', 'UseListReportReturn', 'ListReportColumn']) {
      await expect(page.locator(`[data-type-reference="${name}"]`)).toBeVisible();
    }
    const options = page.getByRole('region', { name: 'UseListReportOptions members' });
    const rows = options.locator('tbody tr');
    // One row per option of list-report/types.ts (the unit test checks the names against the source).
    await expect(rows).toHaveCount(21);
    for (const row of await rows.all()) {
      await expect(row.locator('td').last()).not.toBeEmpty();
    }
    await expect(page.locator('#uselistreportoptions-searchcommitdelay td').nth(2)).toHaveText('300');
  });

  test('a type name in a Type cell links to its reference on the page', async ({ page }) => {
    const link = page.locator('#uselistreportoptions-columns').getByRole('link', { name: 'ListReportColumn' });
    await expect(link).toHaveAttribute('href', '#listreportcolumn');
    await link.click();
    await expect(page.locator('#listreportcolumn')).toBeInViewport();
  });

  test('a type that is not on the page is plain text, never a dead link', async ({ page }) => {
    // A public type whose reference is on another page (or on none) stays text: every in-page link of a
    // table points at an anchor that exists on this page.
    const hrefs = await page.locator('[data-type-reference] td a[href^="#"]').evaluateAll((links) =>
      links.map((a) => a.getAttribute('href') ?? ''),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(await page.locator(href).count(), href).toBe(1);
  });

  test('every member has its own anchor', async ({ page }) => {
    const anchor = page.locator('#uselistreportoptions-columns').getByRole('link', { name: 'columns', exact: true });
    await expect(anchor).toHaveAttribute('href', '#uselistreportoptions-columns');
  });

  test('on a phone the table scrolls inside its container, not the page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const region = page.getByRole('region', { name: 'UseListReportOptions members' });
    await expect(region).toBeVisible();
    const sizes = await region.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    // Reachable from the keyboard, so a keyboard user can scroll it.
    await expect(region).toHaveAttribute('tabindex', '0');
  });
});
