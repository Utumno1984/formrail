import { expect, test, type Dialog, type Locator, type Page } from '@playwright/test';
import { browserBack } from './helpers/history';
import { expectPlayToPass } from './helpers/story';

// #151: Showcase/Invoices -> EditFlow. List -> record -> edit -> save / discard -> list that reflects the store.
const STORY = 'showcase-invoices--edit-flow';
const FIXTURE = 'showcase-invoices--edit-flow-manual';
const LIST_QUERY = 'filter=open&q=FT-2026-00&sort=amount.desc';

const ITALIAN = ['Sezioni', 'Chiudi', 'Azioni di salvataggio', 'Modifiche non salvate', 'Nessun', 'Fattur', 'Cerca', 'Salva', 'Annulla'];

const table = (page: Page): Locator => page.getByRole('table', { name: /Invoices/ });
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const title = (page: Page): Locator => page.getByRole('heading', { level: 2, name: /Invoices/ });
const amountInput = (page: Page): Locator => page.getByRole('textbox', { name: /Amount/ });
const dialogOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const rowOf = (page: Page, number: string): Locator => page.getByRole('row').filter({ has: page.getByRole('link', { name: number, exact: true }) });

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
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
  await expect(amountInput(page)).toBeVisible();
}

async function typeAmount(page: Page, value: string): Promise<void> {
  await amountInput(page).fill(value);
  await expect(footer(page)).toBeVisible();
}

const stored = (page: Page): Promise<string> =>
  page.evaluate(
    () => JSON.stringify((window as unknown as { __ropShowcaseStore?: { snapshot: () => unknown } }).__ropShowcaseStore?.snapshot()),
  );

const amountText = (page: Page, number: string): Promise<string> => rowOf(page, number).getByRole('cell').nth(3).innerText();

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

