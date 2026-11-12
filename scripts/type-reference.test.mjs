import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  REPO_ROOT,
  defaultOf,
  findLeaks,
  findUndocumented,
  generateReference,
  joinInlineCodeSpans,
  publicEntries,
} from './type-reference.mjs';
import { typeReferencePlugin, withTypeReference } from '../.storybook/type-reference-plugin.mjs';

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

/** Every string of the reference (descriptions, examples, deprecations), with where it is. */
function* textsOf(value, path = '') {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* textsOf(v, `${path}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* textsOf(v, `${path}.${k}`);
}

describe('type reference: markdown normalisation (#402)', () => {
  it('joins an inline code span broken over two lines, leaves fences and paragraphs alone', () => {
    const input = ['Named `labels.rowAction(label,', ' rowLabel)`: "Delete".', 'Next line.', '', 'Second `a', '', 'b` paragraph.', '', '```ts', 'const x = `a', 'b`;', '```'].join('\n');
    expect(joinInlineCodeSpans(input)).toBe(
      ['Named `labels.rowAction(label, rowLabel)`: "Delete".', 'Next line.', '', 'Second `a', '', 'b` paragraph.', '', '```ts', 'const x = `a', 'b`;', '```'].join('\n'),
    );
  });

  it('rowActionsInline: the span of labels.rowAction is on one line', () => {
    const member = reference.entries.ListReportTableProps.members.find((m) => m.name === 'rowActionsInline');
    expect(member.description).toContain('named `labels.rowAction(label, rowLabel)`: "Delete FT-2026-0001"');
  });

  it('no generated text has an inline code span broken over lines (outside fenced blocks)', () => {
    const broken = [];
    for (const [entryName, entry] of Object.entries(reference.entries)) {
      for (const [path, text] of textsOf(entry)) {
        if (joinInlineCodeSpans(text) !== text) broken.push(`${entryName}${path}`);
      }
    }
    expect(broken).toEqual([]);
  });
});

describe('type reference: structural and standard-library members (#402)', () => {
  it('ClassValue is an alias, not the members of Array', () => {
    const entry = reference.entries.ClassValue;
    expect(entry.members ?? []).toEqual([]);
    expect(entry.definition).toContain('ClassArray');
  });

  it('no public type lists a member declared in the standard library', () => {
    const names = new Set(['length', 'pop', 'push', 'concat', 'join', 'slice', 'toString', 'call', 'apply', 'bind']);
    const offenders = [];
    for (const entry of Object.values(reference.entries)) {
      for (const group of [entry.members ?? [], ...(entry.variants ?? []).map((v) => v.members)]) {
        for (const m of group) if (names.has(m.name) && /lib\..*\.d\.ts/.test(m.source ?? '')) offenders.push(`${entry.name}.${m.name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('"Inherited from" never names the section that lists the member (AccordionProps branches)', () => {
    for (const entry of Object.values(reference.entries)) {
      for (const variant of entry.variants ?? []) {
        for (const m of variant.members) expect(m.inheritedFrom, `${entry.name}/${variant.title}.${m.name}`).not.toBe(variant.title);
      }
      for (const m of entry.members ?? []) expect(m.inheritedFrom, `${entry.name}.${m.name}`).not.toBe(entry.name);
    }
    const single = reference.entries.AccordionProps.variants.find((v) => v.title === 'AccordionSingleProps');
    expect(single.members.length).toBeGreaterThan(0);
  });
});

describe('type reference: the Pro build configuration (#402)', () => {
  // The Pro Storybook build has no reference page yet (the first arrives with #410): this keeps the
  // generator's Pro output from regressing unseen until then.
  it('the plugin of the Pro build (no STORYBOOK_EXCLUDE_PRO) serves the Pro types with members and TSDoc', () => {
    const plugin = typeReferencePlugin({ env: {} });
    const code = plugin.load.call({}, plugin.resolveId('virtual:formrail/type-reference'));
    const data = JSON.parse(code.replace(/^export default /, '').replace(/;\n$/, ''));
    for (const name of ['ChangeEntry', 'UseFormRebaseOptions', 'RebaseConflict']) {
      const entry = data.entries[name];
      expect(entry, name).toBeDefined();
      expect(entry.package, name).toBe('@formrail/pro');
      expect(entry.description, name).not.toBe('');
      expect(entry.members.length, name).toBeGreaterThan(0);
      for (const member of entry.members) {
        expect(member.description, `${name}.${member.name}`).not.toBe('');
        expect(member.type, `${name}.${member.name}`).not.toBe('');
      }
    }
  }, 60_000);
});

describe('type reference: the TSDoc guard (#402)', () => {
  it('every member of every type exported by core and Pro has TSDoc, every public function too', () => {
    expect(findUndocumented(reference)).toEqual([]);
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
