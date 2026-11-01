import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #76: Dialog / Sheet enter and exit animations, and what they must NOT change: the focus-trap, the
// moment the focus returns to the opener, immediate reopening, nesting, prefers-reduced-motion.
// The animation tokens are plain CSS variables, so a test slows them down (a consumer could too) to
// observe the exit deterministically: a 160 ms animation is too short to sample reliably.

const DIALOG = (name: string) => `overlays-dialog--${name}`;
const SHEET = (name: string) => `overlays-sheet--${name}`;

const SLOW = 900;
async function slowDown(page: Page, ms = SLOW): Promise<void> {
  await page.addStyleTag({ content: `:root { --motion-rop-overlay-duration: ${ms}ms; }` });
}

const dialogOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Modifica fornitore' });
const sheetOf = (page: Page): Locator => page.getByRole('dialog', { name: 'Dettaglio fornitore' });

/** Names of the CSS animations currently attached to elements of the document. */
const runningAnimations = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => (a as CSSAnimation).animationName),
  );

const focusInside = (panel: Locator): Promise<boolean> =>
  panel.evaluate((el) => el.contains(document.activeElement));

test.describe('with motion allowed', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('Dialog: opening runs the backdrop fade and the panel animation, which end on the resting state', async ({ page }) => {
    await expectPlayToPass(page, DIALOG('playground'));
    await slowDown(page);
    await page.getByRole('button', { name: 'Apri' }).click();
    const dialog = dialogOf(page);
    await expect(dialog).toHaveAttribute('data-state', 'open');
    expect(await runningAnimations(page)).toEqual(expect.arrayContaining(['rop-modal-in', 'rop-overlay-in']));
    // Mid-animation the panel is not yet opaque; it still carries the centring transform untouched.
    const mid = await dialog.evaluate((el) => ({ opacity: Number(getComputedStyle(el).opacity), transform: getComputedStyle(el).transform }));
    expect(mid.opacity).toBeLessThan(1);
    await expect.poll(() => runningAnimations(page), { timeout: 5000 }).toEqual([]);
    const end = await dialog.evaluate((el) => {
      const s = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return { opacity: s.opacity, scale: s.scale, translate: s.translate, transform: s.transform, centre: box.left + box.width / 2 };
    });
    expect(end.opacity).toBe('1');
    expect(end.scale).toBe('none');
    expect(end.translate).toBe('none');
    expect(end.transform).toBe(mid.transform); // the vertical centring `transform` was never replaced
    expect(Math.abs(end.centre - (await page.evaluate(() => window.innerWidth)) / 2)).toBeLessThan(1);
  });

  test('Sheet: slides in from its edge and ends flush with it', async ({ page }) => {
    await expectPlayToPass(page, SHEET('playground'));
    await slowDown(page);
    await page.getByRole('button', { name: 'Apri' }).click();
    const sheet = sheetOf(page);
    expect(await runningAnimations(page)).toEqual(expect.arrayContaining(['rop-modal-in']));
    const vw = await page.evaluate(() => window.innerWidth);
    // Sampled right after the start: still (partly) off-screen to the right.
    expect(await sheet.evaluate((el) => el.getBoundingClientRect().left)).toBeGreaterThan(vw - 480);
    await expect.poll(() => runningAnimations(page), { timeout: 5000 }).toEqual([]);
    expect(await sheet.evaluate((el) => el.getBoundingClientRect().right)).toBe(vw);
  });

  test('Left sheet slides in from the left edge', async ({ page }) => {
    await expectPlayToPass(page, SHEET('left'));
    await slowDown(page);
    // The story is mounted open: close it (waiting for its exit), then re-open to watch the entry.
    await page.keyboard.press('Escape');
    await expect(sheetOf(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Apri' }).click();
    expect(await sheetOf(page).evaluate((el) => el.getBoundingClientRect().left)).toBeLessThan(0);
    await expect.poll(() => runningAnimations(page), { timeout: 5000 }).toEqual([]);
    expect(await sheetOf(page).evaluate((el) => el.getBoundingClientRect().left)).toBe(0);
  });

  test('closing: the panel stays mounted for its exit, then unmounts and the wrapper leaves no overlay behind', async ({ page }) => {
    await expectPlayToPass(page, DIALOG('playground'));
    await slowDown(page);
    const opener = page.getByRole('button', { name: 'Apri' });
    await opener.click();
    await expect.poll(() => runningAnimations(page), { timeout: 5000 }).toEqual([]);
    await page.keyboard.press('Escape');
    const dialog = dialogOf(page);
    // Exit in progress: still in the DOM, marked closed, animating, and not swallowing clicks.
    await expect(dialog).toHaveAttribute('data-state', 'closed');
    expect(await runningAnimations(page)).toEqual(expect.arrayContaining(['rop-modal-out', 'rop-overlay-out']));
    expect(await dialog.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    await expect(dialog).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('.z-rop-modal')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
    expect(await page.evaluate(() => getComputedStyle(document.body).pointerEvents)).not.toBe('none');
    await expect(opener).toBeFocused();
  });

  for (const [label, story, opener, panel] of [
    ['Dialog', DIALOG('playground'), 'Apri', dialogOf],
    ['Sheet', SHEET('playground'), 'Apri', sheetOf],
    ['Dialog opened from external state', DIALOG('external-state'), 'Apri da stato', dialogOf],
  ] as const) {
    test(`${label}: the focus returns to the opener only AFTER the exit animation, not in the middle of it`, async ({ page }) => {
      await expectPlayToPass(page, story);
      await slowDown(page);
      // A CSS locator: while the panel is mounted the page behind it is aria-hidden (also during the
      // exit), so a role query for the opener would only resolve once the panel is gone.
      const trigger = page.locator('button').filter({ hasText: new RegExp(`^${opener}$`) });
      await trigger.click();
      await expect.poll(() => runningAnimations(page), { timeout: 5000 }).toEqual([]);
      expect(await focusInside(panel(page))).toBe(true);
      // Sample inside the page, once per frame and atomically ("is the panel mounted?" and "has the
      // opener the focus?" read in the same task): two Playwright round-trips would race with the end
      // of the exit. Started before Escape so no frame of the exit is missed.
      await page.evaluate((openerText) => {
        const w = window as unknown as { __frames: { mounted: boolean; opener: boolean }[]; __sampling: boolean };
        w.__frames = [];
        w.__sampling = true;
        const isOpener = (el: Element | null) => el?.tagName === 'BUTTON' && el.textContent === openerText;
        const tick = () => {
          w.__frames.push({ mounted: !!document.querySelector('[role=dialog]'), opener: isOpener(document.activeElement) });
          if (w.__sampling) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, opener);
      await page.keyboard.press('Escape');
      await expect(panel(page)).toHaveAttribute('data-state', 'closed');
      await expect(panel(page)).toHaveCount(0, { timeout: 5000 });
      await expect(trigger).toBeFocused();
      const frames = await page.evaluate(() => {
        const w = window as unknown as { __frames: { mounted: boolean; opener: boolean }[]; __sampling: boolean };
        w.__sampling = false;
        return w.__frames;
      });
      const mountedFrames = frames.filter((f) => f.mounted);
      // A 900 ms exit is ~50 frames: plenty, whatever the load. For all of them the opener has NOT the focus.
      expect(mountedFrames.length).toBeGreaterThan(10);
      expect(mountedFrames.filter((f) => f.opener)).toEqual([]);
      expect(frames.some((f) => !f.mounted && f.opener)).toBe(true);
    });
  }

  test('the Tab trap holds while open and is released at once when closing (no stale trap during the exit)', async ({ page }) => {
    await expectPlayToPass(page, DIALOG('playground'));
    await slowDown(page);
    await page.getByRole('button', { name: 'Apri' }).click();
    await expect.poll(() => runningAnimations(page), { timeout: 5000 }).toEqual([]);
    const dialog = dialogOf(page);
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusInside(dialog)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveAttribute('data-state', 'closed');
    await expect(dialog).toHaveCount(0, { timeout: 5000 });
  });

  test('reopening during the exit: the dialog is open again, trapped, and the ORIGINAL opener still gets the focus at the end', async ({ page }) => {
    await expectPlayToPass(page, DIALOG('playground'));
    await slowDown(page);
    const opener = page.getByRole('button', { name: 'Apri' });
    await opener.click();
    await expect.poll(() => runningAnimations(page), { timeout: 5000 }).toEqual([]);
    await page.keyboard.press('Escape');
    const dialog = dialogOf(page);
    await expect(dialog).toHaveAttribute('data-state', 'closed');
    // The closing panel lets the pointer through, so the page behind is reachable straight away.
    await opener.click();
    await expect(dialog).toHaveAttribute('data-state', 'open');
    await expect.poll(() => runningAnimations(page), { timeout: 5000 }).toEqual([]);
    await expect(dialog).toHaveCount(1);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusInside(dialog)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0, { timeout: 5000 });
    await expect(opener).toBeFocused();
  });

  test('closing and reopening several times in a row never loses the opener or leaves a wrapper behind', async ({ page }) => {
    await expectPlayToPass(page, DIALOG('playground'));
    await slowDown(page, 300);
    const opener = page.getByRole('button', { name: 'Apri' });
    for (let i = 0; i < 4; i += 1) {
      await opener.click();
      await expect(dialogOf(page)).toHaveAttribute('data-state', 'open');
      await page.keyboard.press('Escape');
      await expect(dialogOf(page)).toHaveAttribute('data-state', 'closed');
    }
    await expect(page.locator('.z-rop-modal')).toHaveCount(0, { timeout: 5000 });
    await expect(opener).toBeFocused();
  });

  test('nested dialogs: the inner one animates out while the outer one stays open and trapped; the focus goes back inside the outer one afterwards', async ({ page }) => {
    await expectPlayToPass(page, DIALOG('nested'));
    await slowDown(page, 500);
    // After the play function the first dialog is open (its opener is the page's "Apri" button).
    const first = page.getByRole('dialog', { name: 'Primo dialog' });
    const second = page.getByRole('dialog', { name: 'Secondo dialog' });
    await expect(first).toBeVisible();
    const inner = page.getByRole('button', { name: 'Apri il secondo' });
    await inner.click();
    await expect(second).toHaveAttribute('data-state', 'open');
    await expect.poll(() => runningAnimations(page), { timeout: 5000 }).toEqual([]);
    expect(await focusInside(second)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(second).toHaveAttribute('data-state', 'closed');
    await expect(first).toHaveAttribute('data-state', 'open');
    await expect(second).toHaveCount(0, { timeout: 5000 });
    await expect(first).toHaveCount(1);
    await expect(inner).toBeFocused();
    expect(await focusInside(first)).toBe(true);
    // The outer dialog is still modal and closable.
    await page.keyboard.press('Escape');
    await expect(first).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('button').filter({ hasText: /^Apri$/ })).toBeFocused();
  });

  test('unmounted while open (no exit possible): nothing is left behind and nothing throws', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await gotoStory(page, DIALOG('unmount-while-open'));
    await expect(dialogOf(page)).toBeVisible();
    await page.keyboard.press('u');
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(page.locator('.z-rop-modal')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked'))).toBe(false);
    expect(errors).toEqual([]);
  });

  test('the durations and the easing come from the tokens', async ({ page }) => {
    await expectPlayToPass(page, DIALOG('playground'));
    await page.getByRole('button', { name: 'Apri' }).click();
    const style = await dialogOf(page).evaluate((el) => {
      const s = getComputedStyle(el);
      const root = getComputedStyle(document.documentElement);
      return {
        duration: s.animationDuration,
        easing: s.animationTimingFunction,
        tokenDuration: root.getPropertyValue('--motion-rop-overlay-duration').trim(),
        tokenEasing: root.getPropertyValue('--motion-rop-overlay-easing').trim(),
      };
    });
    // The minifier may write the token as `.16s`; the computed animation is what matters.
    expect(parseFloat(style.tokenDuration) * (style.tokenDuration.endsWith('ms') ? 0.001 : 1)).toBeCloseTo(0.16, 5);
    expect(style.duration).toBe('0.16s');
    expect(style.tokenEasing).not.toBe('');
    expect(style.easing).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });

  test('a visual-regression run (animation: none injected) still unmounts and returns the focus: the baselines show the final state', async ({ page }) => {
    // `visual.spec.ts` injects `animation: none !important` before photographing. That must neither
    // leave the open panel in a frame of the entry nor break the exit.
    await expectPlayToPass(page, DIALOG('playground'));
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    const opener = page.getByRole('button', { name: 'Apri' });
    await opener.click();
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    const open = await dialog.evaluate((el) => ({ opacity: getComputedStyle(el).opacity, scale: getComputedStyle(el).scale }));
    expect(open).toEqual({ opacity: '1', scale: 'none' });
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test.describe('prefers-reduced-motion: reduce', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  for (const [label, story, opener, panel] of [
    ['Dialog', DIALOG('playground'), 'Apri', dialogOf],
    ['Sheet', SHEET('playground'), 'Apri', sheetOf],
  ] as const) {
    test(`${label}: no animation at all, opening and closing are instant, the focus returns at once`, async ({ page }) => {
      await expectPlayToPass(page, story);
      // Even with a long duration token: the reduced-motion preference wins.
      await slowDown(page, 5000);
      const trigger = page.getByRole('button', { name: opener });
      await trigger.click();
      await expect(panel(page)).toBeVisible();
      expect(await runningAnimations(page)).toEqual([]);
      expect(await panel(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
      expect(await panel(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      await page.keyboard.press('Escape');
      // Gone and focus back well before any 5 s exit could have ended.
      await expect(panel(page)).toHaveCount(0, { timeout: 1000 });
      await expect(trigger).toBeFocused({ timeout: 1000 });
      await expect(page.locator('.z-rop-modal')).toHaveCount(0);
    });
  }

  test('nested dialogs and immediate reopening behave as before', async ({ page }) => {
    await expectPlayToPass(page, DIALOG('nested'));
    const second = page.getByRole('dialog', { name: 'Secondo dialog' });
    await page.getByRole('button', { name: 'Apri il secondo' }).click();
    await expect(second).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(second).toHaveCount(0, { timeout: 1000 });
    await expect(page.getByRole('button', { name: 'Apri il secondo' })).toBeFocused({ timeout: 1000 });
    await page.keyboard.press('Escape');
    const opener = page.locator('button').filter({ hasText: /^Apri$/ });
    await expect(opener).toBeFocused({ timeout: 1000 });
    await opener.click();
    await page.keyboard.press('Escape');
    await opener.click();
    await expect(page.getByRole('dialog', { name: 'Primo dialog' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused({ timeout: 1000 });
  });
});
