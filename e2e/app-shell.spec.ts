import { devices, expect, test, type Locator, type Page } from '@playwright/test';
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
        // 16rem, the inline-end rule included (the variable is the whole footprint).
        const n = await rect(page, 'nav');
        expect(n.width).toBeCloseTo(256, 0);
        // A one-line link is as tall as its minimum (2.5rem), its padding included.
        expect((await rect(page, '[data-rop-app-shell-nav-link]')).height).toBeCloseTo(40, 0);
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
      // The variable is the whole footprint: 3.5rem, the bottom rule included.
      const header = await rect(page, 'header');
      expect(header.height).toBeCloseTo(56, 0);
      // Every part keeps a share of the row and cuts its text with an ellipsis: none is squeezed to nothing.
      for (const part of ['start', 'center', 'end']) {
        const box = await rect(page, `[data-rop-app-shell-header-${part}]`);
        expect(box.width, part).toBeGreaterThan(24);
        const text = page.locator(`[data-rop-app-shell-header-${part}] span`).first();
        await expect(text).toBeVisible();
        expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth), `${part} is cut`).toBe(true);
        expect(await text.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
      }
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

  test('a toast, a menu and a dialog opened from the content are above the header', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, `${ID}overlays-above-the-header`);
    const header = await rect(page, 'header');
    // Whether the element drawn at a point belongs to `owner` (and not, say, to the header over it).
    const drawnBy = (owner: Locator, x: number, y: number) =>
      owner.evaluate((el, [px, py]) => {
        const hit = document.elementFromPoint(px!, py!);
        return !!hit && el.contains(hit);
      }, [x, y]);

    // The toast: shown, outside the shell, and nothing is drawn over it.
    await page.getByRole('button', { name: 'Show toast' }).click();
    const toast = page.getByRole('status').filter({ hasText: 'A toast over the shell' });
    const text = toast.getByText('A toast over the shell');
    await expect(text).toBeVisible();
    const t = (await text.boundingBox())!;
    expect(await drawnBy(toast, t.x + t.width / 2, t.y + t.height / 2)).toBe(true);
    expect(await toast.evaluate((el) => !!el.closest('[data-rop-app-shell]'))).toBe(false);

    // The menu opens upwards, over the header: where both are, the menu is drawn.
    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const m = (await menu.boundingBox())!;
    expect(m.y).toBeLessThan(header.bottom - 8);
    expect(await drawnBy(menu, m.x + m.width / 2, (Math.max(m.y, header.top) + header.bottom) / 2)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // The dialog and its backdrop cover the header.
    await page.getByRole('button', { name: 'Open dialog' }).click();
    const dialog = page.getByRole('dialog', { name: 'Dialog over the shell' });
    await expect(dialog).toBeVisible();
    const top = await page.evaluate(() => {
      const box = document.querySelector('header')!.getBoundingClientRect();
      const el = document.elementFromPoint(box.left + 10, box.top + box.height / 2);
      return el?.closest('header') ? 'header' : 'overlay';
    });
    expect(top).toBe('overlay');
  });

  test('the breakpoint is exact: no column at 1023px, a column at 1024px (64rem)', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await gotoStory(page, `${ID}long-page`);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeHidden();
    expect((await rect(page, 'main')).left).toBe(0);
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(nav).toBeVisible();
    expect((await rect(page, 'main')).left).toBeCloseTo(256, 0);
  });
});

