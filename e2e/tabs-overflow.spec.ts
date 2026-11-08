import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectNoHorizontalOverflow } from './helpers/geometry';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #309: a horizontal tab list with more tabs than fit. It scrolls, shows an indicator on each side
// that hides tabs, and every tab stays reachable (keyboard and pointer), never cut mid-letter in
// plain view.

const MANY = 'navigation-tabs--many-tabs';
const LABELS = [
  'Overview',
  'Details',
  'Attachments',
  'History',
  'Approvals',
  'Notes',
  'Payments',
  'Contacts',
  'Taxes',
  'Audit log',
  'Settings',
  'Archive',
];
const VIEWPORTS = [
  ['desktop', 1280, 800],
  ['tablet', 768, 1024],
  ['mobile', 375, 667],
] as const;

/** Sub-pixel tolerance for rect comparisons, as in helpers/geometry.ts. */
const EPS = 1;

const edge = (page: Page, side: 'start' | 'end') => page.locator(`[data-rop-tabs-edge="${side}"]`);

/**
 * The part of the list not covered by a visible indicator. A tab inside it is shown whole: no
 * indicator over it, not clipped by the list.
 */
async function clearZone(page: Page): Promise<{ left: number; right: number }> {
  return page.getByRole('tablist').evaluate((list) => {
    const box = list.getBoundingClientRect();
    let left = box.left;
    let right = box.right;
    for (const el of Array.from(document.querySelectorAll('[data-rop-tabs-edge]'))) {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.left - box.left) < 1) left = Math.max(left, r.right);
      if (Math.abs(r.right - box.right) < 1) right = Math.min(right, r.left);
    }
    return { left, right };
  });
}

async function expectInClearView(page: Page, tab: Locator): Promise<void> {
  // Scroll events are dispatched on the next frame: the indicators follow the scroll a frame later.
  // What must hold is the settled state, so retry until it does (default expect timeout).
  await expect(async () => checkInClearView(page, tab)).toPass();
}

async function checkInClearView(page: Page, tab: Locator): Promise<void> {
  const zone = await clearZone(page);
  const box = (await tab.boundingBox())!;
  // EPS: the browser rounds `scrollLeft`, so a tab scrolled to the very end of an RTL list can sit a
  // fraction of a pixel past the edge (inside its own 12px padding, never on a glyph).
  expect(box.x, `${await tab.textContent()} starts inside the clear part of the list`).toBeGreaterThanOrEqual(zone.left - EPS);
  expect(box.x + box.width, `${await tab.textContent()} ends inside the clear part of the list`).toBeLessThanOrEqual(zone.right + EPS);
  // Nothing is painted over it: the topmost element at its centre is the tab itself.
  const onTop = await tab.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
  expect(onTop).toBe(true);
}

/**
 * Wherever the list's edge cuts a tab, the cut is under an indicator, never exposed: the topmost
 * element at the list's inner edge (on the row of the tabs) is the indicator.
 */
async function expectCutEdgesCovered(page: Page): Promise<void> {
  // Settled state, as in expectInClearView.
  await expect(async () => expect(await cutEdgesUncovered(page)).toEqual([])).toPass();
}

async function cutEdgesUncovered(page: Page): Promise<string[]> {
  return page.getByRole('tablist').evaluate((list) => {
    const box = list.getBoundingClientRect();
    const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));
    const y = box.top + box.height / 2;
    const problems: string[] = [];
    for (const [x, side] of [
      [box.left, 'left'],
      [box.right, 'right'],
    ] as const) {
      const cut = tabs.find((t) => {
        const r = t.getBoundingClientRect();
        return r.left < x - 0.5 && r.right > x + 0.5;
      });
      if (!cut) continue;
      const probe = side === 'left' ? x + 1 : x - 1;
      const hit = document.elementFromPoint(probe, y);
      if (!hit?.closest('[data-rop-tabs-edge]')) {
        problems.push(`"${cut.textContent}" is cut at the ${side} edge with no indicator over it`);
      }
    }
    return problems;
  });
}

