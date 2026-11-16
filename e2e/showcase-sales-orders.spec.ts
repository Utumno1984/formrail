import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #520: Showcase/Record editing -> the Sales orders module: List Report -> Object Page with lines, dirty-tracking
// against the saved order, the edit flow with the dirty-guard, and the special orders of the demo universe
// (so-28 cancelled, so-42 in yen, so-27 with 18 lines, so-12 with a discontinued product).
const FIXTURE = 'showcase-record-editing--sales-order-list-to-record-manual';
const EDIT_FIXTURE = 'showcase-record-editing--sales-order-edit-flow-manual';
const PAGE_FIXTURE = 'showcase-record-editing--sales-order-record-page-manual';
const NO_DELAYS = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
const VISUAL_STORIES = [
  'sales-order-record-open',
  'sales-order-record-dirty',
  'sales-order-leave-guard-open',
  'sales-order-list-after-save',
  'sales-order-record-lines',
].map((n) => `showcase-record-editing--${n}`);

const SCROLLER = '[data-object-page-scroller]';
const ITALIAN = ['Sezioni', 'Chiudi', 'Azioni di salvataggio', 'Modifiche non salvate', 'Nessun', 'Ordini', 'Cerca'];

type KeyboardWindow = { __setKeyboard: (px: number) => void };

const table = (page: Page): Locator => page.getByRole('table', { name: /Sales orders/ });
const params = (page: Page): URLSearchParams => new URL(page.url()).searchParams;
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const bar = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const total = (page: Page): Locator => page.locator('[data-order-total]');
const quantity = (page: Page, n: number): Locator => page.getByRole('textbox', { name: `Line ${n} quantity` });

async function openList(page: Page, query = ''): Promise<void> {
  await page.goto(`/iframe.html?id=${FIXTURE}&viewMode=story&args=${encodeURIComponent(NO_DELAYS)}${query ? `&${query}` : ''}`);
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('row').nth(5)).toBeVisible();
}

/** The order page of `id` as a deep link (the shell reads the route from the URL). */
async function openOrder(page: Page, id: string): Promise<void> {
  await page.goto(`/iframe.html?id=${FIXTURE}&viewMode=story&args=${encodeURIComponent(NO_DELAYS)}&module=sales-orders&record=${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(quantity(page, 1)).toBeVisible();
}

const activeIs = (page: Page, selector: string): Promise<boolean> =>
  page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector);

test.describe('Showcase/Record editing: the stories play', () => {
  for (const id of [
    'sales-order-record-page',
    'sales-order-lines',
    'sales-order-list-to-record',
    'sales-order-edit-flow',
    ...VISUAL_STORIES.map((s) => s.replace('showcase-record-editing--', '')),
  ]) {
    test(`${id}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, `showcase-record-editing--${id}`);
    });
  }

  test('the reduced-motion preference leads the visual stories to the same end state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const id of VISUAL_STORIES) await expectPlayToPass(page, id);
  });
});

