import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  REPO_ROOT,
  defaultOf,
  findLeaks,
  findUndocumented,
  gapKey,
  generateReference,
  publicEntries,
} from './type-reference.mjs';
import { typeReferencePlugin, withTypeReference } from '../.storybook/type-reference-plugin.mjs';

/**
 * Gaps the props tables of ticket #401 (PR #436, still open when #402 was written) close in the SAME lines of
 * the component files (Radix props redeclared with TSDoc, the `TableName` / `Field` state unions documented).
 * Closing them here too would make the two PRs conflict line by line, so they are listed explicitly instead,
 * and the "still a real gap" test below fails as soon as one of them gets its TSDoc: whichever PR merges
 * second removes the entries it closed. The list may only shrink; never add a gap to it.
 */
const PENDING_401 = new Set([
  'DialogCloseProps.asChild',
  'DialogContentProps.asChild',
  'DialogTitleProps.asChild',
  'DialogTriggerProps.asChild',
  'FieldProps.state (Variant 2)',
  'FieldProps.state (Variant 3)',
  'FieldProps.stateReason (Variant 1)',
  'FieldStateProps.state (Variant 2)',
  'FieldStateProps.state (Variant 3)',
  'FieldStateProps.stateReason (Variant 1)',
  'ListReportTableProps.aria-label (Variant 1)',
  'ListReportTableProps.aria-label (Variant 2)',
  'ListReportTableProps.aria-label (Variant 3)',
  'ListReportTableProps.aria-labelledby (Variant 1)',
  'ListReportTableProps.aria-labelledby (Variant 2)',
  'ListReportTableProps.aria-labelledby (Variant 3)',
  'ListReportTableProps.caption (Variant 1)',
  'ListReportTableProps.caption (Variant 2)',
  'ListReportTableProps.caption (Variant 3)',
  'MenuContentProps.alignOffset',
  'MenuContentProps.arrowPadding',
  'MenuContentProps.avoidCollisions',
  'MenuContentProps.collisionBoundary',
  'MenuContentProps.collisionPadding',
  'MenuContentProps.hideWhenDetached',
  'MenuContentProps.onEscapeKeyDown',
  'MenuContentProps.onFocusOutside',
  'MenuContentProps.onInteractOutside',
  'MenuContentProps.onPointerDownOutside',
  'MenuContentProps.sideOffset',
  'MenuContentProps.sticky',
  'MenuContentProps.updatePositionStrategy',
  'MenuGroupProps.asChild',
  'MenuItemProps.disabled',
  'MenuItemProps.textValue',
  'MenuLabelProps.asChild',
  'MenuProps.children',
  'MenuProps.defaultOpen',
  'MenuProps.onOpenChange',
  'MenuSeparatorProps.asChild',
  'MultiSelectProps.labels',
  'ObjectPageSectionProps.children',
  'SheetCloseProps.asChild',
  'SheetContentProps.asChild',
  'SheetTitleProps.asChild',
  'SheetTriggerProps.asChild',
  'VirtualListReportTableProps.aria-label (Variant 1)',
  'VirtualListReportTableProps.aria-label (Variant 2)',
  'VirtualListReportTableProps.aria-label (Variant 3)',
  'VirtualListReportTableProps.aria-labelledby (Variant 1)',
  'VirtualListReportTableProps.aria-labelledby (Variant 2)',
  'VirtualListReportTableProps.aria-labelledby (Variant 3)',
  'VirtualListReportTableProps.caption (Variant 1)',
  'VirtualListReportTableProps.caption (Variant 2)',
  'VirtualListReportTableProps.caption (Variant 3)',
]);

// One program over both packages, shared by the tests below (about 2 s).
let reference;
beforeAll(() => {
  reference = generateReference().reference;
}, 60_000);

