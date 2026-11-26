import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
// @ts-expect-error plain .mjs helper shared with the assembler, no type declarations
import { loadArticles, renderArticles, renderArticlesLinks } from '../../scripts/articles.mjs';
// @ts-expect-error plain .mjs helper shared with the assembler and the server, no type declarations
import { SITE_BASE, SITE_ORIGIN } from '../../scripts/site-config.mjs';
import { expectNoA11yViolations } from '../helpers/a11y';

// Pre-deploy smoke of the technical articles section (ticket #698), see playwright.site.config.ts.
// The articles of the fixture folder (e2e/site/fixtures/articles/, never published) are rendered by the real
// generator into a temporary folder that reuses the assembled site's CSS, and served on a throwaway port.
// The story-link check also runs over the articles really published in `site/` (none today: it then checks nothing).

const base = SITE_BASE as string;
const origin = SITE_ORIGIN as string;
const SITE_DIR = fileURLToPath(new URL('../../site/', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/articles/', import.meta.url));
const SITE_ROOT = fileURLToPath(new URL('../../site-root/', import.meta.url));

const SLUGS = ['change-summary-baseline', 'false-dirty-on-hydration']; // newest first
const FIXTURE_TITLE = 'Compare a < b & "quote" in the title';
const WIDTHS = [320, 375, 768, 1280];

let tmp: string;
let server: Server;
let root: string; // http://localhost:<port>/

test.beforeAll(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'articles-spec-'));
  const { published } = loadArticles(FIXTURES);
  const files = renderArticles(published, {
    indexTemplate: readFileSync(`${SITE_ROOT}articles.html`, 'utf8'),
    articleTemplate: readFileSync(`${SITE_ROOT}article.html`, 'utf8'),
    origin,
    siteBase: base,
  }) as Record<string, string>;
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(tmp, file)), { recursive: true });
    writeFileSync(path.join(tmp, file), renderArticlesLinks(content, true));
  }
  for (const asset of ['tokens.css', 'landing.css', 'favicon.svg']) copyFileSync(`${SITE_DIR}${asset}`, path.join(tmp, asset));
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.xml': 'application/atom+xml; charset=utf-8',
  };
  server = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    let file = path.join(tmp, decodeURIComponent(pathname));
    if (!file.startsWith(tmp)) file = '';
    if (file && existsSync(file) && !path.extname(file)) file = path.join(file, 'index.html');
    if (!file || !existsSync(file)) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  root = `http://localhost:${typeof address === 'object' && address ? address.port : 0}/`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmp, { recursive: true, force: true });
});

