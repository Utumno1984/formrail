import { expect, test, type Dialog, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { browserBack, browserForward } from './helpers/history';
import { expectPlayToPass, gotoStory as rawGotoStory } from './helpers/story';

const PLAYGROUND = 'patterns-dirtyguard--playground';
const OPEN = 'patterns-dirtyguard--dialog-open';

/**
 * The playground has a play function that drives the dialog itself: tests start after it ends (the
 * dialog closed, the focus back on the opener), never racing against it. Fixture stories have no play.
 */
async function gotoStory(page: Page, id: string, args?: string): Promise<void> {
  if (id === PLAYGROUND) await expectPlayToPass(page, id, args);
  else await rawGotoStory(page, id, args);
}
const openPlayground = (page: Page, args?: string) => gotoStory(page, PLAYGROUND, args);

const confirmDialog = (page: Page) => page.getByRole('dialog', { name: 'Unsaved changes' });
const opener = (page: Page) => page.getByRole('button', { name: 'Back to list' });
const noOrphans = (page: Page) =>
  page.evaluate(() => ({
    locked: document.body.hasAttribute('data-scroll-locked'),
    hidden: document.querySelectorAll('[data-aria-hidden]').length,
    dialogs: document.querySelectorAll('[role=dialog]').length,
  }));

/** Interacts with the page (browsers only show the beforeunload prompt after a user gesture), reloads, returns the native dialogs seen. */
async function reloadAndCollectDialogs(page: Page): Promise<string[]> {
  const seen: string[] = [];
  page.on('dialog', (dialog: Dialog) => {
    seen.push(dialog.type());
    void dialog.accept();
  });
  await page.locator('main').click();
  await page.reload();
  await page.waitForSelector('body.sb-show-main');
  return seen;
}

test.describe('Patterns/DirtyGuard: stories', () => {
  test('playground: the play function passes', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
  });

  test('dialog-open: the play function passes and axe finds no violation', async ({ page }) => {
    await expectPlayToPass(page, OPEN);
    await expect(confirmDialog(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe('beforeunload (real browser dialog)', () => {
  test('with changes, reloading shows the native beforeunload prompt', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'when:!true');
    expect(await reloadAndCollectDialogs(page)).toEqual(['beforeunload']);
  });

  test('without changes, reloading shows no prompt', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'when:!false');
    expect(await reloadAndCollectDialogs(page)).toEqual([]);
  });

  test('turning the Control off removes the listener: no prompt', async ({ page }) => {
    await gotoStory(page, PLAYGROUND);
    await page.evaluate(() => {
      // Same channel the Controls panel uses.
      const channel = (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void } })
        .__STORYBOOK_ADDONS_CHANNEL__;
      const id = new URLSearchParams(location.search).get('id');
      channel.emit('updateStoryArgs', { storyId: id, updatedArgs: { when: false } });
    });
    await expect(page.getByText('No changes')).toBeVisible();
    const seen: string[] = [];
    page.on('dialog', (d) => {
      seen.push(d.type());
      void d.accept();
    });
    await page.locator('main').click();
    await page.reload();
    expect(seen).toEqual([]);
  });
});

