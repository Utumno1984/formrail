import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-datepicker--${name}`;
const input = (scope: Page | Locator, name = 'Due date'): Locator => scope.getByRole('textbox', { name, exact: true });
const button = (scope: Page | Locator): Locator => scope.getByRole('button', { name: /^Choose date/ });
const popover = (page: Page): Locator => page.getByRole('dialog', { name: 'Choose date', exact: true });
const day = (scope: Page | Locator, name: string): Locator => scope.getByRole('gridcell', { name, exact: true });
const focusedIso = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-iso') ?? null);

/** True when the centre of `el` is hit by `elementFromPoint` on `el` itself (nothing covers it). */
const onTop = (el: Locator) =>
  el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });

test.describe('Forms/DatePicker: stories play', () => {
  for (const name of ['playground', 'async-hydration', 'inside-dialog', 'open']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('typing', () => {
  test('a typed date on Enter is committed and reformatted; a blur without edits changes nothing', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await expect(box).toHaveAttribute('placeholder', 'MM/DD/YYYY');
    await box.click();
    await page.keyboard.type('3/5/2026');
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('03/05/2026');
    await expect(page.getByTestId('value')).toHaveText('2026-03-05');
    await expect(button(page)).toHaveAccessibleName(/^Choose date, selected March 5, 2026/);
    await page.keyboard.press('Tab');
    await expect(button(page)).toBeFocused();
    await expect(page.getByTestId('value')).toHaveText('2026-03-05');
  });

  test('blur commits; an impossible date empties the value and keeps the text; emptying gives none', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const box = input(page);
    await box.fill('12/24/2026');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('value')).toHaveText('2026-12-24');
    await box.fill('13/45/2026');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('value')).toHaveText('none');
    await expect(box).toHaveValue('13/45/2026');
    await box.fill('2026-03-15');
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('03/15/2026');
    await expect(page.getByTestId('value')).toHaveText('2026-03-15');
    await box.fill('');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('value')).toHaveText('none');
  });

  test('it-IT: DD/MM/YYYY', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'locale:it-IT');
    const box = input(page);
    await expect(box).toHaveAttribute('placeholder', 'DD/MM/YYYY');
    await box.fill('15/03/2026');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('value')).toHaveText('2026-03-15');
  });
});

test.describe('popover', () => {
  test('click on the button: focus on today; arrows + Enter pick once, close, update the text, focus back on the button', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await button(page).click();
    await expect(popover(page)).toBeVisible();
    await expect(button(page)).toHaveAttribute('aria-expanded', 'true');
    expect(await focusedIso(page)).toBe('2026-03-10');
    await expectFocusRingVisible(day(page, 'Tuesday, March 10, 2026'));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(popover(page)).toHaveCount(0);
    await expect(input(page)).toHaveValue('03/17/2026');
    await expect(page.getByTestId('value')).toHaveText('2026-03-17');
    await expect(button(page)).toBeFocused();
    await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
    // Reopened: on the selected date.
    await page.keyboard.press('Enter');
    await expect(popover(page)).toBeVisible();
    expect(await focusedIso(page)).toBe('2026-03-17');
  });

  test('Alt+ArrowDown in the input opens on the typed date; Escape closes without change, focus back to the input', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await input(page).fill('04/02/2026');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(popover(page)).toBeVisible();
    expect(await focusedIso(page)).toBe('2026-04-02');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveValue('04/02/2026');
    await expect(page.getByTestId('value')).toHaveText('2026-04-02');
  });

  test('a click on a day picks it; a click outside closes; the button toggles', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await button(page).click();
    await day(page, 'Friday, March 20, 2026').click();
    await expect(popover(page)).toHaveCount(0);
    await expect(input(page)).toHaveValue('03/20/2026');
    await expect(button(page)).toBeFocused();
    await button(page).click();
    await expect(popover(page)).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(popover(page)).toHaveCount(0);
    await button(page).click();
    await expect(popover(page)).toBeVisible();
    await button(page).click();
    await expect(popover(page)).toHaveCount(0);
    await expect(page.getByTestId('value')).toHaveText('2026-03-20');
  });

  test('a click outside on the input closes and leaves the focus in the input', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await button(page).click();
    await input(page).click();
    await expect(popover(page)).toHaveCount(0);
    // Past the frame in which the focus would be returned.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(input(page)).toBeFocused();
  });

  test('the popover wrapper is on the popover level, with no literal z-index', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await button(page).click();
    const z = await popover(page).evaluate((el) => {
      const wrapper = el.closest('[data-radix-popper-content-wrapper]') as HTMLElement;
      return {
        wrapper: getComputedStyle(wrapper).zIndex,
        token: getComputedStyle(document.documentElement).getPropertyValue('--z-index-rop-popover').trim(),
        inline: el.getAttribute('style') ?? '',
      };
    });
    expect(z.token).not.toBe('');
    expect(z.wrapper).toBe(z.token);
    expect(z.inline).not.toMatch(/z-index/);
  });
});

test.describe('overlays', () => {
  for (const [name, story] of [
    ['Dialog', 'inside-dialog'],
    ['Sheet', 'inside-sheet'],
  ] as const) {
    test(`inside a ${name}: days on top, Escape closes only the popover (focus on the button), a pick keeps the ${name} open`, async ({ page }) => {
      await gotoStory(page, STORY(story));
      const modal = page.getByRole('dialog', { name: 'Edit invoice' });
      await expect(modal).toBeVisible();
      // gotoStory returns after the story's play (it opens the popover and closes it with Escape); the
      // check is kept as a guard so the test starts from a closed popover whatever the play does.
      if (await popover(page).count()) {
        await page.keyboard.press('Escape');
        await expect(popover(page)).toHaveCount(0);
      }
      const trigger = button(modal);
      await trigger.click();
      await expect(popover(page)).toBeVisible();
      const cells = popover(page).locator('[role="gridcell"]');
      const count = await cells.count();
      expect(count).toBe(31);
      for (let i = 0; i < count; i += 1) expect(await onTop(cells.nth(i)), `day ${i + 1} is covered`).toBe(true);
      const levels = await popover(page).evaluate((el) => {
        const wrapper = el.closest('[data-radix-popper-content-wrapper]') as HTMLElement;
        const panel = Array.from(document.querySelectorAll('[role="dialog"]')).find((d) => !d.contains(el) && d !== el) as HTMLElement;
        return { wrapper: Number(getComputedStyle(wrapper).zIndex), panel: Number(getComputedStyle(panel).zIndex) };
      });
      expect(levels.wrapper).toBeGreaterThan(levels.panel);
      await page.keyboard.press('Escape');
      await expect(popover(page)).toHaveCount(0);
      await expect(modal).toBeVisible();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await day(page, 'Friday, March 20, 2026').click();
      await expect(popover(page)).toHaveCount(0);
      await expect(input(modal)).toHaveValue('03/20/2026');
      await expect(modal).toBeVisible();
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
    });
  }
});

test.describe('Field states', () => {
  test('disabled: input and button out of the tab order, nothing opens', async ({ page }) => {
    await gotoStory(page, STORY('manual'), 'fieldState:disabled');
    await expect(input(page)).toBeDisabled();
    await expect(button(page)).toBeDisabled();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await button(page).click({ force: true });
    await expect(popover(page)).toHaveCount(0);
  });

  for (const state of ['forced', 'locked'] as const) {
    test(`${state}: readOnly input, focusable button that never opens (click, Enter, Space, Alt+ArrowDown), reason read`, async ({ page }) => {
      await gotoStory(page, STORY('manual'), `fieldState:${state}`);
      const box = input(page);
      await expect(box).toHaveAttribute('readonly', '');
      await expect(box).toHaveAccessibleDescription(/Set by the framework agreement\./);
      await page.keyboard.press('Tab');
      await expect(box).toBeFocused();
      await page.keyboard.type('03/15/2026');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Alt+ArrowDown');
      await expect(box).toHaveValue('');
      await expect(popover(page)).toHaveCount(0);
      await page.keyboard.press('Tab');
      await expect(button(page)).toBeFocused();
      await expect(button(page)).toHaveAccessibleDescription(/Set by the framework agreement\./);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await button(page).click();
      await expect(popover(page)).toHaveCount(0);
      await expect(button(page)).toHaveAttribute('aria-expanded', 'false');
      // The label click only focuses the input.
      await page.getByText('Due date', { exact: true }).click();
      await expect(box).toBeFocused();
      await expect(popover(page)).toHaveCount(0);
      await expect(page.getByTestId('value')).toHaveText('none');
    });
  }

  test('the popover open when the Field becomes locked: it closes, the focus goes back to the button', async ({ page }) => {
    await gotoStory(page, STORY('field-states'));
    await button(page).click();
    await expect(popover(page)).toBeVisible();
    // A state change from outside (no pointer, so not a "click outside" of the popover).
    await page.getByRole('button', { name: 'Make locked' }).evaluate((el) => (el as HTMLElement).click());
    await expect(popover(page)).toHaveCount(0);
    await expect(button(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(popover(page)).toHaveCount(0);
  });
});

test.describe('footprint and focus', () => {
  test('input and button on one row with the Input height (md 36px, sm 32px); same box empty and with a value', async ({ page }) => {
    await gotoStory(page, STORY('states'));
    const box = async (label: string) => {
      const field = page.getByRole('textbox', { name: label, exact: true });
      const trigger = page.getByRole('button', { name: new RegExp(`^Choose date.* ${label}$`) });
      const i = (await field.boundingBox())!;
      const b = (await trigger.boundingBox())!;
      return { i, b };
    };
    const empty = await box('Empty');
    const valued = await box('With a value');
    const small = await box('Small');
    for (const { i, b } of [empty, valued]) {
      expect(i.height).toBe(36);
      expect(b.height).toBe(36);
      expect(b.width).toBe(36);
      expect(b.y).toBe(i.y);
      expect(b.x).toBeGreaterThan(i.x + i.width);
    }
    expect(small.i.height).toBe(32);
    expect(small.b.height).toBe(32);
    expect(small.b.y).toBe(small.i.y);
    expect(valued.i.width).toBe(empty.i.width);
    // Two pickers never share a button name.
    const names = await page.getByRole('button', { name: /^Choose date/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby')));
    expect(new Set(names).size).toBe(names.length);
  });

  test('focus rings of the input and of the button are visible and not clipped', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await expectFocusRingVisible(input(page));
    await expectFocusRingVisible(button(page));
  });

  test('the value of a "fetch" fills the text with no reported change', async ({ page }) => {
    await expectPlayToPass(page, STORY('async-hydration'));
    await expect(input(page, 'Delivery date')).toHaveValue('07/14/2026');
  });
});

test.describe('motion', () => {
  test('with motion allowed the popover fades in with the overlay token; the focus is already on the day', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoStory(page, STORY('manual'));
    await button(page).click();
    const names = await popover(page).evaluate((el) => getComputedStyle(el).animationName);
    expect(names).toBe('rop-overlay-in');
    expect(await focusedIso(page)).toBe('2026-03-10');
  });

  test('reduced motion: no animation, the popover is at full opacity at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, STORY('manual'));
    await button(page).click();
    await expect(popover(page)).toBeVisible();
    expect(await popover(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await popover(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await focusedIso(page)).toBe('2026-03-10');
  });
});

test.describe('accessibility', () => {
  test('no axe violations closed and open', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await expectNoA11yViolations(page);
    await button(page).click();
    await expect(popover(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('no axe violations in the Field states and locales', async ({ page }) => {
    await gotoStory(page, STORY('states'));
    await expectNoA11yViolations(page);
    await gotoStory(page, STORY('locales'));
    await expectNoA11yViolations(page);
  });
});

test.describe('mobile 375x667', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('the popover is entirely inside the viewport, no horizontal overflow, 40px day cells', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await button(page).click();
    await expect(popover(page)).toBeVisible();
    const r = (await popover(page).boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(375);
    expect(r.y + r.height).toBeLessThanOrEqual(667);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    const cell = (await day(page, 'Tuesday, March 10, 2026').boundingBox())!;
    expect(cell.width).toBeGreaterThanOrEqual(40);
    expect(cell.height).toBeGreaterThanOrEqual(40);
  });
});

test.describe('touch @touch', () => {
  test('a tap on the button opens, a tap on a day picks it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, STORY('manual'));
    await button(page).tap();
    await expect(popover(page)).toBeVisible();
    await day(page, 'Wednesday, March 25, 2026').tap();
    await expect(popover(page)).toHaveCount(0);
    await expect(input(page)).toHaveValue('03/25/2026');
    await expect(page.getByTestId('value')).toHaveText('2026-03-25');
  });
});

// Keyboard-safe field (spec §1.10). Same stand-in as `e2e/field.spec.ts` / `e2e/combobox.spec.ts`:
// `__setKeyboard(px)` shrinks the visual viewport from the bottom and fires `resize`.
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

  test('with the focus in the input the field stays above the keyboard', async ({ page }) => {
    await gotoStory(page, STORY('keyboard-safe'));
    const box = input(page);
    const keyboard = Math.round(667 * 0.45);
    // Precondition: the field at the very bottom edge, visible now but covered by the keyboard later,
    // so the test fails without the keyboard-safe behaviour.
    await box.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    expect(await box.evaluate((el) => el.getBoundingClientRect().bottom)).toBeGreaterThan(667 - keyboard);
    await box.focus();
    await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), keyboard);
    const visibleBottom = 667 - keyboard;
    await expect
      .poll(async () => {
        const i = (await box.boundingBox())!;
        return i.y + i.height;
      })
      .toBeLessThanOrEqual(visibleBottom);
    const i = (await box.boundingBox())!;
    expect(i.y).toBeGreaterThanOrEqual(0);
  });
});