test.describe('index', () => {
  test('lists the articles newest first, announces the feed and the canonical URL', async ({ page }) => {
    await page.goto(`${root}articles/`);
    await expect(page.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    const titles = await page.locator('.article-item h2 a').allInnerTexts();
    expect(titles).toEqual(['Summaries against the saved baseline', FIXTURE_TITLE]);
    const hrefs = await page.locator('.article-item h2 a').evaluateAll((els) => els.map((a) => a.getAttribute('href')));
    expect(hrefs).toEqual(SLUGS.map((s) => `${s}/`));
    await expect(page.locator('link[rel="alternate"][type="application/atom+xml"]')).toHaveAttribute('href', `${origin}${base}articles/feed.xml`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${base}articles/`);
    // Each item shows its date in a <time datetime>.
    await expect(page.locator('.article-item time').first()).toHaveAttribute('datetime', '2026-03-02');
  });

  test('opening an article from the list shows it', async ({ page }) => {
    await page.goto(`${root}articles/`);
    await page.getByRole('link', { name: 'Summaries against the saved baseline' }).click();
    await page.waitForURL(`${root}articles/change-summary-baseline/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Summaries against the saved baseline');
  });

  test('axe is clean', async ({ page }) => {
    await page.goto(`${root}articles/`);
    await expectNoA11yViolations(page);
  });
});

test.describe('article page', () => {
  test('has canonical, description, Open Graph, a <time datetime>, one h1 and a gap-free heading hierarchy', async ({ page }) => {
    await page.goto(`${root}articles/false-dirty-on-hydration/`);
    const url = `${origin}${base}articles/false-dirty-on-hydration/`;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /^Why a form turns "dirty"/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', FIXTURE_TITLE);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /^Why a form turns/);
    await expect(page.locator('time')).toHaveAttribute('datetime', '2026-01-10');
    await expect(page.locator('time')).toHaveText('10 January 2026');
    await expect(page.locator('main')).toContainText('Test Author');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page).toHaveTitle(`${FIXTURE_TITLE} · Formrail`);
    const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((els) => els.map((e) => Number(e.tagName.slice(1))));
    expect(levels).toEqual([1, 2, 3]);
  });

  test('special characters in the title are shown literally, never as markup', async ({ page }) => {
    await page.goto(`${root}articles/false-dirty-on-hydration/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(FIXTURE_TITLE);
    await expect(page.locator('main code')).toHaveText('<tags>');
    // The same title on the index, and in the document title.
    await page.goto(`${root}articles/`);
    await expect(page.getByRole('link', { name: FIXTURE_TITLE })).toBeVisible();
  });

  test('axe is clean', async ({ page }) => {
    for (const slug of SLUGS) {
      await page.goto(`${root}articles/${slug}/`);
      await expectNoA11yViolations(page);
    }
  });

  test('the navigation and the footer link to the articles', async ({ page }) => {
    await page.goto(`${root}articles/change-summary-baseline/`);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Articles' })).toHaveAttribute('href', '../../articles/');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Articles' })).toHaveAttribute('href', '../../articles/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Articles' }).click();
    await page.waitForURL(`${root}articles/`);
  });

  for (const width of WIDTHS) {
    test(`at ${width}px the page does not scroll sideways; a long code line scrolls inside its own block`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${root}articles/change-summary-baseline/`);
      const m = await page.evaluate(() => {
        const pre = document.querySelector('pre')!;
        const r = pre.getBoundingClientRect();
        return {
          pageScroll: document.documentElement.scrollWidth - innerWidth,
          bodyScroll: document.body.scrollWidth - innerWidth,
          overflowX: getComputedStyle(pre).overflowX,
          preRight: r.right,
          preLeft: r.left,
          viewport: innerWidth,
          preScrolls: pre.scrollWidth > pre.clientWidth,
          focusable: pre.tabIndex,
        };
      });
      expect(m.pageScroll).toBeLessThanOrEqual(0);
      expect(m.bodyScroll).toBeLessThanOrEqual(0);
      expect(m.overflowX).toBe('auto');
      expect(m.preLeft).toBeGreaterThanOrEqual(0);
      expect(m.preRight).toBeLessThanOrEqual(m.viewport);
      expect(m.focusable).toBe(0); // keyboard users can scroll it
      if (width <= 375) expect(m.preScrolls).toBe(true);
      // The block scrolls with the keyboard once focused.
      if (m.preScrolls) {
        await page.locator('pre').focus();
        await page.keyboard.press('End');
        expect(await page.locator('pre').evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
        expect(await page.evaluate(() => document.documentElement.scrollLeft)).toBe(0);
      }
    });
  }
});

test.describe('feed', () => {
  async function readFeed(page: Page) {
    const res = await page.request.get(`${root}articles/feed.xml`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('xml');
    const text = await res.text();
    await page.goto(`${root}articles/`);
    return page.evaluate((xml) => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const ATOM = 'http://www.w3.org/2005/Atom';
      const feed = doc.documentElement;
      const kids = (el: Element, name: string) => [...el.children].filter((c) => c.localName === name && c.namespaceURI === ATOM);
      const text1 = (el: Element, name: string) => kids(el, name)[0]?.textContent ?? null;
      return {
        parseError: doc.getElementsByTagName('parsererror').length > 0,
        root: `${feed.namespaceURI}|${feed.localName}`,
        id: text1(feed, 'id'),
        title: text1(feed, 'title'),
        updated: text1(feed, 'updated'),
        selfHref: kids(feed, 'link').find((l) => l.getAttribute('rel') === 'self')?.getAttribute('href') ?? null,
        entries: kids(feed, 'entry').map((e) => ({
          id: text1(e, 'id'),
          title: text1(e, 'title'),
          updated: text1(e, 'updated'),
          author: kids(e, 'author')[0]?.getElementsByTagNameNS(ATOM, 'name')[0]?.textContent ?? null,
          link: kids(e, 'link').find((l) => (l.getAttribute('rel') ?? 'alternate') === 'alternate')?.getAttribute('href') ?? null,
        })),
      };
    }, text);
  }

  test('is a well-formed Atom feed: id, updated, one entry per article with an absolute link and updated', async ({ page }) => {
    const feed = await readFeed(page);
    expect(feed.parseError).toBe(false);
    expect(feed.root).toBe('http://www.w3.org/2005/Atom|feed');
    expect(feed.id).toBe(`${origin}${base}articles/`);
    expect(feed.selfHref).toBe(`${origin}${base}articles/feed.xml`);
    expect(feed.title).toBeTruthy();
    expect(feed.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(feed.entries).toHaveLength(SLUGS.length);
    for (const [i, entry] of feed.entries.entries()) {
      expect(entry.link).toBe(`${origin}${base}articles/${SLUGS[i]}/`);
      expect(entry.id).toBe(entry.link);
      expect(entry.updated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(entry.author).toBe('Test Author');
    }
    // Special characters come back as the original text after parsing (escaped in the XML).
    expect(feed.entries[1].title).toBe(FIXTURE_TITLE);
    expect(feed.updated).toBe(feed.entries[0].updated);
  });
});

test.describe('network and cookies', () => {
  test('every page requests nothing outside its origin, sets no cookie and runs no script', async ({ page, context }) => {
    const foreign: string[] = [];
    let pageOrigin = '';
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.protocol !== 'data:' && url.protocol !== 'blob:' && url.origin !== pageOrigin) foreign.push(req.url());
    });
    pageOrigin = new URL(root).origin;
    for (const url of ['articles/', ...SLUGS.map((s) => `articles/${s}/`)]) {
      await page.goto(`${root}${url}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('script, iframe, embed, object'), url).toHaveCount(0);
    }
    expect(foreign).toEqual([]);
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe('');
  });
});

/** Story links (`storybook/?path=...`, `pro/?path=...`) of the given HTML, as { dir, id }. */
function storyLinks(html: string): { dir: 'storybook' | 'pro'; id: string; href: string }[] {
  const out: { dir: 'storybook' | 'pro'; id: string; href: string }[] = [];
  for (const m of html.matchAll(/href="([^"]*?(storybook|pro)\/\?path=([^"]*))"/g)) {
    const pathParam = decodeURIComponent(m[3].split('&')[0]);
    out.push({ dir: m[2] as 'storybook' | 'pro', id: pathParam.replace(/^\/(docs|story)\//, ''), href: m[1] });
  }
  return out;
}

function htmlFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? htmlFilesUnder(path.join(dir, e.name)) : e.name.endsWith('.html') ? [path.join(dir, e.name)] : [],
  );
}

test.describe('story links', () => {
  async function missingStories(page: Page, links: ReturnType<typeof storyLinks>) {
    const ids: Record<string, Set<string>> = {};
    for (const dir of ['storybook', 'pro']) {
      const res = await page.request.get(`${dir}/index.json`);
      expect(res.status(), `${dir}/index.json`).toBe(200);
      ids[dir] = new Set(Object.keys((await res.json()).entries));
    }
    return links.filter((l) => !ids[l.dir].has(l.id)).map((l) => l.href);
  }

  test('the story links of the fixture articles point to stories that exist', async ({ page }) => {
    const html = readFileSync(path.join(tmp, 'articles', 'change-summary-baseline', 'index.html'), 'utf8');
    const links = storyLinks(html);
    expect(links.map((l) => l.dir)).toEqual(['storybook', 'pro']);
    expect(await missingStories(page, links)).toEqual([]);
  });

  test('the check does catch a link to a story that does not exist', async ({ page }) => {
    const links = storyLinks('<a href="../../storybook/?path=/docs/no-such-story--docs">x</a><a href="../../pro/?path=/docs/pro-changesummary--docs">y</a>');
    expect(await missingStories(page, links)).toEqual(['../../storybook/?path=/docs/no-such-story--docs']);
  });

  test('the articles published in site/ (if any) link only to stories that exist', async ({ page }) => {
    const links = htmlFilesUnder(`${SITE_DIR}articles`).flatMap((f) => storyLinks(readFileSync(f, 'utf8')));
    expect(await missingStories(page, links)).toEqual([]);
  });
});

test.describe('the assembled site', () => {
  // One contract, two states: the Articles link and the section exist together, or neither does.
  test('the Articles section and its links exist together (none published: no page, no link)', async ({ page, request }) => {
    const published = existsSync(`${SITE_DIR}articles/index.html`);
    for (const url of ['', 'teams/', 'privacy/', ...(published ? ['articles/'] : [])]) {
      await page.goto(url);
      const count = published ? 1 : 0;
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Articles' }), url).toHaveCount(count);
      await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Articles' }), url).toHaveCount(count);
    }
    if (published) {
      const raw = await request.get(`${base}articles`, { maxRedirects: 0 });
      expect(raw.status()).toBe(301);
      expect(raw.headers().location).toBe(`${base}articles/`);
      expect((await request.get('articles/feed.xml')).status()).toBe(200);
    } else {
      expect((await request.get('articles/')).status()).toBe(404);
      expect((await request.get('articles/feed.xml')).status()).toBe(404);
    }
  });
});
