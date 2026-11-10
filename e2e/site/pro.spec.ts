import { expect, test, type Page } from '@playwright/test';
// @ts-expect-error plain .mjs helper shared with the assembler and the server, no type declarations
import { SITE_BASE } from '../../scripts/site-config.mjs';
import { expectNoA11yViolations } from '../helpers/a11y';
import { expectSingleScroller } from '../helpers/geometry';
import { VIEWPORTS } from '../helpers/viewports';

// Pre-deploy smoke of the Pro demo under pro/ (ticket #381), see playwright.site.config.ts.

const base = SITE_BASE as string;
const BANNER_TEXT =
  'Pro preview — the Pro components are under a commercial license that is not available yet. Free to explore here; not for production use. Learn more';

interface IndexEntry {
  id: string;
  title: string;
  type: string;
  tags?: string[];
}

async function readIndex(page: Page, dir: 'pro' | 'storybook'): Promise<IndexEntry[]> {
  const res = await page.request.get(`${dir}/index.json`);
  expect(res.status()).toBe(200);
  return Object.values((await res.json()).entries as Record<string, IndexEntry>);
}

/** Opens `pro/iframe.html` for a story and waits until its play function finished; fails if it threw. */
async function openProStory(page: Page, id: string, { play = false } = {}) {
  if (play) {
    await page.addInitScript(() => {
      const w = window as unknown as {
        __STORYBOOK_ADDONS_CHANNEL__?: { on: (event: string, cb: (payload: unknown) => void) => void };
        __ropPlayErrors?: string[];
      };
      w.__ropPlayErrors = [];
      const timer = setInterval(() => {
        const channel = w.__STORYBOOK_ADDONS_CHANNEL__;
        if (!channel) return;
        clearInterval(timer);
        for (const event of ['playFunctionThrewException', 'storyThrewException', 'storyErrored']) {
          channel.on(event, (payload) => w.__ropPlayErrors?.push(`${event}: ${JSON.stringify(payload)}`));
        }
      }, 1);
    });
  }
  await page.goto(`pro/iframe.html?id=${id}&viewMode=story`);
  await expect(page.locator('body.sb-show-errordisplay')).toHaveCount(0);
  await expect(page.locator('#storybook-root > *').first()).toBeAttached({ timeout: 30_000 });
  if (play) {
    await page.waitForFunction(
      () => {
        const phase = (window as unknown as { __STORYBOOK_PREVIEW__?: { currentRender?: { phase?: string } } })
          .__STORYBOOK_PREVIEW__?.currentRender?.phase;
        return !!phase && ['played', 'completed', 'finished', 'errored', 'aborted'].includes(phase);
      },
      undefined,
      { timeout: 30_000 },
    );
    const errors = await page.evaluate(() => (window as unknown as { __ropPlayErrors?: string[] }).__ropPlayErrors ?? []);
    expect(errors, `play function of ${id}`).toEqual([]);
  }
}

