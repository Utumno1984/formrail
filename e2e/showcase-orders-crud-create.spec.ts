import { expect, test, type Locator, type Page } from '@playwright/test';

// #525 (part 2): the sales-order equivalents of the tests of `showcase-crud-create.spec.ts` that
// `showcase-sales-orders-crud.spec.ts` (#521) does not already cover, with the same titles (the invoice spec stays
// until #527). The mapping, test by test, is in the description of the pull request.
const FIXTURE = 'showcase-record-editing--sales-order-crud-manual';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
const SORTED = 'sales-orders.sort=total.desc';
// The same list parameters as the invoice spec's LIST_QUERY: a filter, a search and a sort.
const LIST_QUERY = 'sales-orders.filter=all&sales-orders.q=SO-2026&sales-orders.sort=total.desc';
const CUSTOMER = 'Hoevenstrand Coatings BV (EUR)';
const FIRST_NEW = 'SO-NEW-0201';

interface StoreOrder {
  id: string;
  number: string;
  customerName: string;
}
type W = { __ropShowcaseStore?: { snapshot: () => StoreOrder[] } };

const table = (page: Page): Locator => page.getByRole('table', { name: /Sales orders/ });
const scroller = (page: Page): Locator => table(page).locator('..');
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;
const newOrder = (page: Page): Locator => page.getByRole('button', { name: 'New sales order' });
const heading = (page: Page): Locator => page.getByRole('heading', { level: 1, name: 'New sales order' });
const create = (page: Page): Locator => page.getByRole('button', { name: 'Create' });
const cancel = (page: Page): Locator => page.getByRole('button', { name: 'Cancel' });
const backToList = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const notes = (page: Page): Locator => page.getByRole('textbox', { name: 'Notes' });
const unsavedDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
const store = (page: Page): Promise<StoreOrder[]> => page.evaluate(() => (window as unknown as W).__ropShowcaseStore?.snapshot() ?? []);
const createdToast = (page: Page): Locator => page.getByText(`Sales order ${FIRST_NEW} created`);
const newLink = (page: Page): Locator => page.getByRole('link', { name: FIRST_NEW, exact: true });
/** The first order link of the list (the data does not fix which number it is). */
const firstLink = (page: Page): Locator => page.locator('a[data-record-id]').first();

const url = (query: string, args = ''): string =>
  `/iframe.html?id=${FIXTURE}&viewMode=story${query ? `&${query}` : ''}${args ? `&args=${encodeURIComponent(args)}` : ''}`;

async function openList(page: Page, query = '', args = FAST): Promise<void> {
  await page.goto(url(query, args));
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
}

async function chooseCustomer(page: Page, name = CUSTOMER): Promise<void> {
  await page.getByRole('combobox', { name: /Customer/ }).click();
  await page.getByRole('option', { name }).click();
}

async function addLine(page: Page, quantity: string, unitPrice: string): Promise<void> {
  await page.getByRole('button', { name: 'Add line' }).click();
  await page.getByRole('combobox', { name: /Line 1 product/ }).click();
  await page.getByRole('option').first().click();
  await page.getByRole('textbox', { name: /Line 1 quantity/ }).fill(quantity);
  await page.getByRole('textbox', { name: /Line 1 unit price/ }).fill(unitPrice);
}

async function fillValid(page: Page, quantity = '1000', unitPrice = '100000.00'): Promise<void> {
  await chooseCustomer(page);
  await addLine(page, quantity, unitPrice);
}

