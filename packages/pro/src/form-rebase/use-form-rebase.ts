import { useCallback, useEffect, useInsertionEffect, useMemo, useRef, useState } from 'react';
import { unstable_batchedUpdates } from 'react-dom';
import type { UseObjectPageFormReturn } from '@formrail/core';
import type { ChangeEntry } from '../change-summary/types';
import { MISSING, idMapKey, isPlainObject, itemId, own, type PlainObject } from '../internal/structural-diff';
import { arrange, decisionDiffer, keysOf, rebaseInternal, type ConflictRecord, type Segment } from './compute-rebase';
import type { RebaseConflict, UseFormRebaseOptions, UseFormRebaseReturn } from './types';

interface RebaseState {
  applied: ChangeEntry[];
  records: readonly ConflictRecord[];
}

const NO_APPLIED: ChangeEntry[] = [];
const EMPTY: RebaseState = { applied: NO_APPLIED, records: [] };

/** Returned by `setAt` when the path cannot be followed in the current values. */
const UNREACHABLE = Symbol('unreachable');

type IdSegment = Extract<Segment, { idKey: string }>;

const isIdSegment = (segment: Segment): segment is IdSegment => 'idKey' in segment;

const findById = (items: readonly unknown[], segment: IdSegment): number => {
  const key = idMapKey(segment.id);
  return items.findIndex((item) => idMapKey(itemId(item, segment.idKey)) === key);
};

/** Value at `segments` under `root` (`MISSING` when a step is absent). */
function valueAt(root: unknown, segments: readonly Segment[]): unknown {
  let current = root;
  for (const segment of segments) {
    if (isIdSegment(segment)) {
      if (!Array.isArray(current)) return MISSING;
      const index = findById(current, segment);
      if (index < 0) return MISSING;
      current = current[index];
    } else {
      if (!isPlainObject(current)) return MISSING;
      current = own(current, segment.key);
    }
  }
  return current;
}

/**
 * Copy of `current` with `value` at `segments` (`MISSING` removes the key or the item). An item
 * missing from its array is inserted after its predecessor in the matching array of `theirsRoot`
 * when that predecessor is present, otherwise at the end. `UNREACHABLE` when a parent is missing.
 */
function setAt(current: unknown, segments: readonly Segment[], value: unknown, theirsRoot: unknown): unknown {
  if (segments.length === 0) return value;
  const [segment, ...rest] = segments as [Segment, ...Segment[]];
  if (!isIdSegment(segment)) {
    if (!isPlainObject(current)) return UNREACHABLE;
    const theirsChild = isPlainObject(theirsRoot) ? own(theirsRoot, segment.key) : MISSING;
    const child = setAt(own(current, segment.key), rest, value, theirsChild);
    if (child === UNREACHABLE) return UNREACHABLE;
    const copy: PlainObject = Object.getPrototypeOf(current) === null ? (Object.create(null) as PlainObject) : {};
    for (const key of Object.keys(current)) {
      if (key !== segment.key) Object.defineProperty(copy, key, { value: current[key], enumerable: true, writable: true, configurable: true });
    }
    if (child !== MISSING) Object.defineProperty(copy, segment.key, { value: child, enumerable: true, writable: true, configurable: true });
    return copy;
  }
  if (!Array.isArray(current)) return UNREACHABLE;
  const index = findById(current, segment);
  const theirsItems: readonly unknown[] = Array.isArray(theirsRoot) ? theirsRoot : [];
  const theirsIndex = findById(theirsItems, segment);
  if (rest.length > 0) {
    if (index < 0) return UNREACHABLE;
    const item = setAt(current[index], rest, value, theirsIndex < 0 ? MISSING : theirsItems[theirsIndex]);
    if (item === UNREACHABLE) return UNREACHABLE;
    const copy = current.slice();
    copy[index] = item;
    return copy;
  }
  if (value === MISSING) return index < 0 ? current : current.filter((_, i) => i !== index);
  if (index >= 0) {
    const copy = current.slice();
    copy[index] = value;
    return copy;
  }
  const copy = current.slice();
  const predecessor = theirsIndex > 0 ? findById(copy, { idKey: segment.idKey, id: itemId(theirsItems[theirsIndex - 1], segment.idKey) }) : -1;
  if (predecessor >= 0) copy.splice(predecessor + 1, 0, value);
  else copy.push(value);
  return copy;
}

/** `current` reordered to the incoming order (items not in `theirs` placed as in `arrange`). */
function reorderedAs(current: readonly unknown[], theirs: readonly unknown[], idKey: string): unknown[] {
  const currentKeys = keysOf(current, idKey);
  const order = arrange(keysOf(theirs, idKey), currentKeys, new Set(currentKeys));
  return order.map((key) => current[currentKeys.indexOf(key)]);
}

