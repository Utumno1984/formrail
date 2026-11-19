import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations, settleMotion } from './helpers/a11y';

// #583, decision of Daniele (option A): Pro/Showcase/Record editing integrity, a sales order deleted on the server
// BEFORE the review opens or WHILE it is open. Same review in both cases: "Save changes" is there, `aria-disabled`
// (still focusable), described by its reason (`aria-describedby`), and real Enter, Space and clicks on it save nothing.
// Never a "not found" from a save sent to an order that no longer exists.
const FIXTURE = 'pro-showcase-record-editing-integrity--sales-order-manual';
/** so-1: EUR, invoiced, 3 lines. */
const ORDER = { id: 'so-1', number: 'SO-2026-147000001' };
const REASON = 'Unavailable: this sales order no longer exists on the server.';
const DELETED_DESCRIPTION = 'This sales order was deleted on the server: these changes can no longer be saved.';

interface Stored {
  id: string;
}
type ShowcaseWindow = {
  __ropShowcaseStore?: { snapshot: () => Stored[]; save: (order: Stored) => Promise<Stored> };
  __ropSaves?: Stored[];
};

const url = (args: string): string => `/iframe.html?id=${FIXTURE}&viewMode=story&args=${encodeURIComponent(args)}`;
const reviewDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Review changes' });
const saveChanges = (page: Page): Locator => reviewDialog(page).getByRole('button', { name: 'Save changes' });
const keepEditing = (page: Page): Locator => reviewDialog(page).getByRole('button', { name: 'Keep editing' });
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const saveButton = (page: Page): Locator => footer(page).getByRole('button', { name: 'Save' });
const simulate = (page: Page): Locator => page.getByRole('button', { name: 'Simulate server update' });
const textbox = (page: Page, name: string): Locator => page.getByRole('textbox', { name, exact: true });
const deletedAlert = (page: Page): Locator => page.getByRole('alert').filter({ hasText: 'This sales order was deleted on the server' });

/** Opens so-1 from the list and records every call to the store's `save`. */
async function openOrder(page: Page, args: string): Promise<void> {
  await page.goto(url(args));
  await page.getByRole('link', { name: ORDER.number }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(ORDER.number) })).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as ShowcaseWindow;
    const store = w.__ropShowcaseStore!;
    const original = store.save.bind(store);
    w.__ropSaves = [];
    store.save = (o) => {
      w.__ropSaves!.push(o);
      return original(o);
    };
  });
}

const saves = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as ShowcaseWindow).__ropSaves?.length ?? -1);
const orderExists = (page: Page): Promise<boolean> =>
  page.evaluate((id) => (window as unknown as ShowcaseWindow).__ropShowcaseStore!.snapshot().some((o) => o.id === id), ORDER.id);

/** "Save changes" unavailable for the deletion: present, `aria-disabled`, not `disabled`, described by the reason. */
async function expectUnavailable(page: Page): Promise<void> {
  const button = saveChanges(page);
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(button).not.toHaveAttribute('disabled');
  await expect(button).toHaveAccessibleDescription(REASON);
  await expect(reviewDialog(page).getByText(REASON)).toBeVisible();
  // The dialog is still described by its own description, not by the button's reason.
  await expect(reviewDialog(page)).toHaveAccessibleDescription(DELETED_DESCRIPTION);
}

/** Real Enter, Space and a click on the focused "Save changes": nothing saved, the review open, the focus on it. */
async function expectInert(page: Page): Promise<void> {
  const button = saveChanges(page);
  await expect(button).toBeFocused();
  for (const key of ['Enter', 'Space', 'Enter']) await page.keyboard.press(key);
  // `force`: Playwright counts `aria-disabled` as "not enabled" and would wait; the real mouse events still land on it.
  await button.click({ force: true });
  await page.waitForTimeout(300);
  await expect(reviewDialog(page)).toBeVisible();
  await expect(button).toBeFocused();
  expect(await saves(page)).toBe(0);
  expect(await orderExists(page)).toBe(false);
  await expect(page.getByText(/not found/)).toHaveCount(0);
}

/** Keep editing closes the review; my edits are still in the form. */
async function backToTheForm(page: Page, field: string, value: string): Promise<void> {
  await keepEditing(page).click();
  await expect(reviewDialog(page)).toHaveCount(0);
  await expect(textbox(page, field)).toHaveValue(value);
  await expect(page.getByText(/not found/)).toHaveCount(0);
}

test.describe('Pro/Showcase/Record editing integrity, sales orders: "Save changes" on a deleted order (#583, option A)', () => {
  test('deleted BEFORE the review opens: Save changes present, aria-disabled, described by the reason; Tab reaches it, Enter/Space/click save nothing; axe passes', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:0;serverChange:delete-order');
    await textbox(page, 'Customer reference').fill('PO-lost');
    await simulate(page).click();
    await expect(deletedAlert(page)).toBeVisible();
    await saveButton(page).click();
    await expect(reviewDialog(page)).toBeVisible();
    await expectUnavailable(page);
    // The review opens on "Keep editing"; Tab reaches "Save changes" (an aria-disabled button stays in the order).
    await expect(keepEditing(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expectInert(page);
    await settleMotion(page);
    await expectNoA11yViolations(page);
    await backToTheForm(page, 'Customer reference', 'PO-lost');
  });

  test('deleted WHILE the review is open: the focused Save changes turns aria-disabled under the user, keeps the focus, saves nothing', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:1500;serverChange:delete-order');
    await textbox(page, 'Notes').fill('Call first');
    // The deletion lands 1.5 s after the click: the review is open by then, the focus on "Save changes".
    await simulate(page).click();
    await saveButton(page).click();
    await expect(reviewDialog(page)).toHaveAccessibleDescription('1 change will be saved.');
    await expect(saveChanges(page)).not.toHaveAttribute('aria-disabled');
    await expect(saveChanges(page)).not.toHaveAttribute('aria-describedby');
    await page.keyboard.press('Tab');
    await expect(saveChanges(page)).toBeFocused();
    await expect(saveChanges(page)).toHaveAttribute('aria-disabled', 'true', { timeout: 10_000 });
    await expectUnavailable(page);
    await expectInert(page);
    await backToTheForm(page, 'Notes', 'Call first');
  });
});