describe('type reference: extraction (#402)', () => {
  it('reads the public entries of core and Pro', () => {
    expect(reference.entries.useListReport?.package).toBe('@formrail/core');
    expect(reference.entries.UseChangeSummaryReturn?.package).toBe('@formrail/pro');
    expect(publicEntries(REPO_ROOT, { pro: false }).map((e) => e.package)).toEqual(['@formrail/core']);
  });

  it('UseListReportOptions: every member of list-report/types.ts, in order, with type, optionality, default, TSDoc', () => {
    const entry = reference.entries.UseListReportOptions;
    expect(entry.kind).toBe('interface');
    expect(entry.typeParameters).toEqual(['Row']);
    // The member names as declared in the source, so a new option shows up here (and on the page) by itself.
    const source = readFileSync(resolve(REPO_ROOT, 'packages/core/src/list-report/types.ts'), 'utf8');
    const body = source.slice(source.indexOf('export interface UseListReportOptions<Row>'));
    const declared = [...body.slice(0, body.indexOf('\n}')).matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);
    expect(entry.members.map((m) => m.name)).toEqual(declared);
    const byName = Object.fromEntries(entry.members.map((m) => [m.name, m]));
    expect(byName.columns).toMatchObject({ type: 'readonly ListReportColumn<Row>[]', optional: false });
    expect(byName.searchCommitDelay).toMatchObject({ type: 'number | null', optional: true, default: '300' });
    expect(byName.selectable.default).toBe('false');
    expect(byName.getRowId.type).toBe('(row: Row) => string');
    for (const member of entry.members) expect(member.description, member.name).not.toBe('');
  });

  it('ListReportColumn: defaults from the prose', () => {
    const byName = Object.fromEntries(reference.entries.ListReportColumn.members.map((m) => [m.name, m]));
    expect(byName.firstSortDirection.default).toBe("'asc'");
    expect(byName.truncate.default).toBe('true');
    expect(byName.minWidth.default).toBe('120px');
    expect(byName.cell.type).toBe('(row: Row) => ReactNode');
  });

  it('useListReport: signature and function TSDoc', () => {
    const entry = reference.entries.useListReport;
    expect(entry.kind).toBe('function');
    expect(entry.signatures[0].signature).toBe('useListReport<Row>(options: UseListReportOptions<Row>): UseListReportReturn<Row>');
    expect(entry.description).toContain('Memoize `columns`');
  });

  it('a union of object types: shared members plus one section per branch (AccordionProps)', () => {
    const entry = reference.entries.AccordionProps;
    expect(entry.members.map((m) => m.name)).toContain('orientation');
    expect(entry.variants.map((v) => v.title)).toEqual(['AccordionSingleProps', 'AccordionMultipleProps']);
    expect(entry.variants[0].members.map((m) => m.name)).toContain('collapsible');
    expect(entry.variants[1].members.map((m) => m.name)).not.toContain('collapsible');
  });

  it('a union with null keeps the object members and lists the rest (ListReportSort)', () => {
    const entry = reference.entries.ListReportSort;
    expect(entry.members.map((m) => m.name)).toEqual(['columnId', 'direction']);
    expect(entry.otherVariants).toEqual(['null']);
  });

  it('members inherited through extends are listed; HTML attributes are summarised, not listed', () => {
    const button = reference.entries.ButtonProps;
    const names = [...button.members, ...button.variants.flatMap((v) => v.members)].map((m) => m.name);
    expect(names).toContain('variant');
    expect(names).not.toContain('onClick');
    expect(button.inherits.join(' ')).toContain('ButtonHTMLAttributes');
    // "Inherited from" names only a public type: AccordionBaseProps is not exported.
    expect(reference.entries.AccordionProps.members.every((m) => m.inheritedFrom === undefined)).toBe(true);
  });

  it('a type with no members keeps its definition', () => {
    expect(reference.entries.ListReportSortDirection.definition).toBe("'asc' | 'desc'");
  });

  it('leaves components out (their props tables document them)', () => {
    expect(reference.entries.Button).toBeUndefined();
    expect(reference.entries.ListReportTable).toBeUndefined();
  });

  it('nothing internal, no inline import() types, no absolute path of this machine', () => {
    expect(findLeaks(reference)).toEqual([]);
  });
});

