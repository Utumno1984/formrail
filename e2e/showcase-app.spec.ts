import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';
import { MOBILE_VIEWPORT } from './helpers/viewports';

// #525: Showcase/Record editing as a small business app: the "Modules" bar (Sales orders, Customers), each module keeping
// its pill, sort, search and scroll, the order's customer as a link behind the dirty-guard, a customer that is not there,
// the deep link to a customer, a save in flight when the module changes. Orders: so-15 confirmed (editable), a customer
// of the demo pool; customers: C-10004 is cus-4.
const APP = 'showcase-record-editing--record-editing-manual';
const PLAYS = ['record-editing', 'app-navigation-orders', 'app-order-customer-link'].map((n) => `showcase-record-editing--${n}`);
const VISUAL = ['app-navigation-orders', 'app-order-customer-link'].map((n) => `showcase-record-editing--${n}`);
const NO_DELAYS = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
const ORDER = 'so-15';

type AppStores = { 'sales-orders': { snapshot: () => { id: string; customerId: string; customerReference: string }[] }; customers: { delete: (id: string) => Promise<void>; snapshot: () => { id: string }[] } };
type StoresWindow = { __ropShowcaseAppStores?: AppStores };

const nav = (page: Page): Locator => page.getByRole('navigation', { name: 'Modules' });
const modLink = (page: Page, name: string): Locator => nav(page).getByRole('link', { name, exact: true });
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;
const bar = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const reference = (page: Page): Locator => page.getByRole('textbox', { name: 'Customer reference', exact: true });
const customerLink = (page: Page): Locator => page.getByRole('link', { name: /^Open customer / });
const guard = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
/** The page itself does not scroll sideways (the table has its own scroller: only the document is measured). */
const expectNoPageOverflow = async (page: Page): Promise<void> => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
};
const scrollerOf =(page: Page): Locator => page.getByRole('table').locator('xpath=..');

async function openApp(page: Page, args = NO_DELAYS, query = ''): Promise<void> {
  await page.goto(`/iframe.html?id=${APP}&viewMode=story&args=${encodeURIComponent(args)}${query ? `&${query}` : ''}`);
  await expect(nav(page)).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
}

async function openOrder(page: Page, args = NO_DELAYS): Promise<void> {
  await page.goto(`/iframe.html?id=${APP}&viewMode=story&args=${encodeURIComponent(args)}&module=sales-orders&record=${ORDER}`);
  await expect(reference(page)).toBeVisible();
}

const orderStored = (page: Page) =>
  page.evaluate((id) => (window as unknown as StoresWindow).__ropShowcaseAppStores?.['sales-orders'].snapshot().find((o) => o.id === id), ORDER);

type ChannelWindow = { __STORYBOOK_ADDONS_CHANNEL__: { emit: (event: string, payload: unknown) => void } };
/** Changes the Control `module` of the mounted story, as the Controls panel does (the story re-renders, no play). */
const setControl = (page: Page, module: string) =>
  page.evaluate(
    ([storyId, value]) => (window as unknown as ChannelWindow).__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', { storyId, updatedArgs: { module: value } }),
    [APP, module] as const,
  );
type GoSpyWindow = { __ropGoCalls?: number[] };
/** Replaces `history.go` with a recorder (the frame never leaves: a call is counted, not run). */
const spyHistoryGo = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as GoSpyWindow;
    w.__ropGoCalls = [];
    window.history.go = (delta?: number) => void w.__ropGoCalls!.push(delta ?? 0);
  });
const historyGoCalls = (page: Page) => page.evaluate(() => (window as unknown as GoSpyWindow).__ropGoCalls);

