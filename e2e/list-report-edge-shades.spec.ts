import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPlayToPass, gotoStory } from './helpers/story';

// #501: a shade on each inline edge of the List Report's scroll container that hides columns. Geometry
// in a real browser: which edge, where, above what, below what, and what it never changes.

const FLOORPLAN = 'floorplans-list-report--no-play';
const ROW_ACTIONS = 'floorplans-list-report--row-actions-no-play';
const ROW_ACTIONS_INLINE = 'floorplans-list-report--row-actions-inline-no-play';
const FREE_STORY = 'floorplans-list-report--columns-hidden-sideways';
const DIR_SWITCH_STORY = 'floorplans-list-report--columns-hidden-sideways-direction-switch';
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

/**
 * Where the full colour of a shade is: the computed `background-image` of its `::before` and the inset
 * of that `::before` on the shade's outer side, and the luminance of the first and last pixel column of
 * the shade in a screenshot taken with the table hidden (the shade then lies on the plain page
 * background). `outer` is the column on the scroller's edge, `inner` the one 12px inside.
 */
async function shadeRamp(page: Page, edge: 'start' | 'end') {
  const shade = scroller(page).locator(`[data-rop-overflow-edge="${edge}"]`);
  const style = await page.addStyleTag({ content: '#storybook-root [tabindex="0"] > table { visibility: hidden !important; }' });
  const box = (await shade.boundingBox())!;
  const area = (await scroller(page).boundingBox())!;
  const png = await page.screenshot({ clip: { x: Math.round(box.x), y: Math.round(box.y + box.height / 2), width: Math.round(box.width), height: 1 } });
  await style.evaluate((el) => (el as Element).remove());
  const [left, right] = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const lum = (x: number) => {
      const [r, g, b] = ctx.getImageData(x, 0, 1, 1).data;
      return 0.299 * r! + 0.587 * g! + 0.114 * b!;
    };
    return [lum(0), lum(img.width - 1)];
  }, png.toString('base64'));
  // The shade on the left half of the scroller has its outer side on the left.
  const onLeft = box.x + box.width / 2 < area.x + area.width / 2;
  const before = await shade.evaluate((el) => {
    const b = getComputedStyle(el, '::before');
    return { image: b.backgroundImage, left: b.left, right: b.right, width: b.width };
  });
  return {
    image: before.image,
    width: before.width,
    outerInset: onLeft ? before.left : before.right,
    onLeft,
    outer: onLeft ? left! : right!,
    inner: onLeft ? right! : left!,
  };
}

/**
 * The full colour of the shade is on the scroller's outer edge, the way the CSS puts it there whatever
 * the direction: a symmetric gradient (transparent, full colour, transparent) on a `::before` twice as
 * wide as the shade, half of it past the shade's outer side (the clipped half); and the pixels say so.
 */
function expectFullColourOutside(ramp: Awaited<ReturnType<typeof shadeRamp>>, label: string): void {
  expect(ramp.image, `${label}: symmetric gradient`).toMatch(/^linear-gradient\(to right, rgba\(0, 0, 0, 0\), .+, rgba\(0, 0, 0, 0\)\)$/);
  expect(ramp.width, `${label}: ::before twice as wide as the shade`).toBe('24px');
  expect(ramp.outerInset, `${label}: half of it past the outer side`).toBe('-12px');
  expect(ramp.outer, `${label}: darker on the outer edge`).toBeLessThan(ramp.inner - 20);
}

/**
 * Both shades, the hidden one too: a test style shows them (the attributes, and so what a scroll would
 * measure, are left alone), then each must be on its side with the full colour on the outer edge.
 */
async function expectBothShadesOutside(page: Page, dir: 'ltr' | 'rtl', label: string): Promise<void> {
  const reveal = await page.addStyleTag({
    content: '[data-rop-overflow-edge] { visibility: visible !important; opacity: 1 !important; transition: none !important; }',
  });
  for (const edge of ['start', 'end'] as const) {
    const ramp = await shadeRamp(page, edge);
    // The start shade is on the left in ltr, on the right in rtl; the end one opposite.
    expect(ramp.onLeft, `${label} ${edge}: side`).toBe((edge === 'start') === (dir === 'ltr'));
    expectFullColourOutside(ramp, `${label} ${edge}`);
  }
  await reveal.evaluate((el) => (el as Element).remove());
}

