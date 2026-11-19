import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

// #525 (part 2): the sales-order equivalents of the tests of `showcase-crud-delete.spec.ts` that
// `showcase-sales-orders-crud.spec.ts` (#521) does not already cover, with the same titles (the invoice spec stays
// until #527). The mapping, test by test, is in the description of the pull request.
const FIXTURE = 'showcase-record-editing--sales-order-crud-manual';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
// The server answers after 4 s: long enough to look at the list before it does.
const SLOW = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:4000';
const HELD = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:3600000';
// The seed's first orders, in the order of the unsorted list.
const SECOND = 'SO-2026-018000002';
const THIRD = 'SO-2026-056000003';
const FIFTH = 'SO-2026-144000005';

interface StoreOrder {
  id: string;
  number: string;
}
interface OrdersStore {
  snapshot: () => StoreOrder[];
  delete: (id: string) => Promise<void>;
}
type W = { __ropShowcaseStore?: OrdersStore; __ropDeleteCalls?: string[] };

const table = (page: Page): Locator => page.getByRole('table', { name: /Sales orders/ });
const title = (page: Page): Locator => page.getByRole('heading', { level: 2, name: /Sales orders/ });
const trigger = (page: Page, number: string): Locator => page.getByRole('button', { name: `Actions for ${number}`, exact: true });
const link = (page: Page, number: string): Locator => page.getByRole('link', { name: number, exact: true });
const confirmDialog = (page: Page, number: string): Locator => page.getByRole('dialog', { name: `Delete sales order ${number}?` });
const confirmButton = (dialog: Locator): Locator => dialog.getByRole('button', { name: 'Delete sales order', exact: true });
const unsavedDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;

const inStore = (page: Page, number: string): Promise<boolean> =>
  page.evaluate((n) => ((window as unknown as W).__ropShowcaseStore?.snapshot() ?? []).some((o) => o.number === n), number);
const storeSize = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as W).__ropShowcaseStore?.snapshot().length ?? -1);
const idOf = async (page: Page, number: string): Promise<string> =>
  (await page.evaluate((n) => ((window as unknown as W).__ropShowcaseStore?.snapshot() ?? []).find((o) => o.number === n)?.id, number))!;

/** Counts the calls that reach the store (the showcase's wrapper calls `store.delete` at call time). */
async function countDeletes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = (window as unknown as W).__ropShowcaseStore!;
    const original = store.delete.bind(store);
    (window as unknown as W).__ropDeleteCalls = [];
    store.delete = (id: string) => {
      (window as unknown as W).__ropDeleteCalls!.push(id);
      return original(id);
    };
  });
}
const deleteCalls = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as W).__ropDeleteCalls ?? []);

const url = (query: string, args: string): string =>
  `/iframe.html?id=${FIXTURE}&viewMode=story${query ? `&${query}` : ''}&args=${encodeURIComponent(args)}`;

async function openList(page: Page, query = '', args = FAST): Promise<void> {
  await page.goto(url(query, args));
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Actions for / }).first()).toBeVisible();
}

/** The row numbers on screen, in order. */
const shownNumbers = (page: Page): Promise<string[]> =>
  page.getByRole('button', { name: /^Actions for / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.slice(12)));

async function askDelete(page: Page, number: string): Promise<Locator> {
  await trigger(page, number).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  const dialog = confirmDialog(page, number);
  await expect(dialog).toBeVisible();
  return dialog;
}

const bodyHasFocus = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.activeElement === document.body || document.activeElement === null);

/**
 * The distinct holders of the focus, sampled every frame for `ms`: `BODY`, or the accessible label / text of the
 * element. NOTE: the Dialog itself leaves the focus on `body` for the length of its exit animation (also on
 * Cancel: the return happens once the panel has unmounted, `useReturnFocus`), so `BODY` is expected in the
 * middle; what this checks is where the focus goes AFTER that, and that it makes no detour (e.g. the table).
 */
