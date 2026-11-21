import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { USE_CASES_INTRO, USE_CASE_TAG, VERTICAL_TAG_PREFIX, isProTitle } from '../packages/core/src/internal/story-example';
import { auditProRatchet, auditUseCaseStructure, type IndexedStory } from '../packages/core/src/internal/use-case-guard';

// Ticket #624: the Docs pages show the neutral component first and the domain examples (`use-case` stories)
// last, in their own section ("Examples" on a Free page, "Use cases" on a Pro one); and a guard on the index of
// the build keeps every page in that shape. The rules themselves have negative unit tests
// (packages/core/src/internal/use-case-guard.test.ts); here they run on the real stories.

interface IndexEntry {
  id: string;
  type?: string;
  title: string;
  name: string;
  tags?: string[];
}

async function storyEntries(request: APIRequestContext): Promise<IndexedStory[]> {
  const res = await request.get('/index.json');
  const index = (await res.json()) as { entries: Record<string, IndexEntry> };
  return Object.values(index.entries)
    .filter((entry) => entry.type === 'story')
    .map(({ id, title, name, tags }) => ({ id, title, name, tags }));
}

/** The story's `id` anchors of the Docs page, in document order, plus the section (if any). */
async function readPage(page: Page, docsId: string) {
  await page.goto(`/iframe.html?id=${docsId}&viewMode=docs`);
  await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
  return page.evaluate(() => {
    const anchors = [...document.querySelectorAll<HTMLElement>('.sbdocs-content [id^="anchor--"]')];
    const section = document.querySelector<HTMLElement>('[data-use-cases]');
    return {
      anchors: anchors.map((a) => ({ id: a.id.replace(/^anchor--(primary--)?/, ''), inSection: !!section?.contains(a), text: a.textContent ?? '' })),
      heading: section?.querySelector('h3, h2')?.textContent?.trim() ?? null,
      intro: section?.querySelector('[data-use-cases-intro]')?.textContent ?? null,
      sectionText: section?.textContent ?? '',
    };
  });
}

test.describe('Docs page: neutral first, then Examples / Use cases', () => {
  test('Free page with a copy-paste example: example, Playground and states, then "Examples" with the two use cases, each with its description', async ({ page }) => {
    const docs = await readPage(page, 'internal-docsusecases--docs');
    const ids = docs.anchors.map((a) => a.id);
    expect(ids).toEqual([
      'internal-docsusecases--example',
      'internal-docsusecases--playground',
      'internal-docsusecases--disabled',
      'internal-docsusecases--use-case-erp-purchase-order',
      'internal-docsusecases--use-case-ecommerce-cart',
    ]);
    // Only the use cases are in the section, and they are the last ones of the page.
    expect(docs.anchors.map((a) => a.inSection)).toEqual([false, false, false, true, true]);
    expect(docs.heading).toBe('Examples');
    expect(docs.intro).toBe(USE_CASES_INTRO);
    expect(docs.sectionText).toContain('A buyer approves an order before it is sent to the supplier.');
    expect(docs.sectionText).toContain('A shopper keeps a product for later.');
    // The "Stories" heading is above the neutral story, the section heading under every neutral story.
    const order = await page.evaluate(() => {
      const headings = [...document.querySelectorAll('.sbdocs-content h2, .sbdocs-content h3')].map((h) => h.textContent?.trim());
      return headings;
    });
    expect(order).toContain('Stories');
    expect(order.indexOf('Stories')).toBeLessThan(order.indexOf('Examples'));
  });

  test('Pro page without a copy-paste example: the section appears all the same, last, titled "Use cases", with Problem and Configuration per case', async ({ page }) => {
    const docs = await readPage(page, 'pro-internal-docsusecases--docs');
    expect(docs.anchors.map((a) => a.id)).toEqual([
      'pro-internal-docsusecases--playground',
      'pro-internal-docsusecases--use-case-erp-purchase-order',
      'pro-internal-docsusecases--use-case-b-2-b-price-list',
      'pro-internal-docsusecases--use-case-elearning-course',
    ]);
    expect(docs.anchors.map((a) => a.inSection)).toEqual([false, true, true, true]);
    expect(docs.heading).toBe('Use cases');
    expect(docs.intro).toBe(USE_CASES_INTRO);
    expect(docs.sectionText.match(/Problem\./g)).toHaveLength(3);
    expect(docs.sectionText.match(/Configuration\./g)).toHaveLength(3);
  });
});

test.describe('Use-case guard on the real index', () => {
  test('every page of the build is in shape, and the Pro ratchet holds', async ({ page, request }) => {
    const stories = await storyEntries(request);
    const useCases = stories.filter((story) => story.tags?.includes(USE_CASE_TAG));
    // Not vacuous: the fixtures are in every build that has them.
    expect(useCases.length).toBeGreaterThanOrEqual(2);

    // The descriptions of the Pro use cases, and the tags the stories really carry once loaded (the tags
    // are written next to `useCaseStory(...)`: they must be the ones it names).
    await page.goto(`/iframe.html?id=${useCases[0]!.id}&viewMode=story`);
    await page.waitForFunction(() => !!(window as unknown as { __STORYBOOK_PREVIEW__?: unknown }).__STORYBOOK_PREVIEW__);
    const loaded = await page.evaluate(async (ids) => {
      type Loaded = { tags: string[]; parameters: { docs?: { description?: { story?: string } } } };
      const preview = (window as unknown as { __STORYBOOK_PREVIEW__: { storyStoreValue: { loadStory: (a: { storyId: string }) => Promise<Loaded> } } }).__STORYBOOK_PREVIEW__;
      const out: Record<string, { tags: string[]; description?: string }> = {};
      for (const id of ids) {
        const story = await preview.storyStoreValue.loadStory({ storyId: id });
        out[id] = { tags: story.tags, description: story.parameters.docs?.description?.story };
      }
      return out;
    }, useCases.map((story) => story.id));

    const descriptions = Object.fromEntries(Object.entries(loaded).map(([id, facts]) => [id, facts.description]));
    for (const story of useCases) {
      const indexed = (story.tags ?? []).filter((tag) => tag === USE_CASE_TAG || tag.startsWith(VERTICAL_TAG_PREFIX)).sort();
      const runtime = loaded[story.id]!.tags.filter((tag) => tag === USE_CASE_TAG || tag.startsWith(VERTICAL_TAG_PREFIX)).sort();
      expect(runtime, `${story.id}: the tags written in the story differ from the ones of useCaseStory`).toEqual(indexed);
    }

    expect(auditUseCaseStructure(stories, descriptions)).toEqual([]);
    expect(auditProRatchet(stories)).toEqual([]);
    expect(stories.some((story) => isProTitle(story.title))).toBe(true);
  });
});
