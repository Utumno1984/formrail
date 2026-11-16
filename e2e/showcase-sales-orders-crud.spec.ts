import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';

// #521: Showcase/Record editing -> the Sales orders module with creation, deletion and bulk deletion
// (`SalesOrderCrud*`). The equivalents, for the orders, of showcase-crud-create / -delete / -bulk-delete (the
// invoices' specs stay as they are until #527).
const FIXTURE = 'showcase-record-editing--sales-order-crud-manual';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
const SORTED = 'sales-orders.sort=total.desc';
const CUSTOMER = 'Hoevenstrand Coatings BV (EUR)';
const VISUAL_STORIES = [
  'sales-order-create-empty',
  'sales-order-create-invalid',
  'sales-order-create-saving',
  'sales-order-delete-confirm-list',
  'sales-order-bulk-delete-idle',
  'sales-order-bulk-delete-selected',
  'sales-order-bulk-delete-confirm',
  'sales-order-delete-confirm-record-pending',
];
// The seed's first orders, in the order of the unsorted list.
const SECOND = 'SO-2026-018000002';
const THIRD = 'SO-2026-056000003';
const FOURTH = 'SO-2026-038000004';
const FIFTH = 'SO-2026-144000005';

interface StoreOrder {
  id: string;
  number: string;
  customerName: string;
  currency: string;
  status: string;
  totalMinor: number;
  lines: { quantity: number; unitPriceMinor: number }[];
}
interface OrdersStore {
  snapshot: () => StoreOrder[];
  delete: (id: string) => Promise<void>;
  create: (draft: unknown) => Promise<StoreOrder>;
  deleteMany: (ids: string[]) => Promise<void>;
  configure: (config: object) => void;
}
// The page's window as these tests see it (typed here, not as a global: other specs type the same property their way).
type W = { __ropShowcaseStore?: OrdersStore; __ropCalls?: { create: number; delete: string[]; deleteMany: string[][] } };

const table = (page: Page): Locator => page.getByRole('table', { name: /Sales orders/ });
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;
const newOrder = (page: Page): Locator => page.getByRole('button', { name: 'New sales order' });
const heading = (page: Page): Locator => page.getByRole('heading', { level: 1, name: 'New sales order' });
const create = (page: Page): Locator => page.getByRole('button', { name: 'Create' });
const cancel = (page: Page): Locator => page.getByRole('button', { name: 'Cancel' });
const unsavedDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
const trigger = (page: Page, number: string): Locator => page.getByRole('button', { name: `Actions for ${number}`, exact: true });
const rowBox = (page: Page, number: string): Locator => page.getByRole('checkbox', { name: `Select ${number}`, exact: true });
const counter = (page: Page): Locator => page.locator('[data-rop-selection-count]');
const store = (page: Page): Promise<StoreOrder[]> => page.evaluate(() => (window as unknown as W).__ropShowcaseStore?.snapshot() ?? []);

const url = (query: string, args: string): string =>
  `/iframe.html?id=${FIXTURE}&viewMode=story${query ? `&${query}` : ''}&args=${encodeURIComponent(args)}`;

async function openList(page: Page, query = '', args = FAST): Promise<void> {
  await page.goto(url(query, args));
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
}

async function chooseCustomer(page: Page, name = CUSTOMER): Promise<void> {
  await page.getByRole('combobox', { name: /Customer/ }).click();
  await page.getByRole('option', { name }).click();
}

/** Adds line 1 with the first product and the given quantity and price. */
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

/** Counts the calls that reach the store (the showcase's wrapper calls the store at call time). */
async function countCalls(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = (window as unknown as W).__ropShowcaseStore!;
    (window as unknown as W).__ropCalls = { create: 0, delete: [], deleteMany: [] };
    const [create, del, many] = [s.create.bind(s), s.delete.bind(s), s.deleteMany.bind(s)];
    s.create = (d) => {
      (window as unknown as W).__ropCalls!.create += 1;
      return create(d);
    };
    s.delete = (id) => {
      (window as unknown as W).__ropCalls!.delete.push(id);
      return del(id);
    };
    s.deleteMany = (ids) => {
      (window as unknown as W).__ropCalls!.deleteMany.push(ids);
      return many(ids);
    };
  });
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as W).__ropCalls!);

