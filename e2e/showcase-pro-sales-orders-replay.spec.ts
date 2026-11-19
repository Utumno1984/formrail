import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';

// #583: Pro/Showcase/Record editing integrity, sales orders. A server update that lands during a save is replayed by
// the store on top of what the save wrote: the order then holds what the server ANNOUNCED (absolute values, lines by
// id), never values derived from the user's. And the open "Review changes" dialog says its new description out loud
// (a polite status in its body) when the order changes under it.
const FIXTURE = 'pro-showcase-record-editing-integrity--sales-order-manual';
/** so-1: EUR, invoiced, requested delivery 2026-06-10, 3 lines. */
const ORDER = { id: 'so-1', number: 'SO-2026-147000001' };

interface StoredLine {
  id: string;
  productId: string;
  quantity: number;
}
interface Stored {
  id: string;
  status: string;
  customerReference: string;
  requestedDeliveryDate: string;
  notes: string;
  lines: StoredLine[];
}
interface Announced {
  id: string;
  record: Stored | null;
}
type ShowcaseWindow = {
  __ropShowcaseStore?: { snapshot: () => Stored[]; subscribe: (listener: (change: Announced) => void) => () => void };
  __ropAnnounced?: Announced[];
};

const url = (args: string): string => `/iframe.html?id=${FIXTURE}&viewMode=story&args=${encodeURIComponent(args)}`;
const reviewDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Review changes' });
const footer = (page: Page): Locator => page.getByRole('region', { name: 'Save actions' });
const saveButton = (page: Page): Locator => footer(page).getByRole('button', { name: 'Save' });
const simulate = (page: Page): Locator => page.getByRole('button', { name: 'Simulate server update' });
const delivery = (page: Page): Locator => page.getByLabel(/^Requested delivery/);
const textbox = (page: Page, name: string): Locator => page.getByRole('textbox', { name, exact: true });

/** Opens so-1 from the list and records every change of it the store announces. */
async function openOrder(page: Page, args: string): Promise<void> {
  await page.goto(url(args));
  await page.getByRole('link', { name: ORDER.number }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(ORDER.number) })).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as ShowcaseWindow;
    w.__ropAnnounced = [];
    w.__ropShowcaseStore!.subscribe((change) => w.__ropAnnounced!.push(change));
  });
}

const stored = (page: Page): Promise<Stored | undefined> =>
  page.evaluate((id) => (window as unknown as ShowcaseWindow).__ropShowcaseStore?.snapshot().find((o) => o.id === id), ORDER.id);
const announced = (page: Page): Promise<Announced[]> => page.evaluate(() => (window as unknown as ShowcaseWindow).__ropAnnounced ?? []);

test.describe('Pro/Showcase/Record editing integrity, sales orders: a server update replayed after a save (#583)', () => {
  test('another delivery saved, the server moves it during the save: the order keeps the ANNOUNCED delivery; a second update adds up', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500;serverUpdateDelayMs:0');
    await delivery(page).fill('2026-09-03');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(saveButton(page)).toHaveAttribute('aria-disabled', 'true');
    await simulate(page).click();
    // Announced at once: the delivery the server had, a week later; the next status.
    await expect.poll(async () => (await announced(page))[0]?.record).toMatchObject({ requestedDeliveryDate: '2026-06-17', status: 'shipped' });
    // Then the save lands and the update is replayed on top of it: still the announced values, never 2026-09-10.
    await expect.poll(async () => (await announced(page)).length, { timeout: 10_000 }).toBe(2);
    expect((await announced(page))[1]!.record).toMatchObject({ requestedDeliveryDate: '2026-06-17', status: 'shipped' });
    expect(await stored(page)).toMatchObject({ requestedDeliveryDate: '2026-06-17', status: 'shipped' });
    await expect(delivery(page)).toHaveValue('2026-06-17');
    await expect(footer(page)).toBeHidden();
    // A second click is a second update, from the order as it is now: a week more, the next status again.
    await simulate(page).click();
    await expect.poll(async () => (await stored(page))?.requestedDeliveryDate).toBe('2026-06-24');
    expect((await stored(page))!.status).toBe('invoiced');
    await expect(delivery(page)).toHaveValue('2026-06-24');
  });

  test('a line the server adds during a save that adds lines too: srv-line-1 keeps the announced product, once', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:1500;serverUpdateDelayMs:0;serverChange:add-line');
    await textbox(page, 'Customer reference').fill('PO-9');
    await saveButton(page).click();
    await reviewDialog(page).getByRole('button', { name: 'Save changes' }).click();
    await simulate(page).click();
    await expect.poll(async () => (await announced(page)).length).toBe(1);
    const first = (await announced(page))[0]!.record!.lines.find((l) => l.id === 'srv-line-1')!;
    await expect.poll(async () => (await announced(page)).length, { timeout: 10_000 }).toBe(2);
    const lines = (await stored(page))!.lines;
    expect(lines.filter((l) => l.id === 'srv-line-1')).toEqual([first]);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    expect((await stored(page))!.customerReference).toBe('PO-9');
  });
});

test.describe('Pro/Showcase/Record editing integrity, sales orders: the review says its new description (#583)', () => {
  test('the order deleted while the review is open: a polite status in the dialog says it once; axe passes', async ({ page }) => {
    await openOrder(page, 'listLoadDelayMs:0;recordLoadDelayMs:0;saveDelayMs:0;serverUpdateDelayMs:1500;serverChange:delete-order');
    await textbox(page, 'Notes').fill('Call first');
    // The deletion lands 1.5 s after the click: the review is open by then.
    await simulate(page).click();
    await saveButton(page).click();
    const dialog = reviewDialog(page);
    await expect(dialog).toHaveAccessibleDescription('1 change will be saved.');
    const region = dialog.getByRole('status');
    await expect(region).toHaveCount(1);
    await expect(region).toHaveText('');
    await expect(region).toHaveText('This sales order was deleted on the server: these changes can no longer be saved.', { timeout: 10_000 });
    await expect(dialog).toHaveAccessibleDescription('This sales order was deleted on the server: these changes can no longer be saved.');
    // Never the page's alert in the dialog's region.
    await expect(region).not.toContainText('Copy what you need');
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expectNoA11yViolations(page);
  });
});
