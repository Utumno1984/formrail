/** What happened to a node between the saved baseline and the current values. */
export type ChangeKind = 'added' | 'removed' | 'changed';

/**
 * One human-readable change between `baseline` and `values`.
 *
 * `before` is always `undefined` when `kind === 'added'` and `after` is always `undefined` when
 * `kind === 'removed'`, even when the absent side was `null`: both are normalized to `undefined`
 * (see "Absent" in {@link ChangeSummaryOptions}). On a `changed` entry `before` and `after` keep
 * `null` and `undefined` as they are, and `beforeMissing` / `afterMissing` tell a missing key from
 * a key present with value `undefined`.
 */
export interface ChangeEntry {
  /**
   * Dot-notation path with numeric array indexes, the same notation as core's `FieldErrors`
   * (`lineItems.2.price`, never `lineItems[2].price`), so an entry, its field and its error share
   * one key. The index is the position in `values`, or in `baseline` for a `removed` array item.
   *
   * An object key that itself contains a dot (`{ 'a.b': 1 }`) is kept as one segment: the path
   * `a.b` is then ambiguous with `{ a: { b: 1 } }`. Use `labelPath` (one item per segment) when
   * you need an unambiguous structure.
   */
  path: string;
  /** One label per path segment: inferred with `inferSegmentLabel`, `Item N` for array indexes
   *  (1-based) unless `itemLabel` names the item, or the `labels` override for that segment. */
  labelPath: string[];
  /** `labelPath.join(' > ')`, e.g. `Line Items > Item 3 > Price`. */
  label: string;
  /** `added`, `removed` or `changed` (see the type description for what `before`/`after` hold). */
  kind: ChangeKind;
  /** Value in the baseline (`undefined` when `kind === 'added'`). */
  before: unknown;
  /** Value in `values` (`undefined` when `kind === 'removed'`). */
  after: unknown;
  /**
   * `true` when the baseline has no own key at this position, or no counterpart for an array item.
   * `before` is then `undefined`, but `undefined` alone does not imply this flag: it stays `false`
   * for a key present with value `undefined`, and for a `null` normalized on an `added` entry.
   */
  beforeMissing: boolean;
  /** Same as `beforeMissing`, for `values` and `after`. */
  afterMissing: boolean;
}

/**
 * Options of `computeChangeSummary` / `useChangeSummary`.
 *
 * ## "No value" rule
 *
 * `''`, `null`, `undefined` and a missing key are four distinct states, as for `isDirty` in core's
 * `useObjectPageForm`: without `isEqual` and `arrayIdKeys`, `entries` is empty if and only if
 * `isDirty` is `false` for the same pair. With `arrayIdKeys`, a reorder without changes is dirty
 * but gives no entry: it is listed in `reorders` instead (see `computeChangeSummaryResult`),
 * so without `isEqual` "`entries` and `reorders` both empty" holds if and only if `isDirty` is
 * `false`. One exception remains, on purpose: an item whose id is not matched by `Object.is`
 * gives `added` plus `removed` even on two equal arrays. It covers items without id, ids that are
 * objects (compared by reference: a cloned `Date` or object is another id) and `0` against `-0`.
 *
 * **Absent** = `undefined`, `null`, missing key. It does not make two values equal, it only decides
 * the kind of the entry. Applied in this order to every pair that differs (after `isEqual`):
 * 1. Both sides Absent (`null` against `undefined`, `undefined` against a missing key, ...) →
 *    `changed` on the node.
 * 2. One side Absent → **one** entry on the node, `added` (baseline absent) or `removed` (values
 *    absent), without descending to the leaves, whatever the other side holds (`''`, `[]` and
 *    `{}` included). Only exception: a non-empty array with a declared id key gives one entry per
 *    item.
 * 3. Otherwise → structural comparison: `''` → `'abc'` is `changed` with `before: ''`; `''` → `[]`
 *    is `changed`; `[]` → `[x]` without id key is a block `changed`; `{}` → `{ a: 'x' }` descends
 *    and gives `added` on `a`.
 *
 * No other normalization: `' '` against `''` is `changed`, there is no type coercion (`5` against
 * `'5'` is `changed`) and `0`, `false`, `NaN` are ordinary values.
 *
 * ## Default leaf comparison
 *
 * Same rules as the structural equality behind `isDirty` in core's `useObjectPageForm`:
 * - primitives with `===`, except `NaN` equals `NaN` (`0` equals `-0`);
 * - `Date` by `getTime()` (two invalid dates are equal);
 * - arrays and plain objects by content; own enumerable string keys only (`Symbol` keys and
 *   non-enumerable properties are ignored; `constructor`, `__proto__`, ... as own properties are
 *   ordinary keys);
 * - anything else (`Map`, `Set`, class instances, functions) is a leaf compared by reference,
 *   never traversed;
 * - a change of structural type between two values that are not Absent (object ↔ string, array ↔
 *   object, `Date` ↔ string, ...) is one `changed` entry on the node.
 *
 * Circular structures are supported: a (baseline, values) pair already being compared higher up
 * the stack is assumed equal. Depth is not limited by the JavaScript call stack (the visit is
 * iterative, tested at 10 000 levels) and the cost is linear in the number of visited nodes (pathological exception: positional arrays nested
 * thousands of levels deep with a difference at the bottom, which cost quadratic time).
 *
 * ## Order of `entries`
 *
 * Depth-first visit; object keys in the order of `values`, then the keys present only in the
 * baseline in their order; for arrays with an id key, items in the order of `values`, then the
 * `removed` items in the order of the baseline. The `reorders` of {@link ChangeSummaryResult}
 * follow the same visit: an array before the arrays nested in its items, the items in the order
 * of `values`.
 */
