import { expect, test } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

const PLAYGROUND = 'patterns-dirtyguard--playground';
const confirmDialog = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Unsaved changes' });
const opener = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Torna alla lista' });

test.describe('useDirtyGuard labels.close (#148)', () => {
  test('close="Close": X named "Close", no default "Close:" in the dialog DOM, X = stay with focus back, no attribute leak', async ({
    page,
  }) => {
    await expectPlayToPass(page, PLAYGROUND, 'when:!true;close:Close');
    await opener(page).click();
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    const x = dialog.getByRole('button', { name: 'Close', exact: true });
    await expect(x).toBeVisible();
    const html = await dialog.evaluate((el) => el.outerHTML);
    expect(html).not.toContain('Close:');
    expect(html).not.toMatch(/\sclose=/i);
    for (const b of await dialog.getByRole('button').all()) {
      await expect(b).not.toHaveAccessibleName('');
    }
    await x.click();
    await expect(dialog).toBeHidden();
    await expect(opener(page)).toBeFocused();
  });

  test('Escape with close set also means stay and returns the focus', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'when:!true;close:Close');
    await opener(page).click();
    await expect(confirmDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirmDialog(page)).toBeHidden();
    await expect(opener(page)).toBeFocused();
  });

  test('empty close falls back to "Close: <title>"', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'when:!true;close:');
    await opener(page).click();
    await expect(confirmDialog(page).getByRole('button', { name: 'Close: Unsaved changes' })).toBeVisible();
  });
});
