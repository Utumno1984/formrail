---
'@formrail/core': minor
---

A Sheet always has a way out by touch (#721). `SheetContent` gets two props: `closeButton` (default `true`), which draws the sheet's own close button while no `SheetClose` is mounted in the panel, and `labels.close` (new `SheetLabels` type) to name it. Under a coarse pointer the default close buttons of a Sheet are 44 x 44 px. In development, a dismissible sheet that was open with no close button at all logs one `console.warn` when it closes, and an `AppShell` with an `AppShellNav` but no `AppShellNavTrigger` logs one after a 2 s settling time, only while the viewport is below 64rem (a shell for wide screens only logs nothing). Neither warning is logged in production.

Migration: the new default changes what existing sheets show.

- If you close the sheet with your own button that is not wrapped in `SheetClose` (for example `onClick={() => setOpen(false)}`), the panel now shows two ways out. Wrap your button in `<SheetClose asChild>`, or pass `closeButton={false}` to `SheetContent` to keep only yours. Turning it off is right when the panel must be left only through a confirmation of yours; keep the default when the panel has no other visible exit, which is the case on small screens where no backdrop is left to tap.
- If you use your own header instead of `SheetHeader`, the close button sits in the top-end corner of the panel and nothing reserves room for it: leave space at the end of your header (for example `pe-16`) or mount a `SheetClose` inside it.
