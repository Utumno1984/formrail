/** What happened to a node between the saved baseline and the current values. */
export type ChangeKind = 'added' | 'removed' | 'changed';

/**
 * One human-readable change between `baseline` and `values`.
 *
 * `before` is always `undefined` when `kind === 'added'` and `after` is always `undefined` when
 * `kind === 'removed'`, even when the absent side was `null`: both are normalized to `undefined`
 * (see "Absent" in {@link ChangeSummaryOptions}).
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
   *  (1-based), or the `labels` override for that segment. */
  labelPath: string[];
  /** `labelPath.join(' > ')`, e.g. `Line Items > Item 3 > Price`. */
  label: string;
  kind: ChangeKind;
  /** Value in the baseline (`undefined` when `kind === 'added'`). */
  before: unknown;
  /** Value in `values` (`undefined` when `kind === 'removed'`). */
  after: unknown;
}

/**
 * Options of `computeChangeSummary` / `useChangeSummary`.
 *
 * ## "No value" rule
 *
 * Two classes of value:
 * - **Absent** = `undefined`, `null`, missing key (a key present with value `undefined` is the
 *   same as a missing key).
 * - **Empty** = Absent ∪ `''` ∪ `[]` ∪ plain object (prototype `Object.prototype` or `null`)
 *   whose own enumerable properties are all Empty, recursively (`{}` included).
 *
 * Applied in this order to every node (after `isEqual`):
 * 1. Both sides Empty → no entry for that node nor for its descendants (unless a custom `isEqual`
 *    returns `false` on one of them: see `isEqual`).
 * 2. One side Absent and the other not Empty → **one** entry on the node, `added` (baseline
 *    absent) or `removed` (values absent), without descending to the leaves. Only exception: an
 *    array with a declared id key, where Absent counts as `[]` (one entry per item).
 * 3. Otherwise (including `''`/`[]`/empty object against a non-empty value) → structural
 *    comparison: `''` → `'abc'` is `changed` with `before: ''`; `[]` → `[x]` without id key is a
 *    block `changed`; `{}` → `{ a: 'x' }` descends and gives `added` on `a`.
 *
 * No other normalization: `' '` against `''` is `changed`, there is no type coercion (`5` against
 * `'5'` is `changed`) and `0`, `false`, `NaN` are not Empty.
 *
 * ## Default leaf comparison
 *
 * Same rules as the structural equality behind `isDirty` in core's `useObjectPageForm`, with the
 * deliberate differences above (Absent/Empty classes, a key with value `undefined` equals a
 * missing key):
 * - primitives with `===`, except `NaN` equals `NaN` (`0` equals `-0`);
 * - `Date` by `getTime()` (two invalid dates are equal);
 * - arrays and plain objects by content; own enumerable string keys only (`Symbol` keys and
 *   non-enumerable properties are ignored; `constructor`, `__proto__`, ... as own properties are
 *   ordinary keys);
 * - anything else (`Map`, `Set`, class instances, functions) is a leaf compared by reference,
 *   never traversed and never Empty;
 * - a change of structural type between two non-Empty values (object ↔ string, array ↔ object,
 *   `Date` ↔ string, ...) is one `changed` entry on the node.
 *
 * Circular structures are supported: a (baseline, values) pair already being compared higher up
 * the stack is assumed equal.
 *
 * ## Order of `entries`
 *
 * Depth-first visit; object keys in the order of `values`, then the keys present only in the
 * baseline in their order; for arrays with an id key, items in the order of `values`, then the
 * `removed` items in the order of the baseline.
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
   * With an id key, items are matched by id (compared with `Object.is`, so `1` and `'1'` differ):
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
   * items without a counterpart). Return `true` → no entry for that subtree; `false` → one atomic
   * entry on the node, without descending (`changed`, or `added`/`removed` when one side is
   * Absent; `changed` when both are); `undefined` → default rules.
   *
   * Rule 1 does not cut the visit short for `isEqual`: under a pair where both sides are Empty
   * (e.g. `{ note: null }` against `{ note: '' }`, or an Empty object against an Absent side) the
   * descendants are still visited and `isEqual` is asked on each of them, so the verdict on a node
   * does not depend on whether it has a non-empty sibling. Their default stays "no entry"; only an
   * explicit `false` produces one. Without `isEqual` such subtrees are not visited at all.
   *
   * `useChangeSummary` compares this function by identity: pass a stable function (module scope
   * or `useCallback`), an inline one recomputes the summary on every render.
   */
  isEqual?: (a: unknown, b: unknown, path: string) => boolean | undefined;
}

/** Return value of `useChangeSummary`. */
export interface UseChangeSummaryReturn {
  /** Same array as `computeChangeSummary` returns, referentially stable while inputs are. */
  entries: ChangeEntry[];
  /** `entries.length === 0`. */
  isEmpty: boolean;
}
