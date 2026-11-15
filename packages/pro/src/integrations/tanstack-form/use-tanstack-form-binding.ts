import { useInsertionEffect, useMemo, useState, useSyncExternalStore } from 'react';
// Types only (decision 2a of #489): the adapter calls the methods of the `form` object it receives and never imports
// TanStack Form (nor `@tanstack/form-core` / `@tanstack/store`) at runtime, so `@tanstack/react-form` is an optional
// peer of `@formrail/pro`.
import type { ReactFormExtendedApi } from '@tanstack/react-form';
import type { RebaseFormBinding } from '../../form-rebase/types';
import { isDev } from '../../internal/is-dev';
import { useIsomorphicLayoutEffect } from '../../internal/use-isomorphic-layout-effect';
// The immutable snapshots and the save merge of the React Hook Form adapter (#507, #545): pure helpers, no form
// library, the same rules for both adapters.
import { keepEditsSince, sameContent, snapshotOf } from '../react-hook-form/snapshot';

/** Options of {@link useTanStackFormBinding}. */
export interface UseTanStackFormBindingOptions {
  /**
   * `true` while a save is in flight, when the save does not go through `form.handleSubmit()` (for example the
   * `isPending` of a mutation). A rebase is queued while it is `true`. Call `binding.reset(saved)` before it turns
   * `false`: during the save it keeps what the user typed meanwhile, after it it is a plain hydration.
   * @default form.state.isSubmitting
   */
  isSaving?: boolean;
  /**
   * Error of the last save, `null` when it did not fail: read when the save settles (`isSaving` back to `false`), a
   * `null` closes the open conflicts. Pass it together with `isSaving` (for example the `error` of the same
   * mutation). `undefined` keeps the mapping from TanStack Form.
   * @default form.state.submissionAttempts > 0 && !form.state.isSubmitting && !form.state.isSubmitSuccessful ? form.state.errors : null
   */
  saveError?: unknown;
  /**
   * Identity key per array, keyed by a path without indexes (`{ lineItems: 'id' }`): pass the same `arrayIdKeys` as
   * to `useChangeSummary` / `useFormRebase`. Read when a save settles while the user kept typing: the rows of an array
   * edited meanwhile are matched by id, so a reorder by the server never moves an edit to another row. Without it (or
   * with a row without id), an array edited during the save is kept whole.
   */
  arrayIdKeys?: Readonly<Record<string, string>>;
}

/** The form returned by `useForm()` of `@tanstack/react-form`, with its many generics left open but the values. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TanStackFormOf<Values> = ReactFormExtendedApi<Values, any, any, any, any, any, any, any, any, any, any, any>;

/** The part of TanStack Form's field meta the adapter reads and writes (`setFieldMeta`). */
interface FieldMetaLike {
  errorMap?: Record<string, unknown>;
  errorSourceMap?: Record<string, unknown>;
  _arrayVersion?: number;
}

/** What the adapter reads of the store state of TanStack Form. */
interface FormStateLike {
  values: unknown;
  fieldMeta: Record<string, FieldMetaLike | undefined>;
  errors: unknown[];
  isSubmitting: boolean;
  isSubmitSuccessful: boolean;
  submissionAttempts: number;
}

/**
 * The methods of TanStack Form's `form` object the adapter uses, nothing else: the derived store (read and
 * subscribed), the base store (one `setState` per write of the binding), `setFieldMeta`, and `Subscribe` (called
 * once as a plain function, see `liveFormApi`).
 */
interface FormLike {
  store: { readonly state: FormStateLike; subscribe: (listener: () => void) => { unsubscribe: () => void } | (() => void) };
  baseStore: { setState: (updater: (prev: { values: unknown }) => { values: unknown }) => void };
  setFieldMeta: (field: string, updater: (prev: FieldMetaLike | undefined) => FieldMetaLike) => void;
  options: { defaultValues?: unknown };
  Subscribe?: unknown;
}

interface Snapshot<Values> {
  baseline: Values;
  values: Values;
  isSubmitting: boolean;
  /** `form.state.errors` when the last submit did not succeed, `null` otherwise (the default `saveError`). */
  failed: unknown;
}

/** The errors of a field the run removed, to give them back if the run gives the field its value back. */
interface RemovedErrors {
  errorMap: Record<string, unknown>;
  errorSourceMap: Record<string, unknown> | undefined;
}

