---
'@react-object-page/core': minor
---

`useListReportUrlState` accepts an `adapter` option (new exported type `ListReportUrlAdapter`: `read(): URLSearchParams`, `write(next, mode)`, `subscribe(listener)`) to keep the report's state in a client-side router instead of `window.location`/`history`. Without it the behaviour is unchanged. The core depends on no router: the List Report docs (story `UrlStateRouterRecipe`) carry the React Router recipe (covered by a unit test) and the TanStack Router one (not covered by an automated test). Passing a new adapter object re-subscribes and re-reads the state with no write and no callback; memoize the adapter to avoid it.
