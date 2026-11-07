import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectFocusRingVisible } from './helpers/geometry';

// The Introduction page is dogfooded (ticket #275): the examples are real library components and must
// work, not just compile.

test.describe('Introduction page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/iframe.html?id=introduction--docs&viewMode=docs');
    await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
  });

  test('List Report demo: a filter narrows the rows', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(page.getByRole('row', { name: /INV-1001/ })).toBeVisible();
    await page.getByRole('radio', { name: 'Approved', exact: true }).click();
    await expect(page.getByRole('row', { name: /INV-1001/ })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /INV-1002/ })).toBeVisible();
  });

  // Ticket #295: an external reviewer could not reach "all the items" of this demo with Tab. Real key
  // presses: `.focus()` only sets the starting point, the assertions are on where Tab and the arrows land.
  test.describe('List Report demo keyboard order', () => {
    const pills = ['All', 'To approve', 'Approved', 'Rejected'];
    const headers = ['Number', 'Supplier', 'Amount', 'Status'];
    // Every locator is scoped to the demo frame: other examples on the page reuse the same labels.
    const listReportDemo = (page: Page): Locator => page.getByTestId('demo-frame-list-report');
    // The scroll container is a tab stop on purpose: a keyboard user needs it to scroll the rows
    // (axe `scrollable-region-focusable`).
    const scroller = (demo: Locator): Locator => demo.locator('div[tabindex="0"]:has(> table)');

    test('Tab walks every stop in visual order, Shift+Tab walks back, and the keyboard leaves the demo @engines', async ({ page }) => {
      const demo = listReportDemo(page);
      const stops = [
        demo.getByRole('button', { name: 'New invoice', exact: true }),
        // Only the checked pill: the others are behind the arrow keys (see the roving test below).
        demo.getByRole('radio', { name: 'All', exact: true }),
        demo.getByRole('searchbox', { name: 'Search' }),
        scroller(demo),
        ...headers.map((name) => demo.getByRole('columnheader', { name }).getByRole('button')),
      ];

      // From outside the demo: the permalink of the heading right above it.
      await page.getByRole('heading', { name: /Two complete floorplans/ }).getByRole('link').focus();
      for (const stop of stops) {
        await page.keyboard.press('Tab');
        await expect(stop).toBeFocused();
        // Reached and also visibly marked: a stop without a focus ring reads as "Tab skipped it". The
        // helper also fails on a transparent ring or one cut by an ancestor's overflow (the sortable
        // headers sit inside an `overflow-hidden` <th>); it re-focuses the same element, so the next
        // Tab still starts from here.
        await expectFocusRingVisible(stop);
        await expect(stop).toBeFocused();
      }

      await page.keyboard.press('Tab');
      expect(await demo.evaluate((el) => el.contains(document.activeElement))).toBe(false);

      for (const stop of [...stops].reverse()) {
        await page.keyboard.press('Shift+Tab');
        await expect(stop).toBeFocused();
      }
    });

    // ROVING TABINDEX, BY DESIGN: this is NOT a bug and must not be "fixed" by giving every pill a tab
    // stop. The pills are one `radiogroup`, a single stop in the page's Tab sequence (WAI-ARIA APG, Radio
    // Group pattern): Tab lands on the checked pill and the next Tab LEAVES the group, skipping the other
    // pills, which are reached with the arrow keys. This is most likely what the reviewer perceived as
    // "Tab does not reach all the items": every pill is reachable, just not with Tab.
    test('pills are one roving tab stop: Tab skips the unchecked ones, the arrows reach and select each @engines', async ({ page }) => {
      const demo = listReportDemo(page);
      const pill = (name: string) => demo.getByRole('radio', { name, exact: true });
      const search = demo.getByRole('searchbox', { name: 'Search' });
      const newInvoice = demo.getByRole('button', { name: 'New invoice', exact: true });
      const expectOnly = async (name: string) => {
        await expect(pill(name)).toBeFocused();
        await expect(pill(name)).toBeChecked();
        for (const other of pills.filter((p) => p !== name)) await expect(pill(other)).not.toBeChecked();
        // The stop follows the selection: exactly one pill in the Tab sequence.
        expect(await demo.getByRole('radio').evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex))).toEqual(
          pills.map((p) => (p === name ? 0 : -1)),
        );
      };

      await newInvoice.focus();
      await page.keyboard.press('Tab');
      await expectOnly('All');
      await page.keyboard.press('Tab');
      await expect(search).toBeFocused(); // straight past 'To approve', 'Approved', 'Rejected'

      await page.keyboard.press('Shift+Tab');
      await expectOnly('All');

      // Selection follows focus (a radio group, not a toolbar): each arrow also filters the rows.
      await page.keyboard.press('ArrowRight');
      await expectOnly('To approve');
      await expect(demo.getByRole('row', { name: /INV-1002/ })).toHaveCount(0);
      await page.keyboard.press('ArrowDown');
      await expectOnly('Approved');
      await expect(demo.getByRole('row', { name: /INV-1002/ })).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expectOnly('Rejected');
      await page.keyboard.press('ArrowRight'); // wraps
      await expectOnly('All');
      await page.keyboard.press('ArrowLeft'); // wraps
      await expectOnly('Rejected');
      await page.keyboard.press('ArrowUp');
      await expectOnly('Approved');
      await page.keyboard.press('Home');
      await expectOnly('All');
      await page.keyboard.press('End');
      await expectOnly('Rejected');
      await page.keyboard.press('ArrowLeft');
      await expectOnly('Approved');

      // Leaving and coming back lands on the pill now checked, from both directions, not on the first.
      await page.keyboard.press('Tab');
      await expect(search).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expectOnly('Approved');
      await page.keyboard.press('Shift+Tab');
      await expect(newInvoice).toBeFocused();
      await page.keyboard.press('Tab');
      await expectOnly('Approved');
    });

    test('stops that come and go keep their place: clear-search after the input, clear-filters after the headers', async ({ page }) => {
      const demo = listReportDemo(page);
      const search = demo.getByRole('searchbox', { name: 'Search' });
      const clearSearch = demo.getByRole('button', { name: 'Clear search', exact: true });
      const header = (name: string) => demo.getByRole('columnheader', { name }).getByRole('button');
      const clearFilters = demo.getByRole('button', { name: /clear filters/i });

      await search.focus();
      await page.keyboard.type('zzz-no-such-invoice');
      await page.keyboard.press('Enter');
      await expect(clearFilters).toBeVisible();

      await page.keyboard.press('Tab');
      await expect(clearSearch).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(scroller(demo)).toBeFocused();
      for (const name of headers) {
        await page.keyboard.press('Tab');
        await expect(header(name)).toBeFocused();
      }
      await page.keyboard.press('Tab');
      await expect(clearFilters).toBeFocused();

      // Back from the keyboard alone: the button that was pressed leaves with the state, the focus does not fall on the body.
      await page.keyboard.press('Enter');
      await expect(search).toBeFocused();
      await expect(search).toHaveValue('');
      await expect(demo.getByRole('row', { name: /INV-1001/ })).toBeVisible();
    });

    test('a sortable header works from the keyboard and keeps the focus', async ({ page }) => {
      const demo = listReportDemo(page);
      const number = demo.getByRole('columnheader', { name: 'Number' });
      const button = number.getByRole('button');
      const firstCell = () => demo.getByRole('row').nth(1).getByRole('cell').first();
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(number).toHaveAttribute('aria-sort', 'ascending');
      await expect(firstCell()).toHaveText('INV-1001');
      await expect(button).toBeFocused();
      await page.keyboard.press('Space');
      await expect(number).toHaveAttribute('aria-sort', 'descending');
      await expect(firstCell()).toHaveText('INV-1006');
      await expect(button).toBeFocused();
    });
  });

  test('dirty tracking demo: edit makes it dirty, restoring the baseline makes it clean', async ({ page }) => {
    const field = page.getByRole('textbox', { name: 'Supplier' });
    await expect(page.getByText('No changes', { exact: true })).toBeVisible();
    await field.fill('Northwind Components X');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await field.fill('Northwind Components');
    await expect(page.getByText('No changes', { exact: true })).toBeVisible();
  });

  test('field states demo: locked field is focusable with a described reason, disabled is not', async ({ page }) => {
    const locked = page.getByRole('textbox', { name: 'Approver' });
    await locked.focus();
    await expect(locked).toBeFocused();
    await expect(locked).toHaveAccessibleDescription(/permission/);
    await expect(page.getByRole('textbox', { name: 'Cost center' })).toBeDisabled();
  });

  test('field states demo: real Tab reaches locked then forced, and skips disabled', async ({ page }) => {
    const locked = page.getByRole('textbox', { name: 'Approver' });
    const forced = page.getByRole('textbox', { name: 'Currency' });
    const disabled = page.getByRole('textbox', { name: 'Cost center' });
    await locked.focus();
    await expect(locked).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(forced).toBeFocused();
    await expect(forced).toHaveAccessibleDescription(/business rule/);
    await page.keyboard.press('Tab');
    await expect(disabled).not.toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(locked).toBeFocused();
  });

  test('theme override demo: the overridden wrapper changes the primary button colour', async ({ page }) => {
    const defaultBg = await page
      .getByRole('button', { name: 'Primary action' })
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const themedBg = await page
      .getByTestId('theme-override')
      .getByRole('button', { name: 'Primary action' })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(themedBg).not.toBe(defaultBg);
  });

  test('links to the Tokens page and the floorplans are present', async ({ page }) => {
    await expect(page.locator('a[href*="foundations-tokens--docs"]').first()).toBeVisible();
    await expect(page.locator('a[href*="floorplans-list-report--docs"]').first()).toBeVisible();
  });
});
