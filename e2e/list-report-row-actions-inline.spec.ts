import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeDemoInvoices } from '../packages/core/src/internal/demo-invoices';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

// `rowActionsInline={1}` (#364): "Delete…" (with an icon) inline from 40rem of table width, in the "…"
// menu below; "Duplicate" (no icon) always in the menu.
const STORY = 'floorplans-list-report--row-actions-inline-no-play';
const PLAY_STORY = 'floorplans-list-report--row-actions';
const MENU_ONLY_PLAY_STORY = 'floorplans-list-report--row-actions-menu-only';
const WIDE_VISUAL_STORY = 'floorplans-list-report--row-actions-inline-wide';
const NARROW = 'containerWidth:narrow';

const ROWS = makeDemoInvoices(20);
const APPROVED = ROWS.find((r) => r.status === 'approved')!;
const PENDING = ROWS.find((r) => r.status === 'pending')!;
const REJECTED = ROWS.find((r) => r.status === 'rejected')!;

const table = (page: Page): Locator => page.getByRole('table', { name: 'Invoices' });
const scroller = (page: Page): Locator => table(page).locator('..');
// Only what is displayed: the hidden form (`display: none`) is out of the accessibility tree.
const inline = (page: Page, number: string): Locator => page.getByRole('button', { name: `Delete… ${number}`, exact: true });
const trigger = (page: Page, number: string): Locator => page.getByRole('button', { name: `Actions for ${number}`, exact: true });
const rowOf = (page: Page, number: string): Locator => table(page).getByRole('row').filter({ has: page.getByRole('cell', { name: number, exact: true }) });
const menu = (page: Page): Locator => page.getByRole('menu');
const item = (page: Page, name: string): Locator => page.getByRole('menuitem', { name, exact: true });
const confirmation = (page: Page, number: string): Locator => page.getByRole('dialog', { name: `Delete invoice ${number}?` });

const isFocused = (l: Locator): Promise<boolean> => l.evaluate((el) => el === document.activeElement);

/**
 * Records the calls of the story's `fn()` spies (`onDelete`, `onDuplicate`), which Storybook reports on
 * its channel for the Actions panel. Must run before `gotoStory`.
 */
async function recordActions(page: Page): Promise<() => Promise<{ name: string; args: unknown[] }[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __STORYBOOK_ADDONS_CHANNEL__?: { on: (event: string, cb: (payload: { data: { name: string; args: unknown[] } }) => void) => void };
      __ropActions?: { name: string; args: unknown[] }[];
    };
    w.__ropActions = [];
    const timer = setInterval(() => {
      const channel = w.__STORYBOOK_ADDONS_CHANNEL__;
      if (!channel) return;
      clearInterval(timer);
      channel.on('storybook/actions/action-event', (payload) => w.__ropActions?.push({ name: payload.data.name, args: payload.data.args }));
    }, 1);
  });
  return () => page.evaluate(() => (window as unknown as { __ropActions?: { name: string; args: unknown[] }[] }).__ropActions ?? []);
}
const callsOf = async (read: () => Promise<{ name: string; args: unknown[] }[]>, name: string): Promise<unknown[][]> =>
  (await read()).filter((a) => a.name === name).map((a) => a.args);