/** What the Controls panel does: new args for the story on screen, re-rendered in place. */
async function updateArgs(page: Page, storyId: string, updatedArgs: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ id, args }) => {
      (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void } }).__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
        storyId: id,
        updatedArgs: args,
      });
    },
    { id: storyId, args: updatedArgs },
  );
}

/** How a test changes the direction: the `dir` control of the story, or a `dir` attribute set or removed. */
type DirectionChange =
  | { how: 'controls'; storyId: string; dir: 'ltr' | 'rtl' }
  | { how: 'attribute'; selector: string; dir: 'ltr' | 'rtl' | null };

interface AfterDirectionChange {
  start: boolean;
  end: boolean;
  scrollLeft: number;
  /** `scroll` events of the scroller stopped by the test (0 when nothing is stopped). */
  stopped: number;
}

/**
 * #562. When the direction changes, every engine moves the scroll back to the inline start of the new
 * direction; Chromium and WebKit fire a `scroll` event for it, Firefox does not. `firefoxLike` stops the
 * scroller's `scroll` events before they reach it (a capturing listener on the window runs first) for
 * the time of the change, so the engine is in Firefox's situation: only the hook's `dir` observer can
 * bring the state up to date. Makes the change, then reads the state on the first animation frame where
 * the scroller's computed direction is `to` (the scroll events of that frame are dispatched before the
 * frame callbacks), with no wait for anything else.
 */
async function changeDirection(page: Page, change: DirectionChange, to: 'ltr' | 'rtl', firefoxLike: boolean): Promise<AfterDirectionChange> {
  return scroller(page).evaluate(
    async (el, { change: c, to: target, stop }) => {
      let stopped = 0;
      const block = (event: Event) => {
        if (event.target !== el) return;
        stopped += 1;
        event.stopImmediatePropagation();
      };
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (stop) window.addEventListener('scroll', block, true);
      try {
        if (c.how === 'controls') {
          (window as unknown as { __STORYBOOK_ADDONS_CHANNEL__: { emit: (e: string, p: unknown) => void } }).__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
            storyId: c.storyId,
            updatedArgs: { dir: c.dir },
          });
        } else {
          const node = document.querySelector(c.selector)!;
          if (c.dir === null) node.removeAttribute('dir');
          else node.setAttribute('dir', c.dir);
        }
        const deadline = performance.now() + 5_000;
        do {
          await frame();
          if (performance.now() > deadline) throw new Error(`the direction is still ${getComputedStyle(el).direction}`);
        } while (getComputedStyle(el).direction !== target);
        const state = { start: el.hasAttribute('data-rop-overflow-start'), end: el.hasAttribute('data-rop-overflow-end'), scrollLeft: el.scrollLeft };
        // Two more frames before the listener goes: a `scroll` event the engine fires late is stopped too.
        await frame();
        await frame();
        return { ...state, stopped };
      } finally {
        if (stop) window.removeEventListener('scroll', block, true);
      }
    },
    { change, to, stop: firefoxLike },
  );
}

/** After a change of direction from a scrolled position: back at the start of the new direction, end shade alone. */
function expectBackAtStart(after: AfterDirectionChange, browserName: string, label: string): void {
  expect({ start: after.start, end: after.end, scrollLeft: after.scrollLeft }, label).toEqual({ start: false, end: true, scrollLeft: 0 });
  // In Chromium the stopped event proves that the test did take the state's other way in (the `scroll`
  // event) away; Firefox fires none, and its events are not stopped.
  if (browserName === 'chromium') expect(after.stopped, `${label}: the scroll event Chromium fires was stopped`).toBeGreaterThan(0);
  if (browserName === 'firefox') expect(after.stopped, label).toBe(0);
}

