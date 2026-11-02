import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `data-listreportfilterbar--${name}`;
const pill = (page: Page, name: string | RegExp): Locator => page.getByRole('radio', { name });
const search = (page: Page): Locator => page.getByRole('searchbox', { name: 'Search' });
const rows = (page: Page): Locator => page.getByTestId('rows').getByRole('listitem');
const checked = (page: Page): Promise<string[]> =>
  page.getByRole('radio').evaluateAll((els) => els.filter((el) => el.getAttribute('aria-checked') === 'true').map((el) => el.textContent ?? ''));

test.describe('Data/ListReportFilterBar: stories play', () => {
  for (const name of ['playground', 'active-filter', 'search-with-text', 'long-labels', 'search-only', 'rtl']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('accessibility', () => {
  for (const name of ['active-filter', 'search-with-text', 'long-labels', 'search-only']) {
    test(`${name}: no axe violations`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
      await expectNoA11yViolations(page);
    });
  }

  test('the bar is a named search landmark with a named radiogroup', async ({ page }) => {
    await gotoStory(page, STORY('active-filter'));
    const landmark = page.getByRole('search', { name: 'Filters and search' });
    await expect(landmark.getByRole('radiogroup', { name: 'Filters' }).getByRole('radio')).toHaveCount(3);
    await expect(landmark.getByRole('searchbox', { name: 'Search' })).toBeVisible();
  });
});

test.describe('pills', () => {
  test('a click selects exactly that pill and the rows follow', async ({ page }) => {
    await gotoStory(page, STORY('active-filter'));
    await pill(page, 'Da approvare').click();
    expect(await checked(page)).toEqual(['Da approvare']);
    await expect(rows(page)).toHaveCount(4);
    await expect(rows(page).first()).toHaveText('Rossi Costruzioni');
  });

  test('real keyboard: one tab stop, arrows move and select with wrap-around, Home/End jump', async ({ page }) => {
    await gotoStory(page, STORY('active-filter'));
    // The checked pill ("Approvate") is the tab stop; the others are skipped.
    await search(page).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(pill(page, 'Approvate')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(search(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(pill(page, 'Approvate')).toBeFocused();

    await page.keyboard.press('ArrowRight'); // wraps to the first
    await expect(pill(page, 'Tutte')).toBeFocused();
    expect(await checked(page)).toEqual(['Tutte']);
    await expect(rows(page)).toHaveCount(8);
    await page.keyboard.press('ArrowLeft'); // wraps to the last
    await expect(pill(page, 'Approvate')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(pill(page, 'Da approvare')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(pill(page, 'Approvate')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(pill(page, 'Tutte')).toBeFocused();
    expect(await checked(page)).toEqual(['Tutte']);
    await page.keyboard.press('End');
    await expect(pill(page, 'Approvate')).toBeFocused();
    expect(await checked(page)).toEqual(['Approvate']);

    // roving tabindex: exactly one pill is a tab stop, the checked one
    const tabIndexes = await page.getByRole('radio').evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));
    expect(tabIndexes).toEqual([-1, -1, 0]);
  });

  test('dir="rtl": Left goes forward and Right goes back', async ({ page }) => {
    await expectPlayToPass(page, STORY('rtl')); // the play leaves "Da approvare" focused and checked
    await expect(pill(page, 'Da approvare')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(pill(page, 'Approvate')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(pill(page, 'Da approvare')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(pill(page, 'Tutte')).toBeFocused();
    expect(await checked(page)).toEqual(['Tutte']);
  });
});

test.describe('search', () => {
  test('typing changes the rows only after the commit delay (page.clock); Enter commits at once', async ({ page }) => {
    await gotoStory(page, STORY('active-filter')); // "Approvate": 4 rows, delay 300 ms (the hook's default)
    // Frozen: time moves only with `runFor`, however long the typing takes.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await search(page).click();
    await page.keyboard.type('rossi');
    await expect(search(page)).toHaveValue('rossi');
    await expect(rows(page)).toHaveCount(4);
    await page.clock.runFor(299);
    await expect(rows(page)).toHaveCount(4);
    await page.clock.runFor(1);
    await expect(rows(page)).toHaveText(['Rossi Forniture']);

    // Enter does not wait
    await search(page).fill('');
    await page.clock.runFor(300);
    await expect(rows(page)).toHaveCount(4);
    await page.keyboard.type('gialli');
    await page.keyboard.press('Enter');
    await expect(rows(page)).toHaveText(['Gialli']);
  });

  test('Enter never submits an enclosing form, and a quick double Enter is harmless', async ({ page }) => {
    await gotoStory(page, STORY('inside-form'));
    await search(page).click();
    await page.keyboard.type('verdi');
    await expect(rows(page)).toHaveCount(8); // "solo Invio": nothing committed yet
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(rows(page)).toHaveText(['Verdi Industriale']);
    await expect(page.getByTestId('submits')).toHaveText('0');
  });

  test('the clear button empties draft and committed query at once and puts the focus back in the input', async ({ page }) => {
    await expectPlayToPass(page, STORY('search-with-text'));
    await expect(rows(page)).toHaveCount(3);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(search(page)).toHaveValue('');
    await expect(search(page)).toBeFocused();
    await expect(rows(page)).toHaveCount(8);
    await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0);
  });

  test('Escape with a draft clears it (and keeps the focus); with an empty draft it does nothing', async ({ page }) => {
    await expectPlayToPass(page, STORY('search-with-text'));
    await search(page).focus();
    await page.keyboard.press('Escape');
    await expect(search(page)).toHaveValue('');
    await expect(search(page)).toBeFocused();
    await expect(rows(page)).toHaveCount(8);
    await page.keyboard.press('Escape');
    await expect(search(page)).toBeFocused();
    await expect(rows(page)).toHaveCount(8);
  });

  test('Escape in a Dialog: the first clears the search, the Dialog stays; with an empty search it closes', async ({ page }) => {
    await gotoStory(page, STORY('inside-dialog'));
    await page.getByRole('button', { name: 'Apri filtri' }).click();
    const dialog = page.getByRole('dialog', { name: 'Filtra le fatture' });
    await expect(dialog).toBeVisible();
    await search(page).click();
    await page.keyboard.type('rossi');
    await page.keyboard.press('Enter');
    await expect(rows(page)).toHaveCount(3);

    await page.keyboard.press('Escape');
    await expect(search(page)).toHaveValue('');
    await expect(rows(page)).toHaveCount(8);
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('no going back: a controlled searchQuery changed from outside does not take the typed text away', async ({ page }) => {
    await gotoStory(page, STORY('external-search-query'));
    const input = search(page);
    await input.click();
    await page.keyboard.type('ross');
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(2, 2));
    await page.getByRole('button', { name: 'Imposta “verdi”' }).click();
    await expect(page.getByTestId('committed')).toHaveText('verdi');
    await expect(input).toHaveValue('ross');
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(2);
    // and the caret keeps working where it was
    await input.focus();
    await page.keyboard.type('X');
    await expect(input).toHaveValue('roXss');
  });
});

// Keyboard-safe focus (spec §1.10): same stand-in for the visual viewport as e2e/field.spec.ts.
for (const [name, viewport] of [
  ['mobile', { width: 375, height: 667 }],
  ['tablet', { width: 768, height: 1024 }],
] as const) {
  test.describe(`virtual keyboard (${name})`, () => {
    test.use({ viewport, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const target = new EventTarget();
        let keyboard = 0;
        const vv = Object.defineProperties(target, {
          offsetTop: { value: 0 },
          offsetLeft: { value: 0 },
          pageTop: { value: 0 },
          pageLeft: { value: 0 },
          scale: { value: 1 },
          height: { get: () => window.innerHeight - keyboard },
          width: { get: () => window.innerWidth },
        });
        Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
        (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard = (px) => {
          keyboard = px;
          target.dispatchEvent(new Event('resize'));
        };
      });
    });

    test('the search box stays inside the visible viewport when it gets the focus', async ({ page }) => {
      await gotoStory(page, STORY('keyboard-safe'));
      const input = search(page);
      await input.evaluate((el) => el.scrollIntoView({ block: 'end' }));
      const keyboard = Math.round(viewport.height * 0.45);
      const rect = () => input.evaluate((el) => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
      expect((await rect()).bottom).toBeGreaterThan(viewport.height - keyboard);

      await input.focus();
      await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), keyboard);
      await expect.poll(async () => (await rect()).bottom).toBeLessThanOrEqual(viewport.height - keyboard);
      expect((await rect()).top).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--rop-keyboard-inset'))).toBe(`${keyboard}px`);

      await input.blur();
      await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(0));
      expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--rop-keyboard-inset'))).toBe('');
    });
  });
}

test.describe('responsive', () => {
  test('below 640px the search takes the whole row under the pills; no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, STORY('long-labels'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const bar = await page.getByRole('search').boundingBox();
    const field = await search(page).boundingBox();
    const lastPill = await pill(page, 'Approvate').boundingBox();
    expect(bar && field && lastPill).toBeTruthy();
    // full width of the bar (the input is the Field's column)
    expect(Math.abs(field!.width - bar!.width)).toBeLessThanOrEqual(1);
    // under the pills, not beside them
    expect(field!.y).toBeGreaterThanOrEqual(lastPill!.y + lastPill!.height - 1);
    // long labels: every pill stays inside the bar and the text wraps, so the whole label is
    // visible (no tooltip needed, also from the keyboard and on touch)
    for (const radio of await page.getByRole('radio').all()) {
      const box = (await radio.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(bar!.x + bar!.width + 1);
    }
    const label = pill(page, /Da approvare entro/).locator('> *').first();
    expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const long = (await pill(page, /Da approvare entro/).boundingBox())!;
    const short = (await pill(page, 'Approvate').boundingBox())!;
    expect(long.height).toBeGreaterThan(short.height * 1.5);
    await pill(page, /Da approvare entro/).focus();
    await expect(pill(page, /Da approvare entro/)).toContainText('amministrazione');
  });

  test('pills wrap onto more lines on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoStory(page, STORY('long-labels'));
    const lines = await page.getByRole('radio').evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().top))).size);
    expect(lines).toBeGreaterThanOrEqual(2);
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
  });

  test('from 640px up the search box sits beside the pills', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 700 });
    await gotoStory(page, STORY('active-filter'));
    const field = (await search(page).boundingBox())!;
    const last = (await pill(page, 'Approvate').boundingBox())!;
    expect(field.x).toBeGreaterThanOrEqual(last.x + last.width);
    expect(field.width).toBeLessThanOrEqual(288 + 1);
  });
});