export interface ChangeSummaryOptions<Values extends object> {
  /** Current values (e.g. `useObjectPageForm().values`). */
  values: Values;
  /** Real saved baseline (e.g. `useObjectPageForm().baseline`), never a static default. */
  baseline: Values;
  /**
   * Identity key per array, keyed by a path **without indexes**, e.g.
   * `{ lineItems: 'id', 'lineItems.taxes': 'code' }` (the second is an array inside every item).
   *
   * With an id key, items are matched by id (compared with `Object.is`, so `1` and `'1'` differ,
   * `0` and `-0` differ, and an object id, `Date` included, matches only the same reference):
   * an id only in the baseline is `removed` (path on its baseline index), a new id is `added`
   * (path on its `values` index), a matched item yields one entry per changed field (path on its
   * `values` index), and a reorder without changes yields no entry. Items without id
   * (`undefined`/`null`) or that are not objects are always `added` (in `values`) or `removed`
   * (in the baseline), never matched.
   *
   * Without an id key (explicit degrade) an array is diffed as a block: equal arrays (same
   * rules, position by position) give no entry, otherwise — even for a mere reorder — **one**
   * `changed` entry on the array path with the whole arrays as `before`/`after`. Duplicate ids in
   * one array degrade that array to the block diff too (with a development `console.warn`, once
   * per path); an id key on a path whose value is not an array is ignored (same warning policy).
   */
  arrayIdKeys?: Readonly<Record<string, string>>;
  /**
   * Label overrides keyed by a path **without array indexes**. An override replaces the label of
   * that segment only; ancestors stay inferred (or overridden by their own key):
   * `{ 'supplier.vatNumber': 'VAT number' }` → `Supplier > VAT number`;
   * `{ 'lineItems.price': 'Unit price' }` applies to every item. Unknown keys are ignored.
   */
  labels?: Readonly<Record<string, string>>;
  /**
   * Custom equality, called with `a` = baseline side, `b` = values side and the concrete path
   * (with indexes) on every visited pair of nodes except the root — before the "no value" rules
   * and the default comparison, arrays and id-matched items included (not for `added`/`removed`
   * items without a counterpart). A missing key is passed as `undefined`. Return `true` → no entry
   * for that subtree; `false` → one atomic entry on the node, without descending (`changed`, or
   * `added`/`removed` when one side is Absent; `changed` when both are); `undefined` → default
   * rules. The subtree of an atomic entry is not visited: `isEqual` is not asked on its descendants.
   *
   * `useChangeSummary` compares this function by identity: pass a stable function (module scope
   * or `useCallback`), an inline one recomputes the summary on every render.
   */
  isEqual?: (a: unknown, b: unknown, path: string) => boolean | undefined;
  /**
   * Label of an array-item segment of `labelPath` (the `Item N` segments), given while the engine
   * still holds the real item, so a row can be named by its content:
   * `Line Items > Item 2 (Chair) > Price` instead of `Line Items > Item 2 > Price`. Works on any
   * array, nested ones included, with or without an id key.
   *
   * Called with `arrayPath` = path of the array **without indexes**, the same key as `arrayIdKeys`
   * (`lineItems`, `lineItems.taxes`), the item itself (anything: a primitive or an item without
   * id too) and an {@link ItemLabelContext}: which side the item comes from, its index there,
   * whether it is the last segment of the label, and the default label.
   *
   * Return value: a non-blank string replaces the segment as it is (no trimming); `undefined`, `''`
   * or a string of only whitespace keep `defaultLabel`. Any other value (`null`, a number, an
   * object) also keeps `defaultLabel`, with a development `console.warn` once per `arrayPath`
   * (none in production). An exception thrown by `itemLabel` is not caught: it reaches the caller
   * of `computeChangeSummaryResult` / `computeChangeSummary`, or the render of `useChangeSummary`.
   *
   * Lazy: called only for the item segments of an entry or a reorder that is actually reported
   * (never while the engine only checks whether a subtree differs, e.g. inside an array diffed as
   * a block), and at most once per item and value of `isLastSegment` in one computation, so an
   * item with five changed fields is labeled once and the unchanged rows of a 1 000-row array are
   * never labeled. Equal values, or a mere reorder of a top-level array, call it zero times.
   *
   * `labels` still names the array segment (`labels['lineItems']`) and the fields of every item
   * (`labels['lineItems.price']`); `itemLabel` acts only on the item segments.
   *
   * `useChangeSummary` compares this function by identity, like `isEqual`: pass a stable function
   * (module scope or `useCallback`), an inline one recomputes the summary on every render.
   */
  itemLabel?: (arrayPath: string, item: unknown, context: ItemLabelContext) => string | undefined;
}