test.describe('Showcase/Record editing, orders: Crud (Create), the rest of the invoice spec', () => {
  test('a new page is born clean: browser Back, untouched, leaves without a dialog (defaults)', async ({ page }) => {
    await openList(page, LIST_QUERY);
    await newOrder(page).click();
    await expect(heading(page)).toBeVisible();
    await expect(notes(page)).toHaveValue('');
    await expect(page.getByRole('region', { name: 'Save actions' })).toBeVisible();
    await page.goBack();
    await expect(table(page)).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
  });

  test('an invalid line quantity never reaches the store and focuses the field (the order rule of "Amount must be greater than 0")', async ({ page }) => {
    await openList(page);
    await newOrder(page).click();
    await fillValid(page, '0');
    await create(page).click();
    await expect(page.getByText(/^Quantity must be a whole number from 1 to 99,999/).first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Line 1 quantity/ })).toBeFocused();
    expect(await store(page)).toHaveLength(200);
  });

  test('a slow list after Create: loading first, the focus goes to the link only once the data is in', async ({ page }) => {
    await openList(page, SORTED, 'listLoadDelayMs:1200;recordLoadDelayMs:0;saveDelayMs:0');
    await newOrder(page).click();
    await fillValid(page);
    await create(page).click();
    // The return mounts a list that is still loading (skeleton rows: no link, no toast, nothing to focus yet)...
    await expect(table(page)).toBeVisible();
    await expect(newLink(page)).toHaveCount(0);
    await expect(createdToast(page)).toHaveCount(0);
    // ...and the focus lands on the new link when the data is in, with the toast announced then too.
    await expect(newLink(page)).toBeFocused({ timeout: 10_000 });
    await expect(createdToast(page)).toBeVisible();
  });

  test('Forward after the return reopens an EMPTY creation form, not the order that was created', async ({ page }) => {
    await openList(page);
    await newOrder(page).click();
    await fillValid(page, '5', '10.00');
    await create(page).click();
    await expect(table(page)).toBeVisible();
    await page.goForward();
    await expect(heading(page)).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Customer/ })).toContainText('Choose a customer');
    await expect(page.getByText('No lines')).toBeVisible();
    expect(await store(page)).toHaveLength(201); // still one created order
  });

  test('Create with saveDelayMs 0: still no "Unsaved changes", round after round', async ({ page }) => {
    for (let round = 0; round < 3; round += 1) {
      await openList(page);
      await newOrder(page).click();
      await fillValid(page, '2', '10.00');
      await create(page).click();
      await expect(table(page)).toBeVisible();
      await expect(unsavedDialog(page)).toHaveCount(0);
    }
  });

  test('filters, search, sort and scroll are restored after Create and after Cancel', async ({ page }) => {
    for (const how of ['create', 'cancel'] as const) {
      await openList(page, LIST_QUERY);
      await scroller(page).evaluate((el) => void (el.scrollTop = 500));
      await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBe(500);
      await page.waitForTimeout(300); // the throttled position save
      await newOrder(page).click();
      await expect(heading(page)).toBeVisible();
      if (how === 'create') {
        await fillValid(page, '1', '1.00');
        await create(page).click();
      } else {
        await cancel(page).click();
      }
      await expect(table(page)).toBeVisible();
      await expect(page.getByRole('row').nth(5)).toBeVisible();
      const p = params(page);
      expect([p.get('create'), p.get('sales-orders.filter'), p.get('sales-orders.q'), p.get('sales-orders.sort')]).toEqual([
        null,
        'all',
        'SO-2026',
        'total.desc',
      ]);
      await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('SO-2026');
      await expect(page.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
      await expect
        .poll(async () => Math.abs((await scroller(page).evaluate((el) => el.scrollTop)) - 500))
        .toBeLessThanOrEqual(1);
    }
  });

  test('history="push": New sales order -> Create returns to the list entry, not to an earlier one', async ({ page }) => {
    await openList(page, '', `${FAST};history:push`);
    await page.getByRole('radio', { name: 'Cancelled' }).click();
    await page.getByRole('searchbox', { name: 'Search' }).fill('SO-2026');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect.poll(() => params(page).get('sales-orders.q')).toBe('SO-2026');
    await newOrder(page).click();
    await fillValid(page, '2', '10.00');
    await create(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('create')).toBeNull();
    expect([params(page).get('sales-orders.filter'), params(page).get('sales-orders.q')]).toEqual(['cancelled', 'SO-2026']);
  });

  for (const [name, leave] of [
    ['Cancel', (p: Page) => cancel(p).click()],
    ['Back to list', (p: Page) => backToList(p).click()],
    // `history.back()` itself: `page.goBack()` waits for a navigation the guard (rightly) cancels.
    ['browser Back', (p: Page) => p.evaluate(() => history.back())],
  ] as const) {
    test(`${name} with edits asks; "Keep editing" keeps the values; "Discard changes" returns to the list, nothing created`, async ({ page }) => {
      await openList(page, LIST_QUERY);
      await newOrder(page).click();
      await notes(page).fill('draft');
      await leave(page);
      await expect(unsavedDialog(page)).toBeVisible();
      await page.getByRole('button', { name: 'Keep editing' }).click();
      await expect(notes(page)).toHaveValue('draft');
      await leave(page);
      await expect(unsavedDialog(page)).toBeVisible();
      await page.getByRole('button', { name: 'Discard changes' }).click();
      await expect(table(page)).toBeVisible();
      expect(params(page).get('create')).toBeNull();
      expect(await store(page)).toHaveLength(200);
    });
  }

  test('deep link ?create=1: Cancel replaces the entry with the list, nothing is left; after Create the list takes the same entry', async ({ page }) => {
    await page.goto('/index.json');
    await page.goto(url('module=sales-orders&create=1', FAST));
    await expect(heading(page)).toBeVisible();
    const entries = await page.evaluate(() => history.length);
    await cancel(page).click();
    await expect(table(page)).toBeVisible();
    expect(page.url()).toContain('iframe.html');
    expect(params(page).get('create')).toBeNull();
    expect(await page.evaluate(() => history.length)).toBe(entries);

    await page.goto(url('module=sales-orders&create=1', FAST));
    await fillValid(page, '2', '10.00');
    await create(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('create')).toBeNull();
    expect(page.url()).toContain('iframe.html');
  });

  test('a URL with BOTH record and create: the record shows (it wins) and "Back to list" clears both', async ({ page }) => {
    await openList(page, 'sales-orders.filter=all');
    const id = await firstLink(page).getAttribute('data-record-id');
    const number = (await firstLink(page).textContent())!;
    await page.goto('/index.json');
    await page.goto(url(`module=sales-orders&sales-orders.filter=all&record=${id}&create=1`, FAST));
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    await backToList(page).click();
    await expect(table(page)).toBeVisible();
    await expect(heading(page)).toHaveCount(0);
    expect([params(page).get('record'), params(page).get('create'), params(page).get('sales-orders.filter')]).toEqual([null, null, 'all']);
  });

  test('leaving for "New sales order" before the slow list after a Create has loaded: the toast still appears', async ({ page }) => {
    await openList(page, SORTED, 'listLoadDelayMs:1500;recordLoadDelayMs:0;saveDelayMs:0');
    await newOrder(page).click();
    await fillValid(page);
    await create(page).click();
    await expect(table(page)).toBeVisible(); // back on the list, still loading
    await expect(createdToast(page)).toHaveCount(0);
    await newOrder(page).click(); // another navigation before the data arrived
    await expect(heading(page)).toBeVisible();
    await expect(createdToast(page)).toBeVisible();
    expect(await store(page)).toHaveLength(201);
  });

  test(`the number is never reused: two Creates in a row get ${FIRST_NEW} and SO-NEW-0202`, async ({ page }) => {
    await openList(page);
    for (const expected of [FIRST_NEW, 'SO-NEW-0202']) {
      await newOrder(page).click();
      await fillValid(page, '2', '10.00');
      await create(page).click();
      await expect(table(page)).toBeVisible();
      await expect.poll(async () => (await store(page)).some((o) => o.number === expected)).toBe(true);
    }
    expect((await store(page)).map((o) => o.number).filter((n) => n.startsWith('SO-NEW-'))).toEqual([FIRST_NEW, 'SO-NEW-0202']);
  });

  test('an existing order still opens and saves in the CRUD showcase (Update unchanged)', async ({ page }) => {
    await openList(page);
    const number = (await firstLink(page).textContent())!;
    await firstLink(page).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(number) })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0); // clean: footer hidden
    await notes(page).fill('x');
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible();
  });
});

