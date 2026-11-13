import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';

// #384: Pro/Showcase/Invoices with Change Summary, a server update while an invoice is open. The store's
// story-only `updateFromServer` changes the stored record (as another user would) and the editor merges it
// with `useFormRebase`; `RebaseNotice` shows the result under the header.
const FIXTURE = 'pro-showcase-invoices-with-change-summary--manual';
const PLAY = 'pro-showcase-invoices-with-change-summary--server-update';
const FREE_FIXTURE = 'showcase-invoices--crud-manual';
const FAST = 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:0';
const RECORD = 'FT-2026-0001';
const RECORD_WITH_LINES = 'FT-2026-0003';

interface Line {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}
interface Stored {
  id: string;
  number: string;
  supplier: string;
  status: 'pending' | 'approved' | 'rejected';
  amount: number;
  date: string;
  dueDate: string;
  notes: string;
  lineItems: Line[];
}
type Store = {
  snapshot: () => Stored[];
  updateFromServer: (id: string, change: (r: Stored) => Stored, delayMs?: number) => Promise<Stored>;
  removeFromServer: (id: string, delayMs?: number) => Promise<void>;
};
type ShowcaseWindow = { __ropShowcaseStore?: Store };

const url = (id: string, args: string): string => `/iframe.html?id=${id}&viewMode=story&args=${encodeURIComponent(args)}`;
const STATUS_LABEL = { pending: 'Open', approved: 'Approved', rejected: 'Rejected' } as const;

const notice = (page: Page): Locator => page.locator('.rop-pro-rebase-notice');
const conflicts = (page: Page): Locator => page.getByRole('list', { name: 'Conflicts' }).getByRole('listitem');
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const saveButton = (page: Page): Locator => footer(page).getByRole('button', { name: 'Save' });
const notes = (page: Page): Locator => page.getByRole('textbox', { name: 'Notes' });
const dueDate = (page: Page): Locator => page.getByLabel('Due date', { exact: true });
const status = (page: Page): Locator => page.getByRole('combobox', { name: 'Status' });
const reviewDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Review changes' });

async function openRecord(page: Page, record = RECORD, args = FAST): Promise<Stored> {
  await page.goto(url(FIXTURE, args));
  await page.getByRole('link', { name: record }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(record) })).toBeVisible();
  return (await stored(page, record))!;
}

const stored = (page: Page, record = RECORD): Promise<Stored | undefined> =>
  page.evaluate((n) => (window as unknown as ShowcaseWindow).__ropShowcaseStore?.snapshot().find((r) => r.number === n), record);

/** Another user changes fields of the stored invoice (a plain patch), after `delayMs`. */
async function serverPatch(page: Page, id: string, patch: Partial<Stored>, delayMs = 0): Promise<void> {
  await page.evaluate(
    ({ id, patch, delayMs }) => void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.updateFromServer(id, (r) => ({ ...r, ...patch }), delayMs),
    { id, patch, delayMs },
  );
}

const NEXT_STATUS = { pending: 'approved', approved: 'rejected', rejected: 'pending' } as const;
const laterBy = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Text of an element as read by assistive technology (`aria-hidden` left out), white space collapsed. */
const readText = (locator: Locator): Promise<string> =>
  locator.evaluate((el) => {
    const copy = el.cloneNode(true) as Element;
    for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
  });

const top = (locator: Locator): Promise<number> => locator.evaluate((el) => el.getBoundingClientRect().top);

