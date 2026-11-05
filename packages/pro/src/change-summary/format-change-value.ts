import { inferSegmentLabel } from './infer-label';

/** Texts used by the default value formatting and by `<ChangeSummary />` (all overridable). */
export interface ChangeSummaryValueLabels {
  /** Boolean `true`. Default `Yes`. */
  yes: string;
  /** Boolean `false`. Default `No`. */
  no: string;
  /** The empty string `''`. Default `Empty`. */
  empty: string;
  /** `undefined` / `null` in the compact rendering. Default `No value`. */
  noValue: string;
  /** `null` in the precise renderings (`precise: true`). Default `Null`. */
  nullValue: string;
  /** `undefined` in the precise renderings (`precise: true`). Default `Undefined`. */
  undefinedValue: string;
  /** A missing key in the precise renderings of `<ChangeSummary />`, told from `undefined` with
   *  `beforeMissing` / `afterMissing` of the entry. Default `Missing`. */
  missingValue: string;
  /** A `Date` whose time is `NaN`. Default `Invalid date`. */
  invalidDate: string;
  /** Kind of an `added` entry. Default `added`; shown with its first letter upper-cased (CSS), the
   *  text read by assistive technology is the lower-case one: `Note, added, Hello`. */
  added: string;
  /** Kind of a `removed` entry. Default `removed` (see `added`). */
  removed: string;
  /** Kind of a `changed` entry. Default `changed` (see `added`). */
  changed: string;
  /** Visually hidden word before the value in the text read for `changed`. Default `from`. */
  from: string;
  /** Visually hidden word between the two values in the text read for `changed`. Default `to`. */
  to: string;
  /** Last resort of `<ChangeSummary />` when before and after still look the same with their
   *  contents written out (two class instances, a difference past the truncation): appended to
   *  the after value in parentheses. Default `contents differ`. */
  contentsDiffer: string;
  /** Array summary, a function because plural forms differ per language. Default: `No items`,
   *  `1 item`, `N items`. */
  items: (count: number) => string;
}

export const DEFAULT_VALUE_LABELS: ChangeSummaryValueLabels = {
  yes: 'Yes',
  no: 'No',
  empty: 'Empty',
  noValue: 'No value',
  nullValue: 'Null',
  undefinedValue: 'Undefined',
  missingValue: 'Missing',
  invalidDate: 'Invalid date',
  added: 'added',
  removed: 'removed',
  changed: 'changed',
  from: 'from',
  to: 'to',
  contentsDiffer: 'contents differ',
  items: (count) => (count === 0 ? 'No items' : count === 1 ? '1 item' : `${count} items`),
};

export interface FormatChangeValueOptions {
  /** BCP 47 locale for numbers and dates. Default: the runtime locale. An invalid one falls back
   *  to the default. */
  locale?: string;
  /** IANA time zone for dates. Default: the runtime time zone. An invalid one falls back to the
   *  default. */
  timeZone?: string;
  /** Overrides of the default texts. */
  labels?: Partial<ChangeSummaryValueLabels>;
  /**
   * Unambiguous rendering, used to tell apart two values that would otherwise look the same:
   * dates with the time of day, numbers with `String(value)`, strings in double quotes, `null` and
   * `undefined` with their own texts (`nullValue`, `undefinedValue`).
   */
  precise?: boolean;
}

/** Text for anything that has no meaningful compact rendering (Map, Set, instances, functions). */
const UNSUPPORTED = 'Unsupported value';
/** Text for a nested object inside a summarized object. */
const NESTED = '…';

/**
 * Rendering level: 0 default, 1 precise, 2 precise and, for dates, ISO 8601, 3 contents (arrays,
 * objects, Map and Set written out, nested values included, truncated to {@link CONTENTS_MAX}).
 */
export type FormatLevel = 0 | 1 | 2 | 3;

/** Longest text of the contents level (3), ellipsis included. */
export const CONTENTS_MAX = 120;
/** Nesting written out by the contents level; deeper values are `…`. */
const CONTENTS_DEPTH = 4;

type Resolved = {
  locale?: string;
  timeZone?: string;
  labels: ChangeSummaryValueLabels;
};

function resolve(options: FormatChangeValueOptions): Resolved {
  const labels = { ...DEFAULT_VALUE_LABELS };
  for (const key of Object.keys(options.labels ?? {}) as (keyof ChangeSummaryValueLabels)[]) {
    const value = options.labels?.[key];
    if (value !== undefined) (labels as Record<string, unknown>)[key] = value;
  }
  return { locale: options.locale, timeZone: options.timeZone, labels };
}

/** Builds an Intl formatter; an invalid locale or time zone degrades to the runtime defaults. */
function make<T>(ctor: (locale?: string, timeZone?: string) => T, r: Resolved): T {
  try {
    return ctor(r.locale, r.timeZone);
  } catch {
    try {
      return ctor(undefined, r.timeZone);
    } catch {
      try {
        return ctor(r.locale, undefined);
      } catch {
        return ctor(undefined, undefined);
      }
    }
  }
}

function formatDate(value: Date, r: Resolved, level: FormatLevel): string {
  if (Number.isNaN(value.getTime())) return r.labels.invalidDate;
  if (level === 2) return value.toISOString();
  const style: Intl.DateTimeFormatOptions =
    level === 1 ? { dateStyle: 'medium', timeStyle: 'medium' } : { dateStyle: 'medium' };
  return make((locale, timeZone) => new Intl.DateTimeFormat(locale, { ...style, timeZone }), r).format(value);
}

