import { expect, test } from '@playwright/test';

// Every generated Docs page (autodocs + the Introduction MDX) must open and stay usable: stories rendered
// inline in the Docs page share its document, so one that opens a modal at mount, steals the focus or
// pushes history entries would take the whole page over (found in review of #263).

interface IndexEntry {
  id: string;
  type?: string;
  title: string;
  importPath?: string;
}

/**
 * Docs pages with no story, so no "Show code" to offer: the Introduction, and the reference pages generated
 * from the TSDoc (ticket #402, `.storybook/reference/*.mdx` and the fixture `.storybook/fixtures/*.mdx`: text
 * and tables only). Every other check below
 * still applies to them.
 */
const withoutStories = (entry: IndexEntry) =>
  entry.id === 'introduction--docs' || ['./.storybook/reference/', './.storybook/fixtures/'].some((dir) => (entry.importPath ?? '').startsWith(dir));

test.describe('Storybook Docs pages', () => {
  test('every Docs page renders, is not hidden or locked by a story, and offers "Show code"', async ({ page, request }) => {
    test.setTimeout(240_000);
    const res = await request.get('/index.json');
    const index = (await res.json()) as { entries: Record<string, IndexEntry> };
    const docs = Object.values(index.entries).filter((e) => e.type === 'docs');
    expect(docs.length).toBeGreaterThan(20);
    expect(docs[0]?.id).toBe('introduction--docs');

    for (const entry of docs) {
      await page.goto(`/iframe.html?id=${entry.id}&viewMode=docs`);
      await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
      await page.waitForTimeout(500);
      // The story iframes focus their autofocus element a little after the page is up (later on a slow
      // machine); the page's own guard (.storybook/preview-head.html) then scrolls back to the top on the
      // next frame, so the scroll position is polled, not read once. A jump that stays fails.
      // The poll runs in the page, on the page's clock and frames (#663): a heavy Docs page (dozens of stories,
      // tens of thousands of nodes) keeps the main thread busy for seconds while it mounts them, and a poll from
      // here measured that latency, not the scroll (it timed out with `scrollY` at 0 all along). A frame is
      // drawn only after the page's scroll handlers ran, so every reading is the position the guard left.
      // It starts once every story iframe shows its story (an autofocus in it has run by then), or after
      // `windowMs` if one never does: a reading taken before an iframe focused would see the top and pass.
      const scrollY = await page.evaluate(
        ({ limit, windowMs }) =>
          new Promise<number>((resolve) => {
            const start = performance.now();
            const storiesUp = () =>
              [...document.querySelectorAll('iframe')].every((frame) => {
                const doc = frame.contentDocument;
                return !doc || (doc.readyState === 'complete' && !!doc.querySelector('#storybook-root')?.firstElementChild);
              });
            let since = -1;
            let frames = 0;
            const read = () => {
              const now = performance.now();
              if (since < 0 && (storiesUp() || now - start >= windowMs)) since = now;
              if (since >= 0) {
                frames += 1;
                const y = window.scrollY;
                if (frames >= 2 && (y < limit || now - since >= windowMs)) return resolve(y);
              }
              requestAnimationFrame(read);
            };
            read();
          }),
        { limit: 200, windowMs: 4_000 },
      );
      expect(scrollY, `${entry.id}: the page scrolled on its own (autofocus in a story)`).toBeLessThan(200);
      const state = await page.evaluate(() => ({
        hidden: document.querySelector('#storybook-docs')?.getAttribute('aria-hidden') === 'true',
        locked: getComputedStyle(document.body).pointerEvents === 'none',
        showCode: [...document.querySelectorAll('button')].filter((b) => b.textContent?.includes('Show code')).length,
      }));
      expect(state.hidden, `${entry.id}: the Docs page is aria-hidden (a modal opened by a story)`).toBe(false);
      expect(state.locked, `${entry.id}: body has pointer-events none (a modal opened by a story)`).toBe(false);
      if (!withoutStories(entry)) expect(state.showCode, `${entry.id}: no "Show code"`).toBeGreaterThan(0);
    }
  });

  // The scroll guard of .storybook/preview-head.html stays on until the story iframes show their stories (#663),
  // seconds on a page of iframes: the reader's own scroll in that time must never be undone, on the page or with
  // the pointer over a story iframe (whose events never reach the page's window).
  for (const over of ['the page', 'a story iframe'] as const) {
    test(`a wheel scroll by the reader over ${over} is not undone by the scroll guard`, async ({ page }) => {
      const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const scrollY = () => page.evaluate(() => window.scrollY);
      // The other story iframes are held (their request never answered): the guard waits for them, so it is
      // still on when the reader scrolls, however fast the machine. The one under the pointer shows its story.
      const shown = 'primitives-card--example'; // the first story, in the viewport
      await page.route(/iframe\.html\?.*viewMode=story/, (route) => (over === 'a story iframe' && route.request().url().includes(`id=${shown}`) ? route.continue() : undefined));
      await page.goto('/iframe.html?id=primitives-card--docs&viewMode=docs');
      await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
      const frame = `.sbdocs-content iframe[src*="id=${shown}"]`;
      if (over === 'a story iframe') await page.frameLocator(frame).locator('#storybook-root > *').first().waitFor();
      // The guard is on: a scroll from a script (what an autofocus does) goes back to the top.
      await page.evaluate(() => window.scrollTo(0, 800));
      await expect.poll(scrollY, { message: 'the guard is not on: the check below would prove nothing' }).toBe(0);
      const target = over === 'the page' ? page.locator('.sbdocs-content h1').first() : page.locator(frame);
      const box = await target.boundingBox();
      if (!box) throw new Error(`no box for ${over}`);
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 40));
      await page.mouse.wheel(0, 800);
      await expect.poll(scrollY, { message: 'the wheel did not scroll the page' }).toBeGreaterThan(400);
      await frames();
      expect(await scrollY(), 'the guard undid the reader\'s scroll').toBeGreaterThan(400);
    });
  }
});
