import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { checkLabelDefaults, readLabelRows, REPO_ROOT, type LabelException, type LabelExample, type LabelRow, type LabelSource } from '../test/label-defaults';
import { DEFAULT_LABELS as APP_LAUNCHER_DEFAULT_LABELS } from './app-shell/AppLauncher';
import { DEFAULT_LABELS as APP_SWITCHER_DEFAULT_LABELS } from './app-shell/AppSwitcher';
import { DEFAULT_LABELS as CALENDAR_DEFAULT_LABELS } from './calendar/Calendar';
import { DEFAULT_LABELS as DATE_PICKER_DEFAULT_LABELS } from './date-picker/DatePicker';
import { DEFAULT_LABELS as FILE_UPLOAD_DEFAULT_LABELS } from './file-upload/FileUpload';
import { ListReport } from './list-report/ListReport';
import { DEFAULT_LABELS as TABLE_DEFAULT_LABELS } from './list-report/ListReportTableStates';
import type { ListReportColumn } from './list-report/types';
import { ListReportFrame } from './list-report/ListReportFrame';
import { ListReportTableShell } from './list-report/ListReportTableShell';
import { useListReport } from './list-report/use-list-report';
import { DEFAULT_LABELS as MULTI_SELECT_DEFAULT_LABELS } from './multi-select/MultiSelect';
import { DEFAULT_LABELS as NUMBER_INPUT_DEFAULT_LABELS, NumberInput } from './number-input/NumberInput';
import { useDirtyGuard } from './object-page/use-dirty-guard';
import { DEFAULT_LABELS as PAGINATION_DEFAULT_LABELS, Pagination } from './pagination/Pagination';
import { DEFAULT_DISMISS_LABEL, TONE_LABEL } from './toast/ToastProvider';

// #540: the default of a label key is written in the prose of the key ("Default `Previous page`."), the only
// place the Docs readers can see it (the props table shows `labels` as one row, with no Default column). A prose
// that drifted from the code would publish a wrong default, and the guard of `scripts/default-column-measure.mjs`
// checks only that a default is stated, not that it is true. Here the text of each key is READ from the source and
// compared with what the component renders when the key is omitted.

afterEach(cleanup);

const SRC = import.meta.dirname;
const read = (file: string) => readFileSync(join(SRC, file), 'utf8');

