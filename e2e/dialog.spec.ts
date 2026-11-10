import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow, expectSingleScroller } from './helpers/geometry';
import { expectPlayToPass, gotoStory as openStory } from './helpers/story';

const STORY = (name: string) => `overlays-dialog--${name}`;

const WITHOUT_PLAY = new Set([STORY('unmount-while-open'), STORY('external-state-open')]);

/**
 * Opens a story and, when it has a play function, waits for it to finish: the tests below start
 * from the state the play leaves (a closed dialog with the focus back on its opener for the
 * trigger and external-state stories, an open one for the others), never racing against it.
 */
async function gotoStory(page: Page, id: string): Promise<void> {
  if (WITHOUT_PLAY.has(id)) await openStory(page, id);
  else await expectPlayToPass(page, id);
}

/** The two ways of opening the same dialog, with the controls that open each. */
const PATHS = [
  { name: 'trigger', story: STORY('playground'), opener: 'Open' },
  { name: 'external state', story: STORY('external-state'), opener: 'Open from state' },
] as const;

const dialogOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Edit supplier' });

test.describe('Overlays/Dialog: stories play', () => {
  for (const name of [
    'playground',
    'size-sm',
    'size-md',
    'size-lg',
    'size-xl',
    'long-content',
    'wide-table',
    'external-state',
    'not-dismissible',
    'nested',
    'class-override',
    'with-form',
  ]) {
    test(`${name}: the play function passes`, async ({ page }) => {
      await expectPlayToPass(page, STORY(name));
    });
  }
});

for (const path of PATHS) {
  test.describe(`opened by ${path.name}`, () => {
    test('modal semantics, name, description, focus inside, Tab and Shift+Tab confined, page inert, axe', async ({ page }) => {
      await gotoStory(page, path.story);
      const opener = page.getByRole('button', { name: path.opener });
      await opener.click();
      const dialog = dialogOf(page);
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await expect(dialog).toHaveAccessibleDescription('Update the supplier details and save.');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

      const inside = () => dialog.evaluate((el) => el.contains(document.activeElement));
      for (let i = 0; i < 7; i += 1) {
        await page.keyboard.press('Tab');
        expect(await inside()).toBe(true);
      }
      for (let i = 0; i < 7; i += 1) {
        await page.keyboard.press('Shift+Tab');
        expect(await inside()).toBe(true);
      }

      // The page behind is out of the accessibility tree (aria-hidden on the siblings of the portal).
      await expect(page.getByRole('button', { name: path.opener })).toHaveCount(0);
      expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(true);
      await expectNoA11yViolations(page);
    });

    test('Escape closes, and the focus returns to the opener', async ({ page }) => {
      await gotoStory(page, path.story);
      const opener = page.getByRole('button', { name: path.opener });
      await opener.click();
      await expect(dialogOf(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialogOf(page)).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
    });

    test('a click on the backdrop closes it and returns the focus', async ({ page }) => {
      await gotoStory(page, path.story);
      const opener = page.getByRole('button', { name: path.opener });
      await opener.click();
      await expect(dialogOf(page)).toBeVisible();
      await page.mouse.click(4, 4);
      await expect(dialogOf(page)).toHaveCount(0);
      await expect(opener).toBeFocused();
    });

    test('the close button is named after the title and closes', async ({ page }) => {
      await gotoStory(page, path.story);
      await page.getByRole('button', { name: path.opener }).click();
      await page.getByRole('button', { name: 'Close: Edit supplier' }).click();
      await expect(dialogOf(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: path.opener })).toBeFocused();
    });
  });
}

