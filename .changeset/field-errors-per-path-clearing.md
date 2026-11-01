---
'@react-object-page/core': minor
---

`useObjectPageForm`: `setValue(name)` / `setValues(patch)` no longer clear every `fieldErrors` entry at once. They remove only the errors of the fields whose value really changes: the path `name` and its descendants (`name.*`); the other fields keep `aria-invalid` and their message, and ancestor paths are never cleared by a write below them. Writing a value equal to the current one clears nothing and does not re-render. Once no error is left, `fieldErrors` is the shared empty object again. `reset()`, `reset(newBaseline)` and a successful save still clear everything; every new save still recomputes everything. Known limit: a cross-field error (e.g. a password confirmation) stays until the next save when the *other* field is edited.

`useFocusFirstInvalidField`: ignores the object produced by such a partial clearing, so typing in a field never moves the focus to another invalid field; a failed save still moves it every time, also with identical errors. No new public API: pass `form.fieldErrors` itself (a copy or a derived object is treated as a new validation result).