function focusTrail(page: Page, ms: number): Promise<string[]> {
  return page.evaluate(
    (duration) =>
      new Promise<string[]>((resolve) => {
        const trail: string[] = [];
        const end = performance.now() + duration;
        const tick = () => {
          const a = document.activeElement;
          const name =
            !a || a === document.body ? 'BODY' : (a.getAttribute('aria-label') ?? a.textContent?.trim().slice(0, 40) ?? a.tagName);
          if (trail[trail.length - 1] !== name) trail.push(name);
          if (performance.now() >= end) resolve(trail);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

test.describe('Showcase/Record editing, orders: Crud (Delete from the list), the rest of the invoice spec', () => {
  for (const how of ['Cancel', 'Escape'] as const) {
    test(`${how}: no call to store.delete, the focus goes back to the row's "…"`, async ({ page }) => {
      await openList(page);
      await countDeletes(page);
      const dialog = await askDelete(page, THIRD);
      if (how === 'Cancel') await dialog.getByRole('button', { name: 'Cancel' }).click();
      else await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger(page, THIRD)).toBeFocused();
      expect(await deleteCalls(page)).toEqual([]);
      expect(await storeSize(page)).toBe(200);
      await expect(link(page, THIRD)).toBeVisible();
    });
  }

  test('focus after the confirmation: straight to the "…" of the next row (no detour), and it stays there', async ({ page }) => {
    await openList(page);
    const dialog = await askDelete(page, SECOND);
    const trail = focusTrail(page, 4000);
    await confirmButton(dialog).click();
    await expect(trigger(page, THIRD)).toBeFocused();
    const seen = await trail;
    // From the dialog's button, through the Dialog's own exit (`BODY`), to the target; nothing else, and it ends there.
    expect(seen.filter((s) => s !== 'BODY' && s !== 'Cancel' && s !== 'Delete sales order')).toEqual([`Actions for ${THIRD}`]);
    expect(seen[seen.length - 1]).toBe(`Actions for ${THIRD}`);
  });

  test('focus after deleting the LAST row of the results: the "…" of the previous row', async ({ page }) => {
    await openList(page, 'sales-orders.filter=cancelled');
    const shown = await shownNumbers(page);
    expect(shown.length).toBeGreaterThan(2);
    const last = shown[shown.length - 1]!;
    const previous = shown[shown.length - 2]!;
    const dialog = await askDelete(page, last);
    await confirmButton(dialog).click();
    await expect(trigger(page, previous)).toBeFocused();
    expect(await bodyHasFocus(page)).toBe(false);
  });

  test('deleteOutcome error: the row comes back at the same index, count restored, error toast, focus left where the user put it', async ({ page }) => {
    await openList(page, 'sales-orders.sort=total.desc', `${SLOW};deleteOutcome:error`);
    const before = await shownNumbers(page);
    const target = before[2]!;
    const dialog = await askDelete(page, target);
    await confirmButton(dialog).click();
    await expect(link(page, target)).toHaveCount(0);
    await expect(title(page)).toContainText('199');
    // The user moves on while the server works.
    await page.getByRole('button', { name: 'New sales order' }).focus();
    await expect(page.getByText(`Could not delete ${target}`)).toBeVisible({ timeout: 10_000 });
    await expect(link(page, target)).toBeVisible();
    expect(await shownNumbers(page)).toEqual(before);
    await expect(title(page)).toContainText('200');
    expect(await inStore(page, target)).toBe(true);
    await expect(page.getByRole('button', { name: 'New sales order' })).toBeFocused();
  });

  test('two deletes on different rows, the first still in flight: both hidden, both reach the store', async ({ page }) => {
    await openList(page, '', SLOW);
    await countDeletes(page);
    const [idSecond, idFifth] = [await idOf(page, SECOND), await idOf(page, FIFTH)];
    await confirmButton(await askDelete(page, SECOND)).click();
    await expect(confirmDialog(page, SECOND)).toHaveCount(0);
    await confirmButton(await askDelete(page, FIFTH)).click();
    await expect(link(page, SECOND)).toHaveCount(0);
    await expect(link(page, FIFTH)).toHaveCount(0);
    await expect(title(page)).toContainText('198');
    await expect.poll(() => storeSize(page), { timeout: 15_000 }).toBe(198);
    expect((await deleteCalls(page)).sort()).toEqual([idSecond, idFifth].sort());
    await expect(title(page)).toContainText('198');
  });
});

test.describe('Showcase/Record editing, orders: Crud (Delete from the record page), the rest of the invoice spec', () => {
  async function openRecordFromList(page: Page, number: string, args = FAST): Promise<void> {
    await openList(page, '', args);
    await link(page, number).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
  }
  const remove = (page: Page): Locator => page.getByRole('button', { name: 'Delete', exact: true });
  const quantity = (page: Page): Locator => page.getByRole('textbox', { name: /Line 1 quantity/ });

  test('with unsaved changes: the dialog warns; after the confirmation no "Unsaved changes", and Back/Forward do not bring it up either', async ({ page }) => {
    await openRecordFromList(page, SECOND);
    await page.getByRole('textbox', { name: 'Notes' }).fill('edited');
    await remove(page).click();
    const dialog = confirmDialog(page, SECOND);
    await expect(dialog).toContainText('Unsaved changes will be lost too.');
    await expectNoA11yViolations(page);
    await confirmButton(dialog).click();
    await expect(table(page)).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
    await page.goForward();
    await expect(page.getByText('Sales order not found')).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
    await page.goBack();
    await expect(table(page)).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
  });

  test('browser Back while the delete is pending, with unsaved changes: the guard asks; the delete landing takes over and goes to the list', async ({ page }) => {
    await openRecordFromList(page, SECOND, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:2500');
    const id = await idOf(page, SECOND);
    await page.getByRole('textbox', { name: 'Notes' }).fill('edited');
    await remove(page).click();
    const dialog = confirmDialog(page, SECOND);
    await confirmButton(dialog).click();
    await expect(confirmButton(dialog)).toHaveAttribute('aria-disabled', 'true');
    // Not awaited: the guard cancels this traversal, so it only "completes" with the navigation after the delete.
    const back = page.goBack({ timeout: 15_000 }).catch(() => null);
    // The delete in flight wins the wording: it says the delete goes on AND the edits are lost.
    const guardDialog = page.getByRole('dialog', { name: 'Delete in progress' });
    await expect(guardDialog).toBeVisible();
    await expect(guardDialog).toContainText('Your unsaved changes will be lost.');
    expect(params(page).get('record')).toBe(id);
    // The server deletes the order: the guard is disarmed and the page goes to the list (no choice left to make).
    await expect(table(page)).toBeVisible({ timeout: 10_000 });
    await back;
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(unsavedDialog(page)).toHaveCount(0);
    expect(params(page).get('record')).toBeNull();
    expect(await inStore(page, SECOND)).toBe(false);
    await expect(page.getByText(`Sales order ${SECOND} deleted`)).toBeVisible();
  });

  test('code-review #372 bug 2: browser Back while the delete of a CLEAN order is pending: "Delete in progress" asks; the delete landing goes to the list', async ({ page }) => {
    await openRecordFromList(page, SECOND, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:2500');
    const id = await idOf(page, SECOND);
    await remove(page).click();
    const dialog = confirmDialog(page, SECOND);
    await expect(dialog).not.toContainText('Unsaved changes');
    await confirmButton(dialog).click();
    await expect(confirmButton(dialog)).toHaveAttribute('aria-disabled', 'true');
    // Not awaited: the guard cancels this traversal, so it only "completes" with the navigation after the delete.
    const back = page.goBack({ timeout: 15_000 }).catch(() => null);
    await expect(page.getByRole('dialog', { name: 'Delete in progress' })).toBeVisible();
    expect(params(page).get('record')).toBe(id);
    // Still the order page (behind the two dialogs, hence `includeHidden`).
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(SECOND), includeHidden: true })).toBeAttached();
    await expect(table(page)).toBeVisible({ timeout: 10_000 });
    await back;
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(params(page).get('record')).toBeNull();
    expect(await inStore(page, SECOND)).toBe(false);
  });

  test('after the delete, Forward reopens the order URL: "Sales order not found" with "Back to list"', async ({ page }) => {
    await openRecordFromList(page, THIRD);
    const id = await idOf(page, THIRD);
    await remove(page).click();
    await confirmButton(confirmDialog(page, THIRD)).click();
    await expect(table(page)).toBeVisible();
    await page.goForward();
    expect(params(page).get('record')).toBe(id);
    await expect(page.getByText('Sales order not found')).toBeVisible();
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(table(page)).toBeVisible();
  });

  test('server error: the dialog stays open and interactive, error toast, order still stored; Cancel gives the focus back to "Delete"', async ({ page }) => {
    await openRecordFromList(page, SECOND, `${FAST};deleteOutcome:error`);
    const id = await idOf(page, SECOND);
    await remove(page).click();
    const dialog = confirmDialog(page, SECOND);
    await confirmButton(dialog).click();
    await expect(page.getByText(`Could not delete ${SECOND}`)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(confirmButton(dialog)).not.toHaveAttribute('aria-disabled', 'true');
    expect(await inStore(page, SECOND)).toBe(true);
    expect(params(page).get('record')).toBe(id);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(remove(page)).toBeFocused();
  });

  test('"Delete" is aria-disabled while a Save is in flight: no confirmation, no delete', async ({ page }) => {
    await openRecordFromList(page, SECOND, HELD);
    await countDeletes(page);
    await quantity(page).fill('7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(remove(page)).toHaveAttribute('aria-disabled', 'true');
    await remove(page).click({ force: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await deleteCalls(page)).toEqual([]);
  });

  test('deep link to an order, then Delete: back to the list with replaceState (no history entry added, still in the app)', async ({ page }) => {
    await openList(page, 'sales-orders.filter=all');
    const id = await idOf(page, SECOND);
    await page.goto('/index.json');
    await page.goto(url(`module=sales-orders&sales-orders.filter=all&record=${id}`, FAST));
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(SECOND) })).toBeVisible();
    const entries = await page.evaluate(() => history.length);
    await remove(page).click();
    await confirmButton(confirmDialog(page, SECOND)).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('record')).toBeNull();
    expect(params(page).get('sales-orders.filter')).toBe('all');
    expect(await page.evaluate(() => history.length)).toBe(entries);
    expect(new URL(page.url()).pathname).toContain('iframe.html');
    await expect(title(page)).toBeFocused();
  });
});
