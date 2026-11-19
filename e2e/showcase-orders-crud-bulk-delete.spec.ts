import { expect, test, type Locator, type Page } from '@playwright/test';

// #525 (part 2): the sales-order equivalents of the tests of `showcase-crud-bulk-delete.spec.ts` that
// `showcase-sales-orders-crud.spec.ts` (#521) does not already cover, with the same titles (the invoice spec stays
// until #527). The mapping, test by test, is in the description of the pull request.
const FIXTURE = 'showcase-record-editing--sales-order-crud-manual';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
const SLOW = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:4000';
// The seed's first orders, in the order of the unsorted list.
const SECOND = 'SO-2026-018000002';
const THIRD = 'SO-2026-056000003';
const FOURTH = 'SO-2026-038000004';
const SIXTH_ROW = 6; // the index of the row picked in the rollback test (and, minus one, of the late one)

interface StoreOrder {
  id: string;
  number: string;
  status: string;
}
interface OrdersStore {
  snapshot: () => StoreOrder[];
  deleteMany: (ids: string[]) => Promise<void>;
}
type W = { __ropShowcaseStore?: OrdersStore; __ropDeleteManyCalls?: string[][] };

const table = (page: Page): Locator => page.getByRole('table', { name: /Sales orders/ });
const title = (page: Page): Locator => page.getByRole('heading', { level: 2, name: /Sales orders/ });
const link = (page: Page, number: string): Locator => page.getByRole('link', { name: number, exact: true });
const rowBox = (page: Page, number: string): Locator => page.getByRole('checkbox', { name: `Select ${number}`, exact: true });
const allBox = (page: Page): Locator => page.getByRole('checkbox', { name: 'Select all results', exact: true });
const bulkButton = (page: Page): Locator => page.getByRole('button', { name: 'Delete selected', exact: true });
const counter = (page: Page): Locator => page.locator('[data-rop-selection-count]');
const bar = (page: Page): Locator => page.locator('[data-rop-selection-bar]');
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;

const snapshot = (page: Page): Promise<StoreOrder[]> => page.evaluate(() => (window as unknown as W).__ropShowcaseStore?.snapshot() ?? []);
const inStore = async (page: Page, number: string): Promise<boolean> => (await snapshot(page)).some((o) => o.number === number);
const storeSize = async (page: Page): Promise<number> => (await snapshot(page)).length;
const idOf = async (page: Page, number: string): Promise<string> => (await snapshot(page)).find((o) => o.number === number)!.id;

/** Counts the calls that reach the store (the showcase's wrapper calls `store.deleteMany` at call time). */
async function countBulkDeletes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as unknown as W).__ropShowcaseStore!;
    const original = store.deleteMany.bind(store);
    (window as unknown as W).__ropDeleteManyCalls = [];
    store.deleteMany = (ids: string[]) => {
      (window as unknown as W).__ropDeleteManyCalls!.push([...ids]);
      return original(ids);
    };
  });
}
const bulkCalls = (page: Page): Promise<string[][]> => page.evaluate(() => (window as unknown as W).__ropDeleteManyCalls ?? []);

const url = (query: string, args: string): string =>
  `/iframe.html?id=${FIXTURE}&viewMode=story${query ? `&${query}` : ''}&args=${encodeURIComponent(args)}`;

async function openList(page: Page, query = '', args = FAST): Promise<void> {
  await page.goto(url(query, args));
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Select SO-/ }).first()).toBeVisible();
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

