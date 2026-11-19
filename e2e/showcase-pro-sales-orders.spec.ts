import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { MOBILE_VIEWPORT } from './helpers/viewports';
import { expectPlayToPass } from './helpers/story';

// #522: Pro/Showcase/Record editing integrity, sales orders. The Free record-editing shell with the Pro add-ons:
// "Review changes" before an existing order is saved (Change Summary against the order saved on the server) and
// "Simulate server update" (Form Rebase). The equivalents, on the orders, of showcase-pro-change-summary.spec.ts
// and showcase-pro-rebase.spec.ts (those stay on the invoices until #526).
const PREFIX = 'pro-showcase-record-editing-integrity--';
const FIXTURE = `${PREFIX}sales-order-manual`;
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:0';
/** so-1: EUR, invoiced, 3 lines, notes. so-13: USD, 4 lines. */
const ORDER = { id: 'so-1', number: 'SO-2026-147000001' };
const LINES_ORDER = { id: 'so-13', number: 'SO-2026-161000013' };
const PLAYS = ['sales-order-review-changes', 'sales-order-review-lines', 'sales-order-review-order-only', 'sales-order-server-update'];
const VISUALS = ['sales-order-review-dialog', 'sales-order-conflicts'];

interface StoredLine {
  id: string;
  productId: string;
  quantity: number;
}
interface Stored {
  id: string;
  status: string;
  customerReference: string;
  requestedDeliveryDate: string;
  notes: string;
  lines: StoredLine[];
}
type ShowcaseWindow = {
  __ropShowcaseStore?: { snapshot: () => Stored[]; save: (order: Stored) => Promise<Stored> };
  __ropSaves?: Stored[];
};

const url = (args: string, id = FIXTURE): string => `/iframe.html?id=${id}&viewMode=story&args=${encodeURIComponent(args)}`;
const reviewDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Review changes' });
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const saveButton = (page: Page): Locator => footer(page).getByRole('button', { name: 'Save' });
const conflicts = (page: Page): Locator => page.getByRole('list', { name: 'Conflicts' }).getByRole('listitem');
const notice = (page: Page): Locator => page.locator('.rop-pro-rebase-notice');
const textbox = (page: Page, name: string): Locator => page.getByRole('textbox', { name, exact: true });
const delivery = (page: Page): Locator => page.getByLabel(/^Requested delivery/);
const simulate = (page: Page): Locator => page.getByRole('button', { name: 'Simulate server update' });

/** Opens an order from the list, records every call to the store's `save`; returns the stored order. */
async function openOrder(page: Page, args = FAST, order = ORDER): Promise<Stored> {
  await page.goto(url(args));
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

/** The text of each change as read by assistive technology (the arrow is `aria-hidden`). */
const changes = (page: Page): Promise<string[]> =>
  reviewDialog(page)
    .getByRole('list', { name: 'Changes to save' })
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => {
        const copy = item.cloneNode(true) as Element;
        for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
        return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
      }),
    );

async function choose(page: Page, field: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option }).click();
}

