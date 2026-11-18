import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

// @formrail/pro VirtualListReport (#231), on Storybook ("Pro/Floorplans/Virtual List Report").
const BASE = 'pro-floorplans-virtual-list-report';
const DEFAULT = `${BASE}--default-no-play`;
const CEILING = `${BASE}--ceiling-200-k`;
const FREE = `${BASE}--free-reference`;
const RESTORE = `${BASE}--scroll-restoration-no-play`;
const OVERSCAN = 10;

const table = (page: Page): Locator => page.getByRole('table', { name: 'Invoices' });
const scroller = (page: Page): Locator => table(page).locator('..');
const mountedRows = (page: Page): Locator => table(page).locator('tbody > tr[aria-rowindex]');
const rowIndices = (page: Page): Promise<number[]> =>
  mountedRows(page).evaluateAll((rows) => rows.map((r) => Number(r.getAttribute('aria-rowindex'))));

interface Geometry {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  header: number;
  pitch: number;
}

const geometry = (page: Page): Promise<Geometry> =>
  scroller(page).evaluate((el) => {
    const row = el.querySelector('tbody > tr[aria-rowindex], tbody > tr:not([data-rop-spacer]):not([data-rop-filler])');
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      header: el.querySelector('thead')!.getBoundingClientRect().height,
      pitch: row ? row.getBoundingClientRect().height : 0,
    };
  });

/** The bound of the ticket, from the real viewport and pitch: ceil(viewport / pitch) + 2 * overscan + 1. */
async function bound(page: Page): Promise<number> {
  const g = await geometry(page);
  return Math.ceil((g.clientHeight - g.header) / g.pitch) + 2 * OVERSCAN + 1;
}

/** Assigns `scrollTop` and waits two frames (the scroll event and the commit it triggers). */
async function scrollToTop(page: Page, top: number): Promise<void> {
  await scroller(page).evaluate(async (el, t) => {
    el.scrollTop = t;
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, top);
}

/** What is under the centre of the visible body: 'data' (a cell of a mounted row), 'spacer' or something else. */
const centreHit = (page: Page): Promise<string> =>
  scroller(page).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const header = el.querySelector('thead')!.getBoundingClientRect().height;
    const x = box.left + Math.min(box.width, el.clientWidth) / 2;
    const y = box.top + header + (el.clientHeight - header) / 2;
    const hit = document.elementFromPoint(x, y);
    const tr = hit?.closest('tr');
    if (tr?.hasAttribute('data-rop-spacer')) return 'spacer';
    if (tr?.hasAttribute('aria-rowindex') && tr.parentElement?.tagName === 'TBODY') return 'data';
    return `other:${hit?.tagName ?? 'null'}`;
  });

async function openDefault(page: Page, args?: string): Promise<void> {
  await gotoStory(page, DEFAULT, args);
  await expect(table(page)).toHaveAttribute('aria-rowcount', /\d+/);
  await expect(mountedRows(page).first()).toBeVisible();
}

test.describe('Pro/Floorplans/Virtual List Report: stories', () => {
  for (const id of ['default', 'scroll-restoration', 'visual-top', 'visual-middle', 'visual-bottom', 'visual-selection', 'selection', 'visual-selection-without-bulk-actions']) {
    test(`${id}: the play function passes`, async ({ page }) => {
      test.setTimeout(60_000);
      await expectPlayToPass(page, `${BASE}--${id}`);
    });
  }
});

for (const [name, width, height] of [
  ['desktop', 1280, 800],
  ['tablet', 768, 1024],
  ['mobile', 375, 667],
] as const) {
  test.describe(`DOM counts and scrolling, 100,000 rows (${name})`, () => {
    test.use({ viewport: { width, height } });

    test('mounted rows within the bound at every position; scroll height = header + N x pitch; the last row at the bottom', async ({ page }) => {
      await openDefault(page);
      const n = 100_000;
      await expect(table(page)).toHaveAttribute('aria-rowcount', String(n + 1));
      const g = await geometry(page);
      expect(g.pitch).toBeCloseTo(47, 0);
      expect(Math.abs(g.scrollHeight - (g.header + n * g.pitch))).toBeLessThanOrEqual(1);
      const max = await bound(page);
      for (const fraction of [0, 0.1, 0.25, 0.5, 0.77, 1]) {
        await scrollToTop(page, fraction * (g.scrollHeight - g.clientHeight));
        expect(await mountedRows(page).count()).toBeLessThanOrEqual(max);
        expect(await centreHit(page)).toBe('data');
      }
      // bottom: the last row, with aria-rowindex N + 1
      expect((await rowIndices(page)).at(-1)).toBe(n + 1);
      await expect(table(page).getByText('INV-100000', { exact: true })).toBeVisible();
      // middle: the right rows (aria-rowindex and text)
      await scrollToTop(page, 50_000 * g.pitch);
      const indices = await rowIndices(page);
      expect(indices).toContain(50_002);
      expect(indices[0]).toBe(50_002 - OVERSCAN);
      await expect(table(page).getByText('INV-050001', { exact: true })).toBeVisible();
    });

    test('no blank area after each scrollBy of one viewport, nor after wheel scrolling', async ({ page }) => {
      await openDefault(page);
      const g = await geometry(page);
      for (let i = 0; i < 30; i++) {
        await scroller(page).evaluate(async (el, dy) => {
          el.scrollBy(0, dy);
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }, g.clientHeight - g.header);
        expect(await centreHit(page), `after scrollBy #${i + 1}`).toBe('data');
      }
      const box = (await scroller(page).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(0, 400);
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
        expect(await centreHit(page), `after wheel #${i + 1}`).toBe('data');
      }
    });

    test('accessibility at the top, in the middle and at the bottom', async ({ page }) => {
      await openDefault(page);
      await expectNoA11yViolations(page);
      const g = await geometry(page);
      await scrollToTop(page, (g.scrollHeight - g.clientHeight) / 2);
      await expectNoA11yViolations(page);
      await scrollToTop(page, g.scrollHeight);
      await expectNoA11yViolations(page);
    });
  });
}

