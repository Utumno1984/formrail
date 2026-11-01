---
'@react-object-page/core': minor
---

New `ValidationProvider` (`ValidationProviderProps`: `fieldErrors: FieldErrors`, `children`): a `Field` with a `name` inside it shows `fieldErrors[name]` as its error, with the same rendering as the `error` prop (`aria-invalid`, error message, id in `aria-describedby`), so the key is written once. Lookup by exact dot-notation path (own keys only); an absent key, `undefined` or an empty message means no error. A `Field` `error` with content wins over the provider; an empty or absent `error` falls back to it. Nested providers: the innermost is the only source. A `Field` without `name` or outside any provider behaves as before. Renders no DOM, SSR-safe, independent of `useObjectPageForm`.
