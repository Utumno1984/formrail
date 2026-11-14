import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion/Accordion';
import { DescriptionList, DescriptionListItem } from './description-list/DescriptionList';
import { Field } from './field/Field';
import { Input } from './input/Input';
import { makeDemoInvoices, type DemoInvoice } from './internal/demo-invoices';
import { ListReport } from './list-report/ListReport';
import { ListReportFilterBar } from './list-report/ListReportFilterBar';
import { ListReportTable } from './list-report/ListReportTable';
import type { ListReportColumn } from './list-report/types';
import { useListReport } from './list-report/use-list-report';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu/Menu';
import { MessageStrip } from './message-strip/MessageStrip';
import { MultiSelect } from './multi-select/MultiSelect';
import { NumberInput } from './number-input/NumberInput';
import { ObjectPage } from './object-page/ObjectPage';
import { ObjectPageFooter } from './object-page/ObjectPageFooter';
import { Pagination } from './pagination/Pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs/Tabs';

// The props whose `@default` the guard (`scripts/default-column-measure.mjs`, `UNCOMPARABLE_ALLOWLIST`)
// cannot compare with a literal in the source: Radix defaults, derived or computed values. For each of
// them this test READS the `@default` tag from the TSDoc and compares it with what the component really
// does when the prop is omitted. Change the tag or the behaviour and one of them fails (#475, round 2).

const SRC = import.meta.dirname;
const ALLOWLIST_SOURCE = readFileSync(join(SRC, '../../../scripts/default-column-measure.mjs'), 'utf8');

/** The `Component.prop` keys of `UNCOMPARABLE_ALLOWLIST`, read from the script. */
export function allowlistKeys(source: string): string[] {
  const block = /export const UNCOMPARABLE_ALLOWLIST = \{([\s\S]*?)\n\};/.exec(source)?.[1] ?? '';
  return [...block.matchAll(/^\s+'([A-Za-z]+\.[A-Za-z]+)':/gm)].map((m) => m[1] ?? '');
}

/**
 * The block of `owner` (an `interface` or `type` declared at the start of a line): from its declaration
 * to the next top-level declaration. Throws when the file has no such declaration.
 */
function declarationOf(source: string, owner: string): string {
  const start = new RegExp(`^(?:export )?(?:interface|type) ${owner}\\b`, 'm').exec(source);
  if (!start) throw new Error(`no interface or type named ${owner}`);
  const rest = source.slice(start.index + start[0].length);
  const next = /^(?:export |declare )?(?:interface|type|const|function|class|enum)\b/m.exec(rest);
  return source.slice(start.index, start.index + start[0].length + (next ? next.index : rest.length));
}

/**
 * The `@default` of `prop` in the TSDoc of `file` (the `nth` documented one), as written. With `owner`,
 * only the declaration of that interface / type is read, so two props of the same name in one file
 * (`Foo.size`, `Bar.size`) are not confused.
 */
export function readDefaultTag(source: string, prop: string, nth = 0, owner?: string): string | undefined {
  const re = new RegExp(`/\\*\\*((?:(?!\\*/)[\\s\\S])*?)\\*/\\s*${prop}\\??:`, 'g');
  const tags = [...(owner === undefined ? source : declarationOf(source, owner)).matchAll(re)].flatMap((m) => {
    const tag = /@default\s+([^\n]*?)\s*(?:\n|$)/.exec((m[1] ?? '').replace(/\n\s*\* ?/g, '\n'));
    return tag ? [tag[1] ?? ''] : [];
  });
  return tags[nth];
}

/** `'x'` -> `x`, `3` -> 3, `false` -> false, `[]` -> []. */
export function literal(tag: string): unknown {
  if (/^'.*'$/.test(tag)) return tag.slice(1, -1);
  if (tag === 'true' || tag === 'false') return tag === 'true';
  if (tag === '[]') return [];
  if (/^-?\d+(\.\d+)?$/.test(tag)) return Number(tag);
  throw new Error(`not a literal tag: ${tag}`);
}

/** Text between backticks (a tag written as a code span). */
const code = (tag: string) => /^`(.*)`$/.exec(tag)?.[1] ?? tag;

