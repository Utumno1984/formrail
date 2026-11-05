import { useCallback, useMemo } from 'react';
import type { UseListReportReturn } from './types';

export interface ListReportResultIndex {
  /**
   * The ids of the current results (`table.rows`), in the same order. One `getRowId` call per row,
   * memoized on `table.rows`/`table.getRowId`: a new array only when the results actually change,
   * never on every render.
   */
  resultIds: readonly string[];
  /** O(1) position of `id` among `resultIds`, or `-1` when it is not a current result. */
  indexOfResult: (id: string) => number;
}

/**
 * @internal The position of each current result's id, memoized so a gesture built on top of
 * `table.selection` (e.g. shift-click range selection in `@react-object-page/pro`) finds "the index
 * of this id among the current results" in O(1) without redoing its own O(n) pass of `getRowId`
 * over `table.rows` on every call — only `useMemo` recomputes it, and only when the results change.
 *
 * (`useListReport`'s own selection state computes an equivalent array internally when `selectable`
 * is on, but does not expose it: this hook is the same cost, exposed, so a consumer of `/internal`
 * is never worse than O(n) per interaction just to locate one id.)
 */
export function useListReportResultIndex<Row>(table: UseListReportReturn<Row>): ListReportResultIndex {
  const { rows, getRowId } = table;
  const resultIds = useMemo<readonly string[]>(() => rows.map(getRowId), [rows, getRowId]);
  const position = useMemo(() => {
    const map = new Map<string, number>();
    resultIds.forEach((id, index) => map.set(id, index));
    return map;
  }, [resultIds]);
  const indexOfResult = useCallback((id: string) => position.get(id) ?? -1, [position]);
  return useMemo(() => ({ resultIds, indexOfResult }), [resultIds, indexOfResult]);
}