test.describe('Showcase/Invoices: EditFlow', () => {
  test('the play function passes', async ({ page }) => {
    await expectPlayToPass(page, STORY);
  });

  test('dirty + Back: Dialog; Keep editing keeps the value and focuses Back; Discard returns to an unchanged list', async ({ page }) => {
    await openList(page);
    const number = (await page.locator('a[data-record-id]').nth(2).innerText()).trim();
    const old = await amountText(page, number);
    const before = await stored(page);
    await openRecord(page, number);
    await typeAmount(page, '4321.5');
    await back(page).click();
    await expect(dialogOf(page)).toBeVisible();
    await expect(dialogOf(page).getByRole('button', { name: 'Close' })).toBeVisible();
    await dialogOf(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(amountInput(page)).toHaveValue('4321.5');
    await expect(back(page)).toBeFocused();
    expect(params(page).get('record')).not.toBeNull();

    await back(page).click();
    await dialogOf(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(table(page)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(0);
    expect(await amountText(page, number)).toBe(old);
    expect(await stored(page)).toBe(before);
  });

  test('a value put back to the original opens no Dialog', async ({ page }) => {
    await openList(page);
    const number = (await page.locator('a[data-record-id]').nth(1).innerText()).trim();
    await openRecord(page, number);
    const original = await amountInput(page).inputValue();
    await typeAmount(page, '1');
    await amountInput(page).fill(original);
    await expect(footer(page)).toHaveCount(0);
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(0);
  });

  test('Save then Back: no Dialog, the row shows the normalized amount and moves with the sort', async ({ page }) => {
    await openList(page);
    const number = (await page.locator('a[data-record-id]').nth(5).innerText()).trim();
    await openRecord(page, number);
    await typeAmount(page, '99999.999');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toHaveCount(0);
    await expect(amountInput(page)).toHaveValue('100000.00');
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(0);
    expect(await amountText(page, number)).toBe('100.000,00 €');
    await expect(page.getByRole('row').nth(1)).toContainText(number);
  });

  test('Open filter, status changed to Approved and saved: the row is gone, the count follows, focus on the title', async ({ page }) => {
    await openList(page, 'filter=open&sort=amount.desc');
    const parts = async () => /\((\d+)(?: of (\d+))?\)/.exec(await page.getByRole('heading', { level: 2, name: /Invoices/ }).innerText());
    const count = async () => Number((await parts())?.[1]);
    const open = await count();
    const total = (await parts())?.[2];
    expect(total).toBe('200');
    const number = (await page.locator('a[data-record-id]').nth(3).innerText()).trim();
    await openRecord(page, number);
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: 'Approved' }).click();
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toHaveCount(0);
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Open' })).toBeChecked();
    await expect(page.getByRole('link', { name: number, exact: true })).toHaveCount(0);
    await expect.poll(count).toBe(open - 1);
    expect((await parts())?.[2]).toBe(total); // the total of the store did not change
    await expect(title(page)).toBeFocused();
  });

  test('saveOutcome error: dirty with the message in the footer; Discard changes leaves an unchanged list', async ({ page }) => {
    await openList(page, LIST_QUERY, 'saveOutcome:error');
    const number = (await page.locator('a[data-record-id]').nth(2).innerText()).trim();
    const old = await amountText(page, number);
    const before = await stored(page);
    await openRecord(page, number);
    await typeAmount(page, '555');
    await footer(page).getByRole('button', { name: 'Save' }).click();
    await expect(footer(page)).toContainText('Could not save the invoice');
    await expect(amountInput(page)).toHaveValue('555');
    await back(page).click();
    await dialogOf(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(table(page)).toBeVisible();
    expect(await amountText(page, number)).toBe(old);
    expect(await stored(page)).toBe(before);
  });

  test('save in flight + Back + Leave anyway: immediate, the store gets the saved value, no warning or exception', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
    });
    await openList(page, LIST_QUERY, 'saveDelayMs:1500');
    const number = (await page.locator('a[data-record-id]').nth(2).innerText()).trim();
    const id = (await page.getByRole('link', { name: number, exact: true }).getAttribute('data-record-id')) ?? '';
    await openRecord(page, number);
    await typeAmount(page, '2468.13');
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
      .poll(() => stored(page).then((s) => (JSON.parse(s) as { id: string; amount: number }[]).find((r) => r.id === id)?.amount), {
        timeout: 5000,
      })
      .toBe(2468.13);
    expect(problems).toEqual([]);
  });

  // #154 lifted the former "documented limit" of this test (browser Back with a dirty form went to the list
  // with no Dialog and lost the edits): now Back asks first; "Leave" completes it, with the same end state.
  test('browser Back with a dirty form: Dialog first (record and value kept), Leave then gives a coherent list, no scroll lock, no beforeunload left', async ({ page }) => {
    await trackBeforeUnload(page);
    await openList(page);
    const number = (await page.locator('a[data-record-id]').nth(2).innerText()).trim();
    const old = await amountText(page, number);
    await openRecord(page, number);
    await typeAmount(page, '1234');
    expect(await beforeUnloadCount(page)).toBe(1);
    browserBack(page);
    await expect(dialogOf(page)).toBeVisible();
    expect(params(page).get('record')).not.toBeNull();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(amountInput(page)).toHaveValue('1234');
    browserBack(page);
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(table(page)).toBeVisible();
    await expect(dialogOf(page)).toHaveCount(0);
    expect(params(page).get('record')).toBeNull();
    expect(await amountText(page, number)).toBe(old);
    expect(await beforeUnloadCount(page)).toBe(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
  });

  test('reload: native confirmation with a dirty form, none with a clean one', async ({ page }) => {
    await openList(page);
    const number = (await page.locator('a[data-record-id]').nth(2).innerText()).trim();
    await openRecord(page, number);
    const dialogs: Dialog[] = [];
    page.on('dialog', (d) => {
      dialogs.push(d);
      void d.accept();
    });
    // Clean: the page reloads with no prompt.
    await page.reload();
    await expect(amountInput(page)).toBeVisible();
    expect(dialogs).toHaveLength(0);
    // Dirty: the browser asks.
    await typeAmount(page, '1234');
    await page.reload();
    await expect(amountInput(page)).toBeVisible();
    expect(dialogs.map((d) => d.type())).toEqual(['beforeunload']);
  });

  test('no Italian string in the DOM: list, record, Dialog, error', async ({ page }) => {
    await openList(page, LIST_QUERY, 'saveOutcome:error');
    const number = (await page.locator('a[data-record-id]').nth(2).innerText()).trim();
    const check = async () => {
      const text = await page.locator('body').innerText();
      for (const word of ITALIAN) expect(text, word).not.toContain(word);
    };
    await check();
    await openRecord(page, number);
    await typeAmount(page, '12');
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
      const number = (await page.locator('a[data-record-id]').nth(2).innerText()).trim();
      await openRecord(page, number);
      await typeAmount(page, '700');
      await back(page).click();
      await dialogOf(page).getByRole('button', { name: 'Keep editing' }).click();
      await expect(dialogOf(page)).toHaveCount(0);
      await footer(page).getByRole('button', { name: 'Save' }).click();
      await expect(footer(page)).toHaveCount(0);
      await back(page).click();
      await expect(table(page)).toBeVisible();
      expect(await amountText(page, number)).toBe('700,00 €');
    });
  });
});
