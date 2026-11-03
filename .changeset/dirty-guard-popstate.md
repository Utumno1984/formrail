---
'@react-object-page/core': minor
---

`useDirtyGuard`: while `when` is true, the browser's Back/Forward (`popstate`) now opens the same confirmation dialog instead of silently losing the changes. The traversal is undone at once with `history.go(-delta)` (no entry is pushed, the forward history is kept) and swallowed before routers listening to `popstate` on `window` see it; "Leave without saving" repeats it with `history.go(delta)`. Direction and size of the jump come from the Navigation API where available; otherwise every traversal is treated as Back by one entry. Navigations that do not go through `popstate` (router link clicks) are still covered only by `guard(action)`. Opt-in through the existing `when`; `beforeunload` is unchanged.
