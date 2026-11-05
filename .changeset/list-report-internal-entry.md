---
'@react-object-page/core': patch
---

New `@react-object-page/core/internal` subpath: building blocks of the List Report (table sizing/cell
rendering, the stable-footprint state content, `ListReportTableHead`/`ListReportTableRow`/
`ListReportTableShell`, `ListReportFrame`, and a memoized `resultIds`/`indexOfResult`), for
`@react-object-page/pro` only. **Not public API**: no semver guarantee, and it can change in a patch
release — `/internal` is paired with the core's exact version in `.changeset/config.json`'s `fixed`
list. `ListReportTable` and `ListReport` are unchanged (same DOM, same behaviour): they are now built
from these same blocks (`ListReportTableShell`/`ListReportFrame`), proved by a serialized-HTML
snapshot taken before this refactor.

The public bundle's per-export sizes moved by a few bytes across most exports (an unavoidable side
effect of splitting the build into two entries that share code via a chunk tsup generates, not any
added code) — baseline updated, all exports still well under their budget.
