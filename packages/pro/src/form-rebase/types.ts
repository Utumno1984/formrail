import type { ChangeEntry, ChangeSummaryOptions } from '../change-summary/types';

/**
 * Options of `computeRebase`: a three-way merge of `incoming` (a new version of the record from
 * the server) into `values` (the user's draft), both descending from `baseline`.
 *
 * ## "Touched" = different from the baseline
 *
 * A path is **touched** when `values` differs from `baseline` there, with the same rules as
 * `isDirty` of core's `useObjectPageForm` and `computeChangeSummary` (see "No value" rule and
 * "Default leaf comparison" on `ChangeSummaryOptions`: `''`, `null`, `undefined` and a missing key
 * are four distinct values). It is not a focus or typing flag: a field edited and then brought
 * back to its baseline value is not touched and takes the incoming value.
 *
 * ## Rule per path
 *
 * For a leaf, for an array without id key (a block) and for any node whose comparison is decided by
 * `isEqual` (`true`/`false`), "changed" meaning "different from `baseline`":
 *
 * | user (`values`) | server (`incoming`) | result | `applied` | `conflicts` |
 * |---|---|---|---|---|
 * | not changed | not changed | `incoming` | — | — |
 * | not changed | changed | `incoming` | the entries of `baseline` → `incoming` | — |
 * | changed | not changed | `values` | — | — |
 * | changed | changed to the same value | `values` | — | — |
 * | changed | changed to a different value | `values` | — | one conflict |
 *
 * A plain object changed by both sides is merged key by key with the same rule (keys of `values`
 * first, then the keys only in `incoming`); a key absent from the result is absent from the
 * merged object. Both sides plain objects is enough to descend: a `baseline` side that is Absent
 * (`undefined`, `null`, missing) gives Absent children. Any other pair changed by both sides
 * differently (type change, `Date`, `Map`, class instance, one side Absent) is one conflict on the
 * node.
 *
 * ## Arrays with an id key (`arrayIdKeys`)
 *
 * Merged item by item, items matched by id (same rules as `ChangeSummaryOptions.arrayIdKeys`):
 * - an item in all three sides is merged with the rule per path (on its fields);
 * - added by the server → added; added by the user → kept; added by both with the same id → one
 *   item, merged with the rule per path on its fields against an absent baseline;
 * - removed by the server and not touched by the user → removed (an `applied` entry `removed`);
 *   removed by the server **and** touched by the user → the user's item stays, one conflict on
 *   the item (`theirsMissing: true`);
 * - removed by the user and not changed by the server → removed; removed by the user **and**
 *   changed by the server → stays removed, one conflict on the item (`mineMissing: true`); removed
 *   by both → removed.
 *
 * **Order**: "the order" of a side is the relative order of the items it shares with `baseline`.
 * The user's order wins when the user changed it, otherwise the server's. The items that order does
 * not place (added by the other side, or kept after a conflict) go after their immediate
 * predecessor in the list of their side when that predecessor is in the result, otherwise at the
 * end (the first item of its list has no predecessor: at the end). Order changed by both sides in
 * different ways → the user's order and one conflict on the array path (order only: `base`,
 * `mine`, `theirs` are then the lists of ids of `baseline`, `values` and `incoming`, in their order).
 *
 * An array under an id key that holds an item without id (or that is not an object), or a
 * duplicate id, on any side is merged as a block (development `console.warn`, once per path).
 *
 * ## Paths of entries and conflicts
 *
 * Same notation as `ChangeEntry.path`. Indexes are positions in the result `values`; a `removed`
 * entry uses its index in `baseline`; a conflict on an item kept out of the result (removed by the
 * user) uses its index in `incoming`.
 */
export interface RebaseOptions<Values extends object> {
  /** Last saved or hydrated version known to the form (e.g. `useObjectPageForm().baseline`). */
  baseline: Values;
  /** The user's current values (e.g. `useObjectPageForm().values`). */
  values: Values;
  /** New version from the server; it becomes the new baseline. */
  incoming: Values;
  /** Same semantics as `ChangeSummaryOptions.arrayIdKeys`. */
  arrayIdKeys?: ChangeSummaryOptions<Values>['arrayIdKeys'];
  /** Same semantics as `ChangeSummaryOptions.labels` (labels of `applied` and `conflicts`). */
  labels?: ChangeSummaryOptions<Values>['labels'];
  /**
   * Same semantics as `ChangeSummaryOptions.isEqual`, called on the pairs (`baseline`, `values`),
   * (`baseline`, `incoming`) and (`values`, `incoming`) with the concrete path. A node on which it
   * returns `true` or `false` for any pair is never descended into: it follows the rule per path
   * as a whole.
   */
  isEqual?: ChangeSummaryOptions<Values>['isEqual'];
}

