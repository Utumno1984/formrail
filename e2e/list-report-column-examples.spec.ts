import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';
import { MOBILE_VIEWPORT } from './helpers/viewports';
import {
  getSupplier,
  makeEmployees,
  makeEnrolments,
  makeProducts,
  makePurchaseOrders,
  makeSupportCases,
} from '../packages/core/src/internal/demo-data';

// Ticket #627: the six "Example: configured for ..." stories of Floorplans/List Report. Each aspect of the column
// configuration is driven here with TWO values of its Controls, read from the same fixtures the stories use: the
// plays check what the default Controls show, this file checks that changing a Control changes the result.

const STORY = (name: string) => `floorplans-list-report--use-case-${name}`;
const ERP = STORY('erp-purchase-order');
const CATALOGUE = STORY('ecommerce-product-catalogue');
const PRICES = STORY('b-2-b-price-list');
const ENROLMENTS = STORY('elearning-enrolments');
const DIRECTORY = STORY('hr-employee-directory');
const QUEUE = STORY('helpdesk-support-queue');
// The same stories without their play: a test starts from the state the Controls give, not where the play left it.
const noPlay = (id: string): string => `${id}-no-play`;
const [ERP_NP, CATALOGUE_NP, PRICES_NP, ENROLMENTS_NP, DIRECTORY_NP, QUEUE_NP] = [noPlay(ERP), noPlay(CATALOGUE), noPlay(PRICES), noPlay(ENROLMENTS), noPlay(DIRECTORY), noPlay(QUEUE)] as const;

// The filler row of the table (`data-rop-filler`) keeps the footprint stable: it is not a record.
// Storybook merges an array arg from the URL into the default one BY INDEX (it cannot make it shorter), so each
// alternative below has as many elements as the default: the second searchable column is "status" and not the
// supplier; "manager" is replaced by a repeated "department" (the Control only reads which ids are there).
const NUMBER_ONLY = 'searchableColumns[0]:number;searchableColumns[1]:status';
const DEPARTMENT_ONLY = 'visibleColumns[0]:department;visibleColumns[1]:department;visibleColumns[2]:department';

const rows = (page: Page): Locator => page.locator('#storybook-root tbody tr:not([data-rop-filler])');
const header = (page: Page, name: string | RegExp): Locator => page.getByRole('columnheader', { name });
const scroller = (page: Page): Locator => page.locator('#storybook-root [tabindex="0"]').first();

/** The text of one column of the body, in display order, found by the header's text. */
async function columnTexts(page: Page, name: string): Promise<string[]> {
  const index = await page
    .locator('#storybook-root thead th')
    .evaluateAll((ths, wanted) => ths.findIndex((th) => th.textContent?.trim().startsWith(wanted)), name);
  expect(index, `a column "${name}"`).toBeGreaterThanOrEqual(0);
  return rows(page).evaluateAll((trs, i) => trs.map((tr) => tr.children[i]!.textContent ?? ''), index);
}

const search = async (page: Page, text: string) => {
  const box = page.getByRole('searchbox', { name: 'Search' });
  await box.fill(text);
  await box.press('Enter');
};

const digitsOf = (text: string) => text.replace(/\D/g, '');

test.describe('the six examples: every play passes, with two values of their Controls', () => {
  const cases: [string, string, string | undefined][] = [
    ['erp, supplier searchable (default)', ERP, undefined],
    ['erp, supplier not searchable', ERP, NUMBER_ONLY],
    ['e-commerce, nameWidth 240 (default)', CATALOGUE, undefined],
    ['e-commerce, nameWidth 18rem', CATALOGUE, 'nameWidth:18rem'],
    ['e-commerce, nameWidth auto', CATALOGUE, 'nameWidth:auto'],
    ['e-commerce, truncate off', CATALOGUE, 'truncate:!false'],
    ['b2b, EUR en-GB (default)', PRICES, undefined],
    ['b2b, JPY en-GB', PRICES, 'currency:JPY'],
    ['b2b, GBP de-DE', PRICES, 'currency:GBP;locale:de-DE'],
    ['b2b, USD ja-JP', PRICES, 'currency:USD;locale:ja-JP'],
    ['e-learning, medium en-GB (default)', ENROLMENTS, undefined],
    ['e-learning, short de-DE', ENROLMENTS, 'dateStyle:short;locale:de-DE'],
    ['e-learning, long ja-JP', ENROLMENTS, 'dateStyle:long;locale:ja-JP'],
    ['hr, every optional column (default)', DIRECTORY, undefined],
    ['hr, only the hire date at the start', DIRECTORY, 'visibleColumns[0]:hired;visibleColumns[1]:hired'],
    ['helpdesk, priority descending (default)', QUEUE, undefined],
    ['helpdesk, priority ascending', QUEUE, 'priorityFirstDirection:asc'],
    ['helpdesk, sorted by opening date at mount', QUEUE, 'defaultSort:opened'],
  ];
  for (const [title, id, args] of cases) {
    test(title, async ({ page }) => {
      await expectPlayToPass(page, id, args);
    });
  }
});

