import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `internal-usecomboboxfixture--${name}`;
const input = (page: Page): Locator => page.getByRole('combobox', { name: 'City' });
const log = (page: Page): Locator => page.getByTestId('log').getByRole('listitem');

/** The node `aria-activedescendant` points at, resolved in the page (null if it does not exist). */
async function activeDescendantText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector('[role="combobox"]')!;
    const id = el.getAttribute('aria-activedescendant');
    return id ? (document.getElementById(id)?.textContent ?? null) : null;
  });
}

const focusIsOnInput = (page: Page) =>
  page.evaluate(() => document.activeElement === document.querySelector('[role="combobox"]'));

test.describe('Internal/UseComboboxFixture: stories play', () => {
  for (const name of ['default', 'selection-outside-results']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('useCombobox: real keyboard', () => {
  test('typing filters, arrows move skipping the disabled option, aria-activedescendant points at a real node, focus stays', async ({
    page,
  }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowDown');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
    expect(await activeDescendantText(page)).toBe('Milano');
    await page.keyboard.press('ArrowDown');
    expect(await activeDescendantText(page)).toBe('Modena');
    await page.keyboard.press('ArrowDown');
    expect(await activeDescendantText(page)).toBe('Città di Castello'); // Mantova is disabled
    await page.keyboard.press('End');
    expect(await activeDescendantText(page)).toBe('Torino');
    await page.keyboard.press('Home');
    expect(await activeDescendantText(page)).toBe('Milano');
    expect(await focusIsOnInput(page)).toBe(true);

    await input(page).fill('');
    await page.keyboard.type('citta');
    await expect(page.getByRole('option')).toHaveCount(1);
    expect(await activeDescendantText(page)).toBe('Città di Castello');
    await page.keyboard.press('Enter');
    await expect(input(page)).toHaveValue('Città di Castello');
    await expect(input(page)).not.toHaveAttribute('aria-activedescendant');
    await expect(page.getByTestId('selected')).toHaveText('Città di Castello');
    expect(await focusIsOnInput(page)).toBe(true);
    await expect(log(page)).toHaveCount(1);
  });

  test('Escape closes the open list keeping the selection; closed, it restores the text', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await page.keyboard.type('mil');
    await page.keyboard.press('Enter');
    await expect(input(page)).toHaveValue('Milano');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('mod');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(input(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(input(page)).toHaveValue('mod');
    await expect(page.getByTestId('selected')).toHaveText('Milano');
    await page.keyboard.press('Escape');
    await expect(input(page)).toHaveValue('Milano');
    await expect(log(page)).toHaveCount(1);
  });

  test('a selection outside the results stays selected; Tab reverts the text without selecting', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await page.keyboard.type('mil');
    await page.keyboard.press('Enter');
    await page.keyboard.type('xyz');
    // The only option left is the disabled "No results" message.
    await expect(page.getByRole('option', { disabled: false })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'No results', disabled: true })).toHaveCount(1);
    await expect(page.getByTestId('active-index')).toHaveText('-1');
    await expect(page.getByTestId('selected')).toHaveText('Milano');
    await page.keyboard.press('Tab');
    await expect(input(page)).toHaveValue('Milano');
    await expect(page.getByTestId('selected')).toHaveText('Milano');
    await expect(log(page)).toHaveCount(1);
  });

  test('clearOnEmpty: emptying the text and leaving clears the selection; without it the selection stays', async ({
    page,
  }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await page.keyboard.type('mil');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Tab');
    await expect(input(page)).toHaveValue('Milano');

    await gotoStory(page, STORY('manual'), 'clearOnEmpty:!true');
    await input(page).click();
    await page.keyboard.type('mil');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Tab');
    await expect(input(page)).toHaveValue('');
    await expect(page.getByTestId('selected')).toHaveText('none');
  });

  test('a real mouse click on an option selects it once and the focus never leaves the input', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await page.keyboard.press('ArrowDown');
    await page.getByRole('option', { name: 'Torino' }).click();
    await expect(input(page)).toHaveValue('Torino');
    expect(await focusIsOnInput(page)).toBe(true);
    await expect(log(page)).toHaveCount(1);
    await expect(log(page).first()).toHaveText('onSelectedItemChange(Torino)');
  });
});

test.describe('useCombobox: no echo (real browser)', () => {
  test('setting the value from outside never reaches onSelectedItemChange and shows the new text', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await page.getByRole('button', { name: 'Set from outside' }).click();
    await expect(input(page)).toHaveValue('Roma (da fuori)');
    await expect(page.getByTestId('selected')).toHaveText('Roma (da fuori)');
    await expect(log(page)).toHaveCount(0);

    // After a user selection, an external change adds no entry either.
    await input(page).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('tor');
    await page.keyboard.press('Enter');
    await expect(log(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Set from outside' }).click();
    await expect(input(page)).toHaveValue('Roma (da fuori)');
    await expect(log(page)).toHaveCount(1);
  });

  test('an external change while the user is typing does not overwrite the typed text', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await page.keyboard.type('tor');
    // Programmatic click: a real click would blur the input and end the typing.
    await page.getByRole('button', { name: 'Set from outside' }).dispatchEvent('click');
    await expect(page.getByTestId('selected')).toHaveText('Roma (da fuori)');
    await expect(input(page)).toHaveValue('tor');
    await page.keyboard.press('Tab');
    await expect(input(page)).toHaveValue('Roma (da fuori)');
    await expect(log(page)).toHaveCount(0);
  });
});

test.describe('useCombobox: IME composition (real, via CDP)', () => {
  test('Enter that confirms a composition does not select; Enter after it does', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const client = await page.context().newCDPSession(page);
    await input(page).click();
    await page.keyboard.press('ArrowDown');
    expect(await activeDescendantText(page)).toBe('Milano');

    // Start a composition: the browser fires compositionstart/update and marks keydowns as composing.
    await client.send('Input.imeSetComposition', { text: 'mi', selectionStart: 2, selectionEnd: 2 });
    await page.keyboard.press('Enter');
    await expect(log(page)).toHaveCount(0);
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');

    // Commit the composition (compositionend), then a plain Enter selects the active option.
    await client.send('Input.insertText', { text: 'mi' });
    await expect(input(page)).toHaveValue('mi');
    await page.keyboard.press('Enter');
    await expect(log(page)).toHaveCount(1);
    await expect(input(page)).toHaveValue('Milano');
  });

  test('synthetic composition events: Enter between compositionstart and compositionend is ignored', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await page.keyboard.press('ArrowDown');
    await input(page).dispatchEvent('compositionstart');
    await page.keyboard.press('Enter');
    await expect(log(page)).toHaveCount(0);
    await expect(input(page)).toHaveAttribute('aria-expanded', 'true');
    await input(page).dispatchEvent('compositionend');
    await page.keyboard.press('Enter');
    await expect(log(page)).toHaveCount(1);
  });
});
