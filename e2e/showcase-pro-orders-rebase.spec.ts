import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

// #526: the cases of e2e/showcase-pro-rebase.spec.ts (Pro/Showcase/Invoices with Change Summary, a server update
// while the record is open: #384, #470, #584) that e2e/showcase-pro-sales-orders.spec.ts did not cover with an
// equivalent or stronger assertion, on the sales orders of Pro/Showcase/Record editing integrity. The store's
// story-only `updateFromServer` changes the stored order (as another user would) and the editor merges it with
// `useFormRebase`; `RebaseNotice` shows the result above the page. The mapping, test by test, is in the body of PR #603.
// Seed: so-1 (EUR, invoiced, 3 lines, delivery 2026-06-10), so-8 (2 lines), so-5 (1 line).
const FIXTURE = 'pro-showcase-record-editing-integrity--sales-order-manual';
const FREE_FIXTURE = 'showcase-record-editing--sales-order-crud-manual';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:0';
const ORDER = { id: 'so-1', number: 'SO-2026-147000001' };
const TWO_LINES = { id: 'so-8', number: 'SO-2026-233000008' };
const ONE_LINE = { id: 'so-5', number: 'SO-2026-144000005' };

interface Line {
  id: string;
  productId: string;
  quantity: number;
  unitPriceMinor: number;
  discountPercent: number;
}
interface Stored {
  id: string;
  number: string;
  status: 'draft' | 'confirmed' | 'shipped' | 'invoiced' | 'cancelled';
  customerReference: string;
  requestedDeliveryDate: string;
  deliveryNotes: string;
  notes: string;
  lines: Line[];
}
type Store = {
  snapshot: () => Stored[];
  updateFromServer: (id: string, change: (o: Stored) => Stored, delayMs?: number) => Promise<Stored>;
  removeFromServer: (id: string, delayMs?: number) => Promise<void>;
};
type ShowcaseWindow = { __ropShowcaseStore?: Store };

const url = (id: string, args: string): string => `/iframe.html?id=${id}&viewMode=story&args=${encodeURIComponent(args)}`;
const STATUS_LABEL = { draft: 'Draft', confirmed: 'Confirmed', shipped: 'Shipped', invoiced: 'Invoiced', cancelled: 'Cancelled' } as const;
// The story's own rule (sales-order-rebase.tsx `NEXT_STATUS`): another user moves an order one step, never to cancelled.
const NEXT_STATUS = { draft: 'confirmed', confirmed: 'shipped', shipped: 'invoiced', invoiced: 'shipped', cancelled: 'cancelled' } as const;

const notice = (page: Page): Locator => page.locator('.rop-pro-rebase-notice');
const conflicts = (page: Page): Locator => page.getByRole('list', { name: 'Conflicts' }).getByRole('listitem');
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const saveButton = (page: Page): Locator => footer(page).getByRole('button', { name: 'Save' });
const notes = (page: Page): Locator => page.getByRole('textbox', { name: 'Notes', exact: true });
const delivery = (page: Page): Locator => page.getByLabel(/^Requested delivery/);
const status = (page: Page): Locator => page.getByRole('combobox', { name: 'Status' });
const reviewDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Review changes' });
const product = (page: Page, n: number): Locator => page.getByRole('combobox', { name: `Line ${n} product` });
const quantity = (page: Page, n: number): Locator => page.getByRole('textbox', { name: `Line ${n} quantity`, exact: true });

async function openOrder(page: Page, order = ORDER, args = FAST): Promise<Stored> {
  await page.goto(url(FIXTURE, args));
  await page.getByRole('link', { name: order.number }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(order.number) })).toBeVisible();
  return (await stored(page, order.id))!;
}

const stored = (page: Page, id = ORDER.id): Promise<Stored | undefined> =>
  page.evaluate((i) => (window as unknown as ShowcaseWindow).__ropShowcaseStore?.snapshot().find((o) => o.id === i), id);

/** Another user changes fields of the stored order (a plain patch), after `delayMs`. */
async function serverPatch(page: Page, id: string, patch: Partial<Stored>, delayMs = 0): Promise<void> {
  await page.evaluate(
    ({ id, patch, delayMs }) => void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.updateFromServer(id, (o) => ({ ...o, ...patch }), delayMs),
    { id, patch, delayMs },
  );
}

/** The server changes line `index` of the stored order (another user's edit). */
const serverSetsQuantity = (page: Page, id: string, index: number, value: number) =>
  page.evaluate(
    ({ id, index, value }) =>
      void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.updateFromServer(id, (o) => ({ ...o, lines: o.lines.map((l, i) => (i === index ? { ...l, quantity: value } : l)) })),
    { id, index, value },
  );

/** The server removes the line at `index` of the stored order (another user's edit). */
const serverRemovesLine = (page: Page, id: string, index: number) =>
  page.evaluate(
    ({ id, index }) => void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.updateFromServer(id, (o) => ({ ...o, lines: o.lines.filter((_, i) => i !== index) })),
    { id, index },
  );

const laterBy = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The product a line shows (the option text without its SKU). */
const productText = async (page: Page, n: number): Promise<string> => ((await product(page, n).textContent()) ?? '').replace(/\s+/g, ' ').trim();
const productName = async (page: Page, n: number): Promise<string> => ((await product(page, n).textContent()) ?? '').replace(/ \([^)]*\)$/, '');

/** Text of an element as read by assistive technology (`aria-hidden` left out), white space collapsed. */
const readText = (locator: Locator): Promise<string> =>
  locator.evaluate((el) => {
    const copy = el.cloneNode(true) as Element;
    for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
  });

const top = (locator: Locator): Promise<number> => locator.evaluate((el) => el.getBoundingClientRect().top);

