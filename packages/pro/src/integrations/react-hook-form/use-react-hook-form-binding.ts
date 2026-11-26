import { useInsertionEffect, useMemo, useState, useSyncExternalStore } from 'react';
// Types only (decision 2a of #489): the adapter calls the methods of the `form` object it receives (and reads two
// internal fields of its `control`, see `warnOnMissingInternals`) and never imports React Hook Form at runtime, so
// `react-hook-form` is an optional peer of `@formrail/pro`.
import type { FieldValues, KeepStateOptions, UseFormReturn } from 'react-hook-form';
import type { RebaseFormBinding } from '../../form-rebase/types';
import { useIsomorphicLayoutEffect } from '../../internal/use-isomorphic-layout-effect';
import { fieldErrorPaths, isPlainRecord, keepEditsSince, sameContent, samePathValue, snapshotOf } from './snapshot';

// Module-scoped: the package compiles without Node types, and the literal `process.env.NODE_ENV` that the
// bundlers replace stays in the output. Never a global declaration (it would clash with the consumer's
// `@types/node`).
declare const process: { env: { NODE_ENV?: string } };

/** Options of {@link useReactHookFormBinding}. */
export interface UseReactHookFormBindingOptions {
  /**
   * `true` while a save is in flight, when the save does not go through `handleSubmit` (for example the
   * `isPending` of a mutation). A rebase is queued while it is `true`. Call `binding.reset(saved)` before it
   * turns `false`: during the save it keeps what the user typed meanwhile, after it it is a plain hydration.
   * @default formState.isSubmitting
   */
  isSaving?: boolean;
  /**
   * Error of the last save, `null` when it did not fail: read when the save settles (`isSaving` back to
   * `false`), a `null` closes the open conflicts. Pass it together with `isSaving` (for example the `error`
   * of the same mutation). `undefined` keeps the mapping from React Hook Form.
   * @default formState.isSubmitted && !formState.isSubmitSuccessful ? formState.errors : null
   */
  saveError?: unknown;
  /**
   * Identity key per array, keyed by a path without indexes (`{ lineItems: 'id' }`): pass the same `arrayIdKeys`
   * as to `useChangeSummary` / `useFormRebase`. Read when a save settles while the user kept typing: the rows
   * of an array edited meanwhile are matched by id, so a reorder by the server never moves an edit to another
   * row. Without it (or with a row without id), an array edited during the save is kept whole.
   */
  arrayIdKeys?: Readonly<Record<string, string>>;
}

/**
 * What a reset or a merge of the binding keeps of React Hook Form's own state: the fields the user visited,
 * the errors (see `clearStaleErrors`), the submit count and flags. `keepFieldsRef` is added for a form with
 * `shouldUnregister` (see `writeValues`).
 */
const KEEP_INTERACTION: KeepStateOptions = {
  keepErrors: true,
  keepTouched: true,
  keepIsSubmitted: true,
  keepIsSubmitSuccessful: true,
  keepSubmitCount: true,
};

interface Snapshot<Values> {
  baseline: Values;
  values: Values;
}

interface RhfEvent {
  name?: string;
}

type AnyForm<Values extends FieldValues> = UseFormReturn<Values, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The store behind one binding: the snapshots of one React Hook Form `control`, kept up to date from its
 * value events, and the binding's `reset` / `setValues`.
 */
