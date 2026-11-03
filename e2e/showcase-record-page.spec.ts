import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #149: Showcase/Invoices -> RecordPage. The invoice detail page (Object Page) on an in-memory store.
const STORY = 'showcase-invoices--record-page';
const FIXTURE = 'showcase-invoices--manual';

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

const amount = (page: Page): Locator => page.getByRole('textbox', { name: /Amount/ });
const notes = (page: Page): Locator => page.getByRole('textbox', { name: 'Notes' });
const bar = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const dialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });
const storeAmount = (page: Page, id: string): Promise<number | undefined> =>
  page.evaluate(
    (i) =>
      (
        window as unknown as { __ropShowcaseStore?: { snapshot: () => { id: string; amount: number }[] } }
      ).__ropShowcaseStore
        ?.snapshot()
        .find((r) => r.id === i)?.amount,
    id,
  );

async function open(page: Page, args = ''): Promise<void> {
  await gotoStory(page, FIXTURE, args);
  await expect(amount(page)).toBeVisible();
}

async function expectNoItalian(page: Page): Promise<void> {
  const html = await page.evaluate(() => document.body.innerHTML);
  const a11y = JSON.stringify(await page.locator('body').ariaSnapshot());
  for (const word of ITALIAN) {
    expect(html, `DOM contains "${word}"`).not.toContain(word);
    expect(a11y, `a11y tree contains "${word}"`).not.toContain(word);
  }
}

