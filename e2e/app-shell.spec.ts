import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow, expectSingleScroller } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';
import { VIEWPORTS } from './helpers/viewports';

const ID = 'floorplans-app-shell--';

const rect = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
  });

const shell = (page: Page) => page.locator('[data-rop-app-shell]');

test.describe('Floorplans/App Shell', () => {
  test('the Playground and HeaderLoadsLater play functions pass and axe is clean', async ({ page }) => {
    for (const id of ['playground', 'header-loads-later']) {
      await expectPlayToPass(page, `${ID}${id}`);
      await expectNoA11yViolations(page);
    }
  });

  for (const id of ['long-page', 'without-nav', 'long-texts', 'in-a-box', 'many-links', 'with-list-report', 'with-object-page']) {
    test(`${id}: free of a11y violations`, async ({ page }) => {
      await gotoStory(page, `${ID}${id}`);
      await expectNoA11yViolations(page);
    });
  }

  for (const [name, width, height] of VIEWPORTS) {
    test(`${name}: the document does not scroll, only the content does; header and navigation stay`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, `${ID}long-page`);
      await expectSingleScroller(shell(page));
      await expectNoHorizontalOverflow(shell(page));
      const main = page.getByRole('main');
      expect(await main.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      const header = await rect(page, 'header');
      await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
      expect(await rect(page, 'header')).toEqual(header);
      expect(header.top).toBe(0);
      const box = await rect(page, '[data-rop-app-shell]');
      expect(Math.round(box.height)).toBe(height);
    });

    test(`${name}: the navigation is a column from 64rem, not displayed below; the content takes the rest`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, `${ID}long-page`);
      const nav = page.getByRole('navigation', { name: 'Main' });
      const main = await rect(page, 'main');
      if (width >= 1024) {
        await expect(nav).toBeVisible();
        const n = await rect(page, 'nav');
        expect(n.width).toBeCloseTo(256, 0);
        expect(main.left).toBeCloseTo(n.left + n.width, 0);
      } else {
        await expect(nav).toBeHidden();
        expect(main.left).toBe(0);
        expect(main.width).toBeCloseTo(width, 0);
      }
    });

    test(`${name}: long texts are cut, the page never gets wider than the window`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, `${ID}long-texts`);
      await expectNoHorizontalOverflow(shell(page));
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
      const header = await rect(page, 'header');
      expect(header.height).toBeCloseTo(57, 0);
    });

    test(`${name}: a List Report and an Object Page inside: one scroller, no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const id of ['with-list-report', 'with-object-page']) {
        await gotoStory(page, `${ID}${id}`);
        await expectSingleScroller(shell(page));
        await expectNoHorizontalOverflow(shell(page));
        expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight)).toBe(true);
      }
    });
  }

  test('without a navigation the content takes the whole width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, `${ID}without-nav`);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    const main = await rect(page, 'main');
    expect(main.left).toBe(0);
    expect(main.width).toBeCloseTo(1280, 0);
  });

  test('the header keeps its height when its parts arrive after the mount: the content does not move', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, `${ID}header-loads-later`);
    const before = await rect(page, 'main');
    await expect(page.getByText('User one')).toBeVisible();
    expect(await rect(page, 'main')).toEqual(before);
  });

  test('the skip link: first Tab stop, visible with a focus ring when focused, Enter moves the focus to the content', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, `${ID}long-page`);
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toHaveCSS('opacity', '0');
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await expect(skip).toHaveCSS('opacity', '1');
    await expectFocusRingVisible(skip);
    const url = page.url();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    expect(page.url()).toBe(url);
    // The next Tab goes into the content, not back to the header or the navigation.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);
  });

  test('a link of the navigation: Enter opens it, aria-current moves; its focus ring is not clipped', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, `${ID}long-page`);
    const nav = page.getByRole('navigation', { name: 'Main' });
    const b = nav.getByRole('link', { name: 'Section B' });
    await b.focus();
    await expectFocusRingVisible(b);
    await page.keyboard.press('Enter');
    await expect(b).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Section B');
  });

  test('with more links than the column holds, the navigation scrolls on its own and the content does not move', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await gotoStory(page, `${ID}many-links`);
    const nav = page.getByRole('navigation', { name: 'Main' });
    expect(await nav.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const main = await rect(page, 'main');
    await nav.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    expect(await rect(page, 'main')).toEqual(main);
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  });

  test('fill="parent": the shell takes the height of its box, the page does not scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, `${ID}in-a-box`);
    const box = await rect(page, '[data-testid="box"]');
    const root = await rect(page, '[data-rop-app-shell]');
    expect(root.height).toBeCloseTo(box.height - 2, 0);
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight)).toBe(true);
  });

  test('List Report: coming back to the list puts the table back where it was', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, `${ID}with-list-report`);
    const table = page.locator('main table').first();
    await expect(table).toBeVisible();
    // The table's scroller: the one element inside the content that scrolls vertically.
    const scrolled = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('main *')) as HTMLElement[];
      const el = els.find((e) => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight)!;
      el.scrollTop = 400;
      return el.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(0);
    // The hook saves on its scroll listener; wait until the position is in sessionStorage before leaving.
    await expect
      .poll(() => page.evaluate(() => Object.keys(sessionStorage).some((k) => k.includes('app-shell-story'))))
      .toBe(true);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Section B' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Section B' })).toBeVisible();
    await nav.getByRole('link', { name: 'Section A' }).click();
    await expect(table).toBeVisible();
    const restored = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('main *')) as HTMLElement[];
      const el = els.find((e) => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight)!;
      return el.scrollTop;
    });
    expect(restored).toBe(scrolled);
  });

  test('a dialog and a toast opened from the content are above the header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, `${ID}overlays-above-the-header`);
    await page.getByRole('button', { name: 'Show toast' }).click();
    await page.getByRole('button', { name: 'Open dialog' }).click();
    const dialog = page.getByRole('dialog', { name: 'Dialog over the shell' });
    await expect(dialog).toBeVisible();
    const top = await page.evaluate(() => {
      const header = document.querySelector('header')!.getBoundingClientRect();
      const el = document.elementFromPoint(header.left + 10, header.top + header.height / 2);
      return el?.closest('header') ? 'header' : 'overlay';
    });
    expect(top).toBe('overlay');
  });
});
