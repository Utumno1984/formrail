import { useCallback, useEffect, useInsertionEffect, useRef, useState } from 'react';
import { isDev } from '../internal/is-dev';
import { deepEqual } from './equal';
import { invalidPaths } from './field-errors';
import type { FieldErrors } from './field-errors';

export interface UseObjectPageFormOptions<Values extends object> {
  /**
   * Initial baseline: the last known saved state. It is read **once**, at mount. Passing a different
   * object later does not change `values` or `baseline` (in development a single `console.warn`
   * points to `reset(newBaseline)`); use `reset(newBaseline)` to hydrate data that arrives later.
   * Content is compared with `isEqual`, so an inline literal never warns. Note that
   * `baseline: data ?? EMPTY` plus `useEffect(() => data && reset(data), [data])` does warn once
   * when `data` arrives: keep `EMPTY` stable and call `reset`, and ignore that single warning.
   */
  baseline: Values;
  /**
   * Replaces the default structural comparison used by `isDirty` (`(values, baseline) => boolean`).
   */
  isEqual?: (a: Values, b: Values) => boolean;
  /**
   * Field-level validation, supplied by the consumer (the core depends on no schema library).
   * Called synchronously by `save` with the current values, before the handler. Return one message
   * per invalid field (`{}` when valid), keyed by dot-notation path (`FieldErrors`: `supplier`,
   * `address.city`, `lines.0.qty`; the paths need not be keys of `Values`). If the result has at least one key, `fieldErrors` is
   * updated, the handler is not called and `save` resolves `false` (`isSaving` is never touched).
   * A key whose value is `undefined` counts as no error. If `validate` throws, it is treated like a
   * throwing handler: `saveError` is set and `save` resolves `false`. The latest function passed is
   * used, so an inline function is fine.
   */
  validate?: (values: Values) => FieldErrors | Partial<Record<keyof Values, string>>;
}

export interface UseObjectPageFormReturn<Values extends object> {
  /** Current values (starts equal to the baseline). */
  values: Values;
  /** Current baseline (last saved or hydrated state). */
  baseline: Values;
  /**
   * `true` when `values` differs from `baseline` under a deep structural comparison: plain objects
   * and arrays by content, `Date` by `getTime()`, `NaN` equal to `NaN`. `''`, `null` and
   * `undefined` are all **different** from each other, and a key set to `undefined` differs from a
   * missing key. Other objects (`Map`, `Set`, class instances) compare by reference unless
   * `isEqual` is passed. Computed against the real baseline, not a "touched" flag: restoring the
   * original value makes the form clean again.
   */
  isDirty: boolean;
  /** Sets one top-level field. Clears `saveError` and `fieldErrors`. Stable identity. */
  setValue: <K extends keyof Values>(name: K, value: Values[K]) => void;
  /**
   * Merges several top-level fields in a single update (shallow merge, like `Object.assign`).
   * Clears `saveError` and `fieldErrors`. Stable identity.
   *
   * Explicitly passing `undefined` for a field sets its value to `undefined`, same as any merge
   * patch — this library does not (and structurally cannot) forbid it at the type level for a
   * consumer whose own `tsconfig.json` has `exactOptionalPropertyTypes: false` (TypeScript's
   * default, and what this package itself builds with): with that flag off, TypeScript always
   * allows an optional property to be assigned `undefined` explicitly, regardless of how the
   * library types the patch. Enable `exactOptionalPropertyTypes` in your own project if you want
   * the compiler to catch `setValues({ requiredField: undefined })`.
   */
  setValues: (patch: Partial<Values>) => void;
  /**
   * `reset(newBaseline)` hydrates: baseline and values become `newBaseline` and the form is clean,
   * without any user-gesture signal (the hook exposes no change callback). `reset()` discards the
   * edits and returns the values to the current baseline. Both clear `saveError` and `fieldErrors`. During a save
   * in flight the reset wins: the later success of that save does not overwrite the new baseline.
   * Stable identity.
   */
  reset: (newBaseline?: Values) => void;
  /**
   * Runs `handler(values)` once. On success the new baseline is the value returned by the handler
   * (when it is an object) or else the values that were sent; fields edited while saving stay dirty.
   * If the values were not edited meanwhile they also become the returned baseline (the form shows
   * what the server stored and is clean). A handler that throws synchronously or rejects sets
   * `saveError`; values and baseline are untouched. Resolves `true` on success, `false` on error or
   * when a save is already in flight (the handler is not called again). A save whose form was
   * `reset` in the meantime resolves `true` when the handler succeeded and `false` when it failed,
   * and changes no state other than `isSaving` (neither a baseline nor a `saveError`). Whether the
   * values were edited meanwhile is decided with the default structural comparison, never with
   * `isEqual`. Stable identity.
   */
  save: (handler: (values: Values) => Promise<Values | void> | Values | void) => Promise<boolean>;
  /** `true` from the call to `save` until its handler settles. */
  isSaving: boolean;
  /**
   * Error of the last save (a rejection with `undefined`/`null` is reported as an `Error`), `null`
   * when there is none (a falsy rejection value such as `0` is exposed as is: compare with
   * `!== null`). Cleared by `setValue`, `setValues`, `reset` and a successful save.
   */
  saveError: unknown;
  /**
   * Field-level errors of the last save attempt, as returned by `validate` (`{}` when there are none
   * or no `validate` was passed). Distinct from `saveError` (network/server). Cleared as a whole by
   * `setValue`, `setValues`, `reset` and a successful save, and replaced/cleared by every new save
   * attempt that gets past a passing `validate`; per-field clearing is not supported. Every failed
   * `validate` produces a **new** object, even with content identical to the previous attempt
   * (`useFocusFirstInvalidField` relies on this identity). The hook never
   * touches the DOM: pair it with `useFocusFirstInvalidField` to scroll/focus.
   */
  fieldErrors: FieldErrors;
}