test.describe('Pro/Showcase/Record editing integrity: server updates on a sales order (#526, from the invoices #384)', () => {
  test('editor without edits: the exact notice, "2 fields were updated", the form stays clean, no conflict', async ({ page }) => {
    const order = await openOrder(page);
    const next = NEXT_STATUS[order.status];
    await serverPatch(page, order.id, { status: next, requestedDeliveryDate: laterBy(order.requestedDeliveryDate, 7) });
    await expect(notice(page)).toBeVisible();
    await expect(status(page)).toHaveText(STATUS_LABEL[next]);
    await expect(delivery(page)).toHaveValue(laterBy(order.requestedDeliveryDate, 7));
    await expect(footer(page)).toBeHidden();
    expect(await readText(notice(page))).toBe('Information: This sales order was updated while you were editing.2 fields were updated.');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
  });

  test('Notes edited, the server changes Status: Status updated, Notes mine, the form dirty, no conflict', async ({ page }) => {
    const order = await openOrder(page);
    await notes(page).fill('Checked by sales.');
    await serverPatch(page, order.id, { status: NEXT_STATUS[order.status] });
    await expect(status(page)).toHaveText(STATUS_LABEL[NEXT_STATUS[order.status]]);
    await expect(notes(page)).toHaveValue('Checked by sales.');
    await expect(footer(page)).toBeVisible();
    expect(await readText(notice(page))).toBe('Information: This sales order was updated while you were editing.1 field was updated.');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
  });

  test('Requested delivery edited, the server changes it to another date: mine shown, a conflict with both dates localized, the Field explained; "Use server value" makes the form clean again', async ({ page }) => {
    const order = await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08' });
    await expect(conflicts(page)).toHaveCount(1);
    await expect(delivery(page)).toHaveValue('2026-07-01');
    expect(await readText(conflicts(page).first())).toBe('Requested delivery Yours: Jul 1, 2026 Server: Jul 8, 2026 Use server value Keep mine');
    await expect(conflicts(page).first()).not.toContainText('2026-07');
    // `aria-describedby` to a real element; the accessible name unchanged.
    await expect(delivery(page)).toHaveAccessibleDescription('Changed on the server too.');
    await expect(delivery(page)).toHaveAccessibleName('Requested delivery');
    const describedBy = (await delivery(page).getAttribute('aria-describedby'))!.split(' ');
    const texts = await Promise.all(describedBy.map((id) => page.locator(`[id="${id}"]`).textContent()));
    expect(texts).toContain('Changed on the server too.');
    await expect(notice(page)).toHaveText(/1 field you edited was also changed on the server\./);

    await page.getByRole('button', { name: 'Use server value for Requested delivery' }).click();
    await expect(delivery(page)).toHaveValue('2026-07-08');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(delivery(page)).not.toHaveAccessibleDescription('Changed on the server too.');
    // It was the only edit: clean, the footer hidden; the notice (nothing left to say) gone.
    await expect(footer(page)).toBeHidden();
    await expect(notice(page)).toHaveCount(0);
    // The button is gone: the focus is back where it came from (the field), never on <body>.
    await expect(delivery(page)).toBeFocused();
    expect(order.requestedDeliveryDate).not.toBe('2026-07-08');
  });

  test('"Keep mine" clicked with the mouse, no focus before: the focus goes to the field of the conflict, never <body>', async ({ page }) => {
    const order = await openOrder(page);
    await delivery(page).fill('2026-07-01');
    // Nothing focused (a click on an empty spot of the page): the notice has no "where it came from".
    await delivery(page).evaluate((el) => (el as HTMLElement).blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08' });
    await page.getByRole('button', { name: 'Keep mine for Requested delivery' }).click();
    await expect(notice(page)).toHaveCount(0);
    await expect(delivery(page)).toBeFocused();
  });

  test('Save with an open conflict: the review names the overwritten server change; "Save changes" saves mine, the notice goes away', async ({ page }) => {
    const order = await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08' });
    await expect(conflicts(page)).toHaveCount(1);
    await saveButton(page).click();
    const dialog = reviewDialog(page);
    await expect(dialog.getByText('You are overwriting a server change')).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Server changes you overwrite' }).getByRole('listitem')).toHaveText(['Requested delivery']);
    await expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    await expect(notice(page)).toHaveCount(0);
    expect((await stored(page))?.requestedDeliveryDate).toBe('2026-07-01');
  });

  test('an update during a save: "Applying server update after saving…", then applied on top of the saved values, nothing lost', async ({ page }) => {
    const order = await openOrder(page, ORDER, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:2000;serverUpdateDelayMs:0');
    await notes(page).fill('Saved note');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toContainText('Saving…');
    const next = NEXT_STATUS[order.status];
    await serverPatch(page, order.id, { status: next });
    await expect(notice(page)).toContainText('Applying server update after saving…');
    await expect(page.getByRole('status').filter({ hasText: 'Applying server update after saving…' })).toHaveCount(1);
    // Not applied while saving.
    await expect(status(page)).toHaveText(STATUS_LABEL[order.status]);
    // The save settles: the update is applied against the saved values.
    await expect(footer(page)).toBeHidden({ timeout: 10_000 });
    await expect(status(page)).toHaveText(STATUS_LABEL[next]);
    await expect(notes(page)).toHaveValue('Saved note');
    await expect(notice(page)).not.toContainText('Applying');
    expect(await readText(notice(page))).toBe('Information: This sales order was updated while you were editing.1 field was updated.');
    expect(await stored(page)).toMatchObject({ notes: 'Saved note', status: next });
  });

  test('an update during a save that changes nothing once applied: the end is announced, never stuck on "Applying…"', async ({ page }) => {
    const order = await openOrder(page, ORDER, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500;serverUpdateDelayMs:0');
    await notes(page).fill('Saved note');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toContainText('Saving…');
    // The other user writes the very value being saved.
    await serverPatch(page, order.id, { notes: 'Saved note' });
    const region = page.locator('.rop-pro-rebase-notice__live');
    await expect(region).toHaveText('This sales order was updated while you were editing. Applying server update after saving…');
    await expect(footer(page)).toBeHidden({ timeout: 10_000 });
    await expect(region).toHaveText('This sales order was updated while you were editing. Server update applied after saving: no field changed.');
    await expect(notice(page)).toHaveCount(0);
    await expect(notes(page)).toHaveValue('Saved note');
  });

  test('lines: the server changes line 1 quantity, I change line 2: both kept, no conflict', async ({ page }) => {
    const order = await openOrder(page);
    await quantity(page, 2).fill('9');
    await serverSetsQuantity(page, order.id, 0, 7);
    await expect(quantity(page, 1)).toHaveValue('7');
    await expect(quantity(page, 2)).toHaveValue('9');
    await expect(notice(page)).toHaveText(/1 field was updated\./);
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(footer(page)).toBeVisible();
    expect(order.lines[0]!.quantity).not.toBe(7);
  });

  test('lines: the server removes a line I edited: a conflict on the row named by its product, the row kept with my value', async ({ page }) => {
    const order = await openOrder(page);
    const first = await productName(page, 1);
    await quantity(page, 1).fill('8');
    await serverRemovesLine(page, order.id, 0);
    await expect(conflicts(page)).toHaveCount(1);
    // so-1 line 1: €196.20 a piece, 5% discount.
    expect(await readText(conflicts(page).first())).toMatch(
      new RegExp(`^Lines > Line 1 \\(${escape(first)}\\) Yours: ${escape(first)}, 8 × €196\\.20, 5% discount Server: Removed Use server value Keep mine$`),
    );
    await expect(quantity(page, 1)).toHaveValue('8');
    await expect(quantity(page, 1)).toHaveAccessibleDescription('Removed on the server.');
    await page.getByRole('button', { name: /^Use server value for Lines > Line 1/ }).click();
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(quantity(page, 3)).toHaveCount(0);
  });

  // #470: after "Use server value" on a line the server removed, that line is gone and the conflict's position names
  // the line that took its place: the focus goes there (next line, else previous one, else "Add line"), never <body>.
  // On an order a line's first field is its product (on an invoice it was the description).
  test('"Use server value" on line 1, which the server removed: the focus goes to the product of the line that took its place', async ({ page }) => {
    const order = await openOrder(page);
    const second = await productText(page, 2);
    await quantity(page, 1).fill('8');
    await serverRemovesLine(page, order.id, 0);
    await expect(conflicts(page)).toHaveCount(1);
    await page.getByRole('button', { name: /^Use server value for Lines > Line 1 / }).click();
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    const heir = product(page, 1);
    await expect(heir).toHaveText(second);
    await expect(heir).toBeFocused();
  });

  test('"Use server value" with the keyboard on the LAST line, which the server removed: the focus goes to the product of the previous line', async ({ page }) => {
    const order = await openOrder(page);
    expect(order.lines).toHaveLength(3);
    const second = await productText(page, 2);
    await quantity(page, 3).fill('8');
    await serverRemovesLine(page, order.id, 2);
    await expect(conflicts(page)).toHaveCount(1);
    await page.getByRole('button', { name: /^Use server value for Lines > Line 3 / }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(product(page, 3)).toHaveCount(0);
    const previous = product(page, 2);
    await expect(previous).toHaveText(second);
    await expect(previous).toBeFocused();
  });

  test('"Use server value" on line 2 of an order with two lines, which the server removed: the focus goes to the product of line 1', async ({ page }) => {
    const order = await openOrder(page, TWO_LINES);
    expect(order.lines).toHaveLength(2);
    const firstName = await productText(page, 1);
    await quantity(page, 2).fill('8');
    await serverRemovesLine(page, order.id, 1);
    await expect(conflicts(page)).toHaveCount(1);
    await page.getByRole('button', { name: /^Use server value for Lines > Line 2 / }).click();
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(product(page, 2)).toHaveCount(0);
    const first = product(page, 1);
    await expect(first).toHaveText(firstName);
    await expect(first).toBeFocused();
  });

  test('"Use server value" on the ONLY line, which the server removed: the focus goes to "Add line"', async ({ page }) => {
    const order = await openOrder(page, ONE_LINE);
    expect(order.lines).toHaveLength(1);
    await quantity(page, 1).fill('8');
    await serverRemovesLine(page, order.id, 0);
    await expect(conflicts(page)).toHaveCount(1);
    await page.getByRole('button', { name: /^Use server value for Lines > Line 1 / }).click();
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    // No line left (an order has no "No line items" text: no line field at all).
    await expect(page.getByRole('combobox', { name: /^Line \d+ product$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add line' })).toBeFocused();
  });

  test('a conflict on a line follows the line by id: moved down, a line removed above it, a line added', async ({ page }) => {
    const order = await openOrder(page);
    const first = await productName(page, 1);
    const second = await productName(page, 2);
    await quantity(page, 1).fill('8');
    await serverSetsQuantity(page, order.id, 0, 5);
    await expect(conflicts(page)).toHaveCount(1);
    expect(await readText(conflicts(page).first())).toMatch(new RegExp(`^Lines > Line 1 \\(${escape(first)}\\) > Quantity Yours: 8 Server: 5 `));

    await page.getByRole('button', { name: 'Move line 1 down' }).click();
    expect(await readText(conflicts(page).first())).toMatch(new RegExp(`^Lines > Line 2 \\(${escape(first)}\\) > Quantity Yours: 8 Server: 5 `));
    await expect(quantity(page, 2)).toHaveAccessibleDescription('Changed on the server too.');
    await expect(quantity(page, 1)).not.toHaveAccessibleDescription('Changed on the server too.');
    await expect(page.getByRole('button', { name: `Use server value for Lines > Line 2 (${first}) > Quantity` })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`\\(${escape(second)}\\)`) })).toHaveCount(0);

    // The line above it removed, then a new line added at the end: still the same row.
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await page.getByRole('button', { name: 'Add line' }).click();
    expect(await readText(conflicts(page).first())).toMatch(new RegExp(`^Lines > Line 1 \\(${escape(first)}\\) > Quantity Yours: 8 `));
    await expect(quantity(page, 1)).toHaveAccessibleDescription('Changed on the server too.');
    // The empty new line would fail the validation of Save: removed again.
    await page.getByRole('button', { name: 'Remove line 3' }).click();

    // The review names the same row.
    await saveButton(page).click();
    await expect(reviewDialog(page).getByRole('list', { name: 'Server changes you overwrite' }).getByRole('listitem')).toHaveText([
      `Lines > Line 1 (${first}) > Quantity`,
    ]);
    await reviewDialog(page).getByRole('button', { name: 'Keep editing' }).click();
    await page.getByRole('button', { name: `Use server value for Lines > Line 1 (${first}) > Quantity` }).click();
    await expect(quantity(page, 1)).toHaveValue('5');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
  });

  // #584 (decision of 2026-11-17, conflicts accumulate).
  test('two updates in a row with different conflicts: the conflict of the first stays next to the second, no ghost', async ({ page }) => {
    const order = await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await notes(page).fill('Mine');
    await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08' });
    await expect(conflicts(page)).toHaveCount(1);
    await serverPatch(page, order.id, { notes: 'Theirs' });
    await expect(conflicts(page)).toHaveCount(2);
    await expect(conflicts(page).nth(0)).toContainText(/^Requested delivery/);
    await expect(conflicts(page).nth(1)).toContainText(/^Notes/);
    await expect(delivery(page)).toHaveAccessibleDescription('Changed on the server too.');
    await expect(notes(page)).toHaveAccessibleDescription('Changed on the server too.');
    // No ghost: the description goes with the conflict it belongs to, the other one stays.
    await page.getByRole('button', { name: 'Use server value for Requested delivery' }).click();
    await expect(delivery(page)).toHaveValue('2026-07-08');
    await expect(conflicts(page)).toHaveCount(1);
    await expect(delivery(page)).not.toHaveAccessibleDescription('Changed on the server too.');
    await expect(notes(page)).toHaveAccessibleDescription('Changed on the server too.');
  });

  test('two updates in a row: the review lists the server change of the first update as overwritten while its conflict is open; resolved, no longer (#584)', async ({ page }) => {
    const order = await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await notes(page).fill('Mine');
    await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08' });
    await expect(conflicts(page)).toHaveCount(1);
    // The second update changes only the notes: the delivery conflict of the first one is still open.
    await serverPatch(page, order.id, { notes: 'Theirs' });
    await expect(conflicts(page)).toHaveCount(2);
    await saveButton(page).click();
    const overwritten = reviewDialog(page).getByRole('list', { name: 'Server changes you overwrite' }).getByRole('listitem');
    await expect(overwritten).toHaveText(['Requested delivery', 'Notes']);
    await reviewDialog(page).getByRole('button', { name: 'Keep editing' }).click();
    // Resolved: no longer overwritten.
    await page.getByRole('button', { name: 'Keep mine for Notes' }).click();
    await expect(conflicts(page)).toHaveCount(1);
    await saveButton(page).click();
    await expect(overwritten).toHaveText(['Requested delivery']);
  });

  test('Discard with an open conflict: back to the server values, the notice closed', async ({ page }) => {
    const order = await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08', status: NEXT_STATUS[order.status] });
    await expect(conflicts(page)).toHaveCount(1);
    await footer(page).getByRole('button', { name: 'Discard' }).click();
    await expect(delivery(page)).toHaveValue('2026-07-08');
    await expect(status(page)).toHaveText(STATUS_LABEL[NEXT_STATUS[order.status]]);
    await expect(notice(page)).toHaveCount(0);
    await expect(footer(page)).toBeHidden();
  });

  test('an update under the open review: the review follows the new baseline', async ({ page }) => {
    const order = await openOrder(page);
    await notes(page).fill('Mine');
    await status(page).click();
    await page.getByRole('option', { name: STATUS_LABEL[NEXT_STATUS[order.status]] }).click();
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('2 changes will be saved.');
    // The server makes the same status change: only the notes are left to save.
    await serverPatch(page, order.id, { status: NEXT_STATUS[order.status] });
    await expect(reviewDialog(page)).toHaveAccessibleDescription('1 change will be saved.');
    await expect(reviewDialog(page).getByRole('list', { name: 'Changes to save' }).getByRole('listitem')).toHaveCount(1);
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    expect(await stored(page)).toMatchObject({ notes: 'Mine', status: NEXT_STATUS[order.status] });
  });

  test('the order deleted on the server: an error message, no merge, my edit kept', async ({ page }) => {
    const order = await openOrder(page);
    await notes(page).fill('Mine');
    await page.evaluate((id) => void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.removeFromServer(id), order.id);
    await expect(page.getByRole('alert').filter({ hasText: 'This sales order was deleted on the server' })).toBeVisible();
    await expect(notes(page)).toHaveValue('Mine');
    await expect(notice(page)).toHaveCount(0);
  });

  test('"Simulate server update" waits serverUpdateDelayMs, then changes Status and Requested delivery', async ({ page }) => {
    const order = await openOrder(page, ORDER, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:600');
    await page.getByRole('button', { name: 'Simulate server update' }).click();
    await page.waitForTimeout(300);
    await expect(notice(page)).toHaveCount(0);
    await expect(delivery(page)).toHaveValue(laterBy(order.requestedDeliveryDate, 7));
    await expect(status(page)).toHaveText(STATUS_LABEL[NEXT_STATUS[order.status]]);
    await expect(notice(page)).toBeVisible();
  });

  test('the live region exists before the update and announces it once', async ({ page }) => {
    const order = await openOrder(page);
    const region = page.locator('.rop-pro-rebase-notice__live');
    await expect(region).toHaveAttribute('role', 'status');
    await expect(region).toHaveText('');
    await delivery(page).fill('2026-07-01');
    await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08', status: NEXT_STATUS[order.status] });
    await expect(region).toHaveText(
      'This sales order was updated while you were editing. 1 field was updated. 1 field you edited was also changed on the server.',
    );
    // The strip that holds the choices is not a live region (no double announcement).
    await expect(notice(page)).not.toHaveAttribute('role');
    await expect(notice(page)).not.toHaveAttribute('aria-live');
  });

  test('the Free showcase has no "Simulate server update" and ignores a server change', async ({ page }) => {
    await page.goto(url(FREE_FIXTURE, 'listLoadDelayMs:0;recordLoadDelayMs:0'));
    await page.getByRole('link', { name: ORDER.number }).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(ORDER.number) })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simulate server update' })).toHaveCount(0);
    const before = await delivery(page).inputValue();
    await serverPatch(page, ORDER.id, { requestedDeliveryDate: '2026-07-08' });
    await page.waitForTimeout(200);
    await expect(delivery(page)).toHaveValue(before);
    await expect(notice(page)).toHaveCount(0);
    // The server did change: the page ignored it.
    expect((await stored(page))?.requestedDeliveryDate).toBe('2026-07-08');
  });
});

test.describe('Pro showcase, sales orders: no visible field moves when the notice appears or goes away (#526, from #384) @engines', () => {
  interface Spot {
    index: number;
    top: number;
    visible: boolean;
  }
  /** Every field of the page's scroller: its top and whether it is fully inside the scroller's visible box. */
  const spots = (page: Page): Promise<Spot[]> =>
    page.evaluate(() => {
      const scroller = document.querySelector('[data-object-page-scroller]')!;
      const box = scroller.getBoundingClientRect();
      return [...scroller.querySelectorAll('input, [role="combobox"]')].map((el, index) => {
        const r = el.getBoundingClientRect();
        return { index, top: r.top, visible: r.top >= box.top && r.bottom <= box.bottom };
      });
    });
  /** The fields visible both times: none of them moved by more than 1px. Returns how many were compared. */
  function expectStill(before: Spot[], after: Spot[]): number {
    const pairs = before.filter((b) => b.visible && after[b.index]?.visible);
    for (const b of pairs) expect(Math.abs(after[b.index]!.top - b.top), `field #${b.index}`).toBeLessThanOrEqual(1);
    return pairs.length;
  }

  for (const focus of ['the Requested delivery field', '"Simulate server update" (above the notice)', 'nothing'] as const) {
    for (const scrolled of [false, true]) {
      test(`focus on ${focus}, page ${scrolled ? 'scrolled' : 'at the top'}: the visible fields keep their place, the focus stays`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        const order = await openOrder(page);
        await delivery(page).fill('2026-07-01');
        if (scrolled) await delivery(page).evaluate((el) => el.scrollIntoView({ block: 'center' }));
        if (focus === '"Simulate server update" (above the notice)') await page.getByRole('button', { name: 'Simulate server update' }).focus();
        if (focus === 'nothing') await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));
        const before = await spots(page);

        // A conflict on the Requested delivery: the notice appears.
        await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08' });
        await expect(conflicts(page)).toHaveCount(1);
        const shown = await spots(page);
        expect(expectStill(before, shown)).toBeGreaterThanOrEqual(3);
        expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))).toBe(focused);

        // The server comes to my date: nothing left to say, the notice goes away.
        await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-01' });
        await expect(notice(page)).toHaveCount(0);
        expect(expectStill(before, await spots(page))).toBeGreaterThanOrEqual(3);
        expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))).toBe(focused);
      });
    }
  }

  test('Notes focused while typing: the notice appears, the field does not move', async ({ page }) => {
    const order = await openOrder(page);
    await notes(page).click();
    const before = await top(notes(page));
    await serverPatch(page, order.id, { status: NEXT_STATUS[order.status], requestedDeliveryDate: laterBy(order.requestedDeliveryDate, 7) });
    await expect(notice(page)).toBeVisible();
    expect(Math.abs((await top(notes(page))) - before)).toBeLessThanOrEqual(1);
  });

  test('the notice sits above the page, in view, at the top and scrolled', async ({ page }) => {
    const order = await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await delivery(page).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08' });
    await expect(notice(page)).toBeInViewport();
    const [noticeBox, scrollerBox] = await Promise.all([notice(page).boundingBox(), page.locator('[data-object-page-scroller]').boundingBox()]);
    expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(scrollerBox!.y + 1);
  });
});