test.describe('Showcase/Record editing: the list', () => {
  test('200 orders with the six columns, the Total right-aligned, the status as a badge, no word of another language', async ({ page }) => {
    await openList(page);
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toContainText('200');
    for (const header of ['Number', 'Customer', 'Order date', 'Requested delivery', 'Total', 'Status']) {
      await expect(page.getByRole('columnheader', { name: new RegExp(header) })).toBeVisible();
    }
    const first = page.getByRole('row').nth(1);
    const cells = first.getByRole('cell');
    // Total: the currency symbol, grouped digits, right-aligned (aligned to the end of the cell).
    await expect(cells.nth(4)).toHaveText(/^[€$£¥][\d,]+(\.\d{2})?$/);
    expect(await cells.nth(4).evaluate((el) => getComputedStyle(el).textAlign)).toMatch(/right|end/);
    await expect(cells.nth(5)).toHaveText(/^(Draft|Confirmed|Shipped|Invoiced|Cancelled)$/);
    const body = (await page.locator('body').innerText()) ?? '';
    for (const word of ITALIAN) expect(body, word).not.toContain(word);
  });

  test('the pills filter by status and the search finds a number and a customer', async ({ page }) => {
    await openList(page);
    await page.getByRole('radio', { name: 'Cancelled' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Sales orders/ })).toContainText('20 of 200');
    await expect(page.getByRole('row').nth(1).getByRole('cell').nth(5)).toHaveText('Cancelled');
    await page.getByRole('radio', { name: 'All' }).click();
    await page.getByRole('searchbox', { name: 'Search' }).fill('SO-2026-247000026');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect(page.getByRole('row')).toHaveCount(2);
    const customer = (await page.getByRole('row').nth(1).getByRole('cell').nth(1).textContent()) ?? '';
    await page.getByRole('searchbox', { name: 'Search' }).fill(customer);
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    await expect(page.getByRole('row').nth(1)).toContainText(customer);
    expect(params(page).get('sales-orders.q')).toBe(customer);
  });

  test('the first click on Total sorts descending, the second ascending', async ({ page }) => {
    await openList(page);
    const header = page.getByRole('columnheader', { name: /Total/ });
    await page.getByRole('button', { name: 'Total' }).click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(params(page).get('sales-orders.sort')).toBe('total.desc');
    await page.getByRole('button', { name: 'Total' }).click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
  });

  test('Total sorts by the amount, not by the minor units: a yen order does not outweigh a euro one', async ({ page }) => {
    await openList(page);
    await page.getByRole('button', { name: 'Total' }).click();
    const symbols = await page.getByRole('row').evaluateAll((rows) =>
      rows.slice(1, 40).map((r) => r.querySelectorAll('td')[4]?.textContent ?? ''),
    );
    // In the 39 biggest totals, yen are not all at the top: with minor units they would be (a yen is 1 unit, a cent 1/100).
    const firstTen = symbols.slice(0, 10);
    expect(firstTen.filter((t) => t.startsWith('¥')).length).toBeLessThan(10);
  });
});

