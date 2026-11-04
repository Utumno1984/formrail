import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

const TEXT_VARIANTS = ['body', 'caption', 'label', 'title-sm', 'title-md', 'title-lg'] as const;

test.describe('Primitives/Skeleton', () => {
  test('the Playground play function passes and axe is clean', async ({ page }) => {
    await expectPlayToPass(page, 'primitives-skeleton--playground');
    await expectNoA11yViolations(page);
  });

  test('every story is free of a11y violations', async ({ page }) => {
    for (const id of ['text-variants', 'shapes', 'demo-not-loaded', 'demo-loaded']) {
      await gotoStory(page, `primitives-skeleton--${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('Load swaps the skeleton for the content without changing the container height (+-0.5px)', async ({ page }) => {
    await gotoStory(page, 'primitives-skeleton--demo-not-loaded');
    const card = page.getByTestId('card');
    await expect(card).toHaveAttribute('aria-busy', 'true');
    const before = (await card.boundingBox())!.height;
    await page.getByRole('button', { name: 'Load' }).click();
    await expect(card).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByText('Invoice 2024-0042')).toBeVisible();
    expect(Math.abs((await card.boundingBox())!.height - before)).toBeLessThanOrEqual(0.5);
  });

  test('skeletons are not in the accessibility tree and not focusable', async ({ page }) => {
    await gotoStory(page, 'primitives-skeleton--demo-not-loaded');
    const snapshot = await page.locator('#storybook-root').ariaSnapshot();
    expect(snapshot).not.toContain('generic');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('[data-rop-skeleton]') ?? null)).toBeNull();
    await expect(page.locator('[data-rop-skeleton]').first()).toHaveAttribute('aria-hidden', 'true');
  });

  for (const v of TEXT_VARIANTS) {
    test(`text ${v}: one line is as tall as the real Text/Title line (+-0.5px) and equals the line-height token`, async ({ page }) => {
      await gotoStory(page, 'primitives-skeleton--text-variants');
      const row = page.getByTestId(`row-${v}`);
      const skeleton = (await row.locator('[data-rop-skeleton]').first().boundingBox())!.height;
      const token = await page.evaluate((name) => {
        const probe = document.createElement('div');
        probe.style.height = `var(--text-rop-${name}--line-height)`;
        document.body.appendChild(probe);
        const h = parseFloat(getComputedStyle(probe).height);
        probe.remove();
        return h;
      }, v);
      expect(token).toBeGreaterThan(0);
      expect(Math.abs(skeleton - token)).toBeLessThanOrEqual(0.5);
      // Real text of the same step, in the same cell: first real line height equals one skeleton line.
      const real = await row.evaluate((el) => {
        return el.children[1]?.children[0]?.getBoundingClientRect().height ?? -1;
      });
      expect(Math.abs(real - skeleton)).toBeLessThanOrEqual(0.5);
      // Three lines: exactly three line heights.
      const three = (await row.locator('[data-rop-skeleton]').nth(1).boundingBox())!.height;
      expect(Math.abs(three - 3 * token)).toBeLessThanOrEqual(0.5);
    });
  }

  test('multi-line: the last line is shorter than the others', async ({ page }) => {
    await gotoStory(page, 'primitives-skeleton--text-variants');
    const lines = page.getByTestId('row-body').locator('[data-rop-skeleton]').nth(1).locator('[data-rop-skeleton-line]');
    await expect(lines).toHaveCount(3);
    const w = await lines.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    const [first = 0, second = -1, last = Infinity] = w;
    expect(first).toBeCloseTo(second, 0);
    expect(last).toBeLessThan(first * 0.7);
  });

  test('rect and circle take their declared size', async ({ page }) => {
    await gotoStory(page, 'primitives-skeleton--shapes');
    const rect = (await page.locator('[data-rop-skeleton="rect"]').first().boundingBox())!;
    expect(rect.height).toBe(96);
    const circles = await page
      .locator('[data-rop-skeleton="circle"]')
      .evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]));
    expect(circles).toEqual([
      [24, 24],
      [40, 40],
      [64, 64],
    ]);
  });

  test('pulses by default and is static with prefers-reduced-motion', async ({ page }) => {
    await gotoStory(page, 'primitives-skeleton--demo-not-loaded');
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName === 'rop-skeleton-pulse').length))
      .toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    const opacity = await page.locator('[data-rop-skeleton]').first().evaluate((e) => getComputedStyle(e.firstElementChild!).opacity);
    expect(opacity).toBe('1');
  });

  test('no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    for (const id of ['text-variants', 'shapes', 'demo-not-loaded']) {
      await gotoStory(page, `primitives-skeleton--${id}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });

  test('forced-colors: the placeholder keeps a visible contour', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoStory(page, 'primitives-skeleton--shapes');
    const style = await page
      .locator('[data-rop-skeleton="rect"]')
      .first()
      .evaluate((e) => {
        const s = getComputedStyle(e);
        return { w: parseFloat(s.outlineWidth), style: s.outlineStyle };
      });
    expect(style.style).toBe('solid');
    expect(style.w).toBeGreaterThan(0);
  });

  test('100 skeletons are all driven by the same CSS keyframes (no JS animation)',async ({ page }) => {
    await gotoStory(page, 'primitives-skeleton--demo-not-loaded');
    const result = await page.evaluate(async () => {
      const root = document.createElement('div');
      document.body.appendChild(root);
      const src = document.querySelector('[data-rop-skeleton="text"]')!;
      for (let i = 0; i < 100; i++) root.appendChild(src.cloneNode(true));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const names = new Set(
        document
          .getAnimations()
          .filter((a) => root.contains((a.effect as KeyframeEffect).target))
          .map((a) => (a as CSSAnimation).animationName),
      );
      return { names: [...names], count: document.getAnimations().length };
    });
    expect(result.names).toEqual(['rop-skeleton-pulse']);
    expect(result.count).toBeGreaterThanOrEqual(100);
  });
});
