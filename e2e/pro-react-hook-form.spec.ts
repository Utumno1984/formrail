import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

// Pro/Integrations/React Hook Form (ticket #507): `useReactHookFormBinding` with a real React Hook Form, the Change
// Summary and the rebase of `@formrail/pro/engine`.
const PLAYGROUND = 'pro-integrations-react-hook-form--playground';
const LINE_ITEMS = 'pro-integrations-react-hook-form--line-items';

const field = (page: Page, name: string) => page.getByRole('textbox', { name });
const summaryRows = (page: Page) => page.getByRole('list', { name: 'Changes' }).getByRole('listitem');
const conflictsList = (page: Page) => page.getByRole('list', { name: /Conflicts/ });

test.describe('Pro/Integrations/React Hook Form', () => {
  test('the play function passes (hydrated, two edits then one, server update with a conflict, keep my value)', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
  });

  test('with an asynchronous hydration, "Unsaved changes" and summary rows never show while loading', async ({ page }) => {
    // The preview frame itself, without waiting for the play (it waits for the hydration, then edits).
    await page.goto(`/iframe.html?id=${PLAYGROUND}&viewMode=story&args=hydrationDelay:1500`);
    await expect(page.getByRole('status')).toBeAttached();
    // Each sample reads the status, the summary and the field at once: a sample taken before the record arrived
    // must show no unsaved change and no summary row.
    const sample = () =>
      page.evaluate(() => ({
        supplier: (document.querySelector('input[name="supplier"]') as HTMLInputElement | null)?.value,
        status: document.querySelector('[role="status"]')?.textContent ?? '',
        rows: document.querySelectorAll('ul[aria-label="Changes"] li').length,
      }));
    const loading: { status: string; rows: number }[] = [];
    for (let state = await sample(); state.supplier !== 'Acme Corp'; state = await sample()) {
      loading.push({ status: state.status, rows: state.rows });
      await page.waitForTimeout(50);
    }
    expect(loading.length).toBeGreaterThan(5);
    expect(loading.filter((state) => state.status.includes('Unsaved changes') || state.rows > 0)).toEqual([]);
    expect(loading.some((state) => state.status.includes('Loading'))).toBe(true);
  });

  // The tests below start where the play ends: Supplier "Acme Corp (updated)" and Amount 150 saved on the server,
  // the user's Amount 120 kept, "Unsaved changes".
  test('a server update during a save is queued, then merged against the saved values', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'saveDelay:1500');
    await expect(page.getByRole('status')).toHaveText('Unsaved changes');
    await field(page, 'Notes').fill('Saved note');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await page.getByRole('button', { name: 'Simulate server update' }).click();
    await expect(page.getByRole('status')).toContainText('Server update queued until the save ends');
    // Nothing applied while saving.
    await expect(field(page, 'Supplier')).toHaveValue('Acme Corp (updated)');
    await expect(field(page, 'Amount')).toHaveValue('120');

    await expect(page.getByRole('status')).not.toContainText('queued', { timeout: 5_000 });
    // Merged against what was saved (120, "Saved note"): the server version wins on every untouched field.
    await expect(field(page, 'Supplier')).toHaveValue('Acme Corp (updated) (updated)');
    await expect(field(page, 'Amount')).toHaveValue('170');
    await expect(field(page, 'Notes')).toHaveValue('Saved note');
    await expect(page.getByRole('status')).toHaveText('All saved');
    await expect(conflictsList(page).getByRole('listitem')).toHaveCount(0);
  });

  test('typing during "Saving…": the typed value stays after the save and is still an unsaved change (QA #507, point 1)', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'saveDelay:1500');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await field(page, 'Notes').fill('typed during save');
    // The save ends (the button is back): what was sent is saved, what was typed meanwhile is not.
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible({ timeout: 5_000 });
    await expect(field(page, 'Notes')).toHaveValue('typed during save');
    await expect(field(page, 'Amount')).toHaveValue('120');
    await expect(page.getByRole('status')).toHaveText('Unsaved changes');
    await expect(summaryRows(page)).toHaveCount(1);
    await expect(summaryRows(page).first()).toHaveText('Notes: "" → "typed during save"');
    // And it can be saved in turn.
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toHaveText('All saved', { timeout: 5_000 });
    await expect(field(page, 'Notes')).toHaveValue('typed during save');
  });

  test('"Accept server value" during "Saving…" then typing: the save stays in flight to its end, both changes stay (QA #507 round 2)', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND, 'saveDelay:2000');
    await page.getByRole('button', { name: 'Discard' }).click();
    await field(page, 'Amount').fill('999');
    await page.getByRole('button', { name: 'Simulate server update' }).click();
    const accept = page.getByRole('button', { name: 'Accept server value for Amount' });
    await expect(accept).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await accept.click();
    // Still saving after the accept: the indicator does not go away halfway.
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    const accepted = await field(page, 'Amount').inputValue();
    expect(accepted).not.toBe('999');
    await field(page, 'Notes').fill('typed during save');
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();

    // The save ends (the button is back): 999 was saved; the accepted value and the note are unsaved changes.
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible({ timeout: 5_000 });
    await expect(field(page, 'Amount')).toHaveValue(accepted);
    await expect(field(page, 'Notes')).toHaveValue('typed during save');
    await expect(page.getByRole('status')).toHaveText('Unsaved changes');
    await expect(summaryRows(page)).toHaveCount(2);
    await expect(summaryRows(page).nth(0)).toHaveText(`Amount: "999" → "${accepted}"`);
    await expect(summaryRows(page).nth(1)).toHaveText('Notes: "" → "typed during save"');
    await expect(conflictsList(page).getByRole('listitem')).toHaveCount(0);
  });

  test('Line items: the play passes (a server update while typing in a row)', async ({ page }) => {
    await expectPlayToPass(page, LINE_ITEMS);
  });

  // The two tests below start where the play ends: Supplier "Acme Corp (updated)", Description 1 "Cable (updated)",
  // Quantity 2 "500" (an unsaved change).
  test('Line items: a server update while typing in a row keeps that input node, its focus and the keystrokes (critic #507, point 2)', async ({ page }) => {
    await expectPlayToPass(page, LINE_ITEMS);
    const quantity = field(page, 'Quantity 2');
    await quantity.fill('5');
    // Mark the node: a remount would give a new input without the mark.
    await quantity.evaluate((input) => (input.dataset.probe = 'kept'));
    await page.getByRole('button', { name: 'Server update in 1 s' }).click();
    await quantity.click();
    await page.keyboard.press('End');
    await expect(field(page, 'Supplier')).toHaveValue('Acme Corp (updated) (updated)', { timeout: 5_000 });
    await expect(field(page, 'Description 1')).toHaveValue('Cable (updated) (updated)');
    // The same node, still focused: the next keystrokes land in it.
    await expect(page.locator('input[data-probe="kept"]')).toHaveCount(1);
    await expect(page.locator('input[data-probe="kept"]')).toBeFocused();
    await page.keyboard.type('0');
    await expect(quantity).toHaveValue('50');
    await expect(page.getByRole('status')).toHaveText('Unsaved changes');
    await expect(summaryRows(page)).toHaveCount(1);
  });

  test('Line items: "Accept server value" on another field keeps the row inputs (no remount)', async ({ page }) => {
    await expectPlayToPass(page, LINE_ITEMS);
    await field(page, 'Supplier').fill('Mine');
    await field(page, 'Quantity 1').fill('7');
    await field(page, 'Quantity 1').evaluate((input) => (input.dataset.probe = 'kept'));
    await page.getByRole('button', { name: 'Server update in 1 s' }).click();
    const accept = page.getByRole('button', { name: 'Accept server value for Supplier' });
    await expect(accept).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('input[data-probe="kept"]')).toHaveCount(1);
    await accept.click();
    await expect(field(page, 'Supplier')).toHaveValue('Acme Corp (updated) (updated)');
    await expect(page.locator('input[data-probe="kept"]')).toHaveCount(1);
    await expect(page.locator('input[data-probe="kept"]')).toHaveValue('7');
  });

  test('accept the server value: the field takes it, the conflict and its summary row go', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
    await field(page, 'Amount').fill('175');
    await field(page, 'Notes').fill('Mine');
    await page.getByRole('button', { name: 'Simulate server update' }).click();
    await page.getByRole('button', { name: 'Accept server value for Amount' }).click();
    await expect(field(page, 'Amount')).toHaveValue('200');
    await expect(conflictsList(page).getByRole('listitem')).toHaveCount(0);
    await expect(summaryRows(page)).toHaveCount(1);
    await expect(summaryRows(page).first()).toContainText('Notes');
  });

  test('Discard empties the summary', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
    await field(page, 'Notes').fill('Mine');
    await expect(summaryRows(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByText('No changes')).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('All saved');
    await expect(field(page, 'Amount')).toHaveValue('150');
    await expect(field(page, 'Notes')).toHaveValue('');
  });

  test('no axe violations with an open conflict', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
    await field(page, 'Amount').fill('175');
    await page.getByRole('button', { name: 'Simulate server update' }).click();
    await expect(page.getByRole('button', { name: 'Keep my value for Amount' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe('Pro/Integrations/React Hook Form example', () => {
  test('an edit is listed against the saved value; the server version merges with a conflict on the edited field', async ({ page }) => {
    await gotoStory(page, 'pro-integrations-react-hook-form--example');
    await expect(page.getByText('No changes')).toBeVisible();
    await field(page, 'Amount').fill('1300');
    await expect(summaryRows(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Receive the server version' }).click();
    await expect(field(page, 'Supplier')).toHaveValue('Rossi Construction Ltd');
    await expect(page.getByRole('group', { name: 'Conflict on Amount' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep my value for Amount' }).click();
    await expect(page.getByRole('group', { name: 'Conflict on Amount' })).toHaveCount(0);
    await expect(field(page, 'Amount')).toHaveValue('1300');
    await expect(page.getByRole('status')).toHaveText('Unsaved changes');
  });
});
