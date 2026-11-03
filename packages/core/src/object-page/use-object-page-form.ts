import { useCallback, useEffect, useInsertionEffect, useRef, useState } from 'react';
import { isDev } from '../internal/is-dev';
import { deepEqual } from './equal';
import { invalidPaths, withoutPaths } from './field-errors';
import type { FieldErrors } from './field-errors';
import { issuesToErrors } from './standard-schema';
import type { SchemaErrors, StandardSchemaLike, StandardSchemaResult } from './standard-schema';

const ASYNC_SCHEMA_MESSAGE = 'asynchronous schema not supported: validation is synchronous in v1';

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
  /**
   * A [Standard Schema](https://standardschema.dev) (Zod >= 3.24 / 4, Valibot, ArkType, or any object
   * with a `~standard.validate` function); the core imports no schema library. `save` calls
   * `schema['~standard'].validate(values)` **synchronously**, before `validate` and the handler.
   *
   * - Issues with a path become `fieldErrors`: the path is joined with dots (`address.city`,
   *   `lines.0.qty`; `{ key }` segments unwrapped, symbols through `String()`) and only the **first**
   *   message per path is kept. Issues with an empty/absent path (a rule on the whole object) go to
   *   `formErrors`. Any issue makes the save fail like a failing `validate`: the handler is not
   *   called, `save` resolves `false`, `isSaving` is never touched and `saveError` stays `null`.
   * - When the schema fails, `validate` is **not** called: it only ever receives values that pass the
   *   schema, so it can hold the extra (e.g. cross-field) rules. When the schema passes, `validate`
   *   runs as usual.
   * - The handler always receives the **raw** values, never the schema output: transformations and
   *   coercions of the schema do not change `Values` (v1).
   * - An asynchronous schema (its `validate` returns a `Promise`) is not supported in v1: `save`
   *   resolves `false` at once with a `saveError` (and a `console.error` in development).
   * - A schema that throws is treated like a throwing `validate`: `saveError` is set, `save` resolves
   *   `false`.
   *
   * The latest schema passed is used, so an inline schema is fine.
   */
  schema?: StandardSchemaLike;
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
  /**
   * Sets one top-level field. Clears `saveError`. When the value really changes (`Object.is`, or
   * the key was missing) it also removes from `fieldErrors` the error of the path `name` and of
   * every descendant path (`name.*`); the errors of the other paths stay. If no field error is left
   * after that, `formErrors` is cleared too; otherwise `formErrors` is unchanged (see `fieldErrors`
   * and `formErrors`). Setting the value a field already has clears no error. Stable identity.
   */
  setValue: <K extends keyof Values>(name: K, value: Values[K]) => void;
  /**
   * Merges several top-level fields in a single update (shallow merge, like `Object.assign`).
   * Clears `saveError`. Removes from `fieldErrors` the errors within each key whose value really
   * changes (the union of what `setValue` would remove for each of them); keys of the patch whose
   * value is unchanged clear nothing. `formErrors` follows the same rule as in `setValue`: cleared
   * when no field error is left, unchanged otherwise. Stable identity.
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
   * edits and returns the values to the current baseline. Both clear `saveError` and **all** the
   * `fieldErrors` and `formErrors` (also after a partial clearing in the same event). During a save
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
   * Field-level errors of the last save attempt, as produced by `schema` (its issues with a path) or
   * returned by `validate` (`{}` when there are none or neither was passed). Distinct from
   * `saveError` (network/server).
   *
   * - **Per-path clearing on edit**: `setValue(name)` / `setValues(patch)` remove only the errors
   *   of the changed fields: the path `name` and its descendants (`address` also removes
   *   `address.city`; `lines` removes every `lines.*`, so editing one line clears the errors of all
   *   the lines). The errors of the other paths, and of **ancestor** paths, stay with their
   *   message: an error keyed `address` is removed by writing `address` or by a new save, never by
   *   a path below it. Setting a field to the value it already has removes nothing (and causes no
   *   re-render).
   * - **Known limit, cross-field errors**: an error that depends on several fields (e.g. "the
   *   passwords do not match" keyed `passwordConfirm`) is not re-evaluated on edit: changing the
   *   *other* field (`password`) leaves it in place until the next save. Only keys are compared,
   *   never the rule that produced them.
   * - **Cleared as a whole** by `reset()`, `reset(newBaseline)` and a successful save; replaced or
   *   cleared by every new save attempt (a passing `schema`/`validate` clears the stale errors
   *   before the handler runs).
   * - **Identity**: once no error is left after an edit, a `reset` or a successful save, this is
   *   always the same shared empty object, so "no errors" never re-renders a consumer. Every failed
   *   `schema` or `validate` produces a **new** object (empty when a failed schema only had root
   *   issues, see `formErrors`), even with content identical to the previous attempt; a partial
   *   clearing produces a new object too, but one that `useFocusFirstInvalidField` recognizes and
   *   ignores (typing never moves the focus, a failed save always does). That recognition is lost
   *   on a copy or a derived object: then drive the focus hook with `validationAttempt` (its
   *   `trigger` option). The hook never touches the DOM: pair it with `useFocusFirstInvalidField`
   *   to scroll/focus.
   */
  fieldErrors: FieldErrors;
  /**
   * Root-level (form-wide) messages of the last save attempt: the `schema` issues with an empty
   * path, such as a rule on the whole object, in issue order (empty when there are none or no
   * `schema` was passed). They have no field, so they are not in `fieldErrors`, but they make `save`
   * fail in the same way. A failed schema with at least one root issue produces a **new** array
   * every time.
   *
   * - **On edit** (`setValue`/`setValues` with a real change): cleared, together with
   *   `fieldErrors` returning to the shared empty object, when the edit leaves **no** field error
   *   (including when the failed attempt had only root issues). While at least one field error is
   *   left they stay unchanged (same array): a root error is tied to no field, so no single edit
   *   can be said to fix it, and dropping it while fields are still marked invalid would hide a
   *   reason the next save fails anyway. An edit that changes no value clears nothing.
   * - **Cleared** by `reset()`, `reset(newBaseline)` and a successful save, and replaced/cleared by
   *   every new save attempt, exactly like `fieldErrors`.
   */
  formErrors: readonly string[];
  /**
   * Number of save attempts rejected by `schema` or `validate` since mount (`0` at mount). It grows
   * by exactly one per rejected attempt: a failed `schema` (also when its issues are only root
   * issues, i.e. only `formErrors`) or a failed `validate`, also with errors identical to the
   * previous ones. It never changes on an edit, a clearing, a `reset`, a successful save, or a
   * `schema`/`validate` that throws or a `schema` that is asynchronous (those set `saveError`, they
   * are not validation results). Pass it as `useFocusFirstInvalidField({ trigger })` when the
   * errors you give that hook are not `fieldErrors` itself (e.g. a `useMemo` that translates the
   * messages), so that typing never moves the focus and every failed save does.
   */
  validationAttempt: number;
}

