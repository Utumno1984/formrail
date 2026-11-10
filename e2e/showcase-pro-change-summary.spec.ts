import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { MOBILE_VIEWPORT } from './helpers/viewports';
import { expectPlayToPass } from './helpers/story';

// #377: Pro/Showcase/Invoices with Change Summary. The Free CRUD showcase, reused as is, plus a "Review changes"
// dialog before an existing invoice is saved.
const STORY = 'pro-showcase-invoices-with-change-summary--review-changes';
const FIXTURE = 'pro-showcase-invoices-with-change-summary--manual';
const FREE_FIXTURE = 'showcase-invoices--crud-manual';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0';
const RECORD = 'FT-2026-0001';

interface Stored {
  id: string;
  number: string;
  supplier: string;
  status: string;
  amount: number;
  date: string;
  dueDate: string;
  notes: string;
}

// A local view of the page's globals (other specs declare `__ropShowcaseStore` with their own, narrower shape).
type ShowcaseWindow = {
  __ropShowcaseStore?: { snapshot: () => Stored[]; save: (invoice: Stored) => Promise<Stored> };
  __ropSaves?: Stored[];
};

const reviewDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Review changes' });
const changes = (page: Page): Locator => reviewDialog(page).getByRole('list', { name: 'Changes to save' }).getByRole('listitem');
const saveButton = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' }).getByRole('button', { name: 'Save' });
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const notes = (page: Page): Locator => page.getByRole('textbox', { name: 'Notes' });
const amount = (page: Page): Locator => page.getByRole('textbox', { name: /Amount/ });
const unsavedDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });

const url = (id: string, args: string): string => `/iframe.html?id=${id}&viewMode=story&args=${encodeURIComponent(args)}`;

async function openRecord(page: Page, args = FAST, id = FIXTURE): Promise<Stored> {
  await page.goto(url(id, args));
  await page.getByRole('link', { name: RECORD }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(RECORD) })).toBeVisible();
  // Every call to the store's `save`, with what it received.
  await page.evaluate(() => {
    const w = window as unknown as ShowcaseWindow;
    const store = w.__ropShowcaseStore!;
    const original = store.save.bind(store);
    w.__ropSaves = [];
    store.save = (invoice) => {
      w.__ropSaves!.push(invoice);
      return original(invoice);
    };
  });
  return (await stored(page))!;
}

const stored = (page: Page): Promise<Stored | undefined> =>
  page.evaluate((n) => (window as unknown as ShowcaseWindow).__ropShowcaseStore?.snapshot().find((r) => r.number === n), RECORD);
const saves = (page: Page): Promise<Stored[]> => page.evaluate(() => (window as unknown as ShowcaseWindow).__ropSaves ?? []);

async function choose(page: Page, field: RegExp | string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option }).click();
}

const otherSupplier = (r: Stored) => (r.supplier === 'Bianchi Supplies' ? 'Verdi Installations' : 'Bianchi Supplies');
const otherStatus = (r: Stored) => (r.status === 'approved' ? 'Rejected' : 'Approved');

/** The text of an item as read by assistive technology (the arrow is `aria-hidden`). */
const itemTexts = (page: Page): Promise<string[]> =>
  changes(page).evaluateAll((items) =>
    items.map((item) => {
      const copy = item.cloneNode(true) as Element;
      for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    }),
  );

