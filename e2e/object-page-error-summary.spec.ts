import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

// The validation summary in the footer (`getErrorSummary`, #103), driven with real input.
const STORY = (name: string) => `floorplans-object-page-footer--${name}`;
// Same story as `error-summary`, without a play function: the tests type and click themselves.
const MANUAL = STORY('error-summary-manual');
const FOOTER = '[data-object-page-footer]';

type KeyboardWindow = { __setKeyboard: (px: number) => void };

const footer = (page: Page) => page.getByRole('region', { name: 'Save actions' });
const status = (page: Page) => footer(page).getByRole('status');
const save = (page: Page) => footer(page).getByRole('button', { name: 'Save' });
const footerHeight = (page: Page) => page.locator(FOOTER).evaluate((el) => el.getBoundingClientRect().height);
const noteInput = (page: Page) => page.getByRole('textbox', { name: 'Note' });

/** Updates the args of the current story the way the Controls panel does (no remount). */
const setArgs = (page: Page, updatedArgs: Record<string, unknown>) =>
  page.evaluate((args) => {
    const w = window as unknown as {
      __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void };
      __STORYBOOK_PREVIEW__: { currentRender: { id: string } };
    };
    w.__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', { storyId: w.__STORYBOOK_PREVIEW__.currentRender.id, updatedArgs: args });
  }, updatedArgs);

