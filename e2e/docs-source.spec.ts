import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { rendersLocalComponent } from '../.storybook/source-transform';
import {
  EXAMPLE_TAG,
  PLAYGROUND_TAG,
  REPOSITORY_MAIN,
  SHOWCASE_SOURCE_TAG,
  controlsStory,
  findPlayground,
  githubSource,
} from '../packages/core/src/internal/story-example';
import { auditSnippet, intrinsicElements, publicExports, type KnownTags } from './helpers/docs-source';

// "Show code" must print something a reader can use (ticket #333). With Storybook's default `dynamic`
// source, a story whose `render` declares a local stateful component and renders it (`function XyzDemo()
// {...}; return <XyzDemo />`) yields a useless placeholder such as `<t />`; `.storybook/preview.ts`
// prints the original source for exactly those stories (rule in .storybook/source-transform.ts) and keeps
// the synthesized JSX, with the live args, for every other story (criterion 3 of the ticket).

interface IndexEntry {
  id: string;
  type?: string;
}

interface StoryFacts {
  /** `parameters.docs.source.originalSource`: the story object's text. */
  original: string;
  /**
   * Whether Storybook synthesizes JSX for this story on the Docs page at all. It does not, and prints the
   * original source natively whatever the transform, when the story function takes no args
   * (`render: () => ...`, Storybook's own `__isArgsStory` flag) or the story asks for `source.type: 'code'`
   * (ChangeSummary ValueTypes). With `docs.story.inline: false` (DirtyGuard) the story renders in its own
   * lazy iframe and the synthesized JSX replaces the original only once that iframe has rendered: not
   * a state this test can read deterministically, so those stories are not held to either form.
   */
  synthesized: boolean;
}

// What the dynamic JSX synthesis printed for the broken stories: a lone, minified, prop-less element.
const PLACEHOLDER = /^\s*<[A-Za-z_$][\w$]{0,2}\s*\/>\s*$/;
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The facts of the given stories, read in one go before any block is opened. */
async function storyFacts(page: Page, storyIds: string[]): Promise<Record<string, StoryFacts>> {
  return page.evaluate(async (ids) => {
    // The preview's own story store: the same prepared stories (and parameters) the Docs page renders.
    const preview = (window as unknown as { __STORYBOOK_PREVIEW__: { storyStoreValue: { loadStory: (a: { storyId: string }) => Promise<{ parameters: Record<string, unknown> }> } } }).__STORYBOOK_PREVIEW__;
    const facts: Record<string, StoryFacts> = {};
    for (const id of ids) {
      const { parameters } = await preview.storyStoreValue.loadStory({ storyId: id });
      const docs = parameters.docs as { source?: { originalSource?: unknown; type?: unknown }; story?: { inline?: unknown } } | undefined;
      facts[id] = {
        original: String(docs?.source?.originalSource ?? ''),
        synthesized: parameters.__isArgsStory === true && docs?.source?.type !== 'code' && docs?.story?.inline !== false,
      };
    }
    return facts;
  }, storyIds);
}

/** Opens the "Show code" of one story block (`#anchor--<id>`) and returns the printed source. */
async function openSource(page: Page, anchorId: string): Promise<string> {
  const anchor = page.locator(`[id="${anchorId}"]`);
  // The block's own "Show code" switch (a story can render switches of its own: Switch, Field fixtures).
  const toggle = anchor.locator('button.docblock-code-toggle');
  // A heavy page (the virtualized List Report's) mounts its blocks late: wait for the switch first.
  await expect(toggle, `${anchorId}: no "Show code"`).toBeVisible({ timeout: 30_000 });
  await expect(toggle).toHaveAccessibleName('Show code');
  // Wait for this switch to flip before anything else (no re-query of a list that is still changing).
  // The live stories of a Docs page run their play functions meanwhile: one can leave an overlay open
  // (Combobox's Playground opens its listbox) whose outside-click dismissal swallows the click, so the
  // click is repeated, only while the switch is still closed, until it has actually flipped. A page full of
  // live stories (the List Report's) keeps the main thread busy for seconds: each attempt waits long enough
  // for a registered click to show, so a slow flip is never mistaken for a lost click and toggled back.
  await expect(async () => {
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 });
  }, `${anchorId}: "Show code" does not open`).toPass({ timeout: 45_000 });
  await expect(toggle).toHaveAccessibleName('Hide code');
  // The panel the switch controls: a story can render code blocks of its own (the URL-state recipe does).
  const panel = await toggle.getAttribute('aria-controls');
  expect(panel, `${anchorId}: "Show code" controls no panel`).toBeTruthy();
  const block = page.locator(`[id="${panel}"] pre.prismjs`);
  // The highlighter fills the block a moment after it opens: poll until it is not empty.
  await expect(block, `${anchorId}: empty source`).not.toHaveText('');
  return block.innerText();
}

