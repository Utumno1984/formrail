import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #501: a shade on each inline edge of the List Report's scroll container that hides columns. Geometry
// in a real browser: which edge, where, above what, below what, and what it never changes.

const FLOORPLAN = 'floorplans-list-report--no-play';
const ROW_ACTIONS = 'floorplans-list-report--row-actions-no-play';
const ROW_ACTIONS_INLINE = 'floorplans-list-report--row-actions-inline-no-play';
const FREE_STORY = 'floorplans-list-report--columns-hidden-sideways';
const PLAYGROUND = 'data-listreporttable--playground';
const PRO_STORY = 'pro-floorplans-virtual-list-report--columns-hidden-sideways';
const PRO_FIXTURE = 'pro-floorplans-virtual-list-report--default-no-play';
const PHONE = { width: 390, height: 844 };

/** The scroll container of the (first) List Report table of the story. */
const scroller = (page: Page): Locator => page.locator('#storybook-root [tabindex="0"]:has(> table)').first();

interface EdgeState {
  start: boolean;
  end: boolean;
  /** Computed visibility and opacity of each shade (null: no layer). */
  startShade: { visibility: string; opacity: string } | null;
  endShade: { visibility: string; opacity: string } | null;
  overflow: number;
}

async function edgeState(page: Page): Promise<EdgeState> {
  return scroller(page).evaluate((el) => {
    const shade = (edge: string) => {
      const s = el.querySelector(`:scope > [data-rop-overflow-edges] > [data-rop-overflow-edge="${edge}"]`);
      if (!s) return null;
      const cs = getComputedStyle(s);
      return { visibility: cs.visibility, opacity: cs.opacity };
    };
    return {
      start: el.hasAttribute('data-rop-overflow-start'),
      end: el.hasAttribute('data-rop-overflow-end'),
      startShade: shade('start'),
      endShade: shade('end'),
      overflow: el.scrollWidth - el.clientWidth,
    };
  });
}

const SHOWN = { visibility: 'visible', opacity: '1' };
const HIDDEN = { visibility: 'hidden', opacity: '0' };

/** Waits for both attributes, then for both shades to have finished their fade. */
async function expectEdges(page: Page, start: boolean, end: boolean): Promise<void> {
  await expect.poll(async () => {
    const s = await edgeState(page);
    return { start: s.start, end: s.end };
  }).toEqual({ start, end });
  await expect.poll(async () => {
    const s = await edgeState(page);
    return [s.startShade, s.endShade];
  // Neither edge hides content only when nothing overflows: then there is no layer at all.
  }).toEqual(start || end ? [start ? SHOWN : HIDDEN, end ? SHOWN : HIDDEN] : [null, null]);
}

/** Sets the distance scrolled from the inline start (negative `scrollLeft` in rtl). */
async function scrollFromStart(page: Page, distance: number | 'end' | 'middle'): Promise<void> {
  await scroller(page).evaluate((el, d) => {
    const max = el.scrollWidth - el.clientWidth;
    const value = d === 'end' ? max : d === 'middle' ? Math.round(max / 2) : d;
    el.scrollLeft = getComputedStyle(el).direction === 'rtl' ? -value : value;
  }, distance);
}

/** Box of an element relative to the scroller's border box. */
async function shadeBox(page: Page, edge: 'start' | 'end') {
  return scroller(page).evaluate((el, e) => {
    const s = el.querySelector(`[data-rop-overflow-edge="${e}"]`)!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { left: s.left - r.left - el.clientLeft, right: s.right - r.left - el.clientLeft, top: s.top - r.top - el.clientTop, height: s.height, clientWidth: el.clientWidth, clientHeight: el.clientHeight };
  }, edge);
}

async function waitForRows(page: Page): Promise<void> {
  await expect(scroller(page).locator('tbody tr').nth(3)).toBeVisible();
}

