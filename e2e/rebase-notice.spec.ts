import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';
import { VIEWPORTS } from './helpers/viewports';

// #384: Pro/RebaseNotice, the component on its own.
const PLAYGROUND = 'pro-rebasenotice--playground';

test.describe('Pro/RebaseNotice', () => {
  test('the play function passes (resolves both conflicts, the Actions called, the focus kept on a live element)', async ({ page }) => {
    await expectPlayToPass(page, PLAYGROUND);
  });

  for (const [name, width, height] of VIEWPORTS) {
    test(`three conflicts with long values at ${name} width: no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, 'pro-rebasenotice--three-conflicts');
      await expect(page.getByRole('list', { name: 'Conflicts' }).getByRole('listitem')).toHaveCount(3);
      await expectNoHorizontalOverflow(page.locator('#storybook-root'));
    });
  }

  test('no a11y violations: applied only, one conflict, three conflicts', async ({ page }) => {
    for (const story of ['applied-only', 'one-conflict', 'three-conflicts']) {
      await gotoStory(page, `pro-rebasenotice--${story}`);
      await expect(page.locator('.rop-pro-rebase-notice')).toBeVisible();
      await expectNoA11yViolations(page);
    }
  });

  test('tone: information with applied changes only, warning with conflicts', async ({ page }) => {
    await gotoStory(page, 'pro-rebasenotice--applied-only');
    await expect(page.locator('.rop-pro-rebase-notice')).toContainText('Information:');
    await gotoStory(page, 'pro-rebasenotice--one-conflict');
    await expect(page.locator('.rop-pro-rebase-notice')).toContainText('Warning:');
  });

  test('more than three applied fields: a real Enter on the summary closes and reopens the list, the focus stays', async ({ page }) => {
    // The play function leaves the list open (it opened it with a click).
    await expectPlayToPass(page, 'pro-rebasenotice--many-applied');
    const summary = page.locator('.rop-pro-rebase-notice summary');
    const details = page.locator('.rop-pro-rebase-notice details');
    await expect(details).toHaveAttribute('open');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(details).not.toHaveAttribute('open');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open');
    await expect(summary).toBeFocused();
    await expect(page.getByRole('list', { name: 'Updated fields' }).getByRole('listitem')).toHaveCount(6);
  });

  test('six applied fields: all rows are visible, nothing scrolls, and the list is not a tab stop', async ({ page }) => {
    await expectPlayToPass(page, 'pro-rebasenotice--many-applied');
    const list = page.getByRole('list', { name: 'Updated fields' });
    const rows = list.getByRole('listitem');
    await expect(rows).toHaveCount(6);
    for (let i = 0; i < 6; i++) await expect(rows.nth(i)).toBeInViewport();
    const metrics = await list.evaluate((el) => ({ scrolls: el.scrollHeight > el.clientHeight + 1, overflowY: getComputedStyle(el).overflowY }));
    expect(metrics.scrolls).toBe(false);
    expect(metrics.overflowY).toBe('visible');
    await expect(list).not.toHaveAttribute('tabindex');
    await expect(list).not.toHaveAttribute('data-more');
  });

  test('beyond the threshold the list scrolls, signals the hidden rows, and is a tab stop only while it scrolls', async ({ page }) => {
    await expectPlayToPass(page, 'pro-rebasenotice--beyond-scroll-threshold');
    const list = page.getByRole('list', { name: 'Updated fields' });
    await expect(list.getByRole('listitem')).toHaveCount(16);
    await expect(list).toHaveAttribute('tabindex', '0');
    await expect(list).toHaveAttribute('data-more', '');
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true);
    expect(await list.evaluate((el) => getComputedStyle(el).maskImage)).toContain('linear-gradient');
    // The cut is at about 12 rows (the threshold), or 70% of the viewport when that is lower: never fewer rows than a list that does not scroll.
    const cut = await list.evaluate((el) => {
      const items = el.querySelectorAll('li');
      const twelve = items[11]!.getBoundingClientRect().bottom - items[0]!.getBoundingClientRect().top;
      return { shown: el.clientHeight, twelve, viewport: window.innerHeight };
    });
    expect(cut.shown).toBeGreaterThanOrEqual(Math.min(cut.twelve, cut.viewport * 0.7) - 2);
    expect(cut.shown).toBeLessThanOrEqual(cut.viewport * 0.7 + 1);
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(list).not.toHaveAttribute('data-more');
    await expect(list).toHaveAttribute('tabindex', '0');
  });
  test('the focus ring of the scrolling list is visible while rows are hidden (the fade mask must not clip it)', async ({ page }) => {
    await gotoStory(page, 'pro-rebasenotice--beyond-scroll-threshold');
    const list = page.getByRole('list', { name: 'Updated fields' });
    await expect(list).toHaveAttribute('data-more', '');
    const ring = page.locator('.rop-pro-rebase-notice__applied-ring');
    const box = (await ring.boundingBox())!;
    // The strip just outside the left edge of the list, where the 2px ring (offset 2px) is drawn.
    const clip = { x: box.x - 5, y: box.y + 40, width: 4, height: 200 };
    const before = await page.screenshot({ clip });
    await list.focus();
    await expect(list).toBeFocused();
    await expect(list).toHaveAttribute('data-more', '');
    const after = await page.screenshot({ clip });
    expect(after.equals(before)).toBe(false);
    expect(await list.evaluate((el) => getComputedStyle(el).maskImage)).toContain('linear-gradient');
    expect(await ring.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect(await list.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  });

  test('the fade is tall enough to cover the gap between two rows', async ({ page }) => {
    await gotoStory(page, 'pro-rebasenotice--beyond-scroll-threshold');
    const list = page.getByRole('list', { name: 'Updated fields' });
    const fade = await list.evaluate((el) => {
      const mask = getComputedStyle(el).maskImage;
      const probe = document.createElement('div');
      probe.style.width = 'var(--rop-pro-rebase-applied-fade, 3.5rem)';
      el.appendChild(probe);
      const px = probe.getBoundingClientRect().width;
      probe.remove();
      return { mask, px };
    });
    expect(fade.mask).toContain('linear-gradient');
    expect(fade.px).toBeGreaterThanOrEqual(56);
  });

  test.describe('coarse pointer', () => {
    test.use({ hasTouch: true, isMobile: true });
    test('the summary takes the touch over its whole 44px box', async ({ page }) => {
      await gotoStory(page, 'pro-rebasenotice--beyond-scroll-threshold');
      const summary = page.locator('.rop-pro-rebase-notice summary');
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      const box = (await summary.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      for (const y of [box.y + 2, box.y + box.height - 2]) {
        const hit = await page.evaluate(([x, yy]) => !!document.elementFromPoint(x!, yy!)?.closest('summary'), [box.x + 20, y]);
        expect(hit).toBe(true);
      }
    });
  });
});
