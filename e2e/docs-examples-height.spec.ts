import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #502: the List Report examples (Free and Pro) are as tall as the viewport allows (clamp 20rem..40rem, 4rem short
// of it), have a margin in the Docs preview, show whole rows on a phone and never trap a touch scroll.

const EXAMPLES = [
  { name: 'Free', id: 'floorplans-list-report--example', docs: 'floorplans-list-report--docs', minRows: 7, docsMinRows: 7 },
  { name: 'Pro', id: 'pro-floorplans-virtual-list-report--example', docs: 'pro-floorplans-virtual-list-report--docs', minRows: 6, docsMinRows: 5 },
] as const;

// A whole Docs page (all the stories of the file) renders slowly on a loaded machine: the wait is for the page, not the example.
const DOCS_RENDER_MS = 20_000;

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

/** The scroll container of the table, its box and the rows that are whole inside it, below the sticky header. */
async function measure(page: Page) {
  return page.getByRole('table', { name: 'Invoices' }).first().evaluate((table) => {
    let box: HTMLElement | null = table.parentElement;
    while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (!box) throw new Error('no scroll container');
    const boxRect = box.getBoundingClientRect();
    const head = table.querySelector('thead')?.getBoundingClientRect();
    const top = Math.max(boxRect.top, head?.bottom ?? 0);
    const rows = Array.from(table.querySelectorAll('tbody > tr')).filter((tr) => {
      const r = tr.getBoundingClientRect();
      return r.height > 0 && r.top >= top - 0.5 && r.bottom <= boxRect.bottom + 0.5;
    });
    // The example's parent: the nearest ancestor whose inline style sets a height.
    let parent: HTMLElement | null = box;
    while (parent && !parent.style.height) parent = parent.parentElement;
    return {
      wholeRows: rows.length,
      boxHeight: boxRect.height,
      parentHeight: parent ? parent.getBoundingClientRect().height : -1,
      parentStyle: parent ? { height: parent.style.height, maxHeight: parent.style.maxHeight } : null,
      innerHeight: window.innerHeight,
    };
  });
}

