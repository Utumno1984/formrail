import { expect, test, type Page } from '@playwright/test';
import { gotoStory } from './helpers/story';

// #502: the List Report examples (Free and Pro) are as tall as the viewport allows (clamp 20rem..40rem, 4rem short
// of it), have a margin in the Docs preview, show whole rows on a phone and never trap a touch scroll.

const EXAMPLES = [
  { name: 'Free', id: 'floorplans-list-report--example', minRows: 7 },
  { name: 'Pro', id: 'pro-floorplans-virtual-list-report--example', minRows: 6 },
] as const;

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
    test('390x844: whole rows, and the page scrolls past the example', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoStory(page, example.id);
      await expect(page.getByRole('table', { name: 'Invoices' })).toBeVisible();
      const m = await measure(page);
      expect(m.wholeRows).toBeGreaterThanOrEqual(example.minRows);
      // A strip of the page stays outside the example: a touch that starts there scrolls the page.
      expect(m.parentHeight).toBeLessThanOrEqual(m.innerHeight - 64 + 0.5);
      expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
    });

    for (const vp of VIEWPORTS) {
      test(`${vp.name} ${vp.width}x${vp.height}: height within the ceiling and the floor, page scrolls`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await gotoStory(page, example.id);
        await expect(page.getByRole('table', { name: 'Invoices' })).toBeVisible();
        const m = await measure(page);
        expect(m.parentHeight).toBeLessThanOrEqual(640.5);
        const atFloor = Math.abs(m.parentHeight - 320) < 0.5;
        expect(atFloor || m.parentHeight <= m.innerHeight - 64 + 0.5).toBe(true);
        // The page is taller than the viewport and scrolls with a wheel that starts outside the example.
        await page.mouse.move(2, 2);
        await page.mouse.wheel(0, 200);
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      });
    }

    test('declares a vh height with a dvh maxHeight, so a browser without dvh keeps a bounded height', async ({ page }) => {
      await gotoStory(page, example.id);
      await expect(page.getByRole('table', { name: 'Invoices' })).toBeVisible();
      const m = await measure(page);
      expect(m.parentStyle?.height).toContain('100vh');
      expect(m.parentStyle?.maxHeight).toContain('100dvh');
    });

    test('Docs page: margin of 16px or more at 1280, 390 and 320, no horizontal overflow', async ({ page }) => {
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(`/iframe.html?id=${example.id}&viewMode=docs`);
        await expect(page.getByRole('table', { name: 'Invoices' }).first()).toBeVisible();
        const edges = await page.getByRole('table', { name: 'Invoices' }).first().evaluate((t) => {
          let box: HTMLElement | null = t.parentElement;
          while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowY)) box = box.parentElement;
          const frame = t.closest('.docs-story');
          if (!box || !frame) throw new Error('no scroll container or docs frame');
          const heading = Array.from(box.parentElement?.querySelectorAll('h1, h2, h3') ?? []).find((h) => h.textContent?.trim() === 'Invoices');
          if (!heading) throw new Error('no example title');
          const f = frame.getBoundingClientRect();
          const b = box.getBoundingClientRect();
          return { frameLeft: f.left, frameRight: f.right, boxLeft: b.left, boxRight: b.right, headingLeft: heading.getBoundingClientRect().left };
        });
        expect(edges.boxLeft - edges.frameLeft, `box start at ${width}`).toBeGreaterThanOrEqual(16);
        expect(edges.frameRight - edges.boxRight, `box end at ${width}`).toBeGreaterThanOrEqual(16);
        expect(edges.headingLeft - edges.frameLeft, `title start at ${width}`).toBeGreaterThanOrEqual(16);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      }
    });

    test('Docs page at 390x844: whole rows', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/iframe.html?id=${example.id}&viewMode=docs`);
      await expect(page.getByRole('table', { name: 'Invoices' }).first()).toBeVisible();
      expect((await measure(page)).wholeRows).toBeGreaterThanOrEqual(example.minRows);
    });
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
  const entry = Object.values(index.entries).find((e) => e.type === 'story' && /list-report-table--example$/.test(e.id));
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
