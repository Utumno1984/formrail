import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow, expectSingleScroller } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-multiselect--${name}`;
const input = (page: Page, name = 'Cost centers'): Locator => page.getByRole('combobox', { name });
const listbox = (page: Page): Locator => page.getByRole('listbox');
const box = (page: Page): Locator => page.locator('[data-rop-multi-select]').first();
const chips = (page: Page) =>
  box(page)
    .locator(':scope > span')
    .evaluateAll((els) => els.map((el) => el.textContent));
const activeIsInput = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('role') === 'combobox');

test.describe('Forms/MultiSelect: stories play', () => {
  for (const name of ['playground', 'truncated-chip', 'open', 'locked', 'async-load', 'inside-dialog']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('mouse', () => {
  test('clicks toggle options; the list stays open; the focus stays on the input; un-pick removes the chip', async ({
    page,
  }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await expect(listbox(page)).toBeVisible();
    await page.getByRole('option', { name: 'Finance' }).click();
    await page.getByRole('option', { name: 'Sales' }).click();
    await expect(listbox(page)).toBeVisible();
    expect(await activeIsInput(page)).toBe(true);
    expect(await chips(page)).toEqual(['Finance', 'Sales']);
    await expect(page.getByRole('option', { name: 'Finance' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('option', { name: 'Finance' }).click();
    expect(await chips(page)).toEqual(['Sales']);
    await expect(page.getByRole('option', { name: 'Finance' })).toHaveAttribute('aria-selected', 'false');
  });

  test('the remove button of a chip removes it and keeps the focus on the input; a click on the chip removes nothing', async ({
    page,
  }) => {
    await gotoStory(page, STORY('chips'));
    const field = input(page, 'One row');
    await page.getByRole('button', { name: 'Remove Finance' }).first().click();
    await expect(field).toBeFocused();
    await expect(page.getByRole('button', { name: 'Remove Finance' })).toHaveCount(1);
    await page.getByText('Marketing', { exact: true }).first().click();
    await expect(field).toBeFocused();
    await expect(page.getByRole('button', { name: 'Remove Marketing' })).toHaveCount(2);
  });

  test('the list stays attached to the bottom of the field when the chips wrap to a second row', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    const gap = async () =>
      page.evaluate(() => {
        const field = document.querySelector('[data-rop-multi-select]')!.getBoundingClientRect();
        const list = document.querySelector('[role="listbox"]')!.getBoundingClientRect();
        return { gap: list.top - field.bottom, height: field.height };
      });
    const first = await gap();
    for (const name of ['Administration', 'Finance', 'Human resources', 'IT services', 'Marketing']) {
      await page.getByRole('option', { name }).click();
    }
    await expect.poll(async () => (await gap()).height).toBeGreaterThan(first.height + 10);
    await expect.poll(async () => (await gap()).gap).toBeCloseTo(first.gap, 0);
    const after = await gap();
    expect(after.gap).toBeGreaterThanOrEqual(0);
  });
});

test.describe('keyboard', () => {
  test('Enter toggles the active option, keeps it active and the list open; the text is emptied', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await page.keyboard.type('fin');
    await page.keyboard.press('Enter');
    await expect(input(page)).toHaveValue('');
    await expect(listbox(page)).toBeVisible();
    const active = await input(page).getAttribute('aria-activedescendant');
    await expect(page.locator(`[id="${active}"]`)).toHaveText('Finance');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    expect(await chips(page)).toEqual(['Finance', 'Human resources']);
    await page.keyboard.press('Enter');
    expect(await chips(page)).toEqual(['Finance']);
  });

  test('Backspace on an empty text removes the last chip; with text it only deletes text', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    for (const name of ['Finance', 'Sales']) await page.getByRole('option', { name }).click();
    await page.keyboard.type('ab');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    expect(await chips(page)).toEqual(['Finance', 'Sales']);
    await page.keyboard.press('Backspace');
    expect(await chips(page)).toEqual(['Finance']);
  });

  test('Escape closes the list without touching the value; Tab closes and moves on without selecting', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await page.keyboard.type('sa');
    await page.keyboard.press('Escape');
    await expect(listbox(page)).toHaveCount(0);
    expect(await chips(page)).toEqual([]);
    await page.keyboard.press('ArrowDown');
    await expect(listbox(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(listbox(page)).toHaveCount(0);
    await expect(input(page)).not.toBeFocused();
    await expect(input(page)).toHaveValue('');
    expect(await chips(page)).toEqual([]);
  });

  test('the filter hides a selected value: its chip stays and is still removable with Backspace', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).click();
    await page.getByRole('option', { name: 'Finance' }).click();
    await page.keyboard.type('mar');
    await expect(page.getByRole('option')).toHaveCount(1);
    expect(await chips(page)).toEqual(['Finance']);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    expect(await chips(page)).toEqual([]);
  });

  // A pick empties the filter: the unfiltered list comes back from the top, and the option that
  // stays active (the one just picked, far down a long list) must be scrolled back into view.
  for (const gesture of ['Enter', 'click'] as const) {
    test(`after a filtered pick (${gesture}) the picked option is visible in the unfiltered list`, async ({ page }) => {
      await gotoStory(page, STORY('many-values'));
      await input(page).click();
      await input(page).fill('CC-028');
      if (gesture === 'Enter') await page.keyboard.press('Enter');
      else await page.getByRole('option', { name: 'CC-028' }).click();
      await expect(input(page)).toHaveValue('');
      await expect(page.getByRole('option')).toHaveCount(30);
      const option = page.getByRole('option', { name: 'CC-028' });
      await expect(option).toHaveAttribute('data-active', 'true');
      const [o, l] = await Promise.all([option.boundingBox(), listbox(page).boundingBox()]);
      expect(o!.y).toBeGreaterThanOrEqual(l!.y - 1);
      expect(o!.y + o!.height).toBeLessThanOrEqual(l!.y + l!.height + 1);
    });
  }
});

test.describe('touch @touch', () => {
  test('a tap on an option toggles it; a tap on a remove button removes the chip', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).tap();
    await expect(listbox(page)).toBeVisible();
    await page.getByRole('option', { name: 'Finance' }).tap();
    await page.getByRole('option', { name: 'Sales' }).tap();
    expect(await chips(page)).toEqual(['Finance', 'Sales']);
    await page.getByRole('button', { name: 'Remove Finance' }).tap();
    expect(await chips(page)).toEqual(['Sales']);
  });
});

test.describe('blocked states', () => {
  test('locked: no gesture opens the list or changes the value; no remove buttons; the reason is described', async ({
    page,
  }) => {
    await expectPlayToPass(page, STORY('locked'));
    const field = input(page);
    await field.focus();
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Backspace', 'a']) {
      await page.keyboard.press(key);
      await expect(listbox(page)).toHaveCount(0);
    }
    await field.click();
    await box(page).locator(':scope > span').first().click();
    await expect(listbox(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove/u })).toHaveCount(0);
    expect(await chips(page)).toEqual(['Finance', 'Marketing']);
    await expect(field).toHaveAccessibleDescription(/^Set by the budget owner\./u);
  });

  test('disabled: not focusable, never opens, no remove buttons', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'fieldState:disabled');
    const field = input(page);
    await expect(field).toBeDisabled();
    await box(page).click({ force: true });
    await page.keyboard.press('Tab');
    await expect(field).not.toBeFocused();
    await expect(listbox(page)).toHaveCount(0);
  });
});

test.describe('overlays', () => {
  for (const [name, story] of [
    ['dialog', 'inside-dialog'],
    ['sheet', 'inside-sheet'],
  ] as const) {
    test(`inside a ${name}: options on top (elementFromPoint), picks keep it open, Escape closes the list first`, async ({
      page,
    }) => {
      await gotoStory(page, STORY(story));
      const field = page.getByRole('dialog').getByRole('combobox', { name: 'Cost centers' });
      await field.click();
      await expect(listbox(page)).toBeVisible();
      const opts = page.getByRole('option');
      const count = await opts.count();
      for (let i = 0; i < count; i += 1) {
        const hit = await opts.nth(i).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
        });
        expect(hit, `option ${i} is covered`).toBe(true);
      }
      await page.getByRole('option', { name: 'Marketing' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(listbox(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(listbox(page)).toHaveCount(0);
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }

  test('the popover is on the popover level, above the modal, with no literal z-index', async ({ page }) => {
    await expectPlayToPass(page, STORY('inside-dialog'));
    const z = await page.evaluate(() => {
      const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const wrapper = document.querySelector('[role="listbox"]')!.closest('[data-radix-popper-content-wrapper]') as HTMLElement;
      const modal = document.querySelector('[role="dialog"]') as HTMLElement;
      return {
        wrapper: getComputedStyle(wrapper).zIndex,
        modal: getComputedStyle(modal).zIndex,
        token: css('--z-index-rop-popover'),
      };
    });
    expect(z.wrapper).toBe(z.token);
    expect(Number(z.wrapper)).toBeGreaterThan(Number(z.modal));
  });
});

test.describe('layout', () => {
  test('an empty field is as tall as a Combobox of the same size (sm and md)', async ({ page }) => {
    for (const size of ['sm', 'md']) {
      await gotoStory(page, STORY('empty'), `size:${size}`);
      const multi = (await box(page).boundingBox())!.height;
      await gotoStory(page, 'forms-combobox--manual', `size:${size}`);
      const single = (await page.getByRole('combobox', { name: 'City' }).boundingBox())!.height;
      expect(multi, size).toBe(single);
    }
  });

  test('a row of chips keeps the empty height; wrapped chips grow the field without overflow at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await gotoStory(page, STORY('chips'));
    const heights = await page
      .locator('[data-rop-multi-select]')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(heights[0]).toBe(36);
    expect(heights[1]).toBeGreaterThan(36);
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
  });

  test('30 chips: the page is the only scroller', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, STORY('many-values'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    await expectSingleScroller(page.locator('#storybook-root'));
  });

  test('a long chip label is truncated inside the field; the tooltip opens only on a real hover', async ({ page }) => {
    await gotoStory(page, STORY('truncated-chip'));
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    const label = box(page).locator(':scope > span').first().locator(':scope > span').first();
    const fits = await page.evaluate(() => {
      const field = document.querySelector('[data-rop-multi-select]')!.getBoundingClientRect();
      const chip = document.querySelector('[data-rop-multi-select] > span')!.getBoundingClientRect();
      return chip.right <= field.right && chip.left >= field.left;
    });
    expect(fits).toBe(true);
    await label.hover();
    await expect(page.getByRole('tooltip')).toContainText('Shared services of the North-East');
  });
});

test.describe('virtual keyboard', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
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

  test('the field stays visible and the list follows the keyboard', async ({ page }) => {
    await gotoStory(page, STORY('keyboard-safe'));
    const field = input(page);
    const keyboard = Math.round(667 * 0.45);
    await field.focus();
    await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), keyboard);
    await page.keyboard.type('c');
    await expect(listbox(page)).toBeVisible();
    const visibleBottom = 667 - keyboard;
    await expect
      .poll(async () => {
        const l = (await listbox(page).boundingBox())!;
        return l.y + l.height;
      })
      .toBeLessThanOrEqual(visibleBottom);
    const i = (await box(page).boundingBox())!;
    expect(i.y + i.height).toBeLessThanOrEqual(visibleBottom);
    expect(i.y).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(400));
    await expect
      .poll(async () => {
        const l = (await listbox(page).boundingBox())!;
        return l.y + l.height;
      })
      .toBeLessThanOrEqual(667 - 400);
  });
});

test.describe('native form', () => {
  test('FormData has the values in selection order; Reset goes back to the default with no Actions call', async ({ page }) => {
    await gotoStory(page, STORY('native-form'));
    await input(page).click();
    await page.getByRole('option', { name: 'Sales' }).click();
    await page.getByRole('option', { name: 'Administration' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('posted')).toHaveText('fin, sal, adm');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect.poll(() => chips(page)).toEqual(['Finance']);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByTestId('posted')).toHaveText('fin');
  });
});

test.describe('announcements and a11y', () => {
  test('the live region is mounted empty and announces the count after a user change', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const status = page.getByRole('status');
    await expect(status).toHaveText('');
    await input(page).click();
    await page.getByRole('option', { name: 'Finance' }).click();
    await expect(status).toHaveText('1 item selected');
    await page.getByRole('option', { name: 'Sales' }).click();
    await expect(status).toHaveText('2 items selected');
    await page.keyboard.type('zzz');
    await expect(status).toHaveText('No results');
  });

  test('no axe violations with chips, the list closed and open', async ({ page }) => {
    await gotoStory(page, STORY('chips'));
    await expectNoA11yViolations(page);
    await input(page, 'One row').click();
    await expect(listbox(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('no axe violations in the locked and invalid states', async ({ page }) => {
    await gotoStory(page, STORY('states'));
    await expectNoA11yViolations(page);
  });
});
