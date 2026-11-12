import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';
import { VIEWPORTS } from './helpers/viewports';

// #384: Pro/RebaseNotice, the component on its own.
const PLAYGROUND = 'pro-rebasenotice--playground';

test.describe('Pro/RebaseNotice', () => {
  test('the play function passes (resolves both conflicts, the Actions called, the focus kept on a live element)', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
  });

  for (const [name, width, height] of VIEWPORTS) {
    test(`three conflicts with long values at ${name} width: no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, 'pro-rebasenotice--three-conflicts');
      await expect(page.getByRole('list', { name: 'Conflicts' }).getByRole('listitem')).toHaveCount(3);
      await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    });
  }

  test('no a11y violations: applied only, one conflict, three conflicts', async ({ page }) => {
    for (const story of ['applied-only', 'one-conflict', 'three-conflicts']) {
      await gotoStory(page, `pro-rebasenotice--${story}`);
      await expect(page.locator('.rop-pro-rebase-notice')).toBeVisible();
      await expectNoA11yViolations(page);
    }
  });

  test('tone: information with applied changes only, warning with conflicts', async ({ page }) => {
    await gotoStory(page, 'pro-rebasenotice--applied-only');
    await expect(page.locator('.rop-pro-rebase-notice')).toContainText('Information:');
    await gotoStory(page, 'pro-rebasenotice--one-conflict');
    await expect(page.locator('.rop-pro-rebase-notice')).toContainText('Warning:');
  });
});