// Shared identity so "no errors" never re-renders consumers that depend on `fieldErrors`.
const NO_ERRORS: FieldErrors = /* @__PURE__ */ Object.freeze({});

interface FormState<Values> {
  baseline: Values;
  values: Values;
}

/**
 * Headless state of a simple Object Page form: values, baseline, dirty flag and save cycle.
 * SSR-safe (no effect-only state, no DOM access).
 */
export function useObjectPageForm<Values extends object>(
  options: UseObjectPageFormOptions<Values>,
): UseObjectPageFormReturn<Values> {
  const { baseline: baselineOption, isEqual = deepEqual, validate } = options;

  const [state, setState] = useState<FormState<Values>>(() => ({ baseline: baselineOption, values: baselineOption }));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ error: unknown } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(NO_ERRORS);

  // Synchronous mirror of the state, so several updates in one event compose and `save` reads the
  // very latest values without being recreated.
  const stateRef = useRef(state);
  const savingRef = useRef(false);
  // Tracks unmounting (not mounting): a save started before the mount effects must still settle.
  const mountedRef = useRef(true);
  const epochRef = useRef(0);
  const saveErrorRef = useRef(false);
  const fieldErrorsRef = useRef(false);
  const validateRef = useRef(validate);
  // Insertion effect: runs before any layout/passive effect of the same commit (so a `save` called
  // from one sees the latest `validate`) and, unlike a layout effect, does not warn during SSR.
  useInsertionEffect(() => {
    validateRef.current = validate;
  });
  const initialBaselineRef = useRef(baselineOption);
  const warnedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true; // StrictMode runs the cleanup first
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (warnedRef.current || baselineOption === initialBaselineRef.current || !isDev()) return;
    if (isEqual(baselineOption, initialBaselineRef.current)) return;
    warnedRef.current = true;
    console.warn(
      '[react-object-page] useObjectPageForm: the `baseline` option is only read at mount, a different value was ignored. Call `reset(newBaseline)` to hydrate data that arrives later.',
    );
  });

  const commit = useCallback((next: FormState<Values>) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearFieldErrors = useCallback(() => {
    if (!fieldErrorsRef.current) return;
    fieldErrorsRef.current = false;
    setFieldErrors(NO_ERRORS);
  }, []);

  const clearSaveError = useCallback(() => {
    clearFieldErrors();
    if (!saveErrorRef.current) return;
    saveErrorRef.current = false;
    setSaveError(null);
  }, [clearFieldErrors]);

  const setValues = useCallback(
    (patch: Partial<Values>) => {
      const current = stateRef.current;
      const keys = Object.keys(patch) as (keyof Values)[];
      if (keys.some((key) => !Object.is(current.values[key], patch[key]) || !(key in current.values))) {
        commit({ baseline: current.baseline, values: { ...current.values, ...patch } });
      }
      clearSaveError();
    },
    [commit, clearSaveError],
  );

  const setValue = useCallback(
    <K extends keyof Values>(name: K, value: Values[K]) => {
      const patch: Partial<Values> = {};
      patch[name] = value;
      setValues(patch);
    },
    [setValues],
  );

  const reset = useCallback(
    (newBaseline?: Values) => {
      epochRef.current += 1;
      const baseline = newBaseline ?? stateRef.current.baseline;
      commit({ baseline, values: baseline });
      clearSaveError();
    },
    [commit, clearSaveError],
  );

  const save = useCallback(
    async (handler: (values: Values) => Promise<Values | void> | Values | void): Promise<boolean> => {
      if (savingRef.current) return false;
      const validateFn = validateRef.current;
      if (validateFn) {
        // Synchronous, before any async work: `isSaving` is never touched on a validation failure.
        let errors: FieldErrors;
        try {
          errors = validateFn(stateRef.current.values);
        } catch (thrown) {
          // A `validate` that throws (e.g. `schema.parse`) follows the same contract as a throwing
          // handler: `saveError` is set and `save` resolves `false`.
          clearFieldErrors();
          saveErrorRef.current = true;
          setSaveError({ error: thrown ?? new Error('Validation failed') });
          return false;
        }
        // A key whose value is `undefined` is "no error" (`{ name: ok ? undefined : 'Required' }`).
        const invalid = invalidPaths(errors);
        if (invalid.length > 0) {
          const next: Record<string, string | undefined> = {};
          for (const path of invalid) next[path] = errors[path];
          fieldErrorsRef.current = true;
          setFieldErrors(next);
          return false;
        }
        clearFieldErrors(); // stale errors of a previous attempt
      }
      savingRef.current = true;
      const epoch = epochRef.current;
      const sent = stateRef.current.values;
      setIsSaving(true);

      let result: Values | void;
      try {
        // `await` also turns a synchronous throw of the handler into a save error.
        result = await handler(sent);
      } catch (thrown) {
        savingRef.current = false;
        if (mountedRef.current) {
          setIsSaving(false);
          // A reset during the save wins here too: the form was hydrated/discarded after sending,
          // so a stale failure must not put an error on top of the fresh state.
          if (epoch === epochRef.current) {
            saveErrorRef.current = true;
            setSaveError({ error: thrown ?? new Error('Save failed') });
          }
        }
        return false;
      }

      savingRef.current = false;
      if (!mountedRef.current) return true;
      setIsSaving(false);
      // A reset during the save wins: the form was hydrated/discarded after the values were sent.
      if (epoch !== epochRef.current) return true;

      let baseline = sent;
      if (result !== undefined) {
        if (typeof result === 'object' && result !== null && !Array.isArray(result)) baseline = result;
        else if (isDev()) {
          console.warn('[react-object-page] useObjectPageForm: the save handler returned a non-object, the sent values are the new baseline.');
        }
      }
      const current = stateRef.current;
      const untouched = current.values === sent || deepEqual(current.values, sent);
      commit({ baseline, values: untouched ? baseline : current.values });
      clearSaveError();
      return true;
    },
    [commit, clearSaveError, clearFieldErrors],
  );

  return {
    values: state.values,
    baseline: state.baseline,
    isDirty: !isEqual(state.values, state.baseline),
    setValue,
    setValues,
    reset,
    save,
    isSaving,
    saveError: saveError ? saveError.error : null,
    fieldErrors,
  };
}
