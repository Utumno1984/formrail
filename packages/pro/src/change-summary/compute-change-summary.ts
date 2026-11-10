import { Differ, resetDiffWarnings } from '../internal/structural-diff';
import type { ChangeEntry, ChangeSummaryOptions } from './types';

/** Test hook: forget the warnings already emitted. Not part of the public API. */
export function resetChangeSummaryWarnings(): void {
  resetDiffWarnings();
}

/**
 * Field-by-field diff of `values` against the real saved `baseline`: a deterministic list of
 * {@link ChangeEntry}. Pure function; `useChangeSummary` is the memoized hook around it. See
 * {@link ChangeSummaryOptions} for the equality rules, array identity and entry order.
 *
 * `values === baseline` returns an empty list without visiting anything.
 */
export function computeChangeSummary<Values extends object>(options: ChangeSummaryOptions<Values>): ChangeEntry[] {
  const { values, baseline, arrayIdKeys, labels, isEqual } = options;
  const entries: ChangeEntry[] = [];
  if ((values as unknown) === (baseline as unknown)) return entries;
  new Differ({ arrayIdKeys, labels, isEqual, source: 'useChangeSummary' }).run(baseline, values, entries);
  return entries;
}
