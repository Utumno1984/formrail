import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

// useListReportUrlState with an adapter: the state lives in a simulated router, not in the frame's URL.
const STORY = 'floorplans-list-report--url-state-router-recipe';
const FIXTURE = 'floorplans-list-report--url-state-router-recipe-no-play';

const pill = (page: Page, name: string) => page.getByRole('radio', { name });
const query = (page: Page) => page.getByTestId('router-query');

test.describe('Floorplans/List Report: UrlStateRouterRecipe', () => {
  test('the play function passes (history push, the default)', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await expect(pill(page, 'Approved')).toBeChecked();
  });

  test('the play function passes with history replace', async ({ page }) => {
    await expectPlayToPass(page, STORY, 'history:replace');
  });

  test('no axe violations', async ({ page }) => {
    await expectPlayToPass(page, STORY);
    await expectNoA11yViolations(page);
  });

  test('smoke: Open + Amount show the query, the frame URL is unchanged, Back goes to the previous pill', async ({ page }) => {
    await gotoStory(page, FIXTURE);
    const before = page.url();
    await pill(page, 'Open').click();
    await page.getByRole('button', { name: 'Amount' }).click();
    await expect(query(page)).toHaveText('filter=open&sort=amount.asc');
    expect(page.url()).toBe(before);
    expect(await page.evaluate(() => window.location.search)).toBe(new URL(before).search);

    await pill(page, 'Approved').click();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(pill(page, 'Open')).toBeChecked();
    await expect(query(page)).toHaveText('filter=open&sort=amount.asc');
    expect(page.url()).toBe(before);
    // The real browser history did not move either.
    await expect(page.getByRole('button', { name: 'Forward' })).toBeEnabled();
  });
});