/** The first button of the first data row (the data has arrived: skeleton rows hold no button). */
const firstRowButton = (page: Page): Locator => scroller(page).locator('tbody tr:not([aria-hidden])').first().getByRole('button').first();

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

  test('a rotated tablet (768x1024 -> 1180x820) and back: the shades follow with no scroll; the end shade follows the width of the actions column in both forms', async ({ page }) => {
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

    await page.setViewportSize({ width: 1180, height: 820 });
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

  test('1024x768 (a classic tablet): the Owner column still overflows, so the end shade shows (not the start one), ends where the actions column starts, and the page does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoStory(page, ROW_ACTIONS_INLINE, 'selectable:!true');
    await waitForRows(page);
    expect((await edgeState(page)).overflow).toBeGreaterThan(1);
    await expectEdges(page, false, true);
    const header = (await scroller(page).locator('thead th').last().boundingBox())!;
    const box = (await scroller(page).boundingBox())!;
    const shade = await shadeBox(page, 'end');
    expect(Math.abs(box.x + shade.right - header.x)).toBeLessThanOrEqual(1);
    const page_ = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(page_.sw).toBeLessThanOrEqual(page_.cw);
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

  for (const dir of ['ltr', 'rtl'] as const) {
    test(`${dir}: the full colour of both shades is on the scroller's outer edge (computed gradient and pixels)`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      // `status: loading` keeps the Playground's play out of the way (it returns at once).
      await gotoStory(page, PLAYGROUND, `containerWidth:360;dir:${dir};status:loading`);
      await scrollFromStart(page, 'middle');
      await expectEdges(page, true, true);
      for (const edge of ['start', 'end'] as const) {
        const ramp = await shadeRamp(page, edge);
        // The start shade is on the left in ltr, on the right in rtl; the end one opposite.
        expect(ramp.onLeft, `${dir} ${edge}: side`).toBe((edge === 'start') === (dir === 'ltr'));
        expectFullColourOutside(ramp, `${dir} ${edge}`);
      }
    });
  }

  // The direction changed after the mount with `scrollLeft` at 0, the start in both directions: no
  // `scroll` event, no resize, nothing for script to measure. The shades follow in CSS alone. The node
  // that scrolls is the same one (a remount would measure again and hide a stale direction).
  const runtime = [
    { from: 'ltr', to: 'rtl', how: 'the dir prop (Controls)' },
    { from: 'rtl', to: 'ltr', how: 'the dir prop (Controls)' },
    { from: 'ltr', to: 'rtl', how: 'the direction property of a stylesheet' },
  ] as const;
  for (const { from, to, how } of runtime) {
    test(`${from} -> ${to} at runtime with scrollLeft 0, by ${how}: each shade on its side, the full colour on the outer edge`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoStory(page, PLAYGROUND, `containerWidth:360;dir:${from};status:loading`);
      await expectEdges(page, false, true);
      await expectBothShadesOutside(page, from, `before (${from})`);
      await scroller(page).evaluate((el) => {
        const w = window as unknown as { __ropScrolls: number };
        w.__ropScrolls = 0;
        el.addEventListener('scroll', () => (w.__ropScrolls += 1));
        (el as HTMLElement & { __ropSameNode?: boolean }).__ropSameNode = true;
      });
      if (how === 'the dir prop (Controls)') await updateArgs(page, PLAYGROUND, { dir: to });
      else await page.addStyleTag({ content: `#storybook-root [tabindex="0"]:has(> table) { direction: ${to} !important; }` });
      await expect.poll(() => scroller(page).evaluate((el) => getComputedStyle(el).direction)).toBe(to);
      const after = await scroller(page).evaluate((el) => ({
        dir: el.getAttribute('dir'),
        sameNode: (el as HTMLElement & { __ropSameNode?: boolean }).__ropSameNode === true,
        scrollLeft: el.scrollLeft,
        scrolls: (window as unknown as { __ropScrolls: number }).__ropScrolls,
      }));
      expect(after).toEqual({ dir: how === 'the dir prop (Controls)' ? to : from, sameNode: true, scrollLeft: 0, scrolls: 0 });
      await expectEdges(page, false, true);
      await expectBothShadesOutside(page, to, `after (${from} -> ${to})`);
      // As shown, with no test style: the end shade alone, on the end side of the new direction.
      const end = await shadeRamp(page, 'end');
      expect(end.onLeft, 'end shade after the change: side').toBe(to === 'rtl');
      expectFullColourOutside(end, 'end shade after the change');
    });
  }

  // #562: the direction changed AFTER a horizontal scroll. The browser moves the scroll back to the
  // start of the new direction; in Firefox with no `scroll` event (simulated elsewhere, see
  // `changeDirection`), and the attributes must follow at once, not at the next scroll.
  for (const [from, to] of [
    ['ltr', 'rtl'],
    ['rtl', 'ltr'],
  ] as const) {
    test(`@engines ${from} -> ${to} after a scroll to the middle, by the dir prop (Controls): the start shade goes at once, with no scroll event`, async ({ page, browserName }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoStory(page, PLAYGROUND, `containerWidth:360;dir:${from};status:loading`);
      await scrollFromStart(page, 'middle');
      await expectEdges(page, true, true);
      const after = await changeDirection(page, { how: 'controls', storyId: PLAYGROUND, dir: to }, to, browserName !== 'firefox');
      expectBackAtStart(after, browserName, `${from} -> ${to}`);
      expect(await scroller(page).getAttribute('dir')).toBe(to);
      await expectEdges(page, false, true);
      // The scroll measures again as before (the test listener is gone).
      await scrollFromStart(page, 'end');
      await expectEdges(page, true, false);
    });
  }

  test('@engines a dir set on the root element after a scroll, then removed: the state follows each time, with no scroll event', async ({ page, browserName }) => {
    await page.setViewportSize(PHONE);
    // The play leaves the table scrolled, a checkbox under the start shade: both shades.
    await expectPlayToPass(page, FREE_STORY);
    await expectEdges(page, true, true);
    try {
      const rtl = await changeDirection(page, { how: 'attribute', selector: 'html', dir: 'rtl' }, 'rtl', browserName !== 'firefox');
      expectBackAtStart(rtl, browserName, 'html dir=rtl');
      await expectEdges(page, false, true);
      await scrollFromStart(page, 'end');
      await expectEdges(page, true, false);
      const removed = await changeDirection(page, { how: 'attribute', selector: 'html', dir: null }, 'ltr', browserName !== 'firefox');
      expectBackAtStart(removed, browserName, 'html dir removed');
      await expectEdges(page, false, true);
    } finally {
      await page.evaluate(() => document.documentElement.removeAttribute('dir'));
    }
  });

  test('@engines the story that switches the direction after a scroll: its play passes', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await expectPlayToPass(page, DIR_SWITCH_STORY);
  });

  test('restored scroll position (useListReportScrollRestoration): the start shade is there with no gesture', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, 'floorplans-list-report--scroll-restoration-no-play', 'loadDelayMs:300');
    await expect(firstRowButton(page)).toBeVisible();
    await scrollFromStart(page, 150);
    await expect.poll(() => scroller(page).evaluate((el) => el.scrollLeft)).toBe(150);
    await page.waitForTimeout(300);
    await page.reload();
    await expect(firstRowButton(page)).toBeVisible();
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

  test('#562 without color-mix() (Safari 16.0/16.1, emulated): the shipped @supports-not fallback draws the same shade; with color-mix nothing of it applies', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, PLAYGROUND, 'containerWidth:360;dir:ltr;status:loading');
    await scrollFromStart(page, 'middle');
    await expectEdges(page, true, true);
    const ramps = async () => Promise.all((['start', 'end'] as const).map((edge) => shadeRamp(page, edge)));
    // Where color-mix() is supported (here) the fallback does not apply: no opacity on the ::before, and
    // the colour is the color-mix one.
    const supported = await scroller(page).evaluate((el) => {
      const layer = el.querySelector('[data-rop-overflow-edges]')!;
      const shade = layer.querySelector('[data-rop-overflow-edge="start"]')!;
      return {
        colour: getComputedStyle(layer).getPropertyValue('--rop-list-report-edge-color').trim(),
        beforeOpacity: getComputedStyle(shade, '::before').opacity,
      };
    });
    expect(supported.colour).toMatch(/^color-mix\(/);
    expect(supported.beforeOpacity).toBe('1');
    const native = await ramps();

    // A browser without color-mix() keeps the custom property (not validated) and the gradient that
    // reads it is invalid: no shade. Emulated by an invalid colour on the layer.
    const broken = await page.addStyleTag({ content: '[data-rop-overflow-edges] { --rop-list-report-edge-color: color-mix(in nowhere, red, blue); }' });
    for (const ramp of await ramps()) expect(Math.abs(ramp.outer - ramp.inner), 'no fallback: no shade at all').toBeLessThanOrEqual(1);

    // The shipped fallback: every rule of the page's CSS under `@supports not (color: color-mix(...))`,
    // re-inserted with no condition (what that browser applies), after the invalid colour.
    const fallbackCss = await page.evaluate(() => {
      const out: string[] = [];
      const walk = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSSupportsRule && /^not\s*\(\s*color\s*:\s*color-mix\(/.test(rule.conditionText)) {
            const inner = Array.from(rule.cssRules).map((r) => r.cssText).join('\n');
            out.push(rule.parentRule instanceof CSSStyleRule ? `${rule.parentRule.selectorText} { ${inner} }` : inner);
          } else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules);
      return out.join('\n');
    });
    expect(fallbackCss).toContain('--rop-list-report-edge-color');
    expect(fallbackCss).toContain('opacity');
    const fallback = await page.addStyleTag({ content: fallbackCss });
    const emulated = await ramps();
    for (const [i, ramp] of emulated.entries()) {
      const label = `fallback ${i === 0 ? 'start' : 'end'}`;
      expectFullColourOutside(ramp, label);
      // The same shade as with color-mix(), within rounding.
      expect(Math.abs(ramp.outer - native[i]!.outer), `${label}: outer edge as with color-mix`).toBeLessThanOrEqual(3);
      expect(Math.abs(ramp.inner - native[i]!.inner), `${label}: inner edge as with color-mix`).toBeLessThanOrEqual(3);
    }
    await fallback.evaluate((el) => (el as Element).remove());
    await broken.evaluate((el) => (el as Element).remove());
  });

  test('theme: the colour comes from the text token, follows a scoped dark theme; forced colours draw a CanvasText line', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await gotoStory(page, FLOORPLAN);
    await waitForRows(page);
    const image = () => scroller(page).evaluate((el) => getComputedStyle(el.querySelector('[data-rop-overflow-edge="end"]')!, '::before').backgroundImage);
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
    // The same play in rtl, then the full colour on the outer edges there too.
    await expectPlayToPass(page, `${FREE_STORY}-rtl`);
    for (const edge of ['start', 'end'] as const) {
      const ramp = await shadeRamp(page, edge);
      expect(ramp.onLeft, `rtl story ${edge}: side`).toBe(edge === 'end');
      expectFullColourOutside(ramp, `rtl story ${edge}`);
    }
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

  test('#562: in the middle of 10,000 rows and scrolled sideways, a dir set on an ancestor then removed: the state follows at once, with no scroll event', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    // The play leaves the table in the middle of the rows, scrolled sideways; then to the middle of the
    // columns: both shades.
    await expectPlayToPass(page, PRO_STORY);
    await scrollFromStart(page, 'middle');
    await expectEdges(page, true, true);
    const rtl = await changeDirection(page, { how: 'attribute', selector: '#storybook-root', dir: 'rtl' }, 'rtl', browserName !== 'firefox');
    expectBackAtStart(rtl, browserName, 'Pro, #storybook-root dir=rtl');
    await expectEdges(page, false, true);
    await scrollFromStart(page, 'middle');
    await expectEdges(page, true, true);
    const removed = await changeDirection(page, { how: 'attribute', selector: '#storybook-root', dir: null }, 'ltr', browserName !== 'firefox');
    expectBackAtStart(removed, browserName, 'Pro, #storybook-root dir removed');
    await expectEdges(page, false, true);
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
