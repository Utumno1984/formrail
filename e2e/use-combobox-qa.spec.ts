import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

const STORY = 'internal-usecomboboxfixture--manual';
const input = (page: Page): Locator => page.getByRole('combobox', { name: 'City' });
const log = (page: Page): Locator => page.getByTestId('log').getByRole('listitem');
const ad = (page: Page) => input(page).getAttribute('aria-activedescendant');

test.describe('useCombobox QA', () => {
  test('smoke 1: "mil" filters, arrows + Enter select, Escape cancels', async ({ page }) => {
    await gotoStory(page, STORY);
    await input(page).click();
    await page.keyboard.type('mil');
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('selected')).toHaveText('none');
    await expect(log(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(input(page)).toHaveValue('');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(input(page)).toHaveValue('Milano');
    await expect(log(page)).toHaveCount(1);
  });

  test('smoke 2+3 in sequence, re-selecting same option does not log, ArrowUp from closed goes to last enabled', async ({
    page,
  }) => {
    await gotoStory(page, STORY);
    await input(page).click();
    await page.keyboard.type('mil');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown'); // list unfiltered, Milano active
    expect(await ad(page)).toContain('option-mi');
    await page.keyboard.press('Enter'); // re-select same
    await expect(log(page)).toHaveCount(1);
    await page.keyboard.type('xyz');
    // The only option left is the disabled "No results" message.
    await expect(page.getByRole('option', { disabled: false })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'No results', disabled: true })).toHaveCount(1);
    await expect(input(page)).not.toHaveAttribute('aria-activedescendant');
    await page.keyboard.press('Enter'); // empty list: no-op
    await expect(log(page)).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(input(page)).toHaveValue('Milano');
    await page.getByRole('button', { name: 'Set from outside' }).click();
    await expect(input(page)).toHaveValue('Roma (set from outside)');
    await expect(log(page)).toHaveCount(1);
  });

  test('ArrowUp on closed list opens on last enabled; Home/End closed do not open', async ({ page }) => {
    await gotoStory(page, STORY);
    await input(page).click();
    await page.keyboard.press('End');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowUp');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('option', { name: 'Torino' })).toHaveAttribute('id', (await ad(page))!);
  });

  test('no prop leak: attributes on input/ul/li are valid, no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await gotoStory(page, STORY);
    await input(page).click();
    await page.keyboard.press('ArrowDown');
    const attrs = await page.evaluate(() => {
      const names = (el: Element) => el.getAttributeNames().sort();
      return {
        input: names(document.querySelector('[role=combobox]')!),
        ul: names(document.querySelector('[role=listbox]')!),
        li: names(document.querySelector('[role=option]')!),
      };
    });
    const valid = /^(aria-[a-z]+|id|role|class|style|type|value|autocomplete|hidden|data-.*)$/;
    for (const list of Object.values(attrs)) for (const a of list) expect(a).toMatch(valid);
    expect(errors).toEqual([]);
  });

  test('mouse: hover activates, click selects once, listbox mousedown keeps focus, disabled option not selectable', async ({
    page,
  }) => {
    await gotoStory(page, STORY);
    await input(page).click();
    await page.keyboard.press('ArrowDown');
    await page.getByRole('option', { name: 'Modena' }).hover();
    await expect(page.getByTestId('active-index')).toHaveText('1');
    await page.getByRole('option', { name: 'Mantova' }).hover();
    await expect(page.getByTestId('active-index')).toHaveText('1');
    await page.getByRole('option', { name: 'Mantova' }).click({ force: true });
    await expect(log(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('combobox');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('option', { name: 'Modena' }).click();
    await expect(log(page)).toHaveCount(1);
    await expect(input(page)).toHaveValue('Modena');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('click outside (real mouse) closes and reverts without selecting', async ({ page }) => {
    await gotoStory(page, STORY);
    await input(page).click();
    await page.keyboard.type('tor');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('mod');
    await page.getByRole('button', { name: 'Other control' }).click();
    await expect(input(page)).toHaveValue('Torino');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(log(page)).toHaveCount(1);
  });

  test('clearOnEmpty: Enter on empty text clears selection once; list stays reusable', async ({ page }) => {
    await gotoStory(page, STORY, 'clearOnEmpty:!true');
    await input(page).click();
    await page.keyboard.type('tor');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('selected')).toHaveText('none');
    await expect(log(page)).toHaveCount(2);
    await expect(log(page).nth(1)).toHaveText('onSelectedItemChange(null)');
    await page.keyboard.press('Tab');
    await expect(log(page)).toHaveCount(2);
  });

  test('clearOnEmpty: Escape on a closed list with empty text restores the text, the selection stays', async ({
    page,
  }) => {
    await gotoStory(page, STORY, 'clearOnEmpty:!true');
    await input(page).click();
    await page.keyboard.type('tor');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape'); // closes the list
    await page.keyboard.press('Escape'); // list closed: restores the text
    await expect(input(page)).toHaveValue('Torino');
    await expect(page.getByTestId('selected')).toHaveText('Torino');
    await expect(log(page)).toHaveCount(1);
  });

  test('clearOnEmpty off: emptying the text then Enter neither clears nor replaces the selection', async ({
    page,
  }) => {
    await gotoStory(page, STORY);
    await input(page).click();
    await page.keyboard.type('tor');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await expect(page.getByRole('option')).toHaveCount(5);
    await expect(page.getByTestId('active-index')).toHaveText('-1');
    await page.keyboard.press('Enter');
    await expect(input(page)).toHaveValue('Torino');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('selected')).toHaveText('Torino');
    await expect(log(page)).toHaveCount(1);
  });

  test('alt-tab style blur (window loses focus, input stays active) keeps the typed text and the list', async ({
    page,
  }) => {
    await gotoStory(page, STORY);
    await input(page).click();
    await page.keyboard.type('mod');
    // Emulate the window losing focus: a focusout (React's `onBlur` listens to it, not to `blur`)
    // while document.activeElement is still the input.
    await input(page).dispatchEvent('focusout');
    await expect(input(page)).toHaveValue('mod');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
  });

  test('typing diacritics-insensitive: "SAO" finds São Paulo', async ({ page }) => {
    await gotoStory(page, STORY);
    await input(page).click();
    await page.keyboard.type('SAO');
    await expect(page.getByRole('option')).toHaveText(['São Paulo']);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.type('ò');
    await expect(page.getByRole('option')).toHaveCount(5); // every city contains an "o": diacritics ignored
  });
});
