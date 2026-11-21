---
'@formrail/core': minor
---

New `AppLauncher` (with the shared `AppDescriptor` type, `AppLauncherProps`, `AppLauncherLabels`): the choice of an app
in a product made of several apps behind one login, from a list the consumer has already filtered. A named
navigation region with a list of tiles; every tile is a real link (`<a href>`) or, without an `href`, a button, named
by the app's `label` with the `description` as its description. A plain click or Enter hands the app to
`onNavigate` (any router) and cancels the browser's navigation; Ctrl/Cmd/Shift/Alt+click and the middle button are
left to the browser. A `disabled` app keeps its place and its focus stop, loses its `href`, has `aria-disabled` and
shows its `disabledReason` (linked with `aria-describedby`). `currentAppId` marks the current app (`aria-current`).
`loading` shows placeholder tiles of the same size and columns (`loadingCount`), the empty state keeps the height of
one row, and the columns follow the width of the launcher (container query). If the focused app leaves the list,
the focus moves to the next app, the previous one or the region. Duplicate ids, empty labels and apps that open
nothing are reported in development.