class BindingStore<Values extends FieldValues> {
  readonly form: AnyForm<Values>;
  readonly control: AnyForm<Values>['control'];
  private state: Snapshot<Values>;
  /** The defaults object of React Hook Form last seen: it is replaced (new identity) by every reset. */
  private defaults: unknown;
  private readonly listeners = new Set<() => void>();
  /** Set while the binding itself drives React Hook Form: its value events are not read back. */
  private busy = 0;
  /**
   * The values before the first `reset`/`setValues` of the current synchronous run, and the errors the run
   * removed, so a `setValues` right after a `reset` (a rebase) can put back the errors of the fields it gives
   * back their value. Closed at the next microtask.
   */
  private run: { before: Values; removed: Map<string, { type: string; message?: string }> } | null = null;
  /** `isSaving` as of the last commit (see `observeSaving`). */
  private saving = false;
  /** The `arrayIdKeys` option as of the last commit. */
  arrayIdKeys: Readonly<Record<string, string>> | undefined = undefined;
  /**
   * The values when the save in flight started (`isSaving` turned `true`), `null` when no save is in flight or
   * when a reset or a rehydration happened since (the reset wins: the save's result is then a plain hydration).
   */
  private sent: Values | null = null;
  /** `formState.submitCount` as React Hook Form last notified it (see `subscribe`). */
  private submitCount = 0;
  /**
   * The `submitCount` before the submit that `reset(saved)` ended (`null`: none): that submit, once counted, saved
   * (see `saveErrorOf`). Bound to that one submit: the next submit ends at another count, and a reset that lowers
   * the count clears it, so a count that comes back to the same number never marks another submit as saved.
   */
  private savedAt: number | null = null;
  /**
   * The write to React Hook Form of the current synchronous run, not done yet (see `write`): the values, the
   * defaults (`null`: React Hook Form's stay), React Hook Form's values it is measured from (`base`, a snapshot)
   * and its defaults object at that moment (`since`).
   */
  private pending: { values: Values; defaults: Values | null; base: Values; since: unknown } | null = null;

  constructor(form: AnyForm<Values>) {
    this.form = form;
    this.control = form.control;
    warnOnMissingInternals(form.control);
    this.defaults = form.control._defaultValues;
    this.submitCount = form.formState.submitCount;
    const baseline = snapshotOf<unknown>(this.defaults ?? {}) as Values;
    // Equal content: the form starts as after a reset (`values === baseline`).
    this.state = { baseline, values: snapshotOf(form.getValues(), baseline) };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    // `watch(callback)` receives every value event of the form, with its field name (none for `reset` and
    // `setValues` of the whole form). It registers no form-state proxy and does not mark the form mounted.
    const subscription = this.form.watch((_, info) => this.sync(info));
    // `submitCount` as React Hook Form notifies it, synchronously (a render can show a reset and the next submit as
    // one). Only a reset lowers it (to 0, without `keepSubmitCount`): the submit `reset(saved)` ended is then no
    // longer the last one, and the count can come back to the same number with another submit.
    const submits = this.form.subscribe({
      formState: { submitCount: true },
      callback: ({ submitCount = 0 }) => {
        if (submitCount < this.submitCount) this.savedAt = null;
        this.submitCount = submitCount;
      },
    });
    return () => {
      subscription.unsubscribe();
      submits();
      this.listeners.delete(listener);
    };
  };

  /**
   * The current snapshots, re-read from the form (an event can come before the subscription). Called during
   * render: it updates the snapshots without notifying (React compares what it returns).
   */
  getSnapshot = (): Snapshot<Values> => {
    this.sync(undefined, false);
    return this.state;
  };

  /**
   * Re-reads the form after a commit: a field that registers writes its first value into the form without any
   * event (the ref callback of its input), and the snapshots must not wait for the next keystroke to show it.
   */
  resync = (): void => {
    this.flush();
    this.sync();
  };

  /**
   * The default `saveError`: React Hook Form's errors when the last submit was not successful, `null` when it
   * succeeded or when `reset(saved)` ended it. React Hook Form decides `isSubmitSuccessful` at the end of the
   * submit from the errors of that moment: a validation error the user caused while the server was saving
   * (typing during the save) would report a save that succeeded as failed. The errors stay on their fields.
   */
  saveErrorOf(formState: { isSubmitted: boolean; isSubmitSuccessful: boolean; submitCount: number; errors: unknown }): unknown {
    if (!formState.isSubmitted || formState.isSubmitSuccessful) return null;
    return this.savedAt !== null && this.savedAt === formState.submitCount - 1 ? null : formState.errors;
  }