test.describe('definition of the columns (ERP)', () => {
  const ORDERS = makePurchaseOrders(40);
  const supplierOf = (id: string) => getSupplier(id)?.name ?? id;
  const term = supplierOf(ORDERS[0]!.supplierId).split(' ')[0]!;

  test('the same search finds the order with "Supplier" searchable and nothing without', async ({ page }) => {
    const expected = ORDERS.filter((o) => supplierOf(o.supplierId).includes(term)).length;
    expect(expected).toBeGreaterThan(0);

    await gotoStory(page, ERP_NP);
    await search(page, term);
    await expect(rows(page)).toHaveCount(expected);

    await gotoStory(page, ERP_NP, NUMBER_ONLY);
    await search(page, term);
    await expect(page.locator('#storybook-root table').getByText('No results for the current filters')).toBeVisible();
    await expect(page.locator('#storybook-root tbody td').filter({ hasText: supplierOf(ORDERS[0]!.supplierId) })).toHaveCount(0);
    // "Order" is still searchable.
    await search(page, ORDERS[0]!.number);
    await expect(rows(page)).toHaveCount(1);
  });

  test('"Total" sorts by the raw amount of each order, whatever its currency', async ({ page }) => {
    const sorted = [...ORDERS].sort((a, b) => a.totalMinor - b.totalMinor);
    // The check is only worth something if neighbours in the raw order are in different currencies.
    expect(sorted.some((o, i) => i > 0 && o.currency !== sorted[i - 1]!.currency)).toBe(true);
    await gotoStory(page, ERP_NP);
    await header(page, 'Total').getByRole('button').click();
    await expect(header(page, 'Total')).toHaveAttribute('aria-sort', 'ascending');
    const shown = await columnTexts(page, 'Total');
    expect(shown).toHaveLength(ORDERS.length);
    // Each cell shows the digits of the order's own minor amount: the order on screen is the order of the raw amounts.
    expect(shown.map(digitsOf)).toEqual(sorted.map((o) => String(o.totalMinor)));
    const orders = await columnTexts(page, 'Order');
    expect(orders).toEqual(sorted.map((o) => o.number));
  });
});

