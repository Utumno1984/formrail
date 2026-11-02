---
'@react-object-page/core': patch
---

`Field`: the area under the control (state reason, error, help) always reserves the height of one caption line, so an error of one line appearing or disappearing no longer pushes the fields below it down. A message that wraps (or several stacked messages) still grows the area. New prop `reserveMessageSpace` (default `true`): set it to `false` on a Field that never shows a message (the `ListReportFilterBar` search box does) so it does not take that room.
