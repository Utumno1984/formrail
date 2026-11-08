import { expect, test } from '@playwright/test';
import { expectPlayToPass } from './helpers/story';

test.describe('Overlays/Tooltip: sides story on mobile (#314)', () => {
  test('at 375px all four triggers are fully inside the viewport and the page does not scroll sideways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expectPlayToPass(page, 'overlays-tooltip--sides');
    const m = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const buttons = [...document.querySelectorAll('main button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { name: b.getAttribute('aria-label') ?? b.textContent, left: r.left, right: r.right };
      });
      return { viewport, scrollWidth: document.documentElement.scrollWidth, buttons };
    });
    expect(m.buttons).toHaveLength(4);
    for (const b of m.buttons) {
      expect(b.left, `${b.name} left`).toBeGreaterThanOrEqual(0);
      expect(b.right, `${b.name} right`).toBeLessThanOrEqual(m.viewport);
    }
    expect(m.scrollWidth).toBeLessThanOrEqual(m.viewport);
  });
});
