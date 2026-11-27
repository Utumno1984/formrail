import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  EDGE_CASES_HEADING,
  EDGE_CASES_INTRO,
  EDGE_CASE_TAG,
  EXAMPLE_TAG,
  HAPPY_PATH_TAG,
  PLAYGROUND_TAG,
  plannedDocsOrder,
} from '../packages/core/src/internal/story-example';

// Ticket #723: on a floorplan's Docs page the normal use (the story tagged `happy-path`) comes first, right after
// the copy-paste example and the Playground, and the stories of the uncommon situations (`edge-case`) are grouped
// under "Edge cases", after the other stories and before the domain examples (#624). The rule is one pure function
// (`plannedDocsOrder`, unit-tested in packages/core/src/internal/edge-cases.test.ts); here the rendered page is
// compared with that function applied to the `index.json` of the build, so the template and the rule cannot drift.

interface IndexEntry {
  id: string;
  type?: string;
  title: string;
  tags?: string[];
}

/** The floorplans whose Docs page must open with a happy path. `Floorplans/App Shell` joins after #735. */
const FLOORPLANS = ['Floorplans/List Report', 'Floorplans/Object Page/Layout'];

async function indexEntries(request: APIRequestContext): Promise<IndexEntry[]> {
  const res = await request.get('/index.json');
  expect(res.ok()).toBe(true);
  return Object.values(((await res.json()) as { entries: Record<string, IndexEntry> }).entries);
}

/** The stories of each title, in index order (the order Storybook hands them to the Docs page). */
function storiesByTitle(entries: readonly IndexEntry[]): Map<string, IndexEntry[]> {
  const pages = new Map<string, IndexEntry[]>();
  for (const entry of entries) {
    if (entry.type !== 'story') continue;
    pages.set(entry.title, [...(pages.get(entry.title) ?? []), entry]);
  }
  return pages;
}

/** The ids of the story anchors of a Docs page, in document order, and the ones inside the edge-case section. */
async function readOrder(page: Page, docsId: string) {
  await page.goto(`/iframe.html?id=${docsId}&viewMode=docs`);
  await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
  return page.evaluate(() => {
    const content = document.querySelector('.sbdocs-content')!;
    const section = content.querySelector('[data-edge-cases]');
    const anchors = [...content.querySelectorAll<HTMLElement>('[id^="anchor--"]')];
    const id = (a: HTMLElement) => a.id.replace(/^anchor--(primary--)?/, '');
    const headings = [...content.querySelectorAll('h2:not(.sbdocs-subtitle)')].map((h) => h.textContent?.trim() ?? '');
    return {
      ids: anchors.map(id),
      inSection: anchors.filter((a) => !!section?.contains(a)).map(id),
      heading: section?.querySelector('h2')?.textContent?.trim() ?? null,
      intro: section?.querySelector('[data-edge-cases-intro]')?.textContent ?? null,
      labelledBy: section?.getAttribute('aria-labelledby') ?? null,
      headings,
    };
  });
}

test.describe('Docs story order: happy path first, edge cases last (#723)', () => {
  test('the tags are used only where the template reads them: one happy path at most, on a page that opens with an example', async ({ request }) => {
    const pages = storiesByTitle(await indexEntries(request));
    const problems: string[] = [];
    for (const [title, stories] of pages) {
      const tagged = stories.filter((s) => s.tags?.includes(HAPPY_PATH_TAG) || s.tags?.includes(EDGE_CASE_TAG));
      if (tagged.length === 0) continue;
      if (!stories[0]?.tags?.includes(EXAMPLE_TAG)) problems.push(`${title}: "${HAPPY_PATH_TAG}"/"${EDGE_CASE_TAG}" on a page without a copy-paste example`);
      const happy = stories.filter((s) => s.tags?.includes(HAPPY_PATH_TAG));
      if (happy.length > 1) problems.push(`${title}: ${happy.length} stories tagged "${HAPPY_PATH_TAG}"`);
      for (const s of stories) {
        if (s.tags?.includes(HAPPY_PATH_TAG) && s.tags.includes(EDGE_CASE_TAG)) problems.push(`${s.id}: both "${HAPPY_PATH_TAG}" and "${EDGE_CASE_TAG}"`);
        if (s.tags?.includes(HAPPY_PATH_TAG) && s.tags.includes(PLAYGROUND_TAG)) problems.push(`${s.id}: both "${HAPPY_PATH_TAG}" and "${PLAYGROUND_TAG}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  for (const title of FLOORPLANS) {
    test(`${title}: the rendered order is the planned one, with the happy path right after the Playground`, async ({ page, request }) => {
      const entries = await indexEntries(request);
      const stories = storiesByTitle(entries).get(title) ?? [];
      const docs = entries.find((e) => e.type === 'docs' && e.title === title);
      expect(docs).toBeDefined();
      // Not vacuous: the page opens with the example, has a Playground, a happy path and edge cases.
      expect(stories[0]?.tags).toContain(EXAMPLE_TAG);
      const playground = stories.find((s) => s.tags?.includes(PLAYGROUND_TAG));
      const happy = stories.find((s) => s.tags?.includes(HAPPY_PATH_TAG));
      const edgeCases = stories.filter((s) => s.tags?.includes(EDGE_CASE_TAG)).map((s) => s.id);
      expect(playground).toBeDefined();
      expect(happy).toBeDefined();
      expect(edgeCases.length).toBeGreaterThan(0);

      const planned = plannedDocsOrder(stories, title);
      // The rule itself, on the real page: example, Playground, happy path; the edge cases in index order.
      expect(planned.slice(0, 3)).toEqual([stories[0]!.id, playground!.id, happy!.id]);

      const rendered = await readOrder(page, docs!.id);
      expect(rendered.ids).toEqual(planned);
      // The edge cases are the stories of their section, all of them and nothing else.
      expect(rendered.inSection).toEqual(edgeCases);
      expect(rendered.heading).toBe(EDGE_CASES_HEADING);
      expect(rendered.intro).toBe(EDGE_CASES_INTRO);
      expect(rendered.labelledBy).toBe('edge-cases');
      // "Stories" before "Edge cases"; "Examples" (the use cases, #624) stays last.
      const at = (heading: string) => rendered.headings.indexOf(heading);
      expect(at('Stories')).toBeGreaterThanOrEqual(0);
      expect(at('Stories')).toBeLessThan(at(EDGE_CASES_HEADING));
      if (at('Examples') >= 0) expect(at(EDGE_CASES_HEADING)).toBeLessThan(at('Examples'));
    });
  }
});
