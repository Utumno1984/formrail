import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeDemoInvoices } from '../packages/core/src/internal/demo-invoices';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `floorplans-list-report--${name}`;
const TABLE_STORY = 'data-listreporttable--selection';

// The scenario of the story: the first open invoice and the first two that are not open.
const ROWS = makeDemoInvoices(200);
const FIRST_OPEN = ROWS.find((r) => r.status === 'pending')!;
const SCENARIO = [FIRST_OPEN, ...ROWS.filter((r) => r.status !== 'pending').slice(0, 2)];

const table = (page: Page): Locator => page.getByRole('table', { name: 'Invoices' });
const scroller = (page: Page): Locator => table(page).locator('..');
const bar = (page: Page): Locator => page.getByRole('group', { name: 'Selection Invoices' });
const allBox = (page: Page): Locator => page.getByRole('checkbox', { name: 'Select all results' });
const rowBox = (page: Page, number: string): Locator => page.getByRole('checkbox', { name: `Select ${number}` });
const pill = (page: Page, name: string): Locator => page.getByRole('radio', { name });
const clearSelection = (page: Page): Locator => page.getByRole('button', { name: 'Clear selection' });

type Box = { x: number; y: number; width: number; height: number };
async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('no bounding box');
  return b;
}
const close = (a: number, b: number, what: string): void => expect(Math.abs(a - b), `${what}: ${a} vs ${b}`).toBeLessThanOrEqual(1);
function sameBox(a: Box, b: Box, what: string): void {
  close(a.x, b.x, `${what} x`);
  close(a.y, b.y, `${what} y`);
  close(a.width, b.width, `${what} width`);
  close(a.height, b.height, `${what} height`);
}

const indeterminate = (l: Locator): Promise<boolean> => l.evaluate((el) => (el as HTMLInputElement).indeterminate);
const isFocused = (l: Locator): Promise<boolean> => l.evaluate((el) => el === document.activeElement);

