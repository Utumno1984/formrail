import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { gotoStory } from './helpers/story';

// #378: Showcase/Invoices -> line items of the invoice page. inv-1 has 1 line, inv-2 2, inv-3 3, inv-4 4.
const FIXTURE = 'showcase-invoices--manual';
const LIST_TO_RECORD = 'showcase-invoices--list-to-record-manual';
const CRUD = 'showcase-invoices--crud-manual';
const NO_DELAY = 'loadDelayMs:0;saveDelayMs:0';

const bar = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const btn = (page: Page, name: string): Locator => page.getByRole('button', { name, exact: true });
const field = (page: Page, name: string): Locator => page.getByRole('textbox', { name, exact: true });
const descriptions = (page: Page): Promise<string[]> =>
  page.getByRole('textbox', { name: /^Line \d+ description$/ }).evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
const storedLines = (page: Page, id: string): Promise<unknown> =>
  page.evaluate(
    (i) =>
      (
        window as unknown as { __ropShowcaseStore?: { snapshot: () => { id: string; lineItems: unknown }[] } }
      ).__ropShowcaseStore
        ?.snapshot()
        .find((r) => r.id === i)?.lineItems,
    id,
  );

async function open(page: Page, recordId = 'inv-3'): Promise<void> {
  await gotoStory(page, FIXTURE, `recordId:${recordId};${NO_DELAY}`);
  await expect(field(page, 'Line 1 description')).toBeVisible();
}