test.describe('Showcase/Record editing, orders: Crud (bulk delete), the rest of the invoice spec', () => {
  test('the CRUD list is selectable with a selection bar; the Update story is not selectable', async ({ page }) => {
    await openList(page);
    await expect(allBox(page)).toBeVisible();
    await expect(bar(page)).toBeVisible();
    await expect(counter(page)).toHaveText('No items selected');
    await page.goto('/iframe.html?id=showcase-record-editing--sales-order-list-to-record-manual&viewMode=story');
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete selected' })).toHaveCount(0);
  });

  test('0 selected: "Delete selected" is aria-disabled and focusable (not natively disabled); click and Enter reach no store call', async ({ page }) => {
    await openList(page);
    await countBulkDeletes(page);
    const button = bulkButton(page);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    // Playwright's `toBeDisabled` counts `aria-disabled`: read the native property instead.
    expect(await button.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(false);
    await button.click({ force: true }); // actionability treats aria-disabled as disabled
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await button.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(button).toBeFocused();
    expect(await bulkCalls(page)).toEqual([]);
  });

  test('3 selected: Cancel leaves the store, the selection and the focus as they were (no call)', async ({ page }) => {
    await openList(page);
    await countBulkDeletes(page);
    await selectRows(page, SECOND, THIRD, FOURTH);
    await expect(counter(page)).toHaveText('3 selected');
    const dialog = await askBulk(page, 'Delete 3 sales orders?');
    await expect(dialog.getByRole('button', { name: 'Delete 3 sales orders', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(bulkButton(page)).toBeFocused();
    expect(await bulkCalls(page)).toEqual([]);
    expect(await storeSize(page)).toBe(200);
    await expect(counter(page)).toHaveText('3 selected');
  });

  test('1 selected: the singular forms', async ({ page }) => {
    await openList(page);
    await selectRows(page, SECOND);
    const dialog = await askBulk(page, 'Delete 1 sales order?');
    await expect(dialog.getByRole('button', { name: 'Delete 1 sales order', exact: true })).toBeVisible();
    await expect(dialog).toContainText('The sales order is deleted permanently.');
  });

  test('confirmed: one deleteMany with exactly those ids, then a toast; focus on "Select all results", never body', async ({ page }) => {
    await openList(page, '', SLOW);
    await expect(title(page)).toContainText('200');
    await countBulkDeletes(page);
    const picked = [SECOND, THIRD, FOURTH];
    const ids = await Promise.all(picked.map((n) => idOf(page, n)));
    await selectRows(page, ...picked);
    const dialog = await askBulk(page, 'Delete 3 sales orders?');
    await dialog.getByRole('button', { name: 'Delete 3 sales orders', exact: true }).click();
    for (const n of picked) await expect(link(page, n)).toHaveCount(0);
    await expect(title(page)).toContainText('197');
    await expect(counter(page)).toHaveText('No items selected');
    expect(await storeSize(page)).toBe(200); // the server has not answered yet
    await expect(allBox(page)).toBeFocused();
    await expect(page.getByText('3 sales orders deleted')).toBeVisible({ timeout: 10_000 });
    expect(await storeSize(page)).toBe(197);
    expect(await inStore(page, THIRD)).toBe(false);
    expect(await bulkCalls(page)).toEqual([ids]);
    await expect(title(page)).toContainText('197');
    await expect(allBox(page)).toBeFocused();
  });

  test('deleteOutcome error: every row comes back at its index, the selection is as before, error toast, store unchanged', async ({ page }) => {
    await openList(page, 'sales-orders.sort=total.desc', `${SLOW};deleteOutcome:error`);
    const before = await shownNumbers(page);
    const picked = [before[1]!, before[2]!, before[SIXTH_ROW]!];
    await selectRows(page, ...picked);
    const dialog = await askBulk(page, 'Delete 3 sales orders?');
    await dialog.getByRole('button', { name: 'Delete 3 sales orders', exact: true }).click();
    for (const n of picked) await expect(link(page, n)).toHaveCount(0);
    await expect(title(page)).toContainText('197');
    await expect(page.getByText('Could not delete 3 sales orders')).toBeVisible({ timeout: 10_000 });
    expect(await shownNumbers(page)).toEqual(before);
    await expect(title(page)).toContainText('200');
    await expect(counter(page)).toHaveText('3 selected');
    for (const n of picked) await expect(rowBox(page, n)).toBeChecked();
    expect(await storeSize(page)).toBe(200);
    for (const n of picked) expect(await inStore(page, n)).toBe(true);
    await expect(bulkButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('deleteOutcome error after "Clear selection" during the flight: the rows that come back are selected again, a hidden row the user deselected is not', async ({ page }) => {
    await openList(page, 'sales-orders.filter=all', `${SLOW};deleteOutcome:error`);
    const statuses = Object.fromEntries((await snapshot(page)).map((o) => [o.number, o.status]));
    const shown = await shownNumbers(page);
    const visible = shown.find((n) => statuses[n] === 'invoiced')!;
    const hiddenOne = shown.find((n) => statuses[n] !== 'invoiced')!;
    await selectRows(page, visible, hiddenOne);
    await page.getByRole('radio', { name: 'Invoiced' }).click();
    await expect(counter(page)).toHaveText('1 selected (1 hidden by filters)');
    const dialog = await askBulk(page, 'Delete 1 sales order?');
    await dialog.getByRole('button', { name: 'Delete 1 sales order', exact: true }).click();
    await expect(link(page, visible)).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear selection' }).click();
    await expect(counter(page)).toHaveText('No items selected');
    await expect(page.getByText('Could not delete 1 sales order')).toBeVisible({ timeout: 10_000 });
    await expect(link(page, visible)).toBeVisible();
    await expect(counter(page)).toHaveText('1 selected');
    await expect(rowBox(page, visible)).toBeChecked();
    await page.getByRole('radio', { name: 'All' }).click();
    await expect(rowBox(page, hiddenOne)).not.toBeChecked();
    await expect(counter(page)).toHaveText('1 selected');
  });

  test('2 selected rows hidden by the filters: after the delete they are still selected (the counter says so)', async ({ page }) => {
    await openList(page, 'sales-orders.filter=all');
    const statuses = Object.fromEntries((await snapshot(page)).map((o) => [o.number, o.status]));
    const shown = await shownNumbers(page);
    const keep = shown.find((n) => statuses[n] === 'invoiced')!;
    const others = shown.filter((n) => statuses[n] !== 'invoiced').slice(0, 2);
    await selectRows(page, keep, ...others);
    await page.getByRole('radio', { name: 'Invoiced' }).click();
    await expect(counter(page)).toHaveText('1 selected (2 hidden by filters)');
    const dialog = await askBulk(page, 'Delete 1 sales order?');
    await dialog.getByRole('button', { name: 'Delete 1 sales order', exact: true }).click();
    await expect(page.getByText('1 sales order deleted')).toBeVisible();
    await expect(counter(page)).toHaveText('0 selected (2 hidden by filters)');
    await page.getByRole('radio', { name: 'All' }).click();
    await expect(counter(page)).toHaveText('2 selected');
    for (const n of others) await expect(rowBox(page, n)).toBeChecked();
  });

  test('history push: the bulk delete writes nothing to the URL and adds no history entry', async ({ page }) => {
    await openList(page, 'sales-orders.filter=all', `${FAST};history:push`);
    await selectRows(page, SECOND, THIRD);
    const entries = await page.evaluate(() => history.length);
    const before = page.url();
    const dialog = await askBulk(page, 'Delete 2 sales orders?');
    await dialog.getByRole('button', { name: 'Delete 2 sales orders', exact: true }).click();
    await expect(page.getByText('2 sales orders deleted')).toBeVisible();
    expect(page.url()).toBe(before);
    expect(params(page).get('record')).toBeNull();
    expect(await page.evaluate(() => history.length)).toBe(entries);
  });

  test('the selection survives an order opened and closed; the order deleted there is ignored and left out of the bulk', async ({ page }) => {
    await openList(page, '', FAST);
    const idSecond = await idOf(page, SECOND);
    await selectRows(page, SECOND, THIRD);
    await link(page, THIRD).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(THIRD) })).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: `Delete sales order ${THIRD}?` })
      .getByRole('button', { name: 'Delete sales order', exact: true })
      .click();
    await expect(table(page)).toBeVisible();
    await expect(counter(page)).toHaveText('1 selected');
    await countBulkDeletes(page);
    const dialog = await askBulk(page, 'Delete 1 sales order?');
    await dialog.getByRole('button', { name: 'Delete 1 sales order', exact: true }).click();
    await expect(page.getByText('1 sales order deleted')).toBeVisible();
    expect(await bulkCalls(page)).toEqual([[idSecond]]);
  });

  test('rows selected while the delete is in flight: success removes only the deleted ids; rollback unions the old selection with the new one', async ({ page }) => {
    await openList(page, '', SLOW);
    const later = (await shownNumbers(page))[SIXTH_ROW - 1]!;
    await selectRows(page, SECOND, THIRD);
    let dialog = await askBulk(page, 'Delete 2 sales orders?');
    await dialog.getByRole('button', { name: 'Delete 2 sales orders', exact: true }).click();
    await expect(link(page, SECOND)).toHaveCount(0);
    await rowBox(page, later).check();
    await expect(page.getByText('2 sales orders deleted')).toBeVisible({ timeout: 10_000 });
    await expect(counter(page)).toHaveText('1 selected');
    await expect(rowBox(page, later)).toBeChecked();

    await openList(page, '', `${SLOW};deleteOutcome:error`);
    await selectRows(page, SECOND, THIRD);
    dialog = await askBulk(page, 'Delete 2 sales orders?');
    await dialog.getByRole('button', { name: 'Delete 2 sales orders', exact: true }).click();
    await expect(link(page, SECOND)).toHaveCount(0);
    await rowBox(page, later).check();
    await expect(page.getByText('Could not delete 2 sales orders')).toBeVisible({ timeout: 10_000 });
    await expect(counter(page)).toHaveText('3 selected');
    for (const n of [SECOND, THIRD, later]) await expect(rowBox(page, n)).toBeChecked();
    expect(await storeSize(page)).toBe(200);
  });
});