test.describe('Pro demo: manager and index', () => {
  test('pro/ opens the Pro introduction with the banner and a Pro-only sidebar', async ({ page }) => {
    await page.goto('pro/');
    const preview = page.frameLocator('#storybook-preview-iframe');
    await expect(preview.getByRole('heading', { level: 1, name: 'react-object-page Pro (preview)' })).toBeVisible({ timeout: 30_000 });
    await expect(preview.getByRole('note')).toHaveText(BANNER_TEXT);
    await expect(page.getByRole('link', { name: 'react-object-page Pro (preview)' }).first()).toBeVisible();
    const sidebar = page.locator('#storybook-explorer-tree');
    await expect(sidebar.getByText('Pro introduction', { exact: true })).toBeVisible();
    for (const free of ['Forms', 'Overlays', 'Primitives', 'Patterns', 'Introduction']) {
      await expect(sidebar.getByRole('button', { name: free, exact: true })).toHaveCount(0);
    }
  });

  test('index.json: Pro stories and the introduction only, no Free story, no internal fixture needed', async ({ page }) => {
    const entries = await readIndex(page, 'pro');
    expect(entries.length).toBeGreaterThan(0);
    const offenders = entries.filter((e) => e.title !== 'Pro introduction' && !e.title.startsWith('Pro/'));
    expect(offenders.map((e) => e.id)).toEqual([]);
    const titles = new Set(entries.map((e) => e.title));
    expect([...titles].sort()).toEqual([
      'Pro introduction',
      'Pro/ChangeSummary',
      'Pro/Floorplans/Virtual List Report',
      'Pro/Showcase/Invoices with Change Summary',
    ]);
    const ids = entries.map((e) => e.id);
    for (const id of ['pro-introduction--docs', 'pro-changesummary--playground', 'pro-floorplans-virtual-list-report--default', 'pro-showcase-invoices-with-change-summary--review-changes']) {
      expect(ids).toContain(id);
    }
  });

  test('the Free Storybook has no Pro entry and no banner', async ({ page }) => {
    const entries = await readIndex(page, 'storybook');
    expect(entries.filter((e) => e.title.startsWith('Pro')).map((e) => e.id)).toEqual([]);
    await page.goto('storybook/iframe.html?id=showcase-invoices--docs&viewMode=docs');
    await expect(page.locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.rop-pro-banner')).toHaveCount(0);
    await page.goto('storybook/iframe.html?id=showcase-invoices--crud-manual&viewMode=story');
    await expect(page.locator('#storybook-root > *').first()).toBeAttached({ timeout: 30_000 });
    await expect(page.locator('.rop-pro-banner')).toHaveCount(0);
  });
});

test.describe('Pro demo: banner', () => {
  test('on a padded story: role=note, text, link to the Pro section of the landing, in the flow above the story', async ({ page }) => {
    await openProStory(page, 'pro-changesummary--playground');
    const banner = page.getByRole('note');
    await expect(banner).toHaveCount(1);
    await expect(banner).toHaveText(BANNER_TEXT);
    const link = banner.getByRole('link', { name: 'Learn more' });
    await expect(link).toHaveAttribute('href', '/react-object-page/#pro');
    await expect(banner.getByRole('link')).toHaveCount(1);
    await expect(banner.getByRole('button')).toHaveCount(0);
    const geometry = await page.evaluate(() => {
      const b = document.querySelector('.rop-pro-banner')!.getBoundingClientRect();
      const r = document.querySelector('#storybook-root')!.getBoundingClientRect();
      return { position: getComputedStyle(document.querySelector('.rop-pro-banner')!).position, bannerBottom: b.bottom, bannerTop: b.top, bannerWidth: b.width, rootTop: r.top, viewport: innerWidth };
    });
    expect(geometry.position).toBe('static');
    expect(geometry.bannerTop).toBe(0);
    expect(geometry.bannerWidth).toBe(geometry.viewport);
    expect(geometry.rootTop).toBeGreaterThanOrEqual(geometry.bannerBottom);
  });

  test('"Learn more" leaves the Pro demo for the landing', async ({ page }) => {
    await page.goto('pro/');
    const preview = page.frameLocator('#storybook-preview-iframe');
    await preview.getByRole('note').getByRole('link', { name: 'Learn more' }).click();
    await page.waitForURL((url) => url.pathname.startsWith(base) && !url.pathname.startsWith(`${base}pro/`));
    expect(new URL(page.url()).pathname.startsWith(`${base}pro/`)).toBe(false);
  });

  test('a Docs page with several stories shows the banner once', async ({ page }) => {
    await page.goto('pro/iframe.html?id=pro-changesummary--docs&viewMode=docs');
    await expect(page.locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.rop-pro-banner')).toHaveCount(1);
    await expect(page.locator('.sbdocs-content .rop-pro-banner')).toHaveCount(0);
  });

  test('the MDX introduction page shows the banner once', async ({ page }) => {
    await page.goto('pro/iframe.html?id=pro-introduction--docs&viewMode=docs');
    await expect(page.locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.rop-pro-banner')).toHaveCount(1);
  });

  test('the introduction links reach the Pro docs pages', async ({ page }) => {
    await page.goto('pro/?path=/docs/pro-introduction--docs');
    const preview = page.frameLocator('#storybook-preview-iframe');
    for (const [name, id] of [
      ['Change Summary', 'pro-changesummary--docs'],
      ['Invoices with Change Summary', 'pro-showcase-invoices-with-change-summary--docs'],
      ['Virtual List Report', 'pro-floorplans-virtual-list-report--docs'],
    ] as const) {
      await page.goto('pro/?path=/docs/pro-introduction--docs');
      await preview.getByRole('link', { name, exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe(`/docs/${id}`);
      await expect(preview.locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
      await expect(preview.locator('.rop-pro-banner')).toHaveCount(1);
    }
  });

  test('axe: no violations on the banner (contrast, role)', async ({ page }) => {
    await openProStory(page, 'pro-changesummary--playground');
    await expectNoA11yViolations(page, { include: '.rop-pro-banner' });
  });

  test('the play function of Pro/ChangeSummary passes with the banner in the page', async ({ page }) => {
    await openProStory(page, 'pro-changesummary--playground', { play: true });
    await expect(page.locator('.rop-pro-banner')).toHaveCount(1);
  });

  test('the play function of Pro/Floorplans/Virtual List Report passes with the banner in the page', async ({ page }) => {
    await openProStory(page, 'pro-floorplans-virtual-list-report--default', { play: true });
  });
});

test.describe('Pro demo: banner geometry on full-height stories', () => {
  const STORIES = [
    ['Virtual List Report', 'pro-floorplans-virtual-list-report--default'],
    ['Invoices with Change Summary', 'pro-showcase-invoices-with-change-summary--manual'],
  ] as const;

  for (const [name, id] of STORIES) {
    for (const [label, width, height] of VIEWPORTS) {
      test(`${name} at ${label} (${width}px): banner above the story, one vertical scroller, no horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await openProStory(page, id);
        await expect(page.getByRole('table').first()).toBeVisible({ timeout: 30_000 });
        const banner = page.locator('.rop-pro-banner');
        await expect(banner).toBeVisible();
        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          const b = document.querySelector('.rop-pro-banner')!.getBoundingClientRect();
          const root = document.querySelector('#storybook-root')!.getBoundingClientRect();
          return {
            bannerBottom: b.bottom,
            rootTop: root.top,
            rootBottom: root.bottom,
            innerHeight,
            scrollHeight: doc.scrollHeight,
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
            reserved: getComputedStyle(doc).getPropertyValue('--rop-demo-viewport-height'),
          };
        });
        expect(metrics.reserved).toContain('calc(100dvh');
        // The banner does not cover the story, and story + banner fit the viewport: the page itself does not scroll.
        expect(metrics.rootTop).toBeGreaterThanOrEqual(metrics.bannerBottom - 1);
        expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
        expect(metrics.rootBottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
        await expectSingleScroller(page.locator('body'), 'y');
      });
    }
  }
});