/**
 * A path changed by both the user and the server, to different values. The result keeps the
 * user's value (`mine`). `*Missing` tell a missing key (or an item without counterpart) from a key
 * present with value `undefined`, as `beforeMissing`/`afterMissing` of `ChangeEntry`.
 */
export interface RebaseConflict {
  /** Same notation as `ChangeEntry.path` (see "Paths" on {@link RebaseOptions}). */
  path: string;
  /** `labelPath.join(' > ')` as in `ChangeEntry.label`. */
  label: string;
  /** Value in `baseline`. */
  base: unknown;
  /** Value in the user's `values` (kept in the result). */
  mine: unknown;
  /** Value in `incoming`. */
  theirs: unknown;
  /** `true` when `baseline` has no key (or no array item) at this path: `base` is then `undefined`. */
  baseMissing: boolean;
  /** `true` when the user's `values` have no key (or no array item) at this path: `mine` is then `undefined`. */
  mineMissing: boolean;
  /** `true` when `incoming` has no key (or no array item) at this path: `theirs` is then `undefined`. */
  theirsMissing: boolean;
}

/**
 * An open conflict as `useFormRebase` returns it: the conflict of the rebase plus where its field is NOW.
 * Items of id-keyed arrays are found again by id, so after the user moves, removes or adds items above it,
 * `currentPath` and `labelPath` (and `label`) name the same item at its new position, while `path` stays the
 * key that `acceptTheirs` / `keepMine` take. An item the user removed has no current position: `currentPath`
 * is then `path`.
 */
export interface OpenRebaseConflict extends RebaseConflict {
  /** Same notation as `path`, with the current index of every id-keyed item on the way. Use it to find the field. */
  currentPath: string;
  /** One label per segment of `currentPath` (`Item N` for an array item), as `ChangeEntry.labelPath`; `label` is their join. */
  labelPath: string[];
}

/** Return value of `computeRebase`. */
export interface RebaseResult<Values> {
  /**
   * Values after the merge (the user's new draft). `incoming` itself when `values` is not touched
   * anywhere; `values` itself when `incoming` does not differ from `baseline`.
   */
  values: Values;
  /** The new baseline: always `incoming` (same reference). */
  baseline: Values;
  /**
   * Changes of the server applied to paths the user did not touch: the `ChangeEntry` list of
   * `baseline` → `incoming` on those paths (`before` = baseline, `after` = incoming). A reorder
   * gives no entry, as in `computeChangeSummary`.
   */
  applied: ChangeEntry[];
  /** Paths changed by both sides differently, in depth-first order of the result. */
  conflicts: RebaseConflict[];
}

/** Options of `useFormRebase` (the merge options of {@link RebaseOptions}). */
export interface UseFormRebaseOptions<Values extends object> {
  /** Same as `RebaseOptions.arrayIdKeys`: the key that identifies the items of an array, per array path. */
  arrayIdKeys?: RebaseOptions<Values>['arrayIdKeys'];
  /** Same as `RebaseOptions.labels`: label overrides of the path segments. */
  labels?: RebaseOptions<Values>['labels'];
  /** Same as `RebaseOptions.isEqual`: replaces the equality of two leaf values. */
  isEqual?: RebaseOptions<Values>['isEqual'];
}

/** Return value of `useFormRebase`. */
export interface UseFormRebaseReturn<Values extends object> {
  /**
   * Merges `incoming` into the form: `form.baseline` becomes `incoming`, `form.values` the merged
   * values. Applied after the render in which it is called; while `form.isSaving` it is queued
   * (only the latest `incoming`) and applied when the save settles, against the baseline the save
   * left. Calling it with the current `form.baseline` (or the object already queued) does nothing,
   * so it can be called on every render or in an effect on the data. Stable identity.
   */
  rebase: (incoming: Values) => void;
  /** `applied` of the last rebase, until the form is saved or reset. */
  applied: ChangeEntry[];
  /** Open conflicts (see the lifecycle on `useFormRebase`), with their current position (see {@link OpenRebaseConflict}). */
  conflicts: OpenRebaseConflict[];
  /** The field (or item, or order) takes the server value and the conflict is closed. Stable identity. */
  acceptTheirs: (path: string) => void;
  /** Closes the conflict and leaves the user's value. Stable identity. */
  keepMine: (path: string) => void;
  /** `acceptTheirs` on every open conflict, in one update. Stable identity. */
  acceptAllTheirs: () => void;
  /** `true` while a rebase is queued because a save is in flight. */
  isPending: boolean;
}
