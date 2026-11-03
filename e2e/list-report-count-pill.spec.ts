import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

const NO_PLAY = 'floorplans-list-report--no-play';

const pillLocator = (page: Page): Locator => page.locator('[data-rop-count]');
const bg = (pill: Locator): Promise<string> => pill.evaluate((el) => getComputedStyle(el).backgroundColor);

/** Resolves a token to the color the browser computes for it (the pill's own rest and flash tones). */
async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, token);
}

test.describe('ListReport count pill', () => {
  test('is a bordered, rounded pill with the resting tone and does not flash at mount', async ({ page }) => {
    await gotoStory(page, NO_PLAY);
    const pill = pillLocator(page);
    await expect(pill).toHaveText('(200)');
    await expect(pill).not.toHaveAttribute('data-changed');
    expect(await bg(pill)).toBe(await tokenColor(page, '--color-rop-surface-subtle'));
    const style = await pill.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.borderTopWidth, color: s.borderTopColor, radius: s.borderTopLeftRadius };
    });
    expect(style.width).toBe('1px');
    expect(style.radius).toBe('4px');
    // still resting a moment later: nothing flashed on its own
    await page.waitForTimeout(400);
    await expect(pill).not.toHaveAttribute('data-changed');
  });

  test('eases to a stronger tone when the count changes, then returns to rest', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoStory(page, NO_PLAY);
    const pill = pillLocator(page);
    const rest = await tokenColor(page, '--color-rop-surface-subtle');
    const strong = await tokenColor(page, '--color-rop-blue-50');
    expect(await pill.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.12s');

    await page.getByRole('radio', { name: 'Da approvare' }).click();
    await expect(pill).toHaveAttribute('data-changed', '');
    // the flash is short: poll every frame for the stronger tone
    await page.waitForFunction(
      ([el, color]) => getComputedStyle(el as Element).backgroundColor === color,
      [await pill.elementHandle(), strong] as const,
      { polling: 'raf', timeout: 2_000 },
    );
    await expect(pill).not.toHaveAttribute('data-changed');
    await expect.poll(() => bg(pill)).toBe(rest);
  });

  test('with prefers-reduced-motion: reduce the value just changes: no transition, the tone never moves', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, NO_PLAY);
    const pill = pillLocator(page);
    const rest = await tokenColor(page, '--color-rop-surface-subtle');
    expect(await pill.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe('none');

    // record every background the pill takes from now on
    await pill.evaluate((el) => {
      const seen = new Set<string>([getComputedStyle(el).backgroundColor]);
      (window as unknown as { __seen: Set<string> }).__seen = seen;
      const tick = () => {
        seen.add(getComputedStyle(el).backgroundColor);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByRole('radio', { name: 'Da approvare' }).click();
    await expect(pill).toHaveAttribute('data-changed', '');
    await expect(pill).not.toHaveAttribute('data-changed');
    const seen = await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);
    expect(seen).toEqual([rest]);
  });

  test('does not change the live region: it still announces the new count', async ({ page }) => {
    await gotoStory(page, NO_PLAY);
    const live = page.locator('[aria-live="polite"]');
    await expect(live).toHaveText('');
    await page.getByRole('radio', { name: 'Da approvare' }).click();
    await expect(live).toHaveText(/\d+ results/);
    await expect(live.locator('[data-rop-count]')).toHaveCount(0);
  });

  test('keeps the footprint of the header: the pill does not move the actions or the table', async ({ page }) => {
    await gotoStory(page, NO_PLAY);
    const button = page.getByRole('button', { name: 'Nuova fattura' });
    const before = await button.boundingBox();
    await page.getByRole('radio', { name: 'Da approvare' }).click();
    await expect(pillLocator(page)).not.toHaveAttribute('data-changed');
    const after = await button.boundingBox();
    expect(after?.y).toBeCloseTo(before?.y ?? -1, 0);
  });
});
