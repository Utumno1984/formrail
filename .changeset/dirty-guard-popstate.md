---
'@react-object-page/core': minor
---

`useDirtyGuard`: while `when` is true, the browser's Back/Forward now opens the same confirmation dialog instead of silently losing the changes; "Leave without saving" completes the original traversal. With the Navigation API the traversal is cancelled outright (no `popstate` fires, so routers and `useListReportUrlState` never see it, whenever they registered); otherwise the hook undoes it with `history.go(-delta)` (no entry is pushed, the forward history is kept) and swallows the `popstate` for listeners registered after it, treating every traversal as Back by one entry. Navigations that do not traverse the history (router link clicks) are still covered only by `guard(action)`. Opt-in through the existing `when`; `beforeunload` is unchanged.
