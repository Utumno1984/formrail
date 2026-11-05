import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `forms-select--${name}`;
// By role attribute, not `getByRole`: while the list is open Radix marks everything outside it
// `aria-hidden`, the trigger included, and the accessibility tree no longer lists it.
const combobox = (page: Page): Locator => page.locator('[role="combobox"]');
const listbox = (page: Page): Locator => page.getByRole('listbox');

/** The open list fits the viewport. */
async function openedListHasNoOverflow(page: Page): Promise<void> {
  const box = (await listbox(page).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
}

// The stories with a play function end in a known state (several with the list open); the tests
// that drive the real keyboard and mouse from a clean start use `manual`, which has no play.

test.describe('Forms/Select: stories play', () => {
  for (const name of [
    'playground',
    'base',
    'with-error',
    'disabled',
    'forced',
    'unknown-value',
    'inside-sheet',
    'long-list',
    'long-labels',
    'async-load',
    'empty',
    'inside-dialog',
  ]) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('mouse and keyboard', () => {
  test('click opens a portal listbox, a click picks, closes and shows the label', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const trigger = combobox(page);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Portal: the listbox is not inside the story root.
    expect(await listbox(page).evaluate((el) => !el.closest('#storybook-root'))).toBe(true);
    await page.getByRole('option', { name: 'Portogallo' }).click();
    await expect(listbox(page)).toHaveCount(0);
    await expect(trigger).toHaveText('Portogallo');
    await expect(trigger).toBeFocused();
  });

  for (const key of ['Enter', 'Space', 'ArrowDown']) {
    test(`${key} on the focused trigger opens the list`, async ({ page }) => {
      await gotoStory(page, STORY('manual'));
      await combobox(page).focus();
      await page.keyboard.press(key);
      await expect(listbox(page)).toBeVisible();
    });
  }

  test('arrows skip the disabled option, Home/End, typeahead, Enter picks, Escape closes without picking', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    const trigger = combobox(page);
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Italia' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Francia' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Spagna' })).toBeFocused(); // Germania skipped
    await page.keyboard.press('End');
    await expect(page.getByRole('option', { name: 'Austria' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('option', { name: 'Italia' })).toBeFocused();
    await page.keyboard.type('po');
    await expect(page.getByRole('option', { name: 'Portogallo' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(listbox(page)).toHaveCount(0);
    await expect(trigger).toHaveText('Seleziona');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Italia' })).toBeFocused();
    await page.keyboard.type('fr');
    await expect(page.getByRole('option', { name: 'Francia' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveText('Francia');
  });

  test('the disabled option cannot be picked with the mouse', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await combobox(page).click();
    await page.getByRole('option', { name: 'Germania' }).click({ force: true });
    await expect(listbox(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(combobox(page)).toHaveText('Seleziona');
  });

  test('the current option shows the decorative check and aria-selected', async ({ page }) => {
    await expectPlayToPass(page, STORY('base')); // ends with the list open
    const selected = page.getByRole('option', { name: 'Francia' });
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(selected.locator('svg')).toHaveCount(1);
    await expect(selected.locator('svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('option', { name: 'Italia' }).locator('svg')).toHaveCount(0);
  });
});

test.describe('no echo', () => {
  test('a value set from outside after the mount never calls onValueChange', async ({ page }) => {
    // Records the story's Actions events from before the play function runs ("Carica dati" is clicked there).
    await page.addInitScript(() => {
      const w = window as unknown as {
        __actions: unknown[];
        __STORYBOOK_ADDONS_CHANNEL__?: { on: (e: string, cb: (p: unknown) => void) => void };
      };
      w.__actions = [];
      const timer = setInterval(() => {
        if (!w.__STORYBOOK_ADDONS_CHANNEL__) return;
        clearInterval(timer);
        w.__STORYBOOK_ADDONS_CHANNEL__.on('storybook/actions/action-event', (p) => w.__actions.push(p));
      }, 1);
    });
    await expectPlayToPass(page, STORY('async-load')); // ends with the list open
    const actions = () => page.evaluate(() => (window as unknown as { __actions: unknown[] }).__actions.length);
    await expect(combobox(page)).toHaveText('Spagna');
    expect(await actions()).toBe(0);
    // A real pick afterwards is reported: the probe does work.
    await page.getByRole('option', { name: 'Italia' }).click();
    await expect(combobox(page)).toHaveText('Italia');
    await expect.poll(actions).toBe(1);
  });
});

test.describe('inside a Dialog', () => {
  test('the options are above the overlay (elementFromPoint), a pick leaves the dialog open, Escape closes the list first', async ({ page }) => {
    await expectPlayToPass(page, STORY('inside-dialog')); // ends with the list open
    const dialog = page.getByRole('dialog', { name: 'Modifica fornitore' });
    const trigger = combobox(page);
    const options = page.getByRole('option');
    const count = await options.count();
    expect(count).toBe(6);
    for (let i = 0; i < count; i += 1) {
      const hit = await options.nth(i).evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && el.contains(top);
      });
      expect(hit, `option ${i} is not the topmost element at its centre`).toBe(true);
    }
    await page.getByRole('option', { name: 'Spagna' }).click();
    await expect(listbox(page)).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(trigger).toHaveText('Spagna');

    await trigger.click();
    await expect(listbox(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listbox(page)).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('the popover wrapper is on the popover level, above the modal level, with no literal z-index', async ({ page }) => {
    await expectPlayToPass(page, STORY('inside-dialog')); // ends with the list open
    const z = await page.evaluate(() => {
      const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const list = document.querySelector('[role="listbox"]')!;
      const wrapper = list.closest('[data-radix-popper-content-wrapper]') as HTMLElement;
      const modal = document.querySelector('[role="dialog"]') as HTMLElement;
      return {
        wrapper: getComputedStyle(wrapper).zIndex,
        modal: getComputedStyle(modal).zIndex,
        popoverToken: css('--z-index-rop-popover'),
        modalToken: css('--z-index-rop-modal'),
      };
    });
    expect(z.popoverToken).not.toBe('');
    expect(z.wrapper).toBe(z.popoverToken);
    expect(z.modal).toBe(z.modalToken);
    expect(Number(z.wrapper)).toBeGreaterThan(Number(z.modal));
  });
});

test.describe('Field states', () => {
  test('disabled: not focusable and not openable', async ({ page }) => {
    await expectPlayToPass(page, STORY('disabled'));
    const trigger = combobox(page);
    await expect(trigger).toBeDisabled();
    await trigger.click({ force: true });
    await page.keyboard.press('Tab');
    await expect(trigger).not.toBeFocused();
    await expect(listbox(page)).toHaveCount(0);
  });

  test('forced: focusable, shows the value, never opens (click, Enter, Space, arrows, typeahead), reason described', async ({ page }) => {
    await expectPlayToPass(page, STORY('forced')); // tabs onto the trigger and tries to open it
    const trigger = combobox(page);
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveText('Italia');
    for (const key of ['Enter', 'Space', 'ArrowDown', 'ArrowUp', 'f', 'r']) {
      await page.keyboard.press(key);
      await expect(listbox(page)).toHaveCount(0);
    }
    await trigger.click();
    await expect(listbox(page)).toHaveCount(0);
    await expect(trigger).toHaveText('Italia');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const describedBy = await trigger.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('Deciso dal contratto quadro.');
  });
});

test.describe('geometry', () => {
  test('long list: the list scrolls inside a declared maximum height, the selected option is visible', async ({ page }) => {
    await expectPlayToPass(page, STORY('long-list')); // ends with the list open
    const info = await page.locator('[data-radix-select-viewport]').evaluate((el) => ({
      scrolls: el.scrollHeight > el.clientHeight,
      height: el.getBoundingClientRect().height,
    }));
    expect(info.scrolls).toBe(true);
    expect(info.height).toBeLessThanOrEqual(21 * 16);
    await expect(page.getByRole('option', { name: 'Cliente 150' })).toBeInViewport();
    await openedListHasNoOverflow(page);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  });

  test('long labels: the trigger stays within the Field and truncates', async ({ page }) => {
    await expectPlayToPass(page, STORY('long-labels')); // ends with the list open
    const trigger = combobox(page);
    const t = (await trigger.boundingBox())!;
    const f = (await trigger.locator('xpath=..').boundingBox())!;
    expect(t.width).toBeLessThanOrEqual(f.width + 0.5);
    expect(await page.locator('[role="combobox"] > span').first().evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await openedListHasNoOverflow(page);
  });

  test('near the bottom edge the list stays inside the viewport', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await page.setViewportSize({ width: 600, height: 260 });
    await combobox(page).click();
    await openedListHasNoOverflow(page);
  });
});

test.describe('accessibility', () => {
  test('axe: no violations with the list closed and open', async ({ page }) => {
    await gotoStory(page, STORY('manual'));
    await expectNoA11yViolations(page);
    await combobox(page).click();
    await expect(listbox(page)).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('axe: no violations with no options; the emptyLabel is a disabled option that is never picked', async ({ page }) => {
    await expectPlayToPass(page, STORY('empty'));
    // The play function ends with the list closed; the gestures below start from there.
    await expect(listbox(page)).toHaveCount(0);
    const trigger = combobox(page);
    await trigger.click();
    const list = listbox(page);
    await expect(list).toBeVisible();
    await expect(list.getByRole('option')).toHaveCount(1);
    const empty = list.getByRole('option', { name: 'No countries available', disabled: true });
    await expect(empty).toBeVisible();
    await expectNoA11yViolations(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    // `force`: Playwright never clicks an aria-disabled node on its own; a user still can.
    await empty.click({ force: true });
    await expect(list).toBeVisible();
    await expect(empty).not.toBeFocused();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveText('Select a country');
  });
});
