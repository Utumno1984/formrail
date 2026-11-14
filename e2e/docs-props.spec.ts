import { readFileSync } from 'node:fs';
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
import { controlsStory } from '../packages/core/src/internal/story-example';

// Props tables of the Docs pages (ticket #401): every public Docs page shows ALL AND ONLY the real props of
// its component (and of its subcomponents, in their tabs), each with its TSDoc; the story's demo knobs and
// the subcomponents' props driven from the main story are filed under "Story controls". Read from the
// built Storybook (the docgen exists only after the Vite transform), through the preview's own story
// store: the same prepared story and argTypes the Docs page's table renders.
// The rules themselves are in ./helpers/docs-props.ts (pure, with negative tests below).

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

const CLASS_NAME = "a real prop of every component (its root's HTML attribute, merged with tailwind-merge): the story exposes it";

/**
 * Inherited HTML attributes (left out of the docgen, which keeps only what @types/react does not declare)
 * that a page's story shows among its component's props, with the reason. Any other row outside "Story
 * controls" must be a prop of the docgen.
 */
const INHERITED_ATTRIBUTE_ROWS: AuditOptions['inheritedAttributeRows'] = {
  Avatar: { className: CLASS_NAME },
  Breadcrumb: { className: CLASS_NAME },
  Card: { className: CLASS_NAME },
  Divider: { className: CLASS_NAME },
  Pagination: { className: CLASS_NAME },
  ProgressBar: { className: CLASS_NAME },
  Skeleton: { className: CLASS_NAME },
  Spinner: { className: CLASS_NAME },
  StatusBadge: { className: CLASS_NAME },
  Tabs: { className: CLASS_NAME },
  Button: { disabled: "the native button's: the demo toggles it", onClick: 'wired to the Actions panel' },
  Icon: { onClick: 'wired to the Actions panel (the interactive-icon demo)' },
  Text: { children: 'the text itself: the demo edits it', onClick: 'wired to the Actions panel' },
  FieldMessage: { children: 'the message itself: the demo edits it' },
  MessageStrip: { children: 'the message itself: the demo edits it' },
  Combobox: { placeholder: "the input's: the demo edits it" },
  MultiSelect: { placeholder: "the input's: the demo edits it" },
  Input: {
    type: "the native input's: the demo switches it",
    placeholder: "the native input's",
    disabled: "the native input's",
    readOnly: "the native input's",
    onChange: 'wired to the Actions panel',
  },
  Textarea: { rows: "the native textarea's", placeholder: "the native textarea's", onChange: 'wired to the Actions panel' },
  ListReportTable: { dir: 'the RTL demo: the table mirrors with it' },
  TruncatedText: { tabIndex: 'makes the truncated text focusable (tooltip on focus)', onFocus: 'wired to the Actions panel' },
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

const DEFER_POINTER_DOWN =
  "Radix's text is true of the panel: ModalPanel does not touch it (the press it defers is still the one `onPointerDownOutside` receives, and the backdrop press of `dismissible={false}` keeps the panel open either way)";

/**
 * Pass-through props of a dependency (Radix) whose TSDoc the table shows as the dependency wrote it, with
 * why that text holds for the component. Every other one is redeclared with the project's TSDoc: Radix's
 * text on a prop the wrapper intercepts (`onCloseAutoFocus`, whose `preventDefault()` the overlays make
 * moot) promises what the component does not do.
 */
const DEPENDENCY_TSDOC_PROPS: AuditOptions['dependencyTsdocProps'] = {
  DialogContent: { deferPointerDownOutside: DEFER_POINTER_DOWN },
  SheetContent: { deferPointerDownOutside: DEFER_POINTER_DOWN },
};

const FIELD_REQUIRED = '`required` of the surrounding `Field` (the demo wraps the control in one), not the native attribute';

/**
 * Story controls named like an inherited HTML attribute of the page's component, with what they really
 * drive: their row stays under "Story controls" with that description. Any other such name fails (rule b').
 */
const STORY_CONTROL_ATTRIBUTE_NAMES: AuditOptions['storyControlAttributeNames'] = {
  Checkbox: { required: FIELD_REQUIRED },
  MultiSelect: { required: FIELD_REQUIRED },
  NumberInput: { required: FIELD_REQUIRED },
  Switch: { required: FIELD_REQUIRED },
  Textarea: { required: FIELD_REQUIRED },
  Field: { onChange: "`onChange` of the demo's `Input` (the Field's child), wired to the Actions panel" },
  ListReportFilterBar: { dir: '`dir` of the demo wrapper around the bar (the RTL layout), not an attribute of the bar' },
  ObjectPage: { title: 'the `title` prop of `ObjectPageHeader` (see its tab), not the native tooltip of the page' },
  Skeleton: { onLoad: 'called when the simulated load of the demo card ends, not the native `load` event' },
  ToastProvider: { title: 'the `title` option of `useToast().show()`, not the native tooltip of the region' },
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
    interface DocgenProp { description?: string; parent?: { fileName?: string }; declarations?: { fileName?: string }[] }
    interface Docgen { displayName?: string; filePath?: string; props?: Record<string, DocgenProp> }
    interface Prepared {
      component?: { __docgenInfo?: Docgen };
      subcomponents?: Record<string, { __docgenInfo?: Docgen } | undefined>;
      argTypes: Record<string, { name?: string; description?: string; table?: { category?: string; disable?: boolean; defaultValue?: { summary?: string } } }>;
    }
    const preview = (window as unknown as { __STORYBOOK_PREVIEW__: { storyStoreValue: { loadStory: (a: { storyId: string }) => Promise<Prepared> } } }).__STORYBOOK_PREVIEW__;
    const docgen = (c: { __docgenInfo?: Docgen } | undefined) => {
      const info = c?.__docgenInfo;
      if (!info?.displayName || !info.filePath) return null;
      const props = Object.values(info.props ?? {});
      return {
        displayName: info.displayName,
        filePath: info.filePath,
        props: Object.fromEntries(Object.entries(info.props ?? {}).map(([k, p]) => [k, { description: p.description ?? '' }])),
        propFiles: [...new Set(props.flatMap((p) => [p.parent?.fileName, ...(p.declarations ?? []).map((d) => d.fileName)]).filter((f): f is string => !!f))],
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
          defaultValue: a.table?.defaultValue?.summary ?? null,
        })),
      });
    }
    return out;
  }, pages);
}