test.describe('getErrorSummary in ObjectPageFooter: stories', () => {
  for (const name of ['form-flow', 'error-summary', 'save-error-over-summary']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('getErrorSummary in ObjectPageFooter: behavior in a real browser', () => {
  test.use({ viewport: { width: 1024, height: 700 } });

  test('Save on an empty form: the count in the status region, focus on the first field, same footer height; corrections lower the count', async ({
    page,
  }) => {
    await gotoStory(page, MANUAL);
    const region = status(page);
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(region).toBeEmpty();
    const height = await footerHeight(page);
    const node = await region.elementHandle();

    await save(page).click();
    await expect(region).toHaveText('Error: 3 invalid fields');
    // The region that was already mounted holds the text (a live region inserted already filled is
    // not announced reliably).
    expect(await node!.evaluate((el, now) => el === now, await region.elementHandle())).toBe(true);
    await expect(page.getByLabel('Supplier')).toBeFocused();
    // Only the count in the footer: the field messages stay on the fields.
    await expect(footer(page)).not.toContainText('is required');
    await expect(page.getByText('Supplier is required.')).toBeVisible();
    expect(await footerHeight(page)).toBe(height);

    // Per-field clearing (#102): typing in one field removes its error only, the focus stays there.
    await page.keyboard.type('ACME Ltd');
    await expect(region).toHaveText('Error: 2 invalid fields');
    await expect(page.getByLabel('Supplier')).toBeFocused();
    await page.getByLabel('VAT number').fill('GB123456789');
    await expect(region).toHaveText('Error: 1 invalid field');
    await page.getByLabel('Email').fill('billing@acme.example');
    await expect(region).toBeEmpty();
    expect(await footerHeight(page)).toBe(height);

    await save(page).click();
    await expect(region).toBeEmpty();
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    expect(await footerHeight(page)).toBe(height);
  });

  test('zero errors: Save leaves the status region empty and the footer height unchanged', async ({ page }) => {
    await gotoStory(page, MANUAL, 'requiredFields:1');
    const height = await footerHeight(page);
    await page.getByLabel('Supplier').fill('ACME Ltd');
    await save(page).click();
    await expect(status(page)).toBeEmpty();
    expect(await footerHeight(page)).toBe(height);
  });

  test('the requiredFields control changes the count (5 fields across two sections)', async ({ page }) => {
    await gotoStory(page, MANUAL, 'requiredFields:5');
    await save(page).click();
    await expect(status(page)).toHaveText('Error: 5 invalid fields');
    await expect(page.getByLabel('Supplier')).toBeFocused();
  });

  test('both texts empty: the library default (Italian), singular and plural', async ({ page }) => {
    await gotoStory(page, MANUAL, 'summaryOne:;summaryOther:;requiredFields:2');
    await save(page).click();
    await expect(status(page)).toHaveText('Error: 2 campi non validi');
    await page.keyboard.type('ACME Ltd');
    await expect(status(page)).toHaveText('Error: 1 campo non valido');
  });

  test('a custom text from the controls replaces the default', async ({ page }) => {
    await gotoStory(page, MANUAL);
    // Through the controls channel, as the Controls panel does: `{` is not allowed in URL args.
    await setArgs(page, { summaryOne: 'One field to fix', summaryOther: 'Fix {count} fields' });
    await save(page).click();
    await expect(status(page)).toHaveText('Error: Fix 3 fields');
    await page.keyboard.type('ACME Ltd');
    await page.getByLabel('VAT number').fill('GB1');
    await expect(status(page)).toHaveText('Error: One field to fix');
  });

  test('the save error wins over the summary; after an edit the count comes back on the next failed Save', async ({ page }) => {
    await gotoStory(page, STORY('save-error-over-summary-manual'));
    // A save error with no field error: the footer shows the server's text (smoke test 2).
    await page.getByLabel('Supplier').fill('fail');
    await save(page).click();
    await expect(status(page)).toHaveText('Error: The server rejected the save.');

    // The rules tighten with no edit: Save fails validation, the earlier save error is still there
    // and keeps the footer; the note shows its own message and gets the focus.
    await page.getByRole('checkbox', { name: /Require a note/ }).check();
    await save(page).click();
    await expect(page.getByText('Note is required.')).toBeVisible();
    await expect(noteInput(page)).toBeFocused();
    await expect(status(page)).toHaveText('Error: The server rejected the save.');

    // An edit clears the save error; the next failed Save announces the count.
    await page.keyboard.type('x');
    await expect(status(page)).toBeEmpty();
    await noteInput(page).fill('');
    await save(page).click();
    await expect(status(page)).toHaveText('Error: 1 invalid field');
    await expect(noteInput(page)).toBeFocused();
  });

  test('axe: the summary in the footer and the invalid fields', async ({ page }) => {
    await gotoStory(page, MANUAL);
    await save(page).click();
    await expect(status(page)).toHaveText('Error: 3 invalid fields');
    await expectNoA11yViolations(page);
  });
});

// Spec §1.10: the focus that a failed Save moves to an invalid field lands above the virtual keyboard
// and above the footer (visual viewport replaced by a controllable stand-in, as in
// e2e/object-page-footer.spec.ts).
for (const [name, viewport] of [
  ['mobile', { width: 375, height: 667 }],
  ['tablet', { width: 768, height: 1024 }],
] as const) {
  test.describe(`getErrorSummary and the virtual keyboard (${name})`, () => {
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

    test('the last invalid field gets the focus above the keyboard and the footer; the summary is shown', async ({ page }) => {
      await gotoStory(page, MANUAL, 'requiredFields:5');
      for (const [label, value] of [
        ['Supplier', 'ACME Ltd'],
        ['VAT number', 'GB123456789'],
        ['Email', 'billing@acme.example'],
        ['City', 'Leeds'],
      ] as const) {
        await page.getByLabel(label).fill(value);
      }
      await save(page).click();
      await expect(status(page)).toHaveText('Error: 1 invalid field');
      const input = page.getByLabel('Postal code');
      await expect(input).toBeFocused();

      const keyboard = Math.round(viewport.height * 0.45);
      await page.evaluate((n) => (window as unknown as KeyboardWindow).__setKeyboard(n), keyboard);
      const rects = () =>
        page.evaluate((sel) => {
          const field = document.activeElement!.getBoundingClientRect();
          const bar = document.querySelector(sel)!.getBoundingClientRect();
          return { fieldTop: field.top, fieldBottom: field.bottom, footerTop: bar.top };
        }, FOOTER);
      const keyboardTop = viewport.height - keyboard;
      await expect.poll(async () => (await rects()).fieldBottom).toBeLessThanOrEqual(keyboardTop);
      const r = await rects();
      expect(r.fieldTop).toBeGreaterThanOrEqual(0);
      expect(r.fieldBottom).toBeLessThanOrEqual(r.footerTop + 1);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  });
}
