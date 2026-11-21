---
'@formrail/core': patch
---

`AppLauncher` now renders a single root node, the `<nav>`: the loading status region moved inside it (still outside the
`aria-busy` placeholders, which carry `aria-busy` instead of the `<nav>`), so a `space-y-*` or `divide-y-*` parent no longer
sees an extra sibling. A launcher that is `hidden` no longer announces its loading.
