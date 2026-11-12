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
 * from the TSDoc (ticket #402, `.storybook/reference/*.mdx`: text and tables only). Every other check below
 * still applies to them.
 */
const withoutStories = (entry: IndexEntry) =>
  entry.id === 'introduction--docs' || (entry.importPath ?? '').startsWith('./.storybook/reference/');

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
      await expect
        .poll(() => page.evaluate(() => window.scrollY), {
          message: `${entry.id}: the page scrolled on its own (autofocus in a story)`,
          timeout: 4_000,
        })
        .toBeLessThan(200);
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
});
