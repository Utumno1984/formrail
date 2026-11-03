import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const STORY = (name: string) => `overlays-toast--${name}`;

const status = (page: Page) => page.getByRole('status');
const alert = (page: Page) => page.getByRole('alert');
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });

// The stories with a play function are opened with `expectPlayToPass`: the tests below start from the
// clean state that play ends in (toast closed, focus on "Save"), so they never race with it.

test.describe('Overlays/Toast: stories play', () => {
  for (const name of ['playground', 'with-action', 'tones', 'variants', 'long-text', 'inside-dialog', 'inside-sheet']) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

test.describe('live regions and focus', () => {
  test('the regions exist before any show and are the same nodes after it', async ({ page }) => {
    await expectPlayToPass(page, STORY('playground'), 'duration:persistent');
    await expect(status(page)).toBeEmpty();
    await expect(alert(page)).toBeEmpty();
    const region = await status(page).elementHandle();
    await save(page).click();
    await expect(status(page)).toContainText('Saved');
    expect(await status(page).evaluate((el, ref) => el === ref, region)).toBe(true);
    await expect(alert(page)).toBeEmpty();
  });

  test('tone error is announced in the assertive region', async ({ page }) => {
    await expectPlayToPass(page, STORY('playground'), 'tone:error;description:Upload failed;duration:persistent');
    await expect(alert(page)).toBeEmpty();
    await save(page).click();
    await expect(alert(page)).toContainText('Upload failed');
    await expect(status(page)).toBeEmpty();
  });

  test('Save keeps the focus on the button; a plain toast closes by itself after 5 s', async ({ page }) => {
    await expectPlayToPass(page, STORY('playground'));
    await save(page).click();
    await expect(status(page)).toContainText('Saved');
    await expect(save(page)).toBeFocused();
    await expect(status(page)).toBeEmpty({ timeout: 8000 });
  });

  test('a toast shown by a timer never takes the focus from the field, with an action too', async ({ page }) => {
    await gotoStory(page, STORY('shown-by-timer'));
    const input = page.getByLabel('Note');
    await input.focus();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(input).toBeFocused();
    await page.keyboard.type('abc');
    await expect(input).toHaveValue('abc');
  });

  test('a toast with an action is still there after the 5 s a plain one lasts', async ({ page }) => {
    await gotoStory(page, STORY('shown-by-timer'));
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.waitForTimeout(5500);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  });

  test('a second show replaces the first: one toast, the new text', async ({ page }) => {
    await expectPlayToPass(page, STORY('playground'), 'duration:persistent');
    await save(page).click();
    await expect(status(page)).toContainText('Saved');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(status(page).getByText('Draft saved')).toHaveCount(1);
    await expect(status(page).getByText('Saved', { exact: true })).toHaveCount(0);
    await expect(status(page).locator('[data-state]')).toHaveCount(1);
  });

  test('the close button has the title in its name and closes the toast, returning the focus', async ({ page }) => {
    await expectPlayToPass(page, STORY('playground'), 'duration:persistent;title:Invoice');
    await save(page).click();
    await page.getByRole('button', { name: 'Dismiss notification: Invoice' }).click();
    await expect(status(page)).toBeEmpty();
    await expect(save(page)).toBeFocused();
  });

  test('F8 moves the focus to the toast, Tab reaches action then close, Escape inside closes it and returns the focus', async ({
    page,
  }) => {
    await expectPlayToPass(page, STORY('with-action'));
    await save(page).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.keyboard.press('F8');
    await expect(status(page).locator('[data-state="open"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Dismiss notification' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(status(page)).toBeEmpty();
    await expect(save(page)).toBeFocused();
  });

  test('Escape with the focus outside the toast leaves it open', async ({ page }) => {
    await expectPlayToPass(page, STORY('playground'), 'duration:persistent');
    await save(page).click();
    await expect(status(page)).toContainText('Saved');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(status(page)).toContainText('Saved');
    await expect(save(page)).toBeFocused();
  });

  test('the action runs and closes the toast; the focus goes back to where it was', async ({ page }) => {
    await expectPlayToPass(page, STORY('with-action'));
    await save(page).click();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(status(page)).toBeEmpty();
    await expect(save(page)).toBeFocused();
  });

  test('no accessibility violations with a toast on screen', async ({ page }) => {
    await expectPlayToPass(page, STORY('with-action'));
    await save(page).click();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  for (const name of ['tones', 'variants', 'long-text']) {
    test(`${name}: no accessibility violations`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
      await expectNoA11yViolations(page);
    });
  }

  test('focus rings of the action and the close button are visible and not clipped', async ({ page }) => {
    await expectPlayToPass(page, STORY('with-action'));
    await save(page).click();
    await expectFocusRingVisible(page.getByRole('button', { name: 'Undo' }));
    await expectFocusRingVisible(page.getByRole('button', { name: 'Dismiss notification' }));
  });
});

test.describe('inside modals', () => {
  for (const name of ['inside-dialog', 'inside-sheet']) {
    test(`${name}: the toast is announced, visible, clickable, and closing it does not close the modal`, async ({
      page,
    }) => {
      await expectPlayToPass(page, STORY(name));
      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible();
      await modal.getByRole('button', { name: 'Save' }).click();
      const toast = status(page).locator('[data-state="open"]');
      await expect(toast).toBeVisible();
      // Not under an aria-hidden subtree, checked on the real DOM.
      expect(await status(page).evaluate((el) => el.closest('[aria-hidden="true"]') === null)).toBe(true);
      expect(await alert(page).evaluate((el) => el.closest('[aria-hidden="true"]') === null)).toBe(true);
      // The modal locks the page pointer; the toast opts back in and is on top at its centre.
      expect(await page.evaluate(() => getComputedStyle(document.body).pointerEvents)).toBe('none');
      expect(
        await toast.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!hit && el.contains(hit);
        }),
      ).toBe(true);
      await page.getByRole('button', { name: 'Dismiss notification' }).click();
      await expect(status(page)).toBeEmpty();
      await expect(modal).toBeVisible();
    });
  }

  test('the toast stays when the modal closes and is reachable with F8 again', async ({ page }) => {
    await expectPlayToPass(page, STORY('inside-dialog'));
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: 'Save' }).click();
    await expect(status(page)).toContainText('Saved from the dialog');
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(status(page)).toContainText('Saved from the dialog');
    await page.keyboard.press('F8');
    await expect(status(page).locator('[data-state="open"]')).toBeFocused();
  });

  test('over an open Select inside a Dialog, the centre of the overlap belongs to the toast', async ({ page }) => {
    await gotoStory(page, STORY('over-select-inside-dialog'));
    await page.getByRole('combobox', { name: 'Payment terms' }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(status(page).locator('[data-state="open"]').last()).toBeVisible();
    const hit = await page.evaluate(() => {
      const list = document.querySelector('[role="listbox"]') as HTMLElement;
      const toast = Array.from(document.querySelectorAll<HTMLElement>('[role="status"] [data-state="open"]')).at(-1)!;
      // Slide the viewport down so that the toast sits right over the open list.
      const viewport = toast.closest('[role="status"]')!.parentElement as HTMLElement;
      viewport.style.top = `${list.getBoundingClientRect().top + 8}px`;
      const a = list.getBoundingClientRect();
      const b = toast.getBoundingClientRect();
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      if (right <= left || bottom <= top) return 'no-overlap';
      const el = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      return el && toast.contains(el) ? 'toast' : (el?.tagName ?? 'none');
    });
    expect(hit).toBe('toast');
  });
});

test.describe('motion', () => {
  test('animates in, and the node leaves the DOM only after the exit', async ({ page }) => {
    await expectPlayToPass(page, STORY('playground'), 'duration:persistent');
    await save(page).click();
    const toast = status(page).locator('[data-state="open"]');
    await expect(toast).toBeVisible();
    expect(await toast.evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(status(page)).toBeEmpty();
  });

  test('with prefers-reduced-motion it appears and disappears at once, with no animation on the node', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expectPlayToPass(page, STORY('playground'), 'duration:persistent');
    await save(page).click();
    const toast = status(page).locator('[data-state="open"]');
    await expect(toast).toBeVisible();
    expect(await toast.evaluate((el) => el.getAnimations().length)).toBe(0);
    expect(await toast.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(status(page).locator('[data-state="closed"]')).toHaveCount(0);
    await expect(status(page)).toBeEmpty();
  });
});

test.describe('mobile and keyboard', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('at 375px it fills the width minus the margins, without horizontal overflow', async ({ page }) => {
    await expectPlayToPass(page, STORY('long-text'));
    const box = await page.locator('[data-state="open"]').first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeCloseTo(16, 0);
    expect(box!.width).toBeCloseTo(343, 0);
    await expectNoHorizontalOverflow(page.locator('body'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
      true,
    );
  });

  test('the lower edge stays above --rop-keyboard-inset', async ({ page }) => {
    await expectPlayToPass(page, STORY('playground'), 'duration:persistent');
    await save(page).click();
    const toast = status(page).locator('[data-state="open"]');
    await expect(toast).toBeVisible();
    await page.waitForTimeout(400);
    const before = (await toast.boundingBox())!;
    expect(before.y + before.height).toBeLessThanOrEqual(667 - 16 + 1);
    await page.evaluate(() => document.documentElement.style.setProperty('--rop-keyboard-inset', '300px'));
    const after = (await toast.boundingBox())!;
    expect(after.y + after.height).toBeLessThanOrEqual(667 - 300);
  });
});