// Shared identity so "no errors" never re-renders consumers that depend on `fieldErrors`.
const NO_FORM_ERRORS: readonly string[] = /* @__PURE__ */ Object.freeze([]);
const NO_SCHEMA_ERRORS: SchemaErrors = /* @__PURE__ */ Object.freeze({
  fieldErrors: /* @__PURE__ */ Object.freeze({}),
  formErrors: NO_FORM_ERRORS,
});

interface FormState<Values> {
  baseline: Values;
  values: Values;
}

/**
 * Headless state of a simple Object Page form: values, baseline, dirty flag and save cycle.
 * SSR-safe (no effect-only state, no DOM access).
 *
 * **Error announcements: which level uses which channel** (the same rule is on `ObjectPageFooter`):
 *
 * | Level | Source | Where | Announcement |
 * |---|---|---|---|
 * | Field | `fieldErrors` | the `Field` error (through `ValidationProvider` or `error`): `aria-invalid` + `aria-describedby` on the control | not live: after a failed save `useFocusFirstInvalidField` moves the focus to the first invalid field and the screen reader reads its error there |
 * | Form summary | `fieldErrors` + `formErrors` | `ObjectPageFooter` `message={getErrorSummary(form.fieldErrors, { formErrors: form.formErrors })}`, `messageTone="error"` | footer `role="status"`, polite, one line: the count only ("3 invalid fields"), never the field messages |
 * | Save error (network/server) | `saveError` | `ObjectPageFooter` `message` = its text, `messageTone="error"` | the same footer `role="status"`, polite; when present it has priority over the summary (pass one, never both) |
 * | Root error | `formErrors` (issues with no path, e.g. `z.object(...).refine(...)` without `path`) | no `Field` shows it: the consumer renders the messages, e.g. a `MessageStrip` `tone="error"` at the top of the form, mounted while `formErrors` is not empty; the footer summary counts them too | the strip's `role="alert"` (mounted already filled, so it is announced) |
 * | Blocking page error | the consumer's own state | `MessageStrip` `tone="error"` | `role="alert"` |
 *
 * ```tsx
 * const saveErrorText =
 *   form.saveError === null ? undefined : form.saveError instanceof Error ? form.saveError.message : String(form.saveError);
 * <ObjectPageFooter
 *   visible={form.isDirty}
 *   message={saveErrorText || getErrorSummary(form.fieldErrors, { formErrors: form.formErrors })}
 *   messageTone="error"
 * >
 *   ...
 * </ObjectPageFooter>
 * {form.formErrors.length > 0 ? (
 *   <MessageStrip tone="error">{form.formErrors.join(' ')}</MessageStrip>
 * ) : null}
 * ```
 *
 * `||`, not `??`: a save error with an empty text (`new Error()`, `throw ''`) would otherwise hide
 * the summary behind an empty message. Give such an error your own text if you want it shown.
 *
 * A failed validation does not clear an earlier `saveError` (only an edit, a `reset` or a successful
 * save does), so both can be present at once: hence the priority above. An invalid path with no
 * focusable control (`forced`/`locked`/`disabled`, or not on the page) still counts in the summary.
 * The library does not translate validation texts: the field messages come from your
 * `schema`/`validate` and the summary text from `getErrorSummary`'s `message` option.
 */
