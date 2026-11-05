import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './helpers/a11y';
import { expectPlayToPass, gotoStory } from './helpers/story';

// @react-object-page/pro VirtualListReport (#231), on Storybook ("Pro/Floorplans/Virtual List Report").
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
  for (const id of ['default', 'scroll-restoration', 'visual-top', 'visual-middle', 'visual-bottom', 'visual-selection']) {
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
    await expect(page.getByText('4991 selected')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select INV-005000' })).toBeFocused();
    // nothing of the page got text-selected by the shift-click
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
    await page.getByRole('button', { name: 'Select all 100,000 results' }).click();
    await expect(page.getByText('100000 selected')).toBeVisible();
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
    await expect(page.getByText('100000 selected')).toBeVisible();
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
