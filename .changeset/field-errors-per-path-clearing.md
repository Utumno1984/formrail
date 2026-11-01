---
'@react-object-page/core': minor
---

`useObjectPageForm`: `setValue(name)` / `setValues(patch)` no longer clear every `fieldErrors` entry at once. They remove only the errors of the fields whose value really changes: the path `name` and its descendants (`name.*`); the other fields keep `aria-invalid` and their message, and ancestor paths are never cleared by a write below them. Writing a value equal to the current one clears nothing and does not re-render. Once no error is left, `fieldErrors` is the shared empty object again. `reset()`, `reset(newBaseline)` and a successful save still clear everything; every new save still recomputes everything. Known limit: a cross-field error (e.g. a password confirmation) stays until the next save when the *other* field is edited.

New `validationAttempt: number` on the return of `useObjectPageForm`: `0` at mount, `+1` per save rejected by `validate` (also with identical errors), unchanged by edits, clearings, `reset`, a successful save or a throwing `validate`.

`useFocusFirstInvalidField`: ignores the object `useObjectPageForm` produces for such a partial clearing, so typing in a field never moves the focus to another invalid field; a failed save still moves it every time, also with identical errors. New optional `trigger?: unknown`: when not `undefined` it replaces the identity of `fieldErrors` as the trigger (the focus moves only when `trigger` changes). Pass `trigger: form.validationAttempt` when the hook receives a copy or a derived object (e.g. a `useMemo` that translates the messages), which the identity trigger would treat as a new validation result on every edit. Without `trigger` the behavior is the identity one, as before.