test.describe('Pro/Showcase/Invoices with Change Summary: server updates (#384)', () => {
  test('the play function passes (edit, Simulate server update, a conflict kept, Save)', async ({ page }) => {
    await expectPlayToPass(page, PLAY);
  });

  test('editor without edits: the fields take the update, the form stays clean (no footer), "2 fields were updated", no conflict', async ({ page }) => {
    const record = await openRecord(page);
    const next = NEXT_STATUS[record.status];
    await serverPatch(page, record.id, { status: next, dueDate: laterBy(record.dueDate, 7) });
    await expect(notice(page)).toBeVisible();
    await expect(status(page)).toHaveText(STATUS_LABEL[next]);
    await expect(dueDate(page)).toHaveValue(laterBy(record.dueDate, 7));
    await expect(footer(page)).toBeHidden();
    expect(await readText(notice(page))).toBe('Information: This invoice was updated while you were editing.2 fields were updated.');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
  });

  test('Notes edited, the server changes Status: Status updated, Notes mine, the form dirty, no conflict', async ({ page }) => {
    const record = await openRecord(page);
    await notes(page).fill('Checked by finance.');
    await serverPatch(page, record.id, { status: NEXT_STATUS[record.status] });
    await expect(status(page)).toHaveText(STATUS_LABEL[NEXT_STATUS[record.status]]);
    await expect(notes(page)).toHaveValue('Checked by finance.');
    await expect(footer(page)).toBeVisible();
    expect(await readText(notice(page))).toBe('Information: This invoice was updated while you were editing.1 field was updated.');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
  });

  test('Due date edited, the server changes it to another date: mine shown, a conflict with both dates localized, the Field explained; "Use server value" makes the form clean again', async ({ page }) => {
    const record = await openRecord(page);
    await dueDate(page).fill('2026-03-05');
    await serverPatch(page, record.id, { dueDate: '2026-03-12' });
    await expect(conflicts(page)).toHaveCount(1);
    await expect(dueDate(page)).toHaveValue('2026-03-05');
    expect(await readText(conflicts(page).first())).toBe('Due date Yours: Mar 5, 2026 Server: Mar 12, 2026 Use server value Keep mine');
    await expect(conflicts(page).first()).not.toContainText('2026-03');
    // `aria-describedby` to a real element; the accessible name unchanged.
    await expect(dueDate(page)).toHaveAccessibleDescription('Changed on the server too.');
    await expect(dueDate(page)).toHaveAccessibleName('Due date');
    const describedBy = (await dueDate(page).getAttribute('aria-describedby'))!.split(' ');
    const texts = await Promise.all(describedBy.map((id) => page.locator(`[id="${id}"]`).textContent()));
    expect(texts).toContain('Changed on the server too.');
    await expect(notice(page)).toHaveText(/1 field you edited was also changed on the server\./);

    await page.getByRole('button', { name: 'Use server value for Due date' }).click();
    await expect(dueDate(page)).toHaveValue('2026-03-12');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(dueDate(page)).not.toHaveAccessibleDescription('Changed on the server too.');
    // It was the only edit: clean, the footer hidden; the notice (nothing left to say) gone.
    await expect(footer(page)).toBeHidden();
    await expect(notice(page)).toHaveCount(0);
    // The button is gone: the focus is back where it came from (the field), never on <body>.
    await expect(dueDate(page)).toBeFocused();
    expect(record.dueDate).not.toBe('2026-03-12');
  });

  test('"Keep mine" closes the conflict and leaves my value; the form stays dirty', async ({ page }) => {
    const record = await openRecord(page);
    await dueDate(page).fill('2026-03-05');
    await serverPatch(page, record.id, { dueDate: '2026-03-12' });
    await page.getByRole('button', { name: 'Keep mine for Due date' }).click();
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(dueDate(page)).toHaveValue('2026-03-05');
    await expect(footer(page)).toBeVisible();
    await expect(dueDate(page)).toBeFocused();
  });

  test('"Keep mine" clicked with the mouse, no focus before: the focus goes to the field of the conflict, never <body>', async ({ page }) => {
    const record = await openRecord(page);
    await dueDate(page).fill('2026-03-05');
    // Nothing focused (a click on an empty spot of the page): the notice has no "where it came from".
    await dueDate(page).evaluate((el) => (el as HTMLElement).blur());
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await serverPatch(page, record.id, { dueDate: '2026-03-12' });
    await page.getByRole('button', { name: 'Keep mine for Due date' }).click();
    await expect(notice(page)).toHaveCount(0);
    await expect(dueDate(page)).toBeFocused();
  });

  test('typing while the update lands: the focus stays in the field and no keystroke is lost', async ({ page }) => {
    const record = await openRecord(page);
    const text = 'Checked by the finance team on Monday morning';
    await notes(page).fill('');
    await notes(page).click();
    // The update lands about halfway through the typing (one key every 25 ms).
    await serverPatch(page, record.id, { status: NEXT_STATUS[record.status], dueDate: laterBy(record.dueDate, 7) }, 500);
    await notes(page).pressSequentially(text, { delay: 25 });
    await expect(notice(page)).toBeVisible();
    await expect(status(page)).toHaveText(STATUS_LABEL[NEXT_STATUS[record.status]]);
    await expect(notes(page)).toHaveValue(text);
    await expect(notes(page)).toBeFocused();
  });

  test('Save with an open conflict: the review names the overwritten server change; "Save changes" saves mine, the notice goes away', async ({ page }) => {
    const record = await openRecord(page);
    await dueDate(page).fill('2026-03-05');
    await serverPatch(page, record.id, { dueDate: '2026-03-12' });
    await expect(conflicts(page)).toHaveCount(1);
    await saveButton(page).click();
    const dialog = reviewDialog(page);
    await expect(dialog.getByText('You are overwriting a server change')).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Server changes you overwrite' }).getByRole('listitem')).toHaveText(['Due date']);
    await expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    await expect(notice(page)).toHaveCount(0);
    expect((await stored(page))?.dueDate).toBe('2026-03-05');
  });

  test('an update during a save: "Applying server update after saving…", then applied on top of the saved values, nothing lost', async ({ page }) => {
    const record = await openRecord(page, RECORD, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:2000;serverUpdateDelayMs:0');
    await notes(page).fill('Saved note');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toContainText('Saving…');
    const next = NEXT_STATUS[record.status];
    await serverPatch(page, record.id, { status: next });
    await expect(notice(page)).toContainText('Applying server update after saving…');
    await expect(page.getByRole('status').filter({ hasText: 'Applying server update after saving…' })).toHaveCount(1);
    // Not applied while saving.
    await expect(status(page)).toHaveText(STATUS_LABEL[record.status]);
    // The save settles: the update is applied against the saved values.
    await expect(footer(page)).toBeHidden({ timeout: 10_000 });
    await expect(status(page)).toHaveText(STATUS_LABEL[next]);
    await expect(notes(page)).toHaveValue('Saved note');
    await expect(notice(page)).not.toContainText('Applying');
    expect(await readText(notice(page))).toBe('Information: This invoice was updated while you were editing.1 field was updated.');
    expect(await stored(page)).toMatchObject({ notes: 'Saved note', status: next });
  });

  test('an update during a save that changes nothing once applied: the end is announced, never stuck on "Applying…"', async ({ page }) => {
    const record = await openRecord(page, RECORD, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500;serverUpdateDelayMs:0');
    await notes(page).fill('Saved note');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toContainText('Saving…');
    // The other user writes the very value being saved.
    await serverPatch(page, record.id, { notes: 'Saved note' });
    const region = page.locator('.rop-pro-rebase-notice__live');
    await expect(region).toHaveText('This invoice was updated while you were editing. Applying server update after saving…');
    await expect(footer(page)).toBeHidden({ timeout: 10_000 });
    await expect(region).toHaveText('This invoice was updated while you were editing. Server update applied after saving: no field changed.');
    await expect(notice(page)).toHaveCount(0);
    await expect(notes(page)).toHaveValue('Saved note');
  });

  test('line items: the server changes line 1 quantity, I change line 2: both kept, no conflict', async ({ page }) => {
    const record = await openRecord(page, RECORD_WITH_LINES);
    const line2 = page.getByRole('textbox', { name: 'Line 2 quantity' });
    await line2.fill('9');
    await page.evaluate(
      (id) => void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.updateFromServer(id, (r) => ({ ...r, lineItems: r.lineItems.map((l, i) => (i === 0 ? { ...l, quantity: 7 } : l)) })),
      record.id,
    );
    await expect(page.getByRole('textbox', { name: 'Line 1 quantity' })).toHaveValue('7');
    await expect(line2).toHaveValue('9');
    await expect(notice(page)).toHaveText(/1 field was updated\./);
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(footer(page)).toBeVisible();
  });

  test('line items: the server removes a line I edited: a conflict on the row, the row kept with my value', async ({ page }) => {
    const record = await openRecord(page, RECORD_WITH_LINES);
    await page.getByRole('textbox', { name: 'Line 1 quantity' }).fill('8');
    await page.evaluate(
      (id) => void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.updateFromServer(id, (r) => ({ ...r, lineItems: r.lineItems.slice(1) })),
      record.id,
    );
    await expect(conflicts(page)).toHaveCount(1);
    const first = record.lineItems[0]!;
    expect(await readText(conflicts(page).first())).toMatch(
      new RegExp(`^Line items > Item 1 \\(${first.description}\\) Yours: ${first.description}, 8 × .+ Server: Removed Use server value Keep mine$`),
    );
    await expect(page.getByRole('textbox', { name: 'Line 1 quantity' })).toHaveValue('8');
    await expect(page.getByRole('textbox', { name: 'Line 1 quantity' })).toHaveAccessibleDescription('Removed on the server.');
    await page.getByRole('button', { name: /^Use server value for Line items > Item 1/ }).click();
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Line 3 quantity' })).toHaveCount(0);
  });

  /** The server removes the line at `index` of the stored invoice (another user's edit). */
  const serverRemovesLine = (page: Page, id: string, index: number) =>
    page.evaluate(
      ({ id, index }) =>
        void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.updateFromServer(id, (r) => ({ ...r, lineItems: r.lineItems.filter((_, i) => i !== index) })),
      { id, index },
    );

  // #470: after "Use server value" on a line the server removed, that line is gone and the conflict's position names
  // the line that took its place: the focus goes there (next line, else previous one, else "Add line"), never <body>.
  test('"Use server value" on line 1, which the server removed: the focus goes to the description of the line that took its place', async ({ page }) => {
    const record = await openRecord(page, RECORD_WITH_LINES);
    await page.getByRole('textbox', { name: 'Line 1 quantity' }).fill('8');
    await serverRemovesLine(page, record.id, 0);
    await expect(conflicts(page)).toHaveCount(1);
    await page.getByRole('button', { name: /^Use server value for Line items > Item 1 / }).click();
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    const heir = page.getByRole('textbox', { name: 'Line 1 description' });
    await expect(heir).toHaveValue(record.lineItems[1]!.description);
    await expect(heir).toBeFocused();
  });

  test('"Use server value" with the keyboard on the LAST line, which the server removed: the focus goes to the description of the previous line', async ({ page }) => {
    const record = await openRecord(page, RECORD_WITH_LINES);
    await page.getByRole('textbox', { name: 'Line 3 quantity' }).fill('8');
    await serverRemovesLine(page, record.id, 2);
    await expect(conflicts(page)).toHaveCount(1);
    await page.getByRole('button', { name: /^Use server value for Line items > Item 3 / }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Line 3 description' })).toHaveCount(0);
    const previous = page.getByRole('textbox', { name: 'Line 2 description' });
    await expect(previous).toHaveValue(record.lineItems[1]!.description);
    await expect(previous).toBeFocused();
  });

  test('"Use server value" on the ONLY line, which the server removed: the focus goes to "Add line"', async ({ page }) => {
    const record = await openRecord(page);
    expect(record.lineItems).toHaveLength(1);
    await page.getByRole('textbox', { name: 'Line 1 quantity' }).fill('8');
    await serverRemovesLine(page, record.id, 0);
    await expect(conflicts(page)).toHaveCount(1);
    await page.getByRole('button', { name: /^Use server value for Line items > Item 1 / }).click();
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(page.getByText('No line items')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add line' })).toBeFocused();
  });

  test('a conflict on a line follows the line by id: moved down, a line removed above it, a line added', async ({ page }) => {
    const record = await openRecord(page, RECORD_WITH_LINES);
    const quantity = (n: number) => page.getByRole('textbox', { name: `Line ${n} quantity` });
    const first = record.lineItems[0]!.description;
    const second = record.lineItems[1]!.description;
    await quantity(1).fill('8');
    await page.evaluate(
      (id) => void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.updateFromServer(id, (r) => ({ ...r, lineItems: r.lineItems.map((l, i) => (i === 0 ? { ...l, quantity: 5 } : l)) })),
      record.id,
    );
    await expect(conflicts(page)).toHaveCount(1);
    expect(await readText(conflicts(page).first())).toMatch(new RegExp(`^Line items > Item 1 \\(${first}\\) > Quantity Yours: 8 Server: 5 `));

    await page.getByRole('button', { name: 'Move line 1 down' }).click();
    expect(await readText(conflicts(page).first())).toMatch(new RegExp(`^Line items > Item 2 \\(${first}\\) > Quantity Yours: 8 Server: 5 `));
    await expect(quantity(2)).toHaveAccessibleDescription('Changed on the server too.');
    await expect(quantity(1)).not.toHaveAccessibleDescription('Changed on the server too.');
    await expect(page.getByRole('button', { name: `Use server value for Line items > Item 2 (${first}) > Quantity` })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(`\\(${second}\\)`) })).toHaveCount(0);

    // The line above it removed, then a new line added at the end: still the same row.
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await page.getByRole('button', { name: 'Add line' }).click();
    expect(await readText(conflicts(page).first())).toMatch(new RegExp(`^Line items > Item 1 \\(${first}\\) > Quantity Yours: 8 `));
    await expect(quantity(1)).toHaveAccessibleDescription('Changed on the server too.');
    // The empty new line would fail the validation of Save: removed again.
    await page.getByRole('button', { name: 'Remove line 3' }).click();

    // The review names the same row.
    await saveButton(page).click();
    await expect(reviewDialog(page).getByRole('list', { name: 'Server changes you overwrite' }).getByRole('listitem')).toHaveText([
      `Line items > Item 1 (${first}) > Quantity`,
    ]);
    await reviewDialog(page).getByRole('button', { name: 'Keep editing' }).click();
    await page.getByRole('button', { name: `Use server value for Line items > Item 1 (${first}) > Quantity` }).click();
    await expect(quantity(1)).toHaveValue('5');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
  });

  test('two updates in a row with different conflicts: only the conflicts of the last one, no ghost', async ({ page }) => {
    const record = await openRecord(page);
    await dueDate(page).fill('2026-03-05');
    await notes(page).fill('Mine');
    await serverPatch(page, record.id, { dueDate: '2026-03-12' });
    await expect(conflicts(page)).toHaveCount(1);
    await serverPatch(page, record.id, { notes: 'Theirs' });
    await expect(conflicts(page).first()).toContainText(/^Notes/);
    await expect(conflicts(page)).toHaveCount(1);
    await expect(dueDate(page)).not.toHaveAccessibleDescription('Changed on the server too.');
    await expect(notes(page)).toHaveAccessibleDescription('Changed on the server too.');
  });

  test('Discard with an open conflict: back to the server values, the notice closed', async ({ page }) => {
    const record = await openRecord(page);
    await dueDate(page).fill('2026-03-05');
    await serverPatch(page, record.id, { dueDate: '2026-03-12', status: NEXT_STATUS[record.status] });
    await expect(conflicts(page)).toHaveCount(1);
    await footer(page).getByRole('button', { name: 'Discard' }).click();
    await expect(dueDate(page)).toHaveValue('2026-03-12');
    await expect(status(page)).toHaveText(STATUS_LABEL[NEXT_STATUS[record.status]]);
    await expect(notice(page)).toHaveCount(0);
    await expect(footer(page)).toBeHidden();
  });

  test('an update under the open review: the review follows the new baseline', async ({ page }) => {
    const record = await openRecord(page);
    await notes(page).fill('Mine');
    await status(page).click();
    await page.getByRole('option', { name: STATUS_LABEL[NEXT_STATUS[record.status]] }).click();
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('2 changes will be saved.');
    // The server makes the same status change: only the notes are left to save.
    await serverPatch(page, record.id, { status: NEXT_STATUS[record.status] });
    await expect(reviewDialog(page)).toHaveAccessibleDescription('1 change will be saved.');
    await expect(reviewDialog(page).getByRole('list', { name: 'Changes to save' }).getByRole('listitem')).toHaveCount(1);
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(footer(page)).toBeHidden();
    expect(await stored(page)).toMatchObject({ notes: 'Mine', status: NEXT_STATUS[record.status] });
  });

  test('the invoice deleted on the server: an error message, no merge', async ({ page }) => {
    const record = await openRecord(page);
    await notes(page).fill('Mine');
    await page.evaluate((id) => void (window as unknown as ShowcaseWindow).__ropShowcaseStore!.removeFromServer(id), record.id);
    await expect(page.getByRole('alert').filter({ hasText: 'This invoice was deleted on the server' })).toBeVisible();
    await expect(notes(page)).toHaveValue('Mine');
    await expect(notice(page)).toHaveCount(0);
  });

  test('"Simulate server update" waits serverUpdateDelayMs, then changes Status and Due date', async ({ page }) => {
    const record = await openRecord(page, RECORD, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:600');
    await page.getByRole('button', { name: 'Simulate server update' }).click();
    await page.waitForTimeout(300);
    await expect(notice(page)).toHaveCount(0);
    await expect(dueDate(page)).toHaveValue(laterBy(record.dueDate, 7));
    await expect(status(page)).toHaveText(STATUS_LABEL[NEXT_STATUS[record.status]]);
    await expect(notice(page)).toBeVisible();
  });

  test('the live region exists before the update and announces it once', async ({ page }) => {
    const record = await openRecord(page);
    const region = page.locator('.rop-pro-rebase-notice__live');
    await expect(region).toHaveAttribute('role', 'status');
    await expect(region).toHaveText('');
    await dueDate(page).fill('2026-03-05');
    await serverPatch(page, record.id, { dueDate: '2026-03-12', status: NEXT_STATUS[record.status] });
    await expect(region).toHaveText(
      'This invoice was updated while you were editing. 1 field was updated. 1 field you edited was also changed on the server.',
    );
    // The strip that holds the choices is not a live region (no double announcement).
    await expect(notice(page)).not.toHaveAttribute('role');
    await expect(notice(page)).not.toHaveAttribute('aria-live');
  });

  test('no a11y violations with the notice and its conflicts visible', async ({ page }) => {
    const record = await openRecord(page);
    await dueDate(page).fill('2026-03-05');
    await notes(page).fill('Mine');
    await serverPatch(page, record.id, { dueDate: '2026-03-12', notes: 'Theirs', status: NEXT_STATUS[record.status] });
    await expect(conflicts(page)).toHaveCount(2);
    await expectNoA11yViolations(page);
  });

  test('the Free showcase has no "Simulate server update" and ignores a server change', async ({ page }) => {
    await page.goto(url(FREE_FIXTURE, 'listLoadDelayMs:0;recordLoadDelayMs:0'));
    await page.getByRole('link', { name: RECORD }).click();
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(RECORD) })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simulate server update' })).toHaveCount(0);
    const before = await dueDate(page).inputValue();
    await serverPatch(page, 'inv-1', { dueDate: '2026-03-12' });
    await page.waitForTimeout(200);
    await expect(dueDate(page)).toHaveValue(before);
    await expect(notice(page)).toHaveCount(0);
  });
});

test.describe('Pro showcase: no visible field moves when the notice appears or goes away (#384) @engines', () => {
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

  for (const focus of ['the Due date field', '"Simulate server update" (above the notice)', 'nothing'] as const) {
    for (const scrolled of [false, true]) {
      test(`focus on ${focus}, page ${scrolled ? 'scrolled' : 'at the top'}: the visible fields keep their place, the focus stays`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        const record = await openRecord(page);
        await dueDate(page).fill('2026-03-05');
        if (scrolled) await dueDate(page).evaluate((el) => el.scrollIntoView({ block: 'center' }));
        if (focus === '"Simulate server update" (above the notice)') await page.getByRole('button', { name: 'Simulate server update' }).focus();
        if (focus === 'nothing') await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const focused = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80));
        const before = await spots(page);

        // A conflict on the Due date: the notice appears.
        await serverPatch(page, record.id, { dueDate: '2026-03-12' });
        await expect(conflicts(page)).toHaveCount(1);
        const shown = await spots(page);
        expect(expectStill(before, shown)).toBeGreaterThanOrEqual(3);
        expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))).toBe(focused);

        // The server comes to my date: nothing left to say, the notice goes away.
        await serverPatch(page, record.id, { dueDate: '2026-03-05' });
        await expect(notice(page)).toHaveCount(0);
        expect(expectStill(before, await spots(page))).toBeGreaterThanOrEqual(3);
        expect(await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80))).toBe(focused);
      });
    }
  }

  test('Notes focused while typing: the notice appears, the field does not move', async ({ page }) => {
    const record = await openRecord(page);
    await notes(page).click();
    const before = await top(notes(page));
    await serverPatch(page, record.id, { status: NEXT_STATUS[record.status], dueDate: laterBy(record.dueDate, 7) });
    await expect(notice(page)).toBeVisible();
    expect(Math.abs((await top(notes(page))) - before)).toBeLessThanOrEqual(1);
  });

  test('the notice sits above the page, in view, at the top and scrolled', async ({ page }) => {
    const record = await openRecord(page);
    await dueDate(page).fill('2026-03-05');
    await dueDate(page).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await serverPatch(page, record.id, { dueDate: '2026-03-12' });
    await expect(notice(page)).toBeInViewport();
    const [noticeBox, scrollerBox] = await Promise.all([
      notice(page).boundingBox(),
      page.locator('[data-object-page-scroller]').boundingBox(),
    ]);
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

test.describe('Pro showcase: focus not obscured by the notice (WCAG 2.4.11, #470) @engines', () => {
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 800 }],
    ['phone', { width: 390, height: 500 }],
  ] as const) {
    test(`${name}: "Simulate server update" reached with the keyboard and pressed with Enter: no visible field moves, the focus stays; the next Tab lands on a control in view`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openRecord(page);
      await dueDate(page).fill('2026-03-05');
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
      await openRecord(page);
      await dueDate(page).fill('2026-03-05');
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
      const record = (await stored(page))!;
      const shown = await fieldSpots(page);
      await serverPatch(page, record.id, { dueDate: '2026-03-05' });
      await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
      expect(expectFieldsStill(shown, await fieldSpots(page))).toBeGreaterThanOrEqual(1);
      expect(await focused()).toBe(atShown);
    });
  }

  test('a field being typed in, right under the Anchor Bar: the notice appears, the field is brought back below the bar (it was hidden under it before #470)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const record = await openRecord(page);
    await dueDate(page).fill('2026-03-05');
    // The Due date right under the Anchor Bar: in the strip the notice takes from the top of the scroller.
    await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[data-object-page-scroller]')!;
      const bar = scroller.querySelector('nav')!.getBoundingClientRect();
      const input = scroller.querySelector('[data-rop-name="dueDate"]')!;
      scroller.scrollTop += input.getBoundingClientRect().top - (bar.bottom + 12);
    });
    await dueDate(page).focus();
    expectFocusInView(await focusSpot(page));
    await serverPatch(page, record.id, { dueDate: '2026-03-12' });
    await expect(conflicts(page)).toHaveCount(1);
    await expect(dueDate(page)).toBeFocused();
    expectFocusInView(await focusSpot(page));
  });
});