/** Geometry of the focused element against the page's scroller and its sticky Anchor Bar, and a hit test on it. */
interface FocusSpot {
  /** What has the focus: its accessible text, for the messages. */
  label: string;
  top: number;
  bottom: number;
  scrollerTop: number;
  scrollerBottom: number;
  barBottom: number;
  /** The bottom of what the user sees: the visual viewport (above the virtual keyboard). */
  visibleBottom: number;
  /** The point at the middle of the element hits the element itself: nothing covers it. */
  uncovered: boolean;
  focusVisible: boolean;
}
const focusSpot = (page: Page): Promise<FocusSpot> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const r = el.getBoundingClientRect();
    const scroller = document.querySelector('[data-object-page-scroller]')!.getBoundingClientRect();
    const bar = document.querySelector('[data-object-page-scroller] > nav')!.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const vv = window.visualViewport;
    return {
      label: el.getAttribute('aria-label') ?? el.textContent ?? el.tagName,
      top: r.top,
      bottom: r.bottom,
      scrollerTop: scroller.top,
      scrollerBottom: scroller.bottom,
      barBottom: bar.bottom,
      visibleBottom: vv ? vv.offsetTop + vv.height : window.innerHeight,
      uncovered: !!hit && (hit === el || el.contains(hit)),
      focusVisible: el.matches(':focus-visible'),
    };
  });

