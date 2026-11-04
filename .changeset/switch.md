---
'@react-object-page/core': minor
---

New `Switch`: a styled native `<input type="checkbox" role="switch">` with an optional inline label, wired to `Field` (id, name, description, invalid, required, disabled). In `forced`/`locked` it stays focusable but click (track, Field label, inline label) and Space change nothing; `onCheckedChange` is never called from an external `checked` change or a form reset. The state is readable without colour (thumb position, forced-colors support) and the thumb slides only under `motion-safe:`.
