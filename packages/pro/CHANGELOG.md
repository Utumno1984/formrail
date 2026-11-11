# @formrail/pro

## 0.1.0

Not published: this package is private (commercial license, to be defined) and is versioned together
with `@react-object-page/core`.

- Change Summary: `computeChangeSummary` (pure), `useChangeSummary`, `inferSegmentLabel`,
  `<ChangeSummary />` and `formatChangeValue`. `''`, `null`, `undefined` and a missing key are four
  distinct states, consistent with the dirty tracking of `useObjectPageForm`.
- `VirtualListReportTable` and `VirtualListReport`: the Free List Report with virtualized rows for
  client-side datasets of 10⁴–10⁵ rows (same props and DOM as the Free table; below
  `virtualizeThreshold` it is the Free table), range selection, `aria-rowcount`/`aria-rowindex`, SSR.
- Initial scaffold of the package (build, lint, typecheck and unit-test toolchain).