// The virtual keyboard is simulated by replacing `window.visualViewport`, chromium only like every other keyboard
// test of the repository (e2e/field.spec.ts, e2e/showcase-line-items.spec.ts): desktop Firefox and WebKit have no
// virtual keyboard. The case without a keyboard is tagged on its own and runs in the three engines.
test.describe('Pro showcase at 390x500: the notice leaves the editor room, also with the virtual keyboard (#470)', () => {
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

  const LONG_MINE = 'Checked by the finance team: the transport costs are included, as agreed in the framework contract.';
  const LONG_THEIRS = 'Approved by the purchasing desk after a call with the supplier; the delivery notes are attached.';

  /** Four of my edits: Due date, Amount, the line's description and Notes (two long texts). */
  async function editFour(page: Page): Promise<Stored> {
    const record = await openRecord(page);
    await dueDate(page).fill('2026-03-05');
    await page.getByRole('textbox', { name: 'Amount (EUR)' }).fill('1234.56');
    await page.getByRole('textbox', { name: 'Line 1 description' }).fill(`${LONG_MINE} (line)`);
    await notes(page).fill(LONG_MINE);
    return record;
  }
  /** The server changes the same four fields: four conflicts, the notice far taller than the screen. */
  async function fourConflicts(page: Page, record: Stored): Promise<void> {
    await serverPatch(page, record.id, {
      dueDate: '2026-03-12',
      amount: 999.99,
      notes: LONG_THEIRS,
      lineItems: record.lineItems.map((line, i) => (i === 0 ? { ...line, description: `${LONG_THEIRS} (line)` } : line)),
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
    const record = await editFour(page);
    await blur(page);
    const before = await fieldSpots(page);
    await fourConflicts(page, record);
    expect(await visibleScroller(page)).toBeGreaterThanOrEqual(EDITOR_MIN);
    // At most 40% of the 500px editor; the strip inside is far taller and scrolls in its row.
    expect(await heightOf(noticeRow(page))).toBeLessThanOrEqual(200);
    expect(await noticeRow(page).evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(expectFieldsStill(before, await fieldSpots(page))).toBeGreaterThanOrEqual(1);
  });

  test('keyboard open on Notes, then four long conflicts: the notice keeps 3rem, the scroller 10rem above the keyboard, Notes stays visible and does not move', async ({ page }) => {
    const record = await editFour(page);
    await focusNotesLow(page);
    await setKeyboard(page, KEYBOARD);
    await expect.poll(async () => (await focusSpot(page)).bottom).toBeLessThanOrEqual(500 - KEYBOARD);
    expectFocusInView(await focusSpot(page));
    const before = await fieldSpots(page);
    const notesTop = await top(notes(page));

    await fourConflicts(page, record);
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
    const record = await editFour(page);
    await blur(page);
    await fourConflicts(page, record);
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

  test('the notice row capped then released by the keyboard, then three conflicts closed by the server: no visible field moves (no stale position)', async ({ page }) => {
    const record = await editFour(page);
    await blur(page);
    await fourConflicts(page, record);
    await focusNotesLow(page);
    await setKeyboard(page, KEYBOARD);
    await expect.poll(() => heightOf(noticeRow(page))).toBeLessThanOrEqual(NOTICE_MIN + 1);
    await setKeyboard(page, 0);
    await expect.poll(() => heightOf(noticeRow(page))).toBeGreaterThan(NOTICE_MIN + 1);
    await blur(page);
    const before = await fieldSpots(page);
    const rowBefore = await heightOf(noticeRow(page));
    // A new update: the server changes the Status only. The conflicts of the previous one are gone ("1 field was
    // updated."), the notice is shorter than its cap: it renders, and must scroll by its own change only.
    await serverPatch(page, record.id, { status: NEXT_STATUS[record.status] });
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(notice(page)).toContainText('1 field was updated.');
    expect(await heightOf(noticeRow(page))).toBeLessThan(rowBefore - 1);
    expect(expectFieldsStill(before, await fieldSpots(page))).toBeGreaterThanOrEqual(1);
  });
});
