import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #525 (part 2): the sales-order equivalent of the "Showcase/Invoices line items" tests of `list-mutation-focus.spec.ts`
// (#417, the shared focus restoration after a list mutation, with the keyboard only and a real DOM; the focus is never
// on <body>). The FileUpload test of that spec does not use the invoices and stays where it is. The line's
// "description" (a text field) is the line's product (a Select), so the order of the lines is read from the product and
// the quantity of each line together.
const FIXTURE = 'showcase-record-editing--sales-order-record-page-manual';
const THREE = 'so-25';

const btn = (page: Page, name: string): Locator => page.getByRole('button', { name, exact: true });
const onBody = (page: Page): Promise<boolean> => page.evaluate(() => document.activeElement === document.body);
/** One entry per line: its product and its quantity (the quantities are typed below, so that no two lines look alike). */
async function lines(page: Page): Promise<string[]> {
  const products = await page.getByRole('combobox', { name: /^Line \d+ product$/ }).evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
  const quantities = await page.getByRole('textbox', { name: /^Line \d+ quantity$/ }).evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  return products.map((p, i) => `${p} x${quantities[i]}`);
}

test.describe('Showcase/Record editing, orders: line focus after add, remove, move (keyboard only)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoStory(page, FIXTURE, `recordId:${THREE};loadDelayMs:0;saveDelayMs:0`);
    await expect(page.getByRole('combobox', { name: 'Line 1 product' })).toBeVisible();
    // Distinct quantities: a swap of two lines is then visible even when two of them have the same product.
    for (const [n, q] of [[1, '11'], [2, '22'], [3, '33']] as const) {
      await page.getByRole('textbox', { name: `Line ${n} quantity`, exact: true }).fill(q);
    }
    expect((await lines(page)).map((l) => l.split(' x')[1])).toEqual(['11', '22', '33']);
  });

  test('Move down with Enter, Move up with Space: same button, same line, and Tab continues from the new place', async ({ page }) => {
    const [a, b, c] = await lines(page);
    await btn(page, 'Move line 1 down').focus();
    await page.keyboard.press('Enter');
    expect(await lines(page)).toEqual([b, a, c]);
    await expect(btn(page, 'Move line 2 down')).toBeFocused();
    // The tab order goes on from the re-inserted row, not from where the button was.
    await page.keyboard.press('Tab');
    await expect(btn(page, 'Remove line 2')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(btn(page, 'Move line 2 up')).toBeFocused();
    await page.keyboard.press('Space');
    expect(await lines(page)).toEqual([a, b, c]);
    await expect(btn(page, 'Move line 1 up')).toBeFocused();
    expect(await onBody(page)).toBe(false);
  });

  test('Remove with the keyboard down to an empty list, then Add: heir, previous, "Add line", new product', async ({ page }) => {
    await btn(page, 'Remove line 2').focus();
    await page.keyboard.press('Enter');
    await expect(btn(page, 'Remove line 2')).toBeFocused();
    expect(await onBody(page)).toBe(false);
    // Last line: the previous one inherits.
    await page.keyboard.press('Enter');
    await expect(btn(page, 'Remove line 1')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByText('No lines')).toBeVisible();
    await expect(btn(page, 'Add line')).toBeFocused();
    await page.keyboard.press('Enter');
    const added = page.getByRole('combobox', { name: 'Line 1 product' });
    await expect(added).toBeFocused();
    // The new line takes the keyboard at once: Enter opens its product list, Escape closes it, the focus stays.
    await page.keyboard.press('Enter');
    await expect(page.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(added).toBeFocused();
    expect(await onBody(page)).toBe(false);
  });
});
