import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

// The validation recipe (#104): useObjectPageForm({ schema }) + ValidationProvider +
// useFocusFirstInvalidField + ObjectPageFooter(getErrorSummary) + useDirtyGuard, driven with real input.
const STORY = (name: string) => `floorplans-object-page-con-validazione--${name}`;
const MANUAL = STORY('manual');
const FOOTER = '[data-object-page-footer]';
const SCROLLER = '[data-object-page-scroller]';

type KeyboardWindow = { __setKeyboard: (px: number) => void };
type BeforeUnloadWindow = { __beforeUnload: { added: number; removed: number } };

const footer = (page: Page) => page.getByRole('region', { name: 'Save actions' });
const status = (page: Page) => footer(page).getByRole('status');
const save = (page: Page) => footer(page).getByRole('button', { name: 'Save' });
const supplier = (page: Page) => page.getByRole('textbox', { name: 'Supplier' });
const city = (page: Page) => page.getByRole('textbox', { name: 'City' });
const country = (page: Page) => page.getByRole('combobox', { name: 'Country' });
const category = (page: Page) => page.getByRole('combobox', { name: 'Category' });
const dirty = (page: Page) => page.getByTestId('dirty-state');
const backToList = (page: Page) => page.getByRole('button', { name: 'Back to list' });
const guardDialog = (page: Page) => page.getByRole('dialog', { name: 'Unsaved changes' });

/**
 * Counts the `beforeunload` listeners added to / removed from `window` from the moment the page
 * starts (the real calls, not a reading of the code). Storybook's own listeners are subtracted by
 * the tests taking a reading after the page has settled.
 */
async function trackBeforeUnload(page: Page) {
  await page.addInitScript(() => {
    const counters = { added: 0, removed: 0 };
    (window as unknown as BeforeUnloadWindow).__beforeUnload = counters;
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest: never[]) {
      if (this === window && type === 'beforeunload') counters.added += 1;
      return (add as (...a: unknown[]) => void).call(this, type, ...rest);
    } as typeof add;
    EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, ...rest: never[]) {
      if (this === window && type === 'beforeunload') counters.removed += 1;
      return (remove as (...a: unknown[]) => void).call(this, type, ...rest);
    } as typeof remove;
  });
}
const listenerCalls = (page: Page) =>
  page.evaluate(() => ({ ...(window as unknown as BeforeUnloadWindow).__beforeUnload }));
/** Does a `beforeunload` listener of the guard cancel the event right now? (the real prompt trigger) */
const guardIsArmed = (page: Page) =>
  page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

/** Edit the nested City: the form becomes dirty and the footer appears. */
async function makeDirty(page: Page) {
  await city(page).fill('Leeds');
  await expect(dirty(page)).toHaveText('Unsaved changes: yes');
  await expect(footer(page)).toBeVisible();
}

test.describe('Object Page with validation (recipe): stories', () => {
  test('validation-flow: the play function passes', async ({ page }) => {
    await expectPlayToPass(page, STORY('validation-flow'));
  });
});

