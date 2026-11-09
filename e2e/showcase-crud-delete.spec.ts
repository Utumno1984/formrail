import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';

// #365: Showcase/Invoices -> Crud. Delete from the list row (optimistic, rollback) and from the record page
// (pessimistic, the confirmation waits for the server).
const PLAY_STORY = 'showcase-invoices--crud-delete';
const FIXTURE = 'showcase-invoices--crud-manual';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
// The server answers after 4 s: long enough to look at the list before it does.
const SLOW = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:4000';
const HELD = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:3600000';

const table = (page: Page): Locator => page.getByRole('table', { name: /Invoices/ });
const title = (page: Page): Locator => page.getByRole('heading', { level: 2, name: /Invoices/ });
const trigger = (page: Page, number: string): Locator => page.getByRole('button', { name: `Actions for ${number}`, exact: true });
const link = (page: Page, number: string): Locator => page.getByRole('link', { name: number, exact: true });
const confirmDialog = (page: Page, number: string): Locator => page.getByRole('dialog', { name: `Delete invoice ${number}?` });
const unsavedDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;

// `window.__ropShowcaseStore` is declared (with `snapshot`) by showcase-crud-create.spec.ts; `delete` is added here.
interface DeletableStore {
  delete: (id: string) => Promise<void>;
}
declare global {
  interface Window {
    __ropDeleteCalls?: string[];
  }
}

const inStore = (page: Page, number: string): Promise<boolean> =>
  page.evaluate((n) => (window.__ropShowcaseStore?.snapshot() ?? []).some((r) => r.number === n), number);
const storeSize = (page: Page): Promise<number> => page.evaluate(() => window.__ropShowcaseStore?.snapshot().length ?? -1);

/** Counts the calls that reach the store (the showcase's wrapper calls `store.delete` at call time). */
async function countDeletes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window.__ropShowcaseStore as unknown as DeletableStore;
    const original = store.delete.bind(store);
    window.__ropDeleteCalls = [];
    store.delete = (id: string) => {
      window.__ropDeleteCalls!.push(id);
      return original(id);
    };
  });
}
const deleteCalls = (page: Page): Promise<string[]> => page.evaluate(() => window.__ropDeleteCalls ?? []);

function url(query: string, args: string): string {
  return `/iframe.html?id=${FIXTURE}&viewMode=story${query ? `&${query}` : ''}&args=${encodeURIComponent(args)}`;
}

