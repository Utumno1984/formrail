import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { buildText, proExamples } from './helpers/pro-examples';
import { gotoStory } from './helpers/story';

// The copy-paste examples of the Pro pages (ticket #447): what the pasted code does, as a reader sees it.

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The text a screen reader gets for a node: DOM order, visually hidden text included, aria-hidden excluded. */
const readText = (locator: Locator) =>
  locator.evaluate((root) => {
    const read = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
      if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return '';
      return Array.from(node.childNodes).map(read).join('');
    };
    return read(root);
  });

const summaryItems = (page: Page, name: string) => page.getByRole('list', { name }).getByRole('listitem');

test.describe('Pro/ChangeSummary example', () => {
  const STORY = 'pro-changesummary--example';

  test('no entry before an edit; an edited field is listed against the saved value; back to it, gone', async ({ page }) => {
    await gotoStory(page, STORY);
    await expect(page.getByText('No unsaved changes')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Unsaved changes' })).toHaveCount(0);

    const amount = page.getByRole('textbox', { name: 'Amount' });
    await amount.fill('1350');
    await expect(summaryItems(page, 'Unsaved changes')).toHaveCount(1);
    expect(await readText(summaryItems(page, 'Unsaved changes').first())).toBe('Amount, changed, from 1200 to 1350');

    await amount.fill('1200');
    await expect(page.getByRole('list', { name: 'Unsaved changes' })).toHaveCount(0);
    await expect(page.getByText('No unsaved changes')).toBeVisible();
  });

  test('notes saved as null: typing is an addition, clearing the box is no change at all', async ({ page }) => {
    await gotoStory(page, STORY);
    const notes = page.getByRole('textbox', { name: 'Notes' });
    await notes.fill('Paid by card');
    await expect(summaryItems(page, 'Unsaved changes')).toHaveCount(1);
    expect(await readText(summaryItems(page, 'Unsaved changes').first())).toBe('Notes, added, Paid by card');
    await notes.fill('');
    await expect(page.getByRole('list', { name: 'Unsaved changes' })).toHaveCount(0);
  });

  test('Save makes the edited values the baseline (summary empty), the focus stays on Save', async ({ page }) => {
    await gotoStory(page, STORY);
    await page.getByRole('textbox', { name: 'Supplier' }).fill('Rossi Construction Ltd');
    await expect(summaryItems(page, 'Unsaved changes')).toHaveCount(1);
    const save = page.getByRole('button', { name: 'Save' });
    await save.click();
    await expect(page.getByText('No unsaved changes')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Supplier' })).toHaveValue('Rossi Construction Ltd');
    await expect(save).toBeFocused();
    // The new baseline is the saved record: going back to the old name is now a change.
    await page.getByRole('textbox', { name: 'Supplier' }).fill('Rossi Construction');
    expect(await readText(summaryItems(page, 'Unsaved changes').first())).toBe('Supplier, changed, from Rossi Construction Ltd to Rossi Construction');
  });

  test('Discard restores the saved values and empties the summary', async ({ page }) => {
    await gotoStory(page, STORY);
    await page.getByRole('textbox', { name: 'Amount' }).fill('99');
    await page.getByRole('textbox', { name: 'Notes' }).fill('x');
    await expect(summaryItems(page, 'Unsaved changes')).toHaveCount(2);
    const discard = page.getByRole('button', { name: 'Discard' });
    await discard.click();
    await expect(page.getByRole('textbox', { name: 'Amount' })).toHaveValue('1200');
    await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveValue('');
    await expect(page.getByText('No unsaved changes')).toBeVisible();
    await expect(discard).toBeFocused();
  });
});

test.describe('Pro/Floorplans/Virtual List Report example', () => {
  const STORY = 'pro-floorplans-virtual-list-report--example';
  const ROWS = 10_000;
  const PENDING = Array.from({ length: ROWS }, (_, index) => index % 3 === 0).filter(Boolean).length; // as in the example

  test('10,000 rows, only a window of them in the DOM; "Go to" scrolls to the last one', async ({ page }) => {
    await gotoStory(page, STORY);
    const table = page.getByRole('table', { name: 'Invoices' });
    await expect(table).toHaveAttribute('aria-rowcount', String(ROWS + 1));
    expect(await table.locator('tbody > tr[aria-rowindex]').count()).toBeLessThan(100);
    await expect(table.getByText('INV-10000', { exact: true })).toHaveCount(0); // not mounted

    const go = page.getByRole('button', { name: 'Go to INV-10000' });
    await go.click();
    await expect(table.getByText('INV-10000', { exact: true })).toBeVisible();
    await expect(table.locator('tbody > tr[aria-rowindex]').last()).toHaveAttribute('aria-rowindex', String(ROWS + 1));
    await expect(go).toBeFocused();
  });

  test('the status filter acts on all the rows, mounted or not', async ({ page }) => {
    await gotoStory(page, STORY);
    expect(PENDING).toBe(3334);
    await page.getByRole('radio', { name: /^To approve/ }).click();
    await expect(page.getByRole('table', { name: 'Invoices' })).toHaveAttribute('aria-rowcount', String(PENDING + 1));
    await page.getByRole('radio', { name: /^Approved/ }).click();
    await expect(page.getByRole('table', { name: 'Invoices' })).toHaveAttribute('aria-rowcount', String(ROWS - PENDING + 1));
  });

  test('shift-click selects the range between two rows', async ({ page }) => {
    await gotoStory(page, STORY);
    await page.getByRole('checkbox', { name: 'Select INV-00002' }).click();
    await page.getByRole('checkbox', { name: 'Select INV-00006' }).click({ modifiers: ['Shift'] });
    await expect(page.getByText('5 selected')).toBeVisible();
    for (const n of [2, 3, 4, 5, 6]) await expect(page.getByRole('checkbox', { name: `Select INV-0000${n}` })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Select INV-00007' })).not.toBeChecked();
  });
});

test.describe('Pro/Patterns/Form rebase example', () => {
  const STORY = 'pro-patterns-form-rebase--example';
  const field = (page: Page, name: string) => page.getByRole('textbox', { name });
  const conflictsList = (page: Page) => page.getByRole('region', { name: /^Conflicts/ }).getByRole('listitem');

  async function conflictOnAmount(page: Page) {
    await gotoStory(page, STORY);
    await field(page, 'Amount').fill('1250');
    await page.getByRole('button', { name: 'Receive the server version' }).click();
    // Untouched by the user: takes the server value, listed as applied.
    await expect(field(page, 'Supplier')).toHaveValue('Rossi Construction Ltd');
    await expect(summaryItems(page, 'Applied server changes')).toHaveCount(1);
    expect(await readText(summaryItems(page, 'Applied server changes').first())).toBe('Supplier, changed, from Rossi Construction to Rossi Construction Ltd');
    // Changed by both: keeps the user's value, listed as a conflict.
    await expect(field(page, 'Amount')).toHaveValue('1250');
    await expect(page.getByRole('heading', { level: 3, name: 'Conflicts (1)' })).toBeVisible();
    await expect(conflictsList(page)).toHaveCount(1);
    await expect(conflictsList(page).first()).toContainText('Amount: yours 1250, server 1350');
  }

  test('accepting the server value closes the conflict and moves the focus to the field it decided', async ({ page }) => {
    await conflictOnAmount(page);
    await page.getByRole('button', { name: 'Use the server value for Amount' }).click();
    await expect(field(page, 'Amount')).toHaveValue('1350');
    await expect(field(page, 'Amount')).toBeFocused();
    await expect(page.getByRole('heading', { level: 3, name: 'Conflicts (0)' })).toBeVisible();
    await expect(conflictsList(page)).toHaveCount(0);
  });

  test('keeping my value closes the conflict, leaves the typed value and focuses the field', async ({ page }) => {
    await conflictOnAmount(page);
    await page.getByRole('button', { name: 'Keep my value for Amount' }).click();
    await expect(field(page, 'Amount')).toHaveValue('1250');
    await expect(field(page, 'Amount')).toBeFocused();
    await expect(conflictsList(page)).toHaveCount(0);
  });

  test('without edits every server change is applied, with no conflict', async ({ page }) => {
    await gotoStory(page, STORY);
    await page.getByRole('button', { name: 'Receive the server version' }).click();
    await expect(field(page, 'Supplier')).toHaveValue('Rossi Construction Ltd');
    await expect(field(page, 'Amount')).toHaveValue('1350');
    await expect(summaryItems(page, 'Applied server changes')).toHaveCount(2);
    await expect(page.getByRole('heading', { level: 3, name: 'Conflicts (0)' })).toBeVisible();
  });
});

test.describe('Pro/RebaseNotice example', () => {
  const STORY = 'pro-rebasenotice--example';
  const field = (page: Page, name: string) => page.getByRole('textbox', { name });

  test('a server version over an edited Amount: Supplier updated, a conflict on Amount, the Field explained; Use server value closes it', async ({ page }) => {
    await gotoStory(page, STORY);
    await field(page, 'Amount').fill('1250');
    await page.getByRole('button', { name: 'Receive the server version' }).click();
    await expect(field(page, 'Supplier')).toHaveValue('Rossi Construction Ltd');
    await expect(field(page, 'Amount')).toHaveValue('1250');
    await expect(page.getByRole('status')).toHaveText(
      'This invoice was updated while you were editing. 1 field was updated. 1 field you edited was also changed on the server.',
    );
    await expect(page.getByRole('list', { name: 'Conflicts' }).getByRole('listitem')).toHaveText(['Amount Yours: 1250 Server: 1350 Use server value Keep mine']);
    await expect(field(page, 'Amount')).toHaveAccessibleDescription('Changed on the server too.');
    await page.getByRole('button', { name: 'Use server value for Amount' }).click();
    await expect(field(page, 'Amount')).toHaveValue('1350');
    await expect(page.getByRole('list', { name: 'Conflicts' })).toHaveCount(0);
    await expect(field(page, 'Amount')).not.toHaveAccessibleDescription('Changed on the server too.');
    // The clicked button is gone: the focus is on a live element, never on <body>.
    expect(await page.evaluate(() => document.activeElement !== document.body && document.activeElement?.isConnected)).toBe(true);
  });
});

test.describe('Pro examples on their Docs pages', () => {
  test('the stylesheet reminder names the core stylesheet, then the Pro one', async ({ page }) => {
    await page.goto('/iframe.html?id=pro-changesummary--docs&viewMode=docs');
    const reminder = page.locator('.sbdocs-content [data-styles-reminder]');
    await expect(reminder).toHaveCount(1);
    await expect(reminder.locator('code')).toHaveText(["import '@formrail/core/styles.css';", "import '@formrail/pro/styles.css';"]);
  });

  // The served build is the complete one (playwright.config.ts builds it into storybook-static/): it carries
  // the text of every Pro example. The Free build and the Pro demo are checked in e2e/site/pro-examples.spec.ts.
  test('the complete build carries the text of every Pro example', () => {
    const dir = resolve(REPO_ROOT, 'storybook-static');
    expect(existsSync(dir), 'storybook-static/ not built').toBe(true);
    const text = buildText(dir);
    const examples = proExamples(REPO_ROOT);
    expect(examples.map((example) => example.file).sort()).toEqual([
      'packages/pro/src/change-summary/ChangeSummary.example.tsx',
      'packages/pro/src/form-rebase/FormRebase.example.tsx',
      'packages/pro/src/form-rebase/RebaseNotice.example.tsx',
      'packages/pro/src/list-report/VirtualListReport.example.tsx',
    ]);
    for (const { file, marker } of examples) expect(text.includes(marker), file).toBe(true);
  });
});