/**
 * The store behind one binding: the snapshots of one TanStack Form `form`, kept up to date from its store, and the
 * binding's `reset` / `setValues`.
 */
class BindingStore<Values extends object> {
  readonly form: FormLike;
  /** `form.store`: one per `useForm` call, the identity the binding is keyed by. */
  readonly key: object;
  /**
   * The `FormApi` instance behind `form`, whose `options` TanStack Form replaces at every render of `useForm` (the
   * object `useForm` returns is a copy made once, its `options` frozen at the first render).
   */
  private readonly api: { options: { defaultValues?: unknown } };
  private state: Snapshot<Values>;
  /** The defaults object of TanStack Form last seen (a new one at every render with an inline `defaultValues`). */
  private defaults: unknown;
  /** A snapshot of the content of the defaults last seen: a change of identity with the same content is no change. */
  private defaultsContent: unknown;
  /** The values object of TanStack Form last seen (TanStack Form replaces it at every change, never mutates it). */
  private source: unknown;
  private readonly listeners = new Set<() => void>();
  /** Set while the binding itself writes to TanStack Form: its store events are not read back. */
  private busy = 0;
  /**
   * The values before the first `reset`/`setValues` of the current synchronous run, and the errors the run removed,
   * so a `setValues` right after a `reset` (a rebase) can put back the errors of the fields it gives back their
   * value. Closed at the next microtask.
   */
  private run: { before: Values; removed: Map<string, RemovedErrors> } | null = null;
  /** `isSaving` as of the last commit (see `observeSaving`). */
  private saving = false;
  /** The `arrayIdKeys` option as of the last commit. */
  arrayIdKeys: Readonly<Record<string, string>> | undefined = undefined;
  /**
   * The values when the save in flight started (`isSaving` turned `true`), `null` when no save is in flight or when a
   * discard or a rehydration happened since (they win: the save's result is then a plain hydration).
   */
  private sent: Values | null = null;

  constructor(form: FormLike) {
    this.form = form;
    this.key = form.store;
    this.api = liveFormApi(form);
    this.defaults = this.api.options.defaultValues;
    const baseline = snapshotOf<unknown>(this.defaults ?? {}) as Values;
    this.defaultsContent = baseline;
    const state = form.store.state;
    this.source = state.values;
    // Equal content: the form starts as after a reset (`values === baseline`).
    this.state = { baseline, values: snapshotOf(state.values as Values, baseline), ...submitOf(state) };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    const subscription = this.form.store.subscribe(() => this.sync());
    return () => {
      if (typeof subscription === 'function') subscription();
      else subscription.unsubscribe();
      this.listeners.delete(listener);
    };
  };

  /** The current snapshots, re-read from the form. Called during render: updates without notifying. */
  getSnapshot = (): Snapshot<Values> => {
    this.sync(false);
    return this.state;
  };

  /**
   * Re-reads the form after a commit: `useForm` replaces the options of the form in its layout effect, and on a form
   * the user touched a new `defaultValues` changes no state of TanStack Form (no store event), only its defaults.
   */
  resync = (): void => {
    this.sync();
  };

  /**
   * Re-reads the defaults and the values of the form. Defaults of another content (`form.reset(data)`, a new
   * `defaultValues` passed to `useForm`) give a new `baseline`, unless they have the content of the current one (a
   * `defaultValues` that follows what `binding.reset(saved)` saved). `values` is a new object only when the content
   * changed; it becomes the `baseline` object itself when TanStack Form puts its defaults back as the values
   * (`form.reset()`, `form.reset(data)`, a new `defaultValues` on a form not touched) with the content of the
   * baseline, or when the baseline was replaced by values of the same content (a hydration), never after a field edit.
   */
  private sync(notify = true): void {
    if (this.busy > 0) return;
    const state = this.form.store.state;
    const prev = this.state;
    let baseline = prev.baseline;
    const defaults = this.api.options.defaultValues;
    if (defaults !== this.defaults) {
      this.defaults = defaults;
      if (!sameContent(defaults ?? {}, this.defaultsContent)) {
        this.defaultsContent = snapshotOf<unknown>(defaults ?? {}, this.defaultsContent);
        if (!sameContent(this.defaultsContent, baseline)) baseline = snapshotOf<unknown>(defaults ?? {}, baseline) as Values;
      }
    }
    let values = snapshotOf(state.values as Values, prev.values);
    // TanStack Form just put its defaults object itself as the values: a reset of the whole form (an edit never does,
    // `setFieldValue` copies the path it writes).
    const wholeForm = defaults !== undefined && state.values === defaults && state.values !== this.source;
    this.source = state.values;
    if ((wholeForm || baseline !== prev.baseline) && values !== baseline && sameContent(values, baseline)) values = baseline;
    // A discard or a rehydration during a save wins: the save's result is then a plain hydration.
    if ((wholeForm && values === baseline) || baseline !== prev.baseline) this.sent = null;
    this.commit({ baseline, values, ...submitOf(state) }, notify);
  }

