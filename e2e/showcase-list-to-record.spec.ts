import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

// #150: Showcase/Invoices -> ListToRecord. List Report -> Object Page as a dedicated page, and back.
const STORY = 'showcase-invoices--list-to-record';
const FIXTURE = 'showcase-invoices--list-to-record-manual';
const LIST_QUERY = 'filter=open&q=FT-2026-00&sort=amount.desc';

const ITALIAN = ['Sezioni', 'Chiudi', 'Azioni di salvataggio', 'Modifiche non salvate', 'Nessun', 'Fattur', 'Cerca'];

const table = (page: Page): Locator => page.getByRole('table', { name: /Invoices/ });
const scroller = (page: Page): Locator => table(page).locator('..');
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;
const scrollTop = (page: Page): Promise<number> => scroller(page).evaluate((el) => el.scrollTop);
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const title = (page: Page): Locator => page.getByRole('heading', { level: 2, name: /Invoices/ });

function url(query: string): string {
  return `/iframe.html?id=${FIXTURE}&viewMode=story${query ? `&${query}` : ''}`;
}

async function openList(page: Page, query = '', args = ''): Promise<void> {
  await page.goto(`${url(query)}${args ? `&args=${encodeURIComponent(args)}` : ''}`);
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
}

/** Scrolls the table and returns the number of an invoice whose link is fully in view, below the sticky header. */
async function scrollAndPick(page: Page, top: number): Promise<string> {
  await scroller(page).evaluate((el, t) => void (el.scrollTop = t), top);
  await expect.poll(() => scrollTop(page)).toBe(top);
  // Let the throttled position save (150 ms) run.
  await page.waitForTimeout(300);
  const number = await scroller(page).evaluate((el) => {
    const area = el.getBoundingClientRect();
    // The header cells are the sticky ones (the <thead> itself scrolls away).
    const head = Math.max(area.top, el.querySelector('th')?.getBoundingClientRect().bottom ?? area.top);
    const link = [...el.querySelectorAll<HTMLAnchorElement>('a[data-record-id]')].find((a) => {
      const r = a.getBoundingClientRect();
      return r.top > head + 40 && r.bottom < area.bottom - 10;
    });
    return link?.textContent ?? '';
  });
  expect(number).not.toBe('');
  return number;
}

async function expectListView(page: Page, scrolled: number): Promise<void> {
  const p = params(page);
  expect(p.get('record')).toBeNull();
  expect([p.get('filter'), p.get('q'), p.get('sort')]).toEqual(['open', 'FT-2026-00', 'amount.desc']);
  await expect(page.getByRole('radio', { name: 'Open' })).toBeChecked();
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('FT-2026-00');
  await expect(page.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(async () => Math.abs((await scrollTop(page)) - scrolled)).toBeLessThanOrEqual(1);
}

const activeIs = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector);