for (const example of EXAMPLES) {
  test.describe(`${example.name} List Report example: height`, () => {
    test('390x844: whole rows, a strip of the page outside the example', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoStory(page, example.id);
      await expect(page.getByRole('table', { name: 'Invoices' })).toBeVisible();
      const m = await measure(page);
      expect(m.wholeRows).toBeGreaterThanOrEqual(example.minRows);
      // A strip of the page stays outside the example: a touch that starts there scrolls the page.
      expect(m.parentHeight).toBeLessThanOrEqual(m.innerHeight - 64 + 0.5);
    });

    for (const vp of VIEWPORTS) {
      test(`${vp.name} ${vp.width}x${vp.height}: height within the ceiling and the floor`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await gotoStory(page, example.id);
        await expect(page.getByRole('table', { name: 'Invoices' })).toBeVisible();
        const m = await measure(page);
        expect(m.parentHeight).toBeLessThanOrEqual(640.5);
        const atFloor = Math.abs(m.parentHeight - 320) < 0.5;
        expect(atFloor || m.parentHeight <= m.innerHeight - 64 + 0.5).toBe(true);
        // The strip of the page that stays outside the example (where a touch scrolls the page, not the table).
        expect(m.innerHeight - m.parentHeight >= 64 || atFloor).toBe(true);
      });
    }

    test('declares a vh height with a dvh maxHeight, so a browser without dvh keeps a bounded height', async ({ page }) => {
      await gotoStory(page, example.id);
      await expect(page.getByRole('table', { name: 'Invoices' })).toBeVisible();
      const m = await measure(page);
      expect(m.parentStyle?.height).toContain('100vh');
      expect(m.parentStyle?.maxHeight).toContain('100dvh');
    });

    test('Docs page: margin of 16px or more at 1280, 390 and 320, the example does not overflow horizontally', async ({ page }) => {
      // One load of the Docs page (the dominant cost: it renders every story of the file); the layout needs no reload
      // to follow the width, so the widths are visited with setViewportSize.
      test.setTimeout(DOCS_RENDER_MS + 30_000);
      await page.setViewportSize({ width: 1280, height: 844 });
      await page.goto(`/iframe.html?id=${example.docs}&viewMode=docs`);
      await expect(page.getByRole('table', { name: 'Invoices' }).first()).toBeVisible({ timeout: DOCS_RENDER_MS });
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const edges = await page.getByRole('table', { name: 'Invoices' }).first().evaluate((t) => {
          let box: HTMLElement | null = t.parentElement;
          while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) box = box.parentElement;
          const frame = t.closest('.docs-story');
          if (!box || !frame) throw new Error('no scroll container or docs frame');
          const heading = Array.from(frame.querySelectorAll('h1, h2, h3, [role="heading"]')).find((h) => h.textContent?.trim().startsWith('Invoices'));
          if (!heading) throw new Error('no example title');
          const f = frame.getBoundingClientRect();
          const b = box.getBoundingClientRect();
          return { frameLeft: f.left, frameRight: f.right, boxLeft: b.left, boxRight: b.right, headingLeft: heading.getBoundingClientRect().left };
        });
        expect(edges.boxLeft - edges.frameLeft, `box start at ${width}`).toBeGreaterThanOrEqual(16);
        expect(edges.frameRight - edges.boxRight, `box end at ${width}`).toBeGreaterThanOrEqual(16);
        expect(edges.headingLeft - edges.frameLeft, `title start at ${width}`).toBeGreaterThanOrEqual(16);
        // The example adds no horizontal overflow (other parts of a Docs page, e.g. long code lines, are not in scope).
        expect(edges.frameRight, `preview frame inside the viewport at ${width}`).toBeLessThanOrEqual(width);
      }
    });

    test('Docs page at 390x844: whole rows', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/iframe.html?id=${example.docs}&viewMode=docs`);
      await expect(page.getByRole('table', { name: 'Invoices' }).first()).toBeVisible({ timeout: DOCS_RENDER_MS });
      // Measured: the Docs page narrows the example (page and preview paddings), so the Pro header wraps more and
      // 5 whole rows fit (not the 6 of the canvas); #502 allows no fewer than the 4 of before plus one.
      expect((await measure(page)).wholeRows).toBeGreaterThanOrEqual(example.docsMinRows);
    });
  });
}

// Edge cases of the ticket: the browser's address bar (dvh) and the virtual keyboard shrink the viewport while the
// table is scrolled: the example follows, keeps its scroll position and the focused search stays visible.
for (const example of EXAMPLES) {
  test(`${example.name} example 390x844: address bar / keyboard shrink keeps the scroll and the focused search visible`, async ({ page }) => {
    await page.addInitScript(() => {
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
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoStory(page, example.id);
    const table = page.getByRole('table', { name: 'Invoices' });
    await expect(table).toBeVisible();
    expect((await measure(page)).parentHeight).toBeCloseTo(640, 0);
    const scrollBox = () =>
      table.evaluate((t) => {
        let box: HTMLElement | null = t.parentElement;
        while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) box = box.parentElement;
        return box!.scrollTop;
      });
    await table.evaluate((t) => {
      let box: HTMLElement | null = t.parentElement;
      while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) box = box.parentElement;
      box!.scrollTop = 120;
    });
    await expect.poll(scrollBox).toBeGreaterThan(0);
    const before = await scrollBox();
    const search = page.getByRole('searchbox', { name: 'Search' }).first();
    await search.focus();
    // The address bar / keyboard: the viewport gets shorter (390x500) and the visual viewport loses a keyboard's worth.
    await page.setViewportSize({ width: 390, height: 500 });
    await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(150));
    await expect.poll(async () => (await measure(page)).parentHeight).toBeLessThanOrEqual(436 + 0.5);
    expect((await measure(page)).parentHeight).toBeGreaterThanOrEqual(320 - 0.5);
    expect(await scrollBox()).toBe(before);
    await expect(search).toBeFocused();
    const box = (await search.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(500 - 150);
    // Back to the tall viewport: the height follows again.
    await page.evaluate(() => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(0));
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await measure(page)).parentHeight).toBeCloseTo(640, 0);
  });
}

test('Pro example 390x844: the table box is the same before and after selecting a row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStory(page, 'pro-floorplans-virtual-list-report--example');
  await expect(page.getByRole('table', { name: 'Invoices' })).toBeVisible();
  const before = (await measure(page)).boxHeight;
  const check = page.getByRole('checkbox', { name: 'Select INV-00002' });
  await check.click();
  await expect(page.getByText('1 selected')).toBeVisible();
  const selected = (await measure(page)).boxHeight;
  await check.click();
  await expect(page.getByText('1 selected')).toHaveCount(0);
  const after = (await measure(page)).boxHeight;
  expect([Math.round(selected), Math.round(after)]).toEqual([Math.round(before), Math.round(before)]);
});

test('ListReportTable example keeps at least 5 whole rows at 390x844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const res = await page.request.get('/index.json');
  const index = (await res.json()) as { entries: Record<string, { id: string; type: string }> };
  const entry = Object.values(index.entries).find((e) => e.type === 'story' && /listreporttable--example$/.test(e.id));
  if (!entry) throw new Error('ListReportTable example not found');
  await gotoStory(page, entry.id);
  await expect(page.getByRole('table').first()).toBeVisible();
  const rows = await page.getByRole('table').first().evaluate((table) => {
    let box: HTMLElement | null = table.parentElement;
    while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (!box) throw new Error('no scroll container');
    const b = box.getBoundingClientRect();
    const top = Math.max(b.top, table.querySelector('thead')?.getBoundingClientRect().bottom ?? 0);
    return Array.from(table.querySelectorAll('tbody > tr')).filter((tr) => {
      const r = tr.getBoundingClientRect();
      return r.height > 0 && r.top >= top - 0.5 && r.bottom <= b.bottom + 0.5;
    }).length;
  });
  expect(rows).toBeGreaterThanOrEqual(5);
});