/** Same relative order of the items `current` and `theirs` share. */
function sameOrder(current: readonly unknown[], theirs: readonly unknown[], idKey: string): boolean {
  const currentKeys = keysOf(current, idKey);
  const theirsKeys = keysOf(theirs, idKey);
  const inCurrent = new Set(currentKeys);
  const inTheirs = new Set(theirsKeys);
  const a = currentKeys.filter((key) => inTheirs.has(key));
  const b = theirsKeys.filter((key) => inCurrent.has(key));
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

/**
 * Applies the merge of `computeRebase` to a form of core's `useObjectPageForm`, through its public
 * API only (`baseline`, `values`, `isSaving`, `saveError`, `reset`, `setValues`).
 *
 * **Applying a rebase**: in an effect after the render in which `rebase(incoming)` is called, with
 * the `baseline` and `values` of that render: `form.reset(incoming)` then `form.setValues(merged)`,
 * in one batch, so no render ever shows `values === incoming` in between (`isDirty` and the footer
 * do not flicker). The form is dirty after it only when user edits are left against `incoming`.
 * `reset` clears `fieldErrors`, `formErrors` and `saveError`: validation runs again at the next
 * save. A top-level key cannot be removed through `setValues`; the core API never removes one
 * either, so a merge never needs to.
 *
 * **During a save** (`form.isSaving`): the rebase is queued (only the latest `incoming`),
 * `isPending` is `true`, and it is applied when the save settles, against the baseline the save
 * left (the one returned by the handler on success, the unchanged one on failure). A `reset`
 * during a save would win over the save, so it is never called then.
 *
 * **Conflict lifecycle**: a conflict stays open until `acceptTheirs`/`keepMine`/`acceptAllTheirs`,
 * until a save succeeds (the user's values were saved: conflicts and `applied` are cleared, the
 * save is never blocked), or until the form is reset by the consumer (`reset()` or
 * `reset(newBaseline)`: conflicts and `applied` are cleared). A new rebase recomputes conflicts
 * and `applied` from scratch against its `incoming`. A conflict whose field the user brings back to
 * the incoming value (by hand) closes by itself and does not reopen. A `reset()` on a form that is
 * already clean changes nothing observable and keeps `applied`.
 *
 * `path` and `mine` of a conflict are those computed by the rebase; `acceptTheirs`/`keepMine`
 * take that `path`. Items of id-keyed arrays are found again by id, so a later reorder by the user
 * does not break the resolution. `acceptTheirs` on a top-level key the server removed goes through
 * `reset(baseline)` + `setValues` (the only way to remove a top-level key) and is ignored while
 * the form is saving.
 *
 * `options` are read when a rebase is applied or a conflict is checked: inline literals are fine.
 * SSR-safe: no access to `window`/`document`.
 */
export function useFormRebase<Values extends object>(
  form: UseObjectPageFormReturn<Values>,
  options: UseFormRebaseOptions<Values> = {},
): UseFormRebaseReturn<Values> {
  const [state, setState] = useState<RebaseState>(EMPTY);
  const [queued, setQueued] = useState<{ incoming: Values } | null>(null);

  // Synchronous mirrors, so several calls in one event compose.
  const stateRef = useRef(state);
  const queuedRef = useRef(queued);
  const formRef = useRef(form);
  const optionsRef = useRef(options);
  useInsertionEffect(() => {
    formRef.current = form;
    optionsRef.current = options;
  });
  /** Snapshot of the form in the previous effect run. */
  const observedRef = useRef<{ baseline: Values; values: Values; isSaving: boolean } | null>(null);
  /** Baseline set by this hook's own `reset`, not yet observed. */
  const ownBaselineRef = useRef<{ baseline: Values } | null>(null);

  const commitState = useCallback((next: RebaseState) => {
    if (stateRef.current === next) return;
    stateRef.current = next;
    setState(next);
  }, []);

  const isResolved = useCallback((record: ConflictRecord, values: Values): boolean => {
    const current = valueAt(values, record.segments);
    if (record.orderIdKey !== undefined) {
      return Array.isArray(current) && sameOrder(current, record.theirs as unknown[], record.orderIdKey);
    }
    return !decisionDiffer(optionsRef.current).differs(record.theirs, current, record.node);
  }, []);

  useEffect(() => {
    const prev = observedRef.current;
    observedRef.current = { baseline: form.baseline, values: form.values, isSaving: form.isSaving };
    const own = ownBaselineRef.current;
    ownBaselineRef.current = null;
    let next = stateRef.current;

    if (prev && next !== EMPTY) {
      const saved = prev.isSaving && !form.isSaving && form.saveError === null;
      const byOwnReset = own !== null && own.baseline === form.baseline;
      const rehydrated = form.baseline !== prev.baseline && !byOwnReset;
      const discarded = !byOwnReset && form.values === form.baseline && prev.values !== prev.baseline;
      if (saved || rehydrated || discarded) next = EMPTY;
    }
    if (next.records.length > 0) {
      const open = next.records.filter((record) => !isResolved(record, form.values));
      if (open.length !== next.records.length) next = { applied: next.applied, records: open };
    }

    const pending = queuedRef.current;
    const apply = pending !== null && !form.isSaving;
    let merged: { incoming: Values; values: Values } | undefined;
    if (apply) {
      queuedRef.current = null;
      const { incoming } = pending;
      if (incoming !== form.baseline) {
        const { arrayIdKeys, labels, isEqual } = optionsRef.current;
        const { result, records } = rebaseInternal({ baseline: form.baseline, values: form.values, incoming, arrayIdKeys, labels, isEqual });
        ownBaselineRef.current = { baseline: incoming };
        merged = { incoming, values: result.values };
        next = records.length === 0 && result.applied.length === 0 ? EMPTY : { applied: result.applied, records };
      }
    }
    // One batch: the form never renders `values === incoming` between `reset` and `setValues`.
    unstable_batchedUpdates(() => {
      if (apply) setQueued(null);
      if (merged) {
        form.reset(merged.incoming);
        if (merged.values !== merged.incoming) form.setValues(merged.values);
      }
      commitState(next);
    });
  });

  const rebase = useCallback((incoming: Values) => {
    const pending = queuedRef.current;
    if (pending ? pending.incoming === incoming : incoming === formRef.current.baseline) return;
    const next = { incoming };
    queuedRef.current = next;
    setQueued(next);
  }, []);

  /** Open records, all of them or those on `path`. */
  const openRecords = useCallback(
    (path?: string) =>
      stateRef.current.records.filter(
        (record) => (path === undefined || record.conflict.path === path) && !isResolved(record, formRef.current.values),
      ),
    [isResolved],
  );

  const close = useCallback(
    (closed: readonly ConflictRecord[]) => {
      if (closed.length === 0) return;
      const current = stateRef.current;
      commitState({ applied: current.applied, records: current.records.filter((record) => !closed.includes(record)) });
    },
    [commitState],
  );

  const takeTheirs = useCallback(
    (records: readonly ConflictRecord[]) => {
      const f = formRef.current;
      let values: PlainObject = f.values as PlainObject;
      let removesTopKey = false;
      let wholeValues = false;
      const done: ConflictRecord[] = [];
      for (const record of records) {
        let target: unknown;
        if (record.orderIdKey !== undefined) {
          const array = valueAt(values, record.segments);
          if (!Array.isArray(array)) {
            done.push(record);
            continue;
          }
          target = reorderedAs(array, record.theirs as unknown[], record.orderIdKey);
        } else target = record.theirs;
        if (record.segments.length === 0) {
          wholeValues = true;
          done.push(record);
          continue;
        }
        if (record.segments.length === 1 && target === MISSING) {
          if (f.isSaving) continue;
          removesTopKey = true;
        }
        const updated = setAt(values, record.segments, target, f.baseline);
        if (updated !== UNREACHABLE) values = updated as PlainObject;
        done.push(record);
      }
      if (wholeValues) {
        if (f.isSaving) return;
        ownBaselineRef.current = { baseline: f.baseline };
        f.reset();
      } else if (removesTopKey) {
        ownBaselineRef.current = { baseline: f.baseline };
        const merged = values as Values;
        unstable_batchedUpdates(() => {
          f.reset(f.baseline);
          f.setValues(merged);
        });
      } else if (values !== f.values) {
        const patch: PlainObject = {};
        for (const key of Object.keys(values)) {
          if (values[key] !== (f.values as PlainObject)[key]) patch[key] = values[key];
        }
        f.setValues(patch as Partial<Values>);
      }
      close(done);
    },
    [close],
  );

  const acceptTheirs = useCallback((path: string) => takeTheirs(openRecords(path)), [openRecords, takeTheirs]);
  const acceptAllTheirs = useCallback(() => takeTheirs(openRecords()), [openRecords, takeTheirs]);
  const keepMine = useCallback(
    (path: string) => close(stateRef.current.records.filter((record) => record.conflict.path === path)),
    [close],
  );

  const conflicts = useMemo<RebaseConflict[]>(
    () => state.records.filter((record) => !isResolved(record, form.values)).map((record) => record.conflict),
    [state.records, form.values, isResolved],
  );

  return {
    rebase,
    applied: state.applied,
    conflicts,
    acceptTheirs,
    keepMine,
    acceptAllTheirs,
    isPending: queued !== null && form.isSaving,
  };
}
