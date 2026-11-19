import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { gotoStory } from './helpers/story';

// #525 (migration of e2e/showcase-line-items.spec.ts from Showcase/Invoices to the sales orders): the lines of the order
// page. The invoice's "description" is the line's product (a Select); "unit price" is "Line n unit price (EUR)". Fixtures:
// so-30 has 1 line, so-25 has 3, so-14 has 4 (all EUR, none cancelled). The invoice with no line at all becomes an order
// whose last line was removed (an order needs at least one line to be saved).
const FIXTURE = 'showcase-record-editing--sales-order-record-page-manual';
const LIST_TO_RECORD = 'showcase-record-editing--sales-order-list-to-record-manual';
const CRUD = 'showcase-record-editing--sales-order-crud-manual';
const NO_DELAY = 'loadDelayMs:0;saveDelayMs:0';
const ONE = 'so-30';
const THREE = 'so-25';
const FOUR = 'so-14';

const bar = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const btn = (page: Page, name: string): Locator => page.getByRole('button', { name, exact: true });
const field = (page: Page, name: string): Locator => page.getByRole('textbox', { name, exact: true });
const product = (page: Page, n: number): Locator => page.getByRole('combobox', { name: `Line ${n} product` });
const products = (page: Page): Promise<string[]> =>
  page.getByRole('combobox', { name: /^Line \d+ product$/ }).evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
const price = (page: Page, n: number): Locator => field(page, `Line ${n} unit price (EUR)`);
const storedLines = (page: Page, id: string): Promise<unknown> =>
  page.evaluate(
    (i) =>
      (
        window as unknown as { __ropShowcaseStore?: { snapshot: () => { id: string; lines: unknown }[] } }
      ).__ropShowcaseStore
        ?.snapshot()
        .find((r) => r.id === i)?.lines,
    id,
  );

async function open(page: Page, recordId = THREE, delays = NO_DELAY): Promise<void> {
  await gotoStory(page, FIXTURE, `recordId:${recordId};${delays}`);
  await expect(product(page, 1)).toBeVisible();
}