async function openList(page: Page, query = '', args = FAST): Promise<void> {
  await page.goto(url(query, args));
  await expect(table(page)).toBeVisible();
  // The header row plus at least one data row (a search may leave a single one).
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

test.describe('Showcase/Invoices: Crud (Delete from the list)', () => {
  test('the play function of "CRUD delete" passes, with success and with deleteOutcome error', async ({ page }) => {
    await expectPlayToPass(page, PLAY_STORY);
    await expectPlayToPass(page, PLAY_STORY, 'deleteOutcome:error');
  });

  test('"Delete" (danger) in the row menu opens the confirmation: named title and action, focus on Cancel, no a11y violation', async ({ page }) => {
    await openList(page);
    await trigger(page, 'FT-2026-0001').click();
    const item = page.getByRole('menuitem', { name: 'Delete', exact: true });
    await expect(item).toBeVisible();
    await item.click();
    const dialog = confirmDialog(page, 'FT-2026-0001');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete invoice' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expectNoA11yViolations(page);
  });

  for (const how of ['Cancel', 'Escape'] as const) {
    test(`${how}: no call to store.delete, the focus goes back to the row's "…"`, async ({ page }) => {
      await openList(page);
      await countDeletes(page);
      const dialog = await askDelete(page, 'FT-2026-0003');
      if (how === 'Cancel') await dialog.getByRole('button', { name: 'Cancel' }).click();
      else await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger(page, 'FT-2026-0003')).toBeFocused();
      expect(await deleteCalls(page)).toEqual([]);
      expect(await storeSize(page)).toBe(200);
      await expect(link(page, 'FT-2026-0003')).toBeVisible();
    });
  }

  test('confirmed: the row goes BEFORE the server answers, the count drops by 1, then the store follows and a toast confirms', async ({ page }) => {
    await openList(page, '', SLOW);
    await expect(title(page)).toContainText('(200)');
    const dialog = await askDelete(page, 'FT-2026-0002');
    await dialog.getByRole('button', { name: 'Delete invoice' }).click();
    await expect(link(page, 'FT-2026-0002')).toHaveCount(0);
    await expect(title(page)).toContainText('(199)');
    expect(await inStore(page, 'FT-2026-0002')).toBe(true); // the server has not answered yet
    await expect(page.getByText('Invoice FT-2026-0002 deleted')).toBeVisible({ timeout: 10_000 });
    expect(await inStore(page, 'FT-2026-0002')).toBe(false);
    await expect(link(page, 'FT-2026-0002')).toHaveCount(0);
    await expect(title(page)).toContainText('(199)');
  });

  test('focus after the confirmation: straight to the "…" of the next row (no detour), and it stays there', async ({ page }) => {
    await openList(page);
    const dialog = await askDelete(page, 'FT-2026-0002');
    const trail = focusTrail(page, 1500);
    await dialog.getByRole('button', { name: 'Delete invoice' }).click();
    await expect(trigger(page, 'FT-2026-0003')).toBeFocused();
    const seen = await trail;
    // From the dialog's button, through the Dialog's own exit (`BODY`), to the target; nothing else, and it ends there.
    expect(seen.filter((s) => s !== 'BODY' && s !== 'Cancel' && s !== 'Delete invoice')).toEqual(['Actions for FT-2026-0003']);
    expect(seen[seen.length - 1]).toBe('Actions for FT-2026-0003');
  });

  test('focus after deleting the LAST row of the results: the "…" of the previous row', async ({ page }) => {
    await openList(page, 'q=FT-2026-001');
    expect(await shownNumbers(page)).toEqual(Array.from({ length: 10 }, (_, i) => `FT-2026-00${10 + i}`));
    const dialog = await askDelete(page, 'FT-2026-0019');
    await dialog.getByRole('button', { name: 'Delete invoice' }).click();
    await expect(trigger(page, 'FT-2026-0018')).toBeFocused();
    expect(await bodyHasFocus(page)).toBe(false);
  });

  test('focus after deleting the ONLY row of the results: the list title; "no results" with "Clear filters"', async ({ page }) => {
    await openList(page, 'q=FT-2026-0015');
    expect(await shownNumbers(page)).toEqual(['FT-2026-0015']);
    const dialog = await askDelete(page, 'FT-2026-0015');
    await dialog.getByRole('button', { name: 'Delete invoice' }).click();
    await expect(title(page)).toBeFocused();
    await expect(table(page).getByText('No results for the current filters')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
    await expect(page.getByText('Invoice FT-2026-0015 deleted')).toBeVisible();
  });

  test('deleteOutcome error: the row comes back at the same index, count restored, error toast, focus left where the user put it', async ({ page }) => {
    await openList(page, 'sort=amount.desc', `${SLOW};deleteOutcome:error`);
    const before = await shownNumbers(page);
    const target = before[2]!;
    const dialog = await askDelete(page, target);
    await dialog.getByRole('button', { name: 'Delete invoice' }).click();
    await expect(link(page, target)).toHaveCount(0);
    await expect(title(page)).toContainText('(199)');
    // The user moves on while the server works.
    await page.getByRole('button', { name: 'New invoice' }).focus();
    await expect(page.getByText(`Could not delete ${target}`)).toBeVisible({ timeout: 10_000 });
    await expect(link(page, target)).toBeVisible();
    expect(await shownNumbers(page)).toEqual(before);
    await expect(title(page)).toContainText('(200)');
    expect(await inStore(page, target)).toBe(true);
    await expect(page.getByRole('button', { name: 'New invoice' })).toBeFocused();
  });

  test('two deletes on different rows, the first still in flight: both hidden, both reach the store', async ({ page }) => {
    await openList(page, '', SLOW);
    await countDeletes(page);
    await (await askDelete(page, 'FT-2026-0002')).getByRole('button', { name: 'Delete invoice' }).click();
    await expect(confirmDialog(page, 'FT-2026-0002')).toHaveCount(0);
    await (await askDelete(page, 'FT-2026-0005')).getByRole('button', { name: 'Delete invoice' }).click();
    await expect(link(page, 'FT-2026-0002')).toHaveCount(0);
    await expect(link(page, 'FT-2026-0005')).toHaveCount(0);
    await expect(title(page)).toContainText('(198)');
    await expect.poll(() => storeSize(page), { timeout: 15_000 }).toBe(198);
    expect((await deleteCalls(page)).sort()).toEqual(['inv-2', 'inv-5']);
    await expect(title(page)).toContainText('(198)');
  });
});

test.describe('Showcase/Invoices: Crud (Delete from the record page)', () => {
  async function openRecordFromList(page: Page, number: string, args = FAST): Promise<void> {
    await openList(page, '', args);
    await link(page, number).click();
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
  }

  test('header: "Back to list" and "Delete"; pending: spinner, a second confirm ignored, Escape ignored; then the list without the record, a toast, focus on the title', async ({ page }) => {
    await openRecordFromList(page, 'FT-2026-0004', 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500');
    await expect(page.getByRole('button', { name: 'Back to list' })).toBeVisible();
    await countDeletes(page);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = confirmDialog(page, 'FT-2026-0004');
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText('Unsaved changes');
    const confirmButton = dialog.getByRole('button', { name: 'Delete invoice' });
    await confirmButton.click();
    await expect(confirmButton).toHaveAttribute('aria-disabled', 'true');
    await confirmButton.click({ force: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    expect(await deleteCalls(page)).toEqual(['inv-4']);
    await expect(table(page)).toBeVisible({ timeout: 10_000 });
    expect(params(page).get('record')).toBeNull();
    await expect(link(page, 'FT-2026-0004')).toHaveCount(0);
    expect(await inStore(page, 'FT-2026-0004')).toBe(false);
    await expect(page.getByText('Invoice FT-2026-0004 deleted')).toBeVisible();
    await expect(title(page)).toBeFocused();
    await expect(unsavedDialog(page)).toHaveCount(0);
    expect(await deleteCalls(page)).toEqual(['inv-4']);
  });

  test('with unsaved changes: the dialog warns; after the confirmation no "Unsaved changes", and Back/Forward do not bring it up either', async ({ page }) => {
    await openRecordFromList(page, 'FT-2026-0004');
    await page.getByRole('textbox', { name: /Amount/ }).fill('12345');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = confirmDialog(page, 'FT-2026-0004');
    await expect(dialog).toContainText('Unsaved changes will be lost too.');
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Delete invoice' }).click();
    await expect(table(page)).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
    await page.goForward();
    await expect(page.getByText('Invoice not found')).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
    await page.goBack();
    await expect(table(page)).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
  });

  test('after the delete, Forward reopens the record URL: "Invoice not found" with "Back to list"', async ({ page }) => {
    await openRecordFromList(page, 'FT-2026-0007');
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await confirmDialog(page, 'FT-2026-0007').getByRole('button', { name: 'Delete invoice' }).click();
    await expect(table(page)).toBeVisible();
    await page.goForward();
    expect(params(page).get('record')).toBe('inv-7');
    await expect(page.getByText('Invoice not found')).toBeVisible();
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(table(page)).toBeVisible();
  });

  test('server error: the dialog stays open and interactive, error toast, record still stored; Cancel gives the focus back to "Delete"', async ({ page }) => {
    await openRecordFromList(page, 'FT-2026-0004', `${FAST};deleteOutcome:error`);
    const remove = page.getByRole('button', { name: 'Delete', exact: true });
    await remove.click();
    const dialog = confirmDialog(page, 'FT-2026-0004');
    await dialog.getByRole('button', { name: 'Delete invoice' }).click();
    await expect(page.getByText('Could not delete FT-2026-0004')).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete invoice' })).not.toHaveAttribute('aria-disabled', 'true');
    expect(await inStore(page, 'FT-2026-0004')).toBe(true);
    expect(params(page).get('record')).toBe('inv-4');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeFocused();
  });

  test('"Delete" is aria-disabled while a Save is in flight: no confirmation, no delete', async ({ page }) => {
    await openRecordFromList(page, 'FT-2026-0004', HELD);
    await countDeletes(page);
    await page.getByRole('textbox', { name: 'Notes' }).fill('changed');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const remove = page.getByRole('button', { name: 'Delete', exact: true });
    await expect(remove).toHaveAttribute('aria-disabled', 'true');
    await remove.click({ force: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await deleteCalls(page)).toEqual([]);
  });

  test('deep link to a record, then Delete: back to the list with replaceState (no history entry added, still in the app)', async ({ page }) => {
    await page.goto(url('filter=open&record=inv-12', FAST));
    await expect(page.getByRole('heading', { level: 1, name: 'FT-2026-0012' })).toBeVisible();
    const entries = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await confirmDialog(page, 'FT-2026-0012').getByRole('button', { name: 'Delete invoice' }).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('record')).toBeNull();
    expect(params(page).get('filter')).toBe('open');
    expect(await page.evaluate(() => history.length)).toBe(entries);
    expect(new URL(page.url()).pathname).toContain('iframe.html');
    await expect(title(page)).toBeFocused();
  });
});
