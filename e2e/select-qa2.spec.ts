import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

const combobox = (page: Page): Locator => page.locator('[role="combobox"]');
const listbox = (page: Page): Locator => page.getByRole('listbox');

async function recordActions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __actions: { args?: unknown }[];
      __STORYBOOK_ADDONS_CHANNEL__?: { on: (e: string, cb: (p: { data?: { args?: unknown } }) => void) => void };
    };
    w.__actions = [];
    const timer = setInterval(() => {
      if (!w.__STORYBOOK_ADDONS_CHANNEL__) return;
      clearInterval(timer);
      w.__STORYBOOK_ADDONS_CHANNEL__.on('storybook/actions/action-event', (p) => w.__actions.push({ args: p.data?.args }));
    }, 1);
  });
}
const actions = (page: Page) =>
  page.evaluate(() => (window as unknown as { __actions: { args?: unknown }[] }).__actions.map((a) => JSON.stringify(a.args)));

async function open(page: Page, story = 'forms-select--manual') {
  await recordActions(page);
  await gotoStory(page, story);
}

test.describe('select gate QA (round 2)', () => {
  test('mouse click: exactly one onValueChange', async ({ page }) => {
    await open(page);
    await combobox(page).click();
    await page.getByRole('option', { name: 'France' }).click();
    await expect(combobox(page)).toHaveText('France');
    await page.waitForTimeout(300);
    expect(await actions(page)).toHaveLength(1);
  });

  test('drag-release: pointerdown on trigger, release on option', async ({ page }) => {
    await open(page);
    const t = await combobox(page).boundingBox();
    await page.mouse.move(t!.x + 10, t!.y + t!.height / 2);
    await page.mouse.down();
    await expect(listbox(page)).toBeVisible();
    const o = (await page.getByRole('option', { name: 'Spain' }).boundingBox())!;
    await page.mouse.move(o.x + 20, o.y + o.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(combobox(page)).toHaveText('Spain');
    await page.waitForTimeout(300);
    expect(await actions(page)).toEqual(['["es"]']);
  });

  test('slow click: >100ms (and 700ms) between pointerdown and pointerup on an option', async ({ page }) => {
    await open(page);
    await combobox(page).click();
    const o = (await page.getByRole('option', { name: 'Portugal' }).boundingBox())!;
    await page.mouse.move(o.x + 20, o.y + o.height / 2, { steps: 4 });
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(combobox(page)).toHaveText('Portugal');
    await page.waitForTimeout(300);
    expect(await actions(page)).toEqual(['["pt"]']);
  });

  test('keyboard: Enter and Space on an option, once each', async ({ page }) => {
    await open(page);
    await combobox(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(listbox(page)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'France' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(combobox(page)).toHaveText('France');
    await expect(combobox(page)).toBeFocused();
    await page.keyboard.press('Space');
    await expect(listbox(page)).toBeVisible();
    await expect(page.getByRole('option', { name: 'France' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Spain' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(combobox(page)).toHaveText('Spain');
    await page.waitForTimeout(300);
    expect(await actions(page)).toEqual(['["fr"]', '["es"]']);
  });

  test('typeahead on the closed trigger selects, once per letter', async ({ page }) => {
    await open(page);
    await combobox(page).focus();
    await page.keyboard.press('f');
    await expect(combobox(page)).toHaveText('France');
    await page.waitForTimeout(1200);
    await page.keyboard.press('s');
    await expect(combobox(page)).toHaveText('Spain');
    await page.waitForTimeout(300);
    expect(await actions(page)).toEqual(['["fr"]', '["es"]']);
  });

  test('typeahead inside the open list moves focus, Enter picks', async ({ page }) => {
    await open(page);
    await combobox(page).click();
    await page.keyboard.press('p');
    await expect(page.getByRole('option', { name: 'Portugal' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(combobox(page)).toHaveText('Portugal');
    await page.waitForTimeout(300);
    expect(await actions(page)).toEqual(['["pt"]']);
  });

  test('disabled option is not pickable by click nor typeahead', async ({ page }) => {
    await open(page);
    await combobox(page).focus();
    await page.keyboard.press('g');
    await page.waitForTimeout(300);
    await expect(combobox(page)).not.toHaveText('Germany');
    await combobox(page).click();
    await page.getByRole('option', { name: 'Germany' }).click({ force: true });
    await page.waitForTimeout(300);
    expect(await actions(page)).toEqual([]);
  });

  test('touch tap trigger then tap option @touch', async ({ page }) => {
    await open(page);
    await combobox(page).tap();
    await expect(listbox(page)).toBeVisible();
    await page.getByRole('option', { name: 'Austria' }).tap();
    await expect(combobox(page)).toHaveText('Austria');
    await page.waitForTimeout(400);
    expect(await actions(page)).toEqual(['["at"]']);
    await expect(listbox(page)).toHaveCount(0);
    // the tap must not leak a click onto what is under the closed list
    await expect(combobox(page)).toBeVisible();
  });

  test('touch: slow tap on an option @touch', async ({ page }) => {
    await open(page);
    await combobox(page).tap();
    const o = (await page.getByRole('option', { name: 'Spain' }).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const pt = { x: o.x + 20, y: o.y + o.height / 2, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await page.waitForTimeout(600);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(combobox(page)).toHaveText('Spain');
    await page.waitForTimeout(300);
    expect(await actions(page)).toEqual(['["es"]']);
  });
});

test.describe('select blocked QA (round 2)', () => {
  test('Forced: no open, no change from keyboard/mouse; Tab and Shift+Tab move focus; ctrl shortcuts untouched', async ({ page }) => {
    await open(page, 'forms-select--forced');
    const t = combobox(page);
    await t.focus();
    await expect(t).toBeFocused();
    for (const k of ['Enter', 'Space', 'ArrowDown', 'ArrowUp', 'f', 's', 'Home', 'End']) await page.keyboard.press(k);
    await t.click();
    await t.click({ force: true, clickCount: 2 });
    await page.mouse.down();
    await page.mouse.up();
    await expect(listbox(page)).toHaveCount(0);
    await expect(t).toHaveText('Italy');
    // ctrl shortcuts: not prevented
    const prevented = await t.evaluate((el) => {
      const res: Record<string, boolean> = {};
      for (const key of ['c', 'v', 'a', 'Tab']) {
        const ev = new KeyboardEvent('keydown', { key, ctrlKey: key !== 'Tab', bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
        res[key] = ev.defaultPrevented;
      }
      const sh = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      el.dispatchEvent(sh);
      res['shiftTab'] = sh.defaultPrevented;
      return res;
    });
    expect(prevented).toEqual({ c: false, v: false, a: false, Tab: false, shiftTab: false });
    await page.keyboard.press('Tab');
    await expect(t).not.toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(t).toBeFocused();
    expect(await actions(page)).toEqual([]);
  });

  test('Forced touch @touch', async ({ page }) => {
    await open(page, 'forms-select--forced');
    await combobox(page).tap();
    await page.waitForTimeout(300);
    await expect(listbox(page)).toHaveCount(0);
    expect(await actions(page)).toEqual([]);
  });

  test('Disabled: not focusable, never opens', async ({ page }) => {
    await open(page, 'forms-select--disabled');
    await expect(combobox(page)).toBeDisabled();
    await combobox(page).click({ force: true });
    await page.keyboard.press('Enter');
    await expect(listbox(page)).toHaveCount(0);
    expect(await actions(page)).toEqual([]);
  });

  test('Playground state=locked via args: nothing opens, Tab works', async ({ page }) => {
    await recordActions(page);
    await gotoStory(page, 'forms-select--manual', 'state:locked');
    const t = combobox(page);
    await t.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('i');
    await t.click();
    await expect(listbox(page)).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(t).not.toBeFocused();
    expect(await actions(page)).toEqual([]);
  });
});

// Select in a Dialog / Sheet (stacking, picks, Escape order) is covered by select.spec.ts and the
// `inside-dialog` / `inside-sheet` play functions, which a raw `gotoStory` here would race against.
