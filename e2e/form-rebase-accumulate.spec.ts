// Ticket #584 (PR #588, first review): a conflict on a field of a row the user then removes, carried by a second
// server update, is a conflict on the row, and "Accept server value" brings the row back with the server's values.
import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

const ROW_CONFLICTS = 'pro-patterns-form-rebase--row-conflicts';

const quantity = (page: Page, line: number) => page.getByRole('textbox', { name: `Quantity of line ${line}` });
const name = (page: Page, line: number) => page.getByRole('textbox', { name: `Name of line ${line}` });
const conflictItems = (page: Page) => page.getByRole('list', { name: /^Conflicts/ }).getByRole('listitem');

test.describe('Pro/Patterns/Form rebase: conflicts across updates (#584)', () => {
  test('a conflict in a row the user then removes: after another update it is on the row, and accepting the server brings the row back', async ({
    page,
  }) => {
    // After the play: the lines are "Chair" (14) and "Lamp" (12); "Desk" removed by the user, still on the server.
    await expectPlayToPass(page, ROW_CONFLICTS, 'rowLabels:name');
    await expect(conflictItems(page)).toHaveCount(0);
    await expect(name(page, 2)).toHaveValue('Lamp');

    // A conflict on the quantity of "Lamp", then the user removes "Lamp".
    await quantity(page, 2).fill('3');
    await page.getByRole('button', { name: 'Simulate server update' }).click();
    await expect(conflictItems(page)).toHaveCount(1);
    await expect(conflictItems(page).first()).toContainText('Line items > Item 2 (Lamp) > Quantity: yours "3", server "22"');
    await page.getByRole('button', { name: 'Remove line 2' }).click();
    await expect(page.getByRole('textbox', { name: /^Name of line/ })).toHaveCount(1);

    // Another update renames "Desk" (removed by the user: a conflict on that row). The "Lamp" conflict is on the row now.
    await page.getByRole('button', { name: 'Simulate another server update' }).click();
    const lampRow = 'Line items > Item 3 (Lamp)';
    await expect(conflictItems(page)).toHaveCount(2);
    await expect(conflictItems(page).nth(1)).toContainText(`${lampRow}: yours undefined, server {"id":"line-3","name":"Lamp","quantity":"22"}`);
    await expect(page.getByRole('button', { name: `Accept server value for ${lampRow} > Quantity` })).toHaveCount(0);

    await page.getByRole('button', { name: `Accept server value for ${lampRow}` }).click();
    // The row is back, after "Chair" as on the server, with the server's quantity; the "Desk" conflict stays.
    await expect(name(page, 2)).toHaveValue('Lamp');
    await expect(quantity(page, 2)).toHaveValue('22');
    await expect(conflictItems(page)).toHaveCount(1);
    await expect(conflictItems(page).first()).toContainText('Line items > Item 1 (Standing desk): yours undefined');
  });
});
