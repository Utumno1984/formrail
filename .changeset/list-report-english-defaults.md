---
'@react-object-page/core': minor
---

`ListReportFilterBar` and `ListReport`: the default texts are now English. `filtersLabel` "Filtri" -> "Filters", `searchLabel` (and the placeholder fallback) "Cerca" -> "Search", `clearSearchLabel` "Svuota ricerca" -> "Clear search", the `search` landmark name "Filtri e ricerca" -> "Filters and search", and the result count in the heading "(n di m)" -> "(n of m)" (`(n)` is unchanged when n = m). **Consumer tests that query these controls by their default accessible name must be updated** (e.g. `getByRole('searchbox', { name: 'Search' })`). Consumers who pass their own `filtersLabel` / `searchLabel` / `searchPlaceholder` / `clearSearchLabel` / `aria-label` / `aria-labelledby` / `labels.count` see no change. The texts of `ListReportTableStates` are not translated yet.
