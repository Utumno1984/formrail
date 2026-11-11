import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  STORY_CONTROLS,
  auditDocsPage,
  createPropsTypeReader,
  type AuditOptions,
  type DocgenComponent,
  type DocsPageFacts,
} from './helpers/docs-props';

// Props tables of the Docs pages (ticket #401): every public Docs page shows ALL AND ONLY the real props of
// its component (and of its subcomponents), each with its TSDoc; the story's demo knobs are filed under
// "Story controls". Read from the built Storybook (the docgen exists only after the Vite transform), through
// the preview's own story store: the same prepared story and argTypes the Docs page's table renders.
// The rules themselves are in ./helpers/docs-props.ts (pure, with a negative test below).

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Pages that document no component: their story args all belong under "Story controls". */
const PAGES_WITHOUT_COMPONENT: Record<string, string> = {
  'Showcase/Invoices': 'an application assembled from the components, not a component',
  'Pro/Showcase/Invoices with Change Summary': 'an application assembled from the components, not a component',
  'Foundations/Theming': 'design tokens and CSS, no component',
  'Foundations/Tokens': 'design tokens, no component',
  'Foundations/Utilities': 'utility functions (cn, ...), no component',
  'Patterns/DirtyGuard': 'documents the useDirtyGuard hook: its options are the story controls',
  'Floorplans/Object Page/Validation': 'documents useObjectPageForm validation: hook options, no component of its own',
  'Floorplans/Object Page/Schema validation': 'documents useObjectPageForm({ schema }): hook options, no component of its own',
  'Floorplans/Object Page with Validation': 'a recipe assembled from the components, not a component',
  'Pro/Patterns/Form rebase': 'documents the useFormRebase hook: its options are the story controls',
};

/** The props react-docgen lost (the table of the ticket): they must stay in the docgen. */
const REQUIRED_PROPS: AuditOptions['requiredProps'] = {
  ListReport: ['title', 'table', 'actions', 'bulkActions', 'status', 'labels', 'rowActions'],
  Accordion: ['type', 'value', 'defaultValue', 'onValueChange', 'collapsible', 'disabled', 'headingLevel'],
  VirtualListReport: ['title', 'table', 'virtualizeThreshold', 'overscan', 'handleRef', 'labels', 'bulkActions'],
  VirtualListReportTable: ['table', 'status', 'rowActions', 'virtualizeThreshold', 'overscan', 'handleRef', 'aria-label', 'aria-labelledby', 'caption'],
  ListReportTable: ['table', 'aria-label', 'aria-labelledby', 'caption'],
  Field: ['label', 'state', 'stateReason'],
  Button: ['variant', 'size', 'aria-label', 'aria-labelledby'],
};

interface IndexEntry {
  id: string;
  type?: string;
  title: string;
  importPath: string;
  tags?: string[];
}

/** The props-table facts of the given pages, from their primary story (the one the Docs table shows). */
async function pageFacts(page: Page, pages: { title: string; storyId: string }[]): Promise<DocsPageFacts[]> {
  await page.goto('/iframe.html');
  await page.waitForFunction(() => !!(window as unknown as { __STORYBOOK_PREVIEW__?: { storyStoreValue?: unknown } }).__STORYBOOK_PREVIEW__?.storyStoreValue);
  return page.evaluate(async (list) => {
    interface Docgen { displayName?: string; filePath?: string; props?: Record<string, { description?: string }> }
    interface Prepared {
      component?: { __docgenInfo?: Docgen };
      subcomponents?: Record<string, { __docgenInfo?: Docgen } | undefined>;
      argTypes: Record<string, { name?: string; description?: string; table?: { category?: string; disable?: boolean } }>;
    }
    const preview = (window as unknown as { __STORYBOOK_PREVIEW__: { storyStoreValue: { loadStory: (a: { storyId: string }) => Promise<Prepared> } } }).__STORYBOOK_PREVIEW__;
    const docgen = (c: { __docgenInfo?: Docgen } | undefined) => {
      const info = c?.__docgenInfo;
      if (!info?.displayName || !info.filePath) return null;
      return {
        displayName: info.displayName,
        filePath: info.filePath,
        props: Object.fromEntries(Object.entries(info.props ?? {}).map(([k, p]) => [k, { description: p.description ?? '' }])),
      };
    };
    const out = [];
    for (const { title, storyId } of list) {
      const story = await preview.storyStoreValue.loadStory({ storyId });
      out.push({
        title,
        component: docgen(story.component),
        subcomponents: Object.fromEntries(Object.entries(story.subcomponents ?? {}).map(([name, c]) => [name, docgen(c)])),
        rows: Object.entries(story.argTypes).map(([name, a]) => ({
          name,
          category: a.table?.category ?? null,
          disabled: !!a.table?.disable,
          description: a.description ?? '',
        })),
      });
    }
    return out;
  }, pages);
}