  /**
   * Re-reads the defaults and the values of the form. A new defaults object (a reset, the `values` prop,
   * `resetField` with a default) gives a new `baseline` when its content differs. `values` is a new object
   * only when the content changed; it becomes the `baseline` object itself after an update of the whole form
   * (`event` without a field name: `reset`, `setValues`) that leaves the values equal to the baseline, or
   * when the baseline was replaced by values of the same content (a hydration), never after a field edit.
   */
  private sync(event?: RhfEvent, notify = true): void {
    if (this.busy > 0) return;
    const { form } = this;
    const { pending } = this;
    // A write of the binding not done yet: React Hook Form still holds the values before it. A value event now is a
    // write of the app made after the binding's, in the same run: it is folded into the pending write (see `absorb`).
    if (pending !== null) {
      if (event === undefined) return;
      this.absorb(pending);
    }
    const prev = this.state;
    let baseline = prev.baseline;
    const defaults = form.control._defaultValues;
    if (defaults !== this.defaults) {
      this.defaults = defaults;
      baseline = snapshotOf<unknown>(defaults ?? {}, prev.baseline) as Values;
    }
    let values = snapshotOf(pending === null ? form.getValues() : pending.values, prev.values);
    const wholeForm = event !== undefined && event.name === undefined;
    if ((wholeForm || baseline !== prev.baseline) && values !== baseline && sameContent(values, baseline)) values = baseline;
    // A discard (`form.reset()`) or a rehydration (`form.reset(data)`) during a save: the reset wins, the save's
    // result is then a plain hydration. (With `handleSubmit` React Hook Form also ends `isSubmitting` there; a save
    // of your own, through the `isSaving` option, does not.)
    if (wholeForm && values === baseline) this.sent = null;
    this.commit({ baseline, values }, notify);
  }

  /**
   * Called at each commit with the binding's `isSaving` (before any layout effect, so before the rebase engine
   * reads it): when a save starts, the values are kept as the values sent, for the `reset(saved)` that ends it.
   */
  observeSaving = (saving: boolean): void => {
    if (saving === this.saving) return;
    this.saving = saving;
    this.sent = saving ? this.state.values : null;
  };

  private commit(next: Snapshot<Values>, notify = true): void {
    if (next.baseline === this.state.baseline && next.values === this.state.values) return;
    this.state = next;
    if (notify) for (const listener of this.listeners) listener();
  }

  /**
   * Schedules the write of `values` to React Hook Form, and of `defaults` as its defaults (`null`: they stay, or
   * those of an earlier write of the same run). The write happens once, at the end of the synchronous run (the
   * binding's layout effect or a microtask, whichever comes first), with the last values: a rebase is
   * `reset(incoming)` then `setValues(merged)`, and writing `incoming` first would put the server value in the
   * field the user is typing in, then the user's value back (the caret jumps to the end).
   */
  private write(values: Values, defaults: Values | null): void {
    const { pending } = this;
    if (pending !== null) {
      pending.values = values;
      if (defaults !== null) pending.defaults = defaults;
      return;
    }
    const base = snapshotOf(this.form.getValues(), this.state.values);
    this.pending = { values, defaults, base, since: this.control._defaultValues };
    // `resync`: the flush, then the snapshots re-read (a write of the app folded in at the flush changes them).
    queueMicrotask(this.resync);
  }

  /**
   * A write of the app to React Hook Form while the binding's write waits (`form.setValue`, a `Controller`, a
   * `useFieldArray` operation, `form.reset` right after `binding.reset` / `setValues`): it comes later in call
   * order, so it wins on what it changed. The fields it changed since `base` take its value in the pending write,
   * the others keep the binding's (`adoptWrites`). New defaults (a reset or a rehydration of the app) replace the
   * whole form: the binding's write is dropped, values and defaults.
   */
  private absorb(pending: NonNullable<BindingStore<Values>['pending']>): void {
    const current = snapshotOf(this.form.getValues(), pending.base);
    if (this.control._defaultValues !== pending.since) {
      pending.values = current;
      pending.defaults = null;
      pending.since = this.control._defaultValues;
    } else {
      pending.values = adoptWrites(pending.base, current, pending.values, '', this.arrayIdKeys) as Values;
    }
    pending.base = current;
  }

