import { expect, test, type Dialog, type Locator, type Page } from '@playwright/test';
import { browserBack } from './helpers/history';

// #525 (migration of e2e/showcase-edit-flow.spec.ts from Showcase/Invoices to the sales orders): List -> order -> edit ->
// save / discard -> the list that reflects the store. The invoice's "Amount" is the quantity of the first line (it drives
// the Total of the row); its "Open" pill is "Confirmed", its "Approved" status is "Shipped".
const FIXTURE = 'showcase-record-editing--sales-order-edit-flow-manual';
const LIST_QUERY = 'module=sales-orders&sales-orders.filter=confirmed&sales-orders.q=SO-2026&sales-orders.sort=total.desc';
const ITALIAN = ['Sezioni', 'Chiudi', 'Azioni di salvataggio', 'Modifiche non salvate', 'Nessun', 'Ordini', 'Cerca', 'Salva', 'Annulla'];

const table = (page: Page): Locator => page.getByRole('table', { name: /Sales orders/ });
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const title = (page: Page): Locator => page.getByRole('heading', { level: 2, name: /Sales orders/ });
const quantity = (page: Page): Locator => page.getByRole('textbox', { name: 'Line 1 quantity' });
const dialogOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const rowOf = (page: Page, number: string): Locator => page.getByRole('row').filter({ has: page.getByRole('link', { name: number, exact: true }) });
const linkAt = async (page: Page, n: number): Promise<string> => (await page.locator('a[data-record-id]').nth(n).innerText()).trim();

function url(query: string, args = ''): string {
  return `/iframe.html?id=${FIXTURE}&viewMode=story${query ? `&${query}` : ''}${args ? `&args=${encodeURIComponent(args)}` : ''}`;
}

async function openList(page: Page, query = LIST_QUERY, args = ''): Promise<void> {
  await page.goto(url(query, args));
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
}

async function openRecord(page: Page, number: string): Promise<void> {
  await page.getByRole('link', { name: number, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
  await expect(quantity(page)).toBeVisible();
}

/** Types a quantity different from the saved one (a value equal to it proves nothing) and waits for the save bar. */
async function typeQuantity(page: Page, value: string): Promise<void> {
  expect(await quantity(page).inputValue()).not.toBe(value);
  await quantity(page).fill(value);
  await expect(footer(page)).toBeVisible();
}

const stored = (page: Page): Promise<string> =>
  page.evaluate(
    () => JSON.stringify((window as unknown as { __ropShowcaseStore?: { snapshot: () => unknown } }).__ropShowcaseStore?.snapshot()),
  );

/** The Total cell of the row of `number`. */
const totalText = (page: Page, number: string): Promise<string> => rowOf(page, number).getByRole('cell').nth(4).innerText();

/** Records the `beforeunload` listeners alive on the page (add minus remove, by listener identity). */
async function trackBeforeUnload(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const live = new Set<unknown>();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, l: never, o?: never) => {
      if (type === 'beforeunload') live.add(l);
      add(type, l, o);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, l: never, o?: never) => {
      if (type === 'beforeunload') live.delete(l);
      remove(type, l, o);
    }) as typeof window.removeEventListener;
    (window as unknown as { __beforeUnloadCount: () => number }).__beforeUnloadCount = () => live.size;
  });
}
const beforeUnloadCount = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __beforeUnloadCount: () => number }).__beforeUnloadCount());

