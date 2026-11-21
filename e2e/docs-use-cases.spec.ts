import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { USE_CASES_INTRO, USE_CASE_TAG, VERTICAL_TAG_PREFIX } from '../packages/core/src/internal/story-example';
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
  importPath: string;
  tags?: string[];
}

async function storyEntries(request: APIRequestContext): Promise<IndexEntry[]> {
  const res = await request.get('/index.json');
  const index = (await res.json()) as { entries: Record<string, IndexEntry> };
  return Object.values(index.entries).filter((entry) => entry.type === 'story');
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

/**
 * What a Docs page shows outside its use-case section, with the page's own id prefix replaced by `<page>` so two
 * pages can be compared: the story anchors as they are (`anchor--primary--...` for the primary, then the
 * "Stories" list), the h2/h3 headings (the h1 is the title, which differs), the paragraphs that are not inside a
 * story or a table (the descriptions). And the section: its anchors, its heading, its intro, its text, and
 * whether every neutral anchor comes before it.
 */
async function pageShape(page: Page, docsId: string) {
  await page.goto(`/iframe.html?id=${docsId}&viewMode=docs`);
  await page.waitForSelector('.sbdocs-content', { timeout: 15_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.docs-story')].every((story) => story.querySelector('*')), undefined, { timeout: 15_000 });
  return page.evaluate((prefix) => {
    const content = document.querySelector('.sbdocs-content')!;
    const section = content.querySelector('[data-use-cases]');
    const outside = (el: Element) => !section?.contains(el);
    const norm = (text: string) => text.split(`${prefix}--`).join('<page>--');
    const anchors = [...content.querySelectorAll('[id^="anchor--"]')];
    const neutralAnchors = anchors.filter(outside);
    return {
      neutralAnchors: neutralAnchors.map((a) => norm(a.id)),
      neutralHeadings: [...content.querySelectorAll('h2:not(.sbdocs-subtitle), h3')].filter(outside).map((h) => `${h.tagName}:${h.textContent?.trim()}`),
      // The Subtitle block and the Controls' table (#646): a template that drops either must not pass as its twin.
      subtitle: content.querySelector('.sbdocs-subtitle')?.textContent?.trim() ?? null,
      argNames: [...content.querySelectorAll('.docblock-argstable tbody tr')].filter(outside).map((row) => row.querySelector('td')?.textContent?.trim() ?? ''),
      neutralText: [...content.querySelectorAll('p')].filter((p) => outside(p) && !p.closest('.docs-story, table')).map((p) => p.textContent?.trim()),
      sectionAnchors: anchors.filter((a) => !outside(a)).map((a) => norm(a.id)),
      sectionHeading: section?.querySelector('h2')?.textContent?.trim() ?? null,
      sectionIntro: section?.querySelector('[data-use-cases-intro]')?.textContent ?? null,
      sectionText: section?.textContent ?? '',
      sectionLast: section ? neutralAnchors.every((a) => !!(a.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING)) : null,
    };
  }, docsId.replace(/--docs$/, ''));
}

/** The ids that appear more than once in the page's content (#646: the section's heading id must not repeat). */
function duplicateIds(page: Page) {
  return page.evaluate(() => {
    const ids = [...document.querySelectorAll('.sbdocs-content [id]')].map((el) => el.id);
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  });
}

/**
 * The section is a region named by its own heading (`aria-labelledby`, not a copy of the text). Storybook's
 * `Heading` puts its "Copy heading URL to address bar" link inside the `<h2>`, so the name is that label plus
 * the heading text: the test pins the reference and the ending, not Storybook's link label.
 */
async function expectRegionLabelledByHeading(page: Page, id: string, heading: string) {
  const section = page.locator('section[data-use-cases]');
  await expect(section).toHaveCount(1);
  await expect(section).toHaveAttribute('aria-labelledby', id);
  await expect(section.locator(`h2#${id}`)).toHaveText(heading);
  await expect(page.getByRole('region').filter({ has: page.locator(`h2#${id}`) })).toHaveAccessibleName(new RegExp(`${heading}$`));
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
    await expectRegionLabelledByHeading(page, 'examples', 'Examples');
  });

  test('Free page WITHOUT a copy-paste example: Storybook\'s own template, unchanged by its use cases, then "Examples"', async ({ page }) => {
    // The twin page (same neutral stories, no use case) is rendered by Storybook's `DocsPage` untouched.
    const twin = await pageShape(page, 'internal-docsusecasesplainneutral--docs');
    // Not vacuous: the primary, then "Stories" with the primary included and the other story.
    expect(twin.neutralAnchors).toEqual(['anchor--primary--<page>--default', 'anchor--<page>--default', 'anchor--<page>--disabled']);
    expect(twin.neutralHeadings).toEqual(['H2:Stories', 'H3:Default', 'H3:Disabled']);
    expect(twin.neutralText).toEqual(expect.arrayContaining(['The neutral component on a generic record.', 'A state of the neutral component.']));
    expect(twin.sectionHeading).toBeNull();
    // Not vacuous (#646): the Subtitle and the Controls' table are really on the twin.
    expect(twin.subtitle).toBe('A neutral subtitle.');
    expect(twin.argNames).toEqual(expect.arrayContaining(['variant', 'children']));

    const docs = await pageShape(page, 'internal-docsusecasesplain--docs');
    // Adding the use cases did not change the neutral part.
    expect(docs.neutralAnchors).toEqual(twin.neutralAnchors);
    expect(docs.neutralHeadings).toEqual(twin.neutralHeadings);
    expect(docs.neutralText).toEqual(twin.neutralText);
    expect(docs.subtitle).toBe(twin.subtitle);
    expect(docs.argNames).toEqual(twin.argNames);
    // The section: after every neutral story, its heading and intro, the use cases in order with their descriptions.
    expect(docs.sectionLast).toBe(true);
    expect(docs.sectionAnchors).toEqual(['anchor--<page>--use-case-hr-leave-request', 'anchor--<page>--use-case-helpdesk-ticket']);
    expect(docs.sectionHeading).toBe('Examples');
    expect(docs.sectionIntro).toBe(USE_CASES_INTRO);
    expect(docs.sectionText).toContain('A manager approves the days off an employee asked for.');
    expect(docs.sectionText).toContain('An agent closes a support ticket once it is answered.');
    await expectRegionLabelledByHeading(page, 'examples', 'Examples');
    expect(await duplicateIds(page)).toEqual([]);
  });

  test('a single-story page stays a single-story page when it gains a use case', async ({ page }) => {
    const twin = await pageShape(page, 'internal-docsusecasessingleneutral--docs');
    // Storybook's single-story rule: the story's description under the page's, no "Stories" list.
    expect(twin.neutralAnchors).toEqual(['anchor--primary--<page>--default']);
    expect(twin.neutralHeadings).toEqual([]);
    expect(twin.neutralText).toContain('The only neutral story: on a single-story page this sentence sits under the page\'s description.');

    const docs = await pageShape(page, 'internal-docsusecasessingle--docs');
    expect(docs.neutralAnchors).toEqual(twin.neutralAnchors);
    expect(docs.neutralHeadings).toEqual(twin.neutralHeadings);
    expect(docs.neutralText).toEqual(twin.neutralText);
    expect(twin.subtitle).toBe('A neutral subtitle.');
    expect(twin.argNames).toEqual(expect.arrayContaining(['variant', 'children']));
    expect(docs.subtitle).toBe(twin.subtitle);
    expect(docs.argNames).toEqual(twin.argNames);
    expect(docs.sectionLast).toBe(true);
    expect(docs.sectionAnchors).toEqual(['anchor--<page>--use-case-b-2-b-price-list']);
    expect(docs.sectionHeading).toBe('Examples');
    expect(docs.sectionIntro).toBe(USE_CASES_INTRO);
    expect(await duplicateIds(page)).toEqual([]);
  });

  // The Pro branch of the template ("Use cases", Problem and Configuration per case) has no e2e on a real page
  // yet: no Pro fixture may reach the public Pro demo (e2e/site/pro.spec.ts). It is covered by the unit tests of
  // `planUseCasesSection` (use-case.test.ts); the e2e on a real Pro page arrives with #531, the first Pro page
  // with real use cases.
});

