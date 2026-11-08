import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #318 (QA): the granular re-observe and the rAF-throttled scroll read, in a real browser.
// Nodes appended to / removed from the tablist from outside React exercise the MutationObserver
// path of the shared `useResizeAndMutationEffect` hook with real ResizeObserver notifications.

const edge = (page: Page, side: 'start' | 'end') => page.locator(`[data-rop-tabs-edge="${side}"]`);

test.describe('Navigation/Tabs: dynamic children and scroll bursts (#318)', () => {
  test('a tab added to a list that fits makes it overflow; resizing only that tab and removing it are followed', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 700 });
    await gotoStory(page, 'navigation-tabs--horizontal');
    await expect(page.locator('[data-rop-tabs-edge]')).toHaveCount(0);

    // Add a narrow node: still fits, no indicator.
    await page.getByRole('tablist').evaluate((el) => {
      const node = document.createElement('div');
      node.id = 'qa-dyn';
      node.style.cssText = 'flex:none;width:20px;height:10px';
      el.appendChild(node);
    });
    await expect(page.locator('[data-rop-tabs-edge]')).toHaveCount(0);

    // Only the added node changes size (the list box itself does not): its observation must be live.
    await page.locator('#qa-dyn').evaluate((el) => {
      (el as HTMLElement).style.width = '3000px';
    });
    await expect(edge(page, 'end')).toBeVisible();

    // Removing it makes the list fit again.
    await page.locator('#qa-dyn').evaluate((el) => el.remove());
    await expect(page.locator('[data-rop-tabs-edge]')).toHaveCount(0);

    // Adding many nodes one at a time keeps working (no stale observers).
    await page.getByRole('tablist').evaluate(async (el) => {
      for (let i = 0; i < 40; i += 1) {
        const node = document.createElement('div');
        node.style.cssText = 'flex:none;width:80px;height:10px';
        el.appendChild(node);
        await new Promise((r) => setTimeout(r, 0));
      }
    });
    await expect(edge(page, 'end')).toBeVisible();
  });

  test('a fast burst of scroll events ends with the indicators of the final position', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, 'navigation-tabs--many-tabs');
    await expect(edge(page, 'end')).toBeVisible();
    await expect(edge(page, 'start')).toHaveCount(0);
    const list = page.getByRole('tablist');

    // Jump to the far end in many synchronous steps, then back to the start.
    await list.evaluate(async (el) => {
      for (let i = 1; i <= 30; i += 1) el.scrollLeft = (el.scrollWidth * i) / 30;
    });
    await expect(edge(page, 'end')).toHaveCount(0);
    await expect(edge(page, 'start')).toBeVisible();

    await list.evaluate((el) => {
      for (let i = 30; i >= 0; i -= 1) el.scrollLeft = (el.scrollWidth * i) / 30;
    });
    await expect(edge(page, 'start')).toHaveCount(0);
    await expect(edge(page, 'end')).toBeVisible();
  });

  test('reduced motion: the final state after a scroll burst is the same', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, 'navigation-tabs--many-tabs');
    await page.getByRole('tablist').evaluate((el) => {
      for (let i = 1; i <= 10; i += 1) el.scrollLeft = (el.scrollWidth * i) / 10;
    });
    await expect(edge(page, 'end')).toHaveCount(0);
    await expect(edge(page, 'start')).toBeVisible();
  });

  test('unmounting the page (navigating to another story) raises no page error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, 'navigation-tabs--many-tabs');
    await page.getByRole('tablist').evaluate((el) => {
      el.scrollLeft = 200; // leaves a frame pending
    });
    await gotoStory(page, 'navigation-tabs--horizontal');
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
});
