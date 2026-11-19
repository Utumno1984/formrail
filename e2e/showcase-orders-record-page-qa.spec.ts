import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #525 (migration of e2e/showcase-record-page-qa.spec.ts from Showcase/Invoices to the sales orders): cases not covered by
// showcase-orders-record-page.spec.ts. The invoice's "Amount" is the quantity of the first line, its "Notes" are the
// order's "Delivery instructions" (empty on so-15 and so-1), its "Supplier" Select is the order's "Status" Select.
const FIXTURE = 'showcase-record-editing--sales-order-record-page-manual';

const ITALIAN = [
  'Sezioni',
  'Chiudi',
  'Azioni di salvataggio',
  'Errore',
  'Informazione',
  'Operazione riuscita',
  'Modifiche non salvate',
  'campi non validi',
  'Nessuna opzione',
];

const quantity = (page: Page): Locator => page.getByRole('textbox', { name: 'Line 1 quantity' });
const delivery = (page: Page): Locator => page.getByRole('textbox', { name: 'Delivery instructions' });
const bar = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const dialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });

async function open(page: Page, args = ''): Promise<void> {
  await gotoStory(page, FIXTURE, args);
  await expect(quantity(page)).toBeVisible();
}

/** What the Controls panel does: update args of the mounted story through the channel. */
async function updateArgs(page: Page, updatedArgs: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ([storyId, args]) => {
      const channel = (
        window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void } }
      ).__STORYBOOK_ADDONS_CHANNEL__;
      channel.emit('updateStoryArgs', { storyId, updatedArgs: args });
    },
    [FIXTURE, updatedArgs] as const,
  );
}

async function expectNoItalian(page: Page): Promise<void> {
  const html = await page.evaluate(() => document.body.innerHTML);
  const a11y = JSON.stringify(await page.locator('body').ariaSnapshot());
  for (const word of ITALIAN) {
    expect(html, `DOM contains "${word}"`).not.toContain(word);
    expect(a11y, `a11y tree contains "${word}"`).not.toContain(word);
  }
}