const shownNumbers = (page: Page): Promise<string[]> =>
  page.getByRole('button', { name: /^Actions for / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.slice(12)));

async function askDelete(page: Page, number: string): Promise<Locator> {
  await trigger(page, number).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Delete sales order ${number}?` });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Showcase/Record editing: the stories of the creation and deletion play', () => {
  for (const id of ['sales-order-crud', 'sales-order-crud-delete', 'sales-order-crud-bulk-delete', ...VISUAL_STORIES]) {
    test(`${id}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, `showcase-record-editing--${id}`);
    });
  }

  test('the deletes also play with deleteOutcome error (the rows come back, the toast says so)', async ({ page }) => {
    await expectPlayToPass(page, 'showcase-record-editing--sales-order-crud-delete', 'deleteOutcome:error');
    await expectPlayToPass(page, 'showcase-record-editing--sales-order-crud-bulk-delete', 'deleteOutcome:error');
  });

  test('the reduced-motion preference leads the visual stories to the same end state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const id of VISUAL_STORIES) await expectPlayToPass(page, `showcase-record-editing--${id}`);
  });
});

test.describe('Showcase/Record editing: creating a sales order', () => {
  test('"New sales order" (double click): create=1, ONE history entry, the title takes the focus, the list is gone', async ({ page }) => {
    await openList(page);
    const entries = await page.evaluate(() => history.length);
    await newOrder(page).dblclick();
    await expect(heading(page)).toBeVisible();
    expect(params(page).get('create')).toBe('1');
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);
    await expect(table(page)).toHaveCount(0);
    // The focus: with a single click (the second click of a double one lands on the new page and moves it).
    await page.goBack();
    await expect(table(page)).toBeVisible();
    await newOrder(page).click();
    await expect(heading(page)).toBeFocused();
  });

  test('defaults: locked number and currency, no customer, no line, draft, dates, the Create footer already there; no a11y violation', async ({ page }) => {
    await openList(page, '', `${FAST};today:2026-11-09`);
    await newOrder(page).click();
    await expect(page.getByRole('textbox', { name: /Order number/ })).toHaveValue('Assigned on save');
    await expect(page.getByRole('textbox', { name: /Currency/ })).toHaveValue('Set by the customer');
    await expect(page.getByRole('combobox', { name: /Customer/ })).toContainText('Choose a customer');
    await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Draft');
    await expect(page.getByLabel(/Order date/)).toHaveValue('2026-11-09');
    await expect(page.getByLabel(/^Requested delivery/)).toHaveValue('2026-11-23');
    await expect(page.getByText('No lines')).toBeVisible();
    await expect(create(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('a new page is born clean: Cancel leaves with no dialog and creates nothing', async ({ page }) => {
    await openList(page);
    await newOrder(page).click();
    await cancel(page).click();
    await expect(table(page)).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
    expect(await store(page)).toHaveLength(200);
  });

  // Every editable field: change it -> Cancel asks, "Keep editing" stays; put it back -> Cancel leaves with no question.
  const edits: [string, (page: Page) => Promise<() => Promise<void>>][] = [
    ['customer reference', async (page) => {
      const el = page.getByRole('textbox', { name: 'Customer reference' });
      await el.fill('PO-1');
      return () => el.fill('');
    }],
    ['delivery instructions', async (page) => {
      const el = page.getByRole('textbox', { name: 'Delivery instructions' });
      await el.fill('Dock 3');
      return () => el.fill('');
    }],
    ['notes', async (page) => {
      const el = page.getByRole('textbox', { name: 'Notes' });
      await el.fill('Fragile');
      return () => el.fill('');
    }],
    ['order date', async (page) => {
      const el = page.getByLabel(/Order date/);
      await el.fill('2026-11-10');
      return () => el.fill('2026-11-09');
    }],
    ['requested delivery', async (page) => {
      const el = page.getByLabel(/^Requested delivery/);
      await el.fill('2026-11-24');
      return () => el.fill('2026-11-23');
    }],
    ['status', async (page) => {
      await page.getByRole('combobox', { name: 'Status' }).click();
      await page.getByRole('option', { name: 'Confirmed' }).click();
      return async () => {
        await page.getByRole('combobox', { name: 'Status' }).click();
        await page.getByRole('option', { name: 'Draft' }).click();
      };
    }],
    ['lines', async (page) => {
      await page.getByRole('button', { name: 'Add line' }).click();
      return () => page.getByRole('button', { name: /^Remove/ }).click();
    }],
  ];
  for (const [name, edit] of edits) {
    test(`dirty-tracking, ${name}: changed -> Cancel asks; put back -> Cancel leaves`, async ({ page }) => {
      await openList(page, '', `${FAST};today:2026-11-09`);
      await newOrder(page).click();
      const undo = await edit(page);
      await cancel(page).click();
      await expect(unsavedDialog(page)).toBeVisible();
      await page.getByRole('button', { name: 'Keep editing' }).click();
      await expect(heading(page)).toBeVisible();
      await undo();
      await cancel(page).click();
      await expect(table(page)).toBeVisible();
      await expect(unsavedDialog(page)).toHaveCount(0);
      expect(await store(page)).toHaveLength(200);
    });
  }

  test('the customer: choosing one is a change, and the currency comes with it', async ({ page }) => {
    await openList(page);
    await newOrder(page).click();
    await chooseCustomer(page, 'Quillenbrook Components Corp. (USD)');
    await expect(page.getByRole('textbox', { name: /Currency/ })).toHaveValue('USD');
    await cancel(page).click();
    await expect(unsavedDialog(page)).toBeVisible();
  });

  test('an invalid Create never reaches the store and focuses the first invalid field; an unfinished line is reported, not dropped', async ({ page }) => {
    await openList(page);
    await newOrder(page).click();
    await countCalls(page);
    await create(page).click();
    await expect(page.getByText('2 invalid fields')).toBeVisible();
    await expect(page.getByText('Customer is required.')).toBeVisible();
    await expect(page.getByText('Add at least one line.')).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Customer/ })).toBeFocused();
    await chooseCustomer(page);
    await page.getByRole('button', { name: 'Add line' }).click();
    await create(page).click();
    await expect(page.getByText('Choose a product.')).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Line 1 product/ })).toBeFocused();
    expect((await calls(page)).create).toBe(0);
    expect(await store(page)).toHaveLength(200);
  });

  test('delivery: the day before the order date is refused, the same day accepted', async ({ page }) => {
    await openList(page, '', `${FAST};today:2026-11-09`);
    await newOrder(page).click();
    await fillValid(page);
    await page.getByLabel(/^Requested delivery/).fill('2026-11-08');
    await create(page).click();
    await expect(page.getByText('Requested delivery cannot be before the order date.').first()).toBeVisible();
    expect(await store(page)).toHaveLength(200);
    await page.getByLabel(/^Requested delivery/).fill('2026-11-09');
    await create(page).click();
    await expect(table(page)).toBeVisible();
    expect(await store(page)).toHaveLength(201);
  });

  test('a valid Create (double click) creates ONE order, returns to the list with sort kept, no dialog, toast, focus on the new link', async ({ page }) => {
    await openList(page, SORTED, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:200');
    const entries = await page.evaluate(() => history.length);
    await newOrder(page).click();
    await fillValid(page);
    await countCalls(page);
    await create(page).dblclick();
    await expect(table(page)).toBeVisible();
    await expect(unsavedDialog(page)).toHaveCount(0);
    expect(params(page).get('create')).toBeNull();
    expect(params(page).get('sales-orders.sort')).toBe('total.desc');
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);
    expect((await calls(page)).create).toBe(1);
    const created = (await store(page)).filter((o) => o.number === 'SO-NEW-0201');
    expect(created).toHaveLength(1);
    // 1000 x 100,000.00 = 100,000,000.00
    expect(created[0]).toMatchObject({ customerName: 'Hoevenstrand Coatings BV', currency: 'EUR', status: 'draft', totalMinor: 10_000_000_000 });
    expect(await store(page)).toHaveLength(201);
    await expect(page.getByText('Sales order SO-NEW-0201 created')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toContainText('201');
    // Sorted by Total descending: the new order is the first row, its link has the focus.
    const link = page.getByRole('link', { name: 'SO-NEW-0201', exact: true });
    await expect(link).toBeVisible();
    await expect(link).toBeFocused();
    await expect(page.getByRole('row').nth(1)).toContainText('SO-NEW-0201');
  });

  test('filters and search are kept after Create; an order the filters hide is announced as such, the title takes the focus', async ({ page }) => {
    await openList(page, 'sales-orders.filter=cancelled');
    await newOrder(page).click();
    await fillValid(page);
    await create(page).click();
    await expect(table(page)).toBeVisible();
    expect(params(page).get('sales-orders.filter')).toBe('cancelled');
    await expect(page.getByText('Not shown with the current filters.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toBeFocused();
  });

  test('"Leave anyway" with a Create in flight: the list shows the new order once it lands', async ({ page }) => {
    await openList(page, SORTED, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500');
    await newOrder(page).click();
    await fillValid(page);
    await create(page).click();
    await expect(create(page)).toHaveAttribute('aria-disabled', 'true');
    await cancel(page).click();
    await expect(page.getByText(/A save is still in progress/)).toBeVisible();
    await page.getByRole('button', { name: 'Leave anyway' }).click();
    // The list waits for the write in flight: the order is in the rows when they arrive.
    await expect(page.getByRole('link', { name: 'SO-NEW-0201', exact: true })).toBeVisible({ timeout: 10_000 });
    expect(await store(page)).toHaveLength(201);
    expect(params(page).get('create')).toBeNull();
  });

  test('saveOutcome=error: the page stays, the values are kept, the message is in the footer, nothing is created, Create works again', async ({ page }) => {
    await openList(page, '', `${FAST};saveOutcome:error`);
    await newOrder(page).click();
    await fillValid(page, '3', '10.50');
    await create(page).click();
    await expect(page.getByRole('region', { name: 'Save actions' })).toContainText(/Could not save/i);
    expect(await store(page)).toHaveLength(200);
    await expect(page.getByRole('textbox', { name: /Line 1 quantity/ })).toHaveValue('3');
    await expect(create(page)).not.toHaveAttribute('aria-disabled', 'true');
    await page.evaluate(() => (window as unknown as W).__ropShowcaseStore!.configure({ saveOutcome: 'success' }));
    await create(page).click();
    await expect(table(page)).toBeVisible();
    expect(await store(page)).toHaveLength(201);
  });

  test('a customer of another currency re-prices the lines from the list prices; the same currency keeps the typed price', async ({ page }) => {
    await openList(page);
    await newOrder(page).click();
    await chooseCustomer(page);
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByRole('combobox', { name: /Line 1 product/ }).click();
    await page.getByRole('option').first().click();
    const price = page.getByRole('textbox', { name: /Line 1 unit price/ });
    await expect(price).toHaveValue('87.45');
    await price.fill('1.00');
    await chooseCustomer(page);
    await expect(price).toHaveValue('1.00');
    await chooseCustomer(page, 'Sorakane Construction Co., Ltd. (JPY)');
    await expect(page.getByRole('textbox', { name: /Line 1 unit price \(JPY\)/ })).toHaveValue(/^\d+$/);
  });

  test('a created order opens as a normal page: the customer is locked, the number is the one assigned', async ({ page }) => {
    await openList(page, SORTED);
    await newOrder(page).click();
    await fillValid(page);
    await create(page).click();
    await page.getByRole('link', { name: 'SO-NEW-0201', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: /SO-NEW-0201/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Customer', exact: true })).toHaveAttribute('readonly', '');
    await expect(page.getByRole('combobox', { name: /Customer/ })).toHaveCount(0);
  });
});

test.describe('Showcase/Record editing: deleting a sales order from the list', () => {
  test('the row menu "Delete" opens the named confirmation: title, action, focus on Cancel, no a11y violation; Cancel deletes nothing and gives the focus back', async ({ page }) => {
    await openList(page);
    await countCalls(page);
    const dialog = await askDelete(page, SECOND);
    await expect(dialog.getByRole('button', { name: 'Delete sales order', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger(page, SECOND)).toBeFocused();
    expect((await calls(page)).delete).toEqual([]);
  });

  test('confirmed (double click): the row goes BEFORE the server answers, ONE call, then the store follows, a toast, focus on the next row', async ({ page }) => {
    await openList(page, '', 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:2500');
    await countCalls(page);
    const dialog = await askDelete(page, SECOND);
    await dialog.getByRole('button', { name: 'Delete sales order', exact: true }).dblclick();
    await expect(page.getByRole('link', { name: SECOND, exact: true })).toHaveCount(0);
    expect((await store(page)).some((o) => o.number === SECOND)).toBe(true);
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toContainText('199');
    await expect(trigger(page, THIRD)).toBeFocused();
    await expect(page.getByText(`Sales order ${SECOND} deleted`)).toBeVisible({ timeout: 8000 });
    expect((await store(page)).some((o) => o.number === SECOND)).toBe(false);
    expect((await calls(page)).delete).toHaveLength(1);
    await expect(trigger(page, THIRD)).toBeFocused();
  });

  test('deleteOutcome error: the row comes back at its index, the count is restored, an error toast, the order is still stored; a second try succeeds', async ({ page }) => {
    await openList(page, '', `${FAST};deleteOutcome:error`);
    const before = await shownNumbers(page);
    const dialog = await askDelete(page, SECOND);
    await dialog.getByRole('button', { name: 'Delete sales order', exact: true }).click();
    await expect(page.getByText(`Could not delete ${SECOND}`)).toBeVisible();
    await expect.poll(() => shownNumbers(page)).toEqual(before);
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toContainText('200');
    expect((await store(page)).some((o) => o.number === SECOND)).toBe(true);
    await page.evaluate(() => (window as unknown as W).__ropShowcaseStore!.configure({ deleteOutcome: 'success' }));
    const again = await askDelete(page, SECOND);
    await again.getByRole('button', { name: 'Delete sales order', exact: true }).click();
    await expect(page.getByText(`Sales order ${SECOND} deleted`)).toBeVisible();
    expect((await store(page)).some((o) => o.number === SECOND)).toBe(false);
  });

  test('the last order visible with a filter: "No results for the current filters", the footprint stays, the title takes the focus', async ({ page }) => {
    await page.goto(url(`sales-orders.q=${SECOND}`, FAST));
    await expect(trigger(page, SECOND)).toBeVisible();
    expect(await shownNumbers(page)).toEqual([SECOND]);
    const scroller = table(page).locator('xpath=..');
    const before = (await scroller.boundingBox())!;
    const dialog = await askDelete(page, SECOND);
    await dialog.getByRole('button', { name: 'Delete sales order', exact: true }).click();
    await expect(table(page).getByText('No results for the current filters')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toBeFocused();
    const after = (await scroller.boundingBox())!;
    expect(after.height).toBeCloseTo(before.height, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    await expect(page.getByText(`Sales order ${SECOND} deleted`)).toBeVisible();
  });
});

test.describe('Showcase/Record editing: deleting a sales order from its page', () => {
  const open = async (page: Page, args = FAST): Promise<void> => {
    await openList(page, '', args);
    await page.getByRole('link', { name: SECOND, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(SECOND) })).toBeVisible();
  };

  test('Delete with unsaved changes: the dialog warns; pending: both buttons aria-disabled, a second confirm is ignored; then the list without the order, a toast, focus on the title', async ({ page }) => {
    await open(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500');
    await page.getByRole('textbox', { name: 'Notes' }).fill('edited');
    await countCalls(page);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Delete sales order ${SECOND}?` });
    await expect(dialog).toContainText('Unsaved changes will be lost too.');
    const confirmButton = dialog.getByRole('button', { name: 'Delete sales order', exact: true });
    await confirmButton.dblclick();
    await expect(confirmButton).toHaveAttribute('aria-disabled', 'true');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(table(page)).toBeVisible({ timeout: 8000 });
    await expect(unsavedDialog(page)).toHaveCount(0);
    await expect(page.getByText(`Sales order ${SECOND} deleted`)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toBeFocused();
    expect((await calls(page)).delete).toHaveLength(1);
    expect((await store(page)).some((o) => o.number === SECOND)).toBe(false);
    expect(params(page).get('record')).toBeNull();
  });

  test('server error: the dialog stays open and usable, an error toast, the order is still stored; confirming again deletes it and goes to the list', async ({ page }) => {
    await open(page, `${FAST};deleteOutcome:error`);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Delete sales order ${SECOND}?` });
    await dialog.getByRole('button', { name: 'Delete sales order', exact: true }).click();
    await expect(page.getByText(`Could not delete ${SECOND}`)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete sales order', exact: true })).not.toHaveAttribute('aria-disabled', 'true');
    expect((await store(page)).some((o) => o.number === SECOND)).toBe(true);
    await page.evaluate(() => (window as unknown as W).__ropShowcaseStore!.configure({ deleteOutcome: 'success' }));
    await dialog.getByRole('button', { name: 'Delete sales order', exact: true }).click();
    await expect(table(page)).toBeVisible();
    expect((await store(page)).some((o) => o.number === SECOND)).toBe(false);
  });
});

test.describe('Showcase/Record editing: deleting several sales orders', () => {
  const askBulk = async (page: Page, title: string): Promise<Locator> => {
    await page.getByRole('button', { name: 'Delete selected' }).click();
    const dialog = page.getByRole('dialog', { name: title });
    await expect(dialog).toBeVisible();
    return dialog;
  };

  test('nothing selected: "Delete selected" is aria-disabled and focusable; a click opens nothing', async ({ page }) => {
    await openList(page);
    const button = page.getByRole('button', { name: 'Delete selected' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    // Checked after EACH gesture; `force`: actionability treats aria-disabled as disabled. The short wait gives an
    // async dialog time to appear.
    await button.click({ force: true });
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await button.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test('3 selected: "Delete 3 sales orders?", focus on Cancel; Cancel gives the focus back to the button; no a11y violation', async ({ page }) => {
    await openList(page);
    for (const n of [SECOND, FOURTH, FIFTH]) await rowBox(page, n).check();
    await expect(counter(page)).toHaveText('3 selected');
    const dialog = await askBulk(page, 'Delete 3 sales orders?');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Delete selected' })).toBeFocused();
  });

  test('confirmed (double click): the rows go BEFORE the server answers, one deleteMany with those three ids, a toast with the count, focus on "Select all results"', async ({ page }) => {
    await openList(page, '', 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:2500');
    await countCalls(page);
    for (const n of [SECOND, FOURTH, FIFTH]) await rowBox(page, n).check();
    const dialog = await askBulk(page, 'Delete 3 sales orders?');
    await dialog.getByRole('button', { name: 'Delete 3 sales orders', exact: true }).dblclick();
    for (const n of [SECOND, FOURTH, FIFTH]) await expect(page.getByRole('link', { name: n, exact: true })).toHaveCount(0);
    expect(await store(page)).toHaveLength(200);
    await expect(page.getByRole('checkbox', { name: 'Select all results' })).toBeFocused();
    await expect(page.getByText('3 sales orders deleted')).toBeVisible({ timeout: 8000 });
    expect(await store(page)).toHaveLength(197);
    const bulk = (await calls(page)).deleteMany;
    expect(bulk).toHaveLength(1);
    expect(bulk[0]).toHaveLength(3);
    await expect(page.getByText('No items selected')).toBeVisible();
  });

  test('deleteOutcome error: every row comes back selected, an error toast with the count, nothing deleted', async ({ page }) => {
    await openList(page, '', `${FAST};deleteOutcome:error`);
    for (const n of [SECOND, THIRD]) await rowBox(page, n).check();
    const dialog = await askBulk(page, 'Delete 2 sales orders?');
    await dialog.getByRole('button', { name: 'Delete 2 sales orders', exact: true }).click();
    await expect(page.getByText('Could not delete 2 sales orders')).toBeVisible();
    for (const n of [SECOND, THIRD]) await expect(rowBox(page, n)).toBeChecked();
    await expect(counter(page)).toHaveText('2 selected');
    expect(await store(page)).toHaveLength(200);
  });

  test('2 selected orders hidden by the filters: the dialog counts only the visible one and says so; the hidden ones stay stored and selected', async ({ page }) => {
    await openList(page, 'sales-orders.filter=all');
    const statuses = await page.evaluate(() =>
      Object.fromEntries(((window as unknown as W).__ropShowcaseStore?.snapshot() ?? []).map((o) => [o.number, o.status])),
    );
    const shown = await shownNumbers(page);
    const keep = shown.find((n) => statuses[n] === 'invoiced')!;
    const hidden = shown.filter((n) => statuses[n] !== 'invoiced').slice(0, 2);
    for (const n of [keep, ...hidden]) await rowBox(page, n).check();
    await expect(counter(page)).toHaveText('3 selected');
    await page.getByRole('radio', { name: 'Invoiced' }).click();
    await expect(counter(page)).toHaveText('1 selected (2 hidden by filters)');
    await countCalls(page);
    const dialog = await askBulk(page, 'Delete 1 sales order?');
    await expect(dialog).toContainText('2 selected sales orders hidden by the filters will not be deleted.');
    await dialog.getByRole('button', { name: 'Delete 1 sales order', exact: true }).click();
    await expect(page.getByText('1 sales order deleted')).toBeVisible();
    expect((await calls(page)).deleteMany.flat()).toHaveLength(1);
    const numbers = (await store(page)).map((o) => o.number);
    expect(numbers).not.toContain(keep);
    for (const n of hidden) expect(numbers).toContain(n);
    await page.getByRole('radio', { name: 'All' }).click();
    for (const n of hidden) await expect(rowBox(page, n)).toBeChecked();
  });

  test('deleting every result: "No results for the current filters" with a stable footprint, the selection bar keeps its height, focus on the table container', async ({ page }) => {
    await openList(page, 'sales-orders.filter=cancelled');
    await page.getByRole('checkbox', { name: 'Select all results' }).check();
    const count = (await shownNumbers(page)).length;
    const bar = page.locator('[data-rop-selection-bar]');
    const barBefore = (await bar.boundingBox())!;
    const container = table(page).locator('xpath=..');
    const tableBefore = (await container.boundingBox())!;
    const dialog = await askBulk(page, `Delete ${count} sales orders?`);
    await dialog.getByRole('button', { name: `Delete ${count} sales orders`, exact: true }).click();
    await expect(table(page).getByText('No results for the current filters')).toBeVisible();
    await expect(page.getByText(`${count} sales orders deleted`)).toBeVisible();
    const barAfter = (await bar.boundingBox())!;
    const tableAfter = (await container.boundingBox())!;
    expect(barAfter.height).toBeCloseTo(barBefore.height, 0);
    expect(barAfter.y).toBeCloseTo(barBefore.y, 0);
    expect(tableAfter.height).toBeCloseTo(tableBefore.height, 0);
    expect(tableAfter.y).toBeCloseTo(tableBefore.y, 0);
    await expect.poll(() => container.evaluate((el) => el === document.activeElement)).toBe(true);
  });
});