// Virtual keyboard (spec §1.10): a desktop browser has no on-screen keyboard, so the visual viewport is a
// controllable stand-in (same technique as e2e/sheet.spec.ts). A focused Field publishes the keyboard's height as
// `--rop-keyboard-inset`; the shell counts it once: the content ends above it, nothing inside adds it again.
test.describe('Floorplans/App Shell: virtual keyboard', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  // 20% and 45% of the 667px window, in whole px.
  const KEYBOARDS = [133, 300];

  const emulateKeyboard = (page: Page) =>
    page.addInitScript(() => {
      const target = new EventTarget();
      let keyboard = 0;
      const vv = Object.defineProperties(target, {
        offsetTop: { value: 0 },
        offsetLeft: { value: 0 },
        pageTop: { value: 0 },
        pageLeft: { value: 0 },
        scale: { value: 1 },
        height: { get: () => window.innerHeight - keyboard },
        width: { get: () => window.innerWidth },
      });
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
      (window as unknown as { __setKeyboard: (px: number) => void }).__setKeyboard = (px) => {
        keyboard = px;
        target.dispatchEvent(new Event('resize'));
      };
    });
  const setKeyboard = (page: Page, px: number) =>
    page.evaluate((n) => (window as unknown as { __setKeyboard: (k: number) => void }).__setKeyboard(n), px);
  const visualHeight = (page: Page) => page.evaluate(() => window.visualViewport!.height);
  const published = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--rop-keyboard-inset').trim());
  const bottom = async (locator: Locator) => {
    const box = (await locator.boundingBox())!;
    return box.y + box.height;
  };
  /** The bottom scroll margin of a Field (on its root, which holds the focused control). */
  const fieldScrollMargin = (input: Locator) =>
    input.evaluate((el) => getComputedStyle(el.closest('[style*="scroll-margin"]')!).scrollMarginBottom);

  for (const [id, padding] of [
    ['form-at-the-bottom', 0],
    ['form-in-a-padded-content', 24],
  ] as const) {
    test(`${id}: the last field stays above the keyboard, the header at the top, the keyboard counted once`, async ({ page }) => {
      await emulateKeyboard(page);
      await gotoStory(page, `${ID}${id}`);
      const main = page.getByRole('main');
      const input = page.getByRole('textbox', { name: 'Last field' });
      await input.focus();
      for (const keyboard of KEYBOARDS) {
        await setKeyboard(page, keyboard);
        await expect.poll(() => published(page)).toBe(`${keyboard}px`);
        const limit = await visualHeight(page);
        expect(limit).toBe(667 - keyboard);
        // The field is scrolled into view above the keyboard, below the header.
        await expect.poll(() => bottom(input)).toBeLessThanOrEqual(limit);
        expect((await input.boundingBox())!.y).toBeGreaterThanOrEqual((await rect(page, 'header')).bottom);
        // The header stays at the top, the document does not scroll.
        expect((await rect(page, 'header')).top).toBe(0);
        expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
        const style = await main.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { border: cs.borderBottomWidth, padding: cs.paddingBottom, inset: cs.getPropertyValue('--rop-keyboard-inset').trim() };
        });
        // The keyboard's room is the main's bottom border, its whole height, once: the scrolled area ends at the
        // top of the keyboard. The consumer's padding is kept whole above it.
        expect(parseFloat(style.border)).toBe(keyboard);
        expect(parseFloat(style.padding)).toBe(padding);
        expect((await rect(page, 'main')).bottom).toBe(667);
        expect(await main.evaluate((el) => el.getBoundingClientRect().top + el.clientTop + el.clientHeight)).toBe(limit);
        // Inside the content the keyboard is zero: the field keeps only its own small margin (0.5rem).
        expect(style.inset).toBe('0px');
        expect(await fieldScrollMargin(input)).toBe('8px');
      }
      await setKeyboard(page, 0);
      await expect.poll(async () => parseFloat(await main.evaluate((el) => getComputedStyle(el).borderBottomWidth))).toBe(0);
      expect(parseFloat(await main.evaluate((el) => getComputedStyle(el).paddingBottom))).toBe(padding);
    });
  }

  test('with-object-page: the save bar stays right above the keyboard, which is counted once', async ({ page }) => {
    await emulateKeyboard(page);
    await gotoStory(page, `${ID}with-object-page`);
    const input = page.getByRole('textbox', { name: 'Last field' });
    const saveBar = page.locator('[data-object-page-footer]');
    await expect(saveBar).toBeVisible();
    await input.focus();
    for (const keyboard of KEYBOARDS) {
      await setKeyboard(page, keyboard);
      await expect.poll(() => published(page)).toBe(`${keyboard}px`);
      const limit = 667 - keyboard;
      expect(await visualHeight(page)).toBe(limit);
      // On the keyboard's top edge: not under it, and not a keyboard higher (counted twice).
      await expect.poll(async () => Math.round(await bottom(saveBar))).toBe(limit);
      expect((await rect(page, 'header')).top).toBe(0);
      expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
      // The field is scrolled above the save bar.
      await expect.poll(async () => (await bottom(input)) <= (await saveBar.boundingBox())!.y).toBe(true);
      // Inside the shell the keyboard is zero: the field's margin does not add it again.
      expect(await fieldScrollMargin(input)).toBe('8px');
    }
  });
});

// #721: below 64rem the navigation column is not displayed, and only `AppShellNavTrigger` opens the navigation. Every
// story with an `AppShellNav` has the trigger: on a portrait tablet (768px) it is displayed, a tap opens the Sheet,
// and its close button (44 x 44 px under a coarse pointer) closes it and gives the focus back to the trigger. A phone
// profile (`pointer: coarse`, as interaction-affordance-touch.spec.ts) at the width of a portrait tablet;
// `defaultBrowserType` cannot be set inside a describe block, so it is dropped from the profile.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { defaultBrowserType: _ignored, ...touchProfile } = devices['Pixel 5'];
const PORTRAIT_TABLET = { width: 768, height: 1024 };

test.describe('Floorplans/App Shell: the navigation trigger at 768px (#721)', () => {
  test.use({ ...touchProfile, viewport: PORTRAIT_TABLET, reducedMotion: 'reduce' });

  const STORIES_WITH_NAV = [
    'playground',
    'long-page',
    'long-texts',
    'in-a-box',
    'many-links',
    'header-loads-later',
    'with-list-report',
    'with-object-page',
  ];

  for (const id of STORIES_WITH_NAV) {
    test(`@touch ${id}: the trigger is displayed and a tap opens the navigation; a tap on its close button closes it`, async ({
      page,
    }) => {
      await gotoStory(page, `${ID}${id}`);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'precondition: a coarse pointer').toBe(true);
      await expect(page.locator('[data-rop-app-shell-nav]')).toBeHidden();
      const trigger = page.locator('[data-rop-app-shell-nav-trigger]');
      await expect(trigger).toHaveCount(1);
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeInViewport();
      await expect(trigger).toBeEnabled();
      expect(await trigger.evaluate((el) => (el as HTMLElement).tabIndex)).toBe(0);
      await trigger.tap();
      const sheet = page.getByRole('dialog', { name: 'Main' });
      await expect(sheet).toHaveAttribute('data-state', 'open');
      await expect(sheet.getByRole('navigation', { name: 'Main' }).getByRole('link').first()).toBeVisible();
      const close = sheet.getByRole('button', { name: 'Close: Main' });
      const box = (await close.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await close.tap();
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }
});