/** The value stated by "Default `x`" / "Default \"x\"" in the TSDoc of `key` (the first documented one), as written. */
export function proseDefault(source: string, key: string): string | undefined {
  const doc = new RegExp(`/\\*\\*((?:(?!\\*/)[\\s\\S])*?)\\*/\\s*${key}\\??:`, 'g');
  for (const m of source.matchAll(doc)) {
    const text = (m[1] ?? '').replace(/\n\s*\*\s?/g, ' ');
    const value = /Default\s+(?:`([^`]+)`|"([^"]+)")/.exec(text);
    if (value) return value[1] ?? value[2];
  }
  return undefined;
}

describe('proseDefault (the reader of this test)', () => {
  it('reads backticks and quotes, only on the key asked for, and says nothing without a default', () => {
    const src = '/** One. Default `A b`. */\n  one: string;\n  /** Two. Default "C". */\n  two?: string;\n  /** Three. */\n  three: string;';
    expect(proseDefault(src, 'one')).toBe('A b');
    expect(proseDefault(src, 'two')).toBe('C');
    expect(proseDefault(src, 'three')).toBeUndefined();
  });
});

describe('the documented default of a label is what the component does without it (#540)', () => {
  it('PaginationLabels: navigation, previous, next and page', () => {
    const source = read('pagination/Pagination.tsx');
    render(<Pagination page={2} pageCount={5} />);
    expect(screen.getByRole('navigation', { name: proseDefault(source, 'navigation') })).toBeTruthy();
    expect(screen.getByRole('button', { name: proseDefault(source, 'previous') })).toBeTruthy();
    expect(screen.getByRole('button', { name: proseDefault(source, 'next') })).toBeTruthy();
    // The function key: "Default `Page ${page}`" with the number put in.
    const page = proseDefault(source, 'page');
    expect(page).toBe('Page ${page}');
    expect(screen.getByRole('button', { name: page?.replace('${page}', '3') })).toBeTruthy();
  });

  it('NumberInputLabels: increment and decrement', () => {
    const source = read('number-input/NumberInput.tsx');
    render(<NumberInput aria-label="Quantity" />);
    expect(screen.getByRole('button', { name: proseDefault(source, 'increment') })).toBeTruthy();
    expect(screen.getByRole('button', { name: proseDefault(source, 'decrement') })).toBeTruthy();
  });

  it('ListReportTableLabels: every text key equals the default of the code (not only the ones rendered by a test)', () => {
    const source = read('list-report/ListReportTableStates.tsx');
    const strings = Object.entries(TABLE_DEFAULT_LABELS).filter(([, v]) => typeof v === 'string') as [string, string][];
    expect(strings.map(([k]) => k).sort()).toEqual(['clearFilters', 'empty', 'error', 'loading', 'noResults', 'retry', 'rowActionsColumn', 'selectAllResults']);
    for (const [key, value] of strings) expect(proseDefault(source, key), key).toBe(value);
    // The function keys state what they return, with a placeholder for the argument.
    expect(proseDefault(source, 'selectRow')).toBe('Select <row label>');
    expect(TABLE_DEFAULT_LABELS.selectRow('<row label>')).toBe('Select <row label>');
    expect(proseDefault(source, 'rowActions')).toBe('Actions for <row label>');
    expect(TABLE_DEFAULT_LABELS.rowActions('<row label>')).toBe('Actions for <row label>');
    expect(proseDefault(source, 'rowAction')).toBe('<action label> <row label>');
    expect(TABLE_DEFAULT_LABELS.rowAction('<action label>', '<row label>')).toBe('<action label> <row label>');
  });

  it('ListReportFrameLabels: clearSelection and selectionBar', () => {
    interface Row {
      id: string;
      n: string;
    }
    const columns: ListReportColumn<Row>[] = [{ id: 'n', header: 'Number', accessor: (r) => r.n }];
    function Host() {
      const table = useListReport<Row>({
        rows: [{ id: 'a', n: 'INV-1' }],
        columns,
        getRowId: (r) => r.id,
        searchCommitDelay: null,
        selectable: true,
        defaultSelectedIds: new Set(['a']),
      });
      return <ListReport table={table} title="Invoices" />;
    }
    const source = read('list-report/ListReportFrame.tsx');
    render(<Host />);
    expect(screen.getByRole('group', { name: `${proseDefault(source, 'selectionBar')} Invoices` })).toBeTruthy();
    expect(screen.getByText(proseDefault(source, 'clearSelection') ?? 'missing').closest('button')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// #549: the same check for EVERY key the guard reads in packages/core, generic (see `test/label-defaults.ts`). The
// keys and their prose come from `measureLabels`; below, one source per interface says where the real value is.
// A new key or interface without a source fails `checkLabelDefaults` ("no source of the real value"), so does a
// function key whose prose is an example without the arguments of that example. The Pro keys are checked by
// `packages/pro/src/label-defaults.test.tsx`, with the same module: nothing here imports from packages/pro.

const REGISTRY = 'packages/core/src/label-defaults.test.tsx';
const inCore = (r: LabelRow) => r.file.startsWith('packages/core/');
const inPro = (r: LabelRow) => r.file.startsWith('packages/pro/');

/** Read once, at collection: the guard's TypeScript program takes a few seconds. */
const ROWS = readLabelRows();

/** Keys that cannot be verified, each with the reason. Empty: every key of the core has a source. */
const LABEL_EXCEPTIONS: readonly LabelException[] = [];

/** The accessible name testing-library computes for `element` (its `name` matcher receives it). */
function accessibleName(element: HTMLElement, role: string): string {
  let name: string | undefined;
  within(document.body).getAllByRole(role, {
    hidden: true,
    name: (computed, node) => {
      if (node === element) name = computed;
      return node === element;
    },
  });
  if (name === undefined) throw new Error(`no ${role} element to name`);
  return name;
}

/** The text of `el`, or an error naming what was not found (a rendering that changed shape fails loudly). */
function textOf(el: Element | null | undefined, what: string): string {
  if (!el?.textContent) throw new Error(`rendering: no ${what}`);
  return el.textContent;
}

/**
 * The texts of `ListReportFrame` (the floorplan of `ListReport` and of Pro's `VirtualListReport`, here with no
 * table) in one state: `rowCount` rows, the first `selectedCount` selected, a committed search that keeps the first
 * `resultCount` rows (all of them by default), `en-US`.
 */
function frameState({ rowCount, selectedCount = 0, resultCount = rowCount }: { rowCount: number; selectedCount?: number; resultCount?: number }) {
  interface Row {
    id: string;
    n: string;
  }
  const rows: Row[] = Array.from({ length: rowCount }, (_, i) => ({ id: `r${i}`, n: `${i < resultCount ? 'keep' : 'drop'} INV-${i}` }));
  const columns: ListReportColumn<Row>[] = [{ id: 'n', header: 'Number', accessor: (r) => r.n }];
  function Host() {
    const table = useListReport<Row>({
      rows,
      columns,
      getRowId: (r) => r.id,
      searchCommitDelay: null,
      defaultSearchQuery: resultCount < rowCount ? 'keep' : '',
      selectable: true,
      defaultSelectedIds: new Set(rows.slice(0, selectedCount).map((r) => r.id)),
      locale: 'en-US',
    });
    return <ListReportFrame table={table} title="Invoices" renderTable={() => null} />;
  }
  const { container, unmount } = render(<Host />);
  const group = screen.getByRole('group');
  const [barNameId] = (group.getAttribute('aria-labelledby') ?? '').split(' ');
  const values = {
    count: textOf(container.querySelector('[data-rop-count]'), 'count of ListReportFrame'),
    selectionCount: textOf(group.querySelector('[data-rop-selection-count]'), 'selection count of ListReportFrame'),
    selectionBar: textOf(barNameId ? document.getElementById(barNameId) : null, 'name of the selection bar of ListReportFrame'),
    clearSelection: textOf(within(group).getByRole('button', { hidden: true }), '"clear selection" button of ListReportFrame'),
  };
  unmount();
  return values;
}

/**
 * `ListReportFrameLabels`: its defaults are not in a constant (the count and the selection text format their
 * numbers in the locale of `useListReport`), so they are read from renderings, one per value the prose lists:
 * `(n)` and `(n of m)` for the count, "No items selected", "3 selected" and "1,234 selected (2 hidden by filters)"
 * for the selection.
 */
function frameRendering() {
  const none = frameState({ rowCount: 1 });
  const three = frameState({ rowCount: 3, selectedCount: 3 });
  const hidden = frameState({ rowCount: 1236, selectedCount: 1236, resultCount: 1234 });
  return {
    values: {
      count: [none.count, hidden.count],
      selectionCount: [none.selectionCount, three.selectionCount, hidden.selectionCount],
      selectionBar: none.selectionBar,
      clearSelection: none.clearSelection,
    },
    examples: { count: [{ fill: { n: '1' } }, { fill: { n: '1,234', m: '1,236' } }] as LabelExample[] },
  };
}

/**
 * `ListReportTableLabels.resultCount`: the table replaces `DEFAULT_LABELS.resultCount` with one that formats the number
 * in the locale of `useListReport` (`ListReportTableShell`), so the default is read from its live region, announced
 * when the data is back (loading -> ready): with 1 and with 10,000 results, `en-US`.
 */
function announcedResultCount(rowCount: number): string {
  interface Row {
    id: string;
  }
  const rows: Row[] = Array.from({ length: rowCount }, (_, i) => ({ id: `r${i}` }));
  const columns: ListReportColumn<Row>[] = [{ id: 'id', header: 'Id', accessor: (r) => r.id }];
  function Host() {
    const table = useListReport<Row>({ rows, columns, getRowId: (r) => r.id, locale: 'en-US' });
    const [status, setStatus] = useState<'loading' | 'ready'>('loading');
    return (
      <>
        <button onClick={() => setStatus('ready')}>ready</button>
        <ListReportTableShell caption="Invoices" table={table} status={status} renderBody={() => null} />
      </>
    );
  }
  const { container, unmount } = render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: 'ready' }));
  const text = textOf(container.querySelector('[aria-live="polite"]'), 'announcement of the results of ListReportTableShell');
  unmount();
  return text;
}

/**
 * `DirtyGuardLabels`: `close` is not in the hook's `DEFAULT_LABELS` (without it the X keeps the name the Dialog gives
 * it from the title), so the dialog is opened and every text is read from it.
 */
async function dirtyGuardRendering(): Promise<Record<string, string>> {
  function Host() {
    const { guard, dialog } = useDirtyGuard({ when: true });
    return (
      <>
        <button onClick={() => guard(() => undefined)}>Go back</button>
        {dialog}
      </>
    );
  }
  const { unmount } = render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  const dialog = await screen.findByRole('dialog');
  // The X takes the title's id once the title has registered (a MutationObserver): wait for its final name.
  await waitFor(() => expect(within(dialog).getAllByRole('button')[0]?.getAttribute('aria-labelledby')).toBeTruthy());
  const buttons = within(dialog).getAllByRole('button');
  expect(buttons).toHaveLength(3);
  const [close, stay, leave] = buttons as [HTMLElement, HTMLElement, HTMLElement];
  const descriptionId = dialog.getAttribute('aria-describedby');
  const values = {
    title: accessibleName(dialog, 'dialog'),
    description: textOf(descriptionId ? document.getElementById(descriptionId) : null, 'description of the dirty-guard dialog'),
    stay: accessibleName(stay, 'button'),
    leave: accessibleName(leave, 'button'),
    close: accessibleName(close, 'button'),
  };
  unmount();
  return values;
}

async function labelSources(): Promise<LabelSource[]> {
  const guard = await dirtyGuardRendering();
  const frame = frameRendering();
  // `resultCount` of the constant is not the table's default (see `announcedResultCount`): compared from the rendering.
  const tableTexts: Partial<typeof TABLE_DEFAULT_LABELS> = { ...TABLE_DEFAULT_LABELS };
  delete tableTexts.resultCount;
  return [
    { iface: 'AppLauncherLabels', from: 'DEFAULT_LABELS of app-shell/AppLauncher.tsx', values: APP_LAUNCHER_DEFAULT_LABELS },
    { iface: 'AppSwitcherLabels', from: 'DEFAULT_LABELS of app-shell/AppSwitcher.tsx', values: APP_SWITCHER_DEFAULT_LABELS },
    { iface: 'CalendarLabels', from: 'DEFAULT_LABELS of calendar/Calendar.tsx', values: CALENDAR_DEFAULT_LABELS },
    {
      iface: 'DatePickerLabels',
      // The DatePicker has its own copy of the calendar's texts: compared with the prose of CalendarLabels too.
      inherits: ['CalendarLabels'],
      from: 'DEFAULT_LABELS of date-picker/DatePicker.tsx',
      values: DATE_PICKER_DEFAULT_LABELS,
      examples: { chooseDateSelected: { args: ['March 3, 2026'] } },
    },
    {
      iface: 'DirtyGuardLabels',
      from: 'rendering of the useDirtyGuard dialog',
      values: guard,
      examples: { close: { fill: { '<title>': guard.title ?? '' } } },
    },
    {
      iface: 'FileUploadLabels',
      from: 'DEFAULT_LABELS of file-upload/FileUpload.tsx',
      values: FILE_UPLOAD_DEFAULT_LABELS,
      // "`No files selected`, `1 file selected`, `N files selected`".
      examples: { selectedCount: [{ args: [0] }, { args: [1] }, { args: ['N'] }] },
    },
    { iface: 'ListReportFrameLabels', from: 'renderings of ListReportFrame (en-US)', values: frame.values, examples: frame.examples },
    { iface: 'ListReportTableLabels', from: 'DEFAULT_LABELS of list-report/ListReportTableStates.tsx', values: tableTexts },
    {
      iface: 'ListReportTableLabels',
      from: 'announcements of ListReportTableShell (1 and 10,000 results, en-US)',
      values: { resultCount: [announcedResultCount(1), announcedResultCount(10_000)] },
    },
    {
      iface: 'MultiSelectLabels',
      from: 'DEFAULT_LABELS of multi-select/MultiSelect.tsx',
      values: MULTI_SELECT_DEFAULT_LABELS,
      // "`1 item selected` / `${n} items selected`".
      examples: { selectedCount: [{ args: [1] }, { args: ['${n}'] }] },
    },
    { iface: 'NumberInputLabels', from: 'DEFAULT_LABELS of number-input/NumberInput.tsx', values: NUMBER_INPUT_DEFAULT_LABELS },
    { iface: 'PaginationLabels', from: 'DEFAULT_LABELS of pagination/Pagination.tsx', values: PAGINATION_DEFAULT_LABELS },
    {
      iface: 'ToastLabels',
      // `tones` is an object: its four members, in order, against the four tones the prose lists.
      from: 'DEFAULT_DISMISS_LABEL and TONE_LABEL of toast/ToastProvider.tsx',
      values: { dismiss: DEFAULT_DISMISS_LABEL, tones: TONE_LABEL },
    },
  ];
}

describe('every documented default of a core *Labels key is the value of the code (#549)', () => {
  it('the guard reads keys in packages/core, and every key it reads is in core or pro (none outside both)', () => {
    expect(ROWS.filter(inCore).length).toBeGreaterThan(0);
    expect(ROWS.filter((r) => !inCore(r) && !inPro(r))).toEqual([]);
  });

  it('every key read in packages/core is verified by a source or excepted, and its prose equals the real value', async () => {
    const result = checkLabelDefaults(ROWS, { sources: await labelSources(), exceptions: LABEL_EXCEPTIONS, inScope: inCore, registry: REGISTRY });
    expect(result.problems).toEqual([]);
    const all = [...new Set(ROWS.filter((r) => inCore(r) && !r.collision).map((r) => `${r.iface}.${r.key}`))].sort();
    expect([...result.verified, ...result.excepted].sort()).toEqual(all);
  });

  it('every exception has a reason (the list is empty by default)', () => {
    for (const e of LABEL_EXCEPTIONS) expect(e.reason.trim(), `${e.iface}.${e.key}`).not.toBe('');
  });

  it('no file of packages/core imports from packages/pro (the Pro test reads the core, never the other way round)', () => {
    const coreDir = resolve(REPO_ROOT, 'packages/core');
    const proDir = resolve(REPO_ROOT, 'packages/pro');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
      }
    };
    walk(join(coreDir, 'src'));
    walk(join(coreDir, 'test'));
    walk(join(coreDir, 'scripts'));
    expect(files.length).toBeGreaterThan(100);
    const offending: string[] = [];
    for (const file of files) {
      for (const { fileName: spec } of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
        const target = spec.startsWith('.') ? resolve(dirname(file), spec) : '';
        if (/^@formrail\/pro(?:\/|$)/.test(spec) || target === proDir || target.startsWith(`${proDir}/`)) offending.push(`${relative(REPO_ROOT, file)}: ${spec}`);
      }
    }
    expect(offending).toEqual([]);
  });
});
