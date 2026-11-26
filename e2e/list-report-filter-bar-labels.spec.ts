import { expect, test } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

const STORY = (name: string) => `floorplans-list-report--${name}`;
const ENGLISH_NAMES = ['Clear search', 'Filters and search'];

// Every text of the bar given from `ListReport` in Italian: no English accessible name of the bar is left.
test.describe('ListReport: texts of the filter bar (#688)', () => {
  test('the play function of the story passes', async ({ page }) => {
    await expectPlayToPass(page, STORY('localized-bar'));
  });

  test('with the texts in Italian, no English name of the bar is in the accessibility tree after typing', async ({ page }) => {
    await expectPlayToPass(page, STORY('localized-bar-no-play'));
    const box = page.getByRole('searchbox', { name: 'Cerca' });
    await box.fill('abc');
    await expect(page.getByRole('button', { name: 'Cancella ricerca' })).toBeVisible();
    await expect(page.getByRole('search', { name: 'Filtri e ricerca' })).toBeVisible();
    await expect(box).toHaveAttribute('placeholder', 'Cerca per numero o fornitore');
    const snapshot = await page.getByRole('search').ariaSnapshot();
    for (const name of ENGLISH_NAMES) expect(snapshot).not.toContain(name);
    await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0);
    await expect(page.getByRole('search', { name: 'Filters and search' })).toHaveCount(0);
  });

  test('the clear button empties the box and keeps the focus on it', async ({ page }) => {
    await expectPlayToPass(page, STORY('localized-bar-no-play'));
    const box = page.getByRole('searchbox', { name: 'Cerca' });
    await box.fill('abc');
    await page.getByRole('button', { name: 'Cancella ricerca' }).click();
    await expect(box).toHaveValue('');
    await expect(box).toBeFocused();
  });

  test('"Clear filters" still moves the focus to the search box with clearSearchLabel set', async ({ page }) => {
    await expectPlayToPass(page, STORY('localized-bar-no-play'));
    const box = page.getByRole('searchbox', { name: 'Cerca' });
    await box.fill('zzzzzz');
    await box.press('Enter');
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(box).toHaveValue('');
    await expect(box).toBeFocused();
  });

  test('the default story keeps the English names', async ({ page }) => {
    await expectPlayToPass(page, STORY('no-play'));
    await expect(page.getByRole('search', { name: 'Filters and search' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search' }).fill('abc');
    await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible();
  });
});
