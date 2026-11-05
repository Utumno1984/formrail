import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ListReportColumn, ListReportFilter } from './types';
import { useListReport } from './use-list-report';
import { useListReportResultIndex } from './use-list-report-result-index';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface Row {
  id: string;
  name: string;
  open: boolean;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha', open: true },
  { id: 'b', name: 'Bravo', open: false },
  { id: 'c', name: 'Charlie', open: true },
];

const COLUMNS: ListReportColumn<Row>[] = [{ id: 'name', header: 'Name', accessor: (r) => r.name }];
const FILTERS: ListReportFilter<Row>[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', predicate: (r) => r.open },
];
const getRowId = (r: Row) => r.id;

function setup(filter?: string) {
  return renderHook(() => {
    const table = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId, filters: FILTERS, filter, searchCommitDelay: null });
    return useListReportResultIndex(table);
  });
}

describe('useListReportResultIndex', () => {
  it('resultIds is table.rows mapped through getRowId, in the same order', () => {
    const { result } = setup();
    expect(result.current.resultIds).toEqual(['a', 'b', 'c']);
  });

  it('indexOfResult is O(1): the position of each current result, -1 for an absent id', () => {
    const { result } = setup();
    expect(result.current.indexOfResult('a')).toBe(0);
    expect(result.current.indexOfResult('b')).toBe(1);
    expect(result.current.indexOfResult('c')).toBe(2);
    expect(result.current.indexOfResult('does-not-exist')).toBe(-1);
  });

  it('follows the current results, not the whole data: a filtered-out id is -1', () => {
    const { result } = setup('open');
    expect(result.current.resultIds).toEqual(['a', 'c']);
    expect(result.current.indexOfResult('b')).toBe(-1);
    expect(result.current.indexOfResult('c')).toBe(1);
  });

  it('memoizes resultIds and indexOfResult: a re-render with the same table.rows keeps the same references', () => {
    const { result, rerender } = setup();
    const firstIds = result.current.resultIds;
    const firstIndexOfResult = result.current.indexOfResult;
    rerender();
    expect(result.current.resultIds).toBe(firstIds);
    expect(result.current.indexOfResult).toBe(firstIndexOfResult);
  });

  it('recomputes when the results change (a different filter)', () => {
    const { result, rerender } = renderHook(
      (filter?: string) => {
        const table = useListReport<Row>({ rows: ROWS, columns: COLUMNS, getRowId, filters: FILTERS, filter, searchCommitDelay: null });
        return useListReportResultIndex(table);
      },
      { initialProps: undefined as string | undefined },
    );
    expect(result.current.resultIds).toEqual(['a', 'b', 'c']);
    rerender('open');
    expect(result.current.resultIds).toEqual(['a', 'c']);
    expect(result.current.indexOfResult('b')).toBe(-1);
  });
});
