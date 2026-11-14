import { Differ, ROOT, resetDiffWarnings, type DiffNode } from '../internal/structural-diff';
import type { ArrayReorder, ChangeEntry, ChangeSummaryOptions, ChangeSummaryResult } from './types';

/** Test hook: forget the warnings already emitted. Not part of the public API. */
export function resetChangeSummaryWarnings(): void {
  resetDiffWarnings();
}

/**
 * Field-by-field diff of `values` against the real saved `baseline`, plus the id-keyed arrays whose
 * order changed: `entries` is exactly what {@link computeChangeSummary} returns, `reorders` lists
 * every {@link ArrayReorder} without adding any entry for it. Pure function; `useChangeSummary` is
 * the memoized hook around it. See {@link ChangeSummaryOptions} for the equality rules, array
 * identity, `itemLabel` and the order of `entries` (which `reorders` follows too).
 *
 * A mere reorder is dirty for a form but gives no entry: a save bar or a dirty guard driven by the
 * summary checks `entries.length === 0 && reorders.length === 0`.
 *
 * `itemLabel` is called lazily, only for the item segments of what is reported, at most once per
 * item and value of `isLastSegment`; an exception it throws reaches the caller.
 *
 * `values === baseline` returns two empty lists without visiting anything.
 */
export function computeChangeSummaryResult<Values extends object>(options: ChangeSummaryOptions<Values>): ChangeSummaryResult {
  const { values, baseline, arrayIdKeys, labels, isEqual, itemLabel } = options;
  const entries: ChangeEntry[] = [];
  const reorders: ArrayReorder[] = [];
  if ((values as unknown) === (baseline as unknown)) return { entries, reorders };
  const differ = new Differ({ arrayIdKeys, labels, isEqual, itemLabel, source: 'useChangeSummary' });
  const reordered: DiffNode[] = [];
  differ.run(baseline, values, entries, ROOT, reordered);
  for (const node of reordered) {
    const labelPath = differ.labelPath(node);
    reorders.push({ path: node.path, labelPath, label: labelPath.join(' > ') });
  }
  return { entries, reorders };
}

/**
 * Field-by-field diff of `values` against the real saved `baseline`: a deterministic list of
 * {@link ChangeEntry}. Pure function; `useChangeSummary` is the memoized hook around it. See
 * {@link ChangeSummaryOptions} for the equality rules, array identity and entry order.
 *
 * The `entries` of {@link computeChangeSummaryResult}, which also lists the reorders of id-keyed
 * arrays (a mere reorder gives no entry here).
 *
 * `values === baseline` returns an empty list without visiting anything.
 */
export function computeChangeSummary<Values extends object>(options: ChangeSummaryOptions<Values>): ChangeEntry[] {
  return computeChangeSummaryResult(options).entries;
}