test.describe('Showcase/Record editing: list -> order -> list', () => {
  test('opens the order: header with number, customer, status and total; the four sections; the list is gone', async ({ page }) => {
    await openList(page);
    await page.getByRole('radio', { name: 'Confirmed' }).click();
    const link = page.locator('a[data-record-id]').first();
    const number = (await link.textContent()) ?? '';
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
    await expect(page.getByText('Confirmed').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link')).toHaveText(['General', 'Lines', 'Delivery', 'Notes']);
    await expect(table(page)).toHaveCount(0);
    expect(params(page).get('module')).toBe('sales-orders');
    await expect(bar(page)).toBeHidden();
  });

  test('Back to list: the pill, the sort and the focus on the opened link come back', async ({ page }) => {
    await openList(page);
    await page.getByRole('radio', { name: 'Shipped' }).click();
    await page.getByRole('button', { name: 'Total' }).click();
    const link = page.locator('a[data-record-id]').nth(3);
    const number = (await link.textContent()) ?? '';
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Shipped' })).toBeChecked();
    await expect(page.getByRole('columnheader', { name: /Total/ })).toHaveAttribute('aria-sort', 'descending');
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe(number);
  });

  test('change a quantity, save, back: the list row shows the new total (and the order keeps the sort)', async ({ page }) => {
    await openList(page);
    await page.getByRole('radio', { name: 'Confirmed' }).click();
    const link = page.locator('a[data-record-id]').first();
    const number = (await link.textContent()) ?? '';
    const row = () => page.getByRole('row').filter({ has: page.getByRole('link', { name: number, exact: true }) });
    const before = (await row().getByRole('cell').nth(4).textContent()) ?? '';
    await link.click();
    await expect(quantity(page, 1)).toBeVisible();
    await expect(bar(page)).toBeHidden();
    const shown = (await total(page).textContent()) ?? '';
    await quantity(page, 1).fill('41');
    await expect(bar(page)).toBeVisible();
    await expect(total(page)).not.toHaveText(shown);
    const after = (await total(page).textContent()) ?? '';
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    await back(page).click();
    await expect(table(page)).toBeVisible();
    await expect(row().getByRole('cell').nth(4)).toHaveText(after);
    expect(after).not.toBe(before);
    await expect.poll(() => activeIs(page, 'a[data-record-id]')).toBe(true);
  });

  test('putting the saved quantity back removes the save bar; discarding restores the order', async ({ page }) => {
    await openOrder(page, 'so-15');
    const original = await quantity(page, 1).inputValue();
    const saved = (await total(page).textContent()) ?? '';
    await quantity(page, 1).fill('12');
    await expect(bar(page)).toBeVisible();
    await quantity(page, 1).fill(original);
    await expect(bar(page)).toBeHidden();
    await quantity(page, 2).fill('33');
    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(bar(page)).toBeHidden();
    await expect(total(page)).toHaveText(saved);
  });

  test('the dirty-guard: "Back to list" asks, "Keep editing" returns the focus to it, "Discard changes" leaves', async ({ page }) => {
    await openOrder(page, 'so-15');
    await page.getByRole('textbox', { name: 'Notes' }).fill('Changed on purpose');
    await back(page).click();
    const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).toBeHidden();
    await expect(back(page)).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveValue('Changed on purpose');
    await back(page).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Discard changes' }).click();
    await expect(table(page)).toBeVisible();
  });

  test('adding a line and pressing Back asks for confirmation: Keep editing keeps the new line', async ({ page }) => {
    await openOrder(page, 'so-15');
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByRole('combobox', { name: 'Line 3 product' })).toBeFocused();
    await back(page).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByRole('combobox', { name: 'Line 3 product' })).toBeVisible();
    await expect(back(page)).toBeFocused();
  });

  test('a save that fails keeps the form dirty with the message, and the store unchanged', async ({ page }) => {
    await page.goto(`/iframe.html?id=${FIXTURE}&viewMode=story&args=${encodeURIComponent(`${NO_DELAYS};saveOutcome:error`)}&module=sales-orders&record=so-15`);
    await quantity(page, 1).fill('55');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toContainText(/Could not save the sales order/);
    await expect(bar(page)).toBeVisible();
    await expect(quantity(page, 1)).toHaveValue('55');
    const stored = await page.evaluate(() => {
      const store = (window as unknown as { __ropShowcaseStore?: { snapshot: () => { id: string; lines: { quantity: number }[] }[] } }).__ropShowcaseStore;
      return store?.snapshot().find((o) => o.id === 'so-15')?.lines[0]?.quantity;
    });
    expect(stored).not.toBe(55);
  });
});

test.describe('Showcase/Record editing: the edit flow, driven by hand', () => {
  test('edit flow fixture: open, edit, save, back; the total in the list is the stored one', async ({ page }) => {
    await page.goto(`/iframe.html?id=${EDIT_FIXTURE}&viewMode=story&args=${encodeURIComponent(NO_DELAYS)}`);
    await expect(table(page)).toBeVisible();
    await page.getByRole('radio', { name: 'Draft' }).click();
    const link = page.locator('a[data-record-id]').first();
    const number = (await link.textContent()) ?? '';
    await link.click();
    await quantity(page, 1).fill('3');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    const after = (await total(page).textContent()) ?? '';
    await back(page).click();
    const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: number, exact: true }) });
    await expect(row.getByRole('cell').nth(4)).toHaveText(after);
  });
});

