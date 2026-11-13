import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { gotoStory } from './helpers/story';

// The copy-paste examples of the Forms pages (#442), exercised the way someone who pasted them would.
// Every controlled example is mounted already hydrated: before any gesture it shows its initial value and
// nothing that reads as "modified"; one real gesture then changes the value.

/** No overlay of the example is in the DOM before the first interaction. */
async function expectClosed(page: Page) {
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function expectNotDirty(page: Page) {
  await expect(page.getByText(/modified|unsaved|dirty|changed/i)).toHaveCount(0);
}

test.describe('Forms copy-paste examples', () => {
  test('Calendar: starts on the initial date, a click picks another, the keyboard moves the focus', async ({ page }) => {
    await gotoStory(page, 'forms-calendar--example');
    const initial = page.getByRole('gridcell', { name: 'Tuesday, March 10, 2026' });
    await expect(initial).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('output')).toHaveText('Delivery on 2026-03-10');
    await expectNotDirty(page);
    await page.getByRole('gridcell', { name: 'Friday, March 20, 2026' }).click();
    await expect(page.locator('output')).toHaveText('Delivery on 2026-03-20');
    await expect(page.getByRole('gridcell', { name: 'Friday, March 20, 2026' })).toHaveAttribute('aria-selected', 'true');
    await expect(initial).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator('output')).toHaveText('Delivery on 2026-03-21');
    await expectNoA11yViolations(page);
  });

  test('Checkbox: starts unchecked and clean; the box and its label toggle it', async ({ page }) => {
    await gotoStory(page, 'forms-checkbox--example');
    const box = page.getByRole('checkbox');
    await expect(box).not.toBeChecked();
    await expect(page.locator('output')).toHaveText('Not accepted yet');
    await expectNotDirty(page);
    await page.getByText('I accept the terms of service').click();
    await expect(box).toBeChecked();
    await expect(page.locator('output')).toHaveText('Accepted');
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).not.toBeChecked();
    await expect(page.locator('output')).toHaveText('Not accepted yet');
    await expectNoA11yViolations(page);
  });

  test('Combobox: the list is closed at load; typing filters in memory; mouse and keyboard pick', async ({ page }) => {
    await gotoStory(page, 'forms-combobox--example');
    const input = page.getByRole('combobox', { name: 'City' });
    await expect(input).toHaveValue('Rome');
    await expect(page.locator('output')).toHaveText('Selected: rom');
    await expectClosed(page);
    await expectNotDirty(page);
    await input.click();
    await input.fill('mi');
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await expect(list.getByRole('option')).toHaveText(['Milan']);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('Milan');
    await expect(page.locator('output')).toHaveText('Selected: mil');
    await expect(input).toBeFocused();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    // Mouse; the disabled option cannot be picked.
    await input.click();
    await input.fill('');
    await page.getByRole('option', { name: 'Bologna' }).click({ force: true });
    await expect(page.locator('output')).toHaveText('Selected: mil');
    await page.getByRole('option', { name: 'Turin' }).click();
    await expect(page.locator('output')).toHaveText('Selected: tor');
    await expect(input).toHaveValue('Turin');
    await expect(input).toBeFocused();
    await expectNoA11yViolations(page);
  });

  test('DatePicker: the typed text is the initial date, no calendar at load, typing and picking change it', async ({ page }) => {
    await gotoStory(page, 'forms-datepicker--example');
    const input = page.getByRole('textbox', { name: 'Due date' });
    await expect(input).toHaveValue('03/15/2026');
    await expect(page.locator('output')).toHaveText('Due on 2026-03-15');
    await expectClosed(page);
    await expectNotDirty(page);
    await input.fill('03/18/2026');
    await input.press('Enter');
    await expect(page.locator('output')).toHaveText('Due on 2026-03-18');
    await page.getByRole('button', { name: /^Choose date, selected March 18, 2026/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose date' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('gridcell', { name: 'Friday, March 20, 2026' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(input).toHaveValue('03/20/2026');
    await expect(page.locator('output')).toHaveText('Due on 2026-03-20');
    // The focus lands on a live control (the trigger), not on <body>.
    await expect(page.getByRole('button', { name: /^Choose date, selected March 20, 2026/ })).toBeFocused();
    await expectNoA11yViolations(page);
  });

  test('Field: label, control, help and error are wired; the locked field is read-only from the keyboard too', async ({ page }) => {
    await gotoStory(page, 'forms-field--example');
    const vat = page.getByRole('textbox', { name: 'VAT number' });
    await expect(vat).toHaveValue('12345678901');
    await expect(vat).toHaveAttribute('aria-required', 'true');
    // Pristine: no error and no aria-invalid before any gesture.
    await expect(vat).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('The VAT number must have 11 digits.')).toHaveCount(0);
    await expect(vat).toHaveAccessibleDescription('Eleven digits, no spaces.');
    // Edit to an invalid value: still no error while typing, it appears once the field is left.
    await vat.fill('123');
    await expect(page.getByText('The VAT number must have 11 digits.')).toHaveCount(0);
    await expect(vat).not.toHaveAttribute('aria-invalid', 'true');
    await vat.blur();
    await expect(vat).toHaveAttribute('aria-invalid', 'true');
    await expect(vat).toHaveAccessibleDescription(/The VAT number must have 11 digits\./);
    // Fixing the value clears the error right away.
    await vat.fill('12345678901');
    await expect(vat).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('The VAT number must have 11 digits.')).toHaveCount(0);
    await expect(vat).toHaveAccessibleDescription('Eleven digits, no spaces.');

    const locked = page.getByRole('textbox', { name: 'Price list' });
    // The focus is still in the VAT input after fill: one Tab reaches the locked one.
    await page.keyboard.press('Tab');
    await expect(locked).toBeFocused();
    await page.keyboard.type('abc');
    await page.keyboard.press('Backspace');
    await expect(locked).toHaveValue('Price list A');
    await expect(locked).toHaveAttribute('aria-readonly', 'true');
    await expect(locked).toHaveAccessibleDescription(/Set by the customer agreement\./);
    // The reason is a real element referenced by aria-describedby.
    const ids = (await locked.getAttribute('aria-describedby'))!.split(' ');
    const texts = await Promise.all(ids.map((id) => page.locator(`[id="${id}"]`).textContent()));
    expect(texts.join(' ')).toContain('Set by the customer agreement.');
    await expectNoA11yViolations(page);
  });

  test('FileUpload: accepts a PDF, rejects a text file into the Field error, makes no network request', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const { protocol, hostname } = new URL(request.url());
      if (protocol !== 'data:' && protocol !== 'blob:' && hostname !== 'localhost' && hostname !== '127.0.0.1') external.push(request.url());
    });
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') posts.push(`${request.method()} ${request.url()}`);
    });
    await gotoStory(page, 'forms-fileupload--example');
    await expect(page.getByRole('list', { name: 'Selected files' })).toHaveCount(0);
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({ name: 'invoice-1.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2_000) });
    await expect(page.getByRole('list', { name: 'Selected files' }).getByText('invoice-1.pdf')).toBeVisible();
    await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByText('Not added: notes.txt. Only PDF files up to 5 MB.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Selected files' }).getByText('notes.txt')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Choose files/ })).toHaveAccessibleDescription(/Not added: notes\.txt/);
    await input.setInputFiles({ name: 'invoice-2.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2_000) });
    await expect(page.getByRole('list', { name: 'Selected files' }).getByText('invoice-2.pdf')).toBeVisible();
    // Removing one of two files moves the focus to the Remove button of the file that took its place.
    await page.getByRole('button', { name: 'Remove invoice-1.pdf' }).click();
    await expect(page.getByText('invoice-1.pdf')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove invoice-2.pdf' })).toBeFocused();
    // Removing the only file moves it to "Choose files", not to the body or any other element.
    await page.getByRole('button', { name: 'Remove invoice-2.pdf' }).click();
    await expect(page.getByText('invoice-2.pdf')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Choose files/ })).toBeFocused();
    expect(external).toEqual([]);
    expect(posts).toEqual([]);
    await expectNoA11yViolations(page);
  });

  test('Input: shows the initial text with no modified marker; typing updates the value', async ({ page }) => {
    await gotoStory(page, 'forms-input--example');
    const input = page.getByRole('textbox', { name: 'Company name' });
    await expect(input).toHaveValue('Acme Ltd');
    await expect(input).toHaveAccessibleName('Company name');
    const counter = page.getByText(/^\d+ characters$/);
    // The counter is not a live region: a screen reader must not announce it at every keystroke.
    await expect(counter).toHaveText('8 characters');
    expect(await counter.evaluate((el) => el.tagName)).not.toBe('OUTPUT');
    await expect(page.getByRole('status')).toHaveCount(0);
    await expectNotDirty(page);
    await input.fill('Acme Holdings Ltd');
    await expect(counter).toHaveText('17 characters');
    // The accessible name does not change with the edit.
    await expect(page.getByRole('textbox', { name: 'Company name' })).toHaveValue('Acme Holdings Ltd');
    await expect(input).toHaveAccessibleDescription('As it appears on the invoice.');
    await expectNoA11yViolations(page);
  });

  test('MultiSelect: starts with one chip and a closed list; picking adds a chip and keeps the list open', async ({ page }) => {
    await gotoStory(page, 'forms-multiselect--example');
    const input = page.getByRole('combobox', { name: 'Cost centers' });
    await expect(page.locator('[data-rop-multi-select] > span')).toHaveText(['Finance']);
    await expect(page.locator('output')).toHaveText('1 selected');
    await expectClosed(page);
    await expectNotDirty(page);
    await input.click();
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await list.getByRole('option', { name: 'Marketing' }).click();
    await expect(list).toBeVisible();
    await expect(page.locator('output')).toHaveText('2 selected');
    await expect(page.locator('[data-rop-multi-select] > span')).toHaveText(['Finance', 'Marketing']);
    await page.keyboard.type('sal');
    await page.keyboard.press('Enter');
    await expect(page.locator('output')).toHaveText('3 selected');
    await expect(input).toBeFocused();
    await expectNoA11yViolations(page);
  });

  test('NumberInput: starts at 1; arrows and the buttons step; typing past max is clamped on blur', async ({ page }) => {
    await gotoStory(page, 'forms-numberinput--example');
    const input = page.getByRole('spinbutton', { name: 'Quantity' });
    await expect(input).toHaveAttribute('aria-valuenow', '1');
    await expect(page.locator('output')).toHaveText('1 units');
    await expectNotDirty(page);
    await input.click();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('output')).toHaveText('2 units');
    await page.getByRole('button', { name: 'Increase' }).click();
    await expect(page.locator('output')).toHaveText('3 units');
    await expect(input).toBeFocused();
    await input.fill('150');
    await page.keyboard.press('Tab');
    await expect(input).toHaveAttribute('aria-valuenow', '100');
    await expect(page.locator('output')).toHaveText('100 units');
    await expectNoA11yViolations(page);
  });

  test('RadioGroup: the initial plan is checked; the arrows move the choice and the focus with it', async ({ page }) => {
    await gotoStory(page, 'forms-radiogroup--example');
    const monthly = page.getByRole('radio', { name: 'Monthly' });
    await expect(monthly).toBeChecked();
    await expect(page.locator('output')).toHaveText('Plan: monthly');
    await expectNotDirty(page);
    await page.keyboard.press('Tab');
    await expect(monthly).toBeFocused();
    await page.keyboard.press('ArrowDown');
    const quarterly = page.getByRole('radio', { name: 'Quarterly' });
    await expect(quarterly).toBeChecked();
    await expect(quarterly).toBeFocused();
    await expect(page.locator('output')).toHaveText('Plan: quarterly');
    await page.getByText('Yearly', { exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Yearly' })).toBeChecked();
    await expect(page.locator('output')).toHaveText('Plan: yearly');
    await expectNoA11yViolations(page);
  });

  test('Select: closed at load with the initial country; keyboard skips the disabled option; the trigger keeps the focus', async ({ page }) => {
    await gotoStory(page, 'forms-select--example');
    const trigger = page.getByRole('combobox', { name: 'Country' });
    await expect(trigger).toHaveText('Italy');
    await expect(page.locator('output')).toHaveText('Selected: it');
    await expectClosed(page);
    await expectNotDirty(page);
    await trigger.click();
    await page.getByRole('option', { name: 'France' }).click();
    await expect(trigger).toHaveText('France');
    await expect(page.locator('output')).toHaveText('Selected: fr');
    await expect(trigger).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
    // Wait for the open list to hand the focus to the selected option before the next key.
    await expect(page.getByRole('option', { name: 'France' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    // Germany is disabled: the arrow goes on to Spain.
    await expect(page.getByRole('option', { name: 'Spain' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveText('Spain');
    await expect(page.locator('output')).toHaveText('Selected: es');
    await expect(trigger).toBeFocused();
    await expectNoA11yViolations(page);
  });

  test('Switch: starts on and clean; Space and a click toggle it', async ({ page }) => {
    await gotoStory(page, 'forms-switch--example');
    const toggle = page.getByRole('switch');
    await expect(toggle).toBeChecked();
    await expect(page.locator('output')).toHaveText('On');
    await expectNotDirty(page);
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).not.toBeChecked();
    await expect(page.locator('output')).toHaveText('Off');
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeFocused();
    await expectNoA11yViolations(page);
  });

  test('Textarea: shows the initial text with no marker; typing grows it up to six rows then scrolls', async ({ page }) => {
    await gotoStory(page, 'forms-textarea--example');
    const area = page.getByRole('textbox', { name: 'Rejection reason' });
    await expect(area).toHaveValue('Amount does not match the purchase order.');
    const counter = page.getByText(/^\d+ characters$/);
    await expect(counter).toHaveText('41 characters');
    expect(await counter.evaluate((el) => el.tagName)).not.toBe('OUTPUT');
    await expect(page.getByRole('status')).toHaveCount(0);
    await expectNotDirty(page);
    const height = async () => (await area.boundingBox())!.height;
    const lineHeight = parseFloat(await area.evaluate((el) => getComputedStyle(el).lineHeight));
    const before = await height();
    await area.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nline 2\nline 3\nline 4');
    await expect.poll(height).toBeGreaterThan(before + lineHeight);
    await page.keyboard.type('\nline 5\nline 6\nline 7\nline 8\nline 9');
    // Six rows is the limit: the control stops growing and the text scrolls inside it.
    await expect.poll(() => area.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
    await expect.poll(() => area.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await height()).toBeLessThanOrEqual(before + lineHeight * 4 + 1);
    await expectNoA11yViolations(page);
  });
});
