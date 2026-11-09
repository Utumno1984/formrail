import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeDemoInvoices } from '../packages/core/src/internal/demo-invoices';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = 'floorplans-list-report--row-actions-no-play';
const PLAY_STORY = 'floorplans-list-report--row-actions';
const SELECTED_STORY = 'floorplans-list-report--row-actions-selected-scrolled';

// The rows of the story (20 demo invoices); "Delete…" is disabled for the approved ones.
const ROWS = makeDemoInvoices(20);
const THIRD = ROWS[2]!;
const APPROVED = ROWS.find((r) => r.status === 'approved')!;
const PENDING = ROWS.find((r) => r.status === 'pending')!;

const table = (page: Page): Locator => page.getByRole('table', { name: 'Invoices', includeHidden: true });
const scroller = (page: Page): Locator => table(page).locator('..');
// `includeHidden`: an open modal menu hides the rest of the page (trigger included) with aria-hidden.
const trigger = (page: Page, number: string): Locator =>
  page.getByRole('button', { name: `Actions for ${number}`, exact: true, includeHidden: true });
const menu = (page: Page): Locator => page.getByRole('menu');
const item = (page: Page, name: string): Locator => page.getByRole('menuitem', { name, exact: true });

const isFocused = (l: Locator): Promise<boolean> => l.evaluate((el) => el === document.activeElement);

async function tabTo(page: Page, target: Locator, max = 60): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    if (await isFocused(target)) return;
  }
  throw new Error(`tabTo: not reached in ${max} presses`);
}

