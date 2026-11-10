import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const PLAYGROUND = 'pro-patterns-form-rebase--playground';

test.describe('Pro/Patterns/Form rebase', () => {
  test('the play function passes (untouched field updated, touched kept as a conflict, accept server value)', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
  });

  test('a server update during a save is queued, then merged against the saved baseline', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'saveDelay:1500');
    const field = (name: string) => page.getByRole('textbox', { name });
    // Let the play function finish (it ends on a clean conflict list with the server values).
    await expect(page.getByRole('list', { name: /Conflicts \(0\)/ })).toBeAttached();
    await expect(field('Amount')).toHaveValue('150');

    await field('Notes').fill('Saved note');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await page.getByRole('button', { name: 'Simulate server update' }).click();
    await expect(page.getByRole('status')).toContainText('Server update queued until the save ends');
    // Nothing applied while saving.
    await expect(field('Amount')).toHaveValue('150');

    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled({ timeout: 5_000 });
    await expect(page.getByRole('status')).not.toContainText('queued');
    await expect(field('Amount')).toHaveValue('200');
    await expect(field('Supplier')).toHaveValue('Acme Corp (updated) (updated)');
    await expect(field('Notes')).toHaveValue('Saved note');
    await expect(page.getByRole('status')).toHaveText('All saved');
    await expect(page.getByRole('list', { name: /Conflicts \(0\)/ })).toBeAttached();
  });

  test('keep my value closes the conflict and leaves the field as typed', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    const field = (name: string) => page.getByRole('textbox', { name });
    await expect(field('Amount')).toHaveValue('150');
    await field('Amount').fill('175');
    await page.getByRole('button', { name: 'Simulate server update' }).click();
    await expect(page.getByRole('button', { name: 'Keep my value for Amount' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep my value for Amount' }).click();
    await expect(page.getByRole('list', { name: /Conflicts \(0\)/ })).toBeAttached();
    await expect(field('Amount')).toHaveValue('175');
    await expect(page.getByRole('status')).toHaveText('Unsaved changes');
  });

  test('no axe violations with an open conflict', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    const field = (name: string) => page.getByRole('textbox', { name });
    await expect(field('Amount')).toHaveValue('150');
    await field('Amount').fill('175');
    await page.getByRole('button', { name: 'Simulate server update' }).click();
    await expect(page.getByRole('button', { name: 'Accept server value for Amount' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