/** The focused element is whole in the visible part of the scroller, below the Anchor Bar, and nothing covers it. */
function expectFocusInView(spot: FocusSpot): void {
  expect(spot.top, `${spot.label}: below the Anchor Bar`).toBeGreaterThanOrEqual(spot.barBottom);
  expect(spot.bottom, `${spot.label}: above the bottom of the scroller`).toBeLessThanOrEqual(spot.scrollerBottom);
  expect(spot.bottom, `${spot.label}: above the keyboard`).toBeLessThanOrEqual(spot.visibleBottom);
  expect(spot.uncovered, `${spot.label}: not covered`).toBe(true);
}

type FieldSpot = { index: number; top: number; visible: boolean };
/** Every field of the page's scroller: its top and whether it is whole inside the scroller's visible box. */
const fieldSpots = (page: Page): Promise<FieldSpot[]> =>
  page.evaluate(() => {
    const scroller = document.querySelector('[data-object-page-scroller]')!;
    const box = scroller.getBoundingClientRect();
    return [...scroller.querySelectorAll('input, [role="combobox"]')].map((el, index) => {
      const r = el.getBoundingClientRect();
      return { index, top: r.top, visible: r.top >= box.top && r.bottom <= box.bottom };
    });
  });

/** The fields visible both times did not move by more than 1px; returns how many were compared. */
function expectFieldsStill(before: FieldSpot[], after: FieldSpot[]): number {
  const pairs = before.filter((b) => b.visible && after[b.index]?.visible);
  for (const b of pairs) expect(Math.abs(after[b.index]!.top - b.top), `field #${b.index}`).toBeLessThanOrEqual(1);
  return pairs.length;
}