  /**
   * The pending write, keeping the interaction state (touched fields, errors, submit count and flags). Never
   * React Hook Form's `reset` when it can be avoided: a reset regenerates the ids of every `useFieldArray` row
   * (new React keys: the rows remount, the focus is lost), always sets `isSubmitting` to `false`, and makes the
   * `handleSubmit` in flight skip its own end. Instead, `setValue` on each changed leaf only (no event of type
   * `change`, no validation, no `onChange` of a `Controller`; a field the binding does not change is not
   * written, so the field being typed in keeps its caret), then `resetDefaultValues` with the defaults, which
   * recomputes `dirtyFields` and `isDirty`. A reset only when a top-level key must go (only a reset removes one).
   */
  flush = (): void => {
    const pending = this.pending;
    if (pending === null) return;
    const { form } = this;
    // A write of the app with no value event (a `useFieldArray` operation: `append`, `remove`, ...) is folded in too.
    if (!sameContent(form.getValues(), pending.base)) this.absorb(pending);
    this.pending = null;
    const { values } = pending;
    // Defaults the app wrote after the binding's write with no value event (`resetDefaultValues`, `resetField` with
    // a default) win: the binding's are not written, and the baseline follows React Hook Form's at the next read.
    const replaced = form.control._defaultValues !== pending.since;
    const defaults = replaced ? null : pending.defaults;
    this.busy += 1;
    try {
      const current = form.getValues();
      if (keepsEveryKey(current, values)) {
        writeChanges((path, value) => form.setValue(path as never, value as never), '', '', current, values, this.arrayIdKeys);
        form.resetDefaultValues((defaults ?? form.control._defaultValues) as never);
      } else {
        // With `shouldUnregister`, a reset keeps only the values of the mounted fields it is told to keep.
        const keep = { ...KEEP_INTERACTION, keepFieldsRef: form.control._options.shouldUnregister === true };
        form.reset(defaults ?? values, { ...keep, keepDefaultValues: defaults === null });
        // In the same call: the fields re-register at the next render with the final values.
        if (defaults !== null && values !== defaults) form.reset(values, { ...keep, keepDefaultValues: true });
      }
    } finally {
      this.busy -= 1;
    }
    if (!replaced) this.defaults = form.control._defaultValues;
  };

  private beginRun(): NonNullable<BindingStore<Values>['run']> {
    if (this.run === null) {
      const run = { before: this.state.values, removed: new Map<string, { type: string; message?: string }>() };
      this.run = run;
      queueMicrotask(() => {
        if (this.run === run) this.run = null;
      });
    }
    return this.run;
  }

  /**
   * The errors of a field whose value the run changed are removed (they were about a value the field no longer
   * has: validation runs again at the next change or submit); the errors of a field the run left as it was stay,
   * including those a previous step of the same run had removed (a rebase: `reset(incoming)` then
   * `setValues(merged)` gives the user's fields their value back).
   */
  private clearStaleErrors(run: NonNullable<BindingStore<Values>['run']>): void {
    const { form } = this;
    const after = this.state.values;
    for (const [errorPath, error] of run.removed) {
      const valuePath = errorPath.endsWith('.root') ? errorPath.slice(0, -'.root'.length) : errorPath;
      if (samePathValue(run.before, after, valuePath)) {
        run.removed.delete(errorPath);
        form.setError(errorPath as never, error);
      }
    }
    const stale: string[] = [];
    for (const { errorPath, valuePath } of fieldErrorPaths(form.getErrors())) {
      if (samePathValue(run.before, after, valuePath)) continue;
      const error = form.getErrors(errorPath as never) as { type?: unknown; message?: unknown } | undefined;
      if (error && typeof error.type === 'string') {
        run.removed.set(errorPath, { type: error.type, ...(typeof error.message === 'string' ? { message: error.message } : {}) });
      }
      stale.push(errorPath);
    }
    if (stale.length > 0) form.clearErrors(stale as never);
  }

