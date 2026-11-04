import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const fillOf = (page: Page) => page.locator('[data-rop-progress-fill]').first();

/** Fill box / track box (the fill is full width and scaled with transform, so measure the bounding boxes). */
async function fillRatio(page: Page, barTestId: string): Promise<number> {
  const bar = (await page.getByTestId(barTestId).boundingBox())!;
  const fill = (await page.getByTestId(barTestId).locator('[data-rop-progress-fill]').boundingBox())!;
  return fill.width / bar.width;
}

test.describe('Primitives/ProgressBar', () => {
  test('the Playground play function passes and axe is clean', async ({ page }) => {
    await expectPlayToPass(page, 'primitives-progressbar--playground');
    await expectNoA11yViolations(page);
  });

  test('every story is free of a11y violations', async ({ page }) => {
    for (const id of ['values', 'indeterminate', 'tones', 'custom-range']) {
      await gotoStory(page, `primitives-progressbar--${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('the fill width follows the value within 1px', async ({ page }) => {
    await gotoStory(page, 'primitives-progressbar--values');
    for (const value of [0, 45, 100]) {
      const bar = page.getByTestId(`bar-${value}`);
      await expect(bar).toHaveAttribute('aria-valuenow', String(value));
      const trackWidth = (await bar.boundingBox())!.width;
      const fillWidth = (await bar.locator('[data-rop-progress-fill]').boundingBox())!.width;
      expect(Math.abs(fillWidth - (trackWidth * value) / 100)).toBeLessThanOrEqual(1);
    }
  });

  test('custom range: 3 of 7 files, value and custom text, fill at 3/7', async ({ page }) => {
    await gotoStory(page, 'primitives-progressbar--custom-range');
    const bar = page.getByRole('progressbar', { name: 'Importing files' });
    await expect(bar).toHaveAttribute('aria-valuenow', '3');
    await expect(bar).toHaveAttribute('aria-valuemax', '7');
    await expect(bar).toHaveAttribute('aria-valuetext', '3 of 7 files');
    const track = (await bar.boundingBox())!.width;
    const fill = (await fillOf(page).boundingBox())!.width;
    expect(Math.abs(fill - (track * 3) / 7)).toBeLessThanOrEqual(1);
  });

  test('the track height is the same determinate, indeterminate, 0% and 100%', async ({ page }) => {
    const heights: number[] = [];
    await gotoStory(page, 'primitives-progressbar--values');
    for (const id of ['bar-0', 'bar-45', 'bar-100']) heights.push((await page.getByTestId(id).boundingBox())!.height);
    await gotoStory(page, 'primitives-progressbar--indeterminate');
    heights.push((await page.getByTestId('bar').boundingBox())!.height);
    expect(new Set(heights).size).toBe(1);
    expect(heights[0]).toBe(8);
  });

  test('indeterminate exposes no value and has no live region', async ({ page }) => {
    await gotoStory(page, 'primitives-progressbar--indeterminate');
    const bar = page.getByRole('progressbar');
    for (const a of ['aria-valuenow', 'aria-valuetext']) await expect(bar).not.toHaveAttribute(a, /.*/);
    await expect(page.locator('#storybook-root [aria-live], #storybook-root [role="status"]')).toHaveCount(0);
  });

  test('indeterminate animates normally and is static with prefers-reduced-motion: reduce', async ({ page }) => {
    await gotoStory(page, 'primitives-progressbar--indeterminate');
    const running = await fillOf(page).evaluate((el) => el.getAnimations().length);
    expect(running).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, 'primitives-progressbar--indeterminate');
    const reduced = await fillOf(page).evaluate((el) => ({
      animations: el.getAnimations().length,
      image: getComputedStyle(el).backgroundImage,
      width: el.getBoundingClientRect().width,
    }));
    expect(reduced.animations).toBe(0);
    // Still distinguishable: a partial, striped fill (not a plain determinate bar).
    expect(reduced.image).toContain('repeating-linear-gradient');
    expect(reduced.width).toBeGreaterThan(0);
  });

  test('the value change transitions with scaleX (no layout), and not at all with reduced motion', async ({ page }) => {
    await gotoStory(page, 'primitives-progressbar--values');
    const read = () =>
      fillOf(page).evaluate((el) => {
        const s = getComputedStyle(el);
        return { property: s.transitionProperty, duration: s.transitionDuration };
      });
    const style = await read();
    expect(style.property).toContain('transform');
    expect(style.property).not.toContain('width');
    expect(style.duration).toBe('0.12s');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoStory(page, 'primitives-progressbar--values');
    expect((await read()).duration).toBe('0s');
    expect(await fillRatio(page, 'bar-45')).toBeCloseTo(0.45, 2);
  });

  test('forced-colors: the fill is distinguishable from the track', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoStory(page, 'primitives-progressbar--values');
    const colors = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="bar-45"]')!;
      const fill = bar.firstElementChild!;
      return {
        fill: getComputedStyle(fill).backgroundColor,
        track: getComputedStyle(bar).backgroundColor,
        outline: getComputedStyle(bar).outlineStyle,
      };
    });
    expect(colors.fill).not.toBe(colors.track);
    expect(colors.outline).toBe('solid');
  });

  test('the visible label is the accessible name', async ({ page }) => {
    await gotoStory(page, 'primitives-progressbar--playground');
    await expect(page.getByRole('progressbar', { name: 'Uploading invoices' })).toBeVisible();
  });
});
