---
'@react-object-page/pro': minor
---

Add the Change Summary engine: `computeChangeSummary` (pure), `useChangeSummary` (memoized hook) and `inferSegmentLabel`, with the `ChangeSummaryOptions`, `ChangeEntry`, `ChangeKind` and `UseChangeSummaryReturn` types. Field-by-field diff of `values` against the real baseline with explicit "no value" rules (Absent / Empty), array identity via `arrayIdKeys` (a reorder without changes yields no entry), inferred labels with overrides and a custom `isEqual`.