  /**
   * Before a write of the binding: the snapshots take the writes of the app that sent no value event (a
   * `useFieldArray` `append` / `remove` made earlier in the run), so the binding writes on top of them instead of
   * undoing them; a `reset` or a `setValues` of the same array still comes later in call order, and wins.
   */
  private catchUp(): void {
    const { pending } = this;
    if (pending === null) this.sync();
    else if (!sameContent(this.form.getValues(), pending.base)) {
      this.absorb(pending);
      this.commit({ baseline: this.state.baseline, values: snapshotOf(pending.values, this.state.values) });
    }
  }

  reset = (next?: Values): void => {
    this.catchUp();
    const run = this.beginRun();
    const { sent } = this;
    this.sent = null;
    // `reset(saved)` during a submit ends it as saved, whatever errors React Hook Form sees at its end.
    if (next !== undefined && this.saving) this.savedAt = this.submitCount;
    const target = next ?? this.state.baseline;
    // During a save, `reset(saved)` ends it: the fields edited since the save started keep the typed value (dirty
    // against `saved`), the others take what the server stored. Nothing edited meanwhile: `values` is `saved`.
    const values = next !== undefined && sent !== null ? keepEditsSince(sent, this.state.values, next, this.arrayIdKeys) : target;
    // `reset()` keeps React Hook Form's defaults (the baseline does not change).
    this.write(values, next === undefined ? null : target);
    this.commit({ baseline: target, values });
    this.clearStaleErrors(run);
  };

  setValues = (patch: Partial<Values>): void => {
    this.catchUp();
    const run = this.beginRun();
    const merged = { ...this.state.values, ...patch } as Values;
    const values = snapshotOf(merged, this.state.values);
    if (values !== this.state.values) {
      this.write(merged, null);
      this.commit({ baseline: this.state.baseline, values });
    }
    this.clearStaleErrors(run);
  };
}