/**
 * Opens every given block's "Show code" in one pass and returns the printed sources, by anchor id. For the
 * scan of whole pages: a page full of live stories (the List Report's, ~30 running play functions) keeps the
 * main thread busy for seconds, and ~30 pointer clicks in sequence, each waiting for actionability, took
 * the scan of that page alone past 10 minutes on a loaded machine. `HTMLElement.click()` fires the
 * switch's own click handler with no pointer gesture, so an overlay left open by a play function cannot
 * swallow it either. The real pointer click on the switch is covered by `openSource` in the named tests.
 */
async function openAllSources(page: Page, anchorIds: string[]): Promise<Record<string, string>> {
  const toggleOf = (anchorId: string) => page.locator(`[id="${anchorId}"] button.docblock-code-toggle`);
  for (const anchorId of anchorIds) await expect(toggleOf(anchorId), `${anchorId}: no "Show code"`).toBeAttached({ timeout: 30_000 });
  await page.evaluate((ids) => {
    for (const id of ids) {
      const toggle = document.getElementById(id)?.querySelector<HTMLButtonElement>('button.docblock-code-toggle');
      if (toggle?.getAttribute('aria-expanded') !== 'true') toggle?.click();
    }
  }, anchorIds);
  const shown: Record<string, string> = {};
  for (const anchorId of anchorIds) {
    const toggle = toggleOf(anchorId);
    await expect(toggle, `${anchorId}: "Show code" does not open`).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
    await expect(toggle).toHaveAccessibleName('Hide code');
    const panel = await toggle.getAttribute('aria-controls');
    expect(panel, `${anchorId}: "Show code" controls no panel`).toBeTruthy();
    const block = page.locator(`[id="${panel}"] pre.prismjs`);
    await expect(block, `${anchorId}: empty source`).not.toHaveText('', { timeout: 30_000 });
    shown[anchorId] = await block.innerText();
  }
  return shown;
}