test.describe('Showcase/Record editing as an app: the stories play', () => {
  for (const id of PLAYS) {
    test(`${id.replace('showcase-record-editing--', '')}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, id);
    });
  }

  test('the main story passes its play starting from Customers too (the Control `module`)', async ({ page }) => {
    await expectPlayToPass(page, 'showcase-record-editing--record-editing', 'module:customers');
  });

  test('the reduced-motion preference leads the visual stories to the same end state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const id of VISUAL) await expectPlayToPass(page, id);
  });
});

test.describe('Showcase/Record editing as an app: the Modules bar', () => {
  test('two real links in a nav "Modules": the shown module is aria-current="page", the other is not', async ({ page }) => {
    await openApp(page);
    await expect(nav(page).getByRole('link')).toHaveText(['Sales orders', 'Customers']);
    await expect(modLink(page, 'Sales orders')).toHaveAttribute('aria-current', 'page');
    await expect(modLink(page, 'Customers')).not.toHaveAttribute('aria-current');
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toContainText('200');
    expect(await modLink(page, 'Customers').getAttribute('href')).toContain('module=customers');
  });

  test('a click shows the other module, aria-current follows, browser Back and Forward walk the modules', async ({ page }) => {
    await openApp(page);
    await modLink(page, 'Customers').click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await expect(modLink(page, 'Customers')).toHaveAttribute('aria-current', 'page');
    await expect(modLink(page, 'Sales orders')).not.toHaveAttribute('aria-current');
    expect(params(page).get('module')).toBe('customers');
    // The customers of the app: the 200 of the Customers story and those the orders name (so every order's link opens one).
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toContainText('(336)');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toBeVisible();
    await expect(modLink(page, 'Sales orders')).toHaveAttribute('aria-current', 'page');
    await page.goForward();
    await expect(modLink(page, 'Customers')).toHaveAttribute('aria-current', 'page');
  });

  test('the Control `module` chooses the module shown first; a URL that names one wins', async ({ page }) => {
    await openApp(page, `${NO_DELAYS};module:customers`);
    await expect(modLink(page, 'Customers')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await page.goto(`/iframe.html?id=${APP}&viewMode=story&args=${encodeURIComponent(`${NO_DELAYS};module:customers`)}&module=sales-orders`);
    await expect(modLink(page, 'Sales orders')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toBeVisible();
  });

  test('the nav is a single row, the page below fills the rest: no scroll of the whole page, on a list and on a record', async ({ page }) => {
    await openApp(page);
    const box = (await nav(page).boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(48);
    const scrolls = () => page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
    expect(await scrolls()).toBe(false);
    await page.locator('a[data-record-id]').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await scrolls()).toBe(false);
  });
});

test.describe('Showcase/Record editing as an app: each module keeps its list', () => {
  test('pill, sort and scroll of the orders, pill and search of the customers: each comes back as it was left', async ({ page }) => {
    await openApp(page);
    // Orders: Confirmed, Total (the first click is descending), scrolled.
    await page.getByRole('radio', { name: 'Confirmed' }).click();
    await page.getByRole('button', { name: 'Total' }).click();
    await expect(page.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
    await scrollerOf(page).evaluate((el) => (el.scrollTop = 420));
    await expect.poll(() => scrollerOf(page).evaluate((el) => el.scrollTop)).toBe(420);
    await page.waitForTimeout(300); // the scroll reports itself on the next frame
    // Customers: its own list (nothing of the orders' parameters), a pill and a search.
    await modLink(page, 'Customers').click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    await page.getByRole('radio', { name: 'On hold' }).click();
    const search = page.getByRole('searchbox', { name: 'Search' });
    await search.fill('Ravenna');
    await search.press('Enter');
    await expect(page.getByRole('row').nth(1)).toBeVisible();
    // Back to the orders: pill, sort, scroll as they were.
    await modLink(page, 'Sales orders').click();
    await expect(page.getByRole('radio', { name: 'Confirmed' })).toBeChecked();
    await expect(page.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
    await expect.poll(() => scrollerOf(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(418);
    expect(await scrollerOf(page).evaluate((el) => el.scrollTop)).toBeLessThan(422);
    expect(params(page).get('sales-orders.filter')).toBe('confirmed');
    expect(params(page).get('sales-orders.sort')).toBe('total.desc');
    expect(params(page).get('customers.filter')).toBe('on-hold');
    expect(params(page).get('customers.q')).toBe('Ravenna');
    // And the customers kept theirs while the orders were shown.
    await modLink(page, 'Customers').click();
    await expect(page.getByRole('radio', { name: 'On hold' })).toBeChecked();
    await expect(search).toHaveValue('Ravenna');
  });

  test('a module left is not rebuilt: an order saved before leaving it is still saved when it comes back', async ({ page }) => {
    await openOrder(page);
    await reference(page).fill('PO-525-KEPT');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    await modLink(page, 'Customers').click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await modLink(page, 'Sales orders').click();
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toBeVisible();
    expect((await orderStored(page))?.customerReference).toBe('PO-525-KEPT');
    await page.goBack(); // the Customers list...
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await page.goBack(); // ...and the order page: remounted from the store, which holds what was saved
    await expect(reference(page)).toHaveValue('PO-525-KEPT');
  });
});

test.describe('Showcase/Record editing as an app: the order\'s customer', () => {
  test('on a clean order the link opens the customer straight away; browser Back returns to the order', async ({ page }) => {
    await openOrder(page);
    const stored = await orderStored(page);
    const link = customerLink(page);
    expect(await link.getAttribute('href')).toContain(`record=${stored!.customerId}`);
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: /^C-\d+$/ })).toBeVisible();
    expect(params(page).get('module')).toBe('customers');
    expect(params(page).get('record')).toBe(stored!.customerId);
    await expect(modLink(page, 'Customers')).toHaveAttribute('aria-current', 'page');
    await expect(guard(page)).toHaveCount(0);
    await page.goBack();
    await expect(reference(page)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /^SO-/ })).toBeVisible();
  });

  test('with unsaved changes: the dialog; "Keep editing" keeps the edit and the focus on the link; "Discard changes" opens the customer; Back shows the order unchanged', async ({ page }) => {
    await openOrder(page);
    const saved = await reference(page).inputValue();
    await reference(page).fill('PO-525-EDIT');
    await expect(bar(page)).toBeVisible();
    await customerLink(page).click();
    await expect(guard(page)).toBeVisible();
    expect(params(page).get('module')).toBe('sales-orders');
    await guard(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(guard(page)).toBeHidden();
    await expect(reference(page)).toHaveValue('PO-525-EDIT');
    await expect(customerLink(page)).toBeFocused();
    await customerLink(page).click();
    await guard(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^C-\d+$/ })).toBeVisible();
    await page.goBack();
    await expect(reference(page)).toHaveValue(saved);
    await expect(bar(page)).toBeHidden();
    expect((await orderStored(page))?.customerReference).toBe(saved);
  });

  test('the customer\'s "Back to list" is the Customers list, not the order it came from', async ({ page }) => {
    await openOrder(page);
    await customerLink(page).click();
    await expect(page.getByRole('heading', { level: 1, name: /^C-\d+$/ })).toBeVisible();
    await back(page).click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    expect(params(page).get('record')).toBeNull();
    expect(params(page).get('module')).toBe('customers');
  });

  test('a link of the bar from a dirty order asks the same dialog; from a clean one it goes straight', async ({ page }) => {
    await openOrder(page);
    await reference(page).fill('PO-525-EDIT');
    await modLink(page, 'Customers').click();
    await expect(guard(page)).toBeVisible();
    await guard(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(reference(page)).toHaveValue('PO-525-EDIT');
    await modLink(page, 'Customers').click();
    await guard(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await modLink(page, 'Sales orders').click();
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toBeVisible();
    await page.locator('a[data-record-id]').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await modLink(page, 'Customers').click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
  });

  test('an unsaved edit does not leak into the customer\'s page: a new page starts clean', async ({ page }) => {
    await openOrder(page);
    await reference(page).fill('PO-525-EDIT');
    await customerLink(page).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^C-\d+$/ })).toBeVisible();
    await expect(bar(page)).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
    await expect(bar(page)).toBeHidden();
  });
});

test.describe('Showcase/Record editing as an app: edge cases', () => {
  test('a customer that is not there: "Customer not found", and "Back to list" is the Customers list', async ({ page }) => {
    await openOrder(page);
    const stored = await orderStored(page);
    await page.evaluate((id) => (window as unknown as StoresWindow).__ropShowcaseAppStores!.customers.delete(id), stored!.customerId);
    await customerLink(page).click();
    await expect(page.getByText('Customer not found')).toBeVisible();
    await expect(page.getByText(`There is no customer with id "${stored!.customerId}".`)).toBeVisible();
    await back(page).click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toContainText('(335)');
    expect(params(page).get('record')).toBeNull();
    // The way back to the order is browser Back: the entry before the customer.
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: /^SO-/ })).toBeVisible();
  });

  test('a deep link to /customers/<id>: the customer\'s page with no list first; a link to one that does not exist says so', async ({ page }) => {
    await page.goto(`/iframe.html?id=${APP}&viewMode=story&args=${encodeURIComponent(NO_DELAYS)}&module=customers&record=cus-4`);
    await expect(page.getByRole('heading', { level: 1, name: 'C-10004' })).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(modLink(page, 'Customers')).toHaveAttribute('aria-current', 'page');
    await expect(bar(page)).toBeHidden();
    await back(page).click(); // a deep link has no list entry before it: the list of the module replaces it
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    expect(params(page).get('record')).toBeNull();
    await page.goto(`/iframe.html?id=${APP}&viewMode=story&args=${encodeURIComponent(NO_DELAYS)}&module=customers&record=cus-does-not-exist`);
    await expect(page.getByText('Customer not found')).toBeVisible();
    await back(page).click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
  });

  test('changing module during a save in flight asks first; "Leave anyway" shows Customers and the save still lands', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500');
    await reference(page).fill('PO-525-FLIGHT');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page).getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    expect((await orderStored(page))?.customerReference).not.toBe('PO-525-FLIGHT');
    await modLink(page, 'Customers').click();
    await expect(guard(page)).toContainText('A save is still in progress');
    await guard(page).getByRole('button', { name: 'Leave anyway' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await expect.poll(async () => (await orderStored(page))?.customerReference, { timeout: 5000 }).toBe('PO-525-FLIGHT');
    await page.goBack();
    await expect(reference(page)).toHaveValue('PO-525-FLIGHT');
    await expect(bar(page)).toBeHidden();
  });
});

test.describe('Showcase/Record editing as an app: a modified click on the bar', () => {
  test('Ctrl/Cmd, Shift or the middle button on "Customers" open its href elsewhere; the app stays where it was', async ({ page, context }) => {
    await openApp(page);
    const before = page.url();
    const clicks: Parameters<Locator['click']>[0][] = [{ modifiers: ['ControlOrMeta'] }, { modifiers: ['Shift'] }, { button: 'middle' }];
    for (const click of clicks) {
      const opened = context.waitForEvent('page');
      await modLink(page, 'Customers').click(click);
      const tab = await opened;
      await tab.waitForLoadState('domcontentloaded');
      expect(new URL(tab.url()).searchParams.get('module'), JSON.stringify(click)).toBe('customers');
      await tab.close();
      expect(page.url(), JSON.stringify(click)).toBe(before);
      await expect(modLink(page, 'Sales orders')).toHaveAttribute('aria-current', 'page');
      await expect(modLink(page, 'Customers')).not.toHaveAttribute('aria-current');
      await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toBeVisible();
    }
  });
});

test.describe('Showcase/Record editing as an app: the Control `module` changed while the app runs', () => {
  test('on a dirty order it asks first; "Keep editing" leaves URL, order, edit and bar as they were; no history.go', async ({ page }) => {
    await openOrder(page);
    await spyHistoryGo(page);
    await reference(page).fill('PO-525-EDIT');
    await expect(bar(page)).toBeVisible();
    await setControl(page, 'customers');
    await expect(guard(page)).toBeVisible();
    expect(params(page).get('module')).toBe('sales-orders');
    expect(params(page).get('record')).toBe(ORDER);
    await guard(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(guard(page)).toBeHidden();
    expect(params(page).get('module')).toBe('sales-orders');
    expect(params(page).get('record')).toBe(ORDER);
    await expect(page.getByRole('heading', { level: 1, name: /^SO-/ })).toBeVisible();
    await expect(reference(page)).toHaveValue('PO-525-EDIT');
    await expect(bar(page)).toBeVisible();
    await expect(modLink(page, 'Sales orders')).toHaveAttribute('aria-current', 'page');
    await expect(modLink(page, 'Customers')).not.toHaveAttribute('aria-current');
    expect(await historyGoCalls(page)).toEqual([]);
  });

  test('an order opened from the list: "Discard changes" shows the list of the module chosen, the edit is not saved; no history.go', async ({ page }) => {
    await openApp(page);
    await spyHistoryGo(page);
    await page.locator('a[data-record-id]').first().click();
    await expect(reference(page)).toBeVisible();
    const id = await page.evaluate(() => new URLSearchParams(window.location.search).get('record'));
    const saved = await reference(page).inputValue();
    await reference(page).fill('PO-525-EDIT');
    await setControl(page, 'customers');
    await guard(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    expect(params(page).get('module')).toBe('customers');
    expect(params(page).get('record')).toBeNull();
    await expect(modLink(page, 'Customers')).toHaveAttribute('aria-current', 'page');
    await expect(modLink(page, 'Sales orders')).not.toHaveAttribute('aria-current');
    await expect(guard(page)).toHaveCount(0);
    const stored = await page.evaluate(
      (orderId) => (window as unknown as StoresWindow).__ropShowcaseAppStores?.['sales-orders'].snapshot().find((o) => o.id === orderId)?.customerReference,
      id,
    );
    expect(stored).toBe(saved);
    expect(await historyGoCalls(page)).toEqual([]);
  });

  test('with a save in flight it asks ("Leave anyway"): the list of the module chosen, the save still lands; no history.go', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500');
    await spyHistoryGo(page);
    await reference(page).fill('PO-525-FLIGHT');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page).getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    await setControl(page, 'customers');
    await expect(guard(page)).toContainText('A save is still in progress');
    expect(params(page).get('record')).toBe(ORDER);
    await guard(page).getByRole('button', { name: 'Leave anyway' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    expect(params(page).get('module')).toBe('customers');
    expect(params(page).get('record')).toBeNull();
    await expect(modLink(page, 'Customers')).toHaveAttribute('aria-current', 'page');
    await expect.poll(async () => (await orderStored(page))?.customerReference, { timeout: 5000 }).toBe('PO-525-FLIGHT');
    expect(await historyGoCalls(page)).toEqual([]);
  });

  test('the lists start over: scroll, pill and sort of the orders are gone when the control changes', async ({ page }) => {
    await openApp(page);
    // A scroll of the orders' list as it starts (saved under that list), then a pill and a sort.
    await scrollerOf(page).evaluate((el) => (el.scrollTop = 420));
    await expect.poll(() => scrollerOf(page).evaluate((el) => el.scrollTop)).toBe(420);
    await page.waitForTimeout(300); // the scroll reports itself on the next frame, saved after 150 ms
    await page.getByRole('radio', { name: 'Confirmed' }).click();
    await page.getByRole('button', { name: 'Total' }).click();
    await expect(page.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
    expect(params(page).get('sales-orders.filter')).toBe('confirmed');
    await setControl(page, 'customers');
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(params(page).get('sales-orders.filter')).toBeNull();
    expect(params(page).get('sales-orders.sort')).toBeNull();
    await modLink(page, 'Sales orders').click();
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toBeVisible();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    await expect(page.getByRole('columnheader', { name: /Total/ })).not.toHaveAttribute('aria-sort', 'descending');
    await page.waitForTimeout(300); // a restoration would land with the rows
    expect(await scrollerOf(page).evaluate((el) => el.scrollTop)).toBe(0);
  });

  test('the control naming the module already on screen still starts its list over: pill and scroll', async ({ page }) => {
    await openApp(page);
    await modLink(page, 'Customers').click();
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await page.getByRole('radio', { name: 'Active' }).click();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await scrollerOf(page).evaluate((el) => (el.scrollTop = 420));
    await expect.poll(() => scrollerOf(page).evaluate((el) => el.scrollTop)).toBe(420);
    await page.waitForTimeout(300);
    await setControl(page, 'customers');
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(params(page).get('customers.filter')).toBeNull();
    await expect(page.getByRole('row').nth(5)).toBeVisible();
    await expect(modLink(page, 'Customers')).toHaveAttribute('aria-current', 'page');
    await page.waitForTimeout(300);
    expect(await scrollerOf(page).evaluate((el) => el.scrollTop)).toBe(0);
  });
});

test.describe('Showcase/Record editing as an app: a phone', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('the bar stays on ONE row at 375 px, reachable from the keyboard, with no horizontal overflow', async ({ page }) => {
    await openApp(page);
    const sales = (await modLink(page, 'Sales orders').boundingBox())!;
    const customers = (await modLink(page, 'Customers').boundingBox())!;
    expect(Math.abs(sales.y - customers.y)).toBeLessThan(2);
    expect((await nav(page).boundingBox())!.height).toBeLessThanOrEqual(48);
    await expectNoPageOverflow(page);
    await modLink(page, 'Sales orders').focus();
    await page.keyboard.press('Tab');
    await expect(modLink(page, 'Customers')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: /Customers/ })).toBeVisible();
    await expect(modLink(page, 'Customers')).toHaveAttribute('aria-current', 'page');
    await expectNoPageOverflow(page);
  });

  test('an order page under the bar: the whole page does not scroll, the link to the customer is reachable', async ({ page }) => {
    await openOrder(page);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1)).toBe(false);
    await customerLink(page).scrollIntoViewIfNeeded();
    await expect(customerLink(page)).toBeVisible();
    await expectNoPageOverflow(page);
  });
});
