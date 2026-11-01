---
'@react-object-page/core': minor
---

New exported type `FieldErrors` (`Readonly<Record<string, string | undefined>>`): errors keyed by dot-notation path (`supplier`, `address.city`, `lines.0.qty`; a path segment containing a dot is not supported). `useObjectPageForm().fieldErrors` now has this type and `validate` may return it (an object with top-level keys of `Values` is still accepted). `useFocusFirstInvalidField` takes `FieldErrors` and compares each path with `data-rop-name`/`name` by exact equality. Form and hook share a single definition of "invalid" (a value other than `undefined`).
