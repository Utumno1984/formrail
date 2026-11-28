---
name: hook-and-floorplan-architecture
description: Hook/UI separation for Floorplans (ListReport), Forms (Object Page) and Internal/Harness — use it when you write or review complex state logic (dirty-tracking, dirty guard, asynchronous resets, filter handling) in these components.
---

# Hook and floorplan architecture

Applies to: `src/list-report/` (Floorplans, e.g. `ListReportTable`, `ListReportFilterBar`),
`src/object-page/` (Forms, e.g. `useObjectPageForm`, `useDirtyGuard`), and the fixtures of
`Internal/Harness`.

## Separation of responsibilities

All complex state logic lives in the related hook, never in the presentation component:

- **Dirty-tracking / dirty guard** (comparison with the real baseline, telling a system echo
  after an asynchronous hydration from a user gesture) → `useObjectPageForm`, `useDirtyGuard`.
  See "Object Page / dirty-tracking" in `CLAUDE.md`: a value that arrives from outside after
  mount must never mark the form as dirty.
- **Asynchronous resets / post-mount hydration** → handled in the hook, not in a `useEffect`
  inside the UI component.
- **Filter handling** (draft vs committed, tracking of the latest valid request, discarding
  superseded responses) → `use-list-report`, not `ListReportFilterBar`/`ListReportTable`.

A presentation component (the `.tsx` that renders markup) receives ready-made state and callbacks
from the hook; it contains no `useState`/`useReducer` for state that an external consumer must be
able to observe or drive from outside.

## TypeScript: extensible types for form interfaces

The generic constraint on a form's values (`useObjectPageForm<Values>`, `useDirtyGuard` and
similar) must be `extends object`, not `Record<string, unknown>`:

```ts
function useObjectPageForm<Values extends object>(/* ... */) {}
```

`Record<string, unknown>` is not assignable from an `interface` declared by the consumer
(interfaces have no implicit index signature), so it rejects the most common use case — a
consumer passing its own `interface FormValues { ... }`. `extends object` accepts both an
interface and a literal type, without losing type checking on the keys.
