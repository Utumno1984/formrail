import { expect, test, type Locator, type Page } from '@playwright/test';

// #525 (migration of e2e/showcase-list-to-record.spec.ts and showcase-list-to-record-qa.spec.ts from Showcase/Invoices to
// the sales orders): List Report -> Object Page as a dedicated page, and back. Same assertions, the data of the orders:
// the list parameters are the module's own (`sales-orders.*`), the pills are the statuses, the amount is the Total.
const FIXTURE = 'showcase-record-editing--sales-order-list-to-record-manual';
const LIST_PARAMS = { filter: 'sales-orders.filter', q: 'sales-orders.q', sort: 'sales-orders.sort' } as const;
const LIST_QUERY = `module=sales-orders&${LIST_PARAMS.filter}=confirmed&${LIST_PARAMS.q}=SO-2026&${LIST_PARAMS.sort}=total.desc`;
const ITALIAN = ['Sezioni', 'Chiudi', 'Azioni di salvataggio', 'Modifiche non salvate', 'Nessun', 'Ordini', 'Cerca'];

const table = (page: Page): Locator => page.getByRole('table', { name: /Sales orders/ });
const scroller = (page: Page): Locator => table(page).locator('..');
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;
const scrollTop = (page: Page): Promise<number> => scroller(page).evaluate((el) => el.scrollTop);
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const title = (page: Page): Locator => page.getByRole('heading', { level: 2, name: /Sales orders/ });
const firstLink = (page: Page): Locator => page.locator('a[data-record-id]').first();

const url = (query: string): string => `/iframe.html?id=${FIXTURE}&viewMode=story${query ? `&${query}` : ''}`;

async function openList(page: Page, query = 'module=sales-orders', args = ''): Promise<void> {
  await page.goto(`${url(query)}${args ? `&args=${encodeURIComponent(args)}` : ''}`);
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
}

