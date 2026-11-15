---
'@formrail/core': patch
---

List Report: the default announcement of the number of results (the `aria-live` region of the table, `labels.resultCount`) now formats the number in the `locale` of `useListReport`, like the visible count ("10,000 results"). A custom `labels.resultCount` still receives the raw number.
