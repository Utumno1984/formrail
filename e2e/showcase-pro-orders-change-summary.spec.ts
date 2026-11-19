import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { MOBILE_VIEWPORT } from './helpers/viewports';

// #526: the cases of e2e/showcase-pro-change-summary.spec.ts (Pro/Showcase/Invoices with Change Summary, #377 and
// #379) that e2e/showcase-pro-sales-orders.spec.ts did not cover with an equivalent or stronger assertion, on the
// sales orders of Pro/Showcase/Record editing integrity. The mapping, test by test, is in the body of PR #603.
// Seed: so-1 / SO-2026-147000001 (EUR, invoiced, 3 lines, notes), so-13 / SO-2026-161000013 (USD, 4 lines).
const FIXTURE = 'pro-showcase-record-editing-integrity--sales-order-manual';
const FREE_FIXTURE = 'showcase-record-editing--sales-order-crud-manual';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:0';
const ORDER = { id: 'so-1', number: 'SO-2026-147000001' };
const LINES_ORDER = { id: 'so-13', number: 'SO-2026-161000013' };

interface StoredLine {
  id: string;
  productId: string;
  quantity: number;
  unitPriceMinor: number;
  discountPercent: number;
}
interface Stored {
  id: string;
  number: string;
  status: string;
  customerReference: string;
  requestedDeliveryDate: string;
  notes: string;
  lines: StoredLine[];
}
// A local view of the page's globals (other specs declare `__ropShowcaseStore` with their own, narrower shape).
type ShowcaseWindow = {
  __ropShowcaseStore?: { snapshot: () => Stored[]; save: (order: Stored) => Promise<Stored> };
  __ropSaves?: Stored[];
};

const url = (id: string, args: string): string => `/iframe.html?id=${id}&viewMode=story&args=${encodeURIComponent(args)}`;
const reviewDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Review changes' });
const unsavedDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
const changes = (page: Page): Locator => reviewDialog(page).getByRole('list', { name: 'Changes to save' }).getByRole('listitem');
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const saveButton = (page: Page): Locator => footer(page).getByRole('button', { name: 'Save' });
const textbox = (page: Page, name: string): Locator => page.getByRole('textbox', { name, exact: true });
const notes = (page: Page): Locator => textbox(page, 'Notes');

/** Opens an order from the list and records every call to the store's `save`; returns the stored order. */
async function openOrder(page: Page, { args = FAST, order = ORDER, id = FIXTURE } = {}): Promise<Stored> {
  await page.goto(url(id, args));
  await page.getByRole('link', { name: order.number }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(order.number) })).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as ShowcaseWindow;
    const store = w.__ropShowcaseStore!;
    const original = store.save.bind(store);
    w.__ropSaves = [];
    store.save = (o) => {
      w.__ropSaves!.push(o);
      return original(o);
    };
  });
  return (await stored(page, order.id))!;
}

const stored = (page: Page, id = ORDER.id): Promise<Stored | undefined> =>
  page.evaluate((i) => (window as unknown as ShowcaseWindow).__ropShowcaseStore?.snapshot().find((o) => o.id === i), id);
const saves = (page: Page): Promise<Stored[]> => page.evaluate(() => (window as unknown as ShowcaseWindow).__ropSaves ?? []);

async function choose(page: Page, field: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option }).click();
}

/** The product of line `n` as the review names it (the option text without its SKU). */
const productOf = async (page: Page, n: number): Promise<string> =>
  ((await page.getByRole('combobox', { name: `Line ${n} product` }).textContent()) ?? '').replace(/ \([^)]*\)$/, '');

/** The text of an item as read by assistive technology (the arrow is `aria-hidden`). */
const itemTexts = (page: Page): Promise<string[]> =>
  changes(page).evaluateAll((items) =>
    items.map((item) => {
      const copy = item.cloneNode(true) as Element;
      for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    }),
  );