/** Presses `key` until `target` has the focus. */
async function tabTo(page: Page, target: Locator, key: 'Tab' | 'Shift+Tab' = 'Tab', max = 40): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press(key);
    if (await isFocused(target)) return;
  }
  throw new Error(`tabTo: not reached in ${max} presses`);
}

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 667 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`List Report selection (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const name of ['selection', 'selection-delete-recipe', 'selection-none', 'selection-some', 'selection-all', 'selection-hidden-by-filter']) {
      test(`${name}: the play function passes`, async ({ page }) => {
        await expectPlayToPass(page, STORY(name));
      });
    }

    test('ListReportTable selection: the play function passes', async ({ page }) => {
      await expectPlayToPass(page, TABLE_STORY);
    });

    test('mouse tour of the smoke test: the bar and the table never move', async ({ page }) => {
      await gotoStory(page, STORY('selection-no-play'));
      await expect(bar(page)).toHaveText(/No items selected/);
      await expect(clearSelection(page)).toBeHidden();
      const bar0 = await box(bar(page));
      const table0 = await box(scroller(page));

      for (const row of SCENARIO) await rowBox(page, row.number).click();
      await expect(bar(page)).toContainText('3 selected');
      await expect(clearSelection(page)).toBeVisible();
      sameBox(await box(bar(page)), bar0, 'bar at 3 selected');
      sameBox(await box(scroller(page)), table0, 'table at 3 selected');
      for (const row of SCENARIO) await expect(rowBox(page, row.number).locator('xpath=ancestor::tr')).toHaveAttribute('data-selected', '');

      await pill(page, 'Open').click();
      await expect(bar(page)).toContainText('1 selected (2 hidden by filters)');
      expect(await indeterminate(allBox(page))).toBe(true);
      // A native checkbox exposes "mixed" through its indeterminate property (no aria-checked needed).
      await expect(allBox(page)).toBeChecked({ indeterminate: true });
      await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();
      sameBox(await box(bar(page)), bar0, 'bar with hidden ids');

      await pill(page, 'All').click();
      for (const row of SCENARIO) await expect(rowBox(page, row.number)).toBeChecked();
      await allBox(page).click();
      await expect(allBox(page)).toBeChecked();
      await expect(bar(page)).toContainText('200 selected');
      sameBox(await box(bar(page)), bar0, 'bar at 200 selected');
      sameBox(await box(scroller(page)), table0, 'table at 200 selected');
      await allBox(page).click();
      await expect(allBox(page)).not.toBeChecked();
      await expect(bar(page)).toContainText('No items selected');
      // The table scrolls inside its own container; the bar and the page never overflow.
      await expectNoHorizontalOverflow(bar(page));
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });

    test('keyboard only: Tab/Space on the rows, Enter on "Clear selection", focus on the header checkbox', async ({ page }) => {
      await gotoStory(page, STORY('selection-no-play'));
      const first = rowBox(page, ROWS[0]!.number);
      const second = rowBox(page, ROWS[1]!.number);
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      await tabTo(page, first);
      await page.keyboard.press('Space');
      await expect(first).toBeChecked();
      // The next tab stops: a truncated cell can be one (its tooltip opens on focus), then the next row's box.
      await tabTo(page, second, 'Tab', 6);
      await page.keyboard.press('Space');
      await expect(second).toBeChecked();
      await expect(bar(page)).toContainText('2 selected');

      await tabTo(page, clearSelection(page), 'Shift+Tab');
      await page.keyboard.press('Enter');
      await expect(bar(page)).toContainText('No items selected');
      expect(await isFocused(allBox(page))).toBe(true);
      await expect(first).not.toBeChecked();
      // The focus ring of the header checkbox is visible (not clipped by the sticky header cell).
      const ring = await allBox(page).evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(ring).toBe('solid');
    });

    test('the checkbox column: centred boxes, aligned header and body, same place in every state', async ({ page }) => {
      await expectPlayToPass(page, TABLE_STORY);
      const th = page.locator('th[data-rop-select]');
      const thBox = await box(th);
      const headerBox = await box(allBox(page));
      // Square column (as wide as a row is tall) and the box centred in it.
      const firstCell = table(page).locator('tbody tr').first().locator('td').first();
      const cellBox = await box(firstCell);
      const bodyBox = await box(rowBox(page, 'F-0001'));
      close(thBox.width, cellBox.width, 'column width');
      close(headerBox.x + headerBox.width / 2, thBox.x + thBox.width / 2, 'header box centred horizontally');
      close(headerBox.y + headerBox.height / 2, thBox.y + thBox.height / 2, 'header box centred vertically');
      close(bodyBox.x + bodyBox.width / 2, cellBox.x + cellBox.width / 2, 'row box centred horizontally');
      close(bodyBox.y + bodyBox.height / 2, cellBox.y + cellBox.height / 2, 'row box centred vertically');
      close(headerBox.x, bodyBox.x, 'header and body boxes aligned');

      const tableBox = await box(table(page));
      for (const args of ['status:loading;dataset:empty', 'dataset:empty', 'dataset:noResults', 'status:error']) {
        await expectPlayToPass(page, TABLE_STORY, args);
        sameBox(await box(page.locator('th[data-rop-select]')), thBox, `header cell (${args})`);
        // Same columns (the height follows the rows: 12 with data, the minimum body otherwise).
        const t = await box(table(page));
        close(t.x, tableBox.x, `table x (${args})`);
        close(t.width, tableBox.width, `table width (${args})`);
        await expect(page.locator('th[data-rop-select]').locator('..').locator('th')).toHaveCount(5);
      }
      // With no results the header checkbox is disabled; while loading the skeleton has no checkbox.
      await expectPlayToPass(page, TABLE_STORY, 'dataset:noResults');
      await expect(allBox(page)).toBeDisabled();
      await expectPlayToPass(page, TABLE_STORY, 'status:loading;dataset:empty');
      await expect(page.locator('tr[data-rop-skeleton] input')).toHaveCount(0);
    });

    test('selected rows are tinted, the hover stays distinguishable', async ({ page }) => {
      await gotoStory(page, STORY('selection-no-play'), 'preselected:some');
      const bg = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
      const selectedRow = rowBox(page, SCENARIO[0]!.number).locator('xpath=ancestor::tr');
      const plainRow = table(page).locator('tbody tr:not([data-selected]):not([aria-hidden])').first();
      await page.mouse.move(0, 0);
      const selected = await bg(selectedRow);
      const plain = await bg(plainRow);
      expect(selected).not.toBe(plain);
      if (vp.name === 'desktop') {
        // Hover is for a precise pointer only (rop-hover): checked on desktop.
        await selectedRow.locator('td').nth(2).hover();
        expect(await bg(selectedRow)).not.toBe(selected);
        await plainRow.locator('td').nth(2).hover();
        const plainHover = await bg(plainRow);
        expect(plainHover).not.toBe(plain);
        expect(plainHover).not.toBe(selected);
      }
    });

    test('forced colours: the checkbox still carries the state', async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active' });
      await gotoStory(page, STORY('selection-no-play'), 'preselected:some');
      const checked = rowBox(page, SCENARIO[0]!.number);
      const unchecked = rowBox(page, ROWS.find((r) => !SCENARIO.includes(r))!.number);
      const fill = (l: Locator) => l.evaluate((el) => getComputedStyle(el).backgroundColor);
      const rowBg = await checked.locator('xpath=ancestor::tr').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(await fill(checked)).not.toBe(await fill(unchecked));
      expect(await fill(checked)).not.toBe(rowBg);
      // The tick is drawn and visible over the row.
      await expect(checked.locator('xpath=following-sibling::*[1]')).toBeVisible();
    });

    for (const [name, args] of [
      ['0 selected', ''],
      ['some selected', 'preselected:some'],
      ['all selected', 'preselected:all'],
    ] as const) {
      test(`no axe violations with ${name}`, async ({ page }) => {
        await gotoStory(page, STORY('selection-no-play'), args || undefined);
        await expectNoA11yViolations(page);
      });
    }

    test('no axe violations with ids hidden by a pill, and for the table alone', async ({ page }) => {
      await expectPlayToPass(page, STORY('selection-hidden-by-filter'));
      await expectNoA11yViolations(page);
      await expectPlayToPass(page, TABLE_STORY);
      await expectNoA11yViolations(page);
    });
  });
}

test('without selectable the stories have no checkbox and no selection bar', async ({ page }) => {
  await gotoStory(page, STORY('selection-no-play'), 'selectable:!false');
  await expect(table(page)).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('[data-rop-selection-bar]')).toHaveCount(0);
  await expect(table(page).locator('tbody tr[data-selected]')).toHaveCount(0);
});
