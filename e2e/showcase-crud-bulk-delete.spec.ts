import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';

// #366: Showcase/Invoices -> Crud. "Delete selected" in the selection bar: optimistic, atomic (one deleteMany),
// rolled back as a whole with the selection restored.
const PLAY_STORY = 'showcase-invoices--crud-bulk-delete';
const FIXTURE = 'showcase-invoices--crud-manual';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
const SLOW = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:4000';

const table = (page: Page): Locator => page.getByRole('table', { name: /Invoices/ });
const title = (page: Page): Locator => page.getByRole('heading', { level: 2, name: /Invoices/ });
const link = (page: Page, number: string): Locator => page.getByRole('link', { name: number, exact: true });
const rowBox = (page: Page, number: string): Locator => page.getByRole('checkbox', { name: `Select ${number}`, exact: true });
const allBox = (page: Page): Locator => page.getByRole('checkbox', { name: 'Select all results', exact: true });
const bulkButton = (page: Page): Locator => page.getByRole('button', { name: 'Delete selected', exact: true });
const counter = (page: Page): Locator => page.locator('[data-rop-selection-count]');
const bar = (page: Page): Locator => page.locator('[data-rop-selection-bar]');
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;

declare global {
  interface Window {
    __ropDeleteManyCalls?: string[][];
  }
}

interface BulkStore {
  deleteMany: (ids: string[]) => Promise<void>;
}
const inStore = (page: Page, number: string): Promise<boolean> =>
  page.evaluate((n) => (window.__ropShowcaseStore?.snapshot() ?? []).some((r) => r.number === n), number);
const storeSize = (page: Page): Promise<number> => page.evaluate(() => window.__ropShowcaseStore?.snapshot().length ?? -1);

/** Counts the calls that reach the store (the showcase's wrapper calls `store.deleteMany` at call time). */
async function countBulkDeletes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window.__ropShowcaseStore as unknown as BulkStore;
    const original = store.deleteMany.bind(store);
    window.__ropDeleteManyCalls = [];
    store.deleteMany = (ids: string[]) => {
      window.__ropDeleteManyCalls!.push([...ids]);
      return original(ids);
    };
  });
}
const bulkCalls = (page: Page): Promise<string[][]> => page.evaluate(() => window.__ropDeleteManyCalls ?? []);

function url(query: string, args: string): string {
  return `/iframe.html?id=${FIXTURE}&viewMode=story${query ? `&${query}` : ''}&args=${encodeURIComponent(args)}`;
}

async function openList(page: Page, query = '', args = FAST): Promise<void> {
  await page.goto(url(query, args));
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Select FT-/ }).first()).toBeVisible();
}

const shownNumbers = (page: Page): Promise<string[]> =>
  page.getByRole('button', { name: /^Actions for / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.slice(12)));

async function selectRows(page: Page, ...numbers: string[]): Promise<void> {
  for (const n of numbers) await rowBox(page, n).check();
}

async function askBulk(page: Page, dialogTitle: string): Promise<Locator> {
  await bulkButton(page).click();
  const dialog = page.getByRole('dialog', { name: dialogTitle });
  await expect(dialog).toBeVisible();
  return dialog;
}

const bodyHasFocus = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.activeElement === document.body || document.activeElement === null);

const focusedIs = (page: Page, locator: Locator): Promise<boolean> =>
  locator.evaluate((el) => el === document.activeElement);