test.describe('Showcase/Record editing, orders: EditFlow (migrated from Showcase/Invoices)', () => {
  test('dirty + Back: Dialog; Keep editing keeps the value and focuses Back; Discard returns to an unchanged list', async ({ page }) => {
    await openList(page);
    const number = await linkAt(page, 2);
    const old = await totalText(page, number);
    const before = await stored(page);
    await openRecord(page, number);
    await typeQuantity(page, '47');
    await back(page).click();
    await expect(dialogOf(page)).toBeVisible();
    await expect(dialogOf(page).getByRole('button', { name: 'Close' })).toBeVisible();
    await dialogOf(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(quantity(page)).toHaveValue('47');
    await expect(back(page)).toBeFocused();
    expect(params(page).get('record')).not.toBeNull();

    await back(page).click();
    await dialogOf(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(table(page)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(0);
    expect(await totalText(page, number)).toBe(old);
    expect(await stored(page)).toBe(before);
  });

  test('a value put back to the original opens no Dialog', async ({ page }) => {
    await openList(page);
    const number = await linkAt(page, 1);
    await openRecord(page, number);
    const original = await quantity(page).inputValue();
    await typeQuantity(page, original === '3' ? '4' : '3');
    await quantity(page).fill(original);
    await expect(footer(page)).toHaveCount(0);
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(0);
  });

  test('Save then Back: no Dialog, the row shows the total the server derived and moves with the sort', async ({ page }) => {
    await openList(page);
    const number = await linkAt(page, 5);
    const positionOf = async () => (await page.getByRole('row').allInnerTexts()).findIndex((t) => t.includes(number));
    const before = await positionOf();
    await openRecord(page, number);
    await typeQuantity(page, '99999');
    const shown = (await page.locator('[data-order-total]').textContent()) ?? '';
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toHaveCount(0);
    await expect(quantity(page)).toHaveValue('99999');
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(0);
    expect(await totalText(page, number)).toBe(shown);
    expect(await positionOf()).toBeLessThan(before);
    // Sorted by Total descending, the biggest order of the list is the first row.
    await expect(page.getByRole('row').nth(1)).toContainText(number);
  });

  test('Confirmed filter, status changed to Shipped and saved: the row is gone, the count follows, focus on the title', async ({ page }) => {
    await openList(page, 'module=sales-orders&sales-orders.filter=confirmed&sales-orders.sort=total.desc');
    const parts = async () => /\((\d+)(?: of (\d+))?\)/.exec(await title(page).innerText());
    const count = async () => Number((await parts())?.[1]);
    const confirmed = await count();
    const total = (await parts())?.[2];
    expect(total).toBe('200');
    const number = await linkAt(page, 3);
    await openRecord(page, number);
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Shipped' }).click();
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toHaveCount(0);
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Confirmed' })).toBeChecked();
    await expect(page.getByRole('link', { name: number, exact: true })).toHaveCount(0);
    await expect.poll(count).toBe(confirmed - 1);
    expect((await parts())?.[2]).toBe(total); // the total of the store did not change
    await expect(title(page)).toBeFocused();
  });

  test('saveOutcome error: dirty with the message in the footer; Discard changes leaves an unchanged list', async ({ page }) => {
    await openList(page, LIST_QUERY, 'saveOutcome:error');
    const number = await linkAt(page, 2);
    const old = await totalText(page, number);
    const before = await stored(page);
    await openRecord(page, number);
    await typeQuantity(page, '555');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toContainText('Could not save the sales order');
    await expect(quantity(page)).toHaveValue('555');
    await back(page).click();
    await dialogOf(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(table(page)).toBeVisible();
    expect(await totalText(page, number)).toBe(old);
    expect(await stored(page)).toBe(before);
  });

  test('save in flight + Back + Leave anyway: immediate, the store gets the saved value, no warning or exception', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
    });
    await openList(page, LIST_QUERY, 'saveDelayMs:1500');
    const number = await linkAt(page, 2);
    const id = (await page.getByRole('link', { name: number, exact: true }).getAttribute('data-record-id')) ?? '';
    await openRecord(page, number);
    await typeQuantity(page, '2468');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await back(page).click();
    // #166: with a save in flight the dialog does not promise a discard.
    await expect(dialogOf(page)).toContainText('A save is still in progress');
    await expect(dialogOf(page).getByRole('button', { name: 'Discard changes' })).toHaveCount(0);
    await dialogOf(page).getByRole('button', { name: 'Leave anyway' }).click();
    // Immediate: the page changes well before the 1.5 s save ends (the list loads until the save settles).
    await expect(table(page)).toBeVisible({ timeout: 1000 });
    await expect(dialogOf(page)).toHaveCount(0);
    await expect
      .poll(() => stored(page).then((s) => (JSON.parse(s) as { id: string; lines: { quantity: number }[] }[]).find((r) => r.id === id)?.lines[0]?.quantity), {
        timeout: 5000,
      })
      .toBe(2468);
    expect(problems).toEqual([]);
  });

  // #154: browser Back with a dirty form asks first; "Leave" completes it, with the same end state.
  test('browser Back with a dirty form: Dialog first (record and value kept), Leave then gives a coherent list, no scroll lock, no beforeunload left', async ({ page }) => {
    await trackBeforeUnload(page);
    await openList(page);
    const number = await linkAt(page, 2);
    const old = await totalText(page, number);
    await openRecord(page, number);
    await typeQuantity(page, '1234');
    expect(await beforeUnloadCount(page)).toBe(1);
    browserBack(page);
    await expect(dialogOf(page)).toBeVisible();
    expect(params(page).get('record')).not.toBeNull();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(quantity(page)).toHaveValue('1234');
    browserBack(page);
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(table(page)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(0);
    expect(params(page).get('record')).toBeNull();
    expect(await totalText(page, number)).toBe(old);
    expect(await beforeUnloadCount(page)).toBe(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
  });

  test('reload: native confirmation with a dirty form, none with a clean one', async ({ page }) => {
    await openList(page);
    const number = await linkAt(page, 2);
    await openRecord(page, number);
    const dialogs: Dialog[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d);
      void d.accept();
    });
    await page.reload(); // clean: no prompt
    await expect(quantity(page)).toBeVisible();
    expect(dialogs).toHaveLength(0);
    await typeQuantity(page, '1234'); // dirty: the browser asks
    await page.reload();
    await expect(quantity(page)).toBeVisible();
    expect(dialogs.map((d) => d.type())).toEqual(['beforeunload']);
  });

  test('no Italian string in the DOM: list, record, Dialog, error', async ({ page }) => {
    await openList(page, LIST_QUERY, 'saveOutcome:error');
    const number = await linkAt(page, 2);
    const check = async () => {
      const text = await page.locator('body').innerText();
      for (const word of ITALIAN) expect(text, word).not.toContain(word);
    };
    await check();
    await openRecord(page, number);
    await typeQuantity(page, '12');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toContainText('Could not save');
    await check();
    await back(page).click();
    await expect(dialogOf(page)).toBeVisible();
    await check();
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('the whole round works with prefers-reduced-motion', async ({ page }) => {
      await openList(page);
      const number = await linkAt(page, 2);
      await openRecord(page, number);
      await typeQuantity(page, '700');
      const shown = (await page.locator('[data-order-total]').textContent()) ?? '';
      await back(page).click();
      await dialogOf(page).getByRole('button', { name: 'Keep editing' }).click();
      await expect(dialogOf(page)).toHaveCount(0);
      await footer(page).getByRole('button', { name: 'Save' }).click();
      await expect(footer(page)).toHaveCount(0);
      await back(page).click();
      await expect(table(page)).toBeVisible();
      await expect(rowOf(page, number)).toBeVisible();
      expect(await totalText(page, number)).toBe(shown);
      expect(await stored(page)).toContain('"quantity":700');
    });
  });
});