/** Public Docs pages of CSF files: not MDX, not `internal`, with their primary story. */
async function publicPages(page: Page): Promise<{ title: string; storyId: string }[]> {
  const index = (await (await page.request.get('/index.json')).json()) as { entries: Record<string, IndexEntry> };
  const entries = Object.values(index.entries);
  return entries
    .filter((e) => e.type === 'docs' && e.importPath.endsWith('.stories.tsx') && !e.tags?.includes('internal'))
    .map((docs) => ({ title: docs.title, storyId: entries.find((e) => e.type === 'story' && e.title === docs.title)?.id ?? '' }));
}

test.describe('Docs props tables', () => {
  test('every public Docs page shows all and only the real props, with their TSDoc', async ({ page }) => {
    test.setTimeout(120_000);
    const pages = await publicPages(page);
    expect(pages.length).toBeGreaterThan(30);
    for (const p of pages) expect(p.storyId, `${p.title}: a Docs page with no story`).not.toBe('');
    const facts = await pageFacts(page, pages);

    const components = facts.flatMap((f) => [f.component, ...Object.values(f.subcomponents)]).filter((c): c is DocgenComponent => c !== null);
    const options: AuditOptions = {
      propsTypeKeys: createPropsTypeReader(REPO_ROOT, components),
      pagesWithoutComponent: PAGES_WITHOUT_COMPONENT,
      requiredProps: REQUIRED_PROPS,
    };
    const problems = facts.flatMap((f) => auditDocsPage(f, options));

    // The list of pages without component, and the components of REQUIRED_PROPS, must exist (no stale entry).
    const titles = new Set(facts.map((f) => f.title));
    for (const title of Object.keys(PAGES_WITHOUT_COMPONENT)) if (!titles.has(title)) problems.push(`PAGES_WITHOUT_COMPONENT lists "${title}", which is not a public Docs page`);
    const names = new Set(components.map((c) => c.displayName));
    for (const name of Object.keys(REQUIRED_PROPS)) if (!names.has(name)) problems.push(`REQUIRED_PROPS: ${name} is documented on no public Docs page`);

    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
  });

  test('negative: a demo arg shown among the props, a missing TSDoc and a lost prop fail the guard', async ({ page }) => {
    // A real page (ListReportTable), then the same page with the regressions the guard exists for.
    const [real] = await pageFacts(page, (await publicPages(page)).filter((p) => p.title === 'Data/ListReportTable'));
    expect(real?.component?.displayName).toBe('ListReportTable');
    if (!real?.component) return;
    const options: AuditOptions = {
      propsTypeKeys: createPropsTypeReader(REPO_ROOT, [real.component]),
      pagesWithoutComponent: PAGES_WITHOUT_COMPONENT,
      requiredProps: REQUIRED_PROPS,
    };
    expect(auditDocsPage(real, options)).toEqual([]);

    const uncategorized: DocsPageFacts = {
      ...real,
      title: 'Fake/Page',
      rows: [...real.rows, { name: 'fakeDemoArg', category: null, disabled: false, description: 'A demo knob.' }],
    };
    expect(auditDocsPage(uncategorized, options)).toEqual([
      expect.stringContaining('"fakeDemoArg" is shown as a prop but is not a key of the props type of ListReportTable'),
    ]);

    // The same arg filed under "Story controls" passes; a real prop filed there does not.
    const categorized: DocsPageFacts = { ...uncategorized, rows: [...real.rows, { name: 'fakeDemoArg', category: STORY_CONTROLS, disabled: false, description: 'A demo knob.' }] };
    expect(auditDocsPage(categorized, options)).toEqual([]);
    const hiddenProp: DocsPageFacts = {
      ...real,
      rows: real.rows.map((r) => (r.name === 'maxHeight' ? { ...r, category: STORY_CONTROLS } : r)),
    };
    expect(auditDocsPage(hiddenProp, options)).toEqual([expect.stringContaining('"maxHeight" is a prop of ListReportTable but is filed under "Story controls"')]);

    // react-docgen's regression (a union member lost) and a prop whose TSDoc went missing.
    const props = Object.fromEntries(Object.entries(real.component.props).filter(([key]) => key !== 'caption'));
    const lostProp: DocsPageFacts = {
      ...real,
      component: { ...real.component, props: { ...props, maxHeight: { description: '' } } },
      rows: real.rows.filter((r) => r.name !== 'caption'),
    };
    expect(auditDocsPage(lostProp, options)).toEqual([
      'Fake/Lost: ListReportTable.maxHeight has no TSDoc',
      'Fake/Lost: ListReportTable: prop "caption" missing from the docgen',
    ].map((text) => text.replace('Fake/Lost', real.title)));

    // An argTypes description that replaces the TSDoc of a prop (the manual compensation that drifts).
    const overridden: DocsPageFacts = { ...real, rows: real.rows.map((r) => (r.name === 'maxHeight' ? { ...r, description: 'Stale text.' } : r)) };
    expect(auditDocsPage(overridden, options)).toEqual([expect.stringContaining('prop "maxHeight": the story\'s argTypes description replaces the TSDoc')]);

    const noComponent: DocsPageFacts = { ...real, component: null, subcomponents: {} };
    expect(auditDocsPage(noComponent, options)[0]).toContain('no `component` with docgen');
  });
});