/**
 * Public Docs pages of CSF files (not MDX, not `internal`), with the story whose argTypes the page's table
 * shows: among the stories of the file that the Docs page includes (a story tagged `!autodocs` is not on the
 * page), the one the Docs page template attaches its Controls to (`controlsStory`, ticket #403): the
 * Playground when the page opens with a copy-paste example, the first story otherwise.
 */
async function publicPages(page: Page): Promise<{ title: string; storyId: string }[]> {
  const index = (await (await page.request.get('/index.json')).json()) as { entries: Record<string, IndexEntry> };
  const entries = Object.values(index.entries);
  return entries
    .filter((e) => e.type === 'docs' && e.importPath.endsWith('.stories.tsx') && !e.tags?.includes('internal'))
    .map((docs) => ({
      title: docs.title,
      storyId: controlsStory(entries.filter((e) => e.type === 'story' && e.importPath === docs.importPath && e.tags?.includes('autodocs')))?.id ?? '',
    }));
}

const optionsFor = (components: DocgenComponent[]): AuditOptions => ({
  propsTypeKeys: createPropsTypeReader(REPO_ROOT, components),
  pagesWithoutComponent: PAGES_WITHOUT_COMPONENT,
  inheritedAttributeRows: INHERITED_ATTRIBUTE_ROWS,
  requiredProps: REQUIRED_PROPS,
  dependencyTsdocProps: DEPENDENCY_TSDOC_PROPS,
  storyControlAttributeNames: STORY_CONTROL_ATTRIBUTE_NAMES,
});

/** A real page by title, with the audit options of its components. */
async function realPage(page: Page, title: string): Promise<{ facts: DocsPageFacts; options: AuditOptions }> {
  const [facts] = await pageFacts(page, (await publicPages(page)).filter((p) => p.title === title));
  if (!facts) throw new Error(`no public Docs page "${title}"`);
  const components = [facts.component, ...Object.values(facts.subcomponents)].filter((c): c is DocgenComponent => c !== null);
  const options = optionsFor(components);
  expect(auditDocsPage(facts, options)).toEqual([]);
  return { facts, options };
}