test.describe('Showcase/Invoices: ListToRecord', () => {
  test('the play function passes', async ({ page }) => {
    await expectPlayToPass(page, STORY);
  });

  test('the Number cell is a real link: href = list parameters + record, no reload on click', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const link = page.getByRole('link', { name: 'FT-2026-0012', exact: true });
    await expect(link).toHaveAttribute('data-record-id', 'inv-12');
    const href = new URL((await link.getAttribute('href')) ?? '', page.url());
    expect(href.searchParams.get('record')).toBe('inv-12');
    expect([href.searchParams.get('filter'), href.searchParams.get('q'), href.searchParams.get('sort')]).toEqual([
      'open',
      'FT-2026-00',
      'amount.desc',
    ]);

    await page.evaluate(() => ((window as unknown as { __marker: string }).__marker = 'alive'));
    const entries = await page.evaluate(() => history.length);
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: /FT-2026-0012/ })).toBeVisible();
    expect(params(page).get('record')).toBe('inv-12');
    expect(await page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe('alive');
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);
    await expect(table(page)).toHaveCount(0);
  });

  test('the href follows the list parameters after a filter change', async ({ page }) => {
    await openList(page);
    await page.getByRole('radio', { name: 'Approved' }).click();
    const first = page.locator('a[data-record-id]').first();
    await expect(first).toHaveAttribute('href', /filter=approved/);
  });

  test('Ctrl-click is left to the browser: no in-page navigation', async ({ page, context }) => {
    await openList(page, LIST_QUERY);
    const link = page.getByRole('link', { name: 'FT-2026-0012', exact: true });
    const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await link.click({ modifiers: ['Control'] });
    const opened = await popup;
    await opened?.close();
    expect(params(page).get('record')).toBeNull();
    await expect(table(page)).toBeVisible();
  });

  test('a double click leaves ONE history entry', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const entries = await page.evaluate(() => history.length);
    await page.getByRole('link', { name: 'FT-2026-0012', exact: true }).dblclick();
    await expect(page.getByRole('heading', { level: 1, name: /FT-2026-0012/ })).toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  });

  test('Back to list: URL, pill, search, sort and scroll restored, focus on the opened row link', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const number = await scrollAndPick(page, 600);
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.getByRole('link', { name: number, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    await expect(back(page)).toBeVisible();
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expectListView(page, 600);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    await expect(page.getByRole('link', { name: number, exact: true })).toBeFocused();
  });

  test('browser Back gives the same result and Forward reopens the same record', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const number = await scrollAndPick(page, 600);
    await page.getByRole('link', { name: number, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    const id = params(page).get('record');

    await page.goBack();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expectListView(page, 600);
    await expect(page.getByRole('link', { name: number, exact: true })).toBeFocused();

    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    expect(params(page).get('record')).toBe(id);
  });

  test('a row no longer in view on return: the focus goes to the list title, never to <body>', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const number = await scrollAndPick(page, 1500);
    await page.getByRole('link', { name: number, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    // The stored position is gone: the list comes back at the top, the opened row far below.
    await page.evaluate(() => sessionStorage.clear());
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expect(title(page)).toBeFocused();
    expect(await activeIs(page, 'body')).toBe(false);
  });

  test('a slow list: loading first on return, then the table with the scroll restored and the focus on the link', async ({
    page,
  }) => {
    await openList(page, LIST_QUERY, 'listLoadDelayMs:1000');
    const number = await scrollAndPick(page, 600);
    await page.getByRole('link', { name: number, exact: true }).click();
    await expect(back(page)).toBeVisible();
    await back(page).click();
    // Nothing is scrolled or focused while the skeleton is on screen.
    await expect(page.getByRole('link', { name: number, exact: true })).toHaveCount(0);
    expect(await activeIs(page, 'a[data-record-id]')).toBe(false);
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expectListView(page, 600);
    await expect(page.getByRole('link', { name: number, exact: true })).toBeFocused();
  });

  test('deep link ?record=inv-150: the detail; Back to list replaces the URL with the list defaults', async ({ page }) => {
    await page.goto(url('record=inv-150'));
    await expect(page.getByRole('heading', { level: 1, name: /FT-2026-0150/ })).toBeVisible();
    const entries = await page.evaluate(() => history.length);
    await back(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('record')).toBeNull();
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(await page.evaluate(() => history.length)).toBe(entries);
    await expect(title(page)).toBeFocused();
  });

  test('?record=does-not-exist: the "not found" strip and a working Back to list', async ({ page }) => {
    await page.goto(url('record=does-not-exist'));
    await expect(page.getByText('Invoice not found')).toBeVisible();
    await back(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('record')).toBeNull();
  });

  test('invalid list parameters fall back to the defaults', async ({ page }) => {
    await openList(page, 'filter=nope&sort=bogus.desc');
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    await expect(page.getByRole('columnheader', { name: /Amount/ })).not.toHaveAttribute(
      'aria-sort',
      /ascending|descending/,
    );
  });

  test('a list gesture with history=push still leaves Back to list working', async ({ page }) => {
    await openList(page, '', 'history:push');
    await page.getByRole('radio', { name: 'Open' }).click();
    const link = page.locator('a[data-record-id]').first();
    const number = (await link.textContent()) ?? '';
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Open' })).toBeChecked();
    expect(params(page).get('record')).toBeNull();
  });

  test('no Italian string in the DOM, list and detail', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const list = await page.evaluate(() => document.body.innerHTML);
    await page.getByRole('link', { name: 'FT-2026-0012', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /FT-2026-0012/ })).toBeVisible();
    const detail = await page.evaluate(() => document.body.innerHTML);
    for (const word of ITALIAN) {
      expect(list, `list contains "${word}"`).not.toContain(word);
      expect(detail, `detail contains "${word}"`).not.toContain(word);
    }
  });

  test('@touch a tap opens the record and Back to list restores the scroll', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const number = await scrollAndPick(page, 600);
    await page.getByRole('link', { name: number, exact: true }).tap();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    await back(page).tap();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expectListView(page, 600);
  });
});