test.describe('guard with changes', () => {
  test('opens the dialog (modal, named, described) with the focus on "Keep editing"', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'when:!true');
    await opener(page).click();
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleDescription(/leaving now will lose them/);
    await expect(page.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    expect(await noOrphans(page)).toMatchObject({ locked: true, dialogs: 1 });
  });

  test('"Keep editing", Escape, the backdrop and the close button return the focus to the opener', async ({
    page,
  }) => {
    await gotoStory(page, PLAYGROUND, 'when:!true');
    const closers: Array<() => Promise<void>> = [
      () => page.getByRole('button', { name: 'Keep editing' }).click(),
      () => page.keyboard.press('Escape'),
      () => page.mouse.click(4, 4),
      () => page.getByRole('button', { name: 'Close: Unsaved changes' }).click(),
    ];
    for (const close of closers) {
      await opener(page).click();
      await expect(confirmDialog(page)).toBeVisible();
      await close();
      await expect(confirmDialog(page)).toHaveCount(0);
      await expect(opener(page)).toBeFocused();
      expect(await noOrphans(page)).toEqual({ locked: false, hidden: 0, dialogs: 0 });
    }
  });

  test('"Leave without saving" runs the action after closing, with no orphan overlay left', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'when:!true');
    await opener(page).click();
    await page.getByRole('button', { name: 'Leave without saving' }).click();
    await expect(confirmDialog(page)).toHaveCount(0);
    expect(await noOrphans(page)).toEqual({ locked: false, hidden: 0, dialogs: 0 });
    await expect(opener(page)).toBeVisible();
  });

  test('an action that unmounts the page leaves no inert, aria-hidden or scroll lock behind', async ({ page }) => {
    // The story's action unmounts the whole page and records how many dialogs were in the DOM when it ran.
    await gotoStory(page, 'patterns-dirtyguard--unmounts-page');
    await opener(page).click();
    await page.getByRole('button', { name: 'Leave without saving' }).click();
    await expect(page.getByText('Page closed')).toBeVisible();
    expect(await noOrphans(page)).toEqual({ locked: false, hidden: 0, dialogs: 0 });
    const inert = await page.evaluate(() => document.querySelectorAll('[inert]').length);
    expect(inert).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __dialogsAtAction: number }).__dialogsAtAction)).toBe(0);
  });

  test('without changes the exit is immediate, with no dialog', async ({ page }) => {
    await gotoStory(page, PLAYGROUND, 'when:!false');
    await opener(page).click();
    await expect(confirmDialog(page)).toHaveCount(0);
  });

  test('keyboard only: Enter on the opener, Enter on the safe button, the focus is back', async ({ page }) => {
    await openPlayground(page, 'when:!true');
    await opener(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(opener(page)).toBeFocused();
  });

  test('the confirmation sits above another open modal and Escape closes only the confirmation', async ({ page }) => {
    await gotoStory(page, 'patterns-dirtyguard--inside-dialog');
    await page.getByRole('button', { name: 'Open the card' }).click();
    const outer = page.getByRole('dialog', { name: 'Supplier card' });
    await expect(outer).toBeVisible();
    await page.getByRole('button', { name: 'Close card' }).click();
    await expect(confirmDialog(page)).toBeVisible();
    const topIsConfirm = await page.evaluate(() => {
      const confirm = [...document.querySelectorAll<HTMLElement>('[role=dialog]')].find(
        (d) => d.getAttribute('aria-labelledby') && d.textContent?.includes('Leave without saving'),
      )!;
      const r = confirm.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 8);
      return confirm.contains(hit);
    });
    expect(topIsConfirm).toBe(true);
    await page.keyboard.press('Escape');
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(outer).toBeVisible();
  });
});

test.describe('Back/Forward of the browser (popstate)', () => {
  const HISTORY = 'patterns-dirtyguard--browser-history';
  const route = (page: Page) => page.getByTestId('route');
  const field = (page: Page) => page.getByLabel('Supplier name');
  const hash = (page: Page) => page.evaluate(() => window.location.hash);
  const settle = (page: Page) => page.waitForTimeout(300); // the undo (history.go) is asynchronous
  const leave = (page: Page) => page.getByRole('button', { name: 'Leave without saving' }).click();

  test('with changes, Back opens the dialog and the route does not move; "Keep editing" keeps the value', async ({
    page,
  }) => {
    await gotoStory(page, HISTORY);
    await expect(route(page)).toHaveText('Route: #step-3');
    await field(page).fill('ACME');
    browserBack(page);
    await expect(confirmDialog(page)).toBeVisible();
    await settle(page);
    expect(await hash(page)).toBe('#step-3');
    await expect(route(page)).toHaveText('Route: #step-3');
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(confirmDialog(page)).toBeHidden();
    await expect(field(page)).toHaveValue('ACME');
    expect(await hash(page)).toBe('#step-3');
  });

  test('"Leave without saving" completes the original Back/Forward; no spurious entry', async ({ page }) => {
    await gotoStory(page, HISTORY);
    await field(page).fill('ACME');
    browserBack(page);
    await leave(page);
    await expect(route(page)).toHaveText('Route: #step-2');
    expect(await hash(page)).toBe('#step-2');
    // The page did not unmount, so the field is still modified: Forward asks again.
    browserForward(page);
    await expect(confirmDialog(page)).toBeVisible();
    await settle(page);
    expect(await hash(page)).toBe('#step-2');
    await leave(page);
    await expect(route(page)).toHaveText('Route: #step-3');
    // Two Backs from step-3 reach step-1 exactly: no duplicated entry in between.
    browserBack(page);
    await leave(page);
    await expect(route(page)).toHaveText('Route: #step-2');
    browserBack(page);
    await leave(page);
    await expect(route(page)).toHaveText('Route: #step-1');
  });

  test('without changes, Back and Forward work normally with no dialog', async ({ page }) => {
    await gotoStory(page, HISTORY);
    browserBack(page);
    await expect(route(page)).toHaveText('Route: #step-2');
    browserForward(page);
    await expect(route(page)).toHaveText('Route: #step-3');
    await expect(confirmDialog(page)).toBeHidden();
  });
});
