---
'@react-object-page/pro': minor
---

`VirtualListReportTable` and `VirtualListReport`: the List Report table and floorplan of the core with
virtualized rows (only the rows in the viewport + `overscan` are mounted) for client-side datasets of
10⁴–10⁵ rows. Same props, same `useListReport` state, same DOM per row and same states as the Free
`ListReportTable`/`ListReport`; below `virtualizeThreshold` (default 200), with no rows and in the
loading/empty/no-results/error states they are the Free table, with no virtualizer attached. Native
`<table>` with spacer rows, `aria-rowcount`/`aria-rowindex`, fixed measured row pitch, the focused row kept
mounted outside the range, range selection (shift-click, Shift+Space) over the current results, "Select all
N results" in the selection bar, Escape to clear the selection, `handleRef.scrollToRowId`, SSR with
mismatch-free hydration, compatible with `useListReportScrollRestoration`. Tested up to 200,000 rows in
Chromium, Firefox and WebKit.
