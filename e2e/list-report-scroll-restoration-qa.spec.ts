import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

// QA of useListReportScrollRestoration against the BUILT bundle (packages/core/dist), in a real
// StrictMode app: horizontal scroll, two reports with no URL parameters, gesture during loading, empty data.
const ROOT = resolve(import.meta.dirname, '..');
let html = '';

test.beforeAll(async () => {
  const out = join(ROOT, 'test-results', 'scroll-qa-harness');
  mkdirSync(out, { recursive: true });
  await build({
    entryPoints: [join(ROOT, 'e2e/fixtures-qa/scroll-harness.tsx')],
    bundle: true,
    format: 'iife',
    outfile: join(out, 'app.js'),
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'silent',
    nodePaths: [join(ROOT, 'node_modules')],
  });
  const js = readFileSync(join(out, 'app.js'), 'utf8').replace(/<\/script/g, '<\\/script');
  const css = readFileSync(join(ROOT, 'packages/core/dist/styles.css'), 'utf8');
  html = `<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
});

async function open(page: Page, query: string): Promise<void> {
  await page.route('http://qa.local/**', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(`http://qa.local/list?${query}`);
}
const scrollers = (page: Page): Locator => page.locator('table').locator('..');
const go = (page: Page, p: 'list' | 'other') => page.evaluate((x) => (window as unknown as { __go: (v: string) => void }).__go(x), p);
const pos = (el: Locator) => el.evaluate((e) => [e.scrollTop, e.scrollLeft]);
const set = (el: Locator, top: number, left: number) =>
  el.evaluate(
    (e, [t, l]) => {
      e.scrollTop = t!;
      e.scrollLeft = l!;
    },
    [top, left],
  );

test('StrictMode, scrollLeft and scrollTop restored after unmount/remount with late data', async ({ page }) => {
  await open(page, 'delay=400');
  await expect(page.getByText('Row 0 c1')).toBeVisible();
  await set(scrollers(page), 700, 300);
  await expect.poll(() => pos(scrollers(page))).toEqual([700, 300]);
  await go(page, 'other');
  await go(page, 'list');
  expect(await pos(scrollers(page))).toEqual([0, 0]); // loading: not scrolled
  await expect(page.getByText('Row 0 c1')).toBeAttached();
  await expect.poll(() => pos(scrollers(page))).toEqual([700, 300]);
});

test('two reports with no URL parameters keep their own position (distinct prefixes)', async ({ page }) => {
  await open(page, 'two=1');
  await expect(page.getByText('Row 0 c1').first()).toBeVisible();
  await set(scrollers(page).nth(0), 300, 0);
  await set(scrollers(page).nth(1), 900, 0);
  await page.waitForTimeout(300);
  await go(page, 'other');
  await go(page, 'list');
  await expect(page.getByText('Row 0 c1').first()).toBeAttached();
  await expect
    .poll(async () => [(await pos(scrollers(page).nth(0)))[0], (await pos(scrollers(page).nth(1)))[0]])
    .toEqual([300, 900]);
});

test('empty data: nothing restored and the stored value survives', async ({ page }) => {
  await open(page, 'delay=200');
  await expect(page.getByText('Row 0 c1')).toBeVisible();
  await set(scrollers(page), 600, 0);
  await page.waitForTimeout(300);
  await go(page, 'other');
  const before = await page.evaluate(() => JSON.stringify(sessionStorage));
  await page.evaluate(() => history.replaceState(null, '', location.pathname + '?empty=1&delay=200'));
  await go(page, 'list');
  await expect(page.locator('table').getByText('Empty')).toBeVisible();
  await go(page, 'other');
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).toBe(before);
});