test.describe('same geometry as the Free table (1,000 rows)', () => {
  async function snapshot(page: Page) {
    return scroller(page).evaluate((el) => {
      const base = el.getBoundingClientRect();
      const rel = (r: DOMRect) => ({ x: Math.round((r.left - base.left) * 10) / 10, y: Math.round((r.top - base.top) * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
      const head = Array.from(el.querySelectorAll('thead th')).map((th) => rel(th.getBoundingClientRect()));
      const rows = Array.from(el.querySelectorAll('tbody > tr'))
        .filter((tr) => !tr.hasAttribute('data-rop-spacer') && !tr.hasAttribute('data-rop-filler'))
        .slice(0, 12)
        .map((tr) => Array.from(tr.children).map((td) => rel(td.getBoundingClientRect())));
      const tableEl = el.querySelector('table')!;
      return {
        head,
        rows,
        table: rel(tableEl.getBoundingClientRect()),
        scrollHeight: el.scrollHeight,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        viewWidthVar: getComputedStyle(el).getPropertyValue('--rop-list-report-view-width'),
      };
    });
  }

  for (const [name, width, height] of [
    ['desktop', 1280, 800],
    ['mobile', 375, 667],
  ] as const) {
    for (const rowHeight of ['default', '3rem'] as const) {
      test(`${name}, row height ${rowHeight}: header, columns, rows, scroll height and horizontal scroll identical`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await gotoStory(page, FREE, `rowHeight:${rowHeight}`);
        await expect(mountedRowsFree(page).first()).toBeVisible();
        const free = await snapshot(page);
        await gotoStory(page, DEFAULT, `rowCount:1000;rowHeight:${rowHeight}`);
        await expect(table(page)).toHaveAttribute('aria-rowcount', '1001');
        const pro = await snapshot(page);
        expect(pro.head).toEqual(free.head);
        expect(pro.rows).toEqual(free.rows);
        expect(pro.table).toEqual(free.table);
        expect(Math.abs(pro.scrollHeight - free.scrollHeight)).toBeLessThanOrEqual(1);
        expect(pro.scrollWidth).toBe(free.scrollWidth);
        expect(pro.clientWidth).toBe(free.clientWidth);
        expect(pro.viewWidthVar).toBe(free.viewWidthVar);
        if (name === 'mobile') expect(pro.scrollWidth).toBeGreaterThan(pro.clientWidth); // scrolls sideways, like the Free one
        // the header sticks while scrolling, as in the Free table
        await scrollToTop(page, 20_000);
        const headTop = await scroller(page).evaluate((el) => el.querySelector('thead th')!.getBoundingClientRect().top - el.getBoundingClientRect().top);
        expect(Math.abs(headTop)).toBeLessThanOrEqual(1);
      });
    }
  }

  test('50 rows (below the threshold): no spacer, every row mounted', async ({ page }) => {
    await gotoStory(page, DEFAULT, 'rowCount:50');
    await expect(table(page)).not.toHaveAttribute('aria-rowcount', /.*/);
    await expect(table(page).locator('tbody > tr')).toHaveCount(50);
    await expect(table(page).locator('[data-rop-spacer]')).toHaveCount(0);
  });
});

const mountedRowsFree = (page: Page): Locator => table(page).locator('tbody > tr');

test.describe('filter, search and threshold crossing', () => {
  test('a pill in the middle of the list: scrollTop kept (or clamped), the range recomputed, no blank', async ({ page }) => {
    await openDefault(page);
    const g = await geometry(page);
    await scrollToTop(page, 30_000 * g.pitch);
    await page.getByRole('radio', { name: 'Rejected' }).click();
    await expect(page.getByRole('radio', { name: 'Rejected' })).toBeChecked();
    const after = await geometry(page);
    const rejected = Number(await table(page).getAttribute('aria-rowcount')) - 1;
    expect(rejected).toBeGreaterThan(5000);
    expect(after.scrollTop).toBe(Math.min(30_000 * g.pitch, after.scrollHeight - after.clientHeight));
    expect(await centreHit(page)).toBe('data');
    expect(await mountedRows(page).count()).toBeLessThanOrEqual(await bound(page));
  });

  test('crossing the threshold both ways keeps scrollTop', async ({ page }) => {
    await openDefault(page, 'rowCount:1000');
    await scrollToTop(page, 300);
    const search = page.getByRole('searchbox', { name: 'Search invoices' });
    await search.fill('INV-0000');
    await search.press('Enter');
    await expect(table(page)).not.toHaveAttribute('aria-rowcount', /.*/); // 99 results: the Free table
    expect((await geometry(page)).scrollTop).toBe(300);
    await search.fill('');
    await search.press('Enter');
    await expect(table(page)).toHaveAttribute('aria-rowcount', '1001');
    expect((await geometry(page)).scrollTop).toBe(300);
    expect(await centreHit(page)).toBe('data');
  });
});

test.describe('focus', () => {
  test('Tab to a row checkbox, wheel for 50 viewports: the focus stays; Tab / Shift+Tab go on from that row', async ({ page }) => {
    await openDefault(page);
    // From the header checkbox, through the header's sort buttons, to the first row's checkbox.
    await page.getByRole('checkbox', { name: 'Select all results' }).focus();
    const first = page.getByRole('checkbox', { name: 'Select INV-000001' });
    for (let i = 0; i < 10 && !(await first.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    const g = await geometry(page);
    const box = (await scroller(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 50; i++) await page.mouse.wheel(0, g.clientHeight - g.header);
    await expect.poll(async () => (await geometry(page)).scrollTop).toBeGreaterThan(40 * (g.clientHeight - g.header));
    await expect(first).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    // the focused row is mounted out of the range (pinned): one extra row at most
    expect(await mountedRows(page).count()).toBeLessThanOrEqual((await bound(page)) + 1);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('checkbox', { name: 'Select INV-000002' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(first).toBeFocused();
    // before the first row: back into the header (its last sort button), as in the Free table
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('thead') !== null)).toBe(true);
  });

  test('a pill that removes the focused row: the focus goes to the container, never the body', async ({ page }) => {
    await openDefault(page);
    // INV-000001 is not rejected: the "Rejected" pill removes it. Keyboard only, so the focus stays on the row.
    const checkbox = page.getByRole('checkbox', { name: 'Select INV-000001' });
    await checkbox.focus();
    const status = await table(page).locator('tbody > tr[aria-rowindex="2"] td').last().textContent();
    expect(status).not.toBe('Rejected');
    // change the pill from code: a programmatic click does not move the focus (a real one would go to the pill)
    await page.getByRole('radio', { name: 'Rejected' }).evaluate((el: HTMLElement) => el.click());
    await expect(page.getByRole('radio', { name: 'Rejected' })).toBeChecked();
    await expect(checkbox).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement?.firstElementChild?.tagName)).toBe('TABLE');
  });
});

test.describe('selection', () => {
  test('shift-click across unmounted rows: INV-000010 ... INV-005000 = 4,991 selected; Select all; Escape', async ({ page }) => {
    await openDefault(page);
    await page.getByRole('checkbox', { name: 'Select INV-000010' }).click();
    // focus off the row (a focused row stays mounted): the anchor really gets unmounted by the scroll
    await scroller(page).focus();
    const g = await geometry(page);
    await scrollToTop(page, 4990 * g.pitch);
    await expect(page.getByRole('checkbox', { name: 'Select INV-000010' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Select INV-005000' }).click({ modifiers: ['Shift'] });
    await expect(page.getByText('4,991 selected')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select INV-005000' })).toBeFocused();
    // nothing of the page got text-selected by the shift-click
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
    await page.getByRole('button', { name: 'Select all 100,000 results' }).click();
    await expect(page.getByText('100,000 selected')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select all results' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByText('No items selected')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select all results' })).toBeFocused();
  });

  test('Shift+Space on a row checkbox selects the range from the anchor', async ({ page }) => {
    await openDefault(page);
    await page.getByRole('checkbox', { name: 'Select INV-000003' }).click();
    await page.getByRole('checkbox', { name: 'Select INV-000008' }).focus();
    await page.keyboard.press('Shift+Space');
    await expect(page.getByText('6 selected')).toBeVisible();
  });
});

test.describe('memoized rows keep their state through the scroll', () => {
  test('a selected row stays checked after its row unmounts and remounts; a row that stays mounted keeps its DOM node', async ({ page }) => {
    await openDefault(page);
    await page.getByRole('checkbox', { name: 'Select INV-000003' }).click();
    await expect(page.getByText('1 selected')).toBeVisible();
    await scroller(page).focus(); // a focused row stays mounted: release the focus
    const g = await geometry(page);
    // A one-row scroll: INV-000008 stays mounted and must keep the same <tr> element.
    const keep = page.getByRole('checkbox', { name: 'Select INV-000008' }).locator('xpath=ancestor::tr');
    await keep.evaluate((tr) => ((window as unknown as { __kept?: Element }).__kept = tr));
    await scrollToTop(page, g.pitch);
    await expect(keep).toHaveAttribute('aria-rowindex', '9');
    expect(await keep.evaluate((tr) => tr === (window as unknown as { __kept?: Element }).__kept)).toBe(true);
    // Away (the row is unmounted) and back.
    await scrollToTop(page, 5000 * g.pitch);
    await expect(page.getByRole('checkbox', { name: 'Select INV-000003' })).toHaveCount(0);
    await scrollToTop(page, 0);
    await expect(page.getByRole('checkbox', { name: 'Select INV-000003' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Select INV-000004' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Select INV-000003' }).locator('xpath=ancestor::tr')).toHaveAttribute('data-selected', '');
  });

  test('toggling a row after scrolling updates the selection with the current state', async ({ page }) => {
    await openDefault(page);
    await page.getByRole('checkbox', { name: 'Select INV-000003' }).click();
    await scroller(page).focus();
    const g = await geometry(page);
    await scrollToTop(page, 3 * g.pitch);
    await page.getByRole('checkbox', { name: 'Select INV-000006' }).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Select INV-000003' }).click();
    await expect(page.getByText('1 selected')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select INV-000003' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Select INV-000006' })).toBeChecked();
  });
});

test.describe('range commit and pitch in a real browser', () => {
  test('a programmatic scroll per frame commits every range inside the scroll event, not in a later task', async ({ page }) => {
    await openDefault(page);
    const { inside, outside } = await scroller(page).evaluate(async (el) => {
      let dispatching = false;
      let inside = 0;
      let outside = 0;
      // The capture listener on `window` runs before the table's own, this bubbling one after it.
      window.addEventListener('scroll', () => { dispatching = true; }, { capture: true, passive: true });
      el.addEventListener('scroll', () => { dispatching = false; }, { passive: true });
      // Runs as a microtask right after the table's listener returns, while `dispatching` still holds.
      new MutationObserver(() => {
        if (dispatching) inside++;
        else outside++;
      }).observe(el.querySelector('tbody')!, { childList: true });
      for (let i = 0; i < 60; i++) {
        el.scrollBy(0, 94);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      return { inside, outside };
    });
    expect(inside).toBeGreaterThan(50);
    expect(outside).toBe(0);
  });

  test('a row height changed after the mount is picked up: pitch, scroll height and range follow it', async ({ page }) => {
    await openDefault(page);
    await scroller(page).evaluate((el) => el.style.setProperty('--rop-list-report-row-height', '4rem'));
    await expect.poll(async () => (await geometry(page)).pitch).toBeCloseTo(67, 0);
    const n = 100_000;
    await expect.poll(async () => {
      const g = await geometry(page);
      return Math.abs(g.scrollHeight - (g.header + n * g.pitch));
    }).toBeLessThanOrEqual(1);
    const g = await geometry(page);
    await scrollToTop(page, 50_000 * g.pitch);
    expect((await rowIndices(page))[0]).toBe(50_002 - OVERSCAN);
    expect(await centreHit(page)).toBe('data');
  });
});

test.describe('scroll restoration (core hook, unchanged)', () => {
  async function scrollThenOpen(page: Page, top: number): Promise<number> {
    await expect(table(page)).toHaveAttribute('aria-rowcount', '100001');
    await scrollToTop(page, top);
    const actual = (await geometry(page)).scrollTop;
    await page.waitForTimeout(300); // the throttled write
    // an invoice link inside the visible body (not under the sticky header)
    const links = page.getByRole('button', { name: /^INV-/ });
    const area = (await scroller(page).boundingBox())!;
    const index = await links.evaluateAll(
      (els, a) => els.findIndex((el) => { const r = el.getBoundingClientRect(); return r.top >= a.y + 60 && r.bottom <= a.y + a.height - 10; }),
      area,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    await links.nth(index).click();
    await expect(page.getByText('Invoice detail')).toBeVisible();
    return actual;
  }

  async function expectRestored(page: Page, saved: number): Promise<void> {
    await expect(table(page)).toHaveAttribute('aria-rowcount', '100001');
    await expect.poll(async () => Math.abs((await geometry(page)).scrollTop - saved)).toBeLessThanOrEqual(1);
    // the rows mounted are those of the position, not those at the top
    const g = await geometry(page);
    const first = Math.floor(saved / g.pitch);
    expect(await rowIndices(page)).toContain(first + 2);
    expect(await centreHit(page)).toBe('data');
  }

  for (const rowHeight of ['default', '3rem'] as const) {
    for (const [label, rows] of [
      ['1,200px', null],
      ['row ~80,000', 80_000],
    ] as const) {
      test(`${label}, row height ${rowHeight}: reload and the real Back both restore it`, async ({ page }) => {
        await gotoStory(page, RESTORE, `rowHeight:${rowHeight};loadDelayMs:500`);
        await expect(mountedRows(page).first()).toBeVisible();
        const pitch = (await geometry(page)).pitch;
        const top = rows === null ? 1200 : rows * pitch;
        const saved = await scrollThenOpen(page, top);
        await page.goBack();
        await expectRestored(page, saved);
        // and a full reload of the list page
        await page.reload();
        await expectRestored(page, saved);
      });
    }
  }
});

test.describe('200,000 rows: the declared ceiling @engines', () => {
  test('scroll height exact, the middle and the last row reachable, no blank at the bottom', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStory(page, CEILING);
    const n = 200_000;
    await expect(table(page)).toHaveAttribute('aria-rowcount', String(n + 1));
    await expect(mountedRows(page).first()).toBeVisible();
    const g = await geometry(page);
    expect(Math.abs(g.scrollHeight - (g.header + n * g.pitch))).toBeLessThanOrEqual(1);
    const max = await bound(page);
    await scrollToTop(page, 100_000 * g.pitch);
    expect(await rowIndices(page)).toContain(100_002);
    await expect(table(page).getByText('INV-100001', { exact: true })).toBeVisible();
    expect(await centreHit(page)).toBe('data');
    await scrollToTop(page, g.scrollHeight);
    expect((await rowIndices(page)).at(-1)).toBe(n + 1);
    await expect(table(page).getByText('INV-200000', { exact: true })).toBeVisible();
    expect(await centreHit(page)).toBe('data');
    expect(await mountedRows(page).count()).toBeLessThanOrEqual(max);
    // the last row is fully visible at the bottom edge of the scroller
    const lastBox = await table(page).getByText('INV-200000', { exact: true }).evaluate((el) => {
      const s = el.closest('table')!.parentElement!.getBoundingClientRect();
      const r = el.closest('tr')!.getBoundingClientRect();
      return { bottom: r.bottom, scrollerBottom: s.bottom };
    });
    expect(lastBox.bottom).toBeLessThanOrEqual(lastBox.scrollerBottom + 1);
  });
});

test.describe('performance (reported, not gating)', () => {
  test('100,000 rows: initial mount, 100 scrollBy, select all', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await openDefault(page);
    const mount = await page.evaluate(() => (window as unknown as { __ropVirtualMountMs?: number }).__ropVirtualMountMs ?? -1);
    const scroll = await scroller(page).evaluate(async (el) => {
      const step = el.clientHeight;
      const t0 = performance.now();
      for (let i = 0; i < 100; i++) {
        el.scrollBy(0, step);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      return performance.now() - t0;
    });
    const selectAll = await page.getByRole('checkbox', { name: 'Select all results' }).evaluate(async (el: HTMLInputElement) => {
      const t0 = performance.now();
      el.click();
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      return { ms: performance.now() - t0, checked: el.checked };
    });
    expect(selectAll.checked).toBe(true);
    await expect(page.getByText('100,000 selected')).toBeVisible();
    const line = `[perf] 100,000 rows (${testInfo.project.name}): mount ${mount.toFixed(1)} ms, 100 scrollBy ${scroll.toFixed(0)} ms (${(scroll / 100).toFixed(1)} ms/frame), select all ${selectAll.ms.toFixed(1)} ms`;
    console.log(line);
    testInfo.annotations.push({ type: 'perf', description: line });
  });

  test('100,000 rows: wheel-like scroll, commit latency and frame interval (P50 / P95)', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await openDefault(page);
    // Main-thread CPU time of the loop (CDP TaskDuration). Not load-independent: under CPU contention the
    // same build more than doubled it, so compare builds only with alternated, repeated runs.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const taskDuration = async (): Promise<number> =>
      ((await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0) * 1000;
    const cpuBefore = await taskDuration();
    const result = await scroller(page).evaluate(async (el) => {
      const tbody = el.querySelector('tbody')!;
      const commit: number[] = [];
      let scrollAt = -1;
      el.addEventListener('scroll', () => { if (scrollAt < 0) scrollAt = performance.now(); }, { capture: true, passive: true });
      // A childList change of the body is the commit of a new range; the observer runs right after it.
      new MutationObserver(() => {
        if (scrollAt >= 0) { commit.push(performance.now() - scrollAt); scrollAt = -1; }
      }).observe(tbody, { childList: true });
      const frames: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 300; i++) {
        el.scrollBy(0, 94); // two rows per frame: the range changes on most frames
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        const now = performance.now();
        frames.push(now - last);
        last = now;
      }
      return { commit, frames };
    });
    const cpuPerFrame = ((await taskDuration()) - cpuBefore) / 300;
    const pct = (values: number[], p: number): number => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? -1;
    const line = `[perf] wheel scroll (${testInfo.project.name}): commit latency P50 ${pct(result.commit, 0.5).toFixed(1)} ms, P95 ${pct(result.commit, 0.95).toFixed(1)} ms (${result.commit.length} commits); frame interval P50 ${pct(result.frames, 0.5).toFixed(1)} ms, P95 ${pct(result.frames, 0.95).toFixed(1)} ms; main-thread CPU ${cpuPerFrame.toFixed(2)} ms/frame`;
    console.log(line);
    testInfo.annotations.push({ type: 'perf', description: line });
  });
});

// #504 (decision 1b): below 640px without the consumer's bulkActions the selection bar is one line (count and
// "Clear selection"), without "Select all N results"; the header checkbox selects every result and is described.
const SELECTION = `${BASE}--selection-no-play`;
const FREE_NO_BULK = 'floorplans-list-report--selection-without-bulk-actions-no-play';
const selBar = (page: Page): Locator => page.getByRole('group', { name: 'Selection Invoices' });
const selCount = (page: Page): Locator => page.locator('[data-rop-selection-count]');
const clearButton = (page: Page): Locator => page.locator('[data-rop-selection-bar] button', { hasText: 'Clear selection' });
const allBox = (page: Page): Locator => page.getByRole('checkbox', { name: 'Select all results' });
/** The action as the accessibility tree sees it (absent when under `display: none`). */
const selectAllByRole = (page: Page): Locator => page.getByRole('button', { name: /^Select all .* results$/ });
/** The action's node, whatever its state. */
const selectAllNode = (page: Page): Locator => page.locator('[data-rop-select-all-results]');
const rowBox = (page: Page, n: number): Locator => page.getByRole('checkbox', { name: `Select INV-${String(n).padStart(6, '0')}` });
const DESCRIPTION_10K = 'All 10,000 results, including those not on screen';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
async function rectOf(l: Locator): Promise<Rect> {
  const b = await l.boundingBox();
  if (!b) throw new Error('no bounding box');
  return b;
}
const centreY = (b: Rect): number => b.y + b.height / 2;
function sameRect(a: Rect, b: Rect, what: string): void {
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(a[k] - b[k]), `${what} ${k}`).toBeLessThanOrEqual(0.5);
}
async function pickRows(page: Page, numbers: number[]): Promise<void> {
  for (const n of numbers) await rowBox(page, n).click();
}
/** What the Controls panel does: new args for the story on screen, re-rendered in place (state and focus kept). */
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
const activeIsBody = (page: Page): Promise<boolean> => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);

for (const vp of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test.describe(`#504 selection bar without consumer bulkActions at ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('one line at mount: count and "Clear selection" on the same row, as tall as the one-line bar of the Free ListReport', async ({ page }) => {
      await gotoStory(page, FREE_NO_BULK);
      const freeHeight = (await rectOf(page.getByRole('group', { name: 'Selection Invoices' }))).height;
      await gotoStory(page, SELECTION);
      await expect(selCount(page)).toHaveText('No items selected');
      await expect(selBar(page)).toHaveAttribute('data-rop-bulk-actions', 'false');
      expect(Math.abs(centreY(await rectOf(selCount(page))) - centreY(await rectOf(clearButton(page))))).toBeLessThanOrEqual(1);
      expect(Math.abs((await rectOf(selBar(page))).height - freeHeight)).toBeLessThanOrEqual(1);
    });

    test('footprint: bar and table container keep their box through 3 selected, all selected from the header checkbox, cleared', async ({ page }) => {
      await gotoStory(page, SELECTION);
      const bar0 = await rectOf(selBar(page));
      const table0 = await rectOf(scroller(page));
      const check = async (what: string): Promise<void> => {
        sameRect(await rectOf(selBar(page)), bar0, `bar ${what}`);
        sameRect(await rectOf(scroller(page)), table0, `table ${what}`);
      };
      await pickRows(page, [2, 3, 4]);
      await expect(selCount(page)).toHaveText('3 selected');
      await expect(clearButton(page)).toBeVisible();
      await check('3 selected');
      await allBox(page).click();
      await expect(selCount(page)).toHaveText('10,000 selected');
      await check('all selected');
      await clearButton(page).click();
      await expect(selCount(page)).toHaveText('No items selected');
      await expect(allBox(page)).toBeFocused();
      await check('cleared');
    });

    test('partial selection: "Select all N results" is not in the layout, the accessibility tree or the tab order', async ({ page }) => {
      await gotoStory(page, SELECTION);
      await pickRows(page, [2, 3, 4]);
      await expect(selCount(page)).toHaveText('3 selected');
      await expect(selectAllByRole(page)).toHaveCount(0);
      // In the DOM, under `display: none` decided by the CSS (its slot), so with no box.
      await expect(selectAllNode(page)).toHaveCount(1);
      expect(await selectAllNode(page).evaluate((el) => getComputedStyle(el.parentElement!).display)).toBe('none');
      expect(await selectAllNode(page).boundingBox()).toBeNull();
      // Tab order: from the search box straight to "Clear selection".
      await page.getByRole('searchbox', { name: 'Search invoices' }).focus();
      await page.keyboard.press('Tab');
      await expect(clearButton(page)).toBeFocused();
    });

    for (const how of ['click', 'Space'] as const) {
      test(`partial selection, the header checkbox (${how}) selects all 10,000 results, the never-mounted last row included`, async ({ page }) => {
        await gotoStory(page, SELECTION);
        await pickRows(page, [2, 3, 4]);
        await expect(allBox(page)).toHaveJSProperty('indeterminate', true);
        if (how === 'click') await allBox(page).click();
        else {
          await allBox(page).focus();
          await page.keyboard.press('Space');
        }
        await expect(selCount(page)).toHaveText('10,000 selected');
        await expect(allBox(page)).toBeChecked();
        await expect(allBox(page)).toBeFocused();
        await expect(rowBox(page, 10_000)).toHaveCount(0);
        await scrollToTop(page, (await geometry(page)).scrollHeight);
        await expect(rowBox(page, 10_000)).toBeChecked();
      });
    }

    test('the header checkbox: its name stays "Select all results", its description says all 10,000 results (at 0, partial, filtered)', async ({ page }) => {
      await gotoStory(page, SELECTION);
      await expect(allBox(page)).toHaveAccessibleDescription(DESCRIPTION_10K);
      await pickRows(page, [2, 3, 4]);
      await expect(allBox(page)).toHaveAccessibleDescription(DESCRIPTION_10K);
      await page.getByRole('radio', { name: 'Pending' }).click();
      // The number follows the current results (resultCount), read from the count of the title: "(n of 10,000)".
      const heading = page.getByRole('heading', { name: /Invoices/ });
      await expect(heading).toContainText(' of 10,000)');
      const results = /\((.+) of 10,000\)/.exec((await heading.textContent()) ?? '')![1];
      await expect(allBox(page)).toHaveAccessibleDescription(`All ${results} results, including those not on screen`);
    });

    test('with consumer bulkActions: two lines, "Select all N results" with its box reserved first in the second line, then the consumer actions and "Clear selection"', async ({ page }) => {
      await gotoStory(page, SELECTION, 'withBulkActions:!true');
      await expect(selBar(page)).toHaveAttribute('data-rop-bulk-actions', 'true');
      const c = await rectOf(selCount(page));
      // Hidden at 0 selected, but with its box, on the second line.
      const reserved = await rectOf(selectAllNode(page));
      expect(reserved.y).toBeGreaterThan(c.y + c.height - 1);
      await pickRows(page, [2]);
      await expect(selectAllByRole(page)).toBeVisible();
      const action = await rectOf(selectAllByRole(page));
      sameRect(action, reserved, 'the action, hidden then shown');
      const approve = await rectOf(page.getByRole('button', { name: 'Approve' }));
      expect(approve.x).toBeGreaterThan(action.x);
      const clear = await rectOf(clearButton(page));
      expect(clear.y).toBeGreaterThan(c.y + c.height - 1);
    });

    test('consumer bulkActions switched on and off after mount (Control): two lines then one, the focus of a removed action goes to the header checkbox', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await gotoStory(page, SELECTION);
      const oneLine = (await rectOf(selBar(page))).height;
      await updateArgs(page, SELECTION, { withBulkActions: true });
      await expect(selBar(page)).toHaveAttribute('data-rop-bulk-actions', 'true');
      expect((await rectOf(selBar(page))).height).toBeGreaterThan(oneLine + 10);
      await pickRows(page, [2]);
      await page.getByRole('button', { name: 'Approve' }).focus();
      await updateArgs(page, SELECTION, { withBulkActions: false });
      await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
      await expect(allBox(page)).toBeFocused();
      expect(Math.abs((await rectOf(selBar(page))).height - oneLine)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });

    test('de-DE: the description is "All 10.000 results…", the bar "10.000 selected"', async ({ page }) => {
      await gotoStory(page, SELECTION, 'locale:de-DE');
      await expect(allBox(page)).toHaveAccessibleDescription('All 10.000 results, including those not on screen');
      await pickRows(page, [2]);
      await allBox(page).click();
      await expect(selCount(page)).toHaveText('10.000 selected');
    });
  });
}

test.describe('#504 selection bar: touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('partial selection, a tap on the header checkbox selects all 10,000 results @touch', async ({ page }) => {
    await gotoStory(page, SELECTION);
    await rowBox(page, 2).tap();
    await rowBox(page, 3).tap();
    await expect(selCount(page)).toHaveText('2 selected');
    await expect(selectAllByRole(page)).toHaveCount(0);
    await allBox(page).tap();
    await expect(selCount(page)).toHaveText('10,000 selected');
    await expect(allBox(page)).toBeChecked();
  });
});

test.describe('#504 selection bar from 640px: unchanged', () => {
  for (const vp of [
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    for (const withBulk of [false, true]) {
      test(`${vp.width}x${vp.height}, consumer bulkActions ${String(withBulk)}: the action only at a partial selection, box reserved, selects all, focus to the header checkbox`, async ({ page }) => {
        await page.setViewportSize(vp);
        await gotoStory(page, SELECTION, `withBulkActions:!${String(withBulk)}`);
        await expect(selectAllByRole(page)).toHaveCount(0);
        const reserved = await rectOf(selectAllNode(page));
        const bar0 = await rectOf(selBar(page));
        await pickRows(page, [2, 3]);
        await expect(selectAllByRole(page)).toBeVisible();
        sameRect(await rectOf(selectAllByRole(page)), reserved, 'the action, hidden then shown');
        sameRect(await rectOf(selBar(page)), bar0, 'the bar');
        await page.getByRole('button', { name: 'Select all 10,000 results' }).click();
        await expect(selCount(page)).toHaveText('10,000 selected');
        await expect(allBox(page)).toBeFocused();
        await expect(selectAllByRole(page)).toHaveCount(0);
      });
    }
  }
});

test.describe('#504 crossing 640px with the focus on the action', () => {
  test('640 to 639: the focus goes to the header checkbox, never the body; back to 640 the action is there again', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 640, height: 800 });
    await gotoStory(page, SELECTION);
    await pickRows(page, [2]);
    await selectAllByRole(page).focus();
    await expect(selectAllByRole(page)).toBeFocused();
    await page.setViewportSize({ width: 639, height: 800 });
    await expect(allBox(page)).toBeFocused();
    expect(await activeIsBody(page)).toBe(false);
    await expect(selectAllByRole(page)).toHaveCount(0);
    await page.setViewportSize({ width: 640, height: 800 });
    await expect(selectAllByRole(page)).toBeVisible();
    await expect(selCount(page)).toHaveText('1 selected');
    expect(errors).toEqual([]);
  });

  test('a tablet rotated: 768x1024 to 667x375 keeps the action and its focus, then to 375x667 the focus goes to the header checkbox', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoStory(page, SELECTION);
    await pickRows(page, [2]);
    await selectAllByRole(page).focus();
    await page.setViewportSize({ width: 667, height: 375 });
    await expect(selectAllByRole(page)).toBeVisible();
    await expect(selectAllByRole(page)).toBeFocused();
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(allBox(page)).toBeFocused();
    expect(await activeIsBody(page)).toBe(false);
  });

  test('with consumer bulkActions the action stays below 640px, and so does its focus', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await gotoStory(page, SELECTION, 'withBulkActions:!true');
    await pickRows(page, [2]);
    await selectAllByRole(page).focus();
    await page.setViewportSize({ width: 639, height: 800 });
    await expect(selectAllByRole(page)).toBeVisible();
    await expect(selectAllByRole(page)).toBeFocused();
  });
});

test.describe('#504 below the virtualization threshold', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('50 rows (not virtualized): the same one-line bar, no action at a partial selection, the header checkbox described', async ({ page }) => {
    await gotoStory(page, DEFAULT, 'rowCount:50;withBulkActions:!false');
    await expect(table(page)).not.toHaveAttribute('aria-rowcount');
    expect(Math.abs(centreY(await rectOf(selCount(page))) - centreY(await rectOf(clearButton(page))))).toBeLessThanOrEqual(1);
    await expect(allBox(page)).toHaveAccessibleDescription('All 50 results, including those not on screen');
    await pickRows(page, [2]);
    await expect(selectAllByRole(page)).toHaveCount(0);
    await allBox(page).click();
    await expect(selCount(page)).toHaveText('50 selected');
  });
});

// #571: the focus rule of the selection bar (now in the Pro, `use-keep-bulk-actions-focus.ts`) also sees a control
// under `visibility: hidden` (no resize, no change of children) and a control nested in a wrapper of the bulk actions.
test.describe('#571 focus of a bulk action hidden without a resize', () => {
  for (const { vp, withBulk } of [
    { vp: { width: 1280, height: 800 }, withBulk: false },
    { vp: { width: 375, height: 667 }, withBulk: true },
  ]) {
    test(`${vp.width}x${vp.height}, consumer bulkActions ${String(withBulk)}: "Select all N results" under visibility: hidden once every result is selected from outside, the focus goes to the header checkbox`, async ({ page }) => {
      await page.setViewportSize(vp);
      await gotoStory(page, SELECTION, `withBulkActions:!${String(withBulk)}`);
      await pickRows(page, [2]);
      await selectAllByRole(page).focus();
      await expect(selectAllByRole(page)).toBeFocused();
      // A change that is not a gesture on the action: a programmatic click on the header checkbox does not move the focus.
      await allBox(page).evaluate((el: HTMLElement) => el.click());
      await expect(selCount(page)).toHaveText('10,000 selected');
      expect(await selectAllNode(page).evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
      await expect(allBox(page)).toBeFocused();
      expect(await activeIsBody(page)).toBe(false);
    });
  }

  /** Appends a wrapper with a "Nested" button to the slot of the bulk actions (the parent of the Pro action), as a consumer's markup. */
  async function nestedControl(page: Page): Promise<{ wrapper: Locator; nested: Locator }> {
    await selectAllNode(page).evaluate((action) => {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-e2e-wrapper', '');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Nested';
      wrapper.append(button);
      action.parentElement!.append(wrapper);
    });
    return { wrapper: page.locator('[data-e2e-wrapper]'), nested: page.getByRole('button', { name: 'Nested' }) };
  }

  test('a control nested in a wrapper of the bulk actions, the wrapper under visibility: hidden: the focus goes to the header checkbox', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, SELECTION, 'withBulkActions:!true');
    await pickRows(page, [2]);
    const { wrapper, nested } = await nestedControl(page);
    await nested.focus();
    await expect(nested).toBeFocused();
    await wrapper.evaluate((el: HTMLElement) => {
      el.style.visibility = 'hidden';
    });
    await expect(allBox(page)).toBeFocused();
    expect(await activeIsBody(page)).toBe(false);
  });

  // Review point 1: the action activated for real (keyboard or mouse) hides itself and focuses the header checkbox in
  // the same click. Nothing of the bar may stay tracked: a click on a blank area (focus on body) then a viewport
  // crossing 640px (the slot under `display: none`, a resize) must leave the focus on body, and the page where it is.
  for (const gesture of ['Enter', 'Space', 'mouse'] as const) {
    test(`"Select all N results" activated with ${gesture}, then a click on a blank area, then 1280 to 639 wide: the focus stays on body, nothing scrolls @engines`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoStory(page, SELECTION, 'withBulkActions:!false');
      await pickRows(page, [2]);
      if (gesture === 'mouse') await selectAllByRole(page).click();
      else {
        await selectAllByRole(page).focus();
        await page.keyboard.press(gesture === 'Space' ? ' ' : gesture);
      }
      await expect(selCount(page)).toHaveText('10,000 selected');
      await expect(allBox(page)).toBeFocused();
      expect(await selectAllNode(page).evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
      // A blank area: the title of the floorplan (not focusable).
      await page.getByRole('heading', { name: /Invoices/ }).click();
      expect(await activeIsBody(page)).toBe(true);
      await scrollToTop(page, 2_000);
      const scrolled = (): Promise<[number, number, number]> =>
        scroller(page).evaluate((el) => [el.scrollTop, window.scrollY, document.scrollingElement!.scrollTop]);
      const before = await scrolled();
      await page.setViewportSize({ width: 639, height: 800 });
      // The resize is observed at the next frames: give them time to (wrongly) move the focus.
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))));
      expect(await activeIsBody(page)).toBe(true);
      await expect(allBox(page)).not.toBeFocused();
      expect(await scrolled()).toEqual(before);
      // And back: the action is there again, still nothing moved.
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      expect(await activeIsBody(page)).toBe(true);
    });
  }

  test('the same wrapper hidden with visibility: visible on the nested control: the control is shown and keeps the focus', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoStory(page, SELECTION, 'withBulkActions:!true');
    await pickRows(page, [2]);
    const { wrapper, nested } = await nestedControl(page);
    await nested.evaluate((el: HTMLElement) => {
      el.style.visibility = 'visible';
    });
    await nested.focus();
    await wrapper.evaluate(async (el: HTMLElement) => {
      el.style.visibility = 'hidden';
      // The observer's callback (a microtask) and a frame for a resize, if any.
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    });
    await expect(nested).toBeVisible();
    await expect(nested).toBeFocused();
  });
});

// #582: follow-ups of the review of #571 (PR #577), in a real browser: a `focusout` that moves nothing (the one a
// `Tooltip` closed by force dispatches on its trigger) keeps the control tracked; `prefers-reduced-motion` does not
// change when the focus is read; `disabled`/`inert` on the focused control are not handled (the browser drops its
// focus to body, where it is left).
test.describe('#582 focus of a bulk action: a focusout that moves nothing, reduced motion, disabled/inert', () => {
  /** A wrapper with a "Nested" button appended to the slot of the bulk actions, as a consumer's markup. */
  async function nestedControl(page: Page): Promise<{ wrapper: Locator; nested: Locator }> {
    await selectAllNode(page).evaluate((action) => {
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-e2e-wrapper', '');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Nested';
      wrapper.append(button);
      action.parentElement!.append(wrapper);
    });
    return { wrapper: page.locator('[data-e2e-wrapper]'), nested: page.getByRole('button', { name: 'Nested' }) };
  }
  const frames = (page: Page): Promise<void> =>
    page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`prefers-reduced-motion ${reducedMotion}: a nested control gets the focusout of a Tooltip closed by force (the focus stays on it), then its wrapper is hidden: the focus goes to the header checkbox`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoStory(page, SELECTION, 'withBulkActions:!true');
      await pickRows(page, [2]);
      const { wrapper, nested } = await nestedControl(page);
      await nested.focus();
      // What `Tooltip` dispatches on its trigger when it closes by force (`TruncatedText` whose text fits again).
      await nested.evaluate((el) => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
      await frames(page);
      await expect(nested).toBeFocused();
      await wrapper.evaluate((el: HTMLElement) => {
        el.style.visibility = 'hidden';
      });
      await expect(allBox(page)).toBeFocused();
      expect(await activeIsBody(page)).toBe(false);
    });

    test(`prefers-reduced-motion ${reducedMotion}: 640 to 639 with the focus on "Select all N results": the focus goes to the header checkbox`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.setViewportSize({ width: 640, height: 800 });
      await gotoStory(page, SELECTION);
      await pickRows(page, [2]);
      await selectAllByRole(page).focus();
      await page.setViewportSize({ width: 639, height: 800 });
      await expect(allBox(page)).toBeFocused();
      expect(await activeIsBody(page)).toBe(false);
    });
  }

  for (const what of ['disabled on the control', 'inert on the control', 'inert on its wrapper', 'inert on the selection bar'] as const) {
    test(`${what}: the browser drops the focus to body, where it is left; hiding the wrapper then moves nothing`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await gotoStory(page, SELECTION, 'withBulkActions:!true');
      await pickRows(page, [2]);
      const { wrapper, nested } = await nestedControl(page);
      await nested.focus();
      await expect(nested).toBeFocused();
      await nested.evaluate((el: HTMLButtonElement, how) => {
        if (how === 'disabled on the control') el.disabled = true;
        else if (how === 'inert on the control') el.inert = true;
        else if (how === 'inert on its wrapper') el.parentElement!.inert = true;
        else (el.closest('[data-rop-selection-bar]') as HTMLElement).inert = true;
      }, what);
      await expect.poll(() => activeIsBody(page)).toBe(true);
      await wrapper.evaluate((el: HTMLElement) => {
        el.style.visibility = 'hidden';
      });
      await frames(page);
      expect(await activeIsBody(page)).toBe(true);
      await expect(allBox(page)).not.toBeFocused();
    });
  }
});
