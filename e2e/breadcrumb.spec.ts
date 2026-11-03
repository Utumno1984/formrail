import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectFocusRingVisible, expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

const ID = 'navigation-breadcrumb--';

test.describe('Navigation/Breadcrumb', () => {
  test('the Playground and AsChildRecipe play functions pass and axe is clean', async ({ page }) => {
    await expectPlayToPass(page, `${ID}playground`);
    await expectNoA11yViolations(page);
    await expectPlayToPass(page, `${ID}as-child-recipe`);
    await expectNoA11yViolations(page);
  });

  test('every story is free of a11y violations', async ({ page }) => {
    for (const id of ['two-items', 'separators', 'six-long-truncated', 'unbroken-code']) {
      await gotoStory(page, `${ID}${id}`);
      await expectNoA11yViolations(page);
    }
  });

  test('Tab crosses only the links, in visual order; the current item is skipped', async ({ page }) => {
    await gotoStory(page, `${ID}six-long-truncated`);
    const links = page.getByRole('link');
    expect(await links.count()).toBe(5);
    const xs: number[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      xs.push(await page.evaluate(() => document.activeElement!.getBoundingClientRect().left));
    }
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement!.closest('nav'))).toBeNull();
  });

  test('the focus ring of every link is fully visible, also when the item is truncated', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoStory(page, `${ID}six-long-truncated`);
    const links = page.getByRole('link');
    for (let i = 0; i < (await links.count()); i++) await expectFocusRingVisible(links.nth(i));
  });

  test('six long items at 375px: ellipsis on one line, no horizontal overflow, accessible name is the full text', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoStory(page, `${ID}six-long-truncated`);
    await expectNoHorizontalOverflow(page.locator('body'));
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(m.scroll).toBeLessThanOrEqual(m.client);
    const items = await page.locator('nav li').evaluateAll((els) =>
      els.map((li) => {
        const text = li.querySelector('[class*="text-ellipsis"]') as HTMLElement;
        const r = li.getBoundingClientRect();
        return {
          width: r.width,
          right: r.right,
          truncated: text.scrollWidth > text.clientWidth,
          lineHeight: text.getBoundingClientRect().height,
          overflow: getComputedStyle(text).overflow,
          ws: getComputedStyle(text).whiteSpace,
        };
      }),
    );
    expect(items.every((i) => i.truncated)).toBe(true);
    expect(items.every((i) => i.overflow === 'hidden' && i.ws === 'nowrap')).toBe(true);
    expect(new Set(items.map((i) => i.lineHeight)).size).toBe(1); // one line each
    expect(Math.max(...items.map((i) => i.right))).toBeLessThanOrEqual(375);
    await expect(page.getByRole('link', { name: 'Invoices received from suppliers' })).toBeVisible();
  });

  test('the current item has priority: it is truncated less than the previous ones, which are narrower', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoStory(page, `${ID}six-long-truncated`);
    const w = await page.locator('nav li').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    const current = w[w.length - 1]!;
    for (const prev of w.slice(0, -1)) expect(current).toBeGreaterThan(prev);
  });

  test('each previous item has a real max-width on its container (not only text-overflow)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, `${ID}six-long-truncated`);
    const widths = await page.locator('nav li').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const w of widths.slice(0, -1)) expect(w).toBeLessThanOrEqual(16 * 16 + 1 + 40 /* separator */);
  });

  test('an unbroken 90-character code truncates instead of overflowing at 280px', async ({ page }) => {
    await gotoStory(page, `${ID}unbroken-code`);
    await expectNoHorizontalOverflow(page.getByTestId('container'));
  });

  test('no tooltip at mount; hovering a truncated link shows the full text; a short one shows nothing', async ({ page }) => {
    await gotoStory(page, `${ID}six-long-truncated`);
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.getByRole('link', { name: 'Suppliers located in northern Italy' }).hover();
    await expect(page.getByRole('tooltip')).toHaveText('Suppliers located in northern Italy');
    await page.mouse.move(0, 700, { steps: 8 });
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    await gotoStory(page, `${ID}two-items`);
    await page.getByRole('link', { name: 'Invoices' }).hover();
    await page.waitForTimeout(800);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('the first item has no visible separator; later ones do; a single item shows none', async ({ page }) => {
    await gotoStory(page, `${ID}separators`);
    const info = await page.locator('nav').evaluateAll((navs) =>
      navs.map((n) =>
        Array.from(n.querySelectorAll('[data-rop-breadcrumb-separator]')).map((s) => s.getClientRects().length > 0),
      ),
    );
    expect(info[0]).toEqual([false, true, true]);
    expect(info[1]).toEqual([false, true, true]);
    expect(info[2]).toEqual([false]);
  });

  test('RTL: the order is reversed and the chevron is mirrored', async ({ page }) => {
    await gotoStory(page, `${ID}separators`);
    const nav = page.getByRole('navigation', { name: 'Breadcrumb chevron' });
    const ltr = await nav.evaluate((n) => ({
      first: n.querySelector('li')!.getBoundingClientRect().left,
      last: n.querySelector('li:last-child')!.getBoundingClientRect().left,
      scale: getComputedStyle(n.querySelector('[data-rop-breadcrumb-separator] svg')!).scale,
    }));
    expect(ltr.first).toBeLessThan(ltr.last);
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    const rtl = await nav.evaluate((n) => ({
      first: n.querySelector('li')!.getBoundingClientRect().left,
      last: n.querySelector('li:last-child')!.getBoundingClientRect().left,
      scale: getComputedStyle(n.querySelector('[data-rop-breadcrumb-separator] svg')!).scale,
    }));
    expect(rtl.first).toBeGreaterThan(rtl.last);
    expect(rtl.scale).toMatch(/^-1/);
    expect(ltr.scale).not.toMatch(/^-1/);
  });

  test('an icon-only link keeps its accessible name from the hidden text', async ({ page }) => {
    await gotoStory(page, `${ID}separators`);
    await expect(page.getByRole('link', { name: 'Home' }).first()).toBeVisible();
  });

  test('only the last item has aria-current, and separators are not in the accessibility tree', async ({ page }) => {
    await gotoStory(page, `${ID}two-items`);
    await expect(page.locator('nav [aria-current="page"]')).toHaveText('2026-0142');
    await expect(page.locator('nav [aria-current]')).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('listitem')).toHaveCount(2);
  });
});
