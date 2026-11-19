import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #525 (migration of e2e/showcase-record-page.spec.ts from Showcase/Invoices to the sales orders): the order page (Object
// Page) on an in-memory store. The invoice's "Amount" is the quantity of the first line (it drives the order total), its
// "Notes" are the order's "Notes" (so-15 has a note: the empty text field is "Delivery instructions"), its "Approved"
// status is "Shipped". Default order of the story: so-15, confirmed, two lines.
const STORY = 'showcase-record-editing--sales-order-record-page';
const FIXTURE = 'showcase-record-editing--sales-order-record-page-manual';
const ORDER = 'so-15';

const ITALIAN = [
  'Sezioni',
  'Chiudi',
  'Azioni di salvataggio',
  'Errore',
  'Informazione',
  'Operazione riuscita',
  'Modifiche non salvate',
  'campi non validi',
  'Nessuna opzione',
];

const quantity = (page: Page): Locator => page.getByRole('textbox', { name: 'Line 1 quantity' });
const delivery = (page: Page): Locator => page.getByRole('textbox', { name: 'Delivery instructions' });
const bar = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const dialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
const storeQuantity = (page: Page, id: string): Promise<number | undefined> =>
  page.evaluate(
    (i) =>
      (
        window as unknown as { __ropShowcaseStore?: { snapshot: () => { id: string; lines: { quantity: number }[] }[] } }
      ).__ropShowcaseStore
        ?.snapshot()
        .find((r) => r.id === i)?.lines[0]?.quantity,
    id,
  );

async function open(page: Page, args = ''): Promise<void> {
  await gotoStory(page, FIXTURE, args);
  await expect(quantity(page)).toBeVisible();
}

async function expectNoItalian(page: Page): Promise<void> {
  const html = await page.evaluate(() => document.body.innerHTML);
  const a11y = JSON.stringify(await page.locator('body').ariaSnapshot());
  for (const word of ITALIAN) {
    expect(html, `DOM contains "${word}"`).not.toContain(word);
    expect(a11y, `a11y tree contains "${word}"`).not.toContain(word);
  }
}

