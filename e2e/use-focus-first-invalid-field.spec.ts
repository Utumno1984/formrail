import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

const ALL_EMPTY = 'internal-useobjectpageformfixture--focus-first-invalid-all-empty';
const SKIPS_VALID = 'internal-useobjectpageformfixture--focus-first-invalid-skips-valid';
const TYPING = 'internal-useobjectpageformfixture--focus-first-invalid-typing-clears-only-that-field';
// Same fixture without a play function: the test itself clicks Save.
const LONG_EMPTY = 'internal-useobjectpageformfixture--long-form-all-empty';
const LONG_VALID = 'internal-useobjectpageformfixture--long-form-valid-above';

const SELECT_PLAY = 'internal-useobjectpageformfixture--focus-first-invalid-select';
const LONG_MIXED = 'internal-useobjectpageformfixture--long-form-mixed-controls';

const save = (page: Page) => page.getByRole('button', { name: 'Save' });
const inViewport = (page: Page, label: string) =>
  page.getByLabel(label).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });

test.describe('useFocusFirstInvalidField: stories', () => {
  for (const id of [ALL_EMPTY, SKIPS_VALID, TYPING, SELECT_PLAY]) {
    test(`${id}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, id);
    });
  }
});

const NESTED = 'internal-useobjectpageformfixture--object-page-nested';
// Same fixture without a play function: the tests themselves click Save.
const NESTED_NO_PLAY = 'internal-useobjectpageformfixture--object-page-nested-no-play';

test.describe('useFocusFirstInvalidField: nested dot-notation paths', () => {
  test(`${NESTED}: the play function passes`, async ({ page }) => {
    await expectPlayToPass(page, NESTED);
  });

  test('Save with empty nested fields: focus on address.city, a message on every invalid field', async ({ page }) => {
    await gotoStory(page, NESTED_NO_PLAY);
    await save(page).click();
    await expect(page.getByLabel('City')).toBeFocused();
    await expect(page.getByLabel('City')).toHaveAttribute('data-rop-name', 'address.city');
    await expect(page.getByText('City is required')).toBeVisible();
    await expect(page.getByText('Quantity is required')).toHaveCount(2);
    await expect(page.getByLabel('Supplier')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('with city filled in the focus moves to lines.0.qty, then to lines.1.qty (exact paths)', async ({ page }) => {
    await gotoStory(page, NESTED_NO_PLAY);
    await page.getByLabel('City').fill('Roma');
    await save(page).click();
    await expect(page.getByLabel('Quantity 1')).toBeFocused();
    await page.getByLabel('Quantity 1').fill('3');
    await save(page).click();
    await expect(page.getByLabel('Quantity 2')).toBeFocused();
    await expect(page.getByText('Quantity is required')).toHaveCount(1);
  });
});

test.describe('useFocusFirstInvalidField: behavior in a real browser', () => {
  test('all empty: focus and scroll go to the first field in visual order, even though the errors are keyed D, C, B, A', async ({
    page,
  }) => {
    await gotoStory(page, LONG_EMPTY);
    await page.getByLabel('Field D').scrollIntoViewIfNeeded(); // start far from the first field
    await save(page).click();
    await expect(page.getByLabel('Field A')).toBeFocused();
    expect(await inViewport(page, 'Field A')).toBe(true);
    await expect(page.getByTestId('field-error-count')).toHaveText('field errors: 4');
  });

  test('a valid field above two invalid ones is skipped: the focus stops on the first invalid one', async ({ page }) => {
    await gotoStory(page, LONG_VALID);
    await save(page).click();
    await expect(page.getByLabel('Field B')).toBeFocused();
    expect(await inViewport(page, 'Field B')).toBe(true);
    await expect(page.getByLabel('Field A')).not.toBeFocused();
    await expect(page.getByLabel('Field C')).not.toBeFocused();
  });

  test('two Save clicks in a row with the same missing field refocus it both times', async ({ page }) => {
    await gotoStory(page, LONG_EMPTY);
    await save(page).click();
    await expect(page.getByLabel('Field A')).toBeFocused();
    // The click on Save (at the bottom, scrolls there) takes the focus away; the second identical
    // failure must bring it back and scroll the field into view again.
    await save(page).click();
    await expect(page.getByLabel('Field A')).toBeFocused();
    expect(await inViewport(page, 'Field A')).toBe(true);
    await expect(page.getByTestId('field-error-count')).toHaveText('field errors: 4');
  });

  // Until #102 this test was "typing after a failure clears every field error at once" (the
  // all-or-nothing clearing). Decision of Daniele (validation plan, F10): typing clears the edited
  // field only, so the test now pins the per-field clearing and the absence of any refocus.
  test('typing after a failure clears only the edited field, the others stay invalid and the focus stays put', async ({ page }) => {
    await gotoStory(page, LONG_EMPTY);
    await save(page).click();
    await expect(page.getByLabel('Field A')).toBeFocused();
    await page.keyboard.type('xyz');
    await expect(page.getByTestId('field-error-count')).toHaveText('field errors: 3');
    await expect(page.getByLabel('Field A')).toBeFocused();
    await expect(page.getByLabel('Field A')).toHaveValue('xyz');
    await expect(page.getByLabel('Field A')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('A is required')).toHaveCount(0);
    for (const k of ['B', 'C', 'D']) {
      await expect(page.getByLabel(`Field ${k}`)).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText(`${k} is required`)).toHaveCount(1);
    }
  });

  test('typing in a later invalid field keeps the focus (and the scroll) there, not on the first invalid one', async ({ page }) => {
    await gotoStory(page, LONG_EMPTY);
    await save(page).click();
    await expect(page.getByLabel('Field A')).toBeFocused();
    await page.getByLabel('Field C').click();
    await page.keyboard.type('hello');
    await expect(page.getByLabel('Field C')).toHaveValue('hello');
    await expect(page.getByTestId('field-error-count')).toHaveText('field errors: 3');
    await expect(page.getByLabel('Field C')).toBeFocused();
    expect(await inViewport(page, 'Field C')).toBe(true);
    expect(await inViewport(page, 'Field A')).toBe(false);
    await expect(page.getByLabel('Field A')).toHaveAttribute('aria-invalid', 'true');
  });

  test('after a partial clearing a new Save refocuses the first invalid field, again with identical errors', async ({ page }) => {
    await gotoStory(page, LONG_EMPTY);
    await save(page).click();
    await page.keyboard.type('x'); // A valid now
    await expect(page.getByTestId('field-error-count')).toHaveText('field errors: 3');
    await save(page).click();
    await expect(page.getByLabel('Field B')).toBeFocused();
    expect(await inViewport(page, 'Field B')).toBe(true);
    await save(page).click();
    await expect(page.getByLabel('Field B')).toBeFocused();
    expect(await inViewport(page, 'Field B')).toBe(true);
  });

  test('writing back the values the fields already have clears nothing', async ({ page }) => {
    await gotoStory(page, LONG_EMPTY);
    await save(page).click();
    await page.keyboard.type('x');
    await expect(page.getByTestId('field-error-count')).toHaveText('field errors: 3');
    await page.getByRole('button', { name: 'Re-apply current values' }).click();
    await expect(page.getByTestId('field-error-count')).toHaveText('field errors: 3');
    await expect(page.getByLabel('Field B')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Re-apply current values' })).toBeFocused();
  });

  test('the nested form: typing in City clears City only and the focus stays in City', async ({ page }) => {
    await gotoStory(page, NESTED_NO_PLAY);
    await save(page).click();
    await expect(page.getByLabel('City')).toBeFocused();
    await page.keyboard.type('Roma');
    await expect(page.getByLabel('City')).toBeFocused();
    await expect(page.getByText('City is required')).toHaveCount(0);
    await expect(page.getByText('Quantity is required')).toHaveCount(2);
    await expect(page.getByLabel('Quantity 1')).toHaveAttribute('aria-invalid', 'true');
  });

  test('an invalid Select (no native name) gets the focus and is scrolled into view', async ({ page }) => {
    await gotoStory(page, LONG_MIXED);
    await page.getByLabel('Field A').fill('filled');
    await save(page).click();
    const trigger = page.getByRole('combobox', { name: 'Field B' });
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('data-rop-name', 'b');
    await expect(trigger).not.toHaveAttribute('name');
    expect(
      await trigger.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight;
      }),
    ).toBe(true);
  });

  test('Select and Combobox are reached once the earlier fields are valid, in visual order', async ({ page }) => {
    await gotoStory(page, LONG_MIXED);
    await page.getByLabel('Field A').fill('filled');
    await save(page).click();
    await expect(page.getByRole('combobox', { name: 'Field B' })).toBeFocused();
    await page.getByRole('combobox', { name: 'Field B' }).click();
    await page.getByRole('option', { name: 'Italia' }).click();
    await save(page).click();
    await expect(page.getByRole('combobox', { name: 'Field C' })).toBeFocused();
  });

  test('mobile viewport: the invalid Select takes the focus and is inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await gotoStory(page, LONG_MIXED);
    await page.getByLabel('Field A').fill('filled');
    await save(page).click();
    const trigger = page.getByRole('combobox', { name: 'Field B' });
    await expect(trigger).toBeFocused();
    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(700);
  });

  test('the focused field is centered, not stuck at an edge', async ({ page }) => {
    await gotoStory(page, LONG_VALID);
    await save(page).click();
    await expect(page.getByLabel('Field B')).toBeFocused();
    const { top, height, vh } = await page.getByLabel('Field B').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height, vh: window.innerHeight };
    });
    expect(Math.abs(top + height / 2 - vh / 2)).toBeLessThan(vh * 0.2);
  });
});