test.describe('Showcase/Invoices: line items', () => {
  test('the section lists the lines with a read-only total and appears in the Anchor Bar', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByText('Line items', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Line items' })).toBeVisible();
    expect(await descriptions(page)).toHaveLength(3);
    for (const n of [1, 2, 3]) {
      await expect(field(page, `Line ${n} quantity`)).toBeVisible();
      await expect(field(page, `Line ${n} unit price`)).toBeVisible();
      await expect(page.locator('[data-line-total]').nth(n - 1)).toHaveText(/^\d+\.\d{2}$/);
    }
    await expect(bar(page)).toBeHidden();
  });

  test('"Add line" appends an empty line, focuses its description and makes the form dirty', async ({ page }) => {
    await open(page);
    await btn(page, 'Add line').click();
    await expect(field(page, 'Line 4 description')).toBeFocused();
    await expect(field(page, 'Line 4 description')).toHaveValue('');
    await expect(bar(page)).toBeVisible();
  });

  test('"Remove line N" moves the focus to the next line, else the previous one, else "Add line"; never <body>', async ({ page }) => {
    await open(page);
    await btn(page, 'Remove line 1').click();
    expect(await descriptions(page)).toHaveLength(2);
    await expect(btn(page, 'Remove line 1')).toBeFocused();
    await btn(page, 'Remove line 2').click();
    await expect(btn(page, 'Remove line 1')).toBeFocused();
    await btn(page, 'Remove line 1').click();
    await expect(page.getByText('No line items')).toBeVisible();
    await expect(btn(page, 'Add line')).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });

  test('"Move line N up/down" swaps with the neighbour; the focus stays on the same button of the same line', async ({ page }) => {
    await open(page);
    const [a, b, c] = await descriptions(page);
    await btn(page, 'Move line 3 up').click();
    expect(await descriptions(page)).toEqual([a, c, b]);
    await expect(btn(page, 'Move line 2 up')).toBeFocused();
    await btn(page, 'Move line 1 down').click();
    expect(await descriptions(page)).toEqual([c, a, b]);
    await expect(btn(page, 'Move line 2 down')).toBeFocused();
  });

  test('the buttons at the boundaries are aria-disabled and do nothing', async ({ page }) => {
    await open(page);
    const before = await descriptions(page);
    await expect(btn(page, 'Move line 1 up')).toHaveAttribute('aria-disabled', 'true');
    await expect(btn(page, 'Move line 3 down')).toHaveAttribute('aria-disabled', 'true');
    await btn(page, 'Move line 1 up').click();
    await btn(page, 'Move line 3 down').click();
    expect(await descriptions(page)).toEqual(before);
    await expect(bar(page)).toBeHidden();
  });

  test('reordering then restoring the order makes the form clean again; with the keyboard too', async ({ page }) => {
    await open(page);
    await btn(page, 'Move line 3 up').click();
    await expect(bar(page)).toBeVisible();
    await btn(page, 'Move line 2 down').focus();
    await page.keyboard.press('Enter');
    await expect(bar(page)).toBeHidden();
    await expect(btn(page, 'Move line 2 down')).toBeFocused();
  });

  test('every repeated button has its own accessible name', async ({ page }) => {
    await open(page, 'inv-4');
    const names = await page.getByRole('button', { name: /^(Remove|Move) line \d/ }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(12);
    const labels = await page.getByRole('textbox', { name: /^Line \d/ }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-labelledby')));
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('Save with an empty description and a quantity of 0 shows the errors, the summary and focuses the first invalid field', async ({ page }) => {
    await open(page);
    const before = await storedLines(page, 'inv-3');
    await field(page, 'Line 2 description').fill('');
    await field(page, 'Line 3 quantity').fill('0');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(field(page, 'Line 2 description')).toBeFocused();
    await expect(field(page, 'Line 2 description')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'Line 3 quantity')).toHaveAttribute('aria-invalid', 'true');
    await expect(bar(page).getByText('2 invalid fields')).toBeVisible();
    expect(await storedLines(page, 'inv-3')).toEqual(before);
  });

  test('removing a line with an error leaves no orphan error; the next Save puts the error on the right field', async ({ page }) => {
    await open(page);
    await field(page, 'Line 1 description').fill('');
    await field(page, 'Line 3 quantity').fill('0');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page).getByText('2 invalid fields')).toBeVisible();
    await btn(page, 'Remove line 1').click();
    await expect(bar(page).getByText(/invalid field/)).toHaveCount(0);
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page).getByText('1 invalid field')).toBeVisible();
    await expect(field(page, 'Line 2 quantity')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'Line 2 quantity')).toBeFocused();
  });

  test('a valid Save stores the lines in the visible order with numeric values, and the form is clean', async ({ page }) => {
    await open(page);
    await btn(page, 'Move line 3 up').click();
    await btn(page, 'Add line').click();
    await field(page, 'Line 4 description').fill('Consulting');
    await field(page, 'Line 4 quantity').fill('2');
    await field(page, 'Line 4 unit price').fill('150');
    await expect(page.locator('[data-line-total]').nth(3)).toHaveText('300.00');
    const visible = await descriptions(page);
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    const lines = (await storedLines(page, 'inv-3')) as { id: string; description: string; quantity: number; unitPrice: number }[];
    expect(lines.map((l) => l.description)).toEqual(visible);
    expect(lines[3]).toEqual({ id: 'new-1', description: 'Consulting', quantity: 2, unitPrice: 150 });
    expect(typeof lines[0]!.quantity).toBe('number');
    await expect(field(page, 'Line 4 unit price')).toHaveValue('150.00');
  });

  test('Discard restores the lines, the order and the values (added lines gone, removed lines back)', async ({ page }) => {
    await open(page);
    const before = await descriptions(page);
    await btn(page, 'Remove line 1').click();
    await btn(page, 'Move line 2 up').click();
    await btn(page, 'Add line').click();
    await field(page, 'Line 3 description').fill('Temporary');
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(bar(page)).toBeHidden();
    expect(await descriptions(page)).toEqual(before);
  });

  test('a unit price retyped with the same number is not a change', async ({ page }) => {
    await open(page);
    const price = field(page, 'Line 1 unit price');
    const original = await price.inputValue();
    await price.fill(String(Number(original)));
    await expect(bar(page)).toBeHidden();
  });

  test('an invoice without lines shows "No line items" and a stable footprint when the first line is added', async ({ page }) => {
    await open(page, 'inv-1');
    await btn(page, 'Remove line 1').click();
    await expect(page.getByText('No line items')).toBeVisible();
    await expect(bar(page)).toBeVisible();
    const scroller = page.locator('[data-object-page-scroller]');
    const barTop = (await bar(page).boundingBox())!.y;
    await btn(page, 'Add line').click();
    await expect(field(page, 'Line 1 description')).toBeFocused();
    expect((await bar(page).boundingBox())!.y).toBe(barTop);
    await expect(scroller).toBeVisible();
  });

  test('after add, remove, add the ids are never repeated', async ({ page }) => {
    await open(page, 'inv-1');
    await btn(page, 'Add line').click();
    await btn(page, 'Remove line 2').click();
    await btn(page, 'Add line').click();
    await field(page, 'Line 2 description').fill('Second');
    await field(page, 'Line 2 quantity').fill('1');
    await field(page, 'Line 2 unit price').fill('5');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    const lines = (await storedLines(page, 'inv-1')) as { id: string }[];
    expect(lines.map((l) => l.id)).toEqual(['li-1-1', 'new-2']);
  });

  test('the detail page with lines has no accessibility violation, dirty and with errors too', async ({ page }) => {
    await open(page, 'inv-4');
    await expectNoA11yViolations(page);
    await btn(page, 'Add line').click();
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('the Save of a record in flight keeps the rules of the scalar fields: edits made meanwhile stay dirty', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'recordId:inv-3;loadDelayMs:0;saveDelayMs:1500');
    await expect(field(page, 'Line 1 description')).toBeVisible();
    await field(page, 'Line 1 description').fill('Edited');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await field(page, 'Line 2 description').fill('Edited while saving');
    await expect(bar(page).getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    await expect(field(page, 'Line 1 description')).toHaveValue('Edited');
    await expect(bar(page).getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-disabled', 'true', { timeout: 5000 });
    await expect(bar(page)).toBeVisible();
    await expect(field(page, 'Line 2 description')).toHaveValue('Edited while saving');
  });
});

