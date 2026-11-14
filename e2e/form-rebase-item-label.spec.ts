// Ticket #534: `itemLabel` in Form Rebase, through the stories of `Pro/Patterns/Form rebase` with rows identified by id.
import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass } from './helpers/story';

const ROW_CONFLICTS = 'pro-patterns-form-rebase--row-conflicts';
const MOVED_ROW_CONFLICT = 'pro-patterns-form-rebase--moved-row-conflict';

const quantity = (page: Page, line: number) => page.getByRole('textbox', { name: `Quantity of line ${line}` });
const conflictItems = (page: Page) => page.getByRole('list', { name: /^Conflicts/ }).getByRole('listitem');
const appliedItems = (page: Page) => page.getByRole('list', { name: /^Applied server changes/ }).getByRole('listitem');

/** After the play of `RowConflicts` (no conflict left): a conflict on the quantity of "Lamp" (third line). */
async function lampConflict(page: Page, args: string) {
  await expectPlayToPass(page, ROW_CONFLICTS, args);
  await expect(conflictItems(page)).toHaveCount(0);
  // The play removed "Desk": the lines are "Chair", "Lamp".
  await quantity(page, 2).fill('3');
  await page.getByRole('button', { name: 'Simulate server update' }).click();
  await expect(conflictItems(page)).toHaveCount(1);
}

test.describe('Pro/Patterns/Form rebase: rows named by itemLabel (#534)', () => {
  test('RowConflicts: the play passes with the default rowLabels (position) and with name', async ({ page }) => {
    await expectPlayToPass(page, ROW_CONFLICTS);
    await expectPlayToPass(page, ROW_CONFLICTS, 'rowLabels:name');
  });

  test('MovedRowConflict: the play passes (the conflict follows the moved and renamed row by name)', async ({ page }) => {
    await expectPlayToPass(page, MOVED_ROW_CONFLICT);
  });

  test('MovedRowConflict: the play also passes with rowLabels = position (QA)', async ({ page }) => {
    await expectPlayToPass(page, MOVED_ROW_CONFLICT, 'rowLabels:position');
  });

  test('rowLabels = name: a row removed above the conflict, the label follows the row (new index, same name)', async ({ page }) => {
    await lampConflict(page, 'rowLabels:name');
    await expect(conflictItems(page).first()).toContainText('Line items > Item 2 (Lamp) > Quantity: yours "3", server "22"');
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await expect(conflictItems(page).first()).toContainText('Line items > Item 1 (Lamp) > Quantity: yours "3", server "22"');
    await expect(page.getByRole('button', { name: 'Accept server value for Line items > Item 1 (Lamp) > Quantity' })).toBeVisible();
    await page.getByRole('button', { name: 'Accept server value for Line items > Item 1 (Lamp) > Quantity' }).click();
    await expect(conflictItems(page)).toHaveCount(0);
    await expect(quantity(page, 1)).toHaveValue('22');
  });

  test('rowLabels = position: the same steps keep Item N, at the new index', async ({ page }) => {
    await lampConflict(page, '');
    await expect(conflictItems(page).first()).toContainText('Line items > Item 2 > Quantity');
    await page.getByRole('button', { name: 'Remove line 1' }).click();
    await expect(conflictItems(page).first()).toContainText('Line items > Item 1 > Quantity');
  });

  test('applied entries are named with the row the server changed', async ({ page }) => {
    await lampConflict(page, 'rowLabels:name');
    // Chair, untouched since the play accepted the server value, takes the second update.
    await expect(appliedItems(page)).toHaveText(['Line items > Item 1 (Chair) > Quantity: "14" → "24"']);
  });

  test('the row in conflict removed by the user keeps the label of the rebase', async ({ page }) => {
    await lampConflict(page, 'rowLabels:name');
    await page.getByRole('button', { name: 'Remove line 2' }).click();
    await expect(conflictItems(page)).toHaveCount(1);
    await expect(conflictItems(page).first()).toContainText('Line items > Item 2 (Lamp) > Quantity: yours "3", server "22"');
  });

  test('no axe violations with an open conflict on a named row', async ({ page }) => {
    await lampConflict(page, 'rowLabels:name');
    await expectNoA11yViolations(page);
  });
});
