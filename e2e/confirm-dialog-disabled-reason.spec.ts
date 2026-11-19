// #583: `confirmDisabledReason` in a real browser. The confirm button is `aria-disabled` (still focusable), described
// by the reason, and real keys (Enter, Space) and a real click on it confirm nothing.
import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations, settleMotion } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass } from './helpers/story';

const STORY = 'overlays-confirmdialog--confirm-unavailable';
const REASON = 'This sales order was deleted on the server: it can no longer be saved.';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Review changes' });
const saveChanges = (page: Page) => dialog(page).getByRole('button', { name: 'Save changes' });
/** The page is aria-hidden while a dialog is open: the opener is found by text, not by role. */
const opener = (page: Page) => page.locator('button', { hasText: /^Delete…$/ });
/** How many times the demo's `onConfirm` completed (written on the page by the story). */
const confirmedText = (page: Page) => page.locator('#storybook-root [role="status"]');

test.describe('ConfirmDialog: confirmDisabledReason (#583)', () => {
  test('confirm-unavailable: the play function passes', async ({ page }) => {
    await expectPlayToPass(page, STORY);
  });

  test('aria-disabled, focusable, described by the reason; real Enter, Space and clicks confirm nothing; the focus stays', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    const button = saveChanges(page);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).not.toHaveAttribute('disabled');
    await expect(button).toHaveAccessibleDescription(REASON);
    await expect(dialog(page).getByText(REASON)).toBeVisible();
    // The dialog itself is still described by its description only.
    await expect(dialog(page)).toHaveAccessibleDescription('3 changes will be saved.');
    for (const key of ['Enter', 'Space', 'Enter']) await page.keyboard.press(key);
    await button.click();
    await button.dblclick();
    await expect(dialog(page)).toBeVisible();
    await expect(button).toBeFocused();
    await expect(confirmedText(page)).toHaveText('');
    // In the accessibility tree: a button that is disabled for assistive technologies.
    expect(await dialog(page).ariaSnapshot()).toContain('button "Save changes" [disabled]');
  });

  test('Tab cycles through both buttons; Escape cancels and the focus returns to the opener', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await page.keyboard.press('Shift+Tab');
    await expect(dialog(page).getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(saveChanges(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    await expect(opener(page)).toBeFocused();
    await expect(confirmedText(page)).toHaveText('');
  });

  test('axe: no violation with the unavailable confirm button', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await settleMotion(page);
    await expectNoA11yViolations(page);
  });

  test('the Control emptied: the same play confirms with Enter (no reason, no aria-disabled)', async ({ page }) => {
    await expectPlayToPass(page, STORY, 'confirmDisabledReason:');
    await expect(dialog(page)).toHaveCount(0);
    await expect(confirmedText(page)).toHaveText('Deleted (1)');
  });

  test('never an attribute in the DOM, and nothing is logged', async ({ page }) => {
    const logged: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logged.push(m.text());
    });
    await expectPlayToPass(page, STORY);
    const names = await dialog(page).evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll('*'))].flatMap((n) => n.getAttributeNames().map((a) => a.toLowerCase())),
    );
    expect(names).not.toContain('confirmdisabledreason');
    expect(logged).toEqual([]);
  });

  test.describe('mobile', () => {
    test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

    test('the reason and both buttons are in view, nothing overflows; a tap on Save changes confirms nothing', async ({ page }) => {
      await expectPlayToPass(page, STORY);
      await expectNoHorizontalOverflow(dialog(page));
      await expect(dialog(page).getByText(REASON)).toBeInViewport({ ratio: 1 });
      for (const name of ['Keep editing', 'Save changes']) await expect(dialog(page).getByRole('button', { name })).toBeInViewport({ ratio: 1 });
      await saveChanges(page).tap();
      await expect(dialog(page)).toBeVisible();
      await expect(confirmedText(page)).toHaveText('');
    });
  });
});
