import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow, expectSingleScroller } from './helpers/geometry';
import { expectPlayToPass, gotoStory as openStory } from './helpers/story';

const STORY = (name: string) => `overlays-sheet--${name}`;

const WITHOUT_PLAY = new Set<string>();

/** Waits for the play function when the story has one: the tests start from the state it leaves. */
async function gotoStory(page: Page, id: string, args?: string): Promise<void> {
  if (WITHOUT_PLAY.has(id)) await openStory(page, id, args);
  else await expectPlayToPass(page, id, args);
}

/** The two ways of opening the same sheet, with the controls that open each. */
const PATHS = [
  { name: 'trigger', story: STORY('playground'), opener: 'Apri' },
  { name: 'external state', story: STORY('external-state'), opener: 'Apri da stato' },
] as const;

const sheetOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Dettaglio fornitore' });

test.describe('Overlays/Sheet: stories play', () => {
  for (const name of [
    'playground',
    'left',
    'size-sm',
    'size-md',
    'size-lg',
    'long-content',
    'external-state',
    'not-dismissible',
    'over-a-dialog',
    'over-a-dialog-from-button',
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
      await page.getByRole('button', { name: path.opener }).click();
      const sheet = sheetOf(page);
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAttribute('aria-modal', 'true');
      await expect(sheet).toHaveAccessibleDescription('Consulta e modifica i dati anagrafici.');
      expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);

      const inside = () => sheet.evaluate((el) => el.contains(document.activeElement));
      for (let i = 0; i < 7; i += 1) {
        await page.keyboard.press('Tab');
        expect(await inside()).toBe(true);
      }
      for (let i = 0; i < 7; i += 1) {
        await page.keyboard.press('Shift+Tab');
        expect(await inside()).toBe(true);
      }
      await expect(page.getByRole('button', { name: path.opener })).toHaveCount(0);
      expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(true);
      await expectNoA11yViolations(page);
    });

    test('Escape closes, and the focus returns to the opener', async ({ page }) => {
      await gotoStory(page, path.story);
      const opener = page.getByRole('button', { name: path.opener });
      await opener.click();
      await expect(sheetOf(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(sheetOf(page)).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
    });

    test('a click on the backdrop closes it and returns the focus', async ({ page }) => {
      await gotoStory(page, path.story);
      const opener = page.getByRole('button', { name: path.opener });
      await opener.click();
      await expect(sheetOf(page)).toBeVisible();
      await page.mouse.click(4, 4);
      await expect(sheetOf(page)).toHaveCount(0);
      await expect(opener).toBeFocused();
    });

    test('the close button is named after the title and closes', async ({ page }) => {
      await gotoStory(page, path.story);
      await page.getByRole('button', { name: path.opener }).click();
      await page.getByRole('button', { name: 'Chiudi: Dettaglio fornitore' }).click();
      await expect(sheetOf(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: path.opener })).toBeFocused();
    });
  });
}