/** Scrolls the table and returns the number of an order whose link is fully in view, below the sticky header. */
async function scrollAndPick(page: Page, top: number): Promise<string> {
  await scroller(page).evaluate((el, t) => void (el.scrollTop = t), top);
  await expect.poll(() => scrollTop(page)).toBe(top);
  await page.waitForTimeout(300); // the throttled position save (150 ms)
  const number = await scroller(page).evaluate((el) => {
    const area = el.getBoundingClientRect();
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
  expect([p.get(LIST_PARAMS.filter), p.get(LIST_PARAMS.q), p.get(LIST_PARAMS.sort)]).toEqual(['confirmed', 'SO-2026', 'total.desc']);
  await expect(page.getByRole('radio', { name: 'Confirmed' })).toBeChecked();
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('SO-2026');
  await expect(page.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(async () => Math.abs((await scrollTop(page)) - scrolled)).toBeLessThanOrEqual(1);
}

const activeIs = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector);

test.describe('Showcase/Record editing, orders: ListToRecord (migrated from Showcase/Invoices)', () => {
  test('the Number cell is a real link: href = list parameters + record, no reload on click', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const link = firstLink(page);
    const number = (await link.textContent()) ?? '';
    const id = (await link.getAttribute('data-record-id')) ?? '';
    const href = new URL((await link.getAttribute('href')) ?? '', page.url());
    expect(href.searchParams.get('record')).toBe(id);
    expect(href.searchParams.get('module')).toBe('sales-orders');
    expect([href.searchParams.get(LIST_PARAMS.filter), href.searchParams.get(LIST_PARAMS.q), href.searchParams.get(LIST_PARAMS.sort)]).toEqual([
      'confirmed',
      'SO-2026',
      'total.desc',
    ]);
    await page.evaluate(() => ((window as unknown as { __marker: string }).__marker = 'alive'));
    const entries = await page.evaluate(() => history.length);
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
    expect(params(page).get('record')).toBe(id);
    expect(await page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe('alive');
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);
    await expect(table(page)).toHaveCount(0);
  });

  test('the href follows the list parameters after a pill change', async ({ page }) => {
    await openList(page);
    await page.getByRole('radio', { name: 'Shipped' }).click();
    await expect(firstLink(page)).toHaveAttribute('href', new RegExp(`${LIST_PARAMS.filter}=shipped`));
  });

  test('Ctrl-click is left to the browser: no in-page navigation', async ({ page, context }) => {
    await openList(page, LIST_QUERY);
    const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await firstLink(page).click({ modifiers: ['Control'] });
    const opened = await popup;
    await opened?.close();
    expect(params(page).get('record')).toBeNull();
    await expect(table(page)).toBeVisible();
  });

  test('a double click leaves ONE history entry', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const number = (await firstLink(page).textContent()) ?? '';
    const entries = await page.evaluate(() => history.length);
    await firstLink(page).dblclick();
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  });

  test('a double click on Back to list goes back ONE entry: the list stays, the app is not left', async ({ page }) => {
    await page.goto('/index.json'); // an entry before the app, so that going back twice would leave it
    await page.goto(url(LIST_QUERY));
    await expect(table(page)).toBeVisible();
    await firstLink(page).click();
    await expect(back(page)).toBeVisible();
    await back(page).dblclick();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    expect(page.url()).toContain('iframe.html');
    expect(params(page).get('record')).toBeNull();
    expect(params(page).get(LIST_PARAMS.filter)).toBe('confirmed');
  });

  test('Back to list: URL, pill, search, sort and scroll restored, focus on the opened row link', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const number = await scrollAndPick(page, 600);
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.getByRole('link', { name: number, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
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
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
    const id = params(page).get('record');
    await page.goBack();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expectListView(page, 600);
    await expect(page.getByRole('link', { name: number, exact: true })).toBeFocused();
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
    expect(params(page).get('record')).toBe(id);
  });

  test('a row no longer in view on return: the focus goes to the list title, never to <body>', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const number = await scrollAndPick(page, 800);
    await page.getByRole('link', { name: number, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
    await page.evaluate(() => sessionStorage.clear()); // the stored position is gone: the list comes back at the top
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expect(title(page)).toBeFocused();
    expect(await activeIs(page, 'body')).toBe(false);
  });

  test('a slow list: loading first on return, then the table with the scroll restored and the focus on the link', async ({ page }) => {
    await openList(page, LIST_QUERY, 'listLoadDelayMs:1000');
    const number = await scrollAndPick(page, 600);
    await page.getByRole('link', { name: number, exact: true }).click();
    await expect(back(page)).toBeVisible();
    await back(page).click();
    await expect(page.getByRole('link', { name: number, exact: true })).toHaveCount(0); // nothing is scrolled or focused on the skeleton
    expect(await activeIs(page, 'a[data-record-id]')).toBe(false);
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expectListView(page, 600);
    await expect(page.getByRole('link', { name: number, exact: true })).toBeFocused();
  });

  test('deep link ?module=sales-orders&record=so-150: the detail; Back to list replaces the URL with the list defaults', async ({ page }) => {
    await page.goto(url('module=sales-orders&record=so-150'));
    await expect(page.getByRole('heading', { level: 1, name: /^SO-/ })).toBeVisible();
    const entries = await page.evaluate(() => history.length);
    await back(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('record')).toBeNull();
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(await page.evaluate(() => history.length)).toBe(entries);
    await expect(title(page)).toBeFocused();
  });

  test('?record=does-not-exist: the "not found" strip and a working Back to list', async ({ page }) => {
    await page.goto(url('module=sales-orders&record=does-not-exist'));
    await expect(page.getByText('Sales order not found')).toBeVisible();
    await back(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('record')).toBeNull();
  });

  test('invalid list parameters fall back to the defaults', async ({ page }) => {
    await openList(page, `module=sales-orders&${LIST_PARAMS.filter}=nope&${LIST_PARAMS.sort}=bogus.desc`);
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    await expect(page.getByRole('columnheader', { name: /Total/ })).not.toHaveAttribute('aria-sort', /ascending|descending/);
  });

  test('a list gesture with history=push still leaves Back to list working', async ({ page }) => {
    await openList(page, 'module=sales-orders', 'history:push');
    await page.getByRole('radio', { name: 'Confirmed' }).click();
    const number = (await firstLink(page).textContent()) ?? '';
    await firstLink(page).click();
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Confirmed' })).toBeChecked();
    expect(params(page).get('record')).toBeNull();
  });

  test('no Italian string in the DOM, list and detail', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const list = await page.evaluate(() => document.body.innerHTML);
    const number = (await firstLink(page).textContent()) ?? '';
    await firstLink(page).click();
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
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
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
    await back(page).tap();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expectListView(page, 600);
  });
});