test.describe('List Report: edge shades (Free)', () => {
  test('390x844 with data: end only at the start, both in the middle, start only at the end (1px tolerance)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, FLOORPLAN);
    await waitForRows(page);
    expect((await edgeState(page)).overflow).toBeGreaterThan(1);
    await expectEdges(page, false, true);
    await scrollFromStart(page, 'middle');
    await expectEdges(page, true, true);
    await scrollFromStart(page, 'end');
    await expectEdges(page, true, false);
    // 1px from the end still counts as the end; 3px does not.
    const max = (await edgeState(page)).overflow;
    await scrollFromStart(page, max - 1);
    await expectEdges(page, true, false);
    await scrollFromStart(page, max - 3);
    await expectEdges(page, true, true);
    await scrollFromStart(page, 1);
    await expectEdges(page, false, true);
    await scrollFromStart(page, 0);
    await expectEdges(page, false, true);
  });

  test('1280x800, every column in view: no attribute, no layer', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, FLOORPLAN);
    await waitForRows(page);
    const state = await edgeState(page);
    expect(state.overflow).toBeLessThanOrEqual(1);
    expect(state).toMatchObject({ start: false, end: false, startShade: null, endShade: null });
    expect(await scroller(page).locator('[data-rop-overflow-edges]').count()).toBe(0);
  });

  test('a rotated tablet (768x1024 -> 1024x768) and back: the shades follow with no scroll; the end shade follows the width of the actions column in both forms', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoStory(page, ROW_ACTIONS_INLINE, 'selectable:!true');
    await waitForRows(page);
    await expectEdges(page, false, true);
    const actionsHeader = scroller(page).locator('thead th').last();
    // Wide form (40rem and more): the end shade ends where the actions column starts.
    let header = (await actionsHeader.boundingBox())!;
    let box = (await scroller(page).boundingBox())!;
    let shade = await shadeBox(page, 'end');
    expect(header.width).toBeGreaterThan(60);
    expect(Math.abs(box.x + shade.right - header.x)).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 1024, height: 768 });
    await expectEdges(page, false, false);
    expect(await scroller(page).locator('[data-rop-overflow-edges]').count()).toBe(0);
    await page.setViewportSize({ width: 768, height: 1024 });
    await expectEdges(page, false, true);

    // Narrow form (a phone): the column is one row height wide and the shade follows it.
    await page.setViewportSize(PHONE);
    await expectEdges(page, false, true);
    header = (await actionsHeader.boundingBox())!;
    box = (await scroller(page).boundingBox())!;
    shade = await shadeBox(page, 'end');
    expect(header.width).toBeLessThan(50);
    expect(Math.abs(box.x + shade.right - header.x)).toBeLessThanOrEqual(1);
  });

  test('row actions: the end shade is before the sticky column, the "…" trigger stays whole and clickable; its menu opens above the shade', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, ROW_ACTIONS);
    await waitForRows(page);
    await scrollFromStart(page, 'middle');
    await expectEdges(page, true, true);
    const trigger = page.getByRole('button', { name: /^Actions for / }).nth(2);
    const t = (await trigger.boundingBox())!;
    const box = (await scroller(page).boundingBox())!;
    const shade = await shadeBox(page, 'end');
    expect(box.x + shade.right).toBeLessThanOrEqual(t.x + 1);
    const hit = await trigger.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return at === el || el.contains(at);
    });
    expect(hit).toBe(true);
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    // A point of the menu that lies over the end shade belongs to the menu.
    const m = (await menu.boundingBox())!;
    const overShade = { x: Math.max(m.x + 2, box.x + shade.left + 2), y: m.y + m.height / 2 };
    expect(overShade.x).toBeLessThan(m.x + m.width);
    expect(overShade.x).toBeLessThan(box.x + shade.right);
    const inMenu = await menu.evaluate((el, p) => el.contains(document.elementFromPoint(p.x, p.y)), overShade);
    expect(inMenu).toBe(true);
  });

  test('a real click (and a tap) on a checkbox under the start shade selects the row; the shades are out of the tab order and the accessibility tree', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, ROW_ACTIONS, 'selectable:!true');
    await waitForRows(page);
    const box = scroller(page).locator('tbody tr').first().getByRole('checkbox');
    const centre = async () => {
      const b = (await box.boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const s = (await scroller(page).boundingBox())!;
    await scrollFromStart(page, Math.round((await centre()).x - s.x - 4));
    await expectEdges(page, true, true);
    const shade = await shadeBox(page, 'start');
    const c = await centre();
    expect(c.x).toBeGreaterThanOrEqual(s.x + shade.left);
    expect(c.x).toBeLessThanOrEqual(s.x + shade.right);
    expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.closest('input,[role="checkbox"]') !== null, c)).toBe(true);
    await page.mouse.click(c.x, c.y);
    await expect(box).toBeChecked();
    await expect(scroller(page).locator('tbody tr').first()).toHaveAttribute('data-selected', '');
    // Nothing of the layer is exposed or focusable.
    const layer = scroller(page).locator('[data-rop-overflow-edges]');
    await expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(await layer.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(await layer.locator('[tabindex], a, button, input').count()).toBe(0);
  });

  test('@touch a tap on a checkbox under the start shade selects the row', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, ROW_ACTIONS, 'selectable:!true');
    await waitForRows(page);
    const box = scroller(page).locator('tbody tr').nth(1).getByRole('checkbox');
    const b0 = (await box.boundingBox())!;
    const s = (await scroller(page).boundingBox())!;
    await scrollFromStart(page, Math.round(b0.x + b0.width / 2 - s.x - 4));
    await expectEdges(page, true, true);
    const b = (await box.boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await expect(box).toBeChecked();
  });

  test('the shades cover the whole visible height, header included, on the sticky level, also after a vertical scroll', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, ROW_ACTIONS);
    await waitForRows(page);
    await scroller(page).evaluate((el) => {
      el.scrollTop = 300;
    });
    await scrollFromStart(page, 'middle');
    await expectEdges(page, true, true);
    for (const edge of ['start', 'end'] as const) {
      const b = await shadeBox(page, edge);
      expect(Math.abs(b.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.height - b.clientHeight)).toBeLessThanOrEqual(1);
    }
    // The point of the start shade over the sticky header is the scroller's (the shade takes no pointer),
    // and the shade is painted above the header: the layer is after the table on the sticky level.
    const z = await scroller(page).evaluate((el) => {
      const layer = el.querySelector('[data-rop-overflow-edges]')!;
      const th = el.querySelector('thead th')!;
      return {
        layer: getComputedStyle(layer).zIndex,
        header: getComputedStyle(th).zIndex,
        token: getComputedStyle(document.documentElement).getPropertyValue('--z-index-rop-sticky').trim(),
        afterTable: el.lastElementChild === layer && el.firstElementChild?.tagName === 'TABLE',
      };
    });
    expect(z.token).not.toBe('');
    expect([z.layer, z.header, z.afterTable]).toEqual([z.token, z.token, true]);
  });

  test('stable footprint: the container and the table measure the same with and without the shades', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, ROW_ACTIONS);
    await waitForRows(page);
    await scrollFromStart(page, 'middle');
    await expectEdges(page, true, true);
    const measure = () =>
      scroller(page).evaluate((el) => {
        const t = el.querySelector('table')!.getBoundingClientRect();
        return [el.scrollWidth, el.scrollHeight, el.clientWidth, el.clientHeight, t.width, t.height, t.left, t.top];
      });
    const withShades = await measure();
    await page.addStyleTag({ content: '[data-rop-overflow-edges] { display: none !important; }' });
    expect(await measure()).toEqual(withShades);
  });

  test('states: loading, empty, no results and error follow the geometry; the empty message stays centred in the visible part', async ({ page }) => {
    await page.setViewportSize(PHONE);
    for (const id of ['floorplans-list-report--loading', 'floorplans-list-report--empty', 'floorplans-list-report--no-results', 'floorplans-list-report--error-state']) {
      await expectPlayToPass(page, id);
      expect((await edgeState(page)).overflow, id).toBeGreaterThan(1);
      await expectEdges(page, false, true);
    }
    await gotoStory(page, 'floorplans-list-report--empty');
    await expectEdges(page, false, true);
    const centred = await scroller(page).evaluate((el) => {
      const msg = el.querySelector('tbody td > *')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return Math.abs(msg.left + msg.width / 2 - (r.left + el.clientWidth / 2));
    });
    expect(centred).toBeLessThanOrEqual(1);
  });

  test('a container hidden (display: none) and shown again: the shade is right at once', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, FLOORPLAN);
    await waitForRows(page);
    await expectEdges(page, false, true);
    await scroller(page).evaluate((el) => {
      (el.parentElement as HTMLElement).style.display = 'none';
    });
    await expect.poll(async () => (await edgeState(page)).end).toBe(false);
    await page.evaluate(() => {
      const el = document.querySelector('#storybook-root [tabindex="0"]:has(> table)') as HTMLElement;
      (el.parentElement as HTMLElement).style.display = '';
    });
    await expectEdges(page, false, true);
  });

  test('keyboard scroll (End on the focused container) ends in the right state', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, FLOORPLAN);
    await waitForRows(page);
    await scroller(page).focus();
    for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowRight');
    await expect.poll(async () => scroller(page).evaluate((el) => el.scrollLeft >= el.scrollWidth - el.clientWidth - 1)).toBe(true);
    await expectEdges(page, true, false);
  });

  test('browser zoom 110% and 90%: no phantom shade at the start or at the end', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, FLOORPLAN);
    await waitForRows(page);
    for (const zoom of ['1.1', '0.9']) {
      await page.evaluate((z) => {
        (document.body.style as CSSStyleDeclaration & { zoom: string }).zoom = z;
      }, zoom);
      await scrollFromStart(page, 0);
      await expectEdges(page, false, true);
      await scroller(page).evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await expectEdges(page, true, false);
    }
  });

  test('rtl (Playground, 360px box): the end shade on the left at first, the start one on the right at the end', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, PLAYGROUND, 'containerWidth:360;dir:rtl;status:loading');
    await expectEdges(page, false, true);
    const box = await shadeBox(page, 'end');
    expect(box.left).toBeLessThanOrEqual(1);
    await scrollFromStart(page, 'end');
    expect(await scroller(page).evaluate((el) => el.scrollLeft)).toBeLessThan(0);
    await expectEdges(page, true, false);
    const start = await shadeBox(page, 'start');
    expect(Math.abs(start.right - start.clientWidth)).toBeLessThanOrEqual(1);
  });

  test('restored scroll position (useListReportScrollRestoration): the start shade is there with no gesture', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, 'floorplans-list-report--scroll-restoration-no-play', 'loadDelayMs:300');
    await expect(page.getByRole('button', { name: /^FT-2026-/ }).first()).toBeVisible();
    await scrollFromStart(page, 150);
    await expect.poll(() => scroller(page).evaluate((el) => el.scrollLeft)).toBe(150);
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByRole('button', { name: /^FT-2026-/ }).first()).toBeVisible();
    await expect.poll(() => scroller(page).evaluate((el) => el.scrollLeft)).toBe(150);
    await expectEdges(page, true, true);
  });

  test('motion: the fade uses the feedback tokens, and none under reduced motion', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, FLOORPLAN);
    await waitForRows(page);
    const timing = () =>
      scroller(page).evaluate((el) => {
        const s = getComputedStyle(el.querySelector('[data-rop-overflow-edge="start"]')!);
        const root = getComputedStyle(document.documentElement);
        return { duration: s.transitionDuration, property: s.transitionProperty, token: root.getPropertyValue('--motion-rop-feedback-duration').trim() };
      });
    const normal = await timing();
    expect(normal.property).toBe('opacity, visibility');
    const seconds = (v: string) => (v.endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v));
    // One duration for both properties, the token's.
    for (const d of normal.duration.split(',')) expect(seconds(d.trim())).toBe(seconds(normal.token));
    expect(seconds(normal.token)).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await timing()).duration).toBe('0s');
    await scrollFromStart(page, 'middle');
    // The final state with no transition: visible at the first read.
    expect((await edgeState(page)).startShade).toEqual(SHOWN);
  });

  test('theme: the colour comes from the text token, follows a scoped dark theme; forced colours draw a CanvasText line', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, FLOORPLAN);
    await waitForRows(page);
    const image = () => scroller(page).evaluate((el) => getComputedStyle(el.querySelector('[data-rop-overflow-edge="end"]')!).backgroundImage);
    const light = await image();
    expect(light).toMatch(/gradient/);
    expect(light).not.toMatch(/rgba\(0, 0, 0, 0\), rgba\(0, 0, 0, 0\)/);
    await scroller(page).evaluate((el) => {
      (el.parentElement as HTMLElement).style.setProperty('--color-rop-text', '#f5f6f7');
      (el.parentElement as HTMLElement).style.setProperty('--color-rop-surface', '#1d2d3e');
    });
    const dark = await image();
    expect(dark).not.toBe(light);
    expect(dark).toMatch(/245, 246, 247|0\.96/);

    await page.emulateMedia({ forcedColors: 'active' });
    const forced = await scroller(page).evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'CanvasText';
      document.body.appendChild(probe);
      const canvasText = getComputedStyle(probe).color;
      probe.remove();
      const s = getComputedStyle(el.querySelector('[data-rop-overflow-edge="end"]')!);
      return { width: s.borderInlineEndWidth, color: s.borderInlineEndColor, canvasText, visibility: s.visibility };
    });
    expect(forced).toEqual({ width: '2px', color: forced.canvasText, canvasText: forced.canvasText, visibility: 'visible' });
  });

  test('the play functions pass (Free story, Playground narrowed and restored)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectPlayToPass(page, PLAYGROUND);
    await expectEdges(page, false, false);
    await page.setViewportSize(PHONE);
    await expectPlayToPass(page, FREE_STORY);
  });

  test('the Playground play in rtl', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectPlayToPass(page, PLAYGROUND, 'dir:rtl');
  });
});

