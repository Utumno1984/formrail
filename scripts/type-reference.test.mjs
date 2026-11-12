import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  REPO_ROOT,
  createCachingHost,
  createReferenceProgram,
  defaultOf,
  extractReference,
  findLeaks,
  findMarkdownProblems,
  findUndocumented,
  findUnknownReferences,
  findUnknownReferencesInPages,
  generateReference,
  joinInlineCodeSpans,
  presentDefault,
  publicEntries,
  scanCodeSpans,
  referenceCompilerOptions,
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
    // A string for a `number | string` member, written the TypeScript way (review round 2, point 3).
    expect(byName.minWidth.default).toBe("'120px'");
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

  it('Button size (#451): the text branch defaults to md, the icon branch (md is not an icon size) has no default', () => {
    const sizes = reference.entries.ButtonProps.variants.map((v) => v.members.find((m) => m.name === 'size')).filter(Boolean);
    // The icon branch is split by the accessible-name union: one variant per alternative.
    const text = sizes.filter((m) => m.type === 'ButtonTextSize');
    const icon = sizes.filter((m) => m.type === 'ButtonIconSize');
    expect(text).toHaveLength(1);
    expect(icon.length).toBeGreaterThan(0);
    expect(text[0].optional).toBe(true);
    expect(text[0].default).toBe("'md'");
    for (const m of icon) {
      expect(m.optional).toBe(false);
      expect(m.default).toBeUndefined();
    }
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
        '/** @internal */',
        "export { foo } from './x';",
        '',
      ].join('\n'),
    );
    writeFileSync(join(dir, 'x.ts'), '/** Documented, but re-exported as internal. */\nexport function foo(): void {}\n');
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

  it('leaves out a re-export tagged @internal on the export statement', () => {
    expect(Object.keys(fixture.entries)).toEqual(['FakeOptions', 'fakeHook']);
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

// ---------------------------------------------------------------------------------------------------------
// Review round 2 (PR #437)

describe('findLeaks: fires on each leak', () => {
  it('names the internal subpath, the inline import() type and the absolute path, one message each', () => {
    const root = '/build/machine/formrail';
    const synthetic = {
      entries: {
        X: {
          name: 'X',
          kind: 'type',
          description: 'See `@formrail/core/internal`.',
          definition: 'import("./x").Y',
          source: `${root}/packages/core/src/x.ts:1`,
        },
        Clean: { name: 'Clean', kind: 'type', description: 'Nothing to see.', definition: "'a'", source: 'packages/core/src/x.ts:2' },
      },
    };
    expect(findLeaks(synthetic, root)).toEqual([
      'X: mentions @formrail/core/internal',
      'X: has an inline import("...") type',
      'X: has an absolute path of this machine',
    ]);
  });
});

describe('defaultOf / presentDefault: a default shown is a value of the type', () => {
  it.each([
    ['Default true.', 'true'],
    ['Width. Default 100% of the container.', '100%'],
    ['Ratio. Default 1.5.', '1.5'],
    ['Milliseconds. Default 300.', '300'],
    ['Default ``a`b``.', 'a`b'],
  ])('%j -> %j', (text, expected) => {
    expect(defaultOf(text)).toBe(expected);
  });

  it.each(['Names of the parameters. Default `filter`, `q`, `sort`.', 'Announced. Default `1 item selected` / `${n} items selected`.', 'Default 1, 2.'])(
    'a composite default is not a value: %j',
    (text) => {
      expect(defaultOf(text)).toBeUndefined();
    },
  );

  it('prose: false reads only the @default tag (function members)', () => {
    expect(defaultOf('Count. Default `(n)`.', [], { prose: false })).toBeUndefined();
    expect(defaultOf('Count.', [{ name: 'default', text: [{ kind: 'text', text: '`(n) => String(n)`' }] }], { prose: false })).toBe('(n) => String(n)');
  });

  const literals = (...values) => ({ literals: values });
  it.each([
    ['vertical', literals("'vertical'", "'horizontal'"), "'vertical'"],
    ['"asc"', literals("'asc'", "'desc'"), "'asc'"],
    ["'asc'", literals("'asc'", "'desc'"), "'asc'"],
    ['yes', literals('false', 'true', 'undefined'), 'true'],
    ['no', literals('false', 'true'), 'false'],
    ['default', literals("'disabled'"), undefined],
    ['md', literals("'icon-sm'", "'icon-md'"), undefined],
    // A closed set takes only its own values, not an expression or a sibling's name.
    ['labels.size', literals("'sm'", "'md'"), undefined],
    ['searchLabel', literals("'sm'", "'md'"), undefined],
    ['3', literals('1', '2', '3'), '3'],
    ['Next month', { literals: ['undefined'], string: true }, "'Next month'"],
    ['100%', { literals: [], string: true, number: true }, "'100%'"],
    ['100', { literals: [], string: true, number: true }, '100'],
    ['300', { literals: [], string: true }, undefined],
    ['F8', { literals: ['null'], string: true }, "'F8'"],
    ['labels.error', { literals: [], string: true, other: true }, 'labels.error'],
    ['searchLabel', { literals: [], string: true }, 'searchLabel'],
    ['[]', { literals: [], other: true }, '[]'],
    ['yes', { literals: [], string: true }, undefined],
    ['plain', { literals: [], other: true }, undefined],
  ])('%j for %j -> %j', (raw, shape, expected) => {
    expect(presentDefault(raw, shape, { siblings: ['searchLabel'] })).toBe(expected);
  });

  it('the real reference: no yes/no, and the default of a closed type is one of its values', () => {
    const entries = reference.entries;
    /** The values of a type text that is a union of literals (through the aliases of the reference), else null. */
    const literalSet = (text, seen = new Set()) => {
      const out = [];
      for (const branch of text.split('|').map((b) => b.trim())) {
        if (/^'[^']*'$|^-?\d+(\.\d+)?$|^(true|false|null|undefined)$/.test(branch)) out.push(branch);
        else if (branch === 'boolean') out.push('true', 'false');
        else if (/^\w+$/.test(branch) && entries[branch]?.definition && !seen.has(branch)) {
          seen.add(branch);
          const inner = literalSet(entries[branch].definition, seen);
          if (!inner) return null;
          out.push(...inner);
        } else return null;
      }
      return out;
    };
    const wrong = [];
    let checked = 0;
    for (const entry of Object.values(entries)) {
      const groups = [entry.members ?? [], ...(entry.variants ?? []).map((v) => v.members), ...(entry.signatures ?? []).map((s) => s.parameters)];
      for (const member of groups.flat()) {
        if (member.default === undefined) continue;
        if (/^(yes|no)$/.test(member.default)) wrong.push(`${entry.name}.${member.name}: ${member.default}`);
        if (member.type === 'string' && !/^'.*'$/.test(member.default) && !/^[\w$.]+$/.test(member.default)) wrong.push(`${entry.name}.${member.name}: ${member.default}`);
        const values = literalSet(member.type);
        if (!values) continue;
        checked += 1;
        if (!values.includes(member.default)) wrong.push(`${entry.name}.${member.name}: ${member.default} is not one of ${values.join(' | ')}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(checked).toBeGreaterThan(20);
  });

  it('the cases of the review, on the real reference', () => {
    const member = (type, name) => reference.entries[type].members.find((m) => m.name === name);
    expect(member('SkeletonProps', 'width').default).toBe("'100%'");
    expect(member('UseListReportUrlStateOptions', 'params').default).toBeUndefined();
    expect(member('ListReportLabels', 'count').default).toBeUndefined();
    expect(member('VirtualListReportLabels', 'count').default).toBeUndefined();
    expect(member('MultiSelectLabels', 'selectedCount').default).toBeUndefined();
    expect(member('DatePickerLabels', 'chooseDateSelected').default).toBeUndefined();
    expect(member('ListReportColumn', 'searchable').default).toBe('true');
    expect(member('AccordionProps', 'orientation').default).toBe("'vertical'");
    expect(member('ListReportFilterBarProps', 'searchPlaceholder').default).toBe('searchLabel');
    // A value equal to the member's own name is a string, not an expression (review round 3).
    for (const name of ['added', 'removed', 'changed', 'from', 'to']) {
      expect(member('ChangeSummaryValueLabels', name).default, name).toBe(`'${name}'`);
    }
  });
});

/** The inline code spans of a paragraph by a regex (an independent reading of the CommonMark rule). */
function regexSpans(paragraph) {
  const pattern = /(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;
  const spans = [...paragraph.matchAll(pattern)].map((m) => m[0]);
  const rest = paragraph.replace(pattern, '').replace(/\\`/g, '');
  return { spans, stray: rest.includes('`') };
}

describe('inline code spans: multiple backticks, stray backticks (review round 2, point 4)', () => {
  it('joins a double-backtick span broken over lines', () => {
    expect(joinInlineCodeSpans('Text ``x`y\nz`` end.')).toBe('Text ``x`y z`` end.');
  });

  it('a run of a different length inside a span does not close it (CommonMark)', () => {
    expect(scanCodeSpans('`a``b`')).toEqual({ spans: [[0, 6]], unpaired: [] });
  });

  it('an escaped backtick opens no span; the guard names the one left unpaired', () => {
    const text = '\\`a` and `x`';
    expect(scanCodeSpans(text)).toEqual({ spans: [[3, 10]], unpaired: [11] });
    const problems = findMarkdownProblems({ entries: { T: { name: 'T', kind: 'type', description: '', members: [{ name: 'm', description: text }] } } });
    expect(problems).toEqual([expect.stringMatching(/^T\.m: unpaired backtick/)]);
  });

  it('a stray backtick pairs as CommonMark pairs it, and the guard names it', () => {
    const text = 'Stray ` tick, then `foo\nbar` end';
    // CommonMark: "` tick, then `" is the span, the last backtick is literal; nothing to join.
    expect(joinInlineCodeSpans(text)).toBe(text);
    const problems = findMarkdownProblems({ entries: { T: { name: 'T', kind: 'type', description: '', members: [{ name: 'm', description: text }] } } });
    expect(problems).toEqual([expect.stringMatching(/^T\.m: unpaired backtick/)]);
  });

  it('every generated text: no span broken over lines, no stray backtick (independent check, outside fences)', () => {
    const broken = [];
    for (const [entryName, entry] of Object.entries(reference.entries)) {
      for (const [path, text] of textsOf(entry)) {
        let fenced = false;
        const paragraphs = [[]];
        for (const line of text.split('\n')) {
          if (/^\s*(```|~~~)/.test(line)) {
            fenced = !fenced;
            paragraphs.push([]);
          } else if (!fenced) {
            if (line.trim() === '') paragraphs.push([]);
            else paragraphs.at(-1).push(line);
          }
        }
        for (const paragraph of paragraphs.map((lines) => lines.join('\n'))) {
          const { spans, stray } = regexSpans(paragraph);
          if (stray || spans.some((span) => span.includes('\n'))) broken.push(`${entryName}${path}`);
        }
      }
    }
    expect(broken).toEqual([]);
    expect(findMarkdownProblems(reference)).toEqual([]);
  });
});

describe('markdown guard: "<" outside code (review round 2, point 9)', () => {
  it('fails on a type or a tag outside backticks, naming type and member; not inside a span or a fence', () => {
    const entry = {
      name: 'T',
      kind: 'type',
      description: 'A `Map<string, Row>` is fine.\n\n```tsx\n<Button />\n```',
      members: [
        { name: 'rows', description: 'A Map<string, Row> of rows.' },
        { name: 'bold', description: 'A <b>bold</b> word.' },
      ],
    };
    expect(findMarkdownProblems({ entries: { T: entry } })).toEqual([
      expect.stringMatching(/^T\.rows: "<" outside a code span/),
      expect.stringMatching(/^T\.bold: "<" outside a code span/),
    ]);
  });
});

describe('MDX pages: unknown names fail early (review round 2, point 8)', () => {
  it('names the page and the name', () => {
    const source = '<TypeReference name="Nope" />\n<FunctionReference name="UseListReportOptions" />\n<TypeReference name="useListReport" />\n<TypeReference name="ListReportSort" />';
    expect(findUnknownReferences(reference, source, 'page.mdx')).toEqual([
      'page.mdx: <TypeReference name="Nope"> is not a public export of the packages in this build',
      'page.mdx: <FunctionReference name="UseListReportOptions"> is a type, use <TypeReference>',
      'page.mdx: <TypeReference name="useListReport"> is a function, use <FunctionReference>',
    ]);
  });

  it('every reference block of the .storybook pages names an entry of the right kind', () => {
    expect(findUnknownReferencesInPages(reference)).toEqual([]);
  });
});

describe('generator branches (review round 2, point 5)', () => {
  let root;
  let fixture;
  const indexFile = () => join(root, 'packages/core/src/index.ts');
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'type-reference-branches-'));
    mkdirSync(join(root, 'packages/core/src'), { recursive: true });
    mkdirSync(join(root, '.storybook'), { recursive: true });
    writeFileSync(join(root, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'Bundler', target: 'ES2022' } }));
    writeFileSync(
      indexFile(),
      [
        '/** Rows. */',
        'export interface RowList extends Array<string> {',
        '  /** Total. */',
        '  total: number;',
        '}',
        '/** Sized. */',
        'export interface Sized extends Array<string> {',
        '  /** Own length. */',
        '  length: number;',
        '}',
        '/** Flags. */',
        "export type Flags = { [K in 'a' | 'b']?: boolean };",
        '/** A choice. */',
        'export type Choice =',
        '  | { /** A. */ a: string; /** Never. */ n: never; /** Shared. */ shared?: number }',
        '  | { /** B. */ b: number; /** Optional. */ o?: string; /** Shared. */ shared?: number };',
        '/**',
        ' * Initializers.',
        ' * @param a - First.',
        ' * @param b - Second.',
        ' */',
        'export function withDefaults(a = 3, b?: string): void { void a; void b; }',
        '/**',
        ' * Labels.',
        ' * @param label - Text. Default `label`.',
        ' * @param placeholder - Placeholder. Default `label`.',
        ' */',
        'export function labelled(label?: string, placeholder?: string): void { void label; void placeholder; }',
        '/** Defaults. */',
        'export interface Defaults {',
        '  /** Way. Default `vertical`. */',
        "  way?: 'vertical' | 'horizontal';",
        '  /** Flag (default: yes). */',
        '  flag?: boolean;',
        '  /** Label. Default `Next month`. */',
        '  label?: string;',
        '  /** Count text. Default `(n)`. */',
        '  count?: (n: number) => string;',
        '  /**',
        '   * Format.',
        '   * @default `(n) => String(n)`',
        '   */',
        '  format?: (n: number) => string;',
        '  /** Names. Default `a`, `b`. */',
        '  names?: { a: string; b: string };',
        '  /** State. Default `default`. */',
        "  state?: 'disabled' | 'locked';",
        '}',
        '/** First overload. */',
        'export function over(a: string): void;',
        '/** Second overload. */',
        'export function over(a: number): void;',
        'export function over(a: unknown): void { void a; }',
        '',
      ].join('\n'),
    );
    fixture = generateReference({ root, entries: publicEntries(root, { pro: false }) }).reference;
  }, 60_000);
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('a type extending Array lists its own members only, an own member named like a library one included', () => {
    expect(fixture.entries.RowList.members.map((m) => m.name)).toEqual(['total']);
    expect(fixture.entries.Sized.members.map((m) => m.name)).toEqual(['length']);
  });

  it('an optional member with no type node (mapped type) has no "| undefined"', () => {
    expect(fixture.entries.Flags.members.map((m) => [m.name, m.type, m.optional])).toEqual([
      ['a', 'boolean', true],
      ['b', 'boolean', true],
    ]);
  });

  it('an anonymous branch is told apart by its required members (not optional ones, not never ones)', () => {
    expect(fixture.entries.Choice.variants.map((v) => [v.title, v.requires])).toEqual([
      ['Variant 1', ['a']],
      ['Variant 2', ['b']],
    ]);
  });

  it("a parameter's default equal to its own name is a string; equal to another parameter's name, an expression", () => {
    const [label, placeholder] = fixture.entries.labelled.signatures[0].parameters;
    expect(label).toMatchObject({ name: 'label', default: "'label'" });
    expect(placeholder).toMatchObject({ name: 'placeholder', default: 'label' });
  });

  it('a parameter with an initializer is optional and shows it as its default', () => {
    const [a, b] = fixture.entries.withDefaults.signatures[0].parameters;
    expect(a).toMatchObject({ name: 'a', optional: true, default: '3' });
    expect(b).toMatchObject({ name: 'b', optional: true });
    expect(b.default).toBeUndefined();
    expect(fixture.entries.withDefaults.signatures[0].signature).toBe('withDefaults(a?: number, b?: string): void');
  });

  it('defaults through the checker: literal, boolean, string, function, composite, foreign value', () => {
    const byName = Object.fromEntries(fixture.entries.Defaults.members.map((m) => [m.name, m.default]));
    expect(byName).toEqual({
      way: "'vertical'",
      flag: 'true',
      label: "'Next month'",
      count: undefined,
      format: '(n) => String(n)',
      names: undefined,
      state: undefined,
    });
  });

  it('the descriptions of two overloads are two paragraphs', () => {
    expect(fixture.entries.over.signatures).toHaveLength(2);
    expect(fixture.entries.over.description).toBe('First overload.\n\nSecond overload.');
  });

  it('a name exported by two packages throws', () => {
    const second = join(root, 'packages/core/src/again.ts');
    writeFileSync(second, "export type { RowList } from './index';\n");
    const entries = [
      { package: '@formrail/core', file: indexFile() },
      { package: '@formrail/pro', file: second },
    ];
    const program = createReferenceProgram(entries, { compilerOptions: referenceCompilerOptions(root) });
    expect(() => extractReference(program, entries, { root })).toThrow('type-reference: RowList is exported by both @formrail/core and @formrail/pro');
  });

  it('the plugin fails the build on an MDX page with an unknown name, naming page and name', () => {
    const plugin = typeReferencePlugin({ env: { STORYBOOK_EXCLUDE_PRO: '1' }, root });
    const bad = join(root, '.storybook/Bad.mdx');
    const good = join(root, '.storybook/Good.mdx');
    writeFileSync(bad, '<TypeReference name="Nope" />\n');
    writeFileSync(good, '<TypeReference name="RowList" />\n<FunctionReference name="over" />\n');
    expect(() => plugin.transform.call({}, 'compiled', bad)).toThrow('.storybook/Bad.mdx: <TypeReference name="Nope"> is not a public export');
    expect(plugin.transform.call({}, 'compiled', good)).toBeNull();
    expect(plugin.transform.call({}, 'compiled', indexFile())).toBeNull();
  }, 60_000);

  it('dev server: a package source change regenerates the module, any other file does not', () => {
    const plugin = typeReferencePlugin({ env: { STORYBOOK_EXCLUDE_PRO: '1' }, root });
    const id = plugin.resolveId('virtual:formrail/type-reference');
    const first = plugin.load.call({}, id);
    expect(first).toContain('Total.');
    const mod = { id };
    const invalidated = [];
    const server = { moduleGraph: { getModuleById: (x) => (x === id ? mod : undefined), invalidateModule: (m) => invalidated.push(m) } };
    for (const file of [join(root, 'README.md'), join(root, 'packages/core/src/index.stories.tsx'), join(root, '.storybook/Good.mdx')]) {
      expect(plugin.handleHotUpdate({ file, server, modules: [] }), file).toBeUndefined();
    }
    expect(invalidated).toEqual([]);
    expect(plugin.load.call({}, id)).toBe(first);
    const source = readFileSync(indexFile(), 'utf8');
    writeFileSync(indexFile(), source.replace('/** Total. */', '/** Total rows. */'));
    const later = new Date(Date.now() + 5_000);
    utimesSync(indexFile(), later, later);
    expect(plugin.handleHotUpdate({ file: indexFile(), server, modules: [] })).toEqual([mod]);
    expect(invalidated).toEqual([mod]);
    const second = plugin.load.call({}, id);
    expect(second).toContain('Total rows.');
    writeFileSync(indexFile(), source);
  }, 60_000);

  it('the caching host hands back the same parsed file until its modification time changes', () => {
    const options = referenceCompilerOptions(root);
    const host = createCachingHost(options);
    const entries = publicEntries(root, { pro: false });
    const one = createReferenceProgram(entries, { compilerOptions: options, host });
    const lib = one.getSourceFiles().find((f) => one.isSourceFileDefaultLibrary(f));
    const before = one.getSourceFile(indexFile());
    const later = new Date(Date.now() + 10_000);
    utimesSync(indexFile(), later, later);
    const two = createReferenceProgram(entries, { compilerOptions: options, host, oldProgram: one });
    expect(two.getSourceFile(lib.fileName)).toBe(lib);
    expect(two.getSourceFile(indexFile())).not.toBe(before);
  }, 60_000);
});