test.describe('List Report inline row actions (#364)', () => {
  test('the play functions of the stories pass (inline, and the menu alone)', async ({ page }) => {
    await expectPlayToPass(page, PLAY_STORY);
    await expectPlayToPass(page, MENU_ONLY_PLAY_STORY);
  });

  test('one accessible control per action and row at each width: inline + "…" when wide, "…" alone when narrow', async ({ page }) => {
    await gotoStory(page, STORY);
    await expect(page.getByRole('button', { name: /^Delete… FT-/ })).toHaveCount(ROWS.length);
    await expect(page.getByRole('button', { name: /^Actions for FT-/ })).toHaveCount(ROWS.length);
    // Both forms are in the DOM: two triggers per row, one of them hidden.
    await expect(table(page).locator('button[aria-label^="Actions for"]')).toHaveCount(ROWS.length * 2);
    for (const number of [PENDING.number, APPROVED.number]) {
      await expect(inline(page, number)).toHaveCount(1);
      await expect(trigger(page, number)).toHaveCount(1);
    }

    await gotoStory(page, STORY, NARROW);
    await expect(page.getByRole('button', { name: /^Delete… FT-/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Actions for FT-/ })).toHaveCount(ROWS.length);
    await expect(table(page).locator('button[aria-label^="Delete… "]')).toHaveCount(ROWS.length);
  });

  test('Tab never reaches the hidden form', async ({ page }) => {
    const [first, second] = [ROWS[0]!, ROWS[1]!];
    await gotoStory(page, STORY);
    await inline(page, first.number).focus();
    await page.keyboard.press('Tab');
    await expect(trigger(page, first.number)).toBeFocused();
    await page.keyboard.press('Tab');
    // Next row: its inline button, never the hidden narrow trigger of the first row.
    await expect(inline(page, second.number)).toBeFocused();

    await gotoStory(page, STORY, NARROW);
    await trigger(page, first.number).focus();
    await page.keyboard.press('Tab');
    await expect(trigger(page, second.number)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(trigger(page, first.number)).toBeFocused();
  });

  test('the same descriptor in both forms: the inline button and the menu item call onSelect once each, for the same row, returnFocusRef = the control used', async ({ page }) => {
    const read = await recordActions(page);
    await gotoStory(page, STORY);
    // Wide: the inline button.
    await inline(page, PENDING.number).click();
    await expect(confirmation(page, PENDING.number)).toHaveCount(1);
    await confirmation(page, PENDING.number).getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation(page, PENDING.number)).toHaveCount(0);
    // returnFocusRef: the inline button that was used.
    await expect(inline(page, PENDING.number)).toBeFocused();
    await inline(page, PENDING.number).click();
    await confirmation(page, PENDING.number).getByRole('button', { name: 'Delete invoice' }).click();
    await expect(rowOf(page, PENDING.number)).toHaveCount(0);
    await expect.poll(() => callsOf(read, 'onDelete')).toEqual([[PENDING.id]]);

    // Narrow: the same action from the "…" menu.
    await gotoStory(page, STORY, NARROW);
    await trigger(page, PENDING.number).click();
    await item(page, 'Delete…').click();
    await expect(confirmation(page, PENDING.number)).toHaveCount(1);
    await confirmation(page, PENDING.number).getByRole('button', { name: 'Cancel' }).click();
    await expect(trigger(page, PENDING.number)).toBeFocused();
    await trigger(page, PENDING.number).click();
    await item(page, 'Delete…').click();
    await confirmation(page, PENDING.number).getByRole('button', { name: 'Delete invoice' }).click();
    await expect(rowOf(page, PENDING.number)).toHaveCount(0);
    // One more call, the same row (the record is reset by the new page load).
    await expect.poll(() => callsOf(read, 'onDelete')).toEqual([[PENDING.id]]);
    expect(await callsOf(read, 'onDuplicate')).toEqual([]);
  });

  test('keyboard on the inline button: Enter and Space open the confirmation; Cancel returns the focus to it', async ({ page }) => {
    await gotoStory(page, STORY);
    for (const key of ['Enter', 'Space'] as const) {
      await inline(page, PENDING.number).focus();
      await page.keyboard.press(key);
      const dialog = confirmation(page, PENDING.number);
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(inline(page, PENDING.number)).toBeFocused();
    }
  });

  test('disabled in both forms: nothing is called by click, Enter or Space inline, nor by click or Enter on the menu item', async ({ page }) => {
    const read = await recordActions(page);
    await gotoStory(page, STORY);
    const button = inline(page, APPROVED.number);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    // `force`: Playwright waits for an `aria-disabled` control to become enabled; the click is the point here.
    await button.click({ force: true });
    await button.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Still focusable (its tooltip explains it), still the focus.
    await expect(button).toBeFocused();

    await gotoStory(page, STORY, NARROW);
    await trigger(page, APPROVED.number).click();
    const entry = item(page, 'Delete…');
    await expect(entry).toHaveAttribute('aria-disabled', 'true');
    await expect(entry).toHaveAttribute('data-disabled', '');
    await entry.click({ force: true });
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await callsOf(read, 'onDelete')).toEqual([]);
  });

  test('name "Delete… <number>"; the tooltip "Delete…" only on hover or keyboard focus, never at mount', async ({ page }) => {
    await gotoStory(page, STORY);
    const button = inline(page, PENDING.number);
    await expect(button).toHaveAccessibleName(`Delete… ${PENDING.number}`);
    await page.waitForTimeout(800);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await button.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Delete…');
    // Away from the trigger and its grace area (the tooltip is hoverable): more than one move.
    await page.mouse.move(5, 5, { steps: 5 });
    await page.mouse.move(10, 10);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    // Keyboard: Tab onto it from the previous control.
    await inline(page, ROWS[0]!.number).focus();
    const target = inline(page, ROWS[1]!.number);
    for (let i = 0; i < 4 && !(await isFocused(target)); i += 1) await page.keyboard.press('Tab');
    await expect(target).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText('Delete…');
  });

  test('the inline button and the trigger have a target of at least 24×24px', async ({ page }) => {
    await gotoStory(page, STORY);
    for (const control of [inline(page, PENDING.number), trigger(page, PENDING.number)]) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
  });

  test('the threshold is the container, not the viewport: a 30rem panel on a desktop viewport uses the narrow form', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, STORY, NARROW);
    const width = await scroller(page).evaluate((el) => el.clientWidth);
    expect(width).toBeLessThan(640);
    await expect(inline(page, PENDING.number)).toHaveCount(0);
    await expect(trigger(page, PENDING.number)).toBeVisible();
    // And the wide box on the same viewport: the wide form.
    await gotoStory(page, STORY);
    expect(await scroller(page).evaluate((el) => el.clientWidth)).toBeGreaterThanOrEqual(640);
    await expect(inline(page, PENDING.number)).toBeVisible();
  });
});

