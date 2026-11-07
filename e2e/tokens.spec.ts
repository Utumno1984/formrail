import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { gotoStory } from './helpers/story';

const STORY = 'foundations-tokens--overview';

test.describe('Foundations/Tokens', () => {
  test('renders palette, typography with a monospace identifier, and passes axe', async ({ page }) => {
    await gotoStory(page, STORY);
    await expect(page.getByRole('heading', { name: 'Palette' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Typography' })).toBeVisible();
    await expect(page.getByTestId('swatch-rop-error')).toBeVisible();
    await expect(page.getByTestId('mono-sample')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('the stylesheet is really loaded: the mono sample uses the monospace token', async ({ page }) => {
    await gotoStory(page, STORY);
    const family = await page.getByTestId('mono-sample').evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toContain('monospace');
    const swatch = await page
      .getByTestId('swatch-rop-primary')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(swatch).toBe('rgb(10, 110, 209)');
  });

  test('the swatch of a derived token paints its computed default, in the same place of the palette', async ({ page }) => {
    await gotoStory(page, STORY);
    // A derived token is an unset override slot: a bare var() of its name would paint nothing.
    const colour = (name: string) =>
      page.getByTestId(`swatch-${name}`).evaluate((el) => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.fillStyle = getComputedStyle(el).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data);
      });
    expect(await colour('rop-primary-hover')).toEqual(await colour('rop-blue-700'));
    expect(await colour('rop-primary-active')).toEqual(await colour('rop-blue-800'));
    expect(await colour('rop-error-hover')).toEqual([168, 8, 8, 255]); // 80% of #d20a0a + 20% black
    expect(await colour('rop-surface-pressed')).toEqual([235, 236, 237, 255]); // 96% of #f5f6f7 + 4% black
    expect(await colour('rop-readonly-surface')).toEqual(await colour('rop-surface-subtle'));
    expect(await colour('rop-readonly-indicator')).toEqual(await colour('rop-text-muted'));
    const names = await page.locator('[data-testid^="swatch-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
    const after = (name: string) => names[names.indexOf(`swatch-${name}`) + 1];
    expect(after('rop-surface-subtle')).toBe('swatch-rop-surface-pressed');
    expect(after('rop-primary')).toBe('swatch-rop-primary-hover');
    expect(after('rop-primary-hover')).toBe('swatch-rop-primary-active');
    expect(after('rop-error')).toBe('swatch-rop-error-hover');
    expect(after('rop-error-hover')).toBe('swatch-rop-error-active');
  });

  test('the z-index scale is listed in strictly increasing order: sticky, overlay, modal, popover, toast, tooltip', async ({
    page,
  }) => {
    await gotoStory(page, STORY);
    const items = await page.getByTestId('z-scale').getByRole('listitem').allTextContents();
    expect(items.map((t) => t.split(':')[0]?.trim())).toEqual([
      'rop-sticky',
      'rop-overlay',
      'rop-modal',
      'rop-popover',
      'rop-toast',
      'rop-tooltip',
    ]);
    const values = items.map((t) => Number(t.split(':')[1]));
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1] as number);
    }
  });

  // No "no preflight" test on document.body here: Storybook itself adds `sb-main-padded sb-show-main`
  // to <body> (box-sizing: border-box), so it would measure Storybook, not this library. The real
  // coverage is the test that scans the compiled dist/styles.css for global html/body/* selectors.
});