test.describe('Navigation/Tabs: overflow (#309)', () => {
  for (const [name, width, height] of VIEWPORTS) {
    test(`${name}: the overflowing list shows the end indicator only, and no tab is cut in plain view`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, MANY);
      const list = page.getByRole('tablist');
      expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(true);
      await expect(edge(page, 'end')).toBeVisible();
      await expect(edge(page, 'start')).toHaveCount(0);
      // The indicator sits over the list's end edge, as tall as the tab row.
      const listBox = (await list.boundingBox())!;
      const endBox = (await edge(page, 'end').boundingBox())!;
      expect(Math.abs(endBox.x + endBox.width - (listBox.x + listBox.width))).toBeLessThanOrEqual(0.5);
      expect(endBox.y).toBeLessThanOrEqual(listBox.y + 0.5);
      expect(endBox.height).toBeGreaterThanOrEqual(listBox.height - 1.5);
      // The list's scroll-padding (what keeps a focused tab clear) is exactly the indicator's width.
      const padding = await list.evaluate((el) => parseFloat(getComputedStyle(el).scrollPaddingInlineEnd));
      expect(Math.abs(endBox.width - padding)).toBeLessThanOrEqual(0.5);
      await expectCutEdgesCovered(page);
      await expectNoHorizontalOverflow(page.locator('body'));
    });

    test(`${name}: every tab is reachable with the arrow keys and shown whole when focused`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoStory(page, MANY);
      const pageY = await page.evaluate(() => window.scrollY);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('tab', { name: 'Overview' })).toBeFocused();
      for (const label of LABELS.slice(1)) {
        await page.keyboard.press('ArrowRight');
        const tab = page.getByRole('tab', { name: label });
        await expect(tab).toBeFocused();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expectInClearView(page, tab);
        await expectCutEdgesCovered(page);
      }
      // At the end: nothing hidden past the end, tabs hidden before the start.
      await expect(edge(page, 'end')).toHaveCount(0);
      await expect(edge(page, 'start')).toBeVisible();
      // Home jumps back: the first tab whole, the start indicator gone.
      await page.keyboard.press('Home');
      await expect(page.getByRole('tab', { name: 'Overview' })).toBeFocused();
      await expectInClearView(page, page.getByRole('tab', { name: 'Overview' }));
      await expect(edge(page, 'start')).toHaveCount(0);
      // End jumps to the last tab, shown whole.
      await page.keyboard.press('End');
      await expectInClearView(page, page.getByRole('tab', { name: 'Archive' }));
      // ArrowLeft back through the list, every tab whole again.
      for (const label of LABELS.slice(0, -1).reverse()) {
        await page.keyboard.press('ArrowLeft');
        await expectInClearView(page, page.getByRole('tab', { name: label }));
      }
      expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
    });
  }

  test('pointer: the indicators scroll the list until every tab can be clicked, without taking the focus', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, MANY);
    const first = page.getByRole('tab', { name: 'Overview' });
    await first.focus();
    const list = page.getByRole('tablist');
    let clicks = 0;
    while ((await edge(page, 'end').count()) > 0) {
      const before = await list.evaluate((el) => el.scrollLeft);
      await edge(page, 'end').click();
      // Each click moves forward (no dead indicator).
      expect(await list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
      await expect(first).toBeFocused();
      await expectCutEdgesCovered(page);
      expect(++clicks).toBeLessThan(LABELS.length);
    }
    // At least one click was needed; now the last tab is whole and clickable.
    expect(clicks).toBeGreaterThan(0);
    const last = page.getByRole('tab', { name: 'Archive' });
    await expectInClearView(page, last);
    await last.click();
    await expect(last).toHaveAttribute('aria-selected', 'true');
    // And back to the start with the other indicator.
    clicks = 0;
    while ((await edge(page, 'start').count()) > 0) {
      const before = await list.evaluate((el) => el.scrollLeft);
      await edge(page, 'start').click();
      // Each click moves back (no dead indicator), and the focus stays on the tab that has it.
      expect(await list.evaluate((el) => el.scrollLeft)).toBeLessThan(before);
      await expect(last).toBeFocused();
      await expectCutEdgesCovered(page);
      expect(++clicks).toBeLessThan(LABELS.length);
    }
    expect(await list.evaluate((el) => el.scrollLeft)).toBe(0);
    await expectInClearView(page, first);
  });

  test('reduced motion: the click that reaches an end removes that indicator in the same task, not a frame later', async ({ page }) => {
    // Before, the indicators followed the `scroll` event, dispatched on the next frame: for that frame
    // the indicator of the end just reached was still there, and a second click (or a test reading
    // the DOM right after the first) hit an indicator that was about to be removed. Checked inside the
    // page, in the task of the click itself (a microtask later, where React flushes a discrete event):
    // no frame, so no `scroll` event, can happen in between.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, MANY);
    const list = page.getByRole('tablist');
    const clickAndReadNow = (side: 'start' | 'end') =>
      page.evaluate(async (s) => {
        const indicator = document.querySelector<HTMLElement>(`[data-rop-tabs-edge="${s}"]`)!;
        indicator.click();
        await Promise.resolve();
        const el = document.querySelector<HTMLElement>('[role="tablist"]')!;
        return {
          atEnd: el.scrollWidth - el.clientWidth - el.scrollLeft <= 1,
          atStart: el.scrollLeft <= 1,
          start: document.querySelectorAll('[data-rop-tabs-edge="start"]').length,
          end: document.querySelectorAll('[data-rop-tabs-edge="end"]').length,
        };
      }, side);
    // A few pixels short of the end: one click reaches it.
    await list.evaluate((el) => {
      el.scrollLeft = el.scrollWidth - el.clientWidth - 5;
    });
    await expect(edge(page, 'end')).toBeVisible();
    await expect(edge(page, 'start')).toBeVisible();
    expect(await clickAndReadNow('end')).toEqual({ atEnd: true, atStart: false, start: 1, end: 0 });
    // A few pixels from the start: one click reaches it.
    await list.evaluate((el) => {
      el.scrollLeft = 5;
    });
    await expect(edge(page, 'end')).toBeVisible();
    expect(await clickAndReadNow('start')).toEqual({ atEnd: false, atStart: true, start: 0, end: 1 });
  });

  test('pointer: a click on an indicator scrolls smoothly when motion is allowed', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gotoStory(page, MANY);
    const list = page.getByRole('tablist');
    await edge(page, 'end').click();
    // The list keeps moving until it settles at the end (the desktop demo needs one click).
    await expect.poll(() => list.evaluate((el) => Math.round(el.scrollWidth - el.clientWidth - el.scrollLeft))).toBe(0);
    await expect(edge(page, 'end')).toHaveCount(0);
    await expect(edge(page, 'start')).toBeVisible();
  });

  test('touch/trackpad scrolling of the list itself updates the indicators', async ({ page }) => {
    await gotoStory(page, MANY);
    const list = page.getByRole('tablist');
    await list.evaluate((el) => {
      el.scrollLeft = 60;
    });
    await expect(edge(page, 'start')).toBeVisible();
    await expect(edge(page, 'end')).toBeVisible();
    await expectCutEdgesCovered(page);
    await list.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect(edge(page, 'end')).toHaveCount(0);
    await list.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await expect(edge(page, 'start')).toHaveCount(0);
    await expect(edge(page, 'end')).toBeVisible();
  });

  test('a resize that makes the tabs fit removes the indicator; shrinking again brings it back', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, MANY);
    await expect(edge(page, 'end')).toBeVisible();
    // Widen the demo box past the tabs' total width.
    await page.getByRole('tablist').evaluate((el) => {
      (el.closest('[data-rop-tabs]')!.parentElement as HTMLElement).style.maxWidth = 'none';
    });
    await page.setViewportSize({ width: 1800, height: 800 });
    await expect(edge(page, 'end')).toHaveCount(0);
    await expect(edge(page, 'start')).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(edge(page, 'end')).toBeVisible();
  });

  test('text zoom (a larger root font size): one click scrolls a view minus the indicators as rendered @engines', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, MANY);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '20px';
    });
    const list = page.getByRole('tablist');
    // `w-12` is rem based: 60px at 20px, and still the list's scroll-padding.
    await expect.poll(() => edge(page, 'end').evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(60, 0);
    const padding = await list.evaluate((el) => parseFloat(getComputedStyle(el).scrollPaddingInlineEnd));
    expect(padding).toBeCloseTo(60, 0);
    const { clientWidth, max } = await list.evaluate((el) => ({ clientWidth: el.clientWidth, max: el.scrollWidth - el.clientWidth }));
    await edge(page, 'end').click();
    const step = Math.min(clientWidth - 2 * 60, max);
    await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeCloseTo(step, 0);
    await expectCutEdgesCovered(page);
  });

  test('rtl: the end indicator is on the left and scrolls towards the end; keyboard reaches every tab @engines', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, MANY, 'dir:rtl');
    const list = page.getByRole('tablist');
    await expect(edge(page, 'start')).toHaveCount(0);
    const listBox = (await list.boundingBox())!;
    const endBox = (await edge(page, 'end').boundingBox())!;
    expect(Math.abs(endBox.x - listBox.x)).toBeLessThanOrEqual(0.5);
    await expectCutEdgesCovered(page);
    await edge(page, 'end').click();
    await expect(edge(page, 'start')).toBeVisible();
    expect(await list.evaluate((el) => el.scrollLeft)).toBeLessThan(0);
    const startBox = (await edge(page, 'start').boundingBox())!;
    expect(Math.abs(startBox.x + startBox.width - (listBox.x + listBox.width))).toBeLessThanOrEqual(0.5);
    await page.getByRole('tab', { name: 'Overview' }).focus();
    for (const label of LABELS.slice(1)) {
      await page.keyboard.press('ArrowLeft');
      await expectInClearView(page, page.getByRole('tab', { name: label }));
    }
    await expect(edge(page, 'end')).toHaveCount(0);
  });

  test('the indicators are not tab stops: Tab goes from the selected tab straight to the panel', async ({ page }) => {
    await gotoStory(page, MANY);
    await page.getByRole('tablist').evaluate((el) => {
      el.scrollLeft = 60;
    });
    await expect(edge(page, 'start')).toBeVisible();
    await page.getByRole('tab', { name: 'Details' }).click();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tabpanel')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('tab', { name: 'Details' })).toBeFocused();
  });

  test('both indicators visible: axe is clean and the indicators are out of the accessibility tree', async ({ page }) => {
    await gotoStory(page, MANY);
    await page.getByRole('tablist').evaluate((el) => {
      el.scrollLeft = 60;
    });
    await expect(edge(page, 'start')).toBeVisible();
    await expect(edge(page, 'end')).toBeVisible();
    await expectNoA11yViolations(page);
    const tree = await page.getByRole('tablist').ariaSnapshot();
    expect(tree).not.toMatch(/img|button/);
  });

  for (const [name, width, height] of VIEWPORTS) {
    test(`${name}: the ManyTabsKeyboard play function passes; axe is clean in its final state`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await expectPlayToPass(page, 'navigation-tabs--many-tabs-keyboard');
      await expectInClearView(page, page.getByRole('tab', { name: 'Archive' }));
      await expectNoA11yViolations(page);
    });
  }

  test('a list that fits shows no indicator', async ({ page }) => {
    await gotoStory(page, 'navigation-tabs--horizontal');
    await expect(page.getByRole('tab')).toHaveCount(4);
    await expect(page.locator('[data-rop-tabs-edge]')).toHaveCount(0);
  });

  test('forced colors: the indicator has an opaque system background, not the light gradient', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoStory(page, MANY);
    const style = await edge(page, 'end').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { image: cs.backgroundImage, color: cs.backgroundColor };
    });
    expect(style.image).toBe('none');
    expect(style.color).not.toBe('rgba(0, 0, 0, 0)');
  });
});
