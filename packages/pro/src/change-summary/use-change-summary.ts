import { useMemo } from 'react';
import { computeChangeSummaryResult } from './compute-change-summary';
import type { ChangeSummaryOptions, UseChangeSummaryReturn } from './types';

type StringRecord = Readonly<Record<string, string>>;

/** Content key of a string record: independent of key order, `''` for `undefined`. */
function recordKey(record: StringRecord | undefined): string {
  if (record === undefined) return '';
  const entries = Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

/**
 * A record that keeps the same identity while its content (keys and values) is unchanged, so an
 * inline literal recreated on every render does not invalidate the memoized summary. Rebuilt from
 * the content key, which keeps the memo pure.
 */
function useContentStableRecord(record: StringRecord | undefined): StringRecord | undefined {
  const key = recordKey(record);
  return useMemo(
    () => (key === '' ? undefined : (Object.fromEntries(JSON.parse(key) as [string, string][]) as StringRecord)),
    [key],
  );
}

/**
 * Memoized {@link computeChangeSummaryResult}: `entries` and `reorders` are the same arrays between
 * renders while `values` and `baseline` keep their identity, `arrayIdKeys`/`labels` keep their
 * content (inline literals are fine) and `isEqual` and `itemLabel` keep their identity (pass stable
 * functions: module scope or `useCallback`; an inline one recomputes the summary on every render).
 * An exception thrown by `itemLabel` is thrown by the render. SSR-safe: no access to
 * `window`/`document`.
 *
 * `isEmpty` does not consider `reorders`: a save bar or a dirty guard driven by the summary checks
 * `isEmpty && reorders.length === 0`.
 */
export function useChangeSummary<Values extends object>(options: ChangeSummaryOptions<Values>): UseChangeSummaryReturn {
  const { values, baseline, isEqual, itemLabel } = options;
  const arrayIdKeys = useContentStableRecord(options.arrayIdKeys);
  const labels = useContentStableRecord(options.labels);
  return useMemo(() => {
    const { entries, reorders } = computeChangeSummaryResult({ values, baseline, arrayIdKeys, labels, isEqual, itemLabel });
    return { entries, isEmpty: entries.length === 0, reorders };
  }, [values, baseline, arrayIdKeys, labels, isEqual, itemLabel]);
}