/**
 * Binds a React Hook Form form (`useForm()`) to the `RebaseFormBinding` contract of `@formrail/pro/engine`, so
 * `useFormRebase` and `useChangeSummary` work on it:
 *
 * ```tsx
 * const form = useForm<Invoice>({ defaultValues: saved });
 * const binding = useReactHookFormBinding(form);
 * const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
 * const { rebase, conflicts, keepMine, acceptTheirs, isPending } = useFormRebase(binding);
 * ```
 *
 * **Snapshots**: React Hook Form mutates its values in place and clones the defaults it receives. `values`
 * and `baseline` are immutable copies, a new object only when the content changes (unchanged subtrees keep
 * their identity), the same object across renders that change no value (blur, `trigger()`, a parent's state).
 * `baseline` follows the defaults of React Hook Form: a new object after `form.reset(data)`, a change of the
 * `values` prop, `resetField` with a default, or a reset of the binding. `values === baseline` only after a
 * reset (of the binding, or of the whole form to the baseline content); typing the saved value back gives
 * another object.
 *
 * **`reset(b)` / `setValues(patch)`** (what the rebase calls): `reset(b)` makes `baseline` and `values` the
 * object `b` itself (React Hook Form gets a copy as its defaults; during a save, see "Saving"); `setValues`
 * merges the top-level keys of `patch`. What they change is written to React Hook Form once, at the end of the
 * synchronous run, without its `reset`: `setValue` on each changed field only (no validation, no
 * `type: 'change'` event, no remount of the `useFieldArray` rows, the field being typed in is not rewritten),
 * then `resetDefaultValues` (`dirtyFields` and `isDirty` against the baseline). Only a top-level key that must
 * go is written with `reset`. A write of the app made after them in the same run (`form.setValue`, a `Controller`,
 * a `useFieldArray` operation, `form.reset`) wins on what it changes: rows the binding added, removed or reordered
 * stay, with the app's writes on the row they were made on; an array whose rows the app added, removed or reordered
 * is the app's. A write of the app made before them is what they write on top of (an `append` stays where they do
 * not write). Both keep `touchedFields`, `submitCount` and the submit flags. An error stays on a
 * field whose value they did not change; the error of a field that took another value is removed (validation
 * runs again at the next change or submit).
 *
 * **Saving**: `isSaving` is `formState.isSubmitting`; `saveError` is `null` unless the last submit failed
 * (validation, or a handler that threw before `reset(saved)`: a submit ended by `reset(saved)` has saved, also
 * when a validation error appeared meanwhile; that submit only, also after a `form.reset()`). To save through `handleSubmit`, call `binding.reset(saved)` in the
 * handler before it resolves: a rebase queued meanwhile is then merged against what was saved. A save that
 * does not go through `handleSubmit` passes `isSaving` and `saveError` (see the options). While a save is in
 * flight, `reset(saved)` ends it as core's `save` does: `saved` is the baseline, the fields edited since
 * `isSaving` turned `true` keep the typed value (dirty), the others take what the server stored (clean);
 * `values` is `saved` itself when nothing was edited meanwhile; the rows of an array are matched by id with the
 * `arrayIdKeys` option (otherwise an array edited meanwhile is kept whole). A discard or a rehydration during the
 * save wins (`reset(saved)` is then a plain hydration). Since the binding never writes with React Hook Form's
 * `reset` (but for a top-level key that must go), `isSaving` stays `true` until the handler returns.
 *
 * **Hydration**: `form.reset(data)`, the `values` prop, or an async `defaultValues`: while it loads
 * (`formState.isLoading`), `baseline` is `values` (nothing is edited yet).
 *
 * Every field must have a default in `defaultValues` (`''` for an empty text input), as React Hook Form needs
 * for `isDirty`: a field registered without one enters `values` but not `baseline` and is listed as added
 * (also with a default declared on the field: the `defaultValue` of a `Controller`). The baseline never
 * changes because a field registers, so the open conflicts stay open.
 *
 * SSR-safe: no access to `window`/`document`.
 */
export function useReactHookFormBinding<Values extends FieldValues>(
  form: UseFormReturn<Values, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  options: UseReactHookFormBindingOptions = {},
): RebaseFormBinding<Values> {
  // One store per form `control`: stable for a `useForm` call, also through `useFormContext()`, whose object
  // changes identity with the form state (its methods do not). Another form: a new store, set during render.
  const [owned, setOwned] = useState(() => new BindingStore(form));
  let store = owned;
  if (store.control !== form.control) {
    store = new BindingStore(form);
    setOwned(store);
  }
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // After the refs of the inputs (children first): a field registered in this commit is read before paint.
  useIsomorphicLayoutEffect(store.resync);

  // Read only when not replaced: reading `formState` subscribes the form's component to that key.
  const isSaving = options.isSaving ?? form.formState.isSubmitting;
  const { submitCount } = form.formState;
  let saveError = options.saveError;
  if (saveError === undefined) {
    const { isSubmitted, isSubmitSuccessful } = form.formState;
    saveError = store.saveErrorOf({ isSubmitted, isSubmitSuccessful, submitCount, get errors() { return form.formState.errors; } });
  }
  // Before every layout effect of the commit (the rebase engine reads `isSaving` in one, also in a child).
  useInsertionEffect(() => store.observeSaving(isSaving), [store, isSaving]);
  const { arrayIdKeys } = options;
  useInsertionEffect(() => {
    store.arrayIdKeys = arrayIdKeys;
  }, [store, arrayIdKeys]);

  // `defaultValues` as an async function: until it resolves the form is hydrating, not edited. React Hook Form
  // has no defaults yet (`{}`) while the inputs already wrote their `''`: the baseline is the values themselves
  // (nothing dirty, no row), and the resolved defaults arrive as a rehydration.
  const isLoading = form.formState.isLoading;
  const values = snapshot.values;
  const baseline = isLoading ? values : snapshot.baseline;

  return useMemo(
    () => ({ baseline, values, isSaving, saveError, reset: store.reset, setValues: store.setValues }),
    [baseline, values, isSaving, saveError, store],
  );
}