export function useObjectPageForm<Values extends object>(
  options: UseObjectPageFormOptions<Values>,
): UseObjectPageFormReturn<Values> {
  const { baseline: baselineOption, isEqual = deepEqual } = options;

  const [state, setState] = useState<FormState<Values>>(() => ({ baseline: baselineOption, values: baselineOption }));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ error: unknown } | null>(null);
  // `fieldErrors` and `formErrors` are always set and cleared together: one state for both.
  const [errors, setErrorsState] = useState<SchemaErrors>(NO_SCHEMA_ERRORS);
  const [validationAttempt, setValidationAttempt] = useState(0);

  // Synchronous mirror of the state, so several updates in one event compose and `save` reads the
  // very latest values without being recreated.
  const stateRef = useRef(state);
  const savingRef = useRef(false);
  // Tracks unmounting (not mounting): a save started before the mount effects must still settle.
  const mountedRef = useRef(true);
  const epochRef = useRef(0);
  const saveErrorRef = useRef(false);
  // Synchronous mirror of `errors`: several edits in one event compose their clearings.
  const errorsRef = useRef<SchemaErrors>(NO_SCHEMA_ERRORS);
  // Latest options, read by `save` for `schema` and `validate`.
  const optionsRef = useRef(options);
  // Insertion effect: runs before any layout/passive effect of the same commit (so a `save` called
  // from one sees the latest `validate`/`schema`) and, unlike a layout effect, does not warn during SSR.
  useInsertionEffect(() => {
    optionsRef.current = options;
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

  // No re-render when the object does not change.
  const setErrors = useCallback((next: SchemaErrors) => {
    if (errorsRef.current === next) return;
    errorsRef.current = next;
    setErrorsState(next);
  }, []);

  const clearSaveError = useCallback(() => {
    if (!saveErrorRef.current) return;
    saveErrorRef.current = false;
    setSaveError(null);
  }, []);

  const setValues = useCallback(
    (patch: Partial<Values>) => {
      const current = stateRef.current;
      const changed = Object.keys(patch).filter(
        (key) => !Object.is(current.values[key as keyof Values], patch[key as keyof Values]) || !(key in current.values),
      );
      if (changed.length > 0) {
        commit({ baseline: current.baseline, values: { ...current.values, ...patch } });
        // Only the paths of the fields that really changed (and their descendants) lose their error.
        // No field error left: everything goes, root errors included (and the shared empty object);
        // otherwise the root errors stay as they are (a root error is tied to no field).
        const prev = errorsRef.current;
        const fieldErrors = withoutPaths(prev.fieldErrors, changed);
        if (Object.keys(fieldErrors).length === 0) setErrors(NO_SCHEMA_ERRORS);
        else if (fieldErrors !== prev.fieldErrors) setErrors({ fieldErrors, formErrors: prev.formErrors });
      }
      clearSaveError();
    },
    [commit, setErrors, clearSaveError],
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
      setErrors(NO_SCHEMA_ERRORS);
      clearSaveError();
    },
    [commit, setErrors, clearSaveError],
  );

  const save = useCallback(
    async (handler: (values: Values) => Promise<Values | void> | Values | void): Promise<boolean> => {
      if (savingRef.current) return false;
      // Schema first, then `validate`: both synchronous, before any async work, so `isSaving` is
      // never touched on a validation failure. `failed` = the errors of a failed attempt.
      let failed: SchemaErrors | undefined;
      try {
        const values = stateRef.current.values;
        const { schema, validate } = optionsRef.current;
        if (schema) {
          const result = schema['~standard'].validate(values);
          // A `null`/`undefined` result (not a Standard Schema) throws here: a loud saveError.
          if (typeof (result as { then?: unknown }).then == 'function') {
            // Never awaited (v1 is synchronous); a later rejection must not surface as unhandled.
            (result as PromiseLike<unknown>).then(undefined, () => undefined);
            const error = new Error(ASYNC_SCHEMA_MESSAGE);
            if (isDev()) console.error('[react-object-page] useObjectPageForm:', error);
            throw error;
          }
          const issues = (result as StandardSchemaResult).issues;
          // On any issue `validate` is skipped: it only ever sees schema-valid values.
          if (issues?.length) failed = issuesToErrors(issues);
        }
        if (!failed && validate) {
          const returned: FieldErrors = validate(values);
          // A key whose value is `undefined` is "no error" (`{ name: ok ? undefined : 'Required' }`).
          const invalid = invalidPaths(returned);
          if (invalid.length > 0) {
            const next: Record<string, string | undefined> = {};
            for (const path of invalid) next[path] = returned[path];
            failed = { fieldErrors: next, formErrors: NO_FORM_ERRORS };
          }
        }
      } catch (thrown) {
        // A schema or `validate` that throws (a bug, or `schema.parse`) follows the same contract as
        // a throwing handler: `saveError` is set and `save` resolves `false`.
        setErrors(NO_SCHEMA_ERRORS);
        saveErrorRef.current = true;
        setSaveError({ error: thrown ?? new Error('Validation failed') });
        return false;
      }
      if (failed) {
        // New objects on every failed attempt, even with identical content: a new attempt, never a
        // clearing. Counted for `validationAttempt` (schema or `validate`; a throw is a saveError).
        setErrors(failed);
        setValidationAttempt((n) => n + 1);
        return false;
      }
      setErrors(NO_SCHEMA_ERRORS); // stale errors of a previous attempt
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
      setErrors(NO_SCHEMA_ERRORS);
      clearSaveError();
      return true;
    },
    [commit, setErrors, clearSaveError],
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
    fieldErrors: errors.fieldErrors,
    formErrors: errors.formErrors,
    validationAttempt,
  };
}