test.describe('Showcase/Invoices: Crud (bulk delete)', () => {
  test('the play function of "CRUD bulk delete" passes, with success and with deleteOutcome error', async ({ page }) => {
    await expectPlayToPass(page, PLAY_STORY);
    await expectPlayToPass(page, PLAY_STORY, 'deleteOutcome:error');
  });

  test('the CRUD list is selectable with a selection bar; the Update story is not selectable', async ({ page }) => {
    await openList(page);
    await expect(allBox(page)).toBeVisible();
    await expect(bar(page)).toBeVisible();
    await expect(counter(page)).toHaveText('No items selected');
    await page.goto('/iframe.html?id=showcase-invoices--list-to-record-manual&viewMode=story');
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete selected' })).toHaveCount(0);
  });

  test('0 selected: "Delete selected" is aria-disabled and focusable; click and Enter open nothing', async ({ page }) => {
    await openList(page);
    await countBulkDeletes(page);
    const button = bulkButton(page);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    // Playwright's `toBeDisabled` counts `aria-disabled`: read the native property instead.
    expect(await button.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(false);
    await button.click({ force: true }); // actionability treats aria-disabled as disabled
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await bulkCalls(page)).toEqual([]);
  });

  test('3 selected: "Delete 3 invoices?", the matching action, focus on Cancel, no a11y violation; Cancel gives the focus back to the button', async ({ page }) => {
    await openList(page);
    await countBulkDeletes(page);
    await selectRows(page, 'FT-2026-0002', 'FT-2026-0003', 'FT-2026-0004');
    await expect(counter(page)).toHaveText('3 selected');
    const dialog = await askBulk(page, 'Delete 3 invoices?');
    await expect(dialog.getByRole('button', { name: 'Delete 3 invoices', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(bulkButton(page)).toBeFocused();
    expect(await bulkCalls(page)).toEqual([]);
    expect(await storeSize(page)).toBe(200);
    await expect(counter(page)).toHaveText('3 selected');
  });

  test('1 selected: the singular forms', async ({ page }) => {
    await openList(page);
    await selectRows(page, 'FT-2026-0002');
    const dialog = await askBulk(page, 'Delete 1 invoice?');
    await expect(dialog.getByRole('button', { name: 'Delete 1 invoice', exact: true })).toBeVisible();
    await expect(dialog).toContainText('The invoice is deleted permanently.');
  });

  test('confirmed: the rows go BEFORE the server answers, one deleteMany with exactly those ids, then a toast; focus on "Select all results", never body', async ({ page }) => {
    await openList(page, '', SLOW);
    await expect(title(page)).toContainText('(200)');
    await countBulkDeletes(page);
    await selectRows(page, 'FT-2026-0002', 'FT-2026-0004', 'FT-2026-0005');
    const dialog = await askBulk(page, 'Delete 3 invoices?');
    await dialog.getByRole('button', { name: 'Delete 3 invoices', exact: true }).click();
    for (const n of ['FT-2026-0002', 'FT-2026-0004', 'FT-2026-0005']) await expect(link(page, n)).toHaveCount(0);
    await expect(title(page)).toContainText('(197)');
    await expect(counter(page)).toHaveText('No items selected');
    expect(await storeSize(page)).toBe(200); // the server has not answered yet
    await expect(allBox(page)).toBeFocused();
    expect(await bodyHasFocus(page)).toBe(false);
    await expect(page.getByText('3 invoices deleted')).toBeVisible({ timeout: 10_000 });
    expect(await storeSize(page)).toBe(197);
    expect(await inStore(page, 'FT-2026-0004')).toBe(false);
    expect(await bulkCalls(page)).toEqual([['inv-2', 'inv-4', 'inv-5']]);
    await expect(title(page)).toContainText('(197)');
    await expect(allBox(page)).toBeFocused();
  });

  test('a double click on the confirm button makes one call', async ({ page }) => {
    await openList(page, '', SLOW);
    await countBulkDeletes(page);
    await selectRows(page, 'FT-2026-0002', 'FT-2026-0003');
    const dialog = await askBulk(page, 'Delete 2 invoices?');
    await dialog.getByRole('button', { name: 'Delete 2 invoices', exact: true }).dblclick();
    await expect(dialog).toHaveCount(0);
    expect((await bulkCalls(page)).length).toBe(1);
  });

  test('deleteOutcome error: every row comes back at its index, the selection is as before, error toast, store unchanged', async ({ page }) => {
    await openList(page, 'sort=amount.desc', `${SLOW};deleteOutcome:error`);
    const before = await shownNumbers(page);
    const picked = [before[1]!, before[2]!, before[6]!];
    await selectRows(page, ...picked);
    const dialog = await askBulk(page, 'Delete 3 invoices?');
    await dialog.getByRole('button', { name: 'Delete 3 invoices', exact: true }).click();
    for (const n of picked) await expect(link(page, n)).toHaveCount(0);
    await expect(title(page)).toContainText('(197)');
    await expect(page.getByText('Could not delete 3 invoices')).toBeVisible({ timeout: 10_000 });
    expect(await shownNumbers(page)).toEqual(before);
    await expect(title(page)).toContainText('(200)');
    await expect(counter(page)).toHaveText('3 selected');
    for (const n of picked) await expect(rowBox(page, n)).toBeChecked();
    expect(await storeSize(page)).toBe(200);
    for (const n of picked) expect(await inStore(page, n)).toBe(true);
    await expect(bulkButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('2 selected rows hidden by the filters: the dialog says so; after the delete they are still stored and still selected', async ({ page }) => {
    await openList(page, 'filter=all');
    // The first pending (Open) invoice and two non-pending ones, all in the first rows.
    const statuses = await page.evaluate(() =>
      Object.fromEntries(
        ((window.__ropShowcaseStore?.snapshot() ?? []) as unknown as { number: string; status: string }[]).map((r) => [
          r.number,
          r.status,
        ]),
      ),
    );
    const shown = await shownNumbers(page);
    const open = shown.find((n) => statuses[n] === 'pending')!;
    const others = shown.filter((n) => statuses[n] !== 'pending').slice(0, 2);
    await selectRows(page, open, ...others);
    await expect(counter(page)).toHaveText('3 selected');
    await page.getByRole('radio', { name: 'Open' }).click();
    await expect(counter(page)).toHaveText('1 selected (2 hidden by filters)');
    await countBulkDeletes(page);
    const dialog = await askBulk(page, 'Delete 1 invoice?');
    await expect(dialog).toContainText('2 selected invoices hidden by the filters will not be deleted.');
    await dialog.getByRole('button', { name: 'Delete 1 invoice', exact: true }).click();
    await expect(page.getByText('1 invoice deleted')).toBeVisible();
    await expect(counter(page)).toHaveText('0 selected (2 hidden by filters)');
    expect((await bulkCalls(page)).flat()).toHaveLength(1);
    expect(await inStore(page, open)).toBe(false);
    for (const n of others) expect(await inStore(page, n)).toBe(true);
    await page.getByRole('radio', { name: 'All' }).click();
    await expect(counter(page)).toHaveText('2 selected');
    for (const n of others) await expect(rowBox(page, n)).toBeChecked();
  });

  test('deleting every result: "no results" with a stable footprint, the selection bar keeps its height, focus on the table container', async ({ page }) => {
    await openList(page, 'q=FT-2026-001');
    expect((await shownNumbers(page)).length).toBe(10);
    await allBox(page).check();
    await expect(counter(page)).toHaveText('10 selected');
    const barBefore = (await bar(page).boundingBox())!;
    const tableBefore = (await table(page).locator('xpath=..').boundingBox())!;
    const dialog = await askBulk(page, 'Delete 10 invoices?');
    await dialog.getByRole('button', { name: 'Delete 10 invoices', exact: true }).click();
    await expect(table(page).getByText('No results for the current filters')).toBeVisible();
    await expect(page.getByText('10 invoices deleted')).toBeVisible();
    const barAfter = (await bar(page).boundingBox())!;
    const tableAfter = (await table(page).locator('xpath=..').boundingBox())!;
    expect(barAfter.height).toBeCloseTo(barBefore.height, 0);
    expect(barAfter.y).toBeCloseTo(barBefore.y, 0);
    expect(tableAfter.height).toBeCloseTo(tableBefore.height, 0);
    expect(tableAfter.y).toBeCloseTo(tableBefore.y, 0);
    const container = table(page).locator('xpath=..');
    await expect.poll(() => focusedIs(page, container)).toBe(true);
    expect(await bodyHasFocus(page)).toBe(false);
  });

  test('history push: the bulk delete writes nothing to the URL and adds no history entry', async ({ page }) => {
    await openList(page, 'filter=all', `${FAST};history:push`);
    await selectRows(page, 'FT-2026-0002', 'FT-2026-0003');
    const entries = await page.evaluate(() => history.length);
    const before = page.url();
    const dialog = await askBulk(page, 'Delete 2 invoices?');
    await dialog.getByRole('button', { name: 'Delete 2 invoices', exact: true }).click();
    await expect(page.getByText('2 invoices deleted')).toBeVisible();
    expect(page.url()).toBe(before);
    expect(params(page).get('record')).toBeNull();
    expect(await page.evaluate(() => history.length)).toBe(entries);
  });

  test('the selection survives a record opened and closed; the record deleted there is ignored and left out of the bulk', async ({ page }) => {
    await openList(page, '', FAST);
    await selectRows(page, 'FT-2026-0002', 'FT-2026-0003');
    await link(page, 'FT-2026-0003').click();
    await expect(page.getByRole('heading', { level: 1, name: 'FT-2026-0003' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog', { name: 'Delete invoice FT-2026-0003?' }).getByRole('button', { name: 'Delete invoice' }).click();
    await expect(table(page)).toBeVisible();
    await expect(counter(page)).toHaveText('1 selected');
    await countBulkDeletes(page);
    const dialog = await askBulk(page, 'Delete 1 invoice?');
    await dialog.getByRole('button', { name: 'Delete 1 invoice', exact: true }).click();
    await expect(page.getByText('1 invoice deleted')).toBeVisible();
    expect(await bulkCalls(page)).toEqual([['inv-2']]);
  });

  test('rows selected while the delete is in flight: success removes only the deleted ids; rollback unions the old selection with the new one', async ({ page }) => {
    await openList(page, '', SLOW);
    await selectRows(page, 'FT-2026-0002', 'FT-2026-0003');
    let dialog = await askBulk(page, 'Delete 2 invoices?');
    await dialog.getByRole('button', { name: 'Delete 2 invoices', exact: true }).click();
    await expect(link(page, 'FT-2026-0002')).toHaveCount(0);
    await rowBox(page, 'FT-2026-0006').check();
    await expect(page.getByText('2 invoices deleted')).toBeVisible({ timeout: 10_000 });
    await expect(counter(page)).toHaveText('1 selected');
    await expect(rowBox(page, 'FT-2026-0006')).toBeChecked();

    await openList(page, '', `${SLOW};deleteOutcome:error`);
    await selectRows(page, 'FT-2026-0002', 'FT-2026-0003');
    dialog = await askBulk(page, 'Delete 2 invoices?');
    await dialog.getByRole('button', { name: 'Delete 2 invoices', exact: true }).click();
    await expect(link(page, 'FT-2026-0002')).toHaveCount(0);
    await rowBox(page, 'FT-2026-0006').check();
    await expect(page.getByText('Could not delete 2 invoices')).toBeVisible({ timeout: 10_000 });
    await expect(counter(page)).toHaveText('3 selected');
    for (const n of ['FT-2026-0002', 'FT-2026-0003', 'FT-2026-0006']) await expect(rowBox(page, n)).toBeChecked();
    expect(await storeSize(page)).toBe(200);
  });
});