describe('type reference: the TSDoc guard (#402)', () => {
  it('every member of every type exported by core and Pro has TSDoc (except the gaps #401 closes)', () => {
    const gaps = findUndocumented(reference).filter((message) => !PENDING_401.has(gapKey(message)));
    expect(gaps).toEqual([]);
  });

  it('every entry of PENDING_401 is still a real gap (remove it once its TSDoc lands)', () => {
    const current = new Set(findUndocumented(reference).map(gapKey));
    expect([...PENDING_401].filter((key) => !current.has(key))).toEqual([]);
  });
});

describe('type reference: the guard fails on a type without TSDoc', () => {
  let dir;
  let fixture;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'type-reference-'));
    writeFileSync(join(dir, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'Bundler', target: 'ES2022' } }));
    writeFileSync(
      join(dir, 'index.ts'),
      [
        '/** A documented type. */',
        'export interface FakeOptions {',
        '  /** Documented. Default `3`. */',
        '  documented?: number;',
        '  undocumented: string;',
        '  /** @internal */',
        '  hidden?: boolean;',
        '}',
        'export function fakeHook(options: FakeOptions): void { void options; }',
        '',
      ].join('\n'),
    );
    fixture = generateReference({ root: dir, entries: [{ package: 'fake', file: join(dir, 'index.ts') }] }).reference;
  }, 60_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('names the type and the member', () => {
    expect(findUndocumented(fixture)).toEqual([
      expect.stringMatching(/^FakeOptions\.undocumented \(index\.ts:5\): member has no TSDoc$/),
      expect.stringMatching(/^fakeHook \(index\.ts:9\): the function has no TSDoc$/),
    ]);
  });

  it('leaves @internal members out and reads the default', () => {
    const names = fixture.entries.FakeOptions.members.map((m) => m.name);
    expect(names).toEqual(['documented', 'undocumented']);
    expect(fixture.entries.FakeOptions.members[0].default).toBe('3');
  });
});

describe('defaultOf', () => {
  it.each([
    ['Default `true`.', 'true'],
    ['Something. Default: `\'asc\'`.', "'asc'"],
    ['Milliseconds. Default 300; `null` = never.', '300'],
    ['Counted (default 120px) in the width.', '120px'],
    ['Included (default: yes); `false` opts out.', 'yes'],
  ])('%j -> %j', (text, expected) => {
    expect(defaultOf(text)).toBe(expected);
  });

  it.each(['Locale. Default: the runtime locale.', 'The active one defaults to `defaultFilter`, else the first.', 'No default here.'])(
    'no value in %j',
    (text) => {
      expect(defaultOf(text)).toBeUndefined();
    },
  );

  it('prefers the @default tag', () => {
    expect(defaultOf('Default `1`.', [{ name: 'default', text: [{ kind: 'text', text: '`2`' }] }])).toBe('2');
  });
});

describe('typeReferencePlugin', () => {
  it('serves the reference as a virtual module, without Pro in the Free build', () => {
    const plugin = typeReferencePlugin({ env: { STORYBOOK_EXCLUDE_PRO: '1' } });
    const id = plugin.resolveId('virtual:formrail/type-reference');
    expect(plugin.resolveId('something-else')).toBeNull();
    const code = plugin.load.call({}, id);
    const data = JSON.parse(code.replace(/^export default /, '').replace(/;\n$/, ''));
    expect(data.entries.useListReport).toBeDefined();
    expect(Object.values(data.entries).some((e) => e.package === '@formrail/pro')).toBe(false);
  }, 60_000);

  it('withTypeReference appends the plugin after the config viteFinal', async () => {
    const config = withTypeReference({ viteFinal: (c) => ({ ...c, plugins: [{ name: 'own' }] }) });
    const out = await config.viteFinal({}, {});
    expect(out.plugins.map((p) => p.name)).toEqual(['own', 'formrail:type-reference']);
  });
});
