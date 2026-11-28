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

  test('more than three applied fields: a real Enter on the summary closes and reopens the list, the focus stays', async ({ page }) => {
    // The play function leaves the list open (it opened it with a click).
    await expectPlayToPass(page, 'pro-rebasenotice--many-applied');
    const summary = page.locator('.rop-pro-rebase-notice summary');
    const details = page.locator('.rop-pro-rebase-notice details');
    await expect(details).toHaveAttribute('open');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(details).not.toHaveAttribute('open');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open');
    await expect(summary).toBeFocused();
    await expect(page.getByRole('list', { name: 'Updated fields' }).getByRole('listitem')).toHaveCount(6);
  });
});