test.describe('Virtual List Report: edge shades (Pro, 375x667)', () => {
  test('the play function passes (middle of 10,000 rows, a checkbox under the start shade)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expectPlayToPass(page, PRO_STORY);
  });

  test('100,000 rows: scrolled to the bottom then sideways; a real click under the start shade; "Go to" leaves the sideways state', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoStory(page, PRO_FIXTURE);
    await waitForRows(page);
    await expectEdges(page, false, true);
    await scroller(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(scroller(page).getByText('INV-100000')).toBeVisible();
    await expectEdges(page, false, true);
    const box = page.getByRole('checkbox', { name: 'Select INV-099999' });
    const b0 = (await box.boundingBox())!;
    const s = (await scroller(page).boundingBox())!;
    await scrollFromStart(page, Math.round(b0.x + b0.width / 2 - s.x - 4));
    await expectEdges(page, true, true);
    const b = (await box.boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(box).toBeChecked();
    const left = await scroller(page).evaluate((el) => el.scrollLeft);
    await page.getByRole('button', { name: /^Go to / }).click();
    await page.waitForTimeout(200);
    expect(await scroller(page).evaluate((el) => el.scrollLeft)).toBe(left);
    await expectEdges(page, true, true);
    await scrollFromStart(page, 'end');
    await expectEdges(page, true, false);
  });
});
