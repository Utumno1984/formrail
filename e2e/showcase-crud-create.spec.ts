import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';

// #363: Showcase/Invoices -> Crud. "New invoice" -> the editor in creation mode -> Create -> the list.
const STORY = 'showcase-invoices--crud';
const FIXTURE = 'showcase-invoices--crud-manual';
const LIST_QUERY = 'filter=open&q=FT-2026-00&sort=amount.desc';
// Same without the search: "FT-2026-0201" does not contain "FT-2026-00", so the new record would be filtered out.
const SHOWN_QUERY = 'filter=open&sort=amount.desc';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';

const table = (page: Page): Locator => page.getByRole('table', { name: /Invoices/ });
const scroller = (page: Page): Locator => table(page).locator('..');
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;
const newInvoice = (page: Page): Locator => page.getByRole('button', { name: 'New invoice' });
const heading = (page: Page): Locator => page.getByRole('heading', { level: 1, name: 'New invoice' });
const create = (page: Page): Locator => page.getByRole('button', { name: 'Create' });
const cancel = (page: Page): Locator => page.getByRole('button', { name: 'Cancel' });
const backToList = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const amount = (page: Page): Locator => page.getByRole('textbox', { name: /Amount/ });
const store = (page: Page) => page.evaluate(() => window.__ropShowcaseStore?.snapshot() ?? []);

declare global {
  interface Window {
    __ropShowcaseStore?: { snapshot: () => { id: string; number: string; supplier: string; amount: number }[] };
  }
}

function url(query: string, args = ''): string {
  return `/iframe.html?id=${FIXTURE}&viewMode=story${query ? `&${query}` : ''}${args ? `&args=${encodeURIComponent(args)}` : ''}`;
}

async function openList(page: Page, query = '', args = FAST): Promise<void> {
  await page.goto(url(query, args));
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
}

async function chooseSupplier(page: Page, name = 'Bianchi Supplies'): Promise<void> {
  await page.getByRole('combobox', { name: /Supplier/ }).click();
  await page.getByRole('option', { name }).click();
}

async function fillValid(page: Page, value = '120.5'): Promise<void> {
  await chooseSupplier(page);
  await amount(page).fill(value);
}

const activeIs = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector);

const unsavedDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });

test.describe('Showcase/Invoices: Crud (Create)', () => {
  test('the play function passes', async ({ page }) => {
    await expectPlayToPass(page, STORY);
  });

  test('"New invoice" opens the creation page: create=1, one history entry (double click), focus on the title, list unmounted', async ({ page }) => {
    await openList(page, LIST_QUERY);
    const entries = await page.evaluate(() => history.length);
    await newInvoice(page).dblclick();
    await expect(heading(page)).toBeVisible();
    expect(params(page).get('create')).toBe('1');
    expect(params(page).get('filter')).toBe('open');
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);
    await expect(table(page)).toHaveCount(0);
    // The focus: with a single click (the second click of a double one lands on the new page and moves it).
    await page.goBack();
    await expect(table(page)).toBeVisible();
    await newInvoice(page).click();
    await expect(heading(page)).toBeFocused();
  });

  test('defaults: locked number, supplier and amount empty, status Open, dates, no badge, clean (Back leaves without a dialog)', async ({ page }) => {
    await openList(page, LIST_QUERY, `${FAST};today:2026-11-09`);
    await newInvoice(page).click();
    const number = page.getByRole('textbox', { name: /Invoice number/ });
    await expect(number).toHaveValue('Assigned on save');
    await expect(number).toHaveAttribute('readonly', '');
    await expect(page.getByRole('combobox', { name: /Supplier/ })).toContainText('Choose a supplier');
    await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Open');
    await expect(amount(page)).toHaveValue('');
    await expect(page.getByLabel('Invoice date')).toHaveValue('2026-11-09');
    await expect(page.getByLabel('Due date')).toHaveValue('2026-12-09');
    await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveValue('');
    await expect(page.getByRole('region', { name: 'Save actions' })).toBeVisible();
    await expect(page.locator('h1').locator('..').getByText('Open', { exact: true })).toHaveCount(0);
    // Browser Back, untouched: no dialog.
    await page.goBack();
    await expect(table(page)).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
  });

  test('no a11y violations on the creation page', async ({ page }) => {
    await openList(page);
    await newInvoice(page).click();
    await expect(heading(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('an invalid Create never reaches the store and focuses the first invalid field', async ({ page }) => {
    await openList(page);
    await newInvoice(page).click();
    await create(page).click();
    await expect(page.getByText('2 invalid fields')).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Supplier/ })).toBeFocused();
    expect(await store(page)).toHaveLength(200);
    await chooseSupplier(page);
    await amount(page).fill('0');
    await create(page).click();
    await expect(page.getByText('Amount must be greater than 0.').first()).toBeVisible();
    await expect(amount(page)).toBeFocused();
    expect(await store(page)).toHaveLength(200);
  });

  test('a valid Create (double click, Enter held) creates ONE record, returns to the list, no dialog, toast, focus on the link', async ({ page }) => {
    await openList(page, SHOWN_QUERY, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:200');
    const entries = await page.evaluate(() => history.length);
    await newInvoice(page).click();
    await fillValid(page, '99999.9');
    await create(page).dblclick();
    await create(page).press('Enter').catch(() => undefined);
    await expect(table(page)).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
    expect(params(page).get('create')).toBeNull();
    expect(await page.evaluate(() => history.length)).toBe(entries + 1); // the pushed entry is still there for Forward
    const created = (await store(page)).filter((r) => r.number === 'FT-2026-0201');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ supplier: 'Bianchi Supplies', amount: 99999.9 });
    expect(await store(page)).toHaveLength(201);
    await expect(page.getByText('Invoice FT-2026-0201 created')).toBeVisible();
    // Open + amount.desc: the new record is the first row, its link has the focus.
    const link = page.getByRole('link', { name: 'FT-2026-0201', exact: true });
    await expect(link).toBeVisible();
    await expect(link.locator('xpath=ancestor::tr')).toContainText('99.999,90');
    await expect(link).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: /Invoices/ })).toContainText('of 201');
  });

  test('a slow list after Create: loading first, the focus goes to the link only once the data is in', async ({ page }) => {
    await openList(page, SHOWN_QUERY, 'listLoadDelayMs:1200;recordLoadDelayMs:0;saveDelayMs:0');
    await newInvoice(page).click();
    await fillValid(page, '99999.9');
    await create(page).click();
    // The return mounts a list that is still loading (skeleton rows: no link, no toast, nothing to focus yet)...
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'FT-2026-0201', exact: true })).toHaveCount(0);
    await expect(page.getByText('Invoice FT-2026-0201 created')).toHaveCount(0);
    // ...and the focus lands on the new link when the data is in, with the toast announced then too.
    const link = page.getByRole('link', { name: 'FT-2026-0201', exact: true });
    await expect(link).toBeFocused({ timeout: 10_000 });
    await expect(page.getByText('Invoice FT-2026-0201 created')).toBeVisible();
  });

  test('Forward after the return reopens an EMPTY creation form, not the record that was created', async ({ page }) => {
    await openList(page);
    await newInvoice(page).click();
    await fillValid(page, '50');
    await create(page).click();
    await expect(table(page)).toBeVisible();
    await page.goForward();
    await expect(heading(page)).toBeVisible();
    await expect(amount(page)).toHaveValue('');
    expect(await store(page)).toHaveLength(201); // still one created record
  });

  test('Create with saveDelayMs 0: still no "Unsaved changes", also via history.back()', async ({ page }) => {
    for (let round = 0; round < 3; round += 1) {
      await openList(page);
      await newInvoice(page).click();
      await fillValid(page);
      await create(page).click();
      await expect(table(page)).toBeVisible();
      await expect(unsavedDialog(page)).toHaveCount(0);
    }
  });

  test('a Create hidden by the filters: the toast says so and the title takes the focus', async ({ page }) => {
    await openList(page, 'filter=approved');
    await newInvoice(page).click();
    await fillValid(page);
    await create(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByText('Invoice FT-2026-0201 created')).toBeVisible();
    await expect(page.getByText('Not shown with the current filters.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'FT-2026-0201' })).toHaveCount(0);
    await expect.poll(() => activeIs(page, 'h2')).toBe(true);
  });

  test('filters, search, sort and scroll are restored after Create and after Cancel', async ({ page }) => {
    for (const how of ['create', 'cancel'] as const) {
      await openList(page, LIST_QUERY);
      await scroller(page).evaluate((el) => void (el.scrollTop = 500));
      await expect.poll(() => scroller(page).evaluate((el) => el.scrollTop)).toBe(500);
      await page.waitForTimeout(300); // the throttled position save
      await newInvoice(page).click();
      await expect(heading(page)).toBeVisible();
      if (how === 'create') {
        await fillValid(page, '1');
        await create(page).click();
      } else {
        await cancel(page).click();
      }
      await expect(table(page)).toBeVisible();
      await expect(page.getByRole('row').nth(5)).toBeVisible();
      const p = params(page);
      expect([p.get('create'), p.get('filter'), p.get('q'), p.get('sort')]).toEqual([null, 'open', 'FT-2026-00', 'amount.desc']);
      await expect(page.getByRole('radio', { name: 'Open' })).toBeChecked();
      await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('FT-2026-00');
      await expect(page.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'descending');
      await expect
        .poll(async () => Math.abs((await scroller(page).evaluate((el) => el.scrollTop)) - 500))
        .toBeLessThanOrEqual(1);
    }
  });

  test('history="push": New invoice -> Create returns to the list entry, not to an earlier one', async ({ page }) => {
    await openList(page, '', `${FAST};history:push`);
    await page.getByRole('radio', { name: 'Open' }).click();
    await page.getByRole('searchbox', { name: 'Search' }).fill('FT-2026-00');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect.poll(() => params(page).get('q')).toBe('FT-2026-00');
    await newInvoice(page).click();
    await fillValid(page);
    await create(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('create')).toBeNull();
    expect([params(page).get('filter'), params(page).get('q')]).toEqual(['open', 'FT-2026-00']);
  });

  test('saveOutcome=error: stays on the page, values kept, error in the footer, nothing created, Create usable again', async ({ page }) => {
    await openList(page, '', `${FAST};saveOutcome:error`);
    await newInvoice(page).click();
    await fillValid(page, '33');
    await create(page).click();
    await expect(page.getByRole('region', { name: 'Save actions' })).toContainText(/network error/i);
    expect(params(page).get('create')).toBe('1');
    await expect(amount(page)).toHaveValue('33');
    await expect(page.getByRole('combobox', { name: /Supplier/ })).toContainText('Bianchi Supplies');
    expect(await store(page)).toHaveLength(200);
    await expect(create(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  for (const [name, leave] of [
    ['Cancel', (p: Page) => cancel(p).click()],
    ['Back to list', (p: Page) => backToList(p).click()],
    // `history.back()` itself: `page.goBack()` waits for a navigation the guard (rightly) cancels.
    ['browser Back', (p: Page) => p.evaluate(() => history.back())],
  ] as const) {
    test(`${name} with edits asks; "Keep editing" keeps the values; "Discard changes" returns to the list, nothing created`, async ({ page }) => {
      await openList(page, LIST_QUERY);
      await newInvoice(page).click();
      await page.getByRole('textbox', { name: 'Notes' }).fill('draft');
      await leave(page);
      await expect(unsavedDialog(page)).toBeVisible();
      await page.getByRole('button', { name: 'Keep editing' }).click();
      await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveValue('draft');
      await leave(page);
      await expect(unsavedDialog(page)).toBeVisible();
      await page.getByRole('button', { name: 'Discard changes' }).click();
      await expect(table(page)).toBeVisible();
      expect(params(page).get('create')).toBeNull();
      expect(await store(page)).toHaveLength(200);
    });
  }

  test('"Leave anyway" with a Create in flight: the list shows the new record once it lands', async ({ page }) => {
    await openList(page, SHOWN_QUERY, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500');
    await newInvoice(page).click();
    await fillValid(page, '99999');
    await create(page).click();
    await expect(create(page)).toHaveAttribute('aria-disabled', 'true');
    await cancel(page).click();
    await expect(page.getByText(/A save is still in progress/)).toBeVisible();
    await page.getByRole('button', { name: 'Leave anyway' }).click();
    // The list waits for the write in flight: the record is in the rows when they arrive.
    await expect(page.getByRole('link', { name: 'FT-2026-0201', exact: true })).toBeVisible({ timeout: 10_000 });
    expect(await store(page)).toHaveLength(201);
    expect(params(page).get('create')).toBeNull();
  });

  test('deep link ?create=1: Cancel replaces the entry with the list, nothing is left; after Create the list takes the same entry', async ({ page }) => {
    await page.goto('/index.json');
    await page.goto(url('create=1', FAST));
    await expect(heading(page)).toBeVisible();
    const entries = await page.evaluate(() => history.length);
    await cancel(page).click();
    await expect(table(page)).toBeVisible();
    expect(page.url()).toContain('iframe.html');
    expect(params(page).get('create')).toBeNull();
    expect(await page.evaluate(() => history.length)).toBe(entries);

    await page.goto(url('create=1', FAST));
    await fillValid(page);
    await create(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('create')).toBeNull();
    expect(page.url()).toContain('iframe.html');
  });

  test('the number is never reused: two Creates in a row get FT-2026-0201 and FT-2026-0202', async ({ page }) => {
    await openList(page);
    for (const expected of ['FT-2026-0201', 'FT-2026-0202']) {
      await newInvoice(page).click();
      await fillValid(page);
      await create(page).click();
      await expect(table(page)).toBeVisible();
      await expect.poll(async () => (await store(page)).some((r) => r.number === expected)).toBe(true);
    }
  });

  test('an existing record still opens and saves in the CRUD showcase (Update unchanged)', async ({ page }) => {
    await openList(page);
    await page.getByRole('link', { name: 'FT-2026-0012', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /FT-2026-0012/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0); // clean: footer hidden
    await page.getByRole('textbox', { name: 'Notes' }).fill('x');
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Discard' })).toBeVisible();
  });
});

test.describe('Showcase/Invoices: Crud, virtual keyboard on the creation page', () => {
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
        await newInvoice(page).click();
        const notes = page.getByRole('textbox', { name: 'Notes' });
        const bar = page.getByRole('region', { name: 'Save actions' });
        await expect(bar).toBeVisible();
        await page.locator('[data-object-page-scroller]').evaluate((el) => (el.scrollTop = el.scrollHeight));
        const keyboard = Math.round(viewport.height * 0.45);
        const rect = (loc: Locator) => loc.evaluate((el) => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
        await notes.focus();
        await page.evaluate((px) => (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard(px), keyboard);
        await expect.poll(async () => (await rect(notes)).bottom).toBeLessThanOrEqual(viewport.height - keyboard);
        expect((await rect(notes)).top).toBeGreaterThanOrEqual(0);
        const field = await rect(notes);
        const barBox = await rect(bar);
        expect(field.bottom <= barBox.top + 1 || field.top >= barBox.bottom - 1).toBe(true);
        await expect(notes).toBeFocused();
      });
    });
  }
});
