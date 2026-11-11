import { expect, test } from '@playwright/test';
// @ts-expect-error plain .mjs helper shared with the assembler and the server, no type declarations
import { SITE_BASE } from '../../scripts/site-config.mjs';
import { gotoAndStay } from '../helpers/no-redirect';

// Pre-deploy smoke of the assembled Pages site (ticket #380), see playwright.site.config.ts.
// The URLs below are the ones already distributed (README on npm, links sent around): they must
// keep reaching the same page after the Storybook moved to storybook/.

const base = SITE_BASE as string;
const DOCS = 'showcase-invoices--docs';
const DOCS_PATH = `/docs/${DOCS}`;

/** The manager (sidebar + preview frame) shows the docs page of `id`. */
async function expectDocsRendered(page: import('@playwright/test').Page, id: string) {
  // The manager points its preview frame at that very story, under storybook/.
  await expect(page.locator('#storybook-preview-iframe')).toHaveAttribute('src', new RegExp(`${base}storybook/iframe\\.html\\?id=${id}&viewMode=docs`), { timeout: 30_000 });
  const preview = page.frameLocator('#storybook-preview-iframe');
  await expect(preview.locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
  return preview;
}

test.describe('old deep links reach the same page under storybook/', () => {
  test('?path= to a docs page: redirected, story rendered, the manager shows the same story', async ({ page }) => {
    await page.goto(`?path=${DOCS_PATH}`);
    await page.waitForURL(`**${base}storybook/?path=${DOCS_PATH}`);
    expect(new URL(page.url()).pathname).toBe(`${base}storybook/`);
    expect(new URL(page.url()).searchParams.get('path')).toBe(DOCS_PATH);
    const preview = await expectDocsRendered(page, DOCS);
    await expect(preview.getByRole('heading', { level: 1 }).first()).toBeVisible();
    // The manager stays on the requested page: no fallback to the default story.
    expect(new URL(page.url()).searchParams.get('path')).toBe(DOCS_PATH);
  });

  test('path + globals + hash are all kept', async ({ page }) => {
    await page.goto(`?path=${DOCS_PATH}&globals=theme:dark#some-anchor`);
    await page.waitForURL(`**${base}storybook/**`);
    const url = new URL(page.url());
    expect(url.pathname).toBe(`${base}storybook/`);
    expect(url.searchParams.get('path')).toBe(DOCS_PATH);
    expect(url.searchParams.get('globals')).toBe('theme:dark');
    expect(url.hash).toBe('#some-anchor');
  });

  test('iframe.html?id=…&viewMode=story: redirected, the story renders', async ({ page }) => {
    await page.goto('iframe.html?id=showcase-invoices--crud-manual&viewMode=story');
    await page.waitForURL(`**${base}storybook/iframe.html?id=showcase-invoices--crud-manual&viewMode=story`);
    await expect(page.locator('#storybook-root > *').first()).toBeAttached({ timeout: 30_000 });
    await expect(page.locator('body.sb-show-errordisplay')).toHaveCount(0);
  });

  test('iframe.html docs link renders the docs page', async ({ page }) => {
    await page.goto(`iframe.html?id=${DOCS}&viewMode=docs`);
    await page.waitForURL(`**${base}storybook/iframe.html?**`);
    await expect(page.locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
  });

  test('a URL already under storybook/ is not redirected again (no double prefix)', async ({ page }) => {
    await page.goto(`storybook/?path=${DOCS_PATH}`);
    await expect(page.frameLocator('#storybook-preview-iframe').locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(`${base}storybook/`);
  });
});

// Ticket #382: the bare root is the landing page now (details in landing.spec.ts); it no longer
// redirects, so the former "bare root reaches the Storybook" cases are replaced by these.
test.describe('bare root', () => {
  test('stays on the landing: no Storybook manager', async ({ page }) => {
    await gotoAndStay(page, '');
    expect(new URL(page.url()).pathname).toBe(base);
    await expect(page.locator('#storybook-preview-iframe')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('a Storybook parameter next to a foreign one is still forwarded, both kept', async ({ page }) => {
    await page.goto(`?utm_source=newsletter&path=${DOCS_PATH}`);
    await page.waitForURL(`**${base}storybook/**`);
    expect(new URL(page.url()).searchParams.get('path')).toBe(DOCS_PATH);
    await expect(page.locator('#storybook-preview-iframe')).toBeAttached();
  });
});

test.describe('history', () => {
  for (const [name, link] of [
    ['deep link', `?path=${DOCS_PATH}`],
    ['iframe.html link', `iframe.html?id=${DOCS}&viewMode=docs`],
  ] as const) {
    test(`Back from the redirected ${name} returns to the page it came from, not to the redirector`, async ({ page }) => {
      // A real same-origin page of the site as the origin of the navigation.
      await page.goto('definitely-not-a-page');
      const origin = page.url();
      await page.goto(link);
      await page.waitForURL(`**${base}storybook/**`);
      await page.waitForLoadState('load');
      await page.goBack();
      await expect(page).toHaveURL(origin);
      // …and it stays there: the redirector is not in the history in front of it either.
      await page.waitForTimeout(500);
      expect(page.url()).toBe(origin);
    });
  }
});

test.describe('links inside the Storybook work under storybook/', () => {
  test('an Introduction link (?path=…) navigates within storybook/', async ({ page }) => {
    await page.goto(`storybook/?path=/docs/introduction--docs`);
    const preview = page.frameLocator('#storybook-preview-iframe');
    await expect(preview.locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
    await preview.getByRole('link', { name: 'Showcase: Invoices', exact: true }).first().click();
    await expect.poll(() => new URL(page.url()).searchParams.get('path')).toBe('/docs/showcase-invoices--docs');
    expect(new URL(page.url()).pathname).toBe(`${base}storybook/`);
    await expect(preview.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('the Storybook assets and index.json are served from storybook/', async ({ request }) => {
    const index = await request.get('storybook/index.json');
    expect(index.status()).toBe(200);
    expect(Object.keys((await index.json()).entries)).toContain('introduction--docs');
  });
});

test.describe('404 and static files', () => {
  for (const missing of ['nope', 'nope/deeper/still', 'storybook/nope.html']) {
    test(`unknown URL "${missing}": 404 page, no redirect, no loop`, async ({ page }) => {
      const response = await page.goto(missing);
      expect(response?.status()).toBe(404);
      const url = page.url();
      await page.waitForTimeout(500);
      expect(page.url()).toBe(url);
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Storybook/ })).toHaveAttribute('href', `${base}storybook/`);
    });
  }

  // Pages answers a directory URL without the trailing slash with a 301 to the slashed one.
  test('storybook (no trailing slash) redirects to storybook/ and keeps the query', async ({ page, request }) => {
    const raw = await request.get(`${base}storybook?path=${DOCS_PATH}`, { maxRedirects: 0 });
    expect(raw.status()).toBe(301);
    expect(raw.headers()['location']).toBe(`${base}storybook/?path=${DOCS_PATH}`);
    await page.goto(`${base}storybook?path=${DOCS_PATH}`);
    expect(new URL(page.url()).pathname).toBe(`${base}storybook/`);
    await expect(page.frameLocator('#storybook-preview-iframe').locator('.sbdocs-content')).toBeVisible({ timeout: 30_000 });
  });

  test('a malformed percent-encoding is a 404 and does not stop the server', async ({ request }) => {
    expect((await request.get(`${base}%E0%A4%A`)).status()).toBe(404);
    expect((await request.get(base)).status()).toBe(200);
  });

  test('.nojekyll is published', async ({ request }) => {
    expect((await request.get('.nojekyll')).status()).toBe(200);
  });
});

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  // index.html is the landing now: it needs no redirect and works without JavaScript (landing.spec.ts).
  for (const [name, link, target] of [['iframe.html', 'iframe.html', 'storybook/iframe.html']] as const) {
    test(`${name} stays put and offers a manual link to ${target}`, async ({ page }) => {
      await page.goto(link);
      const url = page.url();
      const anchor = page.getByRole('link');
      await expect(anchor).toHaveAttribute('href', target);
      await anchor.click();
      await page.waitForURL(`**${base}${target}`);
      expect(page.url()).not.toBe(url);
    });
  }
});
