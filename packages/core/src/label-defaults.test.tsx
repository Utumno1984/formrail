import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ListReport } from './list-report/ListReport';
import { DEFAULT_LABELS as TABLE_DEFAULT_LABELS } from './list-report/ListReportTableStates';
import type { ListReportColumn } from './list-report/types';
import { useListReport } from './list-report/use-list-report';
import { NumberInput } from './number-input/NumberInput';
import { Pagination } from './pagination/Pagination';

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