test.describe('width and truncation (e-commerce)', () => {
  const PRODUCTS = makeProducts(40);
  const longest = [...PRODUCTS].sort((a, b) => b.name.length - a.name.length)[0]!;
  const nameCell = (page: Page): Locator => rows(page).nth(PRODUCTS.indexOf(longest)).getByRole('cell').nth(1);

  for (const [value, wanted] of [
    ['240', () => 240],
    ['18rem', (rem: number) => 18 * rem],
  ] as const) {
    test(`nameWidth ${value}: the column is as wide as asked, never narrower than minWidth, and the name is cut`, async ({ page }) => {
      await gotoStory(page, CATALOGUE_NP, `nameWidth:${value}`);
      const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
      const box = await header(page, 'Product').boundingBox();
      expect(Math.abs(box!.width - wanted(rem))).toBeLessThanOrEqual(1);
      expect(box!.width).toBeGreaterThanOrEqual(160);
      const metrics = await nameCell(page).locator('span').first().evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(metrics.scroll).toBeGreaterThan(metrics.client);
    });
  }

  test('nameWidth px and rem give two different widths', async ({ page }) => {
    const widths: number[] = [];
    for (const value of ['240', '18rem']) {
      await gotoStory(page, CATALOGUE_NP, `nameWidth:${value}`);
      widths.push((await header(page, 'Product').boundingBox())!.width);
    }
    expect(widths[1]! - widths[0]!).toBeGreaterThan(20);
  });

  test('truncate on: no tooltip at mount, the full name on a real hover; truncate off: the name wraps and opens none', async ({ page }) => {
    await gotoStory(page, CATALOGUE_NP);
    await page.waitForTimeout(900);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await nameCell(page).locator('span').first().hover();
    await expect(page.getByRole('tooltip')).toHaveText(longest.name);
    await page.mouse.move(5, 5, { steps: 8 });
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    await gotoStory(page, CATALOGUE_NP, 'truncate:!false');
    const height = (await rows(page).nth(PRODUCTS.indexOf(longest)).boundingBox())!.height;
    const short = [...PRODUCTS].sort((a, b) => a.name.length - b.name.length)[0]!;
    expect(height).toBeGreaterThan((await rows(page).nth(PRODUCTS.indexOf(short)).boundingBox())!.height);
    await nameCell(page).hover();
    await page.waitForTimeout(900);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('at 375px the table scrolls inside its box, the names are cut, and the page does not overflow', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoStory(page, CATALOGUE_NP);
    // The table scrolls inside its own box: the page does not.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const metrics = await nameCell(page).locator('span').first().evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(metrics.scroll).toBeGreaterThan(metrics.client);
    const box = await header(page, 'Product').boundingBox();
    expect(Math.abs(box!.width - 240)).toBeLessThanOrEqual(1);
    await page.waitForTimeout(900);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await nameCell(page).locator('span').first().hover();
    await expect(page.getByRole('tooltip')).toHaveText(longest.name);
  });
});

test.describe('numbers and currency (B2B)', () => {
  const PRODUCTS = makeProducts(40);
  const priceOf = async (page: Page): Promise<string[]> => (await columnTexts(page, 'List price'));

  test('the price column is right-aligned on header and cells', async ({ page }) => {
    await gotoStory(page, PRICES_NP);
    const aligns = await page.evaluate(() => {
      const ths = [...document.querySelectorAll<HTMLElement>('#storybook-root thead th')];
      const i = ths.findIndex((th) => th.textContent?.startsWith('List price'));
      const cells = [...document.querySelectorAll<HTMLElement>('#storybook-root tbody tr')].map((tr) => tr.children[i] as HTMLElement);
      return [ths[i]!, ...cells].map((el) => getComputedStyle(el).textAlign);
    });
    expect(aligns.length).toBe(PRODUCTS.length + 1);
    for (const align of aligns) expect(align).toMatch(/^(end|right)$/);
  });

  test('JPY has no decimals and EUR two; the amounts are the product prices of each currency', async ({ page }) => {
    await gotoStory(page, PRICES_NP, 'currency:EUR');
    const eur = await priceOf(page);
    await gotoStory(page, PRICES_NP, 'currency:JPY');
    const jpy = await priceOf(page);
    expect(eur[0]).not.toBe(jpy[0]);
    expect(eur.map(digitsOf)).toEqual(PRODUCTS.map((p) => String(p.listPriceMinor.EUR)));
    expect(jpy.map(digitsOf)).toEqual(PRODUCTS.map((p) => String(p.listPriceMinor.JPY)));
    for (const text of eur) expect(text).toMatch(/\.\d{2}$/);
    for (const text of jpy) expect(text).not.toMatch(/[.,]\d{1,2}(?!\d)/);
  });

  test('changing the locale changes the separators: "." in en-GB, "," in de-DE', async ({ page }) => {
    await gotoStory(page, PRICES_NP, 'currency:EUR;locale:en-GB');
    const british = (await priceOf(page))[0]!;
    await gotoStory(page, PRICES_NP, 'currency:EUR;locale:de-DE');
    const german = (await priceOf(page))[0]!;
    expect(british).toMatch(/\d\.\d{2}$/);
    expect(german).toMatch(/\d,\d{2}\D*$/);
    expect(german).not.toBe(british);
    expect(digitsOf(german)).toBe(digitsOf(british));
  });
});

test.describe('dates and status (e-learning)', () => {
  const ENROL = makeEnrolments(40);
  const completed = ENROL.findIndex((e) => e.completedOn !== null);

  test('dateStyle short, medium and long give three different texts for the same date', async ({ page }) => {
    const seen: string[] = [];
    for (const style of ['short', 'medium', 'long']) {
      await gotoStory(page, ENROLMENTS_NP, `dateStyle:${style}`);
      seen.push((await columnTexts(page, 'Completed'))[completed]!);
    }
    expect(new Set(seen).size).toBe(3);
    expect(seen[2]!.length).toBeGreaterThan(seen[0]!.length);
  });

  test('a withdrawn learner has a dash named "Not completed" and "No score", and a badge; a completed one a date and its score', async ({ page }) => {
    await gotoStory(page, ENROLMENTS_NP);
    const withdrawn = ENROL.findIndex((e) => e.status === 'withdrawn');
    expect(withdrawn).toBeGreaterThanOrEqual(0);
    const row = rows(page).nth(withdrawn);
    await expect(row.getByRole('img', { name: 'Not completed' })).toHaveText('—');
    await expect(row.getByRole('img', { name: 'No score' })).toHaveText('—');
    await expect(row).toContainText('Withdrawn');
    const done = rows(page).nth(completed);
    await expect(done.getByRole('img')).toHaveCount(0);
    await expect(done).toContainText('Completed');
    await expect(done).toContainText(`${ENROL[completed]!.score}%`);
    // A score of 0 is not an absent score: nothing in the fixture is 0, so every dash is a null.
    const dashes = await page.getByRole('img', { name: 'No score' }).count();
    expect(dashes).toBe(ENROL.filter((e) => e.score === null).length);
  });

  test('the same date in en-GB and ja-JP is written differently', async ({ page }) => {
    await gotoStory(page, ENROLMENTS_NP, 'locale:en-GB');
    const british = (await columnTexts(page, 'Completed'))[completed]!;
    await gotoStory(page, ENROLMENTS_NP, 'locale:ja-JP');
    const japanese = (await columnTexts(page, 'Completed'))[completed]!;
    expect(japanese).not.toBe(british);
  });
});

test.describe('optional columns (HR)', () => {
  const EMPLOYEES = makeEmployees(40);
  const headers = async (page: Page): Promise<string[]> => (await page.locator('#storybook-root thead th').allTextContents()).map((t) => t.trim());

  test('the checkboxes add and remove columns; with all unchecked the required ones stay and the table keeps its footprint', async ({ page }) => {
    await gotoStory(page, DIRECTORY_NP);
    const before = await scroller(page).boundingBox();
    expect(await headers(page)).toEqual(['', 'Name', 'Title', 'Department', 'Manager', 'Hire date']);
    for (const name of ['Department', 'Manager', 'Hire date']) await page.getByRole('checkbox', { name }).uncheck();
    const left = await headers(page);
    expect(left).toEqual(['', 'Name', 'Title']);
    const after = await scroller(page).boundingBox();
    expect(after!.height).toBe(before!.height);
    expect(after!.width).toBe(before!.width);
    await expect(rows(page)).toHaveCount(EMPLOYEES.length);
    await page.getByRole('checkbox', { name: 'Hire date' }).check();
    expect(await headers(page)).toContain('Hire date');
  });

  test('the Control sets the columns at the start, and a hidden column is not searched', async ({ page }) => {
    await gotoStory(page, DIRECTORY_NP, DEPARTMENT_ONLY);
    // Only "Department" at the start: the Control chose the optional columns, the others are not in `columns`.
    expect(await headers(page)).toEqual(['', 'Name', 'Title', 'Department']);
    const ceo = EMPLOYEES[0]!;
    const matching = (withManager: boolean) =>
      EMPLOYEES.filter((e) => e.fullName.includes(ceo.lastName) || e.title.includes(ceo.lastName) || (withManager && e.managerId === ceo.id)).length;
    expect(matching(true)).toBeGreaterThan(matching(false));
    await search(page, ceo.lastName);
    await expect(rows(page)).toHaveCount(matching(false));
    await page.getByRole('checkbox', { name: 'Manager' }).check();
    await expect(rows(page)).toHaveCount(matching(true));
  });

  test('sorting and selection work on the columns that are left', async ({ page }) => {
    await gotoStory(page, DIRECTORY_NP);
    await page.getByRole('checkbox', { name: 'Manager' }).uncheck();
    await header(page, 'Hire date').getByRole('button').click();
    const hired = [...EMPLOYEES].map((e) => e.hireDate).sort()[0]!;
    expect(hired).toMatch(/^\d{4}-/);
    await expect(header(page, 'Hire date')).toHaveAttribute('aria-sort', 'ascending');
    await rows(page).first().getByRole('checkbox').check();
    await expect(page.getByText('1 selected')).toBeVisible();
  });
});

test.describe('sorting (helpdesk)', () => {
  const CASES = makeSupportCases(40);
  const RANK = { low: 0, normal: 1, high: 2, urgent: 3 } as const;
  const LABEL = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' } as const;

  test('"Priority": the first click puts an urgent case on top, the second a low one', async ({ page }) => {
    const ranks = CASES.map((c) => RANK[c.priority]);
    expect(Math.max(...ranks)).not.toBe(Math.min(...ranks));
    await gotoStory(page, QUEUE_NP);
    await header(page, 'Priority').getByRole('button').click();
    await expect(header(page, 'Priority')).toHaveAttribute('aria-sort', 'descending');
    const first = (await columnTexts(page, 'Priority'))[0]!;
    expect(first).toBe(LABEL.urgent);
    await header(page, 'Priority').getByRole('button').click();
    await expect(header(page, 'Priority')).toHaveAttribute('aria-sort', 'ascending');
    expect((await columnTexts(page, 'Priority'))[0]).toBe(LABEL.low);
    // The whole column is in order of rank, not alphabetical ("Normal" before "High" ascending).
    const shown = (await columnTexts(page, 'Priority')).map((text) => RANK[(Object.keys(LABEL) as (keyof typeof LABEL)[]).find((key) => LABEL[key] === text)!]);
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
    expect(shown.length).toBe(CASES.length);
  });

  test('priorityFirstDirection asc: the first click puts a low case on top', async ({ page }) => {
    await gotoStory(page, QUEUE_NP, 'priorityFirstDirection:asc');
    await header(page, 'Priority').getByRole('button').click();
    await expect(header(page, 'Priority')).toHaveAttribute('aria-sort', 'ascending');
    expect((await columnTexts(page, 'Priority'))[0]).toBe(LABEL.low);
  });

  test('"Opened" starts with the newest case and "Reply due" with the earliest', async ({ page }) => {
    await gotoStory(page, QUEUE_NP);
    await header(page, 'Opened').getByRole('button').click();
    await expect(header(page, 'Opened')).toHaveAttribute('aria-sort', 'descending');
    const opened = [...CASES].sort((a, b) => b.openedOn.localeCompare(a.openedOn));
    const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));
    expect((await columnTexts(page, 'Opened'))[0]).toBe(day(opened[0]!.openedOn));
    await header(page, 'Reply due').getByRole('button').click();
    await expect(header(page, 'Reply due')).toHaveAttribute('aria-sort', 'ascending');
    const due = [...CASES].sort((a, b) => a.slaDueDate.localeCompare(b.slaDueDate));
    expect((await columnTexts(page, 'Reply due'))[0]).toBe(day(due[0]!.slaDueDate));
  });

  test('"Subject" has no sort button; the others do', async ({ page }) => {
    await gotoStory(page, QUEUE_NP);
    await expect(header(page, 'Subject')).toBeVisible();
    await expect(header(page, 'Subject').getByRole('button')).toHaveCount(0);
    for (const name of ['Priority', 'Opened', 'Reply due']) await expect(header(page, name).getByRole('button')).toHaveCount(1);
  });

  test('defaultSort sets the order at mount', async ({ page }) => {
    await gotoStory(page, QUEUE_NP, 'defaultSort:sla');
    await expect(header(page, 'Reply due')).toHaveAttribute('aria-sort', 'ascending');
    await gotoStory(page, QUEUE_NP, 'defaultSort:priority');
    await expect(header(page, 'Priority')).toHaveAttribute('aria-sort', 'descending');
  });
});
