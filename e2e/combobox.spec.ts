import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-combobox--${name}`;
const input = (page: Page, name = 'Comune'): Locator => page.getByRole('combobox', { name });
const listbox = (page: Page): Locator => page.getByRole('listbox');

const activeIsInput = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('role') === 'combobox');

test.describe('Forms/Combobox: stories play', () => {
  for (const name of [
    'playground',
    'base',
    'no-results',
    'with-error',
    'disabled',
    'forced',
    'unknown-value',
    'long-list',
    'long-labels',
    'async-load',
    'inside-dialog',
    'inside-sheet',
  ]) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('keyboard', () => {
  test('arrows skip the disabled option, keep the focus on the input and aria-activedescendant on an existing node', async ({
    page,
  }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await box.click();
    await page.keyboard.type('m');
    for (const expected of ['Milano', 'Modena', 'Macerata']) {
      const active = await box.getAttribute('aria-activedescendant');
      expect(active).toBeTruthy();
      await expect(page.locator(`[id="${active}"]`)).toHaveText(expected);
      expect(await activeIsInput(page)).toBe(true);
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('Modena');
    await expect(listbox(page)).toHaveCount(0);
    expect(await activeIsInput(page)).toBe(true);
  });

  test('Escape closes the list without selecting; Tab closes without selecting', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await box.click();
    await page.keyboard.type('mi');
    await expect(listbox(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listbox(page)).toHaveCount(0);
    await expect(box).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.type('l');
    await expect(listbox(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(listbox(page)).toHaveCount(0);
    await expect(box).toHaveValue('');
  });

  test('on 200 options the active option is scrolled into view inside the list', async ({ page }) => {
    await gotoStory(page, STORY('long-list'));
    const box = input(page, 'Cliente');
    await box.click();
    await expect(listbox(page)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    for (let i = 0; i < 60; i += 1) await page.keyboard.press('ArrowDown');
    const rects = await page.evaluate(() => {
      const list = document.querySelector('[role="listbox"]')!.getBoundingClientRect();
      const id = document.querySelector('[role="combobox"]')!.getAttribute('aria-activedescendant')!;
      const option = document.getElementById(id)!.getBoundingClientRect();
      return {
        list: { top: list.top, bottom: list.bottom },
        option: { top: option.top, bottom: option.bottom },
      };
    });
    expect(rects.option.top).toBeGreaterThanOrEqual(rects.list.top - 1);
    expect(rects.option.bottom).toBeLessThanOrEqual(rects.list.bottom + 1);
    await page.keyboard.press('End');
    const last = await page.evaluate(() => {
      const list = document.querySelector('[role="listbox"]')!.getBoundingClientRect();
      const id = document.querySelector('[role="combobox"]')!.getAttribute('aria-activedescendant')!;
      const option = document.getElementById(id)!.getBoundingClientRect();
      return option.bottom <= list.bottom + 1 && option.top >= list.top - 1;
    });
    expect(last).toBe(true);
    expect(await activeIsInput(page)).toBe(true);
  });
});

test.describe('mouse', () => {
  test('click on the input opens; a second click does not close it; a click on an option selects once and keeps the focus', async ({
    page,
  }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await box.click();
    await expect(listbox(page)).toBeVisible();
    // Portal: the listbox is not inside the story root.
    expect(await listbox(page).evaluate((el) => !el.closest('#storybook-root'))).toBe(true);
    await box.click();
    await box.click();
    await expect(listbox(page)).toBeVisible();
    await page.getByRole('option', { name: 'Torino' }).click();
    await expect(box).toHaveValue('Torino');
    await expect(listbox(page)).toHaveCount(0);
    expect(await activeIsInput(page)).toBe(true);
  });

  test('pressing an option does not take the focus from the input (no revert between pointerdown and click)', async ({
    page,
  }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await box.click();
    await page.keyboard.type('to');
    const option = page.getByRole('option', { name: 'Torino' });
    const rect = (await option.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    expect(await activeIsInput(page)).toBe(true);
    await expect(box).toHaveValue('to');
    await expect(listbox(page)).toBeVisible();
    await page.mouse.up();
    await expect(box).toHaveValue('Torino');
  });

  test('leaving a typed text outside the results by click outside reverts to the selection', async ({ page }) => {
    await gotoStory(page, STORY('base'));
    const box = input(page);
    await box.click();
    await page.getByRole('option', { name: 'Torino' }).click();
    await box.fill('xyz');
    await expect(listbox(page)).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(box).toHaveValue('Torino');
    await expect(listbox(page)).toHaveCount(0);
  });

  test('the page scroll with the list open leaves the list anchored to the input', async ({ page }) => {
    await gotoStory(page, STORY('keyboard-safe'));
    const box = input(page);
    await box.scrollIntoViewIfNeeded();
    await box.click();
    await expect(listbox(page)).toBeVisible();
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(150);
    const gap = await page.evaluate(() => {
      const i = document.querySelector('[role="combobox"]')!.getBoundingClientRect();
      const l = document.querySelector('[role="listbox"]');
      if (!l) return 0;
      const r = l.getBoundingClientRect();
      return Math.min(Math.abs(r.top - i.bottom), Math.abs(r.bottom - i.top));
    });
    expect(gap).toBeLessThanOrEqual(12);
  });
});

test.describe('touch @touch', () => {
  test('a tap on an option selects it', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await box.tap();
    await expect(listbox(page)).toBeVisible();
    await page.getByRole('option', { name: 'Roma' }).tap();
    await expect(box).toHaveValue('Roma');
    await expect(listbox(page)).toHaveCount(0);
  });
});

test.describe('no echo and late data', () => {
  test('"Carica dati": the value and the options arrive from outside; the Actions log stays empty', async ({
    page,
  }) => {
    await expectPlayToPass(page, STORY('async-load'));
    await expect(input(page)).toHaveValue('Torino');
    // The play asserts `onValueChange` was not called; here the user can still pick afterwards.
    await input(page).click();
    await expect(page.getByRole('option', { name: 'Torino' })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('overlays', () => {
  for (const [name, container] of [
    ['dialog', 'inside-dialog'],
    ['sheet', 'inside-sheet'],
  ] as const) {
    test(`inside a ${name}: options are on top (elementFromPoint), a pick leaves it open, Escape closes the list first`, async ({
      page,
    }) => {
      await gotoStory(page, STORY(container));
      const box = page.getByRole('dialog').getByRole('combobox', { name: 'Comune' });
      // The story's play function has typed in the field already: start from a known text.
      await box.fill('o');
      await expect(listbox(page)).toBeVisible();
      const opts = page.getByRole('option');
      const count = await opts.count();
      expect(count).toBeGreaterThan(1);
      for (let i = 0; i < count; i += 1) {
        const hit = await opts.nth(i).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
        });
        expect(hit, `option ${i} is covered`).toBe(true);
      }
      // Escape: the list first, the dialog second.
      await page.keyboard.press('Escape');
      await expect(listbox(page)).toHaveCount(0);
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.type('x');
      await page.keyboard.press('Backspace');
      await expect(listbox(page)).toBeVisible();
      await page.getByRole('option', { name: 'Torino' }).click();
      await expect(box).toHaveValue('Torino');
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(listbox(page)).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }

  test('the popover wrapper is on the popover level, above the modal, with no literal z-index; the list has a max height and the input width as minimum', async ({
    page,
  }) => {
    await expectPlayToPass(page, STORY('inside-dialog')); // ends with the list open
    const z = await page.evaluate(() => {
      const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const list = document.querySelector('[role="listbox"]')!;
      const wrapper = list.closest('[data-radix-popper-content-wrapper]') as HTMLElement;
      const modal = document.querySelector('[role="dialog"]') as HTMLElement;
      const inputBox = document.querySelector('[role="combobox"]')!.getBoundingClientRect();
      return {
        wrapper: getComputedStyle(wrapper).zIndex,
        modal: getComputedStyle(modal).zIndex,
        popoverToken: css('--z-index-rop-popover'),
        modalToken: css('--z-index-rop-modal'),
        listWidth: list.getBoundingClientRect().width,
        inputWidth: inputBox.width,
        maxHeight: getComputedStyle(list).maxHeight,
      };
    });
    expect(z.popoverToken).not.toBe('');
    expect(z.wrapper).toBe(z.popoverToken);
    expect(z.modal).toBe(z.modalToken);
    expect(Number(z.wrapper)).toBeGreaterThan(Number(z.modal));
    expect(z.listWidth).toBeGreaterThanOrEqual(z.inputWidth - 1);
    expect(z.maxHeight).toBe('320px');
  });

  test('two comboboxes: distinct ids; opening the second closes the first', async ({ page }) => {
    await gotoStory(page, STORY('two'));
    const a = input(page, 'Comune di nascita');
    const b = input(page, 'Comune di residenza');
    expect(await a.getAttribute('aria-controls')).not.toBe(await b.getAttribute('aria-controls'));
    await a.click();
    await expect(listbox(page)).toHaveCount(1);
    // The open list covers the second field, so the user reaches it with Tab.
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await expect(a).toHaveAttribute('aria-expanded', 'false');
    await expect(b).toHaveAttribute('aria-expanded', 'true');
    await expect(listbox(page)).toHaveCount(1);
    const ids = await page.locator('[role="option"]').evaluateAll((els) => els.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('near the bottom edge the list stays inside the viewport', async ({ page }) => {
    await gotoStory(page, STORY('near-bottom'));
    const box = input(page);
    await box.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await box.click();
    await expect(listbox(page)).toBeVisible();
    const r = (await listbox(page).boundingBox())!;
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + r.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  });
});

test.describe('Field states', () => {
  test('disabled: not focusable and not openable', async ({ page }) => {
    await expectPlayToPass(page, STORY('disabled'));
    const box = input(page);
    await expect(box).toBeDisabled();
    await box.click({ force: true });
    await page.keyboard.press('Tab');
    await expect(box).not.toBeFocused();
    await expect(listbox(page)).toHaveCount(0);
  });

  test('forced: focusable, readOnly, never opens by keyboard or mouse, text unchanged, reason described', async ({
    page,
  }) => {
    await expectPlayToPass(page, STORY('forced'));
    const box = input(page);
    await box.focus();
    await expect(box).toHaveAttribute('readonly', '');
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'a']) {
      await page.keyboard.press(key);
      await expect(listbox(page)).toHaveCount(0);
    }
    await box.click();
    await expect(listbox(page)).toHaveCount(0);
    await expect(box).toHaveValue('Milano');
    await expect(box).toHaveAccessibleDescription('Deciso dal contratto quadro.');
  });
});

test.describe('layout and a11y', () => {
  test('long labels: the input does not widen the Field at 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await gotoStory(page, STORY('long-labels'));
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    const box = (await input(page, 'Ragione sociale').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(320);
  });

  test('no axe violations with the list closed and open', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await expectNoA11yViolations(page);
    await input(page).click();
    await expect(listbox(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('no results: no axe violations, the message is a disabled option the keyboard never reaches', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await box.click();
    await page.keyboard.type('zzz');
    const list = listbox(page);
    await expect(list).toBeVisible();
    await expect(list.getByRole('option')).toHaveCount(1);
    const empty = list.getByRole('option', { name: 'No results', disabled: true });
    await expect(empty).toBeVisible();
    await expectNoA11yViolations(page);
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter']) {
      await page.keyboard.press(key);
      await expect(box).not.toHaveAttribute('aria-activedescendant');
    }
    // `force`: Playwright never clicks an aria-disabled node on its own; a user still can.
    await empty.click({ force: true });
    await expect(box).toBeFocused();
    await expect(box).toHaveValue('zzz');
    await expect(list).toBeVisible();
    // Results again: the arrows reach the options as before.
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('mod');
    await expect(list.getByRole('option')).toHaveCount(1);
    await expect(list.getByRole('option', { name: 'No results' })).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    const id = await box.getAttribute('aria-activedescendant');
    await expect(list.getByRole('option', { name: 'Modena' })).toHaveAttribute('id', id!);
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('Modena');
    await expect(list).toBeHidden();
  });
});

test.describe('"no results" announcement', () => {
  const status = (page: Page): Locator => page.getByRole('status');

  /** Tags the region node and counts every mutation of its subtree from now on. */
  const watchStatus = (page: Page) =>
    page.evaluate(() => {
      const region = document.querySelector('[role="status"]') as (HTMLElement & { __ropTag?: string }) | null;
      if (!region) throw new Error('no status region');
      region.__ropTag = 'original';
      const w = window as unknown as { __ropMutations: number };
      w.__ropMutations = 0;
      new MutationObserver((records) => {
        w.__ropMutations += records.length;
      }).observe(region, { childList: true, characterData: true, subtree: true });
    });
  const mutations = (page: Page) =>
    page.evaluate(() => (window as unknown as { __ropMutations: number }).__ropMutations);
  const sameNode = (page: Page) =>
    page.evaluate(
      () => (document.querySelector('[role="status"]') as (HTMLElement & { __ropTag?: string }) | null)?.__ropTag,
    );

  test('the region is in the DOM before typing, visually hidden but not display:none, and empty', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await expect(status(page)).toHaveCount(1);
    await expect(status(page)).toHaveAttribute('aria-live', 'polite');
    await expect(status(page)).toHaveText('');
    const box = await status(page).evaluate((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { display: s.display, visibility: s.visibility, position: s.position, w: r.width, h: r.height };
    });
    expect(box.display).not.toBe('none');
    expect(box.visibility).toBe('visible');
    expect(box.position).toBe('absolute');
    expect(box.w).toBeLessThanOrEqual(1);
    expect(box.h).toBeLessThanOrEqual(1);
  });

  test('typing to no results fills the same node; results again empty it; axe clean in both states', async ({
    page,
  }) => {
    await gotoStory(page, STORY('manual'));
    await watchStatus(page);
    const box = input(page);
    await box.click();
    await page.keyboard.type('mi');
    await expect(listbox(page).getByRole('option', { name: 'Milano' })).toBeVisible();
    await expect(status(page)).toHaveText('');
    await page.keyboard.type('zz');
    await expect(listbox(page).getByRole('option', { name: 'No results', disabled: true })).toBeVisible();
    await expect(status(page)).toHaveText('No results');
    expect(await sameNode(page)).toBe('original');
    await expectNoA11yViolations(page);
    // The message option is not itself live: the screen reader reads the announcement once.
    await expect(listbox(page).locator('[aria-live], [role="status"], [role="alert"]')).toHaveCount(0);
    await expect(page.locator('[aria-live]')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('mod');
    await expect(listbox(page).getByRole('option', { name: 'Modena' })).toBeVisible();
    await expect(status(page)).toHaveText('');
    expect(await sameNode(page)).toBe('original');
    // The announcement leaves the options' navigation alone.
    await page.keyboard.press('ArrowDown');
    const id = await box.getAttribute('aria-activedescendant');
    await expect(listbox(page).getByRole('option', { name: 'Modena' })).toHaveAttribute('id', id!);
    await expectNoA11yViolations(page);
  });

  test('keystrokes that keep the "no results" state never touch the region; a new entry does', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await box.click();
    await page.keyboard.type('z');
    await expect(status(page)).toHaveText('No results');
    await watchStatus(page);
    for (const key of ['z', 'q', 'x', 'Backspace', 'ArrowDown', 'ArrowUp', 'w']) await page.keyboard.press(key);
    await expect(box).toHaveValue('zzqw');
    await expect(status(page)).toHaveText('No results');
    expect(await mutations(page)).toBe(0);
    // Out (results) and back in: one change each way, on the same node.
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('t');
    await expect(status(page)).toHaveText('');
    const out = await mutations(page);
    expect(out).toBeGreaterThan(0);
    await page.keyboard.type('zz');
    await expect(status(page)).toHaveText('No results');
    expect(await mutations(page)).toBeGreaterThan(out);
    expect(await sameNode(page)).toBe('original');
  });

  test('NoResults story with a custom emptyLabel: the announcement uses that label', async ({ page }) => {
    await expectPlayToPass(page, STORY('no-results'), 'emptyLabel:Nothing found');
    await expect(status(page)).toHaveText('Nothing found');
    await expect(listbox(page).getByRole('option', { name: 'Nothing found', disabled: true })).toBeVisible();
  });
});

// Keyboard-safe list (spec §1.10). Same stand-in as `e2e/field.spec.ts`: `__setKeyboard(px)`
// shrinks the visual viewport from the bottom and fires `resize`.
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
      Object.defineProperty(window, 'visualViewport', {
        value: vv,
        configurable: true,
      });
      (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard = (px) => {
        keyboard = px;
        target.dispatchEvent(new Event('resize'));
      };
    });
  });

  test('the input stays in the visible viewport and the list never ends under the keyboard', async ({ page }) => {
    await gotoStory(page, STORY('keyboard-safe'));
    const box = input(page);
    const keyboard = Math.round(667 * 0.45);
    await box.focus();
    await page.evaluate(
      (px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px),
      keyboard,
    );
    await page.keyboard.type('c');
    await expect(listbox(page)).toBeVisible();
    const visibleBottom = 667 - keyboard;
    await expect
      .poll(async () => {
        const l = (await listbox(page).boundingBox())!;
        return l.y + l.height;
      })
      .toBeLessThanOrEqual(visibleBottom);
    const i = (await box.boundingBox())!;
    expect(i.y + i.height).toBeLessThanOrEqual(visibleBottom);
    expect(i.y).toBeGreaterThanOrEqual(0);
    // The keyboard grows after the list is open: the list follows.
    await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(400));
    await expect
      .poll(async () => {
        const l = (await listbox(page).boundingBox())!;
        return l.y + l.height;
      })
      .toBeLessThanOrEqual(667 - 400);
  });

  test('with room under the input, the list opens below it and uses that room (the keyboard is not counted twice)', async ({
    page,
  }) => {
    await gotoStory(page, STORY('keyboard-safe'));
    const box = input(page);
    // The browser brings a focused field up the screen: put it 100px from the top.
    await box.evaluate((el) => {
      const top = el.getBoundingClientRect().top;
      window.scrollBy(0, top - 100);
    });
    await box.focus();
    const keyboard = 300;
    await page.evaluate(
      (px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px),
      keyboard,
    );
    await page.keyboard.type('c');
    await expect(listbox(page)).toBeVisible();
    const free = 667 - keyboard - (await box.evaluate((el) => el.getBoundingClientRect().bottom));
    expect(free).toBeGreaterThan(150);
    await expect
      .poll(async () => {
        const i = (await box.boundingBox())!;
        const l = (await listbox(page).boundingBox())!;
        return l.y >= i.y + i.height && l.height >= free - 30;
      })
      .toBe(true);
  });

  test('reopening with an arrow brings a deep selected option into view', async ({ page }) => {
    await gotoStory(page, STORY('long-list'));
    const box = input(page, 'Cliente');
    await box.click();
    await page.keyboard.type('150');
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('Cliente 150');
    await page.keyboard.press('ArrowDown');
    await expect(listbox(page)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const list = document.querySelector('[role="listbox"]')!.getBoundingClientRect();
          const id = document.querySelector('[role="combobox"]')!.getAttribute('aria-activedescendant')!;
          const option = document.getElementById(id)!.getBoundingClientRect();
          return option.top >= list.top - 1 && option.bottom <= list.bottom + 1;
        }),
      )
      .toBe(true);
  });
});