test.describe('Showcase/Record editing, orders: Crud, virtual keyboard on the creation page', () => {
  for (const [name, viewport] of [
    ['mobile', { width: 375, height: 667 }],
    ['tablet', { width: 768, height: 1024 }],
  ] as const) {
    test.describe(name, () => {
      test.use({ viewport, hasTouch: true });

      test('"Notes" stays above the keyboard and is not covered by the Create/Cancel footer', async ({ page }) => {
        await page.addInitScript(() => {
          const target = new EventTarget();
          let keyboard = 0;
          const vv = Object.defineProperties(target, {
            offsetTop: { value: 0 },
            offsetLeft: { value: 0 },
            pageTop: { value: 0 },
            pageLeft: { value: 0 },
            scale: { value: 1 },
            height: { get: () => window.innerHeight - keyboard },
            width: { get: () => window.innerWidth },
          });
          Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
          (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard = (px) => {
            keyboard = px;
            target.dispatchEvent(new Event('resize'));
          };
        });
        await openList(page);
        await newOrder(page).click();
        const field = notes(page);
        const bar = page.getByRole('region', { name: 'Save actions' });
        await expect(bar).toBeVisible();
        await page.locator('[data-object-page-scroller]').evaluate((el) => (el.scrollTop = el.scrollHeight));
        const keyboard = Math.round(viewport.height * 0.45);
        const rect = (loc: Locator) => loc.evaluate((el) => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
        await field.focus();
        await page.evaluate((px) => (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard(px), keyboard);
        await expect.poll(async () => (await rect(field)).bottom).toBeLessThanOrEqual(viewport.height - keyboard);
        expect((await rect(field)).top).toBeGreaterThanOrEqual(0);
        const fieldBox = await rect(field);
        const barBox = await rect(bar);
        expect(fieldBox.bottom <= barBox.top + 1 || fieldBox.top >= barBox.bottom - 1).toBe(true);
        await expect(field).toBeFocused();
      });
    });
  }
});
