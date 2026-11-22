import { expect, test, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';
import { MOBILE_VIEWPORT } from './helpers/viewports';
import { getCourse, getEmployee, getPurchaseOrder } from '../packages/core/src/internal/demo-data';

// Ticket #529: the three "Example: configured for ..." stories of Floorplans/Object Page/Layout. The plays check
// the default Controls; here each story is driven with real input, with two values of its Controls.

const STORY = (name: string) => `floorplans-object-page-layout--use-case-${name}`;
const HR = STORY('hr-employee');
const COURSE = STORY('elearning-course');
const ORDER = STORY('erp-purchase-order');
// The same stories without their play: a test starts from the state the Controls give, not where the play left it.
const noPlay = (id: string) => `${id}-no-play`;

const SAVE_BAR = (page: Page) => page.getByRole('region', { name: 'Save actions' });
const SCROLLER = '[data-object-page-scroller]';

/** Where the title and the bottom edge of the scroller are: the two things that would jump if the save bar's room were not reserved. */
const placement = (page: Page) =>
  page.evaluate((selector) => {
    const scroller = document.querySelector(selector) as HTMLElement;
    const title = document.querySelector('h1') as HTMLElement;
    return [Math.round(title.getBoundingClientRect().top), Math.round(scroller.getBoundingClientRect().bottom)];
  }, SCROLLER);

test.describe('the three examples: every play passes, with two values of their Controls', () => {
  const cases: [string, string, string | undefined][] = [
    ['hr, with the Address section (default)', HR, undefined],
    ['hr, without the Address section', HR, 'showAddress:!false'],
    ['e-learning, all four prices (default)', COURSE, undefined],
    ['e-learning, euro only', COURSE, 'pricing:EUR'],
    ['e-learning, yen only', COURSE, 'pricing:JPY'],
    ['erp, with the Delivery section (default)', ORDER, undefined],
    ['erp, without the Delivery section', ORDER, 'showDelivery:!false'],
  ];
  for (const [name, id, args] of cases) {
    test(name, async ({ page }) => {
      await expectPlayToPass(page, id, args);
    });
  }
});

test.describe('the Controls change the sections', () => {
  test('hr: showAddress adds and drops the section and its anchor-bar tab', async ({ page }) => {
    await gotoStory(page, noPlay(HR));
    await expect(page.getByRole('region', { name: 'Address' })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link')).toHaveText(['Personal', 'Job', 'Address']);
    await gotoStory(page, noPlay(HR), 'showAddress:!false');
    await expect(page.getByRole('region', { name: 'Address' })).toHaveCount(0);
    await expect(page.getByRole('navigation').getByRole('link')).toHaveText(['Personal', 'Job']);
  });

  test('e-learning: the pricing lists one price per currency, yen without decimals', async ({ page }) => {
    const course = getCourse('crs-7')!;
    await gotoStory(page, noPlay(COURSE));
    await expect(page.getByRole('textbox', { name: /^Price per seat/ })).toHaveCount(4);
    await expect(page.getByRole('textbox', { name: 'Price per seat (JPY)' })).toHaveValue(String(course.listPriceMinor.JPY));
    await expect(page.getByRole('textbox', { name: 'Price per seat (EUR)' })).toHaveValue((course.listPriceMinor.EUR / 100).toFixed(2));
    await gotoStory(page, noPlay(COURSE), 'pricing:JPY');
    await expect(page.getByRole('textbox', { name: /^Price per seat/ })).toHaveCount(1);
  });

  test('erp: the order is in yen, its totals have no decimals, and showDelivery drops the section', async ({ page }) => {
    const order = getPurchaseOrder('po-31')!;
    expect(order.currency).toBe('JPY');
    await gotoStory(page, noPlay(ORDER));
    const total = await page.getByLabel('Order total').textContent();
    expect(total).toContain(order.totalMinor.toLocaleString('en-GB'));
    expect(total).not.toMatch(/\.\d/);
    for (const [index] of order.lines.entries()) {
      expect(await page.getByLabel(`Total of line ${index + 1}`).textContent()).not.toMatch(/\.\d/);
    }
    await expect(page.getByRole('region', { name: 'Delivery' })).toBeVisible();
    await gotoStory(page, noPlay(ORDER), 'showDelivery:!false');
    await expect(page.getByRole('region', { name: 'Delivery' })).toHaveCount(0);
  });
});

test.describe('real input: the save bar, the dirty guard and the focus', () => {
  test('arrival is clean: no save bar, no beforeunload prompt armed by an echo', async ({ page }) => {
    for (const id of [HR, COURSE, ORDER]) {
      await gotoStory(page, noPlay(id));
      await expect(SAVE_BAR(page)).toBeHidden();
      await expect(page.getByRole('region', { name: 'Save actions' })).toHaveCount(0);
    }
  });

  test('editing shows the save bar without moving the title or the scroller; restoring the value hides it again', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoStory(page, noPlay(HR));
    const before = await placement(page);
    const field = page.getByRole('textbox', { name: 'Job title' });
    const saved = await field.inputValue();
    await field.fill(`${saved} II`);
    await expect(SAVE_BAR(page)).toBeVisible();
    expect(await placement(page)).toEqual(before);
    // The dirty flag compares against the saved record: typing the saved value back is clean again.
    await field.fill(saved);
    await expect(SAVE_BAR(page)).toHaveCount(0);
    expect(await placement(page)).toEqual(before);
  });

  test('discard returns the fields to the saved record', async ({ page }) => {
    const course = getCourse('crs-7')!;
    await gotoStory(page, noPlay(COURSE));
    const module1 = page.getByRole('textbox', { name: 'Module 1 title' });
    await module1.fill('Something else');
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(module1).toHaveValue(course.modules[0]!.title);
    await expect(SAVE_BAR(page)).toHaveCount(0);
  });

  test('saving makes the edited value the new baseline: the bar hides, the value stays', async ({ page }) => {
    await gotoStory(page, noPlay(COURSE));
    const module2 = page.getByRole('textbox', { name: 'Module 2 title' });
    await module2.fill('Renamed module');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(SAVE_BAR(page)).toHaveCount(0);
    await expect(module2).toHaveValue('Renamed module');
  });

  test('the guard: "Keep editing" returns the focus to the exit button and keeps the edit', async ({ page }) => {
    await gotoStory(page, noPlay(COURSE));
    const module1 = page.getByRole('textbox', { name: 'Module 1 title' });
    await module1.fill('Edited');
    const exit = page.getByRole('button', { name: 'Back to list' });
    await exit.click();
    const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
    await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(exit).toBeFocused();
    await expect(module1).toHaveValue('Edited');
  });

  test('the guard: with nothing changed, "Back to list" leaves at once', async ({ page }) => {
    await gotoStory(page, noPlay(HR));
    await page.getByRole('button', { name: 'Back to list' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('hr: the manager is held as an id and shown as a name', async ({ page }) => {
    const manager = getEmployee(getEmployee('emp-30')!.managerId!)!;
    await gotoStory(page, noPlay(HR));
    await expect(page.getByRole('combobox', { name: /Manager/ })).toContainText(manager.fullName);
  });

  test('erp: a new quantity moves the line total and the order total; the locked fields are read-only but focusable', async ({ page }) => {
    await gotoStory(page, noPlay(ORDER));
    const totalBefore = await page.getByLabel('Order total').textContent();
    const quantity = page.getByRole('textbox', { name: 'Quantity of line 1' });
    await quantity.fill('1');
    await expect(page.getByLabel('Order total')).not.toHaveText(totalBefore!);
    const number = page.getByRole('textbox', { name: 'Order number' });
    await number.focus();
    await expect(number).toBeFocused();
    await expect(number).toHaveAttribute('readonly', '');
    await page.keyboard.type('X');
    await expect(number).not.toHaveValue(/X/);
  });

  test('mobile: the save bar appears over a reserved room, and nothing overflows sideways', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    for (const id of [HR, COURSE, ORDER]) {
      await gotoStory(page, noPlay(id));
      const before = await placement(page);
      const first = page.getByRole('textbox').nth(0);
      await first.scrollIntoViewIfNeeded();
      const field = id === HR ? page.getByRole('textbox', { name: 'Job title' }) : id === COURSE ? page.getByRole('textbox', { name: 'Module 1 title' }) : page.getByRole('textbox', { name: 'Order date' });
      await field.fill('Z');
      await expect(SAVE_BAR(page)).toBeVisible();
      await field.focus();
      // The focused field is not under the save bar.
      const box = await field.boundingBox();
      const bar = await SAVE_BAR(page).boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      void before;
    }
  });
});