test.describe('List Report inline row actions: geometry (#364)', () => {
  // The cell, the header cell and the trigger of every row, in the current form.
  async function measure(page: Page) {
    return table(page).evaluate((t) => {
      const rows = [...t.querySelectorAll('tbody tr:not([data-rop-filler])')] as HTMLTableRowElement[];
      const th = t.querySelector('thead th:last-child') as HTMLElement;
      const visible = (el: Element) => el.checkVisibility();
      return {
        header: th.getBoundingClientRect().width,
        cells: rows.map((r) => r.lastElementChild!.getBoundingClientRect().width),
        triggers: rows
          .map((r) => [...r.lastElementChild!.querySelectorAll('button[aria-label^="Actions for"]')].find(visible))
          .filter((b): b is HTMLElement => !!b)
          .map((b) => Math.round(b.getBoundingClientRect().right - b.closest('td')!.getBoundingClientRect().right)),
        rowCount: rows.length,
      };
    });
  }

  for (const [name, args, expected] of [
    ['wide', '', 84],
    ['narrow', NARROW, 44],
  ] as const) {
    test(`${name}: one width for the column on every row (some without "Delete…"), and in loading and no-results`, async ({ page }) => {
      await gotoStory(page, STORY, [args, `withoutDeleteFor:rejected`].filter(Boolean).join(';'));
      const data = await measure(page);
      // Rows with fewer actions are there.
      await expect(rowOf(page, REJECTED.number).getByRole('button')).toHaveCount(1);
      expect(data.rowCount).toBe(ROWS.length);
      // 2.75rem in the narrow form; + 1 icon slot (2.25rem) + 0.25rem in the wide one.
      expect(Math.round(data.header)).toBe(expected);
      for (const width of data.cells) expect(width).toBeCloseTo(data.header, 1);
      // The trigger sits at the same distance from the end of the cell in every row.
      expect(new Set(data.triggers).size).toBe(1);

      await gotoStory(page, STORY, [args, 'status:loading'].filter(Boolean).join(';'));
      await expect(scroller(page)).toHaveAttribute('aria-busy', 'true');
      expect((await measure(page)).header).toBeCloseTo(data.header, 1);

      await gotoStory(page, STORY, args || undefined);
      await page.getByRole('searchbox', { name: 'Search' }).fill('zzzz-no-such-invoice');
      await expect(table(page).getByText('No results for the current filters')).toBeVisible();
      expect((await measure(page)).header).toBeCloseTo(data.header, 1);
    });
  }

  test('wide: the trigger is at the same place as in the narrow form (its slot is the narrow cell)', async ({ page }) => {
    await gotoStory(page, STORY);
    const wide = await measure(page);
    await gotoStory(page, STORY, NARROW);
    const narrow = await measure(page);
    expect(wide.triggers[0]).toBe(narrow.triggers[0]);
  });
});

