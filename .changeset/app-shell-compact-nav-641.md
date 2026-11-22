---
'@formrail/core': minor
---

New `AppShellNavTrigger` (with `AppShellNavTriggerProps`) and the key `openNav` of `AppShellLabels` (default `Open
navigation`): below the breakpoint of the app shell (64rem), where the navigation column is not displayed, the button
in the header opens the same `AppShellNav` in a Sheet from the start edge (the right one in a right-to-left page),
titled with the navigation's name. The trigger is displayed only below the breakpoint, decided in CSS (nothing moves
at the first paint or at hydration; from the breakpoint up it is neither drawn nor a Tab stop), and has
`aria-haspopup="dialog"`, `aria-expanded` and, while the Sheet is open, `aria-controls`. The Sheet opens with the focus
on the link of the current page (else the first link that can be followed); Escape, the close button or the backdrop
close it and the focus goes back to the trigger.

The children of `AppShellNav` are written once and mounted in one place at a time: the column whenever the Sheet is
not on screen, the Sheet while it is (no duplicate `id`, one navigation landmark). In the Sheet a plain click or Enter
on a link closes the Sheet, gives the focus to the trigger and then calls `onNavigate` (a dirty guard opened from there
returns the focus to the trigger; a focus `onNavigate` moves to the new page stays there); a Ctrl/Cmd/Shift/Alt+click
or the middle button on a link with an `href` is left to the browser and the Sheet stays open. When the viewport
crosses the breakpoint with the Sheet open, the Sheet closes and the focus goes to the current link of the column;
crossing it the other way with the focus in the column moves the focus to the trigger. An `AppShellNav` unmounted
while the Sheet is open closes it. Several triggers in one shell share the Sheet: the focus goes back to the one it was
opened from, or to another mounted one when that one has unmounted.

The Sheet's code comes with `AppShellNavTrigger`: a shell without a trigger (an app for wide screens only) does not
ship it.