test.describe('Showcase/Invoices: line items, flows', () => {
  test('dirty-guard: after only reordering, "Back to list" asks for confirmation', async ({ page }) => {
    await gotoStory(page, LIST_TO_RECORD, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0');
    await page.getByRole('link').first().click();
    await expect(field(page, 'Line 1 description')).toBeVisible();
    // The first invoice has one line: add one to have something to move, then restore the clean state first.
    await btn(page, 'Add line').click();
    await field(page, 'Line 2 description').fill('x');
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(bar(page)).toBeHidden();
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    // Another invoice with several lines: reorder only.
    await page.getByRole('link').nth(2).click();
    await expect(field(page, 'Line 3 description')).toBeVisible();
    await btn(page, 'Move line 3 up').click();
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  });

  test('creation: a new invoice starts without lines and Create works without any', async ({ page }) => {
    await gotoStory(page, CRUD, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0');
    await page.getByRole('button', { name: 'New invoice' }).click();
    await expect(page.getByText('No line items')).toBeVisible();
    await expect(btn(page, 'Add line')).toBeVisible();
    await page.getByRole('combobox', { name: /Supplier/ }).click();
    await page.getByRole('option', { name: 'Bianchi Supplies' }).click();
    await page.getByRole('textbox', { name: /Amount/ }).fill('10');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    const created = await page.evaluate(
      () =>
        (
          window as unknown as { __ropShowcaseStore?: { snapshot: () => { id: string; lineItems: unknown[] }[] } }
        ).__ropShowcaseStore
          ?.snapshot()
          .at(-1)?.lineItems,
    );
    expect(created).toEqual([]);
  });
});

test.describe('Showcase/Invoices: line items, small viewports', () => {
  for (const [name, viewport] of [
    ['mobile', { width: 375, height: 667 }],
    ['tablet', { width: 768, height: 1024 }],
  ] as const) {
    test.describe(name, () => {
      test.use({ viewport, hasTouch: true });

      test.beforeEach(async ({ page }) => {
        // Same stand-in for the visual viewport as e2e/showcase-visual.spec.ts.
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

      test('four lines do not overflow horizontally', async ({ page }) => {
        await open(page, 'inv-4');
        await expectNoHorizontalOverflow(page.locator('#storybook-root'));
        const row = page.getByRole('listitem').filter({ has: field(page, 'Line 4 quantity') });
        const box = await row.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      });

      test('the quantity of the last line stays above the keyboard and is not covered by the save bar', async ({ page }) => {
        await open(page, 'inv-4');
        const quantity = field(page, 'Line 4 quantity');
        await quantity.fill('7');
        await expect(bar(page)).toBeVisible();
        await quantity.scrollIntoViewIfNeeded();
        const keyboard = Math.round(viewport.height * 0.45);
        const rect = (loc: Locator) => loc.evaluate((el) => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
        await quantity.focus();
        await page.evaluate((px) => (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard(px), keyboard);
        await expect.poll(async () => (await rect(quantity)).bottom).toBeLessThanOrEqual(viewport.height - keyboard);
        expect((await rect(quantity)).top).toBeGreaterThanOrEqual(0);
        const f = await rect(quantity);
        const b = await rect(bar(page));
        expect(f.bottom <= b.top + 1 || f.top >= b.bottom - 1).toBe(true);
        await expect(quantity).toBeFocused();
      });
    });
  }
});
