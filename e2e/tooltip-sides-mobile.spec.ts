import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass } from './helpers/story';

test.describe('Overlays/Tooltip: sides story on mobile (#314)', () => {
  test('at 375px all four triggers are fully inside the viewport and the page does not scroll sideways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expectPlayToPass(page, 'overlays-tooltip--sides');
    // Page-level check: <html> as container catches sideways page scroll and any descendant
    // sticking out of the viewport, reusing the shared clipping-aware logic.
    await expectNoHorizontalOverflow(page.locator('html'));
    // Each of the four triggers must be fully inside the viewport.
    const viewport = page.viewportSize()!.width;
    const buttons = page.locator('main button');
    await expect(buttons).toHaveCount(4);
    for (const [i, b] of (await buttons.all()).entries()) {
      const box = (await b.boundingBox())!;
      expect(box.x, `button ${i} left`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `button ${i} right`).toBeLessThanOrEqual(viewport);
    }
  });
});