test.describe('Pro showcase, sales orders: a scroll made in the same task as a choice in the notice is kept (#526, from #470 round 2) @engines', () => {
  /** Two conflicts (Requested delivery and Notes): the notice gets shorter when one of them is closed. */
  async function twoConflicts(page: Page): Promise<void> {
    await page.setViewportSize({ width: 1280, height: 800 });
    const order = await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await notes(page).fill('Mine');
    await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08', notes: 'Theirs' });
    await expect(conflicts(page)).toHaveCount(2);
  }
  const rowHeight = (page: Page) => page.locator('[data-editor-notice]').evaluate((el) => el.getBoundingClientRect().height);

  test('the page is scrolled by 120px and "Keep mine" is pressed in the same task: the 120px are kept, only the notice is compensated', async ({ page }) => {
    await twoConflicts(page);
    // Nothing focused (a field being typed in would be kept in view, which is another rule).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.locator('[data-object-page-scroller]').evaluate((el) => void (el.scrollTop = 300));
    // The page really scrolls by 300px (an order page is long enough): the check below is not vacuous.
    expect(await page.locator('[data-object-page-scroller]').evaluate((el) => el.scrollTop)).toBe(300);
    const rowBefore = await rowHeight(page);
    // One task: a scroll (its event comes a frame later), then the click that closes a conflict.
    await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-object-page-scroller]')!;
      scroller.scrollTop += 120;
      document.querySelector<HTMLElement>('[aria-label="Keep mine for Requested delivery"]')!.click();
    });
    await expect(conflicts(page)).toHaveCount(1);
    const rowAfter = await rowHeight(page);
    expect(rowAfter).toBeLessThan(rowBefore - 1);
    const scrollTop = await page.locator('[data-object-page-scroller]').evaluate((el) => el.scrollTop);
    expect(Math.abs(scrollTop - (300 + 120 + rowAfter - rowBefore))).toBeLessThanOrEqual(1);
  });

  test('from the end of the content, a listener of "Keep mine" moves the focus to "Back to list" (the browser scrolls to it): the focus stays in view', async ({ page }) => {
    await twoConflicts(page);
    await page.locator('[data-object-page-scroller]').evaluate((el) => void (el.scrollTop = el.scrollHeight));
    // A callback that moves the focus itself (the documented "a callback that moves the focus itself wins").
    await page.evaluate(() => {
      const back = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Back to list')!;
      document.querySelector('[aria-label="Keep mine for Requested delivery"]')!.addEventListener('click', () => back.focus());
    });
    await page.getByRole('button', { name: 'Keep mine for Requested delivery' }).click();
    await expect(conflicts(page)).toHaveCount(1);
    const back = page.getByRole('button', { name: 'Back to list' });
    await expect(back).toBeFocused();
    const spot = await focusSpot(page);
    expect(spot.top, 'Back to list: not above the scroller').toBeGreaterThanOrEqual(spot.scrollerTop);
    expect(spot.bottom, 'Back to list: not below the scroller').toBeLessThanOrEqual(spot.scrollerBottom);
  });
});