test.describe('Showcase/Record editing, orders: lines (migrated from Showcase/Invoices line items)', () => {
  test('the section lists the lines with a read-only total and appears in the Anchor Bar', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByText('Lines', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lines', exact: true })).toBeVisible();
    expect(await products(page)).toHaveLength(3);
    for (const n of [1, 2, 3]) {
      await expect(field(page, `Line ${n} quantity`)).toBeVisible();
      await expect(price(page, n)).toBeVisible();
      await expect(page.locator('[data-line-total]').nth(n - 1)).toHaveText(/^€[\d,]+\.\d{2}$/);
    }
    await expect(bar(page)).toBeHidden();
  });

  test('"Add line" appends an empty line, focuses its product and makes the form dirty', async ({ page }) => {
    await open(page);
    await btn(page, 'Add line').click();
    await expect(product(page, 4)).toBeFocused();
    await expect(field(page, 'Line 4 quantity')).toHaveValue('1');
    await expect(price(page, 4)).toHaveValue('');
    await expect(bar(page)).toBeVisible();
  });

  test('"Remove line N" moves the focus to the next line, else the previous one, else "Add line"; never <body>', async ({ page }) => {
    await open(page);
    await btn(page, 'Remove line 1').click();
    expect(await products(page)).toHaveLength(2);
    await expect(btn(page, 'Remove line 1')).toBeFocused();
    await btn(page, 'Remove line 2').click();
    await expect(btn(page, 'Remove line 1')).toBeFocused();
    await btn(page, 'Remove line 1').click();
    await expect(page.getByText('No lines', { exact: true })).toBeVisible();
    await expect(btn(page, 'Add line')).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });

  test('"Move line N up/down" swaps with the neighbour; the focus stays on the same button of the same line', async ({ page }) => {
    await open(page);
    const [a, b, c] = await products(page);
    expect(new Set([a, b, c]).size).toBe(3);
    await btn(page, 'Move line 3 up').click();
    expect(await products(page)).toEqual([a, c, b]);
    await expect(btn(page, 'Move line 2 up')).toBeFocused();
    await btn(page, 'Move line 1 down').click();
    expect(await products(page)).toEqual([c, a, b]);
    await expect(btn(page, 'Move line 2 down')).toBeFocused();
  });

  test('the buttons at the boundaries are aria-disabled and do nothing', async ({ page }) => {
    await open(page);
    const before = await products(page);
    await expect(btn(page, 'Move line 1 up')).toHaveAttribute('aria-disabled', 'true');
    await expect(btn(page, 'Move line 3 down')).toHaveAttribute('aria-disabled', 'true');
    // Playwright treats `aria-disabled` as not actionable: the click is forced to reach the handler.
    await btn(page, 'Move line 1 up').click({ force: true });
    await btn(page, 'Move line 3 down').click({ force: true });
    expect(await products(page)).toEqual(before);
    await expect(bar(page)).toBeHidden();
  });

  test('reordering then restoring the order makes the form clean again; with the keyboard too', async ({ page }) => {
    await open(page);
    await btn(page, 'Move line 3 up').click();
    await expect(bar(page)).toBeVisible();
    await btn(page, 'Move line 2 down').focus();
    await page.keyboard.press('Enter');
    await expect(bar(page)).toBeHidden();
    // The line moved back to position 3: its "down" button is now the (aria-disabled) last one.
    await expect(btn(page, 'Move line 3 down')).toBeFocused();
  });

  test('every repeated button has its own accessible name', async ({ page }) => {
    await open(page, FOUR);
    const names = await page
      .getByRole('button', { name: /^(Remove|Move) line \d/ })
      .evaluateAll((els) => els.map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()));
    expect(names).toHaveLength(12);
    expect(new Set(names).size).toBe(12);
    const labels = await page.getByRole('textbox', { name: /^Line \d/ }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-labelledby')));
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('Save with a quantity of 0 and an unfinished new line shows the errors, the summary and focuses the first invalid field', async ({ page }) => {
    await open(page);
    const before = await storedLines(page, THREE);
    await field(page, 'Line 3 quantity').fill('0');
    await btn(page, 'Add line').click(); // a new line has no product and no price
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(field(page, 'Line 3 quantity')).toBeFocused();
    await expect(field(page, 'Line 3 quantity')).toHaveAttribute('aria-invalid', 'true');
    await expect(product(page, 4)).toHaveAttribute('aria-invalid', 'true');
    await expect(price(page, 4)).toHaveAttribute('aria-invalid', 'true');
    await expect(bar(page).getByText('3 invalid fields')).toBeVisible();
    expect(await storedLines(page, THREE)).toEqual(before);
  });

  test('removing a line with an error leaves no orphan error; the next Save puts the error on the right field', async ({ page }) => {
    await open(page);
    await field(page, 'Line 1 quantity').fill('0');
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
    const before = (await storedLines(page, THREE)) as { id: string }[];
    await btn(page, 'Move line 3 up').click();
    await btn(page, 'Add line').click();
    await product(page, 4).click();
    await page.getByRole('option').first().click();
    await field(page, 'Line 4 quantity').fill('2');
    await price(page, 4).fill('150');
    await expect(page.locator('[data-line-total]').nth(3)).toHaveText('€300.00');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    const lines = (await storedLines(page, THREE)) as { id: string; productId: string; quantity: number; unitPriceMinor: number; discountPercent: number }[];
    expect(lines.map((l) => l.id)).toEqual([before[0]!.id, before[2]!.id, before[1]!.id, 'new-1']);
    expect(lines[3]).toEqual({ id: 'new-1', productId: expect.stringMatching(/^prd-/) as unknown as string, quantity: 2, unitPriceMinor: 15000, discountPercent: 0 });
    expect(typeof lines[0]!.quantity).toBe('number');
    await expect(price(page, 4)).toHaveValue('150.00');
  });

  test('Discard restores the lines, the order and the values (added lines gone, removed lines back)', async ({ page }) => {
    await open(page);
    const before = await products(page);
    await btn(page, 'Remove line 1').click();
    await btn(page, 'Move line 2 up').click();
    await btn(page, 'Add line').click();
    await field(page, 'Line 3 quantity').fill('9');
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(bar(page)).toBeHidden();
    expect(await products(page)).toEqual(before);
  });

  test('a unit price retyped with the same number is not a change', async ({ page }) => {
    await open(page);
    const original = await price(page, 1).inputValue();
    await price(page, 1).fill(String(Number(original)));
    await expect(bar(page)).toBeHidden();
  });

  test('an order whose last line was removed shows "No lines" and a stable footprint when the first line is added', async ({ page }) => {
    await open(page, ONE);
    await btn(page, 'Remove line 1').click();
    await expect(page.getByText('No lines', { exact: true })).toBeVisible();
    await expect(bar(page)).toBeVisible();
    const scroller = page.locator('[data-object-page-scroller]');
    const barTop = (await bar(page).boundingBox())!.y;
    await btn(page, 'Add line').click();
    await expect(product(page, 1)).toBeFocused();
    expect((await bar(page).boundingBox())!.y).toBe(barTop);
    await expect(scroller).toBeVisible();
  });

  test('after add, remove, add the ids are never repeated', async ({ page }) => {
    await open(page, ONE);
    const original = ((await storedLines(page, ONE)) as { id: string }[])[0]!.id;
    await btn(page, 'Add line').click();
    await btn(page, 'Remove line 2').click();
    await btn(page, 'Add line').click();
    await product(page, 2).click();
    await page.getByRole('option').first().click();
    await field(page, 'Line 2 quantity').fill('3');
    await price(page, 2).fill('5');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page)).toBeHidden();
    const lines = (await storedLines(page, ONE)) as { id: string }[];
    expect(lines.map((l) => l.id)).toEqual([original, 'new-2']);
  });

  test('the order page with lines has no accessibility violation, dirty and with errors too', async ({ page }) => {
    await open(page, FOUR);
    await expectNoA11yViolations(page);
    await btn(page, 'Add line').click();
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('the Save of an order in flight keeps the rules of the scalar fields: edits made meanwhile stay dirty', async ({ page }) => {
    await open(page, THREE, 'loadDelayMs:0;saveDelayMs:1500');
    await field(page, 'Line 1 quantity').fill('11');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await field(page, 'Line 2 quantity').fill('22');
    await expect(bar(page).getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    await expect(field(page, 'Line 1 quantity')).toHaveValue('11');
    await expect(bar(page).getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-disabled', 'true', { timeout: 5000 });
    await expect(bar(page)).toBeVisible();
    await expect(field(page, 'Line 2 quantity')).toHaveValue('22');
  });
});

test.describe('Showcase/Record editing, orders: lines, flows (migrated from Showcase/Invoices)', () => {
  test('dirty-guard: after only reordering, "Back to list" asks for confirmation', async ({ page }) => {
    await page.goto(
      `/iframe.html?id=${LIST_TO_RECORD}&viewMode=story&args=${encodeURIComponent('listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0')}&module=sales-orders&record=${THREE}`,
    );
    await expect(product(page, 3)).toBeVisible();
    await btn(page, 'Move line 3 up').click();
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  });

  test('creation: a new order starts without lines; Create is refused until one line exists, and nothing is created', async ({ page }) => {
    await gotoStory(page, CRUD, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0');
    await page.getByRole('button', { name: 'New sales order' }).click();
    await expect(page.getByText('No lines', { exact: true })).toBeVisible();
    await expect(btn(page, 'Add line')).toBeVisible();
    await page.getByRole('combobox', { name: /Customer/ }).click();
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Add at least one line.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'New sales order' })).toBeVisible();
    const count = await page.evaluate(
      () => (window as unknown as { __ropShowcaseStore?: { snapshot: () => unknown[] } }).__ropShowcaseStore?.snapshot().length,
    );
    expect(count).toBe(200);
  });
});

test.describe('Showcase/Record editing, orders: lines, small viewports (migrated from Showcase/Invoices)', () => {
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
        await open(page, FOUR);
        await expectNoHorizontalOverflow(page.locator('#storybook-root'));
        const row = page.getByRole('listitem').filter({ has: field(page, 'Line 4 quantity') });
        const box = await row.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      });

      test('the quantity of the last line stays above the keyboard and is not covered by the save bar', async ({ page }) => {
        await open(page, FOUR);
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