/** The value of a Radix default (`prop = value,` in the dist of the package), through its enum when it names one. */
function radixDefault(pkg: string, prop: string): string {
  const dist = readFileSync(join(SRC, `../../../node_modules/@radix-ui/${pkg}/dist/index.mjs`), 'utf8');
  const raw = new RegExp(`\\b${prop} = ([^,\\n]+),`).exec(dist)?.[1]?.trim();
  if (raw === undefined) throw new Error(`no default of ${prop} in ${pkg}`);
  const member = /^[A-Za-z]+\.([A-Za-z]+)$/.exec(raw)?.[1];
  if (member === undefined) return raw;
  const value = new RegExp(`\\b${member}: ("[^"]*")`).exec(dist)?.[1];
  if (value === undefined) throw new Error(`no value of ${raw} in ${pkg}`);
  return value;
}
const radixLiteral = (pkg: string, prop: string): unknown => JSON.parse(radixDefault(pkg, prop));

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const COLUMNS: ListReportColumn<DemoInvoice>[] = [
  { id: 'number', header: 'Number', accessor: (r) => r.number },
  { id: 'supplier', header: 'Supplier', accessor: (r) => r.supplier },
];
const ROWS = makeDemoInvoices(6);
const rowActions = (row: DemoInvoice) => [{ id: 'open', label: 'Open', icon: <svg data-testid="icon" />, onSelect: () => undefined }, { id: 'copy', label: `Copy ${row.number}`, onSelect: () => undefined }];

function Table({ status, labels, rowActionsInline }: { status?: 'error'; labels?: { error: string }; rowActionsInline?: number }) {
  const table = useListReport<DemoInvoice>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
  return <ListReportTable table={table} aria-label="Invoices" rowActions={rowActions} status={status} labels={labels} rowActionsInline={rowActionsInline} />;
}
function Report({ rowActionsInline }: { rowActionsInline?: number }) {
  const table = useListReport<DemoInvoice>({
    rows: ROWS,
    columns: COLUMNS,
    getRowId: (r) => r.id,
    searchCommitDelay: null,
  });
  return <ListReport table={table} title="Invoices" rowActions={rowActions} rowActionsInline={rowActionsInline} />;
}

/** The inline-actions count the table really uses (the CSS variable is set only above 0). */
const inlineCount = (container: HTMLElement) => Number((container.querySelector('table') as HTMLElement).style.getPropertyValue('--rop-list-report-row-actions-inline') || 0);

interface Probe {
  /** The file (relative to `src`) where the TSDoc of the prop is. The Virtual* components of Pro inherit it from here. */
  file: string;
  prop: string;
  /** With several documented declarations of `prop` in the file. */
  nth?: number;
  /** The interface / type that declares the prop: only its block is read (two props of one name in a file stay apart). */
  owner?: string;
  /** Throws (`expect`) when the omitted prop does not behave like the tag says. */
  check: (tag: string) => void | Promise<void>;
}

const tones = ['info', 'success', 'warning', 'error'] as const;

async function menuItem(props: { disabled?: boolean }) {
  const user = userEvent.setup();
  render(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuContent>
        <MenuItem {...props}>Rename</MenuItem>
      </MenuContent>
    </Menu>,
  );
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  return await screen.findByRole('menuitem', { name: 'Rename' });
}

