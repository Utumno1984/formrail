import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #417: the shared focus restoration after a list mutation (internal `useListMutationFocus`), seen through
// its two consumers, with the keyboard only and a real DOM. The focus is never on <body>.
const btn = (page: Page, name: string): Locator => page.getByRole('button', { name, exact: true });
const onBody = (page: Page): Promise<boolean> => page.evaluate(() => document.activeElement === document.body);
const descriptions = (page: Page): Promise<string[]> =>
  page.getByRole('textbox', { name: /^Line \d+ description$/ }).evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));

test.describe('Showcase/Invoices line items: focus after add, remove, move (keyboard only)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoStory(page, 'showcase-invoices--manual', 'recordId:inv-3;loadDelayMs:0;saveDelayMs:0');
    await expect(page.getByRole('textbox', { name: 'Line 1 description', exact: true })).toBeVisible();
  });

  test('Move down with Enter, Move up with Space: same button, same line, and Tab continues from the new place', async ({ page }) => {
    const [a, b, c] = await descriptions(page);
    await btn(page, 'Move line 1 down').focus();
    await page.keyboard.press('Enter');
    expect(await descriptions(page)).toEqual([b, a, c]);
    await expect(btn(page, 'Move line 2 down')).toBeFocused();
    // The tab order goes on from the re-inserted row, not from where the button was.
    await page.keyboard.press('Tab');
    await expect(btn(page, 'Remove line 2')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(btn(page, 'Move line 2 up')).toBeFocused();
    await page.keyboard.press('Space');
    expect(await descriptions(page)).toEqual([a, b, c]);
    await expect(btn(page, 'Move line 1 up')).toBeFocused();
    expect(await onBody(page)).toBe(false);
  });

  test('Remove with the keyboard down to an empty list, then Add: heir, previous, "Add line", new description', async ({ page }) => {
    await btn(page, 'Remove line 2').focus();
    await page.keyboard.press('Enter');
    await expect(btn(page, 'Remove line 2')).toBeFocused();
    expect(await onBody(page)).toBe(false);
    // Last line: the previous one inherits.
    await page.keyboard.press('Enter');
    await expect(btn(page, 'Remove line 1')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByText('No line items')).toBeVisible();
    await expect(btn(page, 'Add line')).toBeFocused();
    await page.keyboard.press('Enter');
    const added = page.getByRole('textbox', { name: 'Line 1 description', exact: true });
    await expect(added).toBeFocused();
    await page.keyboard.type('Typed right away');
    await expect(added).toHaveValue('Typed right away');
    expect(await onBody(page)).toBe(false);
  });
});

test.describe('FileUpload: focus after a keyboard removal, file names that a CSS selector would need to escape', () => {
  test('quotes, backslash and brackets in the names: next, previous, then Choose files', async ({ page }) => {
    await gotoStory(page, 'forms-fileupload--playground');
    const names = ['say "hi".pdf', 'back\\slash.pdf', `x"] [y='z.pdf`];
    await page
      .locator('input[type="file"]')
      .setInputFiles(names.map((name) => ({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(10, 1) })));
    await btn(page, `Remove ${names[0]}`).focus();
    await page.keyboard.press('Enter');
    await expect(btn(page, `Remove ${names[1]}`)).toBeFocused();
    await btn(page, `Remove ${names[2]}`).focus();
    await page.keyboard.press('Enter');
    await expect(btn(page, `Remove ${names[1]}`)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /Choose files$/ })).toBeFocused();
    expect(await onBody(page)).toBe(false);
  });
});