test.describe('Docs props tables', () => {
  test('every public Docs page shows all and only the real props, with their TSDoc', async ({ page }) => {
    test.setTimeout(120_000);
    const pages = await publicPages(page);
    expect(pages.length).toBeGreaterThan(30);
    for (const p of pages) expect(p.storyId, `${p.title}: a Docs page with no story`).not.toBe('');
    const facts = await pageFacts(page, pages);

    const components = facts.flatMap((f) => [f.component, ...Object.values(f.subcomponents)]).filter((c): c is DocgenComponent => c !== null);
    const problems = facts.flatMap((f) => auditDocsPage(f, optionsFor(components)));

    // The lists above must name existing pages and components (no stale entry).
    const titles = new Set(facts.map((f) => f.title));
    for (const title of Object.keys(PAGES_WITHOUT_COMPONENT)) {
      if (!titles.has(title)) problems.push(`"${title}" is listed above but is not a public Docs page`);
    }
    const names = new Set(components.map((c) => c.displayName));
    for (const name of Object.keys(REQUIRED_PROPS)) if (!names.has(name)) problems.push(`REQUIRED_PROPS: ${name} is documented on no public Docs page`);
    for (const name of Object.keys(DEPENDENCY_TSDOC_PROPS)) if (!names.has(name)) problems.push(`DEPENDENCY_TSDOC_PROPS: ${name} is documented on no public Docs page`);
    const mains = new Set(facts.map((f) => f.component?.displayName));
    for (const [name, attributes] of Object.entries(INHERITED_ATTRIBUTE_ROWS)) {
      if (!mains.has(name)) problems.push(`INHERITED_ATTRIBUTE_ROWS: ${name} is the component of no public Docs page`);
      for (const attribute of Object.keys(attributes)) {
        const used = facts.some((f) => f.component?.displayName === name && f.rows.some((r) => r.name === attribute && !r.disabled && r.category === null));
        if (!used) problems.push(`INHERITED_ATTRIBUTE_ROWS: ${name}.${attribute} is shown by no page: drop it`);
      }
    }
    for (const [name, controls] of Object.entries(STORY_CONTROL_ATTRIBUTE_NAMES)) {
      for (const control of Object.keys(controls)) {
        const used = facts.some((f) => f.component?.displayName === name && f.rows.some((r) => r.name === control && !r.disabled && r.category === STORY_CONTROLS));
        if (!used) problems.push(`STORY_CONTROL_ATTRIBUTE_NAMES: ${name}.${control} is a story control of no page: drop it`);
      }
    }

    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
  });

  test('the published Storybook names no path of the build machine (project.json, index.json)', async ({ page }) => {
    // `project.json` would copy main.ts's docgen options (absolute include / paths) into the site: it is
    // not generated (core.disableProjectJson).
    expect((await page.request.get('/project.json')).status()).toBe(404);
    const root = REPO_ROOT.replace(/[\\/]+$/, '');
    expect(await (await page.request.get('/index.json')).text()).not.toContain(root);
  });

  test('negative: rows that are not props of the component fail the guard', async ({ page }) => {
    const { facts: real, options } = await realPage(page, 'Data/ListReportTable');
    expect(real.component?.displayName).toBe('ListReportTable');

    const withRow = (row: DocsPageFacts['rows'][number]): DocsPageFacts => ({ ...real, rows: [...real.rows, row] });
    // A demo knob among the props.
    expect(auditDocsPage(withRow({ name: 'fakeDemoArg', category: null, disabled: false, description: 'A demo knob.' }), options)).toEqual([
      expect.stringContaining('"fakeDemoArg" is not a prop in the docgen of ListReportTable'),
    ]);
    // An inherited HTML attribute (a real key of the props type) shown as a prop without being listed:
    // the demo `title` of the critic's case (C1).
    expect(auditDocsPage(withRow({ name: 'title', category: null, disabled: false, description: 'Demo title.' }), options)).toEqual([
      expect.stringContaining('"title" is not a prop in the docgen of ListReportTable'),
    ]);
    // Listed, but not a key of the props type at all.
    const listed: AuditOptions = { ...options, inheritedAttributeRows: { ListReportTable: { dir: 'RTL', notAnAttribute: 'stale' } } };
    expect(auditDocsPage(withRow({ name: 'notAnAttribute', category: null, disabled: false, description: 'x' }), listed)).toEqual([
      expect.stringContaining('"notAnAttribute" is listed as an inherited attribute of ListReportTable, but its props type has no such key'),
    ]);
    // The same knob filed under "Story controls" passes; a real prop filed there does not.
    expect(auditDocsPage(withRow({ name: 'fakeDemoArg', category: STORY_CONTROLS, disabled: false, description: 'A demo knob.' }), options)).toEqual([]);
    const filedProp: DocsPageFacts = { ...real, rows: real.rows.map((r) => (r.name === 'maxHeight' ? { ...r, category: STORY_CONTROLS } : r)) };
    expect(auditDocsPage(filedProp, options)).toEqual([expect.stringContaining('"maxHeight" is a prop of ListReportTable but is filed under "Story controls"')]);
    // A prop of the docgen hidden from the table (C2).
    const hiddenProp: DocsPageFacts = { ...real, rows: real.rows.map((r) => (r.name === 'maxHeight' ? { ...r, disabled: true } : r)) };
    expect(auditDocsPage(hiddenProp, options)).toEqual([expect.stringContaining('prop "maxHeight" of ListReportTable is hidden from the props table')]);
    // An argTypes description that replaces the TSDoc of a prop (the manual compensation that drifts).
    const overridden: DocsPageFacts = { ...real, rows: real.rows.map((r) => (r.name === 'maxHeight' ? { ...r, description: 'Stale text.' } : r)) };
    expect(auditDocsPage(overridden, options)).toEqual([expect.stringContaining('prop "maxHeight": an argTypes description overrides its TSDoc')]);
    const noComponent: DocsPageFacts = { ...real, component: null, subcomponents: {} };
    expect(auditDocsPage(noComponent, options).join('\n')).toContain('no `component` with docgen');
  });

  test('negative: a lost prop, a missing TSDoc and a leaked path fail the guard', async ({ page }) => {
    const { facts: real, options } = await realPage(page, 'Data/ListReportTable');
    if (!real.component) throw new Error('ListReportTable has no docgen');
    const component = real.component;
    const without = (key: string): DocsPageFacts => ({
      ...real,
      component: { ...component, props: Object.fromEntries(Object.entries(component.props).filter(([k]) => k !== key)) },
      rows: real.rows.filter((r) => r.name !== key),
    });
    // react-docgen's regression (a union member lost): caught by the props-type check of every page and by
    // the REQUIRED_PROPS list.
    expect(auditDocsPage(without('caption'), options)).toEqual([
      `${real.title}: ListReportTable: prop "caption" of its props type is missing from the docgen`,
      `${real.title}: ListReportTable: prop "caption" missing from the docgen`,
    ]);
    // Any other project prop (not in REQUIRED_PROPS) is checked the same way (C2).
    expect(auditDocsPage(without('maxHeight'), options)).toEqual([`${real.title}: ListReportTable: prop "maxHeight" of its props type is missing from the docgen`]);
    // A prop whose TSDoc went missing.
    const noTsdoc: DocsPageFacts = { ...real, component: { ...component, props: { ...component.props, maxHeight: { description: '' } } } };
    // (The row keeps its text: with no TSDoc it is not compared.)
    expect(auditDocsPage(noTsdoc, { ...options, propsTypeKeys: (c) => {
      const keys = options.propsTypeKeys(c);
      if (typeof keys === 'string') return keys;
      return new Map([...keys].map(([k, v]) => [k, k === 'maxHeight' ? { ...v, projectTsdoc: false } : v]));
    } })).toEqual([`${real.title}: ListReportTable.maxHeight has no TSDoc of its own`]);
    // A path that names the build machine (absolute POSIX / Windows / UNC, or prefixed with the checkout).
    for (const path of ['/home/u/checkout/packages/core/src/list-report/ListReportTable.tsx', 'C:/w/packages/x.tsx', 'C:\\w\\packages\\x.tsx', '\\\\host\\share\\x.tsx', 'checkout/packages/x.tsx']) {
      const leaked: DocsPageFacts = { ...real, component: { ...component, propFiles: [...component.propFiles, path] } };
      expect(auditDocsPage(leaked, options)).toEqual([expect.stringContaining(`path "${path}" in the bundle is not repo-relative`)]);
    }
  });

  test('Button: the `size` row shows one description, true for both branches of the union (ticket #451, #475)', async ({ page }) => {
    // `size` is optional in the text branch (`@default 'md'`) and required in the icon branch (no default):
    // the docgen merges the branches, so both TSDoc blocks must carry the same descriptive text, and the row
    // must show exactly that text once (not two concatenated). Since #475 the default is the `@default` tag
    // of the text branch (shown in the Default column), no longer a "Default `md`." sentence in the prose.
    const EXPECTED =
      'Height scale (`sm` 32px, `md` 36px, `lg` 44px) or `inline` (one text line, for use inside a paragraph): the text sizes. ' +
      'The square icon-only sizes (`icon-xs` 24px, `icon-sm` 32px, `icon-md` 36px) are never implied: pass one explicitly, ' +
      'together with `aria-label` or `aria-labelledby` (there is no visible text).';
    const { facts } = await realPage(page, 'Primitives/Button');
    const rows = facts.rows.filter((r) => r.name === 'size');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description.replace(/\s+/g, ' ')).toBe(EXPECTED);
    expect(facts.component?.props.size?.description.replace(/\s+/g, ' ')).toBe(EXPECTED);
    // The prose no longer states the default, and the Default column shows it.
    expect(rows[0]?.description).not.toMatch(/Default `md`/);
    expect(rows[0]?.defaultValue).toMatch(/^"?'md'"?$/);

    // Source: the TSDoc of `size` in every branch has the same descriptive text; the only allowed
    // difference is the `@default` tag, on the text branch only.
    const source = readFileSync(new URL('../packages/core/src/button/Button.tsx', import.meta.url), 'utf8');
    const blocks = [...source.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*size\??: (Button(?:Text|Icon)Size);/g)].map((m) => ({ raw: m[1] ?? '', type: m[2] ?? '' }));
    expect(blocks.map((b) => b.type).sort()).toEqual(['ButtonIconSize', 'ButtonTextSize']);
    const flat = (t: string) => t.replace(/\n\s*\*/g, ' ').replace(/\s+/g, ' ').trim();
    const descriptive = blocks.map((b) => flat(b.raw.split(/\n\s*\*\s*@/)[0] ?? ''));
    expect(new Set(descriptive).size).toBe(1);
    expect(descriptive[0]).toBe(EXPECTED);
    const tagsOf = (type: string) => {
      const block = blocks.find((b) => b.type === type);
      return [...(block?.raw ?? '').matchAll(/@default\s+(\S+)/g)].map((m) => m[1]);
    };
    // The tag is on the text branch (the one with the default) and never on the icon branch.
    expect(tagsOf('ButtonTextSize')).toEqual(["'md'"]);
    expect(tagsOf('ButtonIconSize')).toEqual([]);
  });

  test('negative: a Radix prop dropped by the docgen filter, and a TSDoc inherited from @types/react, fail the guard', async ({ page }) => {
    // T1: the Radix props a component passes through (here MenuContent's `sideOffset` and MenuItem's
    // `textValue`) must stay in the docgen.
    const { facts: menu, options } = await realPage(page, 'Overlays/Menu');
    const content = menu.subcomponents.MenuContent;
    expect(content && Object.keys(content.props)).toEqual(expect.arrayContaining(['sideOffset', 'onEscapeKeyDown', 'collisionPadding']));
    expect(menu.subcomponents.MenuItem && Object.keys(menu.subcomponents.MenuItem.props)).toEqual(expect.arrayContaining(['disabled', 'textValue']));
    if (!content) return;
    const dropped: DocsPageFacts = {
      ...menu,
      subcomponents: { ...menu.subcomponents, MenuContent: { ...content, props: Object.fromEntries(Object.entries(content.props).filter(([k]) => k !== 'sideOffset')) } },
    };
    expect(auditDocsPage(dropped, options)).toEqual([`${menu.title}: MenuContent: prop "sideOffset" of its props type is missing from the docgen`]);

    // T3: a prop the project redeclares, shown with the @types/react text instead of its own TSDoc, or
    // with both joined.
    const { facts: tabs, options: tabsOptions } = await realPage(page, 'Navigation/Tabs');
    const tweak = (patch: { projectTsdoc?: boolean; reactTypesTsdoc?: boolean }): AuditOptions => ({
      ...tabsOptions,
      propsTypeKeys: (c) => {
        const keys = tabsOptions.propsTypeKeys(c);
        if (typeof keys === 'string' || c.displayName !== 'TabsList') return keys;
        return new Map([...keys].map(([k, v]) => [k, k === 'aria-labelledby' ? { ...v, ...patch } : v]));
      },
    });
    expect(auditDocsPage(tabs, tweak({ projectTsdoc: false }))).toEqual([
      'Navigation/Tabs: TabsList.aria-labelledby has no TSDoc of its own (the table shows the text inherited from its base type)',
    ]);
    expect(auditDocsPage(tabs, tweak({ reactTypesTsdoc: true }))).toEqual([
      'Navigation/Tabs: TabsList.aria-labelledby: its TSDoc is joined to the generic @types/react text (leave the attribute out of the base type)',
    ]);
  });

  test('negative: a Radix prop the wrapper intercepts, shown with the Radix text, fails the guard', async ({ page }) => {
    // The critic's case (round 2): Radix says "Can be prevented." of `onCloseAutoFocus`, but the overlays
    // call `preventDefault()` themselves and return the focus through `useReturnFocus`.
    const { facts: dialog, options } = await realPage(page, 'Overlays/Dialog');
    const { facts: menu } = await realPage(page, 'Overlays/Menu');
    const { facts: sheet } = await realPage(page, 'Overlays/Sheet');
    for (const component of [dialog.subcomponents.DialogContent, sheet.subcomponents.SheetContent, menu.subcomponents.MenuContent]) {
      const text = component?.props.onCloseAutoFocus?.description ?? '';
      expect(text, `${component?.displayName}.onCloseAutoFocus`).toContain('`event.preventDefault()` has no effect');
      expect(text).not.toContain('Can be prevented');
    }

    // The redeclaration gone (the prop declared by Radix only): the Radix text is refused.
    const radixOnly: AuditOptions = {
      ...options,
      propsTypeKeys: (c) => {
        const keys = options.propsTypeKeys(c);
        if (typeof keys === 'string' || c.displayName !== 'DialogContent') return keys;
        return new Map([...keys].map(([k, v]) => [k, k === 'onCloseAutoFocus' ? { ...v, declaredByProject: false, projectTsdoc: false } : v]));
      },
    };
    expect(auditDocsPage(dialog, radixOnly)).toEqual([
      expect.stringContaining('DialogContent.onCloseAutoFocus shows the TSDoc of its dependency: redeclare it'),
    ]);
    // A Radix text kept as it is, without being listed as faithful.
    const unlisted: AuditOptions = { ...options, dependencyTsdocProps: { ...options.dependencyTsdocProps, DialogContent: {} } };
    expect(auditDocsPage(dialog, unlisted)).toEqual([expect.stringContaining('DialogContent.deferPointerDownOutside shows the TSDoc of its dependency')]);
    // Listed as faithful, but redeclared by the project (stale), or not a prop at all.
    const stale: AuditOptions = {
      ...options,
      dependencyTsdocProps: { ...options.dependencyTsdocProps, DialogContent: { deferPointerDownOutside: 'faithful', onCloseAutoFocus: 'stale', notAProp: 'stale' } },
    };
    expect(auditDocsPage(dialog, stale)).toEqual([
      expect.stringContaining('DialogContent.onCloseAutoFocus is listed as keeping its dependency\'s TSDoc, but the project redeclares it'),
      expect.stringContaining('DialogContent.notAProp is listed as keeping its dependency\'s TSDoc, but it is not in the docgen'),
    ]);
  });

  test('negative: an HTML attribute of the component filed under "Story controls" fails the guard', async ({ page }) => {
    // Rule (b'): `title` is not in ListReportTable's docgen (an inherited HTML attribute), but it is a key
    // of its props type: a demo knob with that name may hide the attribute among the story controls.
    const { facts: real, options } = await realPage(page, 'Data/ListReportTable');
    const withControl = (name: string): DocsPageFacts => ({ ...real, rows: [...real.rows, { name, category: STORY_CONTROLS, disabled: false, description: 'A demo knob.' }] });
    expect(auditDocsPage(withControl('title'), options)).toEqual([
      expect.stringContaining('"title" is an attribute of ListReportTable\'s props type but is filed under "Story controls"'),
    ]);
    expect(auditDocsPage(withControl('fakeDemoArg'), options)).toEqual([]);
    // Reviewed: a control that only shares the attribute's name (it drives something else) passes.
    const reviewed: AuditOptions = { ...options, storyControlAttributeNames: { ListReportTable: { title: 'the title of the demo card' } } };
    expect(auditDocsPage(withControl('title'), reviewed)).toEqual([]);
  });
});
