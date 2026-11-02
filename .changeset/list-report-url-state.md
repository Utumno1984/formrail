---
'@react-object-page/core': minor
---

New `useListReportUrlState`: keeps the active pill, the committed search and the sort of a List Report in the URL (`filter=<id>`, `q=<text>`, `sort=<columnId>.<asc|desc>`, optional `prefix` and renamable `params`) with the browser APIs only (`URLSearchParams`, `history.replaceState`/`pushState`, `popstate`; no router). Spread its result in the options of `useListReport`. Defaults are not written, invalid values read as the default with no rewrite, other parameters and the hash are kept, Back/Forward updates the report with no callback and no write, and the server renders the defaults with no hydration mismatch. New types `UseListReportUrlStateOptions` and `UseListReportUrlStateReturn`.

`useListReport`: a controlled `searchQuery` that changes from outside (e.g. Back in the browser) now drops a pending delayed commit of the draft; the draft stays in the field and is committed at the next edit or `commitSearch()`. Bundle budget of `useListReport` from 2609 to 2637 B gzip; `useListReportUrlState` 1327 B.