  /**
   * Called at each commit with the binding's `isSaving` (before any layout effect, so before the rebase engine reads
   * it): when a save starts, the values are kept as the values sent, for the `reset(saved)` that ends it.
   */
  observeSaving = (saving: boolean): void => {
    if (saving === this.saving) return;
    this.saving = saving;
    this.sent = saving ? this.state.values : null;
  };

  private commit(next: Snapshot<Values>, notify = true): void {
    const prev = this.state;
    if (next.baseline === prev.baseline && next.values === prev.values && next.isSubmitting === prev.isSubmitting && next.failed === prev.failed) return;
    this.state = next;
    if (notify) for (const listener of this.listeners) listener();
  }

  /**
   * Writes `values` as the values of TanStack Form, in one update of its base store: no field meta written (not
   * touched, not dirty, not blurred), no `listeners.onChange`, no validator, keys removed as well as changed, one store
   * notification. The registered array fields whose array changed get their `_arrayVersion` bumped, as TanStack
   * Form's own array operations do, so a `form.Field` in `mode="array"` renders the new rows.
   */
  private write(values: Values): void {
    const { form } = this;
    const before = form.store.state.values;
    if (before === values) return;
    this.busy += 1;
    try {
      form.baseStore.setState((prev) => ({ ...prev, values }));
      this.source = values;
      for (const name of Object.keys(form.store.state.fieldMeta)) {
        const after = valueAt(values, name);
        if (Array.isArray(after.value) && after.value !== valueAt(before, name).value) {
          form.setFieldMeta(name, (meta) => ({ ...meta, _arrayVersion: (meta?._arrayVersion ?? 0) + 1 }));
        }
      }
    } finally {
      this.busy -= 1;
    }
  }

  private beginRun(): NonNullable<BindingStore<Values>['run']> {
    if (this.run === null) {
      const run = { before: this.state.values, removed: new Map<string, RemovedErrors>() };
      this.run = run;
      queueMicrotask(() => {
        if (this.run === run) this.run = null;
      });
    }
    return this.run;
  }

  /**
   * The errors of a field whose value the run changed are removed (they were about a value the field no longer has:
   * validation runs again at the next change, blur or submit); the errors of a field the run left as it was stay,
   * including those a previous step of the same run had removed (a rebase: `reset(incoming)` then `setValues(merged)`
   * gives the user's fields their value back).
   */
  private clearStaleErrors(run: NonNullable<BindingStore<Values>['run']>): void {
    const { form } = this;
    const after = this.state.values;
    this.busy += 1;
    try {
      for (const [name, removed] of run.removed) {
        if (!sameValueAt(run.before, after, name)) continue;
        run.removed.delete(name);
        form.setFieldMeta(name, (meta) => ({ ...meta, errorMap: removed.errorMap, errorSourceMap: removed.errorSourceMap }));
      }
      const { fieldMeta } = form.store.state;
      for (const name of Object.keys(fieldMeta)) {
        const meta = fieldMeta[name];
        if (!meta || !hasErrors(meta.errorMap) || sameValueAt(run.before, after, name)) continue;
        run.removed.set(name, { errorMap: meta.errorMap!, errorSourceMap: meta.errorSourceMap });
        form.setFieldMeta(name, (current) => ({ ...current, errorMap: {}, errorSourceMap: {} }));
      }
    } finally {
      this.busy -= 1;
    }
  }

  reset = (next?: Values): void => {
    const run = this.beginRun();
    const { sent } = this;
    this.sent = null;
    const target = next ?? this.state.baseline;
    // During a save, `reset(saved)` ends it: the fields edited since the save started keep the typed value (dirty
    // against `saved`), the others take what the server stored. Nothing edited meanwhile: `values` is `saved`.
    const values = next !== undefined && sent !== null ? keepEditsSince(sent, this.state.values, next, this.arrayIdKeys) : target;
    this.write(values);
    this.commit({ ...this.state, baseline: target, values });
    this.clearStaleErrors(run);
  };