test.describe('List Report inline row actions: the form changes under an open menu (#364)', () => {
  test('narrow → wide (window widened): the menu closes without running anything, the focus goes to the inline button of the row', async ({ page }) => {
    const read = await recordActions(page);
    await page.setViewportSize({ width: 560, height: 800 });
    await gotoStory(page, STORY);
    expect(await scroller(page).evaluate((el) => el.clientWidth)).toBeLessThan(640);
    await trigger(page, PENDING.number).click();
    await expect(item(page, 'Delete…')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(menu(page)).toHaveCount(0);
    await expect(inline(page, PENDING.number)).toBeFocused();
    await page.waitForTimeout(300);
    await expect(inline(page, PENDING.number)).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await read()).toEqual([]);
  });

  test('wide → narrow (window narrowed): the menu closes, the focus goes to the "…" of the row', async ({ page }) => {
    const read = await recordActions(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, STORY);
    await trigger(page, PENDING.number).focus();
    await page.keyboard.press('Enter');
    await expect(item(page, 'Duplicate')).toBeFocused();
    await page.setViewportSize({ width: 560, height: 800 });
    await expect(menu(page)).toHaveCount(0);
    await expect(trigger(page, PENDING.number)).toBeFocused();
    await page.waitForTimeout(300);
    await expect(trigger(page, PENDING.number)).toBeFocused();
    expect(await read()).toEqual([]);
  });

  test('wide → narrow with the focus on an inline button (no menu open): the focus goes to the "…" of the row, never body', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, STORY);
    await inline(page, PENDING.number).focus();
    await expect(inline(page, PENDING.number)).toBeFocused();
    await page.setViewportSize({ width: 560, height: 800 });
    await expect(inline(page, PENDING.number)).toHaveCount(0);
    await expect(trigger(page, PENDING.number)).toBeFocused();
    await page.waitForTimeout(300);
    await expect(trigger(page, PENDING.number)).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });

  test('a resize that keeps the form leaves the menu open', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, STORY);
    await trigger(page, PENDING.number).click();
    await expect(menu(page)).toBeVisible();
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(200);
    await expect(menu(page)).toBeVisible();
  });
});

test.describe('List Report inline row actions: accessibility (#364)', () => {
  test('no axe violation in either form, with a selected row (contrast of its inline button) and with a menu open', async ({ page }) => {
    await gotoStory(page, WIDE_VISUAL_STORY);
    await expect(inline(page, PENDING.number)).toBeVisible();
    const selected = table(page).locator('tbody tr[data-selected]');
    await expect(selected).toHaveCount(1);
    await expect(selected.getByRole('button', { name: /^Delete… / })).toBeVisible();
    await expectNoA11yViolations(page);
    await trigger(page, PENDING.number).click();
    await expect(menu(page)).toBeVisible();
    await expectNoA11yViolations(page);

    await gotoStory(page, WIDE_VISUAL_STORY, NARROW);
    await expect(trigger(page, PENDING.number)).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