test.describe('Showcase/Invoices: RecordPage', () => {
  test('the play function passes', async ({ page }) => {
    await expectPlayToPass(page, STORY);
  });

  test('loading: no editable field and an announced status, then the hydrated editor with the footer hidden', async ({
    page,
  }) => {
    await gotoStory(page, FIXTURE, 'loadDelayMs:1500');
    await expect(page.getByRole('status').filter({ hasText: 'Loading invoice' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expectNoItalian(page);
    await expect(amount(page)).toBeVisible();
    await expect(bar(page)).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
    for (const s of ['General', 'Amount', 'Notes']) {
      await expect(page.getByRole('navigation', { name: 'Sections' }).getByText(s, { exact: true })).toBeVisible();
    }
    // Header: number as title, supplier as subtitle, status badge. The number field is read-only.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^FT-2026-\d{4}$/);
    await expect(page.getByRole('textbox', { name: 'Invoice number' })).toHaveAttribute('readonly', '');
  });

  test('dirty is computed against the baseline: edit shows the footer, restoring the value hides it; Discard restores all', async ({
    page,
  }) => {
    await open(page);
    const original = await amount(page).inputValue();
    await amount(page).pressSequentially('5');
    await expect(bar(page)).toBeVisible();
    await page.keyboard.press('Backspace');
    await expect(amount(page)).toHaveValue(original);
    await expect(bar(page)).toBeHidden();
    await amount(page).pressSequentially('5');
    await notes(page).fill('something');
    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(amount(page)).toHaveValue(original);
    await expect(notes(page)).toHaveValue('');
    await expect(bar(page)).toBeHidden();
  });

  test('empty notes are not dirty on open; typing then deleting returns to clean', async ({ page }) => {
    await open(page);
    await expect(notes(page)).toHaveValue('');
    await expect(bar(page)).toBeHidden();
    await notes(page).fill('x');
    await expect(bar(page)).toBeVisible();
    await notes(page).fill('');
    await expect(bar(page)).toBeHidden();
  });

  test('the content above the save bar does not jump when the bar appears', async ({ page }) => {
    await open(page);
    const before = await amount(page).boundingBox();
    await amount(page).pressSequentially('1');
    await expect(bar(page)).toBeVisible();
    const after = await amount(page).boundingBox();
    expect(after?.y).toBe(before?.y);
    expect(after?.height).toBe(before?.height);
  });

  test('save success: the form shows the server-normalized value, is clean, and the store has it', async ({ page }) => {
    await open(page, 'saveDelayMs:600');
    await amount(page).fill('1234.5678');
    const save = bar(page).getByRole('button', { name: 'Save' });
    await save.click();
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(bar(page)).toBeHidden();
    await expect(amount(page)).toHaveValue('1234.57');
    expect(await storeAmount(page, 'inv-2')).toBe(1234.57);
  });

  test('validation: amount 0 blocks the save, the message is on the field, the summary is English, the store is untouched', async ({
    page,
  }) => {
    await open(page);
    const before = await storeAmount(page, 'inv-2');
    await amount(page).fill('0');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Amount must be greater than 0.')).toBeVisible();
    await expect(amount(page)).toHaveAccessibleDescription('Amount must be greater than 0.');
    await expect(amount(page)).toBeFocused();
    await expect(bar(page).getByRole('status')).toHaveText(/Error: 1 invalid field/);
    await expect(bar(page)).toBeVisible();
    expect(await storeAmount(page, 'inv-2')).toBe(before);
  });

  test('save error: message in the footer, the form stays dirty with the typed values, the store is unchanged', async ({
    page,
  }) => {
    await open(page, 'saveOutcome:error');
    const before = await storeAmount(page, 'inv-2');
    await amount(page).fill('77.7');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page).getByRole('status')).toContainText('Could not save the invoice');
    await expect(bar(page)).toBeVisible();
    await expect(amount(page)).toHaveValue('77.7');
    expect(await storeAmount(page, 'inv-2')).toBe(before);
  });

  test('Discard while a save is in flight: the reset wins', async ({ page }) => {
    await open(page, 'saveDelayMs:1500');
    const original = await amount(page).inputValue();
    await amount(page).fill('88.8');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(amount(page)).toHaveValue(original);
    await expect(bar(page)).toBeHidden();
    // The save finishes later: it must not overwrite the baseline the reset restored.
    await expect.poll(() => storeAmount(page, 'inv-2')).toBe(88.8);
    await expect(amount(page)).toHaveValue(original);
    await expect(bar(page)).toBeHidden();
  });

  test('#166: Save, Discard, then Back while the save is in flight: the dialog still asks, with truthful labels', async ({ page }) => {
    await open(page, 'saveDelayMs:1500');
    await amount(page).fill('88.8');
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
    await amount(page).fill('50.123');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await notes(page).fill('typed during the save');
    await expect.poll(() => storeAmount(page, 'inv-2')).toBe(50.12);
    // The form was edited meanwhile: it keeps the typed values (amount included) and stays dirty
    // against the new baseline (the normalized record); it is not overwritten by the server value.
    await expect(amount(page)).toHaveValue('50.123');
    await expect(notes(page)).toHaveValue('typed during the save');
    await expect(bar(page)).toBeVisible();
  });

  test('Back to list: clean calls onBack at once, dirty asks (English), Keep editing stays, Discard changes leaves', async ({
    page,
  }) => {
    await open(page);
    const original = await amount(page).inputValue();
    await amount(page).fill('4321.5');
    await expect(bar(page)).toBeVisible();
    await back(page).click();
    await expect(dialog(page)).toBeVisible();
    await expectNoItalian(page);
    await expect(dialog(page).getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(amount(page)).toHaveValue('4321.5');
    expect(original).not.toBe('4321.5');
    await back(page).click();
    await dialog(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(dialog(page)).toBeHidden();
  });

  test('the dirty editor with the footer shows no Italian default', async ({ page }) => {
    await open(page);
    await amount(page).pressSequentially('1');
    await expect(bar(page)).toBeVisible();
    await expectNoItalian(page);
  });

  test('an unknown record: error strip with Back to list, no Retry, no field', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'recordId:inv-does-not-exist');
    await expect(page.getByRole('alert')).toContainText('Invoice not found');
    await expect(back(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expectNoItalian(page);
  });

  test('a network error offers Retry, which then succeeds', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'loadOutcome:error-once');
    await expect(page.getByRole('alert')).toContainText('Could not load the invoice');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(amount(page)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('Retry: the focus lands on the title, not on the body', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'loadOutcome:error-once');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(amount(page)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('the header shows the saved record: an unsaved status change does not touch the badge', async ({ page }) => {
    await open(page);
    const header = page.getByRole('heading', { level: 1 }).locator('xpath=../..');
    const before = await header.innerText();
    const current = await page.getByRole('combobox', { name: 'Status' }).innerText();
    const other = current.trim() === 'Approved' ? 'Rejected' : 'Approved';
    await page.getByRole('combobox', { name: 'Status' }).click();
    await page.getByRole('option', { name: other }).click();
    await expect(bar(page)).toBeVisible();
    expect(await header.innerText()).toBe(before);
  });

  test('switching recordId from the Controls: the store survives, the new editor is hydrated and clean', async ({
    page,
  }) => {
    await open(page);
    await amount(page).fill('42');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    await expect(amount(page)).toHaveValue('42.00');
    await amount(page).fill('7'); // an unsaved edit that must NOT follow us to the next record
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
    await setRecord('inv-3');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('FT-2026-0003');
    await expect(bar(page)).toBeHidden();
    await expect(amount(page)).not.toHaveValue('7');
    await setRecord('inv-2');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('FT-2026-0002');
    await expect(amount(page)).toHaveValue('42.00');
    await expect(bar(page)).toBeHidden();
  });

  test('no axe violations: editor and open dialog', async ({ page }) => {
    await open(page);
    await expectNoA11yViolations(page);
    await amount(page).pressSequentially('1');
    await back(page).click();
    await expect(dialog(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('prefers-reduced-motion: the play still passes', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectPlayToPass(page, STORY);
  });
});