/** Context of one array-item segment passed to `ChangeSummaryOptions.itemLabel`. */
export interface ItemLabelContext {
  /**
   * Concrete path of the item, same notation as `ChangeEntry.path` (e.g. `lineItems.2`,
   * `lineItems.0.taxes.1`).
   */
  path: string;
  /**
   * Index of the item in its array: in `values` when `side === 'values'`, in `baseline` when
   * `side === 'baseline'`.
   */
  index: number;
  /**
   * `'values'` for a matched or added item (the item as it is now, so a name the user edited reads
   * as edited), `'baseline'` for a removed item (the item as it was saved). In Form Rebase: `'values'` for an
   * item of the merged values (or of the form, for an open conflict), `'baseline'` for an item that exists only
   * in a baseline (see `RebaseOptions.itemLabel`).
   */
  side: 'values' | 'baseline';
  /**
   * `true` when this item is the last segment, i.e. the entry is about the whole item (added,
   * removed, or atomic). `false` when the item only encloses the entry (one of its fields changed)
   * or the reorder (an array inside it).
   */
  isLastSegment: boolean;
  /** The label used when `itemLabel` gives none: `Item N`, N = index + 1. */
  defaultLabel: string;
}

/**
 * An id-keyed array whose items present on both sides are in a different relative order. Added
 * or removed items alone are not a reorder (a new first row moves the others, but not relative to
 * each other); an array diffed as a block (no id key, duplicate ids) or settled by `isEqual` on its
 * own path is never listed, and neither is an array inside an added or removed item. An id-keyed
 * array inside the items of a block is listed only when the block gives no entry (otherwise that
 * one `changed` entry already covers the whole block).
 */
export interface ArrayReorder {
  /**
   * Concrete path of the array, same notation as `ChangeEntry.path` (indexes of the enclosing
   * items in `values`).
   */
  path: string;
  /** Same rules as `ChangeEntry.labelPath`, `itemLabel` included for the enclosing items. */
  labelPath: string[];
  /** `labelPath.join(' > ')`. */
  label: string;
}

/** Return value of `computeChangeSummaryResult`. */
export interface ChangeSummaryResult {
  /** Exactly what `computeChangeSummary` returns for the same options. */
  entries: ChangeEntry[];
  /**
   * The id-keyed arrays reordered without that being an entry, in the order of the visit (see
   * "Order of `entries`" in {@link ChangeSummaryOptions}).
   */
  reorders: ArrayReorder[];
}

/** Return value of `useChangeSummary`. */
export interface UseChangeSummaryReturn {
  /** Same array as `computeChangeSummary` returns, referentially stable while inputs are. */
  entries: ChangeEntry[];
  /**
   * `entries.length === 0`. Reorders are not considered: a mere reorder of an id-keyed array gives
   * `isEmpty === true` with a non-empty `reorders`. A save bar or a dirty guard driven by the
   * summary checks `isEmpty && reorders.length === 0`.
   */
  isEmpty: boolean;
  /**
   * The `reorders` of `computeChangeSummaryResult` for the same options; the same array between
   * renders, under the same identity rules as `entries` (`itemLabel` and `isEqual` by identity).
   */
  reorders: ArrayReorder[];
}
