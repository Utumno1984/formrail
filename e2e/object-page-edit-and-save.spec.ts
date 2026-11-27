import { expect, test } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

// Ticket #723: the happy path of `Floorplans/Object Page/Layout` (edit, back to clean, discard, save). Its play
// function scripts the whole path and is checked here under every outcome; after it, the page is driven from
// outside like a user would, to prove the state the play leaves is real and not just asserted by the play.

const STORY = 'floorplans-object-page-layout--edit-and-save';
const SAVE_ERROR = 'The changes could not be saved. Try again.';
const NAME = 'Ångström Batch';
const EDITED = `${NAME} (revised)`;

test.describe('Floorplans/Object Page/Layout: Edit and save (#723)', () => {
  for (const args of [undefined, 'saveDelay:0', 'saveDelay:1500', 'saveOutcome:error', 'saveOutcome:error;saveDelay:0']) {
    test(`the play function passes${args ? ` with ${args}` : ''}`, async ({ page }) => {
      await expectPlayToPass(page, STORY, args);
    });
  }

  test('success: the bar is gone, the header shows the saved name, and a new edit brings the bar back', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await expect(page.getByRole('region', { name: 'Save actions' })).toHaveCount(0);
    await expect(page.getByText(EDITED, { exact: true })).toBeVisible();
    const name = page.getByRole('textbox', { name: 'Name' });
    await expect(name).toHaveValue(EDITED);
    // The saved value is the new baseline: typing it back after an edit leaves the form clean.
    await name.press('End');
    await name.press('x');
    await expect(page.getByRole('region', { name: 'Save actions' })).toBeVisible();
    await name.press('Backspace');
    await expect(page.getByRole('region', { name: 'Save actions' })).toHaveCount(0);
  });

  test('error: the message stays in the bar, the edit is kept, and "Discard changes" returns to the saved record', async ({ page }) => {
    await expectPlayToPass(page, STORY, 'saveOutcome:error');
    const bar = page.getByRole('region', { name: 'Save actions' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('status')).toContainText(SAVE_ERROR);
    const name = page.getByRole('textbox', { name: 'Name' });
    await expect(name).toHaveValue(EDITED);
    await expect(page.getByText(EDITED, { exact: true })).toHaveCount(0);
    await bar.getByRole('button', { name: 'Discard changes' }).click();
    await expect(bar).toHaveCount(0);
    await expect(name).toHaveValue(NAME);
    // The focus does not fall on <body> when the bar it was in goes away: the page moves it to the record title.
    await expect(page.getByRole('heading', { level: 1, name: 'Record REC-00042' })).toBeFocused();
  });
});