test.describe('List Report row actions', () => {
  test('the play function of the story passes', async ({ page }) => {
    await expectPlayToPass(page, PLAY_STORY);
  });

  test('one trailing column named "Actions", one distinctly named trigger per row', async ({ page }) => {
    await gotoStory(page, STORY);
    await expect(table(page).getByRole('columnheader').last()).toHaveAccessibleName('Actions');
    await expect(page.getByRole('button', { name: /^Actions for / })).toHaveCount(ROWS.length);
    // The trigger is in the last cell of its row.
    const lastCell = table(page).getByRole('row').nth(3).getByRole('cell').last();
    await expect(lastCell.getByRole('button')).toHaveAccessibleName(`Actions for ${THIRD.number}`);
  });

  test('mouse: click the trigger, then an item: the menu closes and the focus is back on the trigger', async ({ page }) => {
    await gotoStory(page, STORY);
    await trigger(page, THIRD.number).click();
    await expect(menu(page)).toBeVisible();
    await item(page, 'Duplicate').click();
    await expect(menu(page)).toHaveCount(0);
    await expect(trigger(page, THIRD.number)).toBeFocused();
  });

  test('not modal: with a menu open, a click on another row trigger closes it and opens that row menu (one menu at a time)', async ({ page }) => {
    await gotoStory(page, STORY);
    await trigger(page, THIRD.number).click();
    await expect(menu(page)).toHaveCount(1);
    await trigger(page, ROWS[0]!.number).click();
    await expect(menu(page)).toHaveCount(1);
    await expect(trigger(page, ROWS[0]!.number)).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, THIRD.number)).toHaveAttribute('aria-expanded', 'false');
    // The rest of the page is not hidden from assistive technology while the menu is open.
    await expect(page.locator('[aria-hidden="true"] input[type="search"]')).toHaveCount(0);
  });

  for (const key of ['Enter', 'Space', 'ArrowDown'] as const) {
    test(`keyboard: Tab reaches the trigger, ${key} opens on the first enabled item, Escape returns to the trigger`, async ({ page }) => {
      await gotoStory(page, STORY);
      await tabTo(page, trigger(page, ROWS[0]!.number));
      await page.keyboard.press(key);
      await expect(item(page, 'Duplicate')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu(page)).toHaveCount(0);
      await expect(trigger(page, ROWS[0]!.number)).toBeFocused();
    });
  }

  test('keyboard: Enter on an item selects it and returns the focus to the trigger', async ({ page }) => {
    await gotoStory(page, STORY);
    await trigger(page, THIRD.number).focus();
    await page.keyboard.press('Enter');
    await expect(item(page, 'Duplicate')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toHaveCount(0);
    await expect(trigger(page, THIRD.number)).toBeFocused();
  });

  test('a disabled action (approved invoice): aria-disabled, skipped by the arrows, never selected by mouse or keyboard', async ({ page }) => {
    await gotoStory(page, STORY);
    await trigger(page, APPROVED.number).focus();
    await page.keyboard.press('Enter');
    const remove = item(page, 'Delete…');
    await expect(remove).toHaveAttribute('aria-disabled', 'true');
    await expect(item(page, 'Duplicate')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, 'Duplicate')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(item(page, 'Duplicate')).toBeFocused();
    // A click on it does nothing: no confirmation, the menu stays open.
    await remove.click({ force: true });
    await expect(menu(page)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('an action that opens a confirmation with returnFocusRef: the focus enters it (Cancel), and after Cancel comes back to the row trigger', async ({ page }) => {
    await gotoStory(page, STORY);
    await trigger(page, PENDING.number).click();
    await item(page, 'Delete…').click();
    const dialog = page.getByRole('dialog', { name: `Delete invoice ${PENDING.number}?` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger(page, PENDING.number)).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });

  test('the same from the keyboard, with Escape on the confirmation', async ({ page }) => {
    await gotoStory(page, STORY);
    await trigger(page, PENDING.number).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await expect(item(page, 'Delete…')).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger(page, PENDING.number)).toBeFocused();
  });

  test('no axe violation with the menu closed and open', async ({ page }) => {
    await gotoStory(page, STORY);
    await expectNoA11yViolations(page);
    await trigger(page, THIRD.number).click();
    await expect(menu(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('a long action label wraps inside the menu, which stays within the viewport (mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, STORY);
    await trigger(page, THIRD.number).click();
    const panel = menu(page);
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  });
});

test.describe('List Report row actions: sticky column (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  async function expectTriggerReachable(page: Page, number: string): Promise<void> {
    const t = trigger(page, number);
    const tb = (await t.boundingBox())!;
    const sb = (await scroller(page).boundingBox())!;
    // Inside the visible part of the scroller, horizontally.
    expect(tb.x).toBeGreaterThanOrEqual(sb.x);
    expect(tb.x + tb.width).toBeLessThanOrEqual(sb.x + sb.width);
    // Nothing of the row is painted over it: the topmost element at its centre is the trigger itself.
    const hit = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x!, y!);
        return el?.closest('button')?.getAttribute('aria-label') ?? null;
      },
      [tb.x + tb.width / 2, tb.y + tb.height / 2],
    );
    expect(hit).toBe(`Actions for ${number}`);
  }

  test('the trigger is visible and clickable without scrolling sideways, at scroll 0, halfway and at the end', async ({ page }) => {
    await gotoStory(page, STORY);
    const el = scroller(page);
    const max = await el.evaluate((s) => s.scrollWidth - s.clientWidth);
    expect(max, 'the table must be wider than the 375px container').toBeGreaterThan(100);
    for (const left of [0, Math.round(max / 2), max]) {
      await el.evaluate((s, l) => {
        s.scrollLeft = l;
      }, left);
      await expectTriggerReachable(page, THIRD.number);
    }
    // At scroll 0 a click opens its menu, and the table did not scroll to reach it.
    await el.evaluate((s) => {
      s.scrollLeft = 0;
    });
    await trigger(page, THIRD.number).click();
    await expect(menu(page)).toBeVisible();
    expect(await el.evaluate((s) => s.scrollLeft)).toBe(0);
  });

  test('a selected row: the sticky cell has the same background as the row', async ({ page }) => {
    await gotoStory(page, SELECTED_STORY);
    const row = table(page).locator('tbody tr[data-selected]');
    await expect(row).toHaveCount(1);
    const [rowBg, cellBg, otherCellBg] = await row.evaluate((tr) => [
      getComputedStyle(tr).backgroundColor,
      getComputedStyle(tr.lastElementChild!).backgroundColor,
      getComputedStyle(tr.children[1]!).backgroundColor,
    ]);
    expect(cellBg).toBe(rowBg);
    // Opaque: the content scrolled under it does not show through.
    expect(cellBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(otherCellBg).toBe('rgba(0, 0, 0, 0)');
    // A row that is not selected: opaque too, and different from the selected tint.
    const plainBg = await table(page)
      .locator('tbody tr:not([data-selected])')
      .first()
      .evaluate((tr) => getComputedStyle(tr.lastElementChild!).backgroundColor);
    expect(plainBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(plainBg).not.toBe(cellBg);
  });

  test('the header cell of the column stays above the body cells on a vertical scroll', async ({ page }) => {
    await gotoStory(page, STORY);
    const el = scroller(page);
    await el.evaluate((s) => {
      s.scrollTop = 200;
      s.scrollLeft = 100;
    });
    const th = table(page).getByRole('columnheader').last();
    const b = (await th.boundingBox())!;
    const hitIsHeader = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x!, y!)?.closest('th') !== null,
      [b.x + b.width / 2, b.y + b.height / 2],
    );
    expect(hitIsHeader).toBe(true);
  });
});