test.describe('browsers that do not focus a button on click', () => {
  test('the focus still returns to the trigger (mousedown default prevented)', async ({ page }) => {
    await gotoStory(page, STORY('playground'));
    await page.evaluate(() =>
      document.addEventListener('mousedown', (e) => {
        if ((e.target as Element).closest('button')) e.preventDefault();
      }),
    );
    const opener = page.locator('button').filter({ hasText: /^Apri$/ });
    await opener.click();
    await expect(sheetOf(page)).toBeVisible();
    await expect(opener).not.toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheetOf(page)).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe('dismissible={false}', () => {
  test('Escape and the backdrop do nothing; an explicit button closes', async ({ page }) => {
    await gotoStory(page, STORY('not-dismissible'));
    const sheet = sheetOf(page);
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.click(4, 4);
    await expect(sheet).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole('button', { name: 'Annulla' }).click();
    await expect(sheet).toHaveCount(0);
  });
});

test.describe('geometry', () => {
  for (const side of ['right', 'left'] as const) {
    test(`side ${side}: flush with the edge, top 0, as tall as the viewport`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      // `size-md` is shown on the default (right) edge.
      await gotoStory(page, STORY(side === 'right' ? 'size-md' : 'left'));
      await expect(sheetOf(page)).toBeVisible();
      const r = await sheetOf(page).evaluate((el) => {
        const b = el.getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, height: b.height, iw: window.innerWidth, ih: window.innerHeight };
      });
      expect(r.top).toBe(0);
      expect(r.height).toBe(r.ih);
      if (side === 'right') expect(r.right).toBe(r.iw);
      else expect(r.left).toBe(0);
    });
  }

  const WIDTH: Record<string, number> = { sm: 352, md: 480, lg: 672 };
  for (const [size, width] of Object.entries(WIDTH)) {
    test(`size ${size}: ${width}px wide at desktop width`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoStory(page, STORY(`size-${size}`));
      const box = await sheetOf(page).boundingBox();
      expect(box!.width).toBeCloseTo(width, 0);
    });
  }

  test('lg takes at most 100% of a 360px viewport and does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await gotoStory(page, STORY('size-lg'));
    const sheet = sheetOf(page);
    const box = await sheet.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.width).toBeCloseTo(360, 0);
    await expectNoHorizontalOverflow(sheet);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('long content: only the body scrolls, header and footer stay, the page is locked', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await gotoStory(page, STORY('long-content'));
    const sheet = sheetOf(page);
    await expect(sheet).toBeVisible();
    await expectSingleScroller(sheet);
    const title = sheet.getByRole('heading', { name: 'Dettaglio fornitore' });
    const save = sheet.getByRole('button', { name: 'Salva' });
    const before = [(await title.boundingBox())!.y, (await save.boundingBox())!.y];
    const body = sheet.locator('[tabindex="0"]');
    await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect([(await title.boundingBox())!.y, (await save.boundingBox())!.y]).toEqual(before);
    await expect(save).toBeInViewport();
    await page.mouse.move(4, 300);
    await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    await body.focus();
    await expect(body).toBeFocused();
  });

  test('a very short viewport (400px): header and footer stay visible, the body shrinks and scrolls', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await gotoStory(page, STORY('long-content'));
    const sheet = sheetOf(page);
    await expect(sheet.getByRole('heading', { name: 'Dettaglio fornitore' })).toBeInViewport();
    await expect(sheet.getByRole('button', { name: 'Salva' })).toBeInViewport();
    const body = sheet.locator('[tabindex="0"]');
    expect((await body.boundingBox())!.height).toBeGreaterThan(40);
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await expectSingleScroller(sheet);
  });

  test('backdrop on the backdrop level, panel on the modal level, no literal z-index', async ({ page }) => {
    await gotoStory(page, STORY('size-md'));
    await expect(sheetOf(page)).toBeVisible();
    const z = await page.evaluate(() => {
      const token = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      const sheet = document.querySelector('[role=dialog]') as HTMLElement;
      const backdrop = sheet.parentElement!.firstElementChild as HTMLElement;
      return {
        backdrop: getComputedStyle(backdrop).zIndex,
        content: getComputedStyle(sheet).zIndex,
        wrapper: getComputedStyle(sheet.parentElement!).zIndex,
        overlayToken: token('--z-index-rop-overlay'),
        modalToken: token('--z-index-rop-modal'),
        inlineZ: [backdrop, sheet].map((el) => el.style.zIndex),
      };
    });
    expect(z.backdrop).toBe(z.overlayToken);
    expect(z.content).toBe(z.modalToken);
    expect(z.wrapper).toBe(z.modalToken);
    expect(z.inlineZ).toEqual(['', '']);
  });
});

test.describe('side changed while open', () => {
  test('the panel moves to the other edge without closing or losing the focus', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, STORY('playground'), 'side:right');
    await page.getByRole('button', { name: 'Apri' }).click();
    const sheet = sheetOf(page);
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Tab');
    const focusedBefore = await page.evaluate(() => document.activeElement?.textContent ?? '');
    // Storybook's args update: same story, the side control changes while the sheet stays mounted.
    await page.evaluate(() => {
      const channel = (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void } })
        .__STORYBOOK_ADDONS_CHANNEL__;
      const id = new URLSearchParams(location.search).get('id');
      channel.emit('updateStoryArgs', { storyId: id, updatedArgs: { side: 'left' } });
    });
    await expect.poll(async () => (await sheet.boundingBox())!.x).toBe(0);
    await expect(sheet).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.textContent ?? '')).toBe(focusedBefore);
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  });
});