test.describe('Pro showcase, sales orders: focus not obscured by the notice (WCAG 2.4.11, #526, from #470) @engines', () => {
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 800 }],
    ['phone', { width: 390, height: 500 }],
  ] as const) {
    test(`${name}: "Simulate server update" reached with the keyboard and pressed with Enter: no visible field moves, the focus stays; the next Tab lands on a control in view`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openOrder(page);
      await delivery(page).fill('2026-07-01');
      // Keyboard navigation to the button (Tab from the previous header action): its focus indicator is shown, and
      // it was whole in view when it received the focus (what SC 2.4.11 asks).
      await page.getByRole('button', { name: 'Delete' }).focus();
      await page.keyboard.press('Tab');
      const simulate = page.getByRole('button', { name: 'Simulate server update' });
      await expect(simulate).toBeFocused();
      const received = await focusSpot(page);
      expect(received.focusVisible).toBe(true);
      expectFocusInView(received);
      const before = await fieldSpots(page);
      // The header is at the top of the scroller: in the strip the notice takes. The documented choice (#470): the
      // content does not move for a control that is not a typing field, the focus is not moved.
      await page.keyboard.press('Enter');
      await expect(conflicts(page)).toHaveCount(1);
      await expect(simulate).toBeFocused();
      expect(expectFieldsStill(before, await fieldSpots(page))).toBeGreaterThanOrEqual(1);
      // The next control the keyboard reaches is scrolled into view by the browser: not entirely hidden (SC 2.4.11,
      // Minimum). The browser's own focus scrolling ignores the sticky Anchor Bar, so the control may end partly
      // under it (an Object Page behaviour, with or without the notice: reported on #470, not changed here).
      await page.keyboard.press('Tab');
      await expect(simulate).not.toBeFocused();
      const next = await focusSpot(page);
      expect(next.bottom, `${next.label}: partly below the Anchor Bar`).toBeGreaterThan(next.barBottom);
      expect(next.top, `${next.label}: partly above the bottom of the scroller`).toBeLessThan(next.scrollerBottom);
    });

    test(`${name}: "Simulate server update" clicked with the mouse (no focus indicator): no visible field moves`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openOrder(page);
      await delivery(page).fill('2026-07-01');
      const focused = () => page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));
      const simulate = page.getByRole('button', { name: 'Simulate server update' });
      // Where the pointer will press it (the click itself would scroll it into view first).
      await simulate.scrollIntoViewIfNeeded();
      const before = await fieldSpots(page);
      await simulate.click();
      await expect(conflicts(page)).toHaveCount(1);
      // A pointer press shows no focus indicator (WebKit does not even focus a clicked button).
      expect(await page.evaluate(() => !!document.activeElement?.matches('button:focus-visible'))).toBe(false);
      expect(expectFieldsStill(before, await fieldSpots(page))).toBeGreaterThanOrEqual(1);
      const atShown = await focused();
      const order = (await stored(page))!;
      const shown = await fieldSpots(page);
      await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-01' });
      await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
      expect(expectFieldsStill(shown, await fieldSpots(page))).toBeGreaterThanOrEqual(1);
      expect(await focused()).toBe(atShown);
    });
  }

  test('a field being typed in, right under the Anchor Bar: the notice appears, the field is brought back below the bar (it was hidden under it before #470)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const order = await openOrder(page);
    await delivery(page).fill('2026-07-01');
    // The Requested delivery right under the Anchor Bar: in the strip the notice takes from the top of the scroller.
    await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-object-page-scroller]')!;
      const bar = scroller.querySelector('nav')!.getBoundingClientRect();
      const input = scroller.querySelector('[data-rop-name="requestedDeliveryDate"]')!;
      scroller.scrollTop += input.getBoundingClientRect().top - (bar.bottom + 12);
    });
    await delivery(page).focus();
    expectFocusInView(await focusSpot(page));
    await serverPatch(page, order.id, { requestedDeliveryDate: '2026-07-08' });
    await expect(conflicts(page)).toHaveCount(1);
    await expect(delivery(page)).toBeFocused();
    expectFocusInView(await focusSpot(page));
  });
});

