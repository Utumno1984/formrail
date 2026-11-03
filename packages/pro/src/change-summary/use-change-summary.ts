import { useMemo } from 'react';
import { computeChangeSummary } from './compute-change-summary';
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
 * Memoized {@link computeChangeSummary}: `entries` is the same array between renders while
 * `values` and `baseline` keep their identity, `arrayIdKeys`/`labels` keep their content (inline
 * literals are fine) and `isEqual` keeps its identity (pass a stable function). SSR-safe: no
 * access to `window`/`document`.
 */
export function useChangeSummary<Values extends object>(options: ChangeSummaryOptions<Values>): UseChangeSummaryReturn {
  const { values, baseline, isEqual } = options;
  const arrayIdKeys = useContentStableRecord(options.arrayIdKeys);
  const labels = useContentStableRecord(options.labels);
  return useMemo(() => {
    const entries = computeChangeSummary({ values, baseline, arrayIdKeys, labels, isEqual });
    return { entries, isEmpty: entries.length === 0 };
  }, [values, baseline, arrayIdKeys, labels, isEqual]);
}