test.describe('browsers that do not focus a button on click', () => {
  test('the focus still returns to the trigger (mousedown default prevented, as Safari/Firefox on macOS behave)', async ({
    page,
  }) => {
    await gotoStory(page, STORY('playground'));
    await page.evaluate(() =>
      document.addEventListener('mousedown', (e) => {
        if ((e.target as Element).closest('button')) e.preventDefault();
      }),
    );
    // Not by role: the page is aria-hidden while the dialog is open.
    const opener = page.locator('button').filter({ hasText: /^Open$/ });
    await opener.click();
    await expect(dialogOf(page)).toBeVisible();
    await expect(opener).not.toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe('dismissible={false}', () => {
  test('Escape and the backdrop do nothing; an explicit button closes', async ({ page }) => {
    await gotoStory(page, STORY('not-dismissible'));
    const dialog = page.getByRole('dialog', { name: 'Delete the supplier?' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.click(4, 4);
    await expect(dialog).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('@engines a mousedown on the backdrop does not move the focus out of the panel', async ({ page }) => {
    await gotoStory(page, STORY('not-dismissible'));
    const dialog = page.getByRole('dialog', { name: 'Delete the supplier?' });
    await expect(dialog).toBeVisible();
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await cancel.focus();
    await expect(cancel).toBeFocused();
    // Real pointer press (down + up) on the backdrop, outside the panel.
    await page.mouse.move(4, 4);
    await page.mouse.down();
    await expect(cancel).toBeFocused();
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    await expect(cancel).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });
});

test.describe('dismissible={false} on touch @touch', () => {
  test('a tap on the backdrop does not move the focus out of the panel', async ({ page }) => {
    await gotoStory(page, STORY('not-dismissible'));
    const dialog = page.getByRole('dialog', { name: 'Delete the supplier?' });
    await expect(dialog).toBeVisible();
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await cancel.focus();
    await expect(cancel).toBeFocused();
    await page.touchscreen.tap(4, 4);
    await expect(dialog).toBeVisible();
    await expect(cancel).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });
});

test.describe('layout', () => {
  const MAX: Record<string, number> = { sm: 400, md: 560, lg: 720, xl: 960 };
  for (const [size, max] of Object.entries(MAX)) {
    test(`size ${size}: width is capped at ${max}px at desktop width`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoStory(page, STORY(`size-${size}`));
      const box = await dialogOf(page).boundingBox();
      expect(box!.width).toBeCloseTo(max, 0);
      // Horizontally centred.
      expect(box!.x + box!.width / 2).toBeCloseTo(640, 0);
    });
  }

  test('xl does not overflow a 360px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await gotoStory(page, STORY('size-xl'));
    const dialog = dialogOf(page);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    expect(box!.width).toBeCloseTo(328, 0);
    await expectNoHorizontalOverflow(dialog);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('a className that conflicts with the size width wins', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, STORY('class-override'));
    const box = await dialogOf(page).boundingBox();
    expect(box!.width).toBeCloseTo(400, 0);
  });

  test('long content: only the body scrolls, header and footer stay, the page is locked', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await gotoStory(page, STORY('long-content'));
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    await expectSingleScroller(dialog);
    const box = await dialog.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(600);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(600);

    const title = dialog.getByRole('heading', { name: 'Edit supplier' });
    const save = dialog.getByRole('button', { name: 'Save' });
    const before = [(await title.boundingBox())!.y, (await save.boundingBox())!.y];
    const body = dialog.locator('[tabindex="0"]');
    await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const after = [(await title.boundingBox())!.y, (await save.boundingBox())!.y];
    expect(after).toEqual(before);
    await expect(save).toBeInViewport();

    // The page behind does not scroll, with the mouse wheel over the backdrop either.
    await page.mouse.move(4, 300);
    await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    // The scrollable body is reachable by keyboard.
    await body.focus();
    await expect(body).toBeFocused();
  });

  test('a wide table scrolls horizontally inside the body; the dialog does not widen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, STORY('wide-table'));
    const dialog = dialogOf(page);
    const box = await dialog.boundingBox();
    expect(box!.width).toBeCloseTo(400, 0);
    const body = dialog.locator('[tabindex="0"]');
    expect(await body.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expectSingleScroller(dialog, 'x');
  });

  test('backdrop on the backdrop level, content on the modal level, no literal z-index', async ({ page }) => {
    await gotoStory(page, STORY('size-md'));
    await expect(dialogOf(page)).toBeVisible();
    const z = await page.evaluate(() => {
      const token = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      const dialog = document.querySelector('[role=dialog]') as HTMLElement;
      const backdrop = dialog.parentElement!.firstElementChild as HTMLElement;
      return {
        backdrop: getComputedStyle(backdrop).zIndex,
        content: getComputedStyle(dialog).zIndex,
        wrapper: getComputedStyle(dialog.parentElement!).zIndex,
        overlayToken: token('--z-index-rop-overlay'),
        modalToken: token('--z-index-rop-modal'),
        inlineZ: [backdrop, dialog].map((el) => el.style.zIndex),
      };
    });
    expect(z.backdrop).toBe(z.overlayToken);
    expect(z.content).toBe(z.modalToken);
    expect(z.wrapper).toBe(z.modalToken);
    expect(z.inlineZ).toEqual(['', '']);
  });
});

test.describe('no leak', () => {
  test('control props never reach the DOM, and nothing is logged', async ({ page }) => {
    const logged: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logged.push(m.text());
    });
    await gotoStory(page, STORY('size-xl'));
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    const attrs = await dialog.evaluate((el) => el.getAttributeNames());
    for (const forbidden of ['size', 'dismissible', 'returnfocusref', 'returnFocusRef']) {
      expect(attrs).not.toContain(forbidden);
    }
    expect(logged).toEqual([]);
  });
});

test.describe('edge cases', () => {
  test('nested: Escape closes only the top one, the second backdrop covers the first, the focus goes back inside the first', async ({
    page,
  }) => {
    // After the play function: the first dialog is open, the second closed, the focus on its opener.
    await gotoStory(page, STORY('nested'));
    const first = page.getByRole('dialog', { name: 'First dialog' });
    await expect(first).toBeVisible();
    await first.getByRole('button', { name: 'Open the second' }).click();
    const second = page.getByRole('dialog', { name: 'Second dialog' });
    await expect(second).toBeVisible();

    // The element on top at the first dialog's centre is the second layer, not the first dialog.
    const topIsSecondLayer = await page.evaluate(() => {
      const [a, b] = Array.from(document.querySelectorAll<HTMLElement>('[role=dialog]'));
      const r = a!.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 8, r.top + 8);
      return !!hit && !a!.contains(hit) && (b!.parentElement!.contains(hit) || hit === b!.parentElement);
    });
    expect(topIsSecondLayer).toBe(true);

    await page.keyboard.press('Escape');
    await expect(second).toHaveCount(0);
    await expect(first).toBeVisible();
    await expect(first.getByRole('button', { name: 'Open the second' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(first).toHaveCount(0);
  });

  test('mounted open (no opener): modal semantics, Escape closes, nothing throws and no inert page is left', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await gotoStory(page, STORY('with-form'));
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
    expect(await page.evaluate(() => document.querySelectorAll('[data-aria-hidden]').length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('unmounted while open: the scroll lock and the aria-hidden are released', async ({ page }) => {
    await gotoStory(page, STORY('unmount-while-open'));
    await expect(dialogOf(page)).toBeVisible();
    expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(true);
    await page.keyboard.press('u');
    await expect(dialogOf(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
    expect(await page.evaluate(() => document.querySelectorAll('[data-aria-hidden]').length)).toBe(0);
    await expect(page.getByRole('button', { name: 'Page button' })).toBeVisible();
    await page.getByRole('button', { name: 'Page button' }).click();
  });
});

// Keyboard-safe layout (spec §1.10): a desktop browser has no on-screen keyboard, so the visual
// viewport is a controllable stand-in (same technique as e2e/field.spec.ts).
test.describe('virtual keyboard', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('the dialog follows the visual viewport: the active field and the actions stay above the keyboard', async ({
    page,
  }) => {
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
    await gotoStory(page, STORY('with-form'));
    const dialog = dialogOf(page);
    const input = dialog.getByRole('textbox', { name: 'Company name' });
    await input.focus();
    const keyboard = 300;
    await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), keyboard);
    const limit = 667 - keyboard;
    await expect.poll(async () => (await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height).toBeLessThanOrEqual(limit);
    expect((await dialog.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect((await input.boundingBox())!.y + (await input.boundingBox())!.height).toBeLessThanOrEqual(limit);
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeInViewport();
    expect((await dialog.getByRole('button', { name: 'Save' }).boundingBox())!.y).toBeLessThan(limit);

    // Keyboard gone: back to the full viewport.
    await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(0));
    await expect.poll(async () => (await dialog.boundingBox())!.y + (await dialog.boundingBox())!.height).toBeGreaterThan(limit);
  });
});
