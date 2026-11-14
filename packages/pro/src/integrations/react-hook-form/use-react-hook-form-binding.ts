import { useInsertionEffect, useMemo, useState, useSyncExternalStore } from 'react';
// Types only (decision 2a of #489): the adapter calls the methods of the `form` object it receives (and reads two
// internal fields of its `control`, see `warnOnMissingInternals`) and never imports React Hook Form at runtime, so
// `react-hook-form` is an optional peer of `@formrail/pro`.
import type { FieldValues, KeepStateOptions, UseFormReturn } from 'react-hook-form';
import type { RebaseFormBinding } from '../../form-rebase/types';
import { isDev } from '../../internal/is-dev';
import { useIsomorphicLayoutEffect } from '../../internal/use-isomorphic-layout-effect';
import { fieldErrorPaths, keepEditsSince, sameContent, samePathValue, snapshotOf } from './snapshot';

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

  constructor(form: AnyForm<Values>) {
    this.form = form;
    this.control = form.control;
    warnOnMissingInternals(form.control);
    this.defaults = form.control._defaultValues;
    const baseline = snapshotOf<unknown>(this.defaults ?? {}) as Values;
    // Equal content: the form starts as after a reset (`values === baseline`).
    this.state = { baseline, values: snapshotOf(form.getValues(), baseline) };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    // `watch(callback)` receives every value event of the form, with its field name (none for `reset` and
    // `setValues` of the whole form). It registers no form-state proxy and does not mark the form mounted.
    const subscription = this.form.watch((_, info) => this.sync(info));
    return () => {
      subscription.unsubscribe();
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
    this.sync();
  };

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
    const prev = this.state;
    let baseline = prev.baseline;
    const defaults = form.control._defaultValues;
    if (defaults !== this.defaults) {
      this.defaults = defaults;
      baseline = snapshotOf<unknown>(defaults ?? {}, prev.baseline) as Values;
    }
    let values = snapshotOf(form.getValues(), prev.values);
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
   * Writes `values` to React Hook Form and `defaults` as its defaults (`null`: its defaults stay), keeping the
   * interaction state (touched fields, errors, submit count and flags).
   */
  private write(values: Values, defaults: Values | null): void {
    const { form } = this;
    this.busy += 1;
    try {
      if (this.saving && keepsEveryKey(form.getValues(), values)) {
        // During a save, never React Hook Form's `reset`: it always sets `isSubmitting` to `false`, and the
        // `handleSubmit` in flight, seeing a reset, skips its own end (no `isSubmitting: false`, `isSubmitted`,
        // submit count). The save would end for the binding at the first `setValues` (an `acceptTheirs`) and its
        // real end would never be seen. `setValues` writes the values in place (a copy: React Hook Form keeps the
        // objects it receives and mutates them later; no field re-registers, the DOM of a field being typed in
        // gets the value it already has); `resetDefaultValues` writes the defaults and recomputes `dirtyFields`
        // and `isDirty` against them. Neither touches the submit state.
        form.setValues(snapshotOf(values) as never);
        form.resetDefaultValues((defaults ?? form.control._defaultValues) as never);
      } else {
        // Outside a save, or when a top-level key must go (`setValues` only adds and replaces keys).
        // With `shouldUnregister`, a reset keeps only the values of the mounted fields it is told to keep.
        const keep = { ...KEEP_INTERACTION, keepFieldsRef: form.control._options.shouldUnregister === true };
        form.reset(defaults ?? values, { ...keep, keepDefaultValues: defaults === null });
        // Same synchronous run as a rebase: the fields re-register at the next render with the final values, so the
        // DOM of a field being typed in never shows `defaults`.
        if (defaults !== null && values !== defaults) form.reset(values, { ...keep, keepDefaultValues: true });
      }
    } finally {
      this.busy -= 1;
    }
    this.defaults = form.control._defaultValues;
  }

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

  reset = (next?: Values): void => {
    const run = this.beginRun();
    const { sent } = this;
    this.sent = null;
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
 * object `b` itself (React Hook Form gets a copy and makes it its defaults; during a save, see "Saving");
 * `setValues` writes the merged
 * values with `reset(merged, { keepDefaultValues: true })`, so `dirtyFields` and `isDirty` are computed
 * against the baseline, with no `setValue` per field (no validation, no `type: 'change'` event). Both keep
 * `touchedFields`, `submitCount` and the submit flags. An error stays on a field whose value they did not
 * change; the error of a field that took another value is removed (validation runs again at the next change
 * or submit).
 *
 * **Saving**: `isSaving` is `formState.isSubmitting`; `saveError` is `null` unless the last submit failed
 * (validation, or a handler that threw). To save through `handleSubmit`, call `binding.reset(saved)` in the
 * handler before it resolves: a rebase queued meanwhile is then merged against what was saved. A save that
 * does not go through `handleSubmit` passes `isSaving` and `saveError` (see the options). While a save is in
 * flight, `reset(saved)` ends it as core's `save` does: `saved` is the baseline, the fields edited since
 * `isSaving` turned `true` keep the typed value (dirty), the others take what the server stored (clean);
 * `values` is `saved` itself when nothing was edited meanwhile. A discard or a rehydration during the save wins
 * (`reset(saved)` is then a plain hydration).
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
  let saveError = options.saveError;
  if (saveError === undefined) {
    const { isSubmitted, isSubmitSuccessful } = form.formState;
    saveError = isSubmitted && !isSubmitSuccessful ? form.formState.errors : null;
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

/** The controls already warned about (one warning per form). */
const warnedControls = new WeakSet<object>();

/**
 * The adapter reads two internal fields of React Hook Form's `control`, which no public API exposes synchronously:
 * `_defaultValues` (the defaults React Hook Form holds, replaced by every reset: the baseline) and
 * `_options.shouldUnregister`. In development, a `control` without them (another major, a renamed field) gets a
 * clear warning instead of a silent baseline `{}` where every field is listed as added.
 */
function warnOnMissingInternals(control: unknown): void {
  if (!isDev() || typeof control !== 'object' || control === null || warnedControls.has(control)) return;
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