test.describe('useDirtyGuard does not depend on validity', () => {
  test.use({ viewport: { width: 1024, height: 700 } });

  test.beforeEach(async ({ page }) => {
    await trackBeforeUnload(page);
  });

  test('(a)(b)(c) a failed validation changes neither isDirty, nor the beforeunload listener, nor opens the dialog', async ({ page }) => {
    await gotoStory(page, MANUAL);
    await makeDirty(page);
    // Settled: the guard's listener is registered because the form is dirty.
    expect(await guardIsArmed(page)).toBe(true);
    const before = await listenerCalls(page);

    await save(page).click();
    await expect(status(page)).toHaveText('Error: 3 invalid fields');
    await expect(page.getByText('Supplier is required.')).toBeVisible();

    // (a) still dirty, and the footer of a dirty form is still there.
    await expect(dirty(page)).toHaveText('Unsaved changes: yes');
    await expect(footer(page)).toBeVisible();
    // (b) the listener was neither removed nor added again by the failed validation, and still cancels.
    expect(await listenerCalls(page)).toEqual(before);
    expect(await guardIsArmed(page)).toBe(true);
    // (c) no guard dialog opened.
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // A second failed Save changes nothing either.
    await save(page).click();
    await expect(dirty(page)).toHaveText('Unsaved changes: yes');
    expect(await listenerCalls(page)).toEqual(before);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('(d) an exit wrapped in guard after a failed validation still opens the dialog; only "leave" runs the action', async ({ page }) => {
    await gotoStory(page, MANUAL);
    await makeDirty(page);
    await save(page).click();
    await expect(status(page)).toHaveText('Error: 3 invalid fields');
    await expect(supplier(page)).toBeFocused();

    await backToList(page).click();
    await expect(guardDialog(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await expect(page.getByText('Back on the list.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(guardDialog(page)).toHaveCount(0);
    await expect(backToList(page)).toBeFocused();
    // The errors are still on the form after staying.
    await expect(status(page)).toHaveText('Error: 3 invalid fields');

    await backToList(page).click();
    await page.getByRole('button', { name: 'Leave without saving' }).click();
    await expect(page.getByText('Back on the list.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('clean form: Save validates without making it dirty or arming the guard; leaving is immediate', async ({ page }) => {
    // `footer:always` so Save is reachable on an untouched form; the empty record fails the schema.
    await gotoStory(page, MANUAL, 'footer:always');
    await expect(dirty(page)).toHaveText('Unsaved changes: no');
    expect(await guardIsArmed(page)).toBe(false);
    const before = await listenerCalls(page);

    await save(page).click();
    await expect(status(page)).toHaveText('Error: 4 invalid fields');
    await expect(supplier(page)).toBeFocused();
    await expect(dirty(page)).toHaveText('Unsaved changes: no');
    expect(await guardIsArmed(page)).toBe(false);
    expect(await listenerCalls(page)).toEqual(before);

    await backToList(page).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Back on the list.')).toBeVisible();
  });

  test('clean valid form: Save succeeds, nothing becomes dirty, the guard stays disarmed', async ({ page }) => {
    await gotoStory(page, MANUAL, 'record:valid;footer:always');
    await save(page).click();
    await expect(status(page)).toBeEmpty();
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(dirty(page)).toHaveText('Unsaved changes: no');
    expect(await guardIsArmed(page)).toBe(false);
  });

  test('Discard changes in the middle of the flow clears the errors and disarms the guard', async ({ page }) => {
    await gotoStory(page, MANUAL);
    await makeDirty(page);
    await save(page).click();
    await expect(status(page)).toHaveText('Error: 3 invalid fields');
    expect(await guardIsArmed(page)).toBe(true);

    await footer(page).getByRole('button', { name: 'Discard changes' }).click();
    await expect(dirty(page)).toHaveText('Unsaved changes: no');
    // The footer of a clean form is hidden (its room stays); no error, no message anywhere.
    await expect(footer(page)).toHaveCount(0);
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(page.getByText('Supplier is required.')).toHaveCount(0);
    await expect(city(page)).toHaveValue('');
    expect(await guardIsArmed(page)).toBe(false);

    await backToList(page).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Back on the list.')).toBeVisible();
  });

  test('the guard dialog is open while a validation fails: it stays, the form is still dirty, staying works', async ({ page }) => {
    await gotoStory(page, MANUAL);
    await makeDirty(page);
    await backToList(page).click();
    await expect(guardDialog(page)).toBeVisible();

    // The modal makes the page inert for a user, so the Save is fired programmatically (a stand-in
    // for any other code path that calls save while the dialog is up).
    // (Located by CSS: the modal hides the page from the accessibility tree, so a role locator finds nothing.)
    await page.locator(FOOTER).getByText('Save', { exact: true }).evaluate((button) => (button as HTMLButtonElement).click());
    await expect(guardDialog(page)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    expect(await guardIsArmed(page)).toBe(true);
    await expect(page.getByText('Supplier is required.')).toBeAttached();

    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(dirty(page)).toHaveText('Unsaved changes: yes');
    await expect(status(page)).toHaveText('Error: 3 invalid fields');
    // Not left locked by the modal.
    expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
    expect(await page.evaluate(() => document.querySelectorAll('[data-aria-hidden]').length)).toBe(0);
  });

  test('restoring the original values after a failed Save makes the form clean again (baseline, not a flag)', async ({ page }) => {
    await gotoStory(page, MANUAL);
    await makeDirty(page);
    await save(page).click();
    await expect(status(page)).toHaveText('Error: 3 invalid fields');
    await city(page).fill('');
    await expect(dirty(page)).toHaveText('Unsaved changes: no');
    expect(await guardIsArmed(page)).toBe(false);
  });
});

test.describe('blocked fields (forced / locked / disabled) are validated like the others', () => {
  test.use({ viewport: { width: 1024, height: 700 } });

  test('forced: the message is on the Field and counted, the focus lands on it (read-only, focusable)', async ({ page }) => {
    await gotoStory(page, MANUAL, 'footer:always;blockedField:supplier;blockedState:forced');
    await save(page).click();
    await expect(supplier(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Supplier is required.')).toBeVisible();
    await expect(supplier(page)).toHaveAccessibleDescription(/Set by a business rule\..*Supplier is required\./);
    await expect(status(page)).toHaveText('Error: 4 invalid fields');
    await expect(supplier(page)).toBeFocused();
    await expect(supplier(page)).toHaveAttribute('readonly', '');
  });

  test('locked: the focus lands on it, but the keyboard cannot change the value (and the error stays)', async ({ page }) => {
    await gotoStory(page, MANUAL, 'footer:always;blockedField:supplier;blockedState:locked');
    await save(page).click();
    await expect(supplier(page)).toBeFocused();
    await page.keyboard.type('ACME');
    await page.keyboard.press('Backspace');
    await expect(supplier(page)).toHaveValue('');
    await expect(page.getByText('Supplier is required.')).toBeVisible();
    await expect(status(page)).toHaveText('Error: 4 invalid fields');
    await expect(dirty(page)).toHaveText('Unsaved changes: no');
  });

  test('disabled: the message is visible and counted; the focus skips to the first invalid field that can take it', async ({ page }) => {
    await gotoStory(page, MANUAL, 'footer:always;blockedField:supplier;blockedState:disabled');
    await save(page).click();
    await expect(supplier(page)).toBeDisabled();
    await expect(supplier(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Supplier is required.')).toBeVisible();
    await expect(status(page)).toHaveText('Error: 4 invalid fields');
    await expect(country(page)).toBeFocused();
  });

  test('every field disabled: all the messages show, the count says 4, nothing is focused and nothing breaks', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      // The one development message of the hook ("none of the keys ... matches a focusable element").
      if (m.type() === 'error' && !m.text().includes('useFocusFirstInvalidField')) problems.push(`console: ${m.text()}`);
    });
    await gotoStory(page, MANUAL, 'footer:always;blockedField:all;blockedState:disabled');
    await save(page).click();
    await expect(status(page)).toHaveText('Error: 4 invalid fields');
    for (const message of ['Supplier is required.', 'Choose a country.', 'Choose a category.', 'City is required.']) {
      await expect(page.getByText(message)).toBeVisible();
    }
    // The focus stayed on the Save button that was clicked: none of the four controls took it.
    await expect(save(page)).toBeFocused();
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(4);
    expect(problems).toEqual([]);
  });

  test('a forced Select and a locked Combobox with an invalid value are validated and cannot be opened', async ({ page }) => {
    await gotoStory(page, MANUAL, 'footer:always;blockedField:all;blockedState:locked');
    await save(page).click();
    await expect(status(page)).toHaveText('Error: 4 invalid fields');
    await expect(supplier(page)).toBeFocused();
    await country(page).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await category(page).click();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(country(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(category(page)).toHaveAttribute('aria-invalid', 'true');
  });
});

// Keyboard-safe focus (spec §1.10) with the visual viewport replaced by a controllable stand-in
// (same technique as e2e/object-page-footer.spec.ts): the keyboard shrinks it from the bottom.
for (const [name, viewport] of [
  ['mobile', { width: 375, height: 667 }],
  ['tablet', { width: 768, height: 1024 }],
] as const) {
  test.describe(`failed Save and the virtual keyboard (${name})`, () => {
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
        (window as unknown as KeyboardWindow).__setKeyboard = (px) => {
          keyboard = px;
          target.dispatchEvent(new Event('resize'));
        };
      });
    });

    for (const share of [0.2, 0.45]) {
      test(`the invalid field focused by Save in the last section stays above the keyboard and the footer (keyboard ${share * 100}%)`, async ({
        page,
      }) => {
        // A valid record with only the City (the last field, below a tall section) emptied.
        await gotoStory(page, MANUAL, 'record:valid');
        await city(page).fill('');
        await expect(footer(page)).toBeVisible();
        await save(page).click();
        await expect(page.getByText('City is required.')).toBeAttached();
        await expect(status(page)).toHaveText('Error: 1 invalid field');
        await expect(city(page)).toBeFocused();

        const keyboard = Math.round(viewport.height * share);
        await page.evaluate((n) => (window as unknown as KeyboardWindow).__setKeyboard(n), keyboard);
        const keyboardTop = viewport.height - keyboard;
        // The Field (control + its message), measured on the element that has the focus.
        const rects = () =>
          page.evaluate((sel) => {
            const control = document.activeElement as HTMLElement;
            const field = control.closest<HTMLElement>('[data-state]')!.getBoundingClientRect();
            const bar = document.querySelector(sel)!.getBoundingClientRect();
            return { top: field.top, bottom: field.bottom, footerTop: bar.top };
          }, FOOTER);

        await expect.poll(async () => (await rects()).bottom).toBeLessThanOrEqual(keyboardTop);
        const r = await rects();
        expect(r.top).toBeGreaterThanOrEqual(0);
        expect(r.bottom).toBeLessThanOrEqual(r.footerTop + 1);
        // The inset is published while the field has the focus, and the scroller pads its bottom with it.
        expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--rop-keyboard-inset'))).toBe(`${keyboard}px`);
        const padding = await page.locator(SCROLLER).evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
        expect(padding).toBeGreaterThanOrEqual(keyboard);
        // The inner scroller moved, not the document.
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        // The message is part of what is visible, not clipped below the keyboard.
        await expect(page.getByText('City is required.')).toBeInViewport();
      });
    }
  });
}