test.describe('Showcase/Record editing: the order page', () => {
  test('the order is mounted hydrated: while it loads there is no field, once loaded the save bar is not there', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:600;saveDelayMs:0');
    await expect(page.getByRole('status')).toHaveText('Loading sales order…');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(quantity(page, 1)).toBeVisible();
    await expect(bar(page)).toBeHidden();
    // Still nothing a moment later: no echo of the loaded values was taken for an edit.
    await page.waitForTimeout(300);
    await expect(bar(page)).toBeHidden();
  });

  test('a load that fails shows the error and Retry; Retry loads the order', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;loadOutcome:error-once');
    await expect(page.getByRole('alert')).toContainText('Could not load the sales order');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(quantity(page, 1)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('an unknown order shows "not found" with no Retry', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;recordId:so-does-not-exist');
    await expect(page.getByRole('alert')).toContainText('Sales order not found');
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  });

  test('a quantity of 0 is refused on Save: message linked to the field, summary in the bar, focus on the field', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;saveDelayMs:0');
    await quantity(page, 1).fill('0');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    const field = quantity(page, 1);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (await field.getAttribute('aria-describedby')) ?? '';
    await expect(page.locator(`[id="${describedBy.split(' ').join('"], [id="')}"]`).filter({ hasText: /^Quantity must be a whole number/ })).toHaveCount(1);
    await expect(bar(page)).toContainText('1 invalid field');
    await expect(field).toBeFocused();
  });

  test('an order with no line is refused; a delivery before the order date is refused', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;saveDelayMs:0');
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await expect(page.getByRole('button', { name: 'Add line' })).toBeFocused();
    await bar(page).getByRole('button', { name: 'Save' }).click();
    const add = page.getByRole('button', { name: 'Add line' });
    await expect(page.getByText('Add at least one line.')).toBeVisible();
    await expect(add).toBeFocused();
    expect(await add.getAttribute('aria-describedby')).toBeTruthy();
    await page.getByRole('button', { name: 'Discard' }).click();
    const delivery = page.getByLabel(/^Requested delivery/);
    await delivery.fill('2020-01-01');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Requested delivery cannot be before the order date.')).toBeVisible();
    expect(await delivery.getAttribute('aria-describedby')).toBeTruthy();
  });

  test('the lines: add, fill, remove; the order total follows every step', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;saveDelayMs:0');
    const saved = (await total(page).textContent()) ?? '';
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByRole('combobox', { name: 'Line 3 product' })).toBeFocused();
    await expect(total(page)).toHaveText('—');
    await page.getByRole('combobox', { name: 'Line 3 product' }).click();
    await page.getByRole('option').first().click();
    await expect(page.getByRole('textbox', { name: /^Line 3 unit price/ })).toHaveValue(/^\d+\.\d{2}$/);
    await expect(total(page)).not.toHaveText('—');
    await expect(total(page)).not.toHaveText(saved);
    await page.getByRole('button', { name: 'Remove line 3' }).click();
    await expect(page.getByRole('button', { name: 'Remove line 2' })).toBeFocused();
    await expect(total(page)).toHaveText(saved);
    await expect(bar(page)).toBeHidden();
  });

  test('lines move: the order of the lines is a change, moving back is not', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;saveDelayMs:0');
    await page.getByRole('button', { name: 'Move line 1 down' }).click();
    await expect(bar(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move line 2 down' })).toBeFocused();
    await page.getByRole('button', { name: 'Move line 2 up' }).click();
    await expect(bar(page)).toBeHidden();
  });

  test('a discontinued product stays visible on its line and is not among the options', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;recordId:so-12');
    const discontinued = page.getByRole('combobox').filter({ hasText: /discontinued/ }).first();
    await expect(discontinued).toBeVisible();
    await expect(bar(page)).toBeHidden();
    await discontinued.click();
    await expect(page.getByRole('option').first()).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: /discontinued/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('an order in yen: whole yen in the input and in every total; a decimal is refused', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;recordId:so-42');
    const price = page.getByRole('textbox', { name: /^Line 1 unit price \(JPY\)/ });
    await expect(price).toHaveValue(/^\d+$/);
    await expect(page.locator('[data-line-total]').first()).toHaveText(/^¥[\d,]+$/);
    await expect(total(page)).toHaveText(/^¥[\d,]+$/);
    await expect(page.getByRole('heading', { level: 1 }).locator('xpath=../..')).toContainText('¥');
    await price.fill('99.5');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/no decimals/)).toBeVisible();
    await expect(price).toBeFocused();
  });

  test('a cancelled order is read-only: locked fields with their reason, no way to change the lines, from the keyboard either', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;recordId:so-28');
    const field = quantity(page, 1);
    await expect(field).toHaveAttribute('readonly', '');
    const reasonId = ((await field.getAttribute('aria-describedby')) ?? '').split(' ')[0]!;
    await expect(page.locator(`[id="${reasonId}"]`)).toHaveText('A cancelled order cannot be edited.');
    const value = await field.inputValue();
    await field.focus();
    await page.keyboard.type('77');
    await expect(field).toHaveValue(value);
    await expect(page.getByRole('button', { name: 'Add line' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove line/ })).toHaveCount(0);
    for (const name of ['Status', 'Line 1 product']) {
      const select = page.getByRole('combobox', { name });
      await select.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('option')).toHaveCount(0);
    }
    await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveAttribute('readonly', '');
    await expect(bar(page)).toBeHidden();
  });

  test('an order of 18 lines: the focused field is not covered by the Anchor Bar nor by the save bar', async ({ page }) => {
    await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;recordId:so-27');
    await expect(page.getByRole('button', { name: /^Remove line / })).toHaveCount(18);
    await page.getByRole('textbox', { name: 'Notes' }).fill('Dirty on purpose');
    await expect(bar(page)).toBeVisible();
    for (const n of [9, 18]) {
      await quantity(page, n).focus();
      const field = quantity(page, n);
      const f = await field.evaluate((el) => el.getBoundingClientRect().toJSON());
      const anchor = await page.getByRole('navigation', { name: 'Sections' }).evaluate((el) => el.getBoundingClientRect().toJSON());
      const save = await bar(page).evaluate((el) => el.getBoundingClientRect().toJSON());
      expect(f.top, `line ${n} under the Anchor Bar`).toBeGreaterThanOrEqual(anchor.bottom - 1);
      expect(f.bottom, `line ${n} over the save bar`).toBeLessThanOrEqual(save.top + 1);
    }
  });
});

