import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #610: in a story row that mixes a Field and its actions, the actions sit in the vertical band of the INPUT, not
// below it (a Field keeps room for its message under the input, which `alignItems: 'flex-end'` alone included).

const TOLERANCE = 1;

/** `mayWrap`: the row is a flex-wrap one that can put the actions on a line of their own: then they must clear the input, never overlap its band halfway. */
async function expectActionsBesideInput(page: Page, storyId: string, inputName: string, buttonNames: string[], mayWrap = false): Promise<void> {
  await gotoStory(page, storyId);
  const input = await page.getByRole('textbox', { name: inputName, exact: true }).boundingBox();
  expect(input, `input "${inputName}"`).not.toBeNull();
  for (const name of buttonNames) {
    const button = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(button, `button "${name}"`).not.toBeNull();
    if (mayWrap && button!.y >= input!.y + input!.height - TOLERANCE) continue;
    expect(button!.y, `"${name}" starts inside the input band`).toBeGreaterThanOrEqual(input!.y - TOLERANCE);
    expect(button!.y + button!.height, `"${name}" ends inside the input band`).toBeLessThanOrEqual(input!.y + input!.height + TOLERANCE);
  }
}

test.describe('Pro stories: actions beside a Field (#610)', () => {
  test('Change Summary > Row Labels And Reorders: Move / Remove sit in the band of the price input', async ({ page }) => {
    await expectActionsBesideInput(page, 'pro-changesummary--row-labels-and-reorders', 'Price of Desk', ['Move Desk up', 'Remove Desk']);
  });

  test('Form rebase > Row Conflicts: Move / Remove sit in the band of the name input', async ({ page }) => {
    await expectActionsBesideInput(page, 'pro-patterns-form-rebase--row-conflicts', 'Name of line 1', ['Move line 1 up', 'Remove line 1'], true);
  });
});