test.describe('Pro/Showcase/Invoices with Change Summary', () => {
  test('the play function passes (open, edit 2 fields, review, confirm, the list row updated)', async ({ page }) => {
    await expectPlayToPass(page, STORY);
  });

  test('the play function also passes with a failing save', async ({ page }) => {
    await expectPlayToPass(page, STORY, 'saveOutcome:error');
  });

  test('Supplier, Status and Notes + Save: "Review changes", "3 changes will be saved.", the labels and readable values; nothing saved yet', async ({ page }) => {
    const record = await openRecord(page);
    await choose(page, /Supplier/, otherSupplier(record));
    await choose(page, 'Status', otherStatus(record));
    await notes(page).fill('Checked by finance.');
    await saveButton(page).click();

    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription('3 changes will be saved.');
    const statusLabel = { pending: 'Open', approved: 'Approved', rejected: 'Rejected' }[record.status];
    expect(await itemTexts(page)).toEqual([
      `Supplier, changed, from ${record.supplier} to ${otherSupplier(record)}`,
      `Status, changed, from ${statusLabel} to ${otherStatus(record)}`,
      `Notes, changed, from ${record.notes === '' ? 'Empty' : record.notes} to Checked by finance.`,
    ]);
    await expect(dialog).not.toContainText(/\b(pending|approved|rejected)\b/);
    expect(await saves(page)).toHaveLength(0);
    expect(await stored(page)).toEqual(record);
  });

  test('"Save changes": the dialog closes, the existing save runs ("Saving…"), the store gets the values ONCE, the new baseline is what it returned', async ({ page }) => {
    const record = await openRecord(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500');
    await amount(page).fill('1234.5');
    await saveButton(page).click();
    await expect(changes(page)).toHaveCount(1);
    expect(await itemTexts(page)).toEqual([`Amount (EUR), changed, from €${record.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} to €1,234.50`]);
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
    expect(sent[0]).toMatchObject({ id: record.id, amount: 1234.5 });
    // The server's value (2 decimals) is the new baseline.
    await expect(amount(page)).toHaveValue('1234.50');
    expect((await stored(page))?.amount).toBe(1234.5);
  });

  test('"Keep editing" and Escape: nothing saved, the values stay, the form stays dirty, the focus back on Save', async ({ page }) => {
    await openRecord(page);
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
    const record = await openRecord(page);
    await notes(page).fill('First');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    await notes(page).fill('Second');
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('1 change will be saved.');
    expect(await itemTexts(page)).toEqual(['Notes, changed, from First to Second']);
    expect(record.notes).not.toBe('First');
  });

  test('edited and restored by hand: not dirty, no footer, so no Save and no entry', async ({ page }) => {
    const record = await openRecord(page);
    const original = await amount(page).inputValue();
    await amount(page).fill('999');
    await expect(footer(page)).toBeVisible();
    // The same number written differently (120 against 120.00) is not a change either.
    await amount(page).fill(String(Number(original)));
    await expect(footer(page)).toBeHidden();
    await notes(page).fill(record.notes + 'x');
    await expect(footer(page)).toBeVisible();
    await notes(page).fill(record.notes);
    await expect(footer(page)).toBeHidden();
  });

  test('an invalid form: Save opens no review; errors and the focus on the first invalid field as without it', async ({ page }) => {
    // The Supplier Select of an existing invoice has no empty option: the required field emptied is the amount.
    await openRecord(page);
    await notes(page).fill('Changed');
    await amount(page).fill('');
    await saveButton(page).click();
    await expect(page.getByText('1 invalid field')).toBeVisible();
    await expect(amount(page)).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await saves(page)).toHaveLength(0);
  });

  test('a creation (#363) saves without a review', async ({ page }) => {
    await page.goto(url(FIXTURE, FAST));
    await page.getByRole('button', { name: 'New invoice' }).click();
    await choose(page, /Supplier/, 'Bianchi Supplies');
    await amount(page).fill('50');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('table', { name: /Invoices/ })).toBeVisible();
    await expect(reviewDialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as ShowcaseWindow).__ropShowcaseStore?.snapshot().length)).toBe(201);
  });

  test('a failing save: the error in the footer, the form still dirty, a new Save reviews the same changes', async ({ page }) => {
    const record = await openRecord(page, `${FAST};saveOutcome:error`);
    await choose(page, 'Status', otherStatus(record));
    await notes(page).fill('Retry me');
    await saveButton(page).click();
    const before = await itemTexts(page);
    expect(before).toHaveLength(2);
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toContainText('Could not save the invoice: network error');
    await expect(notes(page)).toHaveValue('Retry me');
    expect(await stored(page)).toEqual(record);
    await saveButton(page).click();
    await expect(reviewDialog(page)).toBeVisible();
    expect(await itemTexts(page)).toEqual(before);
  });

  test('no a11y violations with the review open; named "Review changes", the description linked', async ({ page }) => {
    await openRecord(page);
    await notes(page).fill('a11y');
    await saveButton(page).click();
    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible();
    const describedBy = await dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('1 change will be saved.');
    // Tone `default` (#344): the confirm button is the primary one and takes the initial focus.
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeFocused();
    await expectNoA11yViolations(page);
  });

  test('browser Back with the review open: nothing saved; the dirty-guard asks, on top, with the focus inside it', async ({ page }) => {
    await openRecord(page);
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
    const record = await openRecord(page);
    await notes(page).fill('Leaving!');
    await saveButton(page).click();
    await expect(reviewDialog(page)).toBeVisible();
    const back = page.goBack({ timeout: 10_000 }).catch(() => null);
    await unsavedDialog(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('table', { name: /Invoices/ })).toBeVisible();
    await back;
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await saves(page)).toHaveLength(0);
    expect(await stored(page)).toEqual(record);
  });

  test('a double click on Save opens ONE review, which stays open', async ({ page }) => {
    await openRecord(page);
    await notes(page).fill('Twice');
    await saveButton(page).dblclick();
    await expect(reviewDialog(page)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    // NOT asserted here: where the focus is after the second click. It lands on the backdrop of the dialog the
    // first click opened, which leaves the focus on `body` for EVERY modal of the showcase (the Free "Delete"
    // confirmation and the dirty-guard do the same): a Dialog matter, reported as a follow-up in the PR.
    await expect(reviewDialog(page)).toBeVisible();
    expect(await saves(page)).toHaveLength(0);
    // Still fully usable from the keyboard: the trap brings Tab back inside.
    await page.keyboard.press('Tab');
    await expect(reviewDialog(page).locator(':focus')).toHaveCount(1);
  });

  test('Notes of 500 characters on mobile: they wrap inside the dialog, no horizontal overflow', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openRecord(page);
    await notes(page).fill('Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(9).slice(0, 500));
    await saveButton(page).click();
    const dialog = reviewDialog(page);
    await expect(dialog).toBeVisible();
    // No box of the dialog sticks out of its right edge, and no scroll container inside it scrolls sideways
    // (the visually hidden "from"/"to" words, clipped to 1px on purpose, are not content boxes).
    const overflow = await dialog.evaluate((el) => {
      const edge = el.getBoundingClientRect().right;
      const all = [el, ...el.querySelectorAll('*')] as HTMLElement[];
      const shown = all.filter((n) => n.getBoundingClientRect().width > 1);
      return [
        ...shown.filter((n) => n.getBoundingClientRect().right > edge + 0.5).map((n) => `sticks out: ${n.className}`),
        ...shown
          .filter((n) => ['auto', 'scroll'].includes(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1)
          .map((n) => `scrolls sideways: ${n.className}`),
      ];
    });
    expect(overflow).toEqual([]);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    // The page never scrolls sideways either.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
  });

  test('the Free showcase is unchanged: Save saves at once, no review', async ({ page }) => {
    await openRecord(page, FAST, FREE_FIXTURE);
    await notes(page).fill('Free');
    await saveButton(page).click();
    await expect(footer(page)).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await saves(page)).toHaveLength(1);
  });
});