test.describe('Storybook "Show code"', () => {
  test('the shared rule matches a rendered local component, not any named function', () => {
    // Ticket #333's shape: declared in the render AND used as a JSX tag.
    expect(rendersLocalComponent('{ render: () => { function SelectAllDemo() { return null; } return <SelectAllDemo />; } }')).toBe(true);
    expect(rendersLocalComponent('{ render: (args) => { function Host() { return null; } return <Host label="x">y</Host>; } }')).toBe(true);
    // A named render returning a native element (Field ErrorReservesSpace, ObjectPageFooter Playground,
    // VirtualListReport FreeReference): its synthesized JSX is right and must stay.
    expect(rendersLocalComponent('{ render: function Render({ help }) { const [e] = useState(""); return <div>{help}</div>; } }')).toBe(false);
    expect(rendersLocalComponent('{ render: function FreeReferenceStory({ rowCount }) { return <div><ListReport /></div>; } }')).toBe(false);
    // A module-level component rendered by the story (its declaration is not in the story's source).
    expect(rendersLocalComponent('{ render: (args) => <PlaygroundDemo {...args} /> }')).toBe(false);
    // A name that is only a prefix of the tag, a lowercase helper, a non-component call.
    expect(rendersLocalComponent('{ render: () => { function Demo() { return null; } return <DemoPanel />; } }')).toBe(false);
    expect(rendersLocalComponent('{ render: () => { function demo() { return null; } return <demo />; } }')).toBe(false);
    expect(rendersLocalComponent('{ play: async () => { async function Settle(el) {} await Settle(x); } }')).toBe(false);
  });

  // Every story of every Docs page, in both directions, against the same rule production uses:
  // - a story the rule selects prints its original source (fails if production narrows, or the rule
  //   stops recognising a story it should);
  // - a story the rule does not select, and for which Storybook synthesizes JSX at all (see
  //   StoryFacts.synthesized), keeps the synthesized JSX, not its story object
  //   (fails if production widens again, the regression of d6067b3);
  // - no block anywhere is a placeholder (fails on a new local-component shape the rule misses).
  // Sharded so the ~50 pages (~380 blocks) run in parallel workers, ~4 pages per test: one page (the List
  // Report's, ~30 live stories) takes ~30 s alone and several minutes when the machine is busy.
  const SHARDS = 12;
  for (let shard = 0; shard < SHARDS; shard++) {
    test(`every story's "Show code" (pages ${shard + 1}/${SHARDS})`, async ({ page, request }) => {
      test.setTimeout(600_000);
      const index = (await (await request.get('/index.json')).json()) as { entries: Record<string, IndexEntry> };
      const docs = Object.values(index.entries)
        .filter((e) => e.type === 'docs')
        .filter((_, i) => i % SHARDS === shard);
      expect(docs.length).toBeGreaterThan(2);
      let checked = 0;
      let keptJsx = 0;
      for (const entry of docs) {
        await page.goto(`/iframe.html?id=${entry.id}&viewMode=docs`);
        await page.waitForSelector('.sbdocs-content', { timeout: 30_000 });
        // Story blocks are anchored `anchor--<storyId>`. The primary block at the top of an autodocs page
        // (`anchor--primary--<storyId>`) usually repeats a story that keeps its own block below: checked
        // once (its own block when there is one). An MDX page without stories (Introduction) has none.
        const all = await page.locator('.sbdocs-content [id^="anchor--"]').evaluateAll((els) => els.map((el) => el.id));
        const anchorIds = all.filter((id) => !id.startsWith('anchor--primary--') || !all.includes(id.replace('primary--', '')));
        const storyIdOf = (anchorId: string) => anchorId.replace(/^anchor--(primary--)?/, '');
        const facts = await storyFacts(page, anchorIds.map(storyIdOf));
        const sources = await openAllSources(page, anchorIds);
        for (const anchorId of anchorIds) {
          const storyId = storyIdOf(anchorId);
          const where = `${entry.id} → ${storyId}`;
          const shown = sources[anchorId]!;
          const { original, synthesized } = facts[storyId]!;
          expect(original, `${where}: no originalSource`).not.toBe('');
          expect(PLACEHOLDER.test(shown), `${where}: placeholder instead of source: ${shown.trim()}`).toBe(false);
          if (rendersLocalComponent(original)) {
            expect(normalize(shown), `${where}: should print its original source`).toBe(normalize(original));
          } else if (synthesized) {
            expect(normalize(shown), `${where}: should keep the synthesized JSX, not the story object`).not.toBe(normalize(original));
            expect(shown.trim(), `${where}: synthesized JSX expected`).toMatch(/^</);
            keptJsx++;
          }
          checked++;
        }
      }
      expect(checked, 'story blocks checked').toBeGreaterThan(5);
      // `synthesized` reads Storybook internals (`__isArgsStory`): if they changed, the "keeps the JSX"
      // direction would pass vacuously. Every shard holds Playground-style args stories.
      expect(keptJsx, 'stories checked to keep the synthesized JSX').toBeGreaterThan(0);
    });
  }

  // Criterion 3, named: stories that were fine stay as they were (the live JSX, not the story object).
  // The first three are named `render: function Xyz(args)` returning a native element (the shape the
  // previous rule wrongly switched); the production build minifies component names, so only stable
  // text (native tags, literal props) is asserted.
  test.describe('stories without a rendered local component keep the synthesized JSX', () => {
    const cases = [
      { story: 'forms-field--error-reserves-space', needle: 'VAT number' },
      { story: 'floorplans-object-page-footer--playground', needle: '<div' },
      { story: 'pro-floorplans-virtual-list-report--free-reference', needle: 'title="Invoices"' },
      { story: 'primitives-avatar--playground', needle: 'name="Ada Lovelace"' }, // `Story = {}`: live props
      { story: 'forms-checkbox--in-form', needle: '<form' }, // render with a direct JSX return
    ];
    for (const { story, needle } of cases) {
      test(story, async ({ page }) => {
        test.setTimeout(120_000); // the virtualized List Report's Docs page alone takes ~25 s to settle, more on a busy machine
        const docs = story.replace(/--.*$/, '--docs');
        await page.goto(`/iframe.html?id=${docs}&viewMode=docs`);
        const shown = await openSource(page, `anchor--${story}`);
        expect(shown).toContain(needle);
        expect(shown.trim()).toMatch(/^</);
        expect(shown).not.toContain('render:');
      });
    }
  });

  test.describe('stories that declare and render a local stateful component print their real source', () => {
    const cases = [
      { story: 'forms-checkbox--select-all', needle: 'function SelectAllDemo' },
      { story: 'forms-combobox--async-load', needle: 'function Host' },
      { story: 'overlays-dialog--external-state', needle: 'function Host' },
      { story: 'patterns-dirtyguard--unmounts-page', needle: 'function Root' },
    ];
    for (const { story, needle } of cases) {
      test(story, async ({ page }) => {
        const docs = story.replace(/--.*$/, '--docs');
        await page.goto(`/iframe.html?id=${docs}&viewMode=docs`);
        const shown = await openSource(page, `anchor--${story}`);
        expect(shown).toContain(needle);
        expect(shown).toContain('useState');
        expect(shown).toContain('render:');
      });
    }
  });
});