test.describe('Pro/Showcase/Record editing integrity: the stories play', () => {
  for (const id of [...PLAYS, ...VISUALS]) {
    test(`${id}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, `${PREFIX}${id}`);
    });
  }
  for (const id of ['sales-order-review-changes', 'sales-order-review-lines', 'sales-order-server-update']) {
    test(`${id}: the play function also passes with a failing save`, async ({ page }) => {
      await expectPlayToPass(page, `${PREFIX}${id}`, 'saveOutcome:error');
    });
  }
  for (const id of VISUALS) {
    test(`${id}: the reduced-motion preference leads to the same end state`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expectPlayToPass(page, `${PREFIX}${id}`);
    });
  }
});

test.describe('Pro/Showcase/Record editing integrity: the review of a sales order', () => {
  test('Status, Customer reference and Notes + Save: three entries by label and readable value; nothing saved yet', async ({ page }) => {
    const order = await openOrder(page);
    await choose(page, 'Status', 'Confirmed');
    await textbox(page, 'Customer reference').fill('PO-7781');
    await textbox(page, 'Notes').fill('Checked by sales.');
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('3 changes will be saved.');
    expect(await changes(page)).toEqual([
      'Status, changed, from Invoiced to Confirmed',
      `Customer reference, changed, from ${order.customerReference} to PO-7781`,
      `Notes, changed, from ${order.notes} to Checked by sales.`,
    ]);
    await expect(reviewDialog(page)).not.toContainText(/\b(invoiced|confirmed)\b/);
    expect(await saves(page)).toHaveLength(0);
    expect(await stored(page)).toEqual(order);
  });

  test('"Save changes" (double click): ONE save with the values, the footer goes, the store holds them', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1000');
    await textbox(page, 'Customer reference').fill('PO-1');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).dblclick();
    await expect(reviewDialog(page)).toHaveCount(0);
    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true');
    await saveButton(page).click({ force: true });
    await expect(reviewDialog(page)).toHaveCount(0);
    await expect(footer(page)).toBeHidden({ timeout: 10_000 });
    const sent = await saves(page);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ id: ORDER.id, customerReference: 'PO-1' });
  });

  test('after a save, the next review is against the NEW saved order: only the second edit', async ({ page }) => {
    await openOrder(page);
    await textbox(page, 'Notes').fill('First.');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    await textbox(page, 'Customer reference').fill('PO-2');
    await saveButton(page).click();
    expect(await changes(page)).toEqual([expect.stringMatching(/^Customer reference, changed, from .* to PO-2$/)]);
  });

  test('"Keep editing" and Escape: nothing saved, the values stay, the focus back on Save', async ({ page }) => {
    await openOrder(page);
    await textbox(page, 'Notes').fill('Draft');
    for (const close of ['Keep editing', 'Escape'] as const) {
      await saveButton(page).click();
      await expect(reviewDialog(page)).toBeVisible();
      if (close === 'Escape') await page.keyboard.press('Escape');
      else await reviewDialog(page).getByRole('button', { name: 'Keep editing' }).click();
      await expect(reviewDialog(page)).toHaveCount(0);
      await expect(saveButton(page)).toBeFocused();
      await expect(textbox(page, 'Notes')).toHaveValue('Draft');
    }
    expect(await saves(page)).toHaveLength(0);
  });

  test('USD order: line 2 quantity and line 1 removed: named by product, amounts in dollars; a line added too', async ({ page }) => {
    await openOrder(page, FAST, LINES_ORDER);
    const products = await page.getByRole('combobox', { name: /^Line \d product$/ }).allTextContents();
    await textbox(page, 'Line 2 quantity').fill('60');
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByRole('combobox', { name: 'Line 4 product' }).click();
    const option = page.getByRole('option').nth(2);
    const added = ((await option.textContent()) ?? '').replace(/ \([^)]*\)$/, '');
    await option.click();
    await textbox(page, 'Line 4 quantity').fill('2');
    await textbox(page, 'Line 4 unit price (USD)').fill('12');
    await saveButton(page).click();
    const name = (label: string) => label.replace(/ \([^)]*\)$/, '');
    expect(await changes(page)).toEqual([
      `Lines > Line 1 (${name(products[1]!)}) > Quantity, changed, from 50 to 60`,
      `Lines > Line 4 (${added}), added, ${added}, 2 × $12.00`,
      `Lines > Line 1 (${name(products[0]!)}), removed, ${name(products[0]!)}, 50 × $61.30`,
    ]);
    await expect(reviewDialog(page)).not.toContainText(/Item \d/);
  });

  test('only the order: the review opens with its own text and no list; "Save changes" saves the new order', async ({ page }) => {
    const order = await openOrder(page, FAST, LINES_ORDER);
    await page.getByRole('button', { name: 'Move line 3 up' }).click();
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('Only the order of the lines changed.');
    await expect(reviewDialog(page).getByRole('list')).toHaveCount(0);
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    const ids = order.lines.map((l) => l.id);
    expect((await stored(page, LINES_ORDER.id))!.lines.map((l) => l.id)).toEqual([ids[0], ids[2], ids[1], ids[3]]);
  });

  test('a reorder AND a change: "1 change will be saved." and the note about the order', async ({ page }) => {
    await openOrder(page, FAST, LINES_ORDER);
    await page.getByRole('button', { name: 'Move line 3 up' }).click();
    await textbox(page, 'Notes').fill('x');
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('1 change will be saved.');
    await expect(reviewDialog(page)).toContainText('The order of the lines also changed.');
  });

  test('edited and restored by hand: clean, no footer, nothing to review', async ({ page }) => {
    const order = await openOrder(page);
    await textbox(page, 'Customer reference').fill('x');
    await expect(footer(page)).toBeVisible();
    await textbox(page, 'Customer reference').fill(order.customerReference);
    await expect(footer(page)).toBeHidden();
  });

  test('a new order is created directly, without a review', async ({ page }) => {
    await page.goto(url(FAST));
    await page.getByRole('button', { name: 'New sales order' }).click();
    await choose(page, 'Customer', 'Hoevenstrand Coatings BV (EUR)');
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByRole('combobox', { name: 'Line 1 product' }).click();
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /\(201\)/ })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('no a11y violations with the review open; no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openOrder(page, FAST, LINES_ORDER);
    await textbox(page, 'Line 2 quantity').fill('60');
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await saveButton(page).click();
    await expect(reviewDialog(page)).toBeVisible();
    await expectNoA11yViolations(page);
    await expectNoHorizontalOverflow(reviewDialog(page));
  });

  test('the Free showcase is unchanged: Save saves at once, no review', async ({ page }) => {
    await page.goto(`/iframe.html?id=showcase-record-editing--sales-order-crud-manual&viewMode=story&args=${encodeURIComponent('listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0')}`);
    await page.getByRole('link', { name: ORDER.number }).click();
    await textbox(page, 'Notes').fill('x');
    await saveButton(page).click();
    await expect(footer(page)).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(simulate(page)).toHaveCount(0);
  });
});

test.describe('Pro/Showcase/Record editing integrity: server updates on a sales order', () => {
  test('editor without edits: the fields take the update, the form stays clean, "2 fields were updated", no conflict', async ({ page }) => {
    await openOrder(page);
    await simulate(page).click();
    await expect(notice(page)).toContainText('This sales order was updated while you were editing.2 fields were updated.');
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Shipped');
    await expect(delivery(page)).toHaveValue('2026-06-17');
    await expect(footer(page)).toBeHidden();
    await expect(conflicts(page)).toHaveCount(0);
  });

  test('typing in the Notes while the update lands: Status and delivery from the server, the Notes mine, no conflict, the focus and every keystroke kept', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:400');
    const notes = textbox(page, 'Notes');
    await notes.fill('');
    await simulate(page).click();
    await notes.pressSequentially('Call the site first.', { delay: 40 });
    await expect(notice(page)).toBeVisible();
    await expect(notes).toBeFocused();
    await expect(notes).toHaveValue('Call the site first.');
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Shipped');
    await expect(delivery(page)).toHaveValue('2026-06-17');
    await expect(conflicts(page)).toHaveCount(0);
    await expect(footer(page)).toBeVisible();
  });

  test('Requested delivery changed first: a conflict on "Requested delivery"; "Keep mine" closes it and keeps my date', async ({ page }) => {
    await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await simulate(page).click();
    await expect(conflicts(page)).toHaveCount(1);
    await expect(conflicts(page).first()).toContainText('Requested delivery');
    await expect(conflicts(page).first()).toContainText('Yours: Jul 1, 2026');
    await expect(conflicts(page).first()).toContainText('Server: Jun 17, 2026');
    await expect(delivery(page)).toHaveAccessibleDescription('Changed on the server too.');
    await page.getByRole('button', { name: 'Keep mine for Requested delivery' }).click();
    await expect(conflicts(page)).toHaveCount(0);
    await expect(delivery(page)).toHaveValue('2026-07-01');
    await expect(delivery(page)).toBeFocused();
    await expect(footer(page)).toBeVisible();
  });

  test('"Use server value": the field takes it; the only edit, so the form is clean again', async ({ page }) => {
    await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await simulate(page).click();
    await page.getByRole('button', { name: 'Use server value for Requested delivery' }).click();
    await expect(delivery(page)).toHaveValue('2026-06-17');
    await expect(footer(page)).toBeHidden();
  });

  test('line 1 quantity changed by both: a conflict named by the product; my other line edits merged', async ({ page }) => {
    await openOrder(page, `${FAST};serverChange:line-1-quantity`);
    const product = ((await page.getByRole('combobox', { name: 'Line 1 product' }).textContent()) ?? '').replace(/ \([^)]*\)$/, '');
    await textbox(page, 'Line 1 quantity').fill('9');
    await textbox(page, 'Line 2 quantity').fill('40');
    await simulate(page).click();
    await expect(conflicts(page)).toHaveCount(1);
    await expect(conflicts(page).first()).toContainText(`Lines > Line 1 (${product}) > Quantity`);
    await expect(conflicts(page).first()).toContainText('Yours: 9');
    await expect(conflicts(page).first()).toContainText('Server: 2');
    await expect(textbox(page, 'Line 2 quantity')).toHaveValue('40');
  });

  test('the server removes a line I edited: the line kept with my value, a conflict on the row; "Use server value" removes it, the focus on the line that took its place', async ({ page }) => {
    await openOrder(page, `${FAST};serverChange:remove-line-1`);
    await textbox(page, 'Line 1 quantity').fill('7');
    await simulate(page).click();
    await expect(conflicts(page)).toHaveCount(1);
    await expect(conflicts(page).first()).toContainText('7 × €196.20, 5% discount');
    await expect(conflicts(page).first()).toContainText('Server: Removed');
    await expect(textbox(page, 'Line 1 quantity')).toHaveAccessibleDescription('Removed on the server.');
    await conflicts(page).first().getByRole('button', { name: /^Use server value for Lines > Line 1/ }).click();
    await expect(page.getByRole('textbox', { name: /^Line \d quantity$/ })).toHaveCount(2);
    await expect(page.getByRole('combobox', { name: 'Line 1 product' })).toBeFocused();
    await expect(footer(page)).toBeHidden();
  });

  test('a line added by me and one by the server: two lines with different ids, both saved', async ({ page }) => {
    await openOrder(page, `${FAST};serverChange:add-line`);
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByRole('combobox', { name: 'Line 4 product' }).click();
    await page.getByRole('option').nth(3).click();
    await simulate(page).click();
    await expect(page.getByRole('textbox', { name: /^Line \d quantity$/ })).toHaveCount(5);
    await expect(conflicts(page)).toHaveCount(0);
    await saveButton(page).click();
    expect(await changes(page)).toEqual([expect.stringMatching(/^Lines > Line \d \(.+\), added, /)]);
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    const ids = (await stored(page))!.lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual(expect.arrayContaining(['new-1', 'srv-line-1']));
  });

  test('an update during a save: "Applying server update after saving…", then applied on top of the saved values, nothing lost', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500;serverUpdateDelayMs:0');
    await textbox(page, 'Customer reference').fill('PO-9');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true');
    await simulate(page).click();
    await expect(notice(page)).toContainText('Applying server update after saving…');
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Shipped', { timeout: 10_000 });
    await expect(textbox(page, 'Customer reference')).toHaveValue('PO-9');
    await expect(footer(page)).toBeHidden();
    expect(await stored(page)).toMatchObject({ customerReference: 'PO-9', status: 'shipped', requestedDeliveryDate: '2026-06-17' });
  });

  test('Save with an open conflict: the review names the overwritten server change; "Save changes" saves mine', async ({ page }) => {
    await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await simulate(page).click();
    await expect(conflicts(page)).toHaveCount(1);
    await saveButton(page).click();
    await expect(reviewDialog(page).getByRole('list', { name: 'Server changes you overwrite' })).toHaveText('Requested delivery');
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    await expect(notice(page)).toHaveCount(0);
    expect(await stored(page)).toMatchObject({ requestedDeliveryDate: '2026-07-01', status: 'shipped' });
  });

  test('two updates in a row: the conflict of the first stays open, the review still names it as overwritten (#584)', async ({ page }) => {
    await openOrder(page);
    await delivery(page).fill('2026-07-01');
    await textbox(page, 'Notes').fill('Mine');
    await simulate(page).click();
    await expect(conflicts(page)).toHaveCount(1);
    // Another user then changes only the notes: the delivery conflict of the first update is still open.
    await page.evaluate(
      (id) =>
        void (window as unknown as { __ropShowcaseStore: { updateFromServer: (id: string, change: (o: Stored) => Stored) => Promise<Stored> } }).__ropShowcaseStore.updateFromServer(
          id,
          (o) => ({ ...o, notes: 'Theirs' }),
        ),
      ORDER.id,
    );
    await expect(conflicts(page)).toHaveCount(2);
    await expect(conflicts(page).nth(0)).toContainText(/^Requested delivery/);
    await expect(conflicts(page).nth(1)).toContainText(/^Notes/);
    await saveButton(page).click();
    await expect(reviewDialog(page).getByRole('list', { name: 'Server changes you overwrite' }).getByRole('listitem')).toHaveText([
      'Requested delivery',
      'Notes',
    ]);
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    await expect(notice(page)).toHaveCount(0);
    expect(await stored(page)).toMatchObject({ requestedDeliveryDate: '2026-07-01', notes: 'Mine', status: 'shipped' });
  });

  test('the order deleted on the server while edited: an explicit error, my edits still there, leaving asks first', async ({ page }) => {
    await openOrder(page, `${FAST};serverChange:delete-order`);
    await textbox(page, 'Customer reference').fill('PO-lost');
    await simulate(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'This sales order was deleted on the server' })).toBeVisible();
    await expect(textbox(page, 'Customer reference')).toHaveValue('PO-lost');
    await expect(simulate(page)).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  });

  test('"Simulate server update" waits serverUpdateDelayMs before anything changes', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:1500');
    await simulate(page).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Invoiced');
    await expect(page.getByRole('combobox', { name: 'Status' })).toHaveText('Shipped', { timeout: 5000 });
  });

  test('no a11y violations with the notice and two conflicts visible', async ({ page }) => {
    await openOrder(page);
    await choose(page, 'Status', 'Confirmed');
    await delivery(page).fill('2026-07-01');
    await simulate(page).click();
    await expect(conflicts(page)).toHaveCount(2);
    await expectNoA11yViolations(page);
  });
});
