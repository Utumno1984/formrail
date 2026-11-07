import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

const STORY = (name: string) => `floorplans-object-page-anchor-bar--${name}`;
const SCROLLER = '[data-object-page-scroller]';
const BAR = 'nav[aria-label]';

const activeNames = (page: Page) =>
  page.locator(`${BAR} a[aria-current]`).evaluateAll((links) => links.map((a) => a.textContent));
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const el = document.querySelector('[data-object-page-scroller]') as HTMLElement;
        let last = -1;
        let still = 0;
        const tick = () => {
          still = el.scrollTop === last ? still + 1 : 0;
          last = el.scrollTop;
          if (still >= 8) resolve();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );

test.describe('QA #56: Anchor Bar, uncovered cases', () => {
  test('resize while spying: sticky offset follows the bar height and the active link stays coherent', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('scrollable'), 'sectionCount:6');
    await page.getByRole('link', { name: 'Lines' }).click();
    await settle(page);
    await page.setViewportSize({ width: 320, height: 500 });
    await expect.poll(async () => (await activeNames(page)).length).toBe(1);
    const offset = await page
      .locator(SCROLLER)
      .evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--rop-object-page-sticky-offset')));
    const h = await page.locator(BAR).evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(offset - h)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.locator(SCROLLER).evaluate((el) => (el.scrollTop = 0));
    await expect.poll(() => activeNames(page)).toEqual(['General data']);
  });

  test('a section that grows after mount keeps the active link coherent', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('scrollable'), 'sectionCount:4');
    await page.getByRole('link', { name: 'Supplier' }).click();
    await settle(page);
    // Grow the first section by 1500px: Supplier's top moves away from the bar, the scroller stays put.
    await page.getByRole('region', { name: 'General data' }).evaluate((el) => {
      const pad = document.createElement('div');
      pad.style.height = '1500px';
      el.appendChild(pad);
    });
    // Coherence: the active link is the last section whose top has passed the bar (scroll anchoring may keep Supplier there).
    const expected = () =>
      page.evaluate(() => {
        const edge = document.querySelector('nav[aria-label]')!.getBoundingClientRect().bottom + 2;
        let name = '';
        for (const h of document.querySelectorAll('[data-object-page-scroller] section')) {
          if (h.getBoundingClientRect().top <= edge) name = h.querySelector('h2')?.textContent ?? '';
        }
        return name;
      });
    await expect.poll(async () => `${(await activeNames(page))[0]} | expected ${await expected()}`).toMatch(/^(.*) \| expected \1$/);
    // Scrolling by hand to the top after the growth: first section active.
    await page.locator(SCROLLER).evaluate((el) => (el.scrollTop = 0));
    await expect.poll(() => activeNames(page)).toEqual(['General data']);
  });

  test('removing the active section from the DOM does not crash and recalculates one active link', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await gotoStory(page, STORY('scrollable'), 'sectionCount:4');
    await page.locator(SCROLLER).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect.poll(() => activeNames(page)).toEqual(['Amounts']);
    // Re-render with fewer sections through the Storybook args channel.
    await page.evaluate(() => {
      const ch = (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void } }).__STORYBOOK_ADDONS_CHANNEL__;
      const id = new URLSearchParams(location.search).get('id');
      ch.emit('updateStoryArgs', { storyId: id, updatedArgs: { sectionCount: 2 } });
    });
    await expect(page.locator(`${BAR} a`)).toHaveCount(2);
    await expect.poll(async () => (await activeNames(page)).length).toBe(1);
    expect(errors).toEqual([]);
  });

  test('long titles on desktop: one line per link, no vertical growth', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await gotoStory(page, STORY('many-sections'));
    const heights = await page.locator(`${BAR} a`).evaluateAll((l) => l.map((a) => Math.round(a.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
    const barH = await page.locator(BAR).evaluate((el) => el.getBoundingClientRect().height);
    expect(barH).toBeLessThan(80);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('Tab / Shift+Tab: after Enter the focus enters the section; Shift+Tab goes back out', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('scrollable'));
    await page.getByRole('link', { name: 'Lines' }).focus();
    await page.keyboard.press('Enter');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Lines' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Field Lines' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    // Focus is in the previous section or the bar; the focused field must remain visible below the bar.
    const ok = await page.evaluate(() => {
      const bar = document.querySelector('nav[aria-label]')!.getBoundingClientRect();
      const r = document.activeElement!.getBoundingClientRect();
      return r.bottom > bar.bottom - 1 || document.activeElement!.closest('nav') !== null;
    });
    expect(ok).toBe(true);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  });

  test('repeated fast clicks on different links end on the last one clicked', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await gotoStory(page, STORY('scrollable'), 'sectionCount:10');
    await page.getByRole('link', { name: 'Audit' }).click();
    await page.getByRole('link', { name: 'Supplier' }).click();
    await settle(page);
    expect(await activeNames(page)).toEqual(['Supplier']);
    await expect(page.getByRole('heading', { name: 'Supplier' })).toBeFocused();
  });

  test('tablet 768px: a click lands the section under the bar', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoStory(page, STORY('scrollable'));
    await page.getByRole('link', { name: 'Amounts' }).click();
    await settle(page);
    const d = await page.evaluate(() => {
      const bar = document.querySelector('nav[aria-label]')!.getBoundingClientRect();
      const s = [...document.querySelectorAll('section,[role=region]')].find((e) => e.getAttribute('aria-label') === 'Amounts' || e.querySelector('h2')?.textContent === 'Amounts')!;
      return s.getBoundingClientRect().top - bar.bottom;
    });
    expect(d).toBeGreaterThanOrEqual(-1);
    expect(d).toBeLessThanOrEqual(8);
  });

  test('unmount leaves no errors (navigating away from the story)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await gotoStory(page, STORY('scrollable'));
    await page.getByRole('link', { name: 'Lines' }).click();
    await gotoStory(page, STORY('nothing-to-scroll'));
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
});