test.describe('Showcase/Record editing, orders: RecordPage (migrated from Showcase/Invoices)', () => {
  test('loading: no editable field and an announced status, then the hydrated editor with the footer hidden', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'loadDelayMs:1500');
    await expect(page.getByRole('status').filter({ hasText: 'Loading sales order' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expectNoItalian(page);
    await expect(quantity(page)).toBeVisible();
    await expect(bar(page)).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
    for (const s of ['General', 'Lines', 'Delivery', 'Notes']) {
      await expect(page.getByRole('navigation', { name: 'Sections' }).getByText(s, { exact: true })).toBeVisible();
    }
    // Header: number as title, customer and total as subtitle, status badge. The number field is read-only.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^SO-2026-\d{9}$/);
    await expect(page.getByRole('textbox', { name: 'Order number' })).toHaveAttribute('readonly', '');
  });

  test('dirty is computed against the baseline: edit shows the footer, restoring the value hides it; Discard restores all', async ({ page }) => {
    await open(page);
    const original = await quantity(page).inputValue();
    await quantity(page).pressSequentially('5');
    await expect(bar(page)).toBeVisible();
    await page.keyboard.press('Backspace');
    await expect(quantity(page)).toHaveValue(original);
    await expect(bar(page)).toBeHidden();
    await quantity(page).pressSequentially('5');
    await delivery(page).fill('something');
    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(quantity(page)).toHaveValue(original);
    await expect(delivery(page)).toHaveValue('');
    await expect(bar(page)).toBeHidden();
  });

  test('empty delivery instructions are not dirty on open; typing then deleting returns to clean', async ({ page }) => {
    await open(page);
    await expect(delivery(page)).toHaveValue('');
    await expect(bar(page)).toBeHidden();
    await delivery(page).fill('x');
    await expect(bar(page)).toBeVisible();
    await delivery(page).fill('');
    await expect(bar(page)).toBeHidden();
  });

  test('the content above the save bar does not jump when the bar appears', async ({ page }) => {
    await open(page);
    await quantity(page).scrollIntoViewIfNeeded(); // the field is in the Lines section, below the fold
    const before = await quantity(page).boundingBox();
    await quantity(page).pressSequentially('1');
    await expect(bar(page)).toBeVisible();
    const after = await quantity(page).boundingBox();
    expect(after?.y).toBe(before?.y);
    expect(after?.height).toBe(before?.height);
  });

  test('save success: the form is clean, and the store has the quantity and the total the server derived', async ({ page }) => {
    await open(page, 'saveDelayMs:600');
    await quantity(page).fill('37');
    const save = bar(page).getByRole('button', { name: 'Save' });
    await save.click();
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(bar(page)).toBeHidden();
    await expect(quantity(page)).toHaveValue('37');
    expect(await storeQuantity(page, ORDER)).toBe(37);
  });

  test('validation: quantity 0 blocks the save, the message is on the field, the summary is English, the store is untouched', async ({ page }) => {
    await open(page);
    const before = await storeQuantity(page, ORDER);
    await quantity(page).fill('0');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/^Quantity must be a whole number from 1 to 99,999/)).toBeVisible();
    await expect(quantity(page)).toHaveAccessibleDescription(/^Quantity must be a whole number from 1 to 99,999/);
    await expect(quantity(page)).toBeFocused();
    await expect(bar(page).getByRole('status')).toHaveText(/Error: 1 invalid field/);
    await expect(bar(page)).toBeVisible();
    expect(await storeQuantity(page, ORDER)).toBe(before);
  });

  test('save error: message in the footer, the form stays dirty with the typed values, the store is unchanged', async ({ page }) => {
    await open(page, 'saveOutcome:error');
    const before = await storeQuantity(page, ORDER);
    await quantity(page).fill('77');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page).getByRole('status')).toContainText('Could not save the sales order');
    await expect(bar(page)).toBeVisible();
    await expect(quantity(page)).toHaveValue('77');
    expect(await storeQuantity(page, ORDER)).toBe(before);
  });

  test('Discard while a save is in flight: the reset wins', async ({ page }) => {
    await open(page, 'saveDelayMs:1500');
    const original = await quantity(page).inputValue();
    await quantity(page).fill('88');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(quantity(page)).toHaveValue(original);
    await expect(bar(page)).toBeHidden();
    // The save finishes later: it must not overwrite the baseline the reset restored.
    await expect.poll(() => storeQuantity(page, ORDER)).toBe(88);
    await expect(quantity(page)).toHaveValue(original);
    await expect(bar(page)).toBeHidden();
  });

  test('#166: Save, Discard, then Back while the save is in flight: the dialog still asks, with truthful labels', async ({ page }) => {
    await open(page, 'saveDelayMs:1500');
    await quantity(page).fill('88');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(bar(page)).toBeHidden();
    await back(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText('A save is still in progress');
    await expect(dialog(page).getByRole('button', { name: 'Discard changes' })).toHaveCount(0);
    await expect(dialog(page).getByRole('button', { name: 'Leave anyway' })).toBeVisible();
  });

  test('an edit made while the save is in flight stays dirty', async ({ page }) => {
    await open(page, 'saveDelayMs:800');
    await quantity(page).fill('50');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await delivery(page).fill('typed during the save');
    await expect.poll(() => storeQuantity(page, ORDER)).toBe(50);
    // #545: decided field by field. The delivery instructions, edited meanwhile, keep the typed value and stay dirty
    // against the new baseline; the quantity, not touched during the save, shows the server value.
    await expect(quantity(page)).toHaveValue('50');
    await expect(delivery(page)).toHaveValue('typed during the save');
    await expect(bar(page)).toBeVisible();
  });

  test('#545: only the field edited during the save is dirty: clearing it back hides the save bar', async ({ page }) => {
    await open(page, 'saveDelayMs:800');
    const originalDelivery = await delivery(page).inputValue();
    await quantity(page).fill('50');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await delivery(page).fill('typed during the save');
    await expect.poll(() => storeQuantity(page, ORDER)).toBe(50);
    await expect(quantity(page)).toHaveValue('50');
    await expect(bar(page)).toBeVisible();
    // The quantity took the stored value: once the delivery instructions are back to the stored ones, nothing is dirty.
    await delivery(page).fill(originalDelivery);
    await expect(bar(page)).toBeHidden();
    await expect(quantity(page)).toHaveValue('50');
  });

  test('#545: Discard while a save is in flight with edits made meanwhile: the reset wins over the merge', async ({ page }) => {
    await open(page, 'saveDelayMs:1500');
    const originalQuantity = await quantity(page).inputValue();
    const originalDelivery = await delivery(page).inputValue();
    await quantity(page).fill('50');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await delivery(page).fill('typed during the save');
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(quantity(page)).toHaveValue(originalQuantity);
    await expect(delivery(page)).toHaveValue(originalDelivery);
    // The save finishes later: neither the stored quantity nor the typed text come back.
    await expect.poll(() => storeQuantity(page, ORDER)).toBe(50);
    await expect(quantity(page)).toHaveValue(originalQuantity);
    await expect(delivery(page)).toHaveValue(originalDelivery);
    await expect(bar(page)).toBeHidden();
  });

  test('Back to list: dirty asks (English), Keep editing stays, Discard changes leaves', async ({ page }) => {
    await open(page);
    const original = await quantity(page).inputValue();
    await quantity(page).fill('43');
    await expect(bar(page)).toBeVisible();
    await back(page).click();
    await expect(dialog(page)).toBeVisible();
    await expectNoItalian(page);
    await expect(dialog(page).getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(quantity(page)).toHaveValue('43');
    expect(original).not.toBe('43');
    await back(page).click();
    await dialog(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(dialog(page)).toBeHidden();
  });

  test('the dirty editor with the footer shows no Italian default', async ({ page }) => {
    await open(page);
    await quantity(page).pressSequentially('1');
    await expect(bar(page)).toBeVisible();
    await expectNoItalian(page);
  });

  test('an unknown record: error strip with Back to list, no Retry, no field', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'recordId:so-does-not-exist');
    await expect(page.getByRole('alert')).toContainText('Sales order not found');
    await expect(back(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expectNoItalian(page);
  });

  test('a network error offers Retry, which then succeeds', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'loadOutcome:error-once');
    await expect(page.getByRole('alert')).toContainText('Could not load the sales order');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(quantity(page)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('Retry: the focus lands on the title, not on the body', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'loadOutcome:error-once');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(quantity(page)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('the header shows the saved record: an unsaved status change does not touch the badge', async ({ page }) => {
    await open(page);
    const header = page.getByRole('heading', { level: 1 }).locator('xpath=../..');
    const before = await header.innerText();
    const current = await page.getByRole('combobox', { name: 'Status' }).innerText();
    const other = current.trim() === 'Shipped' ? 'Invoiced' : 'Shipped';
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: other }).click();
    await expect(bar(page)).toBeVisible();
    expect(await header.innerText()).toBe(before);
  });

  test('switching recordId from the Controls: the store survives, the new editor is hydrated and clean', async ({ page }) => {
    await open(page);
    const first = (await page.getByRole('heading', { level: 1 }).textContent()) ?? '';
    await quantity(page).fill('42');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    await expect(quantity(page)).toHaveValue('42');
    await quantity(page).fill('7'); // an unsaved edit that must NOT follow us to the next record
    await expect(bar(page)).toBeVisible();
    const setRecord = (recordId: string) =>
      page.evaluate(
        ([storyId, id]) =>
          (
            window as unknown as {
              __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void };
            }
          ).__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', { storyId, updatedArgs: { recordId: id } }),
        [FIXTURE, recordId] as const,
      );
    await setRecord('so-1');
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(first);
    await expect(bar(page)).toBeHidden();
    await expect(quantity(page)).not.toHaveValue('7');
    await setRecord(ORDER);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(first);
    await expect(quantity(page)).toHaveValue('42');
    await expect(bar(page)).toBeHidden();
  });

  test('no axe violations: editor and open dialog', async ({ page }) => {
    await open(page);
    await expectNoA11yViolations(page);
    await quantity(page).pressSequentially('1');
    await back(page).click();
    await expect(dialog(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('prefers-reduced-motion: the play still passes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectPlayToPass(page, STORY);
  });
});