test.describe('motion', () => {
  // #76 added the slide-in / slide-out, so "nothing animates with no preference" is no longer true
  // (the reduced-motion half is unchanged); the animated case is covered in `overlay-motion.spec.ts`.
  test('with prefers-reduced-motion nothing animates: no animation, no transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, STORY('size-md'));
    await expect(sheetOf(page)).toBeVisible();
    const running = await page.evaluate(() => document.getAnimations().length);
    expect(running).toBe(0);
    const style = await sheetOf(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { transition: s.transitionDuration, animation: s.animationName };
    });
    expect(style.transition.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
    expect(style.animation).toBe('none');
  });

  test('without the preference the panel settles after its slide-in: nothing keeps running', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoStory(page, STORY('size-md'));
    await expect(sheetOf(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    const style = await sheetOf(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return { transition: s.transitionDuration, opacity: s.opacity };
    });
    expect(style.transition.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
    expect(style.opacity).toBe('1');
  });
});

test.describe('no leak', () => {
  test('control props never reach the DOM, and nothing is logged', async ({ page }) => {
    const logged: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logged.push(m.text());
    });
    await gotoStory(page, STORY('left'));
    const sheet = sheetOf(page);
    await expect(sheet).toBeVisible();
    const attrs = await sheet.evaluate((el) => el.getAttributeNames());
    for (const forbidden of ['side', 'size', 'dismissible', 'returnfocusref', 'returnFocusRef']) {
      expect(attrs).not.toContain(forbidden);
    }
    expect(logged).toEqual([]);
  });
});

test.describe('edge cases', () => {
  test('over a dialog: the sheet covers it, Escape closes only the sheet, the second Escape the dialog', async ({ page }) => {
    await gotoStory(page, STORY('over-a-dialog-from-button'));
    const dialog = page.getByRole('dialog', { name: 'Fornitore' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Apri il dettaglio' }).click();
    const sheet = sheetOf(page);
    await expect(sheet).toBeVisible();

    // The element on top at the dialog's centre is the sheet's layer, not the dialog.
    const topIsSheetLayer = await page.evaluate(() => {
      const [d, s] = Array.from(document.querySelectorAll<HTMLElement>('[role=dialog]'));
      const r = d!.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 8);
      return !!hit && !d!.contains(hit) && s!.parentElement!.contains(hit);
    });
    expect(topIsSheetLayer).toBe(true);
    // And the sheet's own panel is on top where it is drawn.
    const box = (await sheet.boundingBox())!;
    expect(
      await page.evaluate(
        ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('[role=dialog]')?.getAttribute('aria-labelledby'),
        [box.x + 8, box.y + 8],
      ),
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Apri il dettaglio' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('mounted open (no opener): modal semantics, Escape closes, no inert page is left', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await gotoStory(page, STORY('with-form'));
    const sheet = sheetOf(page);
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
    expect(await page.evaluate(() => document.querySelectorAll('[data-aria-hidden]').length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('content narrower than the panel: no horizontally scrollable empty space', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, STORY('size-lg'));
    const body = sheetOf(page).locator('div.overflow-auto');
    expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
});

// Keyboard-safe layout (spec §1.10): a desktop browser has no on-screen keyboard, so the visual
// viewport is a controllable stand-in (same technique as e2e/dialog.spec.ts).
test.describe('virtual keyboard', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('the sheet follows the visual viewport: the active field and the actions stay above the keyboard', async ({
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
    const sheet = sheetOf(page);
    const input = sheet.getByRole('textbox', { name: 'Ragione sociale' });
    await input.focus();
    const keyboard = 300;
    await page.evaluate((px) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(px), keyboard);
    const limit = 667 - keyboard;
    await expect.poll(async () => (await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height).toBeLessThanOrEqual(limit);
    expect((await sheet.boundingBox())!.y).toBeGreaterThanOrEqual(0);
    expect((await input.boundingBox())!.y + (await input.boundingBox())!.height).toBeLessThanOrEqual(limit);
    await expect(sheet.getByRole('button', { name: 'Salva' })).toBeInViewport();
    expect((await sheet.getByRole('button', { name: 'Salva' }).boundingBox())!.y).toBeLessThan(limit);

    await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(0));
    await expect.poll(async () => (await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height).toBeGreaterThan(limit);
  });
});
