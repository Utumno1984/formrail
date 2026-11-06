import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

const STORY = (name: string) => `internal-uselistreportfixture--${name}`;
const header = (page: Page, name: string): Locator => page.getByRole('columnheader', { name });
const click = (page: Page, name: string) => header(page, name).getByRole('button').click();
const log = (page: Page): Locator => page.getByTestId('log').getByRole('listitem');

/** Text of one column of the body, in display order. */
async function column(page: Page, index: number): Promise<string[]> {
  return page.locator('#storybook-root tbody tr').evaluateAll((rows, i) => rows.map((r) => r.children[i]!.textContent ?? ''), index);
}

test.describe('useListReport fixture: uncontrolled', () => {
  test('Amount: click 1 ascending (2 before 10, empty last), click 2 descending (empty still last), click 3 original', async ({
    page,
  }) => {
    await gotoStory(page, STORY('uncontrolled'));
    const original = await column(page, 0);
    expect(original).toEqual(['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8']);

    await click(page, 'Amount');
    await expect(header(page, 'Amount')).toHaveAttribute('aria-sort', 'ascending');
    expect(await column(page, 2)).toEqual(['1', '2', '2', '10', '10', '33', '100', '']);
    // stable: i2 before i5 (both 2), i1 before i7 (both 10)
    expect(await column(page, 0)).toEqual(['i8', 'i2', 'i5', 'i1', 'i7', 'i6', 'i4', 'i3']);

    await click(page, 'Amount');
    await expect(header(page, 'Amount')).toHaveAttribute('aria-sort', 'descending');
    expect(await column(page, 2)).toEqual(['100', '33', '10', '10', '2', '2', '1', '']);
    expect(await column(page, 0)).toEqual(['i4', 'i6', 'i1', 'i7', 'i2', 'i5', 'i8', 'i3']);

    await click(page, 'Amount');
    await expect(header(page, 'Amount')).not.toHaveAttribute('aria-sort');
    expect(await column(page, 0)).toEqual(original);
  });

  test('Date starts from the most recent (firstSortDirection desc), empty last, then ascending', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled'));
    await click(page, 'Date');
    await expect(header(page, 'Date')).toHaveAttribute('aria-sort', 'descending');
    expect((await column(page, 3))[0]).toBe('2025-09-09');
    expect((await column(page, 3)).at(-1)).toBe('');
    await click(page, 'Date');
    await expect(header(page, 'Date')).toHaveAttribute('aria-sort', 'ascending');
    expect((await column(page, 3))[0]).toBe('2024-11-30');
    expect((await column(page, 3)).at(-1)).toBe('');
  });

  test('Customer: case/diacritics insensitive, ties keep the input order, empty last; only one column has aria-sort', async ({
    page,
  }) => {
    await gotoStory(page, STORY('uncontrolled'));
    await click(page, 'Amount');
    await click(page, 'Customer');
    await expect(header(page, 'Amount')).not.toHaveAttribute('aria-sort');
    await expect(header(page, 'Customer')).toHaveAttribute('aria-sort', 'ascending');
    // "Café" (i4) and "Cafe" (i7) are equal: i4 stays before i7
    expect(await column(page, 0)).toEqual(['i2', 'i4', 'i7', 'i8', 'i1', 'i5', 'i3', 'i6']);
  });

  test('the non-sortable column has no button and no aria-sort', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled'));
    await expect(header(page, 'No.').getByRole('button')).toHaveCount(0);
    await expect(header(page, 'No.')).not.toHaveAttribute('aria-sort');
  });

  test('keyboard: Enter on the focused header button sorts', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled'));
    await header(page, 'Amount').getByRole('button').focus();
    await page.keyboard.press('Enter');
    await expect(header(page, 'Amount')).toHaveAttribute('aria-sort', 'ascending');
  });
});

test.describe('useListReport fixture: controlled', () => {
  test('the external button changes the order and onSortChange is not called; a header click is logged', async ({
    page,
  }) => {
    await gotoStory(page, STORY('controlled'));
    await page.getByRole('button', { name: 'Sort by Customer' }).click();
    await expect(page.getByTestId('sort-state')).toHaveText('customer asc');
    await expect(header(page, 'Customer')).toHaveAttribute('aria-sort', 'ascending');
    expect(await column(page, 0)).toEqual(['i2', 'i4', 'i7', 'i8', 'i1', 'i5', 'i3', 'i6']);
    await expect(log(page)).toHaveCount(0);

    await click(page, 'Amount');
    await expect(header(page, 'Amount')).toHaveAttribute('aria-sort', 'ascending');
    await expect(log(page)).toHaveCount(1);
    await expect(log(page).first()).toHaveText('{"columnId":"amount","direction":"asc"}');
  });
});

test.describe('useListReport fixture: filter and search', () => {
  const rowIds = (page: Page) => column(page, 0);

  test('typing filters only after the commit delay; the Commit button filters right away', async ({ page }) => {
    await page.clock.install();
    await gotoStory(page, STORY('uncontrolled'));
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    const input = page.getByLabel('Search');
    await input.fill('rossi');
    // the draft is in the input, the rows are still all there (the 300 ms timer runs on the fake clock)
    await expect(input).toHaveValue('rossi');
    await page.clock.runFor(299);
    expect(await rowIds(page)).toHaveLength(8);
    await page.clock.runFor(1);
    await expect.poll(() => rowIds(page)).toEqual(['i1', 'i5']);
    await expect(page.getByTestId('counts')).toHaveText('2/8');

    await input.fill('verdi');
    await page.getByRole('button', { name: 'Commit' }).click();
    expect(await rowIds(page)).toEqual(['i3']);
  });

  test('search ignores case and diacritics and matches every word', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled'));
    await page.getByLabel('Search').fill('CAFE 100');
    await page.getByRole('button', { name: 'Commit' }).click();
    expect(await rowIds(page)).toEqual(['i4']);
  });

  test('filter pill, then sort: the sort applies to the filtered rows; Reset restores everything', async ({ page }) => {
    await gotoStory(page, STORY('uncontrolled'));
    await page.getByRole('button', { name: 'To approve' }).click();
    await expect(page.getByRole('button', { name: 'To approve' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await click(page, 'Amount');
    expect(await rowIds(page)).toEqual(['i1', 'i7', 'i6', 'i4']);
    await expect(page.getByTestId('counts')).toHaveText('4/8');

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Search')).toHaveValue('');
    await expect(page.getByTestId('counts')).toHaveText('8/8');
  });

  test('controlled: an outside search change does not overwrite the typed text and does not echo', async ({ page }) => {
    await gotoStory(page, STORY('controlled'));
    const input = page.getByLabel('Search');
    await input.fill('rossi');
    await page.getByRole('button', { name: 'Set search: bianchi' }).click();
    await expect(input).toHaveValue('rossi');
    await expect.poll(() => rowIds(page)).toEqual(['i2']);
    await expect(log(page).filter({ hasText: 'search:bianchi' })).toHaveCount(0);
    // the typed text is still only a draft; committing it is an explicit gesture
    await page.getByRole('button', { name: 'Commit' }).click();
    await expect.poll(() => rowIds(page)).toEqual(['i1', 'i5']);
    await expect(log(page).filter({ hasText: 'search:rossi' })).toHaveCount(1);
  });
});
