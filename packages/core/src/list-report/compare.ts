import { resolveLocales } from './number-format';

type Kind = 'number' | 'date' | 'boolean' | 'string';

export interface SortKey {
  empty: boolean;
  kind: Kind;
  value: number | string;
  /** `String(raw)`, used when two keys have different kinds. */
  text: string;
}

/** `null`, `undefined`, `''`, `NaN` and an invalid `Date` are "empty": they always sort last. */
export function toSortKey(raw: unknown): SortKey {
  const text = typeof raw === 'string' ? raw : String(raw);
  const key = (kind: Kind, value: number | string, empty: boolean): SortKey => ({ empty, kind, value, text });
  if (raw === null || raw === undefined || raw === '') return key('string', '', true);
  if (typeof raw === 'number') return key('number', raw, Number.isNaN(raw));
  if (raw instanceof Date) {
    const time = raw.getTime();
    return key('date', time, Number.isNaN(time));
  }
  if (typeof raw === 'boolean') return key('boolean', raw ? 1 : 0, false);
  return key('string', text, false);
}

/**
 * Default comparator on two non-empty keys: numbers numerically, strings with the collator
 * (numeric, case and diacritics insensitive), dates by time, booleans `false < true`; keys of
 * different kinds are compared as `String(...)`.
 */
export function compareKeys(a: SortKey, b: SortKey, collator: Intl.Collator): number {
  if (a.kind === b.kind && a.kind !== 'string') return (a.value as number) - (b.value as number);
  return collator.compare(a.text, b.text);
}

/** An invalid tag (`en_US`, `''`) degrades to the runtime default, never an exception (spec §1.13.3). */
export function createCollator(locale?: string | string[]): Intl.Collator {
  return new Intl.Collator(resolveLocales(locale), { numeric: true, sensitivity: 'base' });
}