function formatNumber(value: number | bigint, r: Resolved, level: FormatLevel): string {
  // `10n` against `10`: a bigint keeps its suffix in the precise renderings.
  if (level > 0) return typeof value === 'bigint' ? `${value}n` : String(value);
  return make((locale) => new Intl.NumberFormat(locale), r).format(value);
}

/**
 * Level 3: the contents of a value written out, nested values included, so that two arrays or
 * objects of the same size are told apart (`["a", "b"]` / `["a", "c"]`). Leaves use the precise
 * rendering (level 2). Cycles and values deeper than {@link CONTENTS_DEPTH} are `…`; instances
 * other than Date / Map / Set stay the fixed fallback text.
 */
function contents(value: unknown, r: Resolved, depth: number, seen: Set<object>): string {
  if (typeof value !== 'object' || value === null || value instanceof Date) return format(value, r, 2);
  if (seen.has(value) || depth >= CONTENTS_DEPTH) return NESTED;
  seen.add(value);
  try {
    const inner = (item: unknown) => contents(item, r, depth + 1, seen);
    if (Array.isArray(value)) return `[${value.map(inner).join(', ')}]`;
    if (value instanceof Map) {
      return `Map {${Array.from(value, ([k, v]) => `${inner(k)} => ${inner(v)}`).join(', ')}}`;
    }
    if (value instanceof Set) return `Set {${Array.from(value, inner).join(', ')}}`;
    if (isPlainObject(value)) {
      const parts = Object.keys(value).map((key) => `${key}: ${inner((value as Record<string, unknown>)[key])}`);
      return `{${parts.join(', ')}}`;
    }
    return UNSUPPORTED;
  } finally {
    seen.delete(value);
  }
}

const truncate = (text: string): string => (text.length > CONTENTS_MAX ? `${text.slice(0, CONTENTS_MAX - 1)}…` : text);

const isPlainObject = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

function formatObject(value: object, r: Resolved, level: FormatLevel): string {
  const parts: string[] = [];
  for (const key of Object.keys(value)) {
    const item = (value as Record<string, unknown>)[key];
    if (item === undefined || item === null) continue;
    // One level only: a nested value is summarized, never traversed (so a cycle cannot loop).
    let text: string;
    if (Array.isArray(item)) text = r.labels.items(item.length);
    else if (typeof item === 'object' && !(item instanceof Date)) text = NESTED;
    else text = format(item, r, level);
    parts.push(`${inferSegmentLabel(key)}: ${text}`);
  }
  return parts.length === 0 ? r.labels.empty : parts.join(', ');
}

/**
 * Never throws: a revoked Proxy (`Array.isArray` throws), a throwing `getPrototypeOf` trap
 * (`instanceof`), a throwing getter or label function all give the fixed fallback text.
 */
function format(value: unknown, r: Resolved, level: FormatLevel): string {
  try {
    if (level === 3) return truncate(contents(value, r, 0, new Set()));
    return formatUnsafe(value, r, level);
  } catch {
    return UNSUPPORTED;
  }
}

function formatUnsafe(value: unknown, r: Resolved, level: FormatLevel): string {
  if (value === undefined || value === null) {
    if (level === 0) return r.labels.noValue;
    return value === null ? r.labels.nullValue : r.labels.undefinedValue;
  }
  switch (typeof value) {
    case 'boolean':
      return value ? r.labels.yes : r.labels.no;
    case 'number':
    case 'bigint':
      return formatNumber(value, r, level);
    case 'string':
      if (level > 0) return JSON.stringify(value);
      return value === '' ? r.labels.empty : value;
    case 'object':
      if (value instanceof Date) return formatDate(value, r, level);
      if (Array.isArray(value)) return r.labels.items(value.length);
      if (isPlainObject(value)) return formatObject(value, r, level);
      return UNSUPPORTED;
    default:
      return UNSUPPORTED;
  }
}

/** Same as `formatChangeValue` with an explicit rendering level (used by `<ChangeSummary />`). */
export function formatChangeValueAt(
  value: unknown,
  options: FormatChangeValueOptions | undefined,
  level: FormatLevel,
): string {
  return format(value, resolve(options ?? {}), level);
}

/**
 * Default text of a value shown in a change summary. Pure (no React) and always a string:
 *
 * - booleans `Yes` / `No`, never `true` / `false`;
 * - dates with `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone })`, `Invalid date`
 *   for an invalid one, never `Date.prototype.toString()`;
 * - numbers with `Intl.NumberFormat(locale)` (`NaN`, `∞` rendered without throwing);
 * - strings as they are, `''` as `Empty`, `undefined` / `null` as `No value`;
 * - arrays as `No items` / `1 item` / `N items`;
 * - plain objects as a compact `Label: value, Label: value` of their own keys (labels from
 *   `inferSegmentLabel`, `undefined` / `null` keys skipped, nested arrays summarized as
 *   `N items`, nested objects as `…`);
 * - anything else (`Map`, `Set`, class instances, functions, symbols) as a fixed fallback text.
 *
 * Never throws for odd values or an invalid `locale` / `timeZone` (fall back to the runtime
 * defaults). `precise: true` gives the unambiguous variant (see {@link FormatChangeValueOptions}).
 * A missing key is not a value: `before` / `after` hold `undefined` for it, see `beforeMissing` /
 * `afterMissing` on `ChangeEntry`.
 */
export function formatChangeValue(value: unknown, options?: FormatChangeValueOptions): string {
  return formatChangeValueAt(value, options, options?.precise ? 1 : 0);
}

/** True for the values the component shows in a muted style (`''`, `undefined`, `null`). */
export const isMutedValue = (value: unknown): boolean => value === undefined || value === null || value === '';