// Copy-paste examples (ticket #403): the first "Show code" of every public Docs page is code a reader can
// paste into an app with only `@formrail/core` / `@formrail/pro` installed. The page must open with a story
// tagged `example` (a `*.example.tsx` file, type-checked and linted with the package, printed verbatim) or,
// for a showcase, `showcase-source` (a pointer to the source files the page lists, with their GitHub link).
// The printed text is audited by ./helpers/docs-source.ts: no relative/internal/Storybook import, no `fn(`
// or `args`, no JSX tag that is not an HTML element, a public export or a component declared in the snippet.
test.describe('copy-paste examples (#403)', () => {
  const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

  /**
   * Public Docs pages not converted yet, by follow-up ticket. The list can only shrink: an entry whose page
   * already opens with an example (or a showcase source) fails the test (remove it), and so does an entry
   * with no page.
   */
  const PENDING: Record<string, string[]> = {
    // #403 follow-up: Forms
    Forms: [
      'forms-calendar--docs', 'forms-checkbox--docs', 'forms-combobox--docs', 'forms-datepicker--docs', 'forms-field--docs',
      'forms-fileupload--docs', 'forms-input--docs', 'forms-multiselect--docs', 'forms-numberinput--docs', 'forms-radiogroup--docs',
      'forms-select--docs', 'forms-switch--docs', 'forms-textarea--docs',
    ],
    // #403 follow-up: Overlays
    Overlays: ['overlays-confirmdialog--docs', 'overlays-dialog--docs', 'overlays-menu--docs', 'overlays-sheet--docs', 'overlays-toast--docs', 'overlays-tooltip--docs'],
    // #403 follow-up: Primitives, Navigation, Foundations
    'Primitives-Navigation-Foundations': [
      'navigation-accordion--docs', 'navigation-breadcrumb--docs', 'navigation-collapsible--docs', 'navigation-pagination--docs', 'navigation-tabs--docs',
      'primitives-avatar--docs', 'primitives-button--docs', 'primitives-card--docs', 'primitives-divider--docs', 'primitives-fieldmessage--docs',
      'primitives-messagestrip--docs', 'primitives-progressbar--docs', 'primitives-skeleton--docs', 'primitives-spinner--docs', 'primitives-statusbadge--docs',
      'foundations-icon--docs', 'foundations-theming--docs', 'foundations-tokens--docs', 'foundations-typography--docs', 'foundations-utilities--docs',
    ],
    // #403 follow-up: Pro
    Pro: ['pro-changesummary--docs', 'pro-floorplans-virtual-list-report--docs', 'pro-patterns-form-rebase--docs'],
  };
  const pending = new Set(Object.values(PENDING).flat());

  interface Entry {
    id: string;
    type: string;
    importPath: string;
    tags?: string[];
  }

  async function indexEntries(request: APIRequestContext): Promise<Entry[]> {
    return Object.values(((await (await request.get('/index.json')).json()) as { entries: Record<string, Entry> }).entries);
  }

  /** Public Docs pages of CSF files (not MDX, not `internal`) with their primary story. */
  async function publicDocs(request: APIRequestContext) {
    const entries = await indexEntries(request);
    return entries
      .filter((e) => e.type === 'docs' && e.importPath.endsWith('.stories.tsx') && !e.tags?.includes('internal'))
      .map((docs) => ({ id: docs.id, primary: entries.find((e) => e.type === 'story' && e.importPath === docs.importPath && e.tags?.includes('autodocs')) }));
  }

  /** Everything wrong with a page's first "Show code" (and, for a showcase, its source listing). */
  async function auditPage(page: Page, docsId: string, primary: Entry | undefined, known: KnownTags): Promise<string[]> {
    const tags = primary?.tags ?? [];
    const showcase = tags.includes(SHOWCASE_SOURCE_TAG);
    if (!primary || (!tags.includes(EXAMPLE_TAG) && !showcase)) return [`first story ${primary?.id ?? '(none)'} is not tagged "${EXAMPLE_TAG}" or "${SHOWCASE_SOURCE_TAG}"`];
    await page.goto(`/iframe.html?id=${docsId}&viewMode=docs`);
    const problems = auditSnippet(await openSource(page, `anchor--primary--${primary.id}`), known);
    if (showcase) {
      if ((await page.locator(`.sbdocs-content a[href^="${REPOSITORY_MAIN}"]`).count()) === 0) problems.push('no GitHub link to the source');
      if ((await page.locator('.sbdocs-content section[aria-label] pre').count()) === 0) problems.push('no source file listed');
    }
    return problems;
  }

  const knownTags = (): KnownTags => ({ exports: publicExports(REPO_ROOT), intrinsic: intrinsicElements(REPO_ROOT) });

  test('the snippet audit: each rule, both ways', () => {
    const exports = { exports: new Set(['ListReportTable', 'useListReport', 'Menu']), intrinsic: intrinsicElements(REPO_ROOT) };
    const ok = `import { useState } from 'react';\nimport { ListReportTable, Menu } from '@formrail/core';\nfunction Local() { return <div />; }\nexport function App() { const [x] = useState(0); return <><Local /><Menu.Item /><ListReportTable aria-label="x" /><span>{x}</span></>; }`;
    expect(auditSnippet(ok, exports)).toEqual([]);
    expect(auditSnippet('// a comment, no JSX', exports)).toEqual([]);
    expect(auditSnippet(`import { useListReport } from './use-list-report';`, exports)).toEqual([expect.stringContaining('relative import')]);
    expect(auditSnippet(`import { x } from '@formrail/core/internal';`, exports)).toEqual([expect.stringContaining('internal import')]);
    expect(auditSnippet(`import { userEvent } from 'storybook/test';`, exports)).toEqual([expect.stringContaining('Storybook import')]);
    expect(auditSnippet('const onClick = fn();', exports)).toEqual(['Storybook `fn(`']);
    expect(auditSnippet('const C = (args) => null;', exports)).toEqual(['Storybook `args`']);
    expect(auditSnippet('const t = <TableDemo rows={[]} />;', exports)).toEqual([expect.stringContaining('<TableDemo>')]);
    expect(auditSnippet('const t = <Nope.Item />;', exports)).toEqual([expect.stringContaining('<Nope.Item>')]);
    // A wrapper minified by the production build prints lowercase (`<y columns={…} />`): still not an element.
    expect(auditSnippet('const t = <y columns={[]} />;', exports)).toEqual([expect.stringContaining('<y>')]);
    expect(auditSnippet('const t = <svg viewBox="0 0 1 1"><path d="M0 0" /></svg>;', exports)).toEqual([]);
    // Several problems in one snippet: all reported.
    expect(auditSnippet(`import { a } from '../a';\nconst t = <Showcase {...args} />;`, exports)).toHaveLength(3);
  });

  test('the public API is read from the index of core and Pro', () => {
    const exports = publicExports(REPO_ROOT);
    for (const name of ['ListReportTable', 'useListReport', 'ObjectPage', 'useDirtyGuard', 'ChangeSummary']) expect(exports, name).toContain(name);
    expect(exports).not.toContain('TableDemo');
  });

  test('the Controls follow the Playground only after an example', () => {
    const s = (id: string, ...tags: string[]) => ({ id, tags });
    expect(controlsStory([s('a', EXAMPLE_TAG), s('b'), s('c', PLAYGROUND_TAG)])?.id).toBe('c');
    expect(controlsStory([s('a', EXAMPLE_TAG), s('b')])?.id).toBe('a');
    expect(controlsStory([s('a'), s('c', PLAYGROUND_TAG)])?.id).toBe('a');
    expect(controlsStory([])).toBeUndefined();
    expect(() => findPlayground([s('a', PLAYGROUND_TAG), s('b', PLAYGROUND_TAG)])).toThrow(/More than one/);
  });

  test('the GitHub URL is built in one place, on main', () => {
    expect(githubSource('packages/core/src/showcase')).toBe('https://github.com/Utumno1984/formrail/blob/main/packages/core/src/showcase');
    expect(githubSource('/a.ts')).toBe(`${REPOSITORY_MAIN}a.ts`);
  });

  test('PENDING lists only pages that exist and do not open with an example yet', async ({ request }) => {
    const docs = new Map((await publicDocs(request)).map((d) => [d.id, d]));
    for (const id of pending) {
      expect(docs.has(id), `${id}: PENDING names no public Docs page (remove it)`).toBe(true);
      const tags = docs.get(id)?.primary?.tags ?? [];
      expect(tags, `${id}: opens with an example now, remove it from PENDING`).not.toContain(EXAMPLE_TAG);
      expect(tags, `${id}: opens with a showcase source now, remove it from PENDING`).not.toContain(SHOWCASE_SOURCE_TAG);
    }
  });

  test('every public Docs page outside PENDING opens with a copy-paste example', async ({ page, request }) => {
    test.setTimeout(600_000);
    const known = knownTags();
    const pages = (await publicDocs(request)).filter((d) => !pending.has(d.id));
    expect(pages.length, 'converted pages').toBeGreaterThan(10);
    for (const { id, primary } of pages) expect(await auditPage(page, id, primary, known), id).toEqual([]);
  });

  test('a page still on a demo wrapper fails the audit (negative)', async ({ page, request }) => {
    test.setTimeout(120_000);
    const known = knownTags();
    const avatar = (await publicDocs(request)).find((d) => d.id === 'primitives-avatar--docs')!;
    expect(await auditPage(page, avatar.id, avatar.primary, known)).toEqual([expect.stringContaining('is not tagged')]);
    // And the text rule itself, on a real wrapper story's "Show code": the Playground's `<TableDemo …/>`, which
    // the production build prints with a minified name (`<y …/>`), and its `onSortChange={…}` from `fn()`.
    await page.goto('/iframe.html?id=data-listreporttable--docs&viewMode=docs');
    const problems = auditSnippet(await openSource(page, 'anchor--data-listreporttable--playground'), known);
    expect(problems).toContainEqual(expect.stringContaining('not a public export'));
  });

  test('every example renders without errors', async ({ page, request }) => {
    test.setTimeout(300_000);
    const examples = (await indexEntries(request)).filter((e) => e.type === 'story' && e.tags?.includes(EXAMPLE_TAG));
    expect(examples.length).toBeGreaterThan(10);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    for (const { id } of examples) {
      await page.goto(`/iframe.html?id=${id}&viewMode=story`);
      await expect(page.locator('#storybook-root > *').first(), `${id}: nothing rendered`).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('body'), `${id}: Storybook error display`).not.toHaveClass(/sb-show-errordisplay/);
      expect(errors, id).toEqual([]);
    }
  });
});