test.describe('Use-case guard on the real index', () => {
  test('every page of the build is in shape, its runtime tags are the index\'s, and the Pro ratchet holds', async ({ page, request }) => {
    const entries = await storyEntries(request);
    const stories: IndexedStory[] = entries.map(({ id, title, name, tags }) => ({ id, title, name, tags }));
    const useCases = stories.filter((story) => story.tags?.includes(USE_CASE_TAG));
    // Not vacuous: the fixtures are in every build that has them.
    expect(useCases.length).toBeGreaterThanOrEqual(2);

    // The tags every story really carries once loaded, and its description. The index reads tags statically: a
    // tag added at runtime only (or dropped) would escape the guard, so both directions are compared, per page.
    await page.goto(`/iframe.html?id=${useCases[0]!.id}&viewMode=story`);
    await page.waitForFunction(() => !!(window as unknown as { __STORYBOOK_PREVIEW__?: { storyStoreValue?: unknown } }).__STORYBOOK_PREVIEW__?.storyStoreValue);
    const loaded = await page.evaluate(
      async (list) => {
        type Loaded = { tags: string[]; parameters: { docs?: { description?: { story?: string } } } };
        type Store = {
          loadAllCSFFiles: () => Promise<Record<string, unknown>>;
          storyFromCSFFile: (a: { storyId: string; csfFile: unknown }) => Loaded;
        };
        const store = (window as unknown as { __STORYBOOK_PREVIEW__: { storyStoreValue: Store } }).__STORYBOOK_PREVIEW__.storyStoreValue;
        const files = await store.loadAllCSFFiles();
        const out: Record<string, { tags: string[]; description?: string }> = {};
        for (const { id, importPath } of list) {
          const story = store.storyFromCSFFile({ storyId: id, csfFile: files[importPath] });
          out[id] = { tags: story.tags, description: story.parameters.docs?.description?.story };
        }
        return out;
      },
      entries.map(({ id, importPath }) => ({ id, importPath })),
    );
    expect(Object.keys(loaded).length).toBe(entries.length);

    const caseTags = (tags: readonly string[] | undefined) => (tags ?? []).filter((tag) => tag === USE_CASE_TAG || tag.startsWith(VERTICAL_TAG_PREFIX)).sort();
    const pages = new Map<string, { index: string[]; runtime: string[] }>();
    for (const story of stories) {
      const facts = pages.get(story.title) ?? { index: [], runtime: [] };
      facts.index.push(...caseTags(story.tags).map((tag) => `${story.id} ${tag}`));
      facts.runtime.push(...caseTags(loaded[story.id]!.tags).map((tag) => `${story.id} ${tag}`));
      pages.set(story.title, facts);
    }
    const mismatches = [...pages].filter(([, facts]) => facts.index.join('\n') !== facts.runtime.join('\n'));
    expect(
      mismatches.map(([title, facts]) => ({ title, index: facts.index, runtime: facts.runtime })),
      'pages whose "use-case"/"vertical:*" tags differ between index.json and the loaded stories (write the tags literally on the story)',
    ).toEqual([]);
    // Not vacuous: the runtime side sees the fixtures' use cases too.
    expect([...pages.values()].flatMap((facts) => facts.runtime).filter((tag) => tag.endsWith(` ${USE_CASE_TAG}`)).length).toBe(useCases.length);

    const descriptions = Object.fromEntries(Object.entries(loaded).map(([id, facts]) => [id, facts.description]));
    expect(auditUseCaseStructure(stories, descriptions)).toEqual([]);
    expect(auditProRatchet(stories)).toEqual([]);
  });
});