/** `true` when every top-level key of `current` is also in `next` (a write that removes none). */
function keepsEveryKey(current: object, next: object): boolean {
  return Object.keys(current).every((key) => Object.prototype.hasOwnProperty.call(next, key));
}

const join = (path: string, segment: string): string => (path === '' ? segment : `${path}.${segment}`);

/** The ids of the rows of `rows`, in order, or `null` when a row has none. */
function rowIds(rows: unknown[], idKey: string): unknown[] | null {
  const ids: unknown[] = [];
  for (const row of rows) {
    const id = isPlainRecord(row) ? row[idKey] : undefined;
    if (id === undefined || id === null) return null;
    ids.push(id);
  }
  return ids;
}

type IdKeys = Readonly<Record<string, string>> | undefined;

/** The id key of the rows of the array at `schemaPath`, `undefined` when none is given. */
function idKeyOf(idKeys: IdKeys, schemaPath: string): string | undefined {
  const idKey = idKeys !== undefined && Object.hasOwn(idKeys, schemaPath) ? idKeys[schemaPath] : undefined;
  return typeof idKey === 'string' ? idKey : undefined;
}

/**
 * `true` when the arrays `a` and `b` have the same length and, with an id key for `schemaPath`, the same ids in
 * the same order: the same rows, compared index by index.
 */
function sameRows(a: unknown[], b: unknown[], schemaPath: string, idKeys: IdKeys): boolean {
  if (a.length !== b.length) return false;
  const idKey = idKeyOf(idKeys, schemaPath);
  if (idKey === undefined) return true;
  const before = rowIds(a, idKey);
  const after = rowIds(b, idKey);
  return before !== null && after !== null && before.every((id, index) => Object.is(id, after[index]));
}

/**
 * `setValue` (a copy, by React Hook Form) on each path where `next` differs from `current`, as deep as possible:
 * into plain objects that keep all their keys, into arrays that keep their length and, with an id key, the same
 * ids in the same order. Anywhere else the whole value is written (an array whose rows were added, removed or
 * reordered: React Hook Form re-creates its rows, as it must). `schemaPath` is `path` without the indexes.
 */
function writeChanges(
  setValue: (path: string, value: unknown) => void,
  path: string,
  schemaPath: string,
  current: unknown,
  next: unknown,
  idKeys: IdKeys,
): void {
  if (sameContent(current, next)) return;
  if (isPlainRecord(current) && isPlainRecord(next) && Object.keys(current).every((key) => Object.hasOwn(next, key))) {
    for (const key of Object.keys(next)) writeChanges(setValue, join(path, key), join(schemaPath, key), current[key], next[key], idKeys);
    return;
  }
  if (Array.isArray(current) && Array.isArray(next) && sameRows(current, next, schemaPath, idKeys)) {
    next.forEach((item: unknown, index) => writeChanges(setValue, join(path, String(index)), schemaPath, current[index], item, idKeys));
    return;
  }
  setValue(path, next);
}

/**
 * The binding's pending write `mine` with the writes of the app made since `base` on top (`theirs`: React Hook
 * Form now): where `theirs` differs from `base` it wins, elsewhere `mine` stays. Into plain objects, and into an
 * array whose rows the app left the same (see `sameRows`: it wrote fields of its rows): the binding's rows,
 * rows added or reordered by the binding included, each with the app's writes on the row it matches (by id with
 * an id key, a row without id matching none; by index without one); a row the binding removed drops the app's
 * writes on it. An array whose shape the app changed (rows added, removed or reordered by the app, whatever the
 * binding wrote there): the app's array whole. Never mutates its arguments. Exported for its unit test only (the
 * entry `@formrail/pro/react-hook-form` re-exports the hook alone).
 */
