import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #417: the shared focus restoration after a list mutation (internal `useListMutationFocus`), seen through
// its consumers, with the keyboard only and a real DOM. The focus is never on <body>. The line items of the
// sales orders are in `showcase-orders-list-mutation-focus.spec.ts` (#525, #527: the invoices' showcase is gone).
const btn = (page: Page, name: string): Locator => page.getByRole('button', { name, exact: true });
const onBody = (page: Page): Promise<boolean> => page.evaluate(() => document.activeElement === document.body);
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