/** No box of the dialog sticks out of its right edge, and no scroll container inside it scrolls sideways. */
const overflowOf = (dialog: Locator): Promise<string[]> =>
  dialog.evaluate((el) => {
    const edge = el.getBoundingClientRect().right;
    const all = [el, ...el.querySelectorAll('*')] as HTMLElement[];
    // The visually hidden "from"/"to" words, clipped to 1px on purpose, are not content boxes.
    const shown = all.filter((n) => n.getBoundingClientRect().width > 1);
    return [
      ...shown.filter((n) => n.getBoundingClientRect().right > edge + 0.5).map((n) => `sticks out: ${n.className}`),
      ...shown
        .filter((n) => ['auto', 'scroll'].includes(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1)
        .map((n) => `scrolls sideways: ${n.className}`),
    ];
  });

test.describe('Pro/Showcase/Record editing integrity: the review of a sales order (#526, from the invoices)', () => {
  test('"Save changes" (double click) on a unit price: one entry as money, "Saving…", ONE save, the new baseline is what the server returned', async ({ page }) => {
    const order = await openOrder(page, { args: 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500' });
    const product = await productOf(page, 1);
    await textbox(page, 'Line 1 unit price (EUR)').fill('1234.5');
    await saveButton(page).click();
    await expect(changes(page)).toHaveCount(1);
    expect(await itemTexts(page)).toEqual([`Lines > Line 1 (${product}) > Unit price, changed, from €196.20 to €1,234.50`]);
    expect(order.lines[0]!.unitPriceMinor).toBe(19620);
    // A double click on the confirmation: one save (#344).
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).dblclick();
    await expect(reviewDialog(page)).toHaveCount(0);
    await expect(footer(page)).toContainText('Saving…');
    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true');
    // Save pressed while the save runs (#166): `aria-disabled` does not block a real click, the editor does.
    await saveButton(page).click({ force: true });
    await expect(reviewDialog(page)).toHaveCount(0);
    await expect(footer(page)).toBeHidden({ timeout: 10_000 });
    const sent = await saves(page);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ id: ORDER.id });
    expect(sent[0]!.lines[0]).toMatchObject({ id: order.lines[0]!.id, unitPriceMinor: 123450 });
    // The server's value (2 decimals) is the new baseline.
    await expect(textbox(page, 'Line 1 unit price (EUR)')).toHaveValue('1234.50');
    expect((await stored(page))!.lines[0]!.unitPriceMinor).toBe(123450);
  });

  test('"Keep editing" and Escape: nothing saved, the values stay, the form stays dirty, the focus back on Save', async ({ page }) => {
    await openOrder(page);
    await notes(page).fill('Draft note');
    for (const close of ['Keep editing', 'Escape'] as const) {
      await saveButton(page).click();
      await expect(reviewDialog(page)).toBeVisible();
      if (close === 'Escape') await page.keyboard.press('Escape');
      else await reviewDialog(page).getByRole('button', { name: 'Keep editing' }).click();
      await expect(reviewDialog(page)).toHaveCount(0);
      await expect(saveButton(page)).toBeFocused();
      await expect(notes(page)).toHaveValue('Draft note');
      await expect(footer(page)).toBeVisible();
    }
    expect(await saves(page)).toHaveLength(0);
  });

  test('after a save, the next review is against the NEW saved baseline', async ({ page }) => {
    const order = await openOrder(page);
    await notes(page).fill('First');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    await notes(page).fill('Second');
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('1 change will be saved.');
    expect(await itemTexts(page)).toEqual(['Notes, changed, from First to Second']);
    expect(order.notes).not.toBe('First');
  });

  test('edited and restored by hand: not dirty, no footer, so no Save and no entry', async ({ page }) => {
    const order = await openOrder(page);
    const price = textbox(page, 'Line 1 unit price (EUR)');
    await expect(price).toHaveValue('196.20');
    await price.fill('999');
    await expect(footer(page)).toBeVisible();
    // The same amount written differently (196.2 against 196.20) is not a change either.
    await price.fill('196.2');
    await expect(footer(page)).toBeHidden();
    await notes(page).fill(order.notes + 'x');
    await expect(footer(page)).toBeVisible();
    await notes(page).fill(order.notes);
    await expect(footer(page)).toBeHidden();
  });

  test('an invalid form: Save opens no review; errors and the focus on the first invalid field as without it', async ({ page }) => {
    // The Customer of an existing order is locked: the required field emptied is the quantity of line 1.
    await openOrder(page);
    await notes(page).fill('Changed');
    await textbox(page, 'Line 1 quantity').fill('');
    await saveButton(page).click();
    await expect(page.getByText('1 invalid field')).toBeVisible();
    await expect(textbox(page, 'Line 1 quantity')).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await saves(page)).toHaveLength(0);
  });

  test('a failing save: the error in the footer, the form still dirty, a new Save reviews the same changes', async ({ page }) => {
    const order = await openOrder(page, { args: `${FAST};saveOutcome:error` });
    await choose(page, 'Status', 'Confirmed');
    await notes(page).fill('Retry me');
    await saveButton(page).click();
    const before = await itemTexts(page);
    expect(before).toHaveLength(2);
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toContainText('Could not save the sales order: network error');
    await expect(notes(page)).toHaveValue('Retry me');
    expect(await stored(page)).toEqual(order);
    await saveButton(page).click();
    await expect(reviewDialog(page)).toBeVisible();
    expect(await itemTexts(page)).toEqual(before);
  });

  test('no a11y violations with the review open; named "Review changes", the description linked', async ({ page }) => {
    await openOrder(page);
    await notes(page).fill('a11y');
    await saveButton(page).click();
    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible();
    const describedBy = await dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('1 change will be saved.');
    // Tone `default` (#344): the confirm button is the primary one, but `initialFocus: 'cancel'` opens the focus on
    // "Keep editing".
    await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Save changes' })).not.toBeFocused();
    await expectNoA11yViolations(page);
  });

  test('browser Back with the review open: nothing saved; the dirty-guard asks, on top, with the focus inside it', async ({ page }) => {
    await openOrder(page);
    await notes(page).fill('Leaving?');
    await saveButton(page).click();
    await expect(reviewDialog(page)).toBeVisible();
    const back = page.goBack({ timeout: 10_000 }).catch(() => null);
    const guard = unsavedDialog(page);
    await expect(guard).toBeVisible();
    await expect(guard.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    // Stay: the guard closes, the review is still there to answer, nothing was saved.
    await guard.getByRole('button', { name: 'Keep editing' }).click();
    await expect(guard).toHaveCount(0);
    await expect(reviewDialog(page)).toBeVisible();
    // The focus is back inside the review, never on `body`.
    await expect(reviewDialog(page).locator(':focus')).toHaveCount(1);
    await reviewDialog(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(saveButton(page)).toBeFocused();
    expect(await saves(page)).toHaveLength(0);
    await back;
  });

  test('browser Back with the review open, then "Discard changes": back to the list, nothing saved, no dialog left', async ({ page }) => {
    const order = await openOrder(page);
    await notes(page).fill('Leaving!');
    await saveButton(page).click();
    await expect(reviewDialog(page)).toBeVisible();
    const back = page.goBack({ timeout: 10_000 }).catch(() => null);
    await unsavedDialog(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('table', { name: /Sales orders/ })).toBeVisible();
    await back;
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await saves(page)).toHaveLength(0);
    expect(await stored(page)).toEqual(order);
  });

  test('Enter HELD on Save: the review opens with the focus on "Keep editing", nothing is ever saved unread', async ({ page }) => {
    const order = await openOrder(page);
    await notes(page).fill('Held');
    await saveButton(page).focus();
    // The first keydown opens the review; the auto-repeated ones land on its initial focus.
    await page.keyboard.down('Enter');
    await expect(reviewDialog(page).getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await expect(reviewDialog(page)).toHaveCount(0);
    expect(await saves(page)).toHaveLength(0);
    expect(await stored(page)).toEqual(order);
    await expect(notes(page)).toHaveValue('Held');
    await expect(footer(page)).toBeVisible();
  });

  test('a double click on Save opens ONE review, which stays open', async ({ page }) => {
    await openOrder(page);
    await notes(page).fill('Twice');
    await saveButton(page).dblclick();
    await expect(reviewDialog(page)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    // NOT asserted here, as on the invoices: where the focus is after the second click (it lands on the backdrop of the
    // dialog the first click opened, which leaves the focus on `body` for every modal of the showcase).
    await expect(reviewDialog(page)).toBeVisible();
    expect(await saves(page)).toHaveLength(0);
    // Still fully usable from the keyboard: the trap brings Tab back inside.
    await page.keyboard.press('Tab');
    await expect(reviewDialog(page).locator(':focus')).toHaveCount(1);
  });

  test('Notes of 500 characters on mobile: they wrap inside the dialog, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openOrder(page);
    await notes(page).fill('Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(9).slice(0, 500));
    await saveButton(page).click();
    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible();
    expect(await overflowOf(dialog)).toEqual([]);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    // The page never scrolls sideways either.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
  });

  test('the Free showcase is unchanged: Save saves at once, ONCE, no review', async ({ page }) => {
    await openOrder(page, { args: 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0', id: FREE_FIXTURE });
    await notes(page).fill('Free');
    await saveButton(page).click();
    await expect(footer(page)).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await saves(page)).toHaveLength(1);
  });
});

test.describe('Pro/Showcase/Record editing integrity: the lines in the review (#526, from the invoices #379)', () => {
  /** The ids of the stored lines of so-13, in their order. */
  const lineIds = async (page: Page): Promise<string[]> => (await stored(page, LINES_ORDER.id))!.lines.map((l) => l.id);
  const openLines = (page: Page): Promise<Stored> => openOrder(page, { order: LINES_ORDER });

  test('a quantity changed: ONE entry for that field of that line, a number; a unit price as money', async ({ page }) => {
    const order = await openLines(page);
    const [first, second] = [await productOf(page, 1), await productOf(page, 2)];
    await textbox(page, 'Line 2 quantity').fill('7');
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('1 change will be saved.');
    expect(await itemTexts(page)).toEqual([`Lines > Line 2 (${second}) > Quantity, changed, from 50 to 7`]);
    await reviewDialog(page).getByRole('button', { name: 'Keep editing' }).click();

    await textbox(page, 'Line 2 quantity').fill(String(order.lines[1]!.quantity));
    await textbox(page, 'Line 1 unit price (USD)').fill('1234.5');
    await saveButton(page).click();
    expect(await itemTexts(page)).toEqual([`Lines > Line 1 (${first}) > Unit price, changed, from $61.30 to $1,234.50`]);
  });

  test('only the order: the review opens with its own text and no list; nothing stored before "Save changes", which saves the new order', async ({ page }) => {
    const order = await openLines(page);
    const ids = order.lines.map((l) => l.id);
    const third = await productOf(page, 3);
    await page.getByRole('button', { name: 'Move line 3 up' }).click();
    await saveButton(page).click();
    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription('Only the order of the lines changed.');
    await expect(dialog.getByRole('list')).toHaveCount(0);
    await expect(dialog.getByRole('listitem')).toHaveCount(0);
    expect(await lineIds(page)).toEqual(ids);

    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden({ timeout: 10_000 });
    expect(await lineIds(page)).toEqual([ids[0], ids[2], ids[1], ids[3]]);
    await expect(page.getByRole('combobox', { name: 'Line 2 product' })).toContainText(third);
  });

  test('a reorder AND a change of the moved line: "1 change will be saved.", the line named at its new place, plus the note about the order', async ({ page }) => {
    await openLines(page);
    const second = await productOf(page, 2);
    await page.getByRole('button', { name: 'Move line 3 up' }).click();
    // Line 2 moved down: it is line 3 now.
    await textbox(page, 'Line 3 quantity').fill('6');
    await saveButton(page).click();
    const dialog = reviewDialog(page);
    await expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    expect(await itemTexts(page)).toEqual([`Lines > Line 3 (${second}) > Quantity, changed, from 50 to 6`]);
    await expect(dialog.getByText('The order of the lines also changed.')).toBeVisible();
  });

  test('a new line without a product is blocked by the validation: no dialog', async ({ page }) => {
    await openLines(page);
    await page.getByRole('button', { name: 'Add line' }).click();
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveCount(0);
    await expect(page.getByText('Choose a product.')).toBeVisible();
    expect(await saves(page)).toHaveLength(0);
  });

  test('added then removed before saving: the form is clean again', async ({ page }) => {
    await openLines(page);
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(footer(page)).toBeVisible();
    await page.getByRole('button', { name: 'Remove line 5' }).click();
    await expect(footer(page)).toBeHidden();
  });

  test('no a11y violations with the review open: one entry of each kind, and only the order', async ({ page }) => {
    await openLines(page);
    await textbox(page, 'Line 3 quantity').fill('9');
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByRole('combobox', { name: 'Line 4 product' }).click();
    await page.getByRole('option').nth(2).click();
    await textbox(page, 'Line 4 quantity').fill('1');
    await textbox(page, 'Line 4 unit price (USD)').fill('99');
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('3 changes will be saved.');
    const texts = await itemTexts(page);
    expect(texts).toHaveLength(3);
    expect(texts.map((t) => t.match(/, (changed|added|removed)/)?.[1])).toEqual(['changed', 'added', 'removed']);
    await expectNoA11yViolations(page);

    await openLines(page);
    await page.getByRole('button', { name: 'Move line 3 up' }).click();
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('Only the order of the lines changed.');
    await expectNoA11yViolations(page);
  });

  test('mixed review on mobile, the longest product name added: no horizontal overflow', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openLines(page);
    await textbox(page, 'Line 3 quantity').fill('9');
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByRole('combobox', { name: 'Line 4 product' }).click();
    // The longest product name of the catalogue offered (a long text in the "added" entry and in the line's label).
    const options = page.getByRole('option');
    const labels = await options.allTextContents();
    const longest = labels.reduce((a, b) => (b.length > a.length ? b : a));
    await options.filter({ hasText: longest }).first().click();
    await textbox(page, 'Line 4 quantity').fill('1');
    await textbox(page, 'Line 4 unit price (USD)').fill('99');
    await saveButton(page).click();
    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible();
    await expect(changes(page)).toHaveCount(3);
    expect(longest.length).toBeGreaterThan(40);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await overflowOf(dialog)).toEqual([]);
  });
});
