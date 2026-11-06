import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

const NO_PLAY = 'floorplans-list-report--no-play';
const pill = (page: Page) => page.locator('[data-rop-count]');

test.describe('ListReport count pill (QA extras)', () => {
  test('rapid repeated changes keep the flash on and end it once, after the last change', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoStory(page, NO_PLAY);
    // three changes 80ms apart, inside the 200ms flash window: it must stay on throughout, then end
    const samples = await page.evaluate(async () => {
      const radio = (name: string) =>
        [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((el) => el.textContent?.trim() === name)!;
      const el = document.querySelector('[data-rop-count]')!;
      const out: boolean[] = [];
      for (const name of ['To approve', 'All', 'To approve']) {
        radio(name).click();
        await new Promise((r) => setTimeout(r, 80));
        out.push(el.hasAttribute('data-changed'));
      }
      return out;
    });
    expect(samples).toEqual([true, true, true]);
    await expect(pill(page)).not.toHaveAttribute('data-changed');
  });

  test('selecting the already selected filter does not flash', async ({ page }) => {
    await gotoStory(page, NO_PLAY);
    await page.getByRole('radio', { name: 'All' }).click();
    await page.waitForTimeout(100);
    await expect(pill(page)).not.toHaveAttribute('data-changed');
  });

  test('loading and error: the pill is invisible and does not flash at mount', async ({ page }) => {
    for (const id of ['floorplans-list-report--loading', 'floorplans-list-report--error-state']) {
      await gotoStory(page, id);
      await expect(pill(page)).toHaveCount(1);
      await expect(pill(page)).toBeHidden();
      await expect(pill(page)).not.toHaveAttribute('data-changed');
    }
  });

  test('375px: the header does not overflow horizontally with the pill', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, NO_PLAY);
    await expect(pill(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    const box = await pill(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });

  test('RTL: the pill stays inside the viewport and flashes on change', async ({ page }) => {
    await gotoStory(page, NO_PLAY);
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    const box = await pill(page).boundingBox();
    const vw = page.viewportSize()!.width;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
    await page.getByRole('radio', { name: 'To approve' }).click();
    await expect(pill(page)).toHaveAttribute('data-changed', '');
  });
});
