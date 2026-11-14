---
'@formrail/pro': minor
---

Change Summary (#424): row labels and reorders from the engine, in `@formrail/pro/engine` and `@formrail/pro`.

- `ChangeSummaryOptions.itemLabel(arrayPath, item, context)`: names the array-item segments of `labelPath`
  (`Line Items > Item 2 (Chair) > Price`) while the engine still holds the item, on any array, nested ones
  included. `context` is an `ItemLabelContext` (`path`, `index`, `side`, `isLastSegment`, `defaultLabel`).
  Called lazily: only for what is reported, at most once per item and position, never while the engine only
  checks whether a subtree differs. A blank or non-string result keeps `Item N` (with a development warning
  for a non-string); an exception reaches the caller.
- `computeChangeSummaryResult(options)`: `{ entries, reorders }`. `entries` is exactly what
  `computeChangeSummary` returns; `reorders` (`ArrayReorder[]`: `path`, `labelPath`, `label`) lists the
  id-keyed arrays whose items present on both sides changed relative order, without any synthetic entry.
- `useChangeSummary` returns `reorders` too (additive field; `entries` and `isEmpty` keep their meaning). A
  save bar or a dirty guard driven by the summary checks `isEmpty && reorders.length === 0`.
- New types: `ItemLabelContext`, `ArrayReorder`, `ChangeSummaryResult`.

Without the new option nothing changes in `entries`. Bundle: every import that reaches the shared diff engine
(`computeChangeSummary`, `useChangeSummary`, `computeRebase`, `useFormRebase`) grows by about 0.4-0.5 kB
gzip; see the PR for the numbers.
