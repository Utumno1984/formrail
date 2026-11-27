---
'@formrail/core': minor
---

A Sheet always has a way out by touch (#721). `SheetContent` gets two props: `closeButton` (default `true`), which draws the sheet's own close button while no `SheetClose` is mounted in the panel, and `labels.close` (new `SheetLabels` type) to name it. Under a coarse pointer the default close buttons of a Sheet are 44 x 44 px. In development, a dismissible sheet that was open with no close button at all logs one `console.warn` when it closes, and an `AppShell` with an `AppShellNav` but no `AppShellNavTrigger` logs one a frame after the mount. Neither warning is logged in production.