  setValues = (patch: Partial<Values>): void => {
    const run = this.beginRun();
    const merged = { ...this.state.values, ...patch } as Values;
    const values = snapshotOf(merged, this.state.values);
    if (values !== this.state.values) {
      this.write(values);
      this.commit({ ...this.state, values });
    }
    this.clearStaleErrors(run);
  };
}

/** The submit state of a snapshot (TanStack Form's `errors` array keeps its identity while its errors do). */
function submitOf(state: FormStateLike): { isSubmitting: boolean; failed: unknown } {
  const failed = state.submissionAttempts > 0 && !state.isSubmitting && !state.isSubmitSuccessful;
  return { isSubmitting: state.isSubmitting, failed: failed ? state.errors : null };
}

const hasErrors = (errorMap: Record<string, unknown> | undefined): boolean =>
  errorMap !== undefined && Object.values(errorMap).some((error) => error !== undefined);

/** The segments of a TanStack Form field name: `lines[0].qty` and `lines.0.qty` are both `lines`, `0`, `qty`. */
const segmentsOf = (name: string): string[] => name.split(/[.[\]]+/).filter((segment) => segment !== '');

/** The value at a field name, `{ found: false }` when a step is missing (a missing key is not `undefined`). */
function valueAt(root: unknown, name: string): { found: boolean; value: unknown } {
  let current = root;
  for (const segment of segmentsOf(name)) {
    if (typeof current !== 'object' || current === null || !Object.prototype.hasOwnProperty.call(current, segment)) return { found: false, value: undefined };
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}

function sameValueAt(a: unknown, b: unknown, name: string): boolean {
  const left = valueAt(a, name);
  const right = valueAt(b, name);
  return left.found === right.found && sameContent(left.value, right.value);
}

/** The forms already warned about (one warning per form). */
const warnedForms = new WeakSet<object>();

/**
 * The `FormApi` instance behind the object `useForm()` returns. That object is a copy of the instance made once
 * (`{ ...formApi }` in `useForm`): its methods are the instance's, but its `options` is the one of the first render,
 * while TanStack Form replaces the instance's at every render (`formApi.update(opts)`), its `defaultValues` included.
 * No public API returns the instance; `form.Subscribe` is a plain function that renders TanStack Form's subscriber
 * with the instance as its `form` prop, so calling it once (no hook, no side effect: it only creates a React element)
 * gives it. Checked by identity of the store. In development, a form without it (another major) gets a clear warning
 * instead of a baseline that never follows `defaultValues`; the frozen options of `form` are then used.
 */
function liveFormApi(form: FormLike): { options: { defaultValues?: unknown } } {
  let candidate: unknown;
  try {
    if (typeof form.Subscribe === 'function') {
      const element = (form.Subscribe as (props: { children: null }) => unknown)({ children: null });
      candidate = (element as { props?: { form?: unknown } } | null)?.props?.form;
    }
  } catch {
    candidate = undefined;
  }
  if (typeof candidate === 'object' && candidate !== null && (candidate as FormLike).store === form.store) {
    const { options } = candidate as { options?: unknown };
    if (typeof options === 'object' && options !== null) return candidate as { options: { defaultValues?: unknown } };
  }
  if (isDev() && !warnedForms.has(form)) {
    warnedForms.add(form);
    console.warn(
      '[formrail] useTanStackFormBinding: `form.Subscribe` does not render the FormApi instance of `form` as its `form` prop ' +
        '(tested with @tanstack/react-form ^1.33.5): the baseline follows only the `defaultValues` of the first render.',
    );
  }
  return form;
}

/**
 * Binds a TanStack Form form (`useForm()` of `@tanstack/react-form`) to the `RebaseFormBinding` contract of
 * `@formrail/pro/engine`, so `useFormRebase` and `useChangeSummary` work on it:
 *
 * ```tsx
 * const form = useForm({ defaultValues: saved, onSubmit: save });
 * const binding = useTanStackFormBinding(form);
 * const { entries, isEmpty } = useChangeSummary({ values: binding.values, baseline: binding.baseline });
 * const { rebase, conflicts, keepMine, acceptTheirs, isPending } = useFormRebase(binding);
 * ```
 *
 * Call it in the component that calls `useForm`, after it.
 *
 * **Snapshots**: TanStack Form keeps the object passed as `defaultValues` (or to `form.reset(data)`) as its values.
 * `values` and `baseline` are immutable copies, a new object only when the content changes (unchanged subtrees keep
 * their identity), the same object across renders that change no value (a parent's state, a blur, a validation, an
 * inline `defaultValues` that is a new object with the same content at every render). `values === baseline` only after
 * a reset (of the binding, or of the whole form by TanStack Form to the baseline content); typing the saved value back
 * gives another object.
 *
 * **Baseline**: the defaults of TanStack Form when they change content: a new `defaultValues` passed to `useForm`
 * (also on a form the user touched, where TanStack Form keeps the values but compares them with the new defaults),
 * `form.reset(data)`; and the object passed to `binding.reset(saved)`. TanStack Form's own defaults stay the
 * `defaultValues` of `useForm`: the binding never writes them (`useForm` would put its own back at the next render, and
 * on a form not touched its values too). So after `binding.reset(saved)` or a rebase, `form.reset()` and TanStack
 * Form's `isDefaultValue` / `isDirty` refer to the `defaultValues` of `useForm`, unless the app keeps them on the saved
 * record. A new `defaultValues` with the content of the current baseline is no change.
 *
 * **`reset(b)` / `setValues(patch)`** (what the rebase calls): `reset(b)` makes `baseline` and `values` the object `b`
 * itself (during a save, see "Saving"); `setValues` merges the top-level keys of `patch`. Each writes the values to
 * TanStack Form in one update of its base store (`form.baseStore.setState`): no field meta (`isTouched`, `isBlurred`,
 * `isDirty` stay as they are), no `listeners.onChange`, no validator, a top-level key removed as well; a write of the
 * app made after them wins, as TanStack Form applies it on top. The error of a field that took another value is
 * removed (validation runs again at the next change, blur or submit); an error stays on a field whose value they did
 * not change.
 *
 * **Saving**: `isSaving` is `form.state.isSubmitting`; `saveError` is `null` unless the last submit did not succeed
 * (blocked by validation, or a handler that threw: then `form.state.errors`, which does not hold the thrown error, pass
 * `saveError` for it). To save through `handleSubmit`, call `binding.reset(saved)` in `onSubmit` before it resolves: a
 * rebase queued meanwhile is then merged against what was saved. A save that does not go through `handleSubmit` passes
 * `isSaving` and `saveError` (see the options). While a save is in flight, `reset(saved)` ends it as core's `save`
 * does: `saved` is the baseline, the fields edited since `isSaving` turned `true` keep the typed value, the others take
 * what the server stored; the rows of an array are matched by id with the `arrayIdKeys` option.
 *
 * Every field must have its default in the `defaultValues` of `useForm` (`''` for an empty text input): a field with a
 * `defaultValue` of its own only (`form.Field`) enters `values` but not `baseline` and is listed as added.
 *
 * SSR-safe: no access to `window`/`document`.
 */
export function useTanStackFormBinding<Values extends object>(
  form: TanStackFormOf<Values>,
  options: UseTanStackFormBindingOptions = {},
): RebaseFormBinding<Values> {
  const like = form as unknown as FormLike;
  // One store per `useForm` call (its `form.store`). Another form: a new store, set during render.
  const [owned, setOwned] = useState(() => new BindingStore<Values>(like));
  let store = owned;
  if (store.key !== like.store) {
    store = new BindingStore<Values>(like);
    setOwned(store);
  }
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // After `useForm`'s own layout effect (`formApi.update(opts)`): a new `defaultValues` is read before paint.
  useIsomorphicLayoutEffect(store.resync);

  const isSaving = options.isSaving ?? snapshot.isSubmitting;
  const saveError = options.saveError !== undefined ? options.saveError : snapshot.failed;
  // Before every layout effect of the commit (the rebase engine reads `isSaving` in one, also in a child).
  useInsertionEffect(() => store.observeSaving(isSaving), [store, isSaving]);
  const { arrayIdKeys } = options;
  useInsertionEffect(() => {
    store.arrayIdKeys = arrayIdKeys;
  }, [store, arrayIdKeys]);

  const { baseline, values } = snapshot;
  return useMemo(
    () => ({ baseline, values, isSaving, saveError, reset: store.reset, setValues: store.setValues }),
    [baseline, values, isSaving, saveError, store],
  );
}
