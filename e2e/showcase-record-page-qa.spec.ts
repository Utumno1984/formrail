import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #149 QA: cases not covered by showcase-record-page.spec.ts.
const FIXTURE = 'showcase-invoices--manual';

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

const amount = (page: Page): Locator => page.getByRole('textbox', { name: /Amount/ });
const notes = (page: Page): Locator => page.getByRole('textbox', { name: 'Notes' });
const bar = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const back = (page: Page): Locator => page.getByRole('button', { name: 'Back to list' });
const dialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Unsaved changes' });

async function open(page: Page, args = ''): Promise<void> {
  await gotoStory(page, FIXTURE, args);
  await expect(amount(page)).toBeVisible();
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

test.describe('Showcase/Invoices: RecordPage (QA)', () => {
  test('recordId changed from the Controls after mount: fresh hydrated editor, no inherited dirty, no console warning', async ({
    page,
  }) => {
    const messages: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') messages.push(m.text());
    });
    page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
    await open(page);
    const firstTitle = await page.getByRole('heading', { level: 1 }).textContent();
    await amount(page).fill('999.9');
    await notes(page).fill('dirty on inv-2');
    await expect(bar(page)).toBeVisible();

    await updateArgs(page, { recordId: 'inv-3' });
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(firstTitle ?? '');
    await expect(amount(page)).not.toHaveValue('999.9');
    await expect(notes(page)).toHaveValue('');
    await expect(bar(page)).toBeHidden();
    await expect(dialog(page)).toBeHidden();

    // And on to an unknown record, then back to a valid one: still clean.
    await updateArgs(page, { recordId: 'inv-does-not-exist' });
    await expect(page.getByRole('alert')).toContainText('Invoice not found');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await updateArgs(page, { recordId: 'inv-1' });
    await expect(amount(page)).toBeVisible();
    await expect(bar(page)).toBeHidden();
    expect(messages, messages.join('\n')).toEqual([]);
  });

  test('recordId changed while loading: no stale editor, the new record is shown', async ({ page }) => {
    await gotoStory(page, FIXTURE, 'loadDelayMs:1500');
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await updateArgs(page, { recordId: 'inv-3' });
    await expect(amount(page)).toBeVisible({ timeout: 6000 });
    await expect(bar(page)).toBeHidden();
  });

  test('supplier Select: choosing another supplier is dirty and updates the subtitle; restoring cleans', async ({
    page,
  }) => {
    await open(page);
    const supplier = page.getByRole('combobox', { name: /Supplier/ });
    const original = (await supplier.textContent()) ?? '';
    await supplier.click();
    const options = page.getByRole('option');
    const n = await options.count();
    expect(n).toBeGreaterThan(1);
    let chosen = '';
    for (let i = 0; i < n; i++) {
      const t = ((await options.nth(i).textContent()) ?? '').trim();
      if (t && !original.includes(t)) {
        chosen = t;
        await options.nth(i).click();
        break;
      }
    }
    await expect(bar(page)).toBeVisible();
    await expect(supplier).toContainText(chosen);
    await bar(page).getByRole('button', { name: 'Discard' }).click();
    await expect(bar(page)).toBeHidden();
    await expect(supplier).toContainText(original.trim());
  });

  test('keyboard: Tab order in the save bar is Save then Discard; Enter on Save saves; Escape closes the dialog and returns focus to Back to list', async ({
    page,
  }) => {
    await open(page, 'saveDelayMs:300');
    await amount(page).fill('12.345');
    await expect(bar(page)).toBeVisible();
    const save = bar(page).getByRole('button', { name: 'Save' });
    const discard = bar(page).getByRole('button', { name: 'Discard' });
    await save.focus();
    await page.keyboard.press('Tab');
    await expect(discard).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(save).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(amount(page)).toHaveValue('12.35', { timeout: 5000 });
    await expect(bar(page)).toBeHidden();

    await amount(page).fill('55');
    await back(page).focus();
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(back(page)).toBeFocused();
    await expect(amount(page)).toHaveValue('55');
    await expect(bar(page)).toBeVisible();
  });

  test('keyboard: Tab inside the open dialog stays trapped', async ({ page }) => {
    await open(page);
    await amount(page).fill('55');
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
    await amount(page).fill('20.001');
    const save = bar(page).getByRole('button', { name: 'Save' });
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(bar(page)).toBeHidden({ timeout: 5000 });
    await expect(amount(page)).toHaveValue('20.00');
  });

  test('validation state and the open supplier list have no Italian string', async ({ page }) => {
    await open(page);
    await amount(page).fill('0');
    await bar(page).getByRole('button', { name: 'Save' }).click();
    await expect(bar(page).getByRole('status')).toContainText('Error');
    await expectNoItalian(page);
    await page.getByRole('combobox', { name: /Supplier/ }).click();
    await expect(page.getByRole('option').first()).toBeVisible();
    await expectNoItalian(page);
  });

  test('footer: the scroll area keeps its size and the header does not move when the bar appears or disappears', async ({
    page,
  }) => {
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
    await amount(page).pressSequentially('1');
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
    test(`${name} viewport: no horizontal overflow, the bar sits inside the viewport, Back to list reachable, no jump`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await open(page);
      const overflowX = () =>
        page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(await overflowX()).toBe(false);
      await expect(back(page)).toBeVisible();
      await amount(page).scrollIntoViewIfNeeded();
      const before = await amount(page).boundingBox();
      await amount(page).pressSequentially('1');
      await expect(bar(page)).toBeVisible();
      const after = await amount(page).boundingBox();
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