const PROBES: Record<string, Probe> = {
  'Accordion.headingLevel': {
    file: 'accordion/Accordion.tsx',
    prop: 'headingLevel',
    check: (tag) => {
      render(
        <Accordion type="single">
          <AccordionItem value="a">
            <AccordionTrigger>First</AccordionTrigger>
            <AccordionContent>Body</AccordionContent>
          </AccordionItem>
        </Accordion>,
      );
      expect(Number(screen.getByRole('heading').tagName.slice(1))).toBe(literal(tag));
    },
  },
  'Accordion.orientation': {
    file: 'accordion/Accordion.tsx',
    prop: 'orientation',
    check: async (tag) => {
      const user = userEvent.setup();
      render(
        <Accordion type="single">
          {['a', 'b'].map((v) => (
            <AccordionItem key={v} value={v}>
              <AccordionTrigger>Item {v}</AccordionTrigger>
              <AccordionContent>Body</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>,
      );
      screen.getByRole('button', { name: 'Item a' }).focus();
      await user.keyboard('{ArrowDown}');
      const observed = screen.getByRole('button', { name: 'Item b' }) === document.activeElement ? 'vertical' : 'horizontal';
      expect(observed).toBe(literal(tag));
    },
  },
  'DescriptionListItem.variant': {
    file: 'description-list/DescriptionList.tsx',
    prop: 'variant',
    check: (tag) => {
      const html = (variant?: 'default' | 'summary') => {
        const { container, unmount } = render(
          <DescriptionList>
            <DescriptionListItem label="Total" variant={variant}>
              120
            </DescriptionListItem>
          </DescriptionList>,
        );
        const out = container.innerHTML.replace(/_r_\d+_/g, '_r_');
        unmount();
        return out;
      };
      const omitted = html();
      expect(omitted).toBe(html(literal(tag) as 'default'));
      expect(omitted).not.toBe(html(literal(tag) === 'default' ? 'summary' : 'default'));
    },
  },
  'Field.required': {
    file: 'field/Field.tsx',
    prop: 'required',
    check: (tag) => {
      const html = (required?: boolean) => {
        const { container, unmount } = render(
          <Field label="Name" required={required}>
            <Input />
          </Field>,
        );
        const out = container.innerHTML.replace(/_r_\d+_/g, '_r_');
        unmount();
        return out;
      };
      const omitted = html();
      expect(omitted).toBe(html(literal(tag) as boolean));
      expect(omitted).not.toBe(html(!literal(tag)));
    },
  },
  'ListReport.onClearFilters': {
    file: 'list-report/ListReportFrame.tsx',
    prop: 'onClearFilters',
    check: async (tag) => {
      // "`table.clearFilters()` and focus on the search box": both are observed.
      expect(tag).toBe('`table.clearFilters()` and focus on the search box');
      const user = userEvent.setup();
      render(<Report />);
      const box = screen.getByRole('searchbox', { name: 'Search' });
      await user.type(box, 'zzz-no-match{Enter}');
      await user.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(box).toHaveValue('');
      expect(box).toHaveFocus();
    },
  },
  'ListReport.rowActionsInline': {
    file: 'list-report/ListReportFrame.tsx',
    prop: 'rowActionsInline',
    check: (tag) => {
      const { container, rerender } = render(<Report />);
      const omitted = container.innerHTML;
      expect(inlineCount(container)).toBe(literal(tag));
      rerender(<Report rowActionsInline={literal(tag) as number} />);
      expect(container.innerHTML).toBe(omitted);
      rerender(<Report rowActionsInline={(literal(tag) as number) + 1} />);
      expect(container.innerHTML).not.toBe(omitted);
    },
  },
  'ListReportFilterBar.searchPlaceholder': {
    file: 'list-report/ListReportFilterBar.tsx',
    prop: 'searchPlaceholder',
    check: (tag) => {
      // "`searchLabel`": the placeholder is the value of the prop named in the tag.
      expect(code(tag)).toBe('searchLabel');
      function Bar() {
        const table = useListReport<DemoInvoice>({ rows: ROWS, columns: COLUMNS, getRowId: (r) => r.id });
        return <ListReportFilterBar table={table} searchLabel="Find invoices" />;
      }
      render(<Bar />);
      expect(screen.getByRole('searchbox', { name: 'Find invoices' })).toHaveAttribute('placeholder', 'Find invoices');
    },
  },
  'ListReportTable.errorMessage': {
    file: 'list-report/ListReportTableShell.tsx',
    prop: 'errorMessage',
    check: (tag) => {
      // "`labels.error`": the message is the `error` label.
      expect(code(tag)).toBe('labels.error');
      render(<Table status="error" labels={{ error: 'The server did not answer' }} />);
      expect(within(screen.getByRole('table')).getByText('The server did not answer')).toBeVisible();
    },
  },
  'ListReportTable.rowActionsInline': {
    file: 'list-report/ListReportTableShell.tsx',
    prop: 'rowActionsInline',
    check: (tag) => {
      const { container, rerender } = render(<Table />);
      const omitted = container.innerHTML;
      expect(inlineCount(container)).toBe(literal(tag));
      rerender(<Table rowActionsInline={literal(tag) as number} />);
      expect(container.innerHTML).toBe(omitted);
      rerender(<Table rowActionsInline={(literal(tag) as number) + 1} />);
      expect(container.innerHTML).not.toBe(omitted);
    },
  },
  'MenuContent.alignOffset': { file: 'menu/Menu.tsx', prop: 'alignOffset', check: (tag) => expect(literal(tag)).toBe(radixLiteral('react-popper', 'alignOffset')) },
  'MenuContent.arrowPadding': { file: 'menu/Menu.tsx', prop: 'arrowPadding', check: (tag) => expect(literal(tag)).toBe(radixLiteral('react-popper', 'arrowPadding')) },
  'MenuContent.avoidCollisions': { file: 'menu/Menu.tsx', prop: 'avoidCollisions', check: (tag) => expect(literal(tag)).toBe(radixLiteral('react-popper', 'avoidCollisions')) },
  'MenuContent.hideWhenDetached': { file: 'menu/Menu.tsx', prop: 'hideWhenDetached', check: (tag) => expect(literal(tag)).toBe(radixLiteral('react-popper', 'hideWhenDetached')) },
  'MenuContent.sticky': { file: 'menu/Menu.tsx', prop: 'sticky', check: (tag) => expect(literal(tag)).toBe(radixLiteral('react-popper', 'sticky')) },
  'MenuContent.updatePositionStrategy': { file: 'menu/Menu.tsx', prop: 'updatePositionStrategy', check: (tag) => expect(literal(tag)).toBe(radixLiteral('react-popper', 'updatePositionStrategy')) },
  'MenuItem.disabled': {
    file: 'menu/Menu.tsx',
    prop: 'disabled',
    check: async (tag) => {
      const item = await menuItem({});
      expect(item.hasAttribute('data-disabled')).toBe(literal(tag));
      expect(item.getAttribute('aria-disabled') === 'true').toBe(literal(tag));
    },
  },
  'MessageStrip.dismissLabel': {
    file: 'message-strip/MessageStrip.tsx',
    prop: 'dismissLabel',
    check: (tag) => {
      // "`Dismiss message: <title>`".
      render(
        <MessageStrip title="Saved" onDismiss={() => undefined}>
          x
        </MessageStrip>,
      );
      expect(screen.getByRole('button')).toHaveAccessibleName(code(tag).replace('<title>', 'Saved'));
    },
  },
  'MessageStrip.toneLabel': {
    file: 'message-strip/MessageStrip.tsx',
    prop: 'toneLabel',
    check: (tag) => {
      const observed = tones.map((tone) => {
        const { container, unmount } = render(<MessageStrip tone={tone}>x</MessageStrip>);
        const label = (container.querySelector('.sr-only')?.textContent ?? '').replace(/: $/, '');
        unmount();
        return label;
      });
      expect(tag.split(' / ').map((t) => literal(t))).toEqual(observed);
    },
  },
  'MultiSelect.defaultValue': {
    file: 'multi-select/MultiSelect.tsx',
    prop: 'defaultValue',
    check: async (tag) => {
      const user = userEvent.setup();
      render(<MultiSelect aria-label="Cost centers" options={[{ value: 'adm', label: 'Administration' }, { value: 'mkt', label: 'Marketing' }]} />);
      await user.click(screen.getByRole('combobox'));
      const selected = within(screen.getByRole('listbox')).getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true');
      expect(selected.map((o) => o.textContent)).toEqual(literal(tag));
    },
  },
  'NumberInput.step': {
    file: 'number-input/NumberInput.tsx',
    prop: 'step',
    check: (tag) => {
      render(<NumberInput aria-label="Quantity" defaultValue={5} />);
      const input = screen.getByRole('spinbutton');
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(Number((input as HTMLInputElement).value)).toBe(5 + (literal(tag) as number));
    },
  },
  'ObjectPageFooter.toneLabel': {
    file: 'object-page/ObjectPageFooter.tsx',
    prop: 'toneLabel',
    check: (tag) => {
      const observed = (['error', 'success', 'info'] as const).map((tone) => {
        const { unmount } = render(
          <ObjectPage>
            <ObjectPageFooter visible message="m" messageTone={tone} />
          </ObjectPage>,
        );
        const label = /^(.*): m$/.exec(screen.getByRole('status').textContent ?? '')?.[1] ?? '';
        unmount();
        return label;
      });
      expect(tag.split(' / ').map((t) => literal(t))).toEqual(observed);
    },
  },
  'Pagination.boundaryCount': { file: 'pagination/Pagination.tsx', prop: 'boundaryCount', nth: 0, owner: 'PaginationProps', check: (tag) => paginationDefault('boundaryCount', tag) },
  'Pagination.siblingCount': { file: 'pagination/Pagination.tsx', prop: 'siblingCount', nth: 0, owner: 'PaginationProps', check: (tag) => paginationDefault('siblingCount', tag) },
  'Tabs.activationMode': {
    file: 'tabs/Tabs.tsx',
    prop: 'activationMode',
    check: async (tag) => {
      const user = userEvent.setup();
      render(
        <Tabs defaultValue="a">
          <TabsList aria-label="Sections">
            {['a', 'b'].map((t) => (
              <TabsTrigger key={t} value={t}>
                Tab {t}
              </TabsTrigger>
            ))}
          </TabsList>
          {['a', 'b'].map((t) => (
            <TabsContent key={t} value={t}>
              Panel {t}
            </TabsContent>
          ))}
        </Tabs>,
      );
      await user.click(screen.getByRole('tab', { name: 'Tab a' }));
      await user.keyboard('{ArrowRight}');
      // `automatic`: the arrow selects the tab it moves to. `manual`: only the focus moves.
      await waitFor(() => expect(screen.getByRole('tab', { name: 'Tab b' })).toHaveFocus());
      const observed = screen.getByRole('tab', { name: 'Tab b' }).getAttribute('aria-selected') === 'true' ? 'automatic' : 'manual';
      expect(observed).toBe(literal(tag));
    },
  },
};

function paginationDefault(prop: 'boundaryCount' | 'siblingCount', tag: string) {
  const names = (props: object) => {
    const { unmount } = render(<Pagination page={60} pageCount={120} {...props} />);
    const out = within(screen.getByRole('navigation'))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    unmount();
    return out;
  };
  const value = literal(tag) as number;
  const omitted = names({});
  expect(omitted).toEqual(names({ [prop]: value }));
  expect(omitted).not.toEqual(names({ [prop]: value + 1 }));
}

/** Documented in the allowlist, but with no `@default` (a function reference): nothing to compare. */
const NO_TAG = new Set(['ProgressBar.getValueLabel']);
/** The Pro components inherit the TSDoc of the core prop (`Omit<...>` of the core props): same tag, same probe. */
const VIRTUAL: Record<string, string> = {
  'VirtualListReport.onClearFilters': 'ListReport.onClearFilters',
  'VirtualListReport.rowActionsInline': 'ListReport.rowActionsInline',
  'VirtualListReportTable.errorMessage': 'ListReportTable.errorMessage',
  'VirtualListReportTable.rowActionsInline': 'ListReportTable.rowActionsInline',
};

describe('@default of the props the guard cannot compare with the source: the tag is read and checked against the behaviour', () => {
  const keys = allowlistKeys(ALLOWLIST_SOURCE);

  it('has a probe for every entry of the UNCOMPARABLE_ALLOWLIST, and nothing else', () => {
    expect(keys).toHaveLength(29);
    expect([...keys].sort()).toEqual([...Object.keys(PROBES), ...NO_TAG, ...Object.keys(VIRTUAL)].sort());
  });

  it('the entries with no tag really have none', () => {
    const progress = readFileSync(join(SRC, 'progress-bar/ProgressBar.tsx'), 'utf8');
    expect(readDefaultTag(progress, 'getValueLabel')).toBeUndefined();
  });

  it.each(Object.entries(VIRTUAL))('%s inherits the TSDoc of %s (the Pro props are built on the core ones)', (id, coreId) => {
    expect(PROBES[coreId]).toBeDefined();
    const [component, prop] = id.split('.') as [string, string];
    const pro = readFileSync(join(SRC, '../../pro/src/list-report', `${component}.tsx`), 'utf8');
    // No declaration of its own: a TSDoc of its own would need its own probe.
    expect(readDefaultTag(pro, prop)).toBeUndefined();
    expect(pro).toMatch(component === 'VirtualListReport' ? /Omit<ListReportFrameProps<Row>/ : /= ListReportTableProps<Row> &/);
  });

  it.each(Object.entries(PROBES))('%s: the @default of the TSDoc matches what the component does without the prop', async (_id, probe) => {
    const tag = readDefaultTag(readFileSync(join(SRC, probe.file), 'utf8'), probe.prop, probe.nth, probe.owner);
    expect(tag, `no @default tag for ${probe.prop} in ${probe.file}`).toBeDefined();
    await probe.check(tag ?? '');
  });

  it('the readers: a tag in a code span, in a one-line TSDoc and in the second declaration', () => {
    const src = ['/**', ' * First.', " * @default 'a'", ' */', 'one?: string;', '/** Second. */', 'two?: string;', '/**', ' * Third.', ' * @default `x`', ' */', 'one?: string;'].join('\n');
    expect(readDefaultTag(src, 'one')).toBe("'a'");
    expect(readDefaultTag(src, 'one', 1)).toBe('`x`');
    expect(readDefaultTag(src, 'two')).toBeUndefined();
    // Anchored to the declaration: the same prop name in two interfaces of one file is not confused.
    const two = ['interface A {', '  /**', "   * @default 'a'", '   */', '  size?: string;', '}', '', 'export interface B {', '  /**', "   * @default 'b'", '   */', '  size?: string;', '}'].join('\n');
    expect(readDefaultTag(two, 'size')).toBe("'a'");
    expect(readDefaultTag(two, 'size', 0, 'A')).toBe("'a'");
    expect(readDefaultTag(two, 'size', 0, 'B')).toBe("'b'");
    expect(() => readDefaultTag(two, 'size', 0, 'C')).toThrow(/no interface or type named C/);
    expect(literal("'a'")).toBe('a');
    expect(literal('0')).toBe(0);
    expect(literal('[]')).toEqual([]);
    expect(() => literal('`x`')).toThrow();
  });
});