test.describe('Showcase/Record editing, orders: RecordPage QA (migrated from Showcase/Invoices)', () => {
  test('recordId changed from the Controls after mount: fresh hydrated editor, no inherited dirty, no console warning', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') messages.push(m.text());
    });
    page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
    await open(page);
    const firstTitle = await page.getByRole('heading', { level: 1 }).textContent();
    await quantity(page).fill('999');
    await delivery(page).fill('dirty on so-15');
    await expect(bar(page)).toBeVisible();

    await updateArgs(page, { recordId: 'so-1' });
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(firstTitle ?? '');
    await expect(quantity(page)).not.toHaveValue('999');
    await expect(delivery(page)).not.toHaveValue('dirty on so-15');
    await expect(bar(page)).toBeHidden();
    await expect(dialog(page)).toBeHidden();

    // And on to an unknown record, then back to a valid one: still clean.
    await updateArgs(page, { recordId: 'so-does-not-exist' });
    await expect(page.getByRole('alert')).toContainText('Sales order not found');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await updateArgs(page, { recordId: 'so-12' });
    await expect(quantity(page)).toBeVisible();
    await expect(bar(page)).toBeHidden();
    expect(messages, messages.join('\n')).toEqual([]);
  });

  test('recordId changed while loading: no stale editor, the new record is shown', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'loadDelayMs:1500');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await updateArgs(page, { recordId: 'so-1' });
    await expect(quantity(page)).toBeVisible({ timeout: 6000 });
    await expect(bar(page)).toBeHidden();
  });

  test('Status Select: choosing another status is dirty; restoring cleans, and the header badge keeps the saved status', async ({ page }) => {
    await open(page);
    const status = page.getByRole('combobox', { name: 'Status' });
    const original = ((await status.textContent()) ?? '').trim();
    const badge = (text: string): Locator => page.locator('h1').locator('..').getByText(text, { exact: true });
    await expect(badge(original)).toHaveCount(1);
    await status.click();
    const options = page.getByRole('option');
    const n = await options.count();
    expect(n).toBeGreaterThan(1);
    let chosen = '';
    for (let i = 0; i < n; i++) {
      const t = ((await options.nth(i).textContent()) ?? '').trim();
      if (t && t !== original) {
        chosen = t;
        await options.nth(i).click();
        break;
      }
    }
    await expect(bar(page)).toBeVisible();
    await expect(status).toContainText(chosen);
    // The header shows the SAVED status, not the draft one.
    await expect(badge(original)).toHaveCount(1);
    await expect(badge(chosen)).toHaveCount(0);
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(bar(page)).toBeHidden();
    await expect(status).toContainText(original);
    await expect(badge(original)).toHaveCount(1);
  });

  test('keyboard: Tab order in the save bar is Save then Discard; Enter on Save saves; Escape closes the dialog and returns focus to Back to list', async ({ page }) => {
    await open(page, 'saveDelayMs:300');
    await quantity(page).fill('13');
    await expect(bar(page)).toBeVisible();
    const save = bar(page).getByRole('button', { name: 'Save' });
    const discard = bar(page).getByRole('button', { name: 'Discard' });
    await save.focus();
    await page.keyboard.press('Tab');
    await expect(discard).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(save).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(bar(page)).toBeHidden({ timeout: 5000 });
    await expect(quantity(page)).toHaveValue('13');

    await quantity(page).fill('55');
    await back(page).focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(back(page)).toBeFocused();
    await expect(quantity(page)).toHaveValue('55');
    await expect(bar(page)).toBeVisible();
  });

  test('keyboard: Tab inside the open dialog stays trapped', async ({ page }) => {
    await open(page);
    await quantity(page).fill('55');
    await back(page).click();
    await expect(dialog(page)).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
      expect(inside, `focus escaped the dialog after ${i + 1} Tab presses`).toBe(true);
    }
  });

  test('Enter on an aria-disabled Save during the save does not save twice', async ({ page }) => {
    await open(page, 'saveDelayMs:800');
    await quantity(page).fill('21');
    const save = bar(page).getByRole('button', { name: 'Save' });
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(bar(page)).toBeHidden({ timeout: 5000 });
    await expect(quantity(page)).toHaveValue('21');
  });

  test('validation state and the open status list have no Italian string', async ({ page }) => {
    await open(page);
    await quantity(page).fill('0');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page).getByRole('status')).toContainText('Error');
    await expectNoItalian(page);
    await page.getByRole('combobox', { name: 'Status' }).click();
    await expect(page.getByRole('option').first()).toBeVisible();
    await expectNoItalian(page);
  });

  test('footer: the scroll area keeps its size and the header does not move when the bar appears or disappears', async ({ page }) => {
    await open(page);
    const measure = () =>
      page.evaluate(() => {
        const h = document.querySelector('h1')?.getBoundingClientRect();
        const scroller = Array.from(document.querySelectorAll<HTMLElement>('*')).find(
          (el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY.match(/auto|scroll/),
        );
        return { hy: h?.y, ch: scroller?.clientHeight, sh: scroller?.scrollHeight };
      });
    const before = await measure();
    expect(before.ch, 'a scroll container was found').toBeGreaterThan(0);
    expect(before.hy).toBeDefined();
    await quantity(page).pressSequentially('1');
    await expect(bar(page)).toBeVisible();
    const during = await measure();
    await page.keyboard.press('Backspace');
    await expect(bar(page)).toBeHidden();
    const after = await measure();
    expect(during).toEqual(before);
    expect(after).toEqual(before);
  });

  for (const [name, width, height] of [
    ['mobile', 375, 667],
    ['tablet', 768, 1024],
  ] as const) {
    test(`${name} viewport: no horizontal overflow, the bar sits inside the viewport, Back to list reachable, no jump`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page);
      const overflowX = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(await overflowX()).toBe(false);
      await expect(back(page)).toBeVisible();
      await quantity(page).scrollIntoViewIfNeeded();
      const before = await quantity(page).boundingBox();
      await quantity(page).pressSequentially('1');
      await expect(bar(page)).toBeVisible();
      const after = await quantity(page).boundingBox();
      expect(after?.y).toBe(before?.y);
      const box = await bar(page).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 0.5);
      // The bar must not cover the field being edited.
      expect(after!.y + after!.height).toBeLessThanOrEqual(box!.y + 0.5);
      for (const label of ['Save', 'Discard']) {
        const b = await bar(page).getByRole('button', { name: label }).boundingBox();
        expect(b!.x + b!.width, `${label} fits horizontally`).toBeLessThanOrEqual(width + 0.5);
        expect(b!.x).toBeGreaterThanOrEqual(0);
      }
      expect(await overflowX()).toBe(false);
      await back(page).click();
      await expect(dialog(page)).toBeVisible();
      const d = await dialog(page).boundingBox();
      expect(d!.x).toBeGreaterThanOrEqual(0);
      expect(d!.x + d!.width).toBeLessThanOrEqual(width + 0.5);
    });
  }
});
