import { expect, test, type Frame, type Page } from '@playwright/test';

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

  // An anchor is a place the reader asked for: a deep link (hash at load) or a `hashchange` while the guard is on
  // takes the page there and keeps it there, even when a script (what an autofocus does) scrolls it away.
  for (const how of ['a hash in the URL at load', 'a hashchange']) {
    test(`${how} takes the Docs page to the anchor and the scroll guard keeps it there`, async ({ page }) => {
      const anchor = 'anchor--primitives-card--playground';
      const frames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const scrollY = () => page.evaluate(() => window.scrollY);
      const anchorTop = () => page.evaluate((id) => Math.round(document.getElementById(id)?.getBoundingClientRect().top ?? NaN), anchor);
      // Every story iframe held (request never answered): the guard waits for them, so it is on throughout.
      await page.route(/iframe\.html\?.*viewMode=story/, () => undefined);
      await page.goto(`/iframe.html?id=primitives-card--docs&viewMode=docs${how === 'a hashchange' ? '' : `#${anchor}`}`);
      await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
      await page.waitForSelector(`#${anchor}`);
      if (how === 'a hashchange') {
        // The guard is on: a scroll from a script goes back to the top.
        await page.evaluate(() => window.scrollTo(0, 800));
        await expect.poll(scrollY, { message: 'the guard is not on: the check below would prove nothing' }).toBe(0);
        await page.evaluate((id) => (window.location.hash = `#${id}`), anchor);
      }
      await expect.poll(anchorTop, { message: 'the page did not go to the anchor' }).toBeLessThanOrEqual(1);
      expect(await anchorTop()).toBeGreaterThanOrEqual(-1);
      expect(await scrollY(), 'the anchor is at the top of the page: the check proves nothing').toBeGreaterThan(200);
      // A scroll from a script (an autofocus elsewhere) is brought back to the anchor, not to the top.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(anchorTop, { message: 'the guard did not keep the anchor' }).toBeLessThanOrEqual(1);
      await frames();
      expect(Math.abs(await anchorTop()), 'the page left the anchor').toBeLessThanOrEqual(1);
    });
  }

  // Through the manager (#663): its preview iframe is never reloaded when the reader picks another entry in the
  // sidebar (Storybook renders it in the same document and only rewrites the URL), and the hash of a deep link
  // is in the manager's URL, not the preview's.
  test.describe('in the manager', () => {
    /** The manager's preview iframe: the same `Frame` for the whole test, since it never reloads. */
    const previewFrame = async (page: Page): Promise<Frame> => {
      const frame = await (await page.waitForSelector('#storybook-preview-iframe')).contentFrame();
      if (!frame) throw new Error('no preview iframe');
      return frame;
    };
    /** A marker on the preview's document: still there after a pick in the sidebar, so the document is the same. */
    const mark = (preview: Frame) => preview.evaluate(() => ((window as unknown as { __rop663?: boolean }).__rop663 = true));
    const marked = (preview: Frame) => preview.evaluate(() => (window as unknown as { __rop663?: boolean }).__rop663 === true);
    const scrollY = (preview: Frame) => preview.evaluate(() => window.scrollY);
    /** Three ticks of the guard's 100 ms check, then two frames: on the preview's clock. */
    const ticks = (preview: Frame) =>
      preview.evaluate(() => new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 300)));
    const pick = async (page: Page, preview: Frame, id: string, viewMode: 'docs' | 'story') => {
      const item = page.locator(`[data-item-id="${id}"]`);
      if (!(await item.isVisible())) await page.locator(`[data-item-id="${id.split('--')[0]}"]`).click();
      await item.click();
      await preview.waitForFunction(
        ([id, viewMode]) => {
          const query = new URLSearchParams(location.search);
          return query.get('id') === id && query.get('viewMode') === viewMode;
        },
        [id, viewMode],
      );
      await preview.waitForSelector(viewMode === 'docs' ? '.sbdocs-content' : '#storybook-root > *');
      expect(await marked(preview), 'the preview reloaded: the check below would prove nothing').toBe(true);
    };

    test('a story picked in the sidebar after a Docs page is not held by the scroll guard', async ({ page }) => {
      await page.goto('/?path=/docs/introduction--docs');
      const preview = await previewFrame(page);
      await preview.waitForSelector('.sbdocs-content', { timeout: 15_000 });
      await mark(preview);
      await pick(page, preview, 'primitives-card--example', 'story');
      // A scroll from a script in the story (a play's `scrollIntoView`, an autofocus below the fold) stays.
      const moved = await preview.evaluate(() => {
        document.body.style.minHeight = '4000px';
        window.scrollTo(0, 800);
        return window.scrollY;
      });
      expect(moved, 'the story cannot scroll: the check below would prove nothing').toBe(800);
      await ticks(preview);
      expect(await scrollY(preview), 'the scroll guard of the Docs page undid a scroll in a story').toBe(800);
    });

    for (const from of ['a story', 'another Docs page'] as const) {
      test(`a Docs page picked in the sidebar after ${from} arms the scroll guard`, async ({ page }) => {
        // Every story iframe of a Docs page held (request never answered): the guard waits for them, so it stays
        // on. The preview itself is not matched: it is loaded once, before the route for a story, in docs mode
        // for a Docs page.
        const holdStoryFrames = () => page.route(/iframe\.html\?.*viewMode=story/, () => undefined);
        let preview: Frame;
        if (from === 'a story') {
          await page.goto('/?path=/story/primitives-card--example');
          preview = await previewFrame(page);
          await preview.waitForSelector('#storybook-root > *', { timeout: 15_000 });
          await holdStoryFrames();
        } else {
          await holdStoryFrames();
          await page.goto('/?path=/docs/overlays-menu--docs');
          preview = await previewFrame(page);
          await preview.waitForSelector('.sbdocs-content', { timeout: 15_000 });
          await preview.evaluate(() => window.scrollTo(0, 800));
          await expect.poll(() => scrollY(preview), { message: 'the guard is not on: the check below would prove nothing' }).toBe(0);
          // A real gesture turns the guard off on this page: a scroll from a script now stays.
          const box = await page.locator('#storybook-preview-iframe').boundingBox();
          if (!box) throw new Error('no box for the preview');
          await page.mouse.move(box.x + box.width / 2, box.y + 40);
          await page.mouse.wheel(0, 400);
          await expect.poll(() => scrollY(preview), { message: 'the wheel did not scroll the page' }).toBeGreaterThan(200);
          await preview.evaluate(() => window.scrollTo(0, 800));
          await ticks(preview);
          expect(await scrollY(preview), 'the gesture did not turn the guard off: the check below would prove nothing').toBe(800);
        }
        await mark(preview);
        await pick(page, preview, 'primitives-card--docs', 'docs');
        // The guard is on for the page just shown: a scroll from a script (what an autofocus does) goes back to the top.
        await preview.evaluate(() => window.scrollTo(0, 800));
        await expect.poll(() => scrollY(preview), { message: 'the Docs page picked in the sidebar has no scroll guard' }).toBe(0);
      });
    }

    // The guard of the preview goes on checking its URL after a stop, and with it the interval that listens in
    // the story iframes of the page just shown: a reader's wheel over one of them must not be undone.
    test('a wheel by the reader over a story iframe of a Docs page picked after another Docs page is not undone', async ({ page }) => {
      const shown = 'primitives-card--example'; // the first story of the page picked, in the viewport
      // The other story iframes are held (request never answered): the guard waits for them, so it stays on.
      await page.route(/iframe\.html\?.*viewMode=story/, (route) => (route.request().url().includes(`id=${shown}`) ? route.continue() : undefined));
      await page.goto('/?path=/docs/overlays-menu--docs');
      const preview = await previewFrame(page);
      await preview.waitForSelector('.sbdocs-content', { timeout: 15_000 });
      await preview.evaluate(() => window.scrollTo(0, 800));
      await expect.poll(() => scrollY(preview), { message: 'the guard is not on: the check below would prove nothing' }).toBe(0);
      // A real gesture turns the guard off on this page.
      const outer = await page.locator('#storybook-preview-iframe').boundingBox();
      if (!outer) throw new Error('no box for the preview');
      await page.mouse.move(outer.x + outer.width / 2, outer.y + 40);
      await page.mouse.wheel(0, 400);
      await expect.poll(() => scrollY(preview), { message: 'the wheel did not scroll the page' }).toBeGreaterThan(200);
      await mark(preview);
      await pick(page, preview, 'primitives-card--docs', 'docs');
      await preview.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => scrollY(preview)).toBe(0);
      const frame = preview.locator(`.sbdocs-content iframe[src*="id=${shown}"]`);
      await preview.frameLocator(`.sbdocs-content iframe[src*="id=${shown}"]`).locator('#storybook-root > *').first().waitFor();
      await ticks(preview); // the guard's check has seen the story and listens in its document
      // The guard is on for the new page: a scroll from a script goes back to the top.
      await preview.evaluate(() => window.scrollTo(0, 800));
      await expect.poll(() => scrollY(preview), { message: 'the guard is not on: the check below would prove nothing' }).toBe(0);
      const box = await frame.boundingBox();
      if (!box) throw new Error('no box for the story iframe');
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 40));
      await page.mouse.wheel(0, 800);
      await expect.poll(() => scrollY(preview), { message: 'the wheel did not scroll the page' }).toBeGreaterThan(400);
      await ticks(preview);
      expect(await scrollY(preview), 'the guard undid the reader\'s scroll').toBeGreaterThan(400);
    });

    // The 60 s ceiling counts from the moment the page is shown, not from the load of the preview.
    test('the scroll guard of a Docs page picked after a minute in the manager still holds the page', async ({ page }) => {
      await page.clock.install();
      await page.goto('/?path=/story/primitives-card--example');
      const preview = await previewFrame(page);
      await preview.waitForSelector('#storybook-root > *', { timeout: 15_000 });
      // The story iframes of the Docs page are held (the preview itself is loaded already): the guard stays on.
      await page.route(/iframe\.html\?.*viewMode=story/, () => undefined);
      await mark(preview);
      await page.clock.fastForward(61_000);
      await pick(page, preview, 'primitives-card--docs', 'docs');
      await preview.evaluate(() => window.scrollTo(0, 800));
      await page.clock.runFor(500);
      expect(await scrollY(preview), 'the ceiling counted from the load: the guard is off').toBe(0);
    });

    test('a hash in the manager URL at load takes the Docs page to the anchor and the scroll guard keeps it there', async ({ page }) => {
      const anchor = 'anchor--primitives-card--playground';
      await page.route(/iframe\.html\?.*viewMode=story/, () => undefined);
      await page.goto(`/?path=/docs/primitives-card--docs#${anchor}`);
      const preview = await previewFrame(page);
      await preview.waitForSelector('.sbdocs-content', { timeout: 15_000 });
      await preview.waitForSelector(`#${anchor}`);
      const hashes = { manager: await page.evaluate(() => location.hash), preview: await preview.evaluate(() => location.hash) };
      expect(hashes, 'the hash is not only in the manager URL: the check below would prove nothing').toEqual({ manager: `#${anchor}`, preview: '' });
      const anchorTop = () => preview.evaluate((id) => Math.round(document.getElementById(id)?.getBoundingClientRect().top ?? NaN), anchor);
      await expect.poll(anchorTop, { message: 'the page did not go to the anchor' }).toBeLessThanOrEqual(1);
      expect(await anchorTop()).toBeGreaterThanOrEqual(-1);
      expect(await scrollY(preview), 'the anchor is at the top of the page: the check proves nothing').toBeGreaterThan(200);
      // A scroll from a script (an autofocus elsewhere) is brought back to the anchor, not to the top.
      await preview.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(anchorTop, { message: 'the guard did not keep the anchor' }).toBeLessThanOrEqual(1);
      await ticks(preview);
      expect(Math.abs(await anchorTop()), 'the page left the anchor').toBeLessThanOrEqual(1);
    });
  });

  // A story iframe that reloads is a new document, with a new window behind the same `contentWindow` (#663): the
  // guard arms again for it, so it must hear the reader's gestures in it too, by wheel or by key.
  for (const gesture of ['a wheel', 'a key'] as const) {
    test(`${gesture} by the reader in a story iframe that reloaded turns the scroll guard off`, async ({ page }) => {
      const scrollY = () => page.evaluate(() => window.scrollY);
      const shown = 'primitives-card--example'; // the first story, in the viewport
      const frame = `.sbdocs-content iframe[src*="id=${shown}"]`;
      // The other story iframes are held (request never answered): the guard waits for them, so it is on.
      await page.route(/iframe\.html\?.*viewMode=story/, (route) => (route.request().url().includes(`id=${shown}`) ? route.continue() : undefined));
      await page.goto('/iframe.html?id=primitives-card--docs&viewMode=docs');
      await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
      await page.frameLocator(frame).locator('#storybook-root > *').first().waitFor();
      await page.evaluate((sel) => {
        const doc = document.querySelector<HTMLIFrameElement>(sel)?.contentDocument as (Document & { __rop663?: boolean }) | null;
        if (!doc) throw new Error('no story document');
        doc.__rop663 = true;
        doc.defaultView?.location.reload();
      }, frame);
      // The new document shows its story, and the guard's 100 ms check has seen it.
      await page.waitForFunction((sel) => {
        const doc = document.querySelector<HTMLIFrameElement>(sel)?.contentDocument as (Document & { __rop663?: boolean }) | null;
        return !!doc && !doc.__rop663 && doc.readyState === 'complete' && !!doc.querySelector('#storybook-root > *');
      }, frame);
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 300)));
      // The guard is on: a scroll from a script (what an autofocus does) goes back to the top.
      await page.evaluate(() => window.scrollTo(0, 800));
      await expect.poll(scrollY, { message: 'the guard is not on: the check below would prove nothing' }).toBe(0);
      if (gesture === 'a wheel') {
        const box = await page.locator(frame).boundingBox();
        if (!box) throw new Error('no box for the story iframe');
        await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 40));
        await page.mouse.wheel(0, 800);
        await expect.poll(scrollY, { message: 'the wheel did not scroll the page' }).toBeGreaterThan(400);
      } else {
        // The key goes to the story iframe (focused from a script, like a click in it would), not to the page.
        const focused = await page.evaluate((sel) => {
          const iframe = document.querySelector<HTMLIFrameElement>(sel);
          iframe?.contentWindow?.focus();
          return document.activeElement === iframe;
        }, frame);
        expect(focused, 'the story iframe has no focus: the key would reach the page').toBe(true);
        await page.keyboard.press('Shift');
        await page.evaluate(() => window.scrollTo(0, 800));
      }
      await page.evaluate(() => new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 300)));
      expect(await scrollY(), 'the guard did not hear the gesture in the reloaded story iframe').toBeGreaterThan(400);
    });
  }
});