// The virtual keyboard is simulated by replacing `window.visualViewport`, chromium only like every other keyboard
// test of the repository (e2e/field.spec.ts, e2e/showcase-line-items.spec.ts): desktop Firefox and WebKit have no
// virtual keyboard. The case without a keyboard is tagged on its own and runs in the three engines.
test.describe('Pro showcase, sales orders, at 390x500: the notice leaves the editor room, also with the virtual keyboard (#526, from #470)', () => {
  // 10rem: the minimum height the page's scroller keeps visible under the notice (notice-cap.ts).
  const EDITOR_MIN = 160;
  // 3rem: the least the notice keeps.
  const NOTICE_MIN = 48;
  // The repository's stand-in for a keyboard: 45% of the height.
  const KEYBOARD = 225;
  type KeyboardWindow = { __setKeyboard: (px: number) => void };
  const setKeyboard = (page: Page, px: number) => page.evaluate((n) => (window as unknown as KeyboardWindow).__setKeyboard(n), px);

  test.use({ viewport: { width: 390, height: 500 } });
  test.beforeEach(async ({ page }) => {
    // Same stand-in for the visual viewport as e2e/showcase-line-items.spec.ts: the keyboard shrinks it from the bottom.
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

  const LONG_MINE = 'Checked by the sales team: the transport costs are included, as agreed in the framework contract.';
  const LONG_THEIRS = 'Confirmed by the warehouse after a call with the customer; the delivery notes are attached.';

  /** Four of my edits: Requested delivery, the quantity of line 1 (a row-level conflict, named by its product), Delivery instructions and Notes (two long texts). */
  async function editFour(page: Page): Promise<Stored> {
    const order = await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await quantity(page, 1).fill('8');
    await page.getByRole('textbox', { name: 'Delivery instructions', exact: true }).fill(`${LONG_MINE} (delivery)`);
    await notes(page).fill(LONG_MINE);
    return order;
  }
  /** The server changes the same four fields: four conflicts, the notice far taller than the screen. */
  async function fourConflicts(page: Page, order: Stored): Promise<void> {
    await serverPatch(page, order.id, {
      requestedDeliveryDate: '2026-07-08',
      deliveryNotes: `${LONG_THEIRS} (delivery)`,
      notes: LONG_THEIRS,
      lines: order.lines.map((line, i) => (i === 0 ? { ...line, quantity: 7 } : line)),
    });
    await expect(conflicts(page)).toHaveCount(4);
  }
  const noticeRow = (page: Page): Locator => page.locator('[data-editor-notice]');
  const heightOf = (locator: Locator): Promise<number> => locator.evaluate((el) => el.getBoundingClientRect().height);
  /** The part of the page's scroller the user sees: under the notice, above the footer and the keyboard. */
  const visibleScroller = (page: Page): Promise<number> =>
    page.evaluate(() => {
      const box = document.querySelector('[data-object-page-scroller]')!.getBoundingClientRect();
      const vv = window.visualViewport!;
      return Math.min(box.bottom, vv.offsetTop + vv.height) - box.top;
    });
  const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  /** Puts Notes near the bottom of the scroller, where the keyboard will cover it, and focuses it. */
  async function focusNotesLow(page: Page): Promise<void> {
    await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-object-page-scroller]')!;
      const field = scroller.querySelector('[data-rop-name="notes"]')!;
      scroller.scrollTop += field.getBoundingClientRect().bottom - (scroller.getBoundingClientRect().bottom - 8);
    });
    await notes(page).focus();
  }

  test('no keyboard: four long conflicts appear, the notice is capped and scrolls on its own, the scroller keeps 10rem, no visible field moves @engines', async ({ page }) => {
    const order = await editFour(page);
    await blur(page);
    const before = await fieldSpots(page);
    await fourConflicts(page, order);
    expect(await visibleScroller(page)).toBeGreaterThanOrEqual(EDITOR_MIN);
    // At most 40% of the 500px editor; the strip inside is far taller and scrolls in its row.
    expect(await heightOf(noticeRow(page))).toBeLessThanOrEqual(200);
    expect(await noticeRow(page).evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(expectFieldsStill(before, await fieldSpots(page))).toBeGreaterThanOrEqual(1);
  });

  test('keyboard open on Notes, then four long conflicts: the notice keeps 3rem, the scroller 10rem above the keyboard, Notes stays visible and does not move', async ({ page }) => {
    const order = await editFour(page);
    await focusNotesLow(page);
    await setKeyboard(page, KEYBOARD);
    await expect.poll(async () => (await focusSpot(page)).bottom).toBeLessThanOrEqual(500 - KEYBOARD);
    expectFocusInView(await focusSpot(page));
    const before = await fieldSpots(page);
    const notesTop = await top(notes(page));

    await fourConflicts(page, order);
    expect(Math.abs((await heightOf(noticeRow(page))) - NOTICE_MIN)).toBeLessThanOrEqual(1);
    expect(await visibleScroller(page)).toBeGreaterThanOrEqual(EDITOR_MIN);
    await expect(notes(page)).toBeFocused();
    expectFocusInView(await focusSpot(page));
    expect(Math.abs((await top(notes(page))) - notesTop)).toBeLessThanOrEqual(1);
    expect(expectFieldsStill(before, await fieldSpots(page))).toBeGreaterThanOrEqual(1);
    // The page never scrolls as a whole (one scroller).
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('four long conflicts, then the keyboard opens on Notes: the notice shrinks to 3rem, Notes ends above the keyboard, uncovered; closing it gives the room back', async ({ page }) => {
    const order = await editFour(page);
    await blur(page);
    await fourConflicts(page, order);
    expect(await heightOf(noticeRow(page))).toBeGreaterThan(NOTICE_MIN + 1);
    await focusNotesLow(page);
    await setKeyboard(page, KEYBOARD);
    await expect.poll(() => heightOf(noticeRow(page))).toBeLessThanOrEqual(NOTICE_MIN + 1);
    await expect.poll(async () => (await focusSpot(page)).bottom).toBeLessThanOrEqual(500 - KEYBOARD);
    await expect(notes(page)).toBeFocused();
    expectFocusInView(await focusSpot(page));
    expect(await visibleScroller(page)).toBeGreaterThanOrEqual(EDITOR_MIN);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // The keyboard goes away: the notice takes its 40% again.
    await setKeyboard(page, 0);
    await expect.poll(() => heightOf(noticeRow(page))).toBeGreaterThan(NOTICE_MIN + 1);
    expect(await visibleScroller(page)).toBeGreaterThanOrEqual(EDITOR_MIN);
  });

  test('the notice row capped then released by the keyboard, then four conflicts closed by the server: no visible field moves (no stale position)', async ({ page }) => {
    const order = await editFour(page);
    await blur(page);
    await fourConflicts(page, order);
    await focusNotesLow(page);
    await setKeyboard(page, KEYBOARD);
    await expect.poll(() => heightOf(noticeRow(page))).toBeLessThanOrEqual(NOTICE_MIN + 1);
    await setKeyboard(page, 0);
    await expect.poll(() => heightOf(noticeRow(page))).toBeGreaterThan(NOTICE_MIN + 1);
    await blur(page);
    const before = await fieldSpots(page);
    const rowBefore = await heightOf(noticeRow(page));
    // As on the invoices after #584: the new update changes the Status AND brings the four fields to the user's values,
    // so the conflicts are gone because the server reached the user's value ("1 field was updated."); the notice is
    // shorter than its cap: it renders, and must scroll by its own change only.
    await serverPatch(page, order.id, {
      status: NEXT_STATUS[order.status],
      requestedDeliveryDate: '2026-07-01',
      deliveryNotes: `${LONG_MINE} (delivery)`,
      notes: LONG_MINE,
      lines: order.lines.map((line, i) => (i === 0 ? { ...line, quantity: 8 } : line)),
    });
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(notice(page)).toContainText('1 field was updated.');
    expect(await heightOf(noticeRow(page))).toBeLessThan(rowBefore - 1);
    expect(expectFieldsStill(before, await fieldSpots(page))).toBeGreaterThanOrEqual(1);
  });
});