test.describe('Showcase/Record editing: viewports', () => {
  for (const [name, viewport] of [
    ['mobile', { width: 375, height: 667 }],
    ['tablet', { width: 768, height: 1024 }],
  ] as const) {
    test.describe(name, () => {
      test.use({ viewport, hasTouch: true });

      test.beforeEach(async ({ page }) => {
        // Same stand-in for the visual viewport as e2e/showcase-visual.spec.ts and e2e/field.spec.ts.
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
          (window as unknown as KeyboardWindow).__setKeyboard = (px) => {
            keyboard = px;
            target.dispatchEvent(new Event('resize'));
          };
        });
      });

      test('the last line quantity stays above the virtual keyboard and is not covered by the save bar', async ({ page }) => {
        await gotoStory(page, PAGE_FIXTURE, 'loadDelayMs:0;recordId:so-27');
        await page.getByRole('textbox', { name: 'Notes' }).fill('Dirty on purpose');
        await expect(bar(page)).toBeVisible();
        const field = quantity(page, 18);
        await field.scrollIntoViewIfNeeded();
        const keyboard = Math.round(viewport.height * 0.45);
        const rect = (loc: Locator) => loc.evaluate((el) => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
        await field.focus();
        await page.evaluate((px) => (window as unknown as KeyboardWindow).__setKeyboard(px), keyboard);
        await expect.poll(async () => (await rect(field)).bottom).toBeLessThanOrEqual(viewport.height - keyboard);
        expect((await rect(field)).top).toBeGreaterThanOrEqual(0);
        const f = await rect(field);
        const b = await rect(bar(page));
        expect(f.bottom <= b.top + 1 || f.top >= b.bottom - 1).toBe(true);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        await expect(field).toBeFocused();
      });

      test('the page and the list do not overflow sideways; the Anchor Bar with four sections fits', async ({ page }) => {
        await openList(page);
        expect(await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
        await page.locator('a[data-record-id]').first().click();
        await expect(quantity(page, 1)).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link')).toHaveCount(4);
        await expectNoHorizontalOverflow(page.locator('#storybook-root'));
        expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
        await expect(page.locator(SCROLLER)).toBeVisible();
      });
    });
  }
});