export function adoptWrites(base: unknown, theirs: unknown, mine: unknown, schemaPath: string, idKeys: IdKeys): unknown {
  if (sameContent(theirs, base)) return mine;
  if (sameContent(mine, base)) return theirs;
  if (isPlainRecord(base) && isPlainRecord(theirs) && isPlainRecord(mine)) {
    const out: Record<string, unknown> = { ...mine };
    for (const key of Object.keys(theirs)) {
      // Removed by the binding, left as it was by the app: stays removed.
      if (!Object.hasOwn(mine, key) && Object.hasOwn(base, key) && sameContent(theirs[key], base[key])) continue;
      out[key] = adoptWrites(base[key], theirs[key], mine[key], join(schemaPath, key), idKeys);
    }
    // Removed by the app (a field unregistered with `shouldUnregister`).
    for (const key of Object.keys(base)) if (!Object.hasOwn(theirs, key)) delete out[key];
    return out;
  }
  if (Array.isArray(base) && Array.isArray(theirs) && Array.isArray(mine) && sameRows(base, theirs, schemaPath, idKeys)) {
    const idKey = idKeyOf(idKeys, schemaPath);
    // Linear in the rows, as this runs at each value event of the app while a write waits. The binding kept the rows
    // of `base` (no id key, or the same ids in the same order): index by index, each row with the row at its own
    // index. Otherwise the index of each id in `base`, built once (on this path only, with duplicate ids in `base`
    // the first row with that id is the match). `base` and `theirs` hold the same rows, and with an id key every row
    // of `base` is a plain record with its id (see `sameRows`), so a row of the binding without id matches none.
    let indexOf: Map<unknown, number> | null = null;
    if (idKey !== undefined && !sameRows(base, mine, schemaPath, idKeys)) {
      indexOf = new Map();
      for (let index = base.length - 1; index >= 0; index -= 1) indexOf.set((base[index] as Record<string, unknown>)[idKey], index);
    }
    return mine.map((row: unknown, index) => {
      // No match (-1, or an index past `base`): `base[at]` and `theirs[at]` are both `undefined`, so the binding's row
      // stays as it is.
      const at = indexOf === null ? index : (indexOf.get(isPlainRecord(row) ? row[idKey!] : undefined) ?? -1);
      return adoptWrites(base[at], theirs[at], row, schemaPath, idKeys);
    });
  }
  return theirs;
}

/** The controls already warned about (one warning per form). */
const warnedControls = new WeakSet<object>();

/**
 * The adapter reads two internal fields of React Hook Form's `control`, which no public API exposes synchronously:
 * `_defaultValues` (the defaults React Hook Form holds, replaced by every reset: the baseline) and
 * `_options.shouldUnregister`. In development, a `control` without them (another major, a renamed field) gets a
 * clear warning instead of a silent baseline `{}` where every field is listed as added.
 */
function warnOnMissingInternals(control: unknown): void {
  if (process.env.NODE_ENV === 'production' || typeof control !== 'object' || control === null || warnedControls.has(control)) return;
  const { _defaultValues: defaults, _options: options } = control as { _defaultValues?: unknown; _options?: unknown };
  const problems: string[] = [];
  if (typeof defaults !== 'object' || defaults === null) problems.push('`control._defaultValues` is not an object');
  if (typeof options !== 'object' || options === null) problems.push('`control._options` is not an object');
  else {
    const { shouldUnregister } = options as { shouldUnregister?: unknown };
    if (shouldUnregister !== undefined && typeof shouldUnregister !== 'boolean') {
      problems.push('`control._options.shouldUnregister` is not a boolean');
    }
  }
  if (problems.length === 0) return;
  warnedControls.add(control);
  console.warn(
    `[formrail] useReactHookFormBinding: ${problems.join('; ')}. The adapter reads these internal fields of React Hook Form ` +
      '(tested with react-hook-form ^7.92.0): without them the baseline is `{}` and every field is listed as added.',
  );
}
